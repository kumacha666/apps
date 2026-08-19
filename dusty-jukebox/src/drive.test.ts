import { afterEach, describe, expect, test, vi } from "vitest";
import {
  listAudioFilesRecursive,
  listFolderChildren,
  createDriveListFn,
  createDriveGetFn,
  validateRootFolder,
  ConcurrencyLimiter,
  DriveHttpError,
  type DriveFile,
  type DriveGetFn,
  type DriveListFn,
} from "./drive";
import { AuthError } from "./auth";

// フォルダID -> 直接の子（ファイル・フォルダ混在）のフェイクツリー。
// 3.1節の実データ構成（アーティスト/アルバム階層＋非楽曲ファイルの混在）を模したサンプル。
function makeFakeTree(): Record<string, DriveFile[]> {
  return {
    root: [
      { id: "wands", name: "WANDS", mimeType: "application/vnd.google-apps.folder" },
      { id: "various", name: "VARIOUS", mimeType: "application/vnd.google-apps.folder" },
      { id: "readme", name: "readme.txt", mimeType: "text/plain" },
    ],
    wands: [
      { id: "w1", name: "01 世界が終るまでは....mp3", mimeType: "audio/mpeg" },
      { id: "w-cover", name: "cover.jpg", mimeType: "image/jpeg" },
    ],
    various: [
      { id: "v1", name: "Belinda Carlisle - Heaven Is A Place On Earth.mp3", mimeType: "audio/mpeg" },
      // 3.2節: .m4aはDrive上でvideo/mp4として認識されることがある。mimeTypeではなく拡張子で拾えることを確認する
      { id: "v2", name: "Michael Giacchino - Theme.m4a", mimeType: "video/mp4" },
    ],
  };
}

function makeFakeListFn(tree: Record<string, DriveFile[]>): DriveListFn {
  return async (folderId) => ({ files: tree[folderId] ?? [] });
}

describe("listFolderChildren", () => {
  test("複数ページをnextPageTokenで結合する", async () => {
    const pages = [
      { files: [{ id: "a", name: "a.mp3", mimeType: "audio/mpeg" }], nextPageToken: "p2" },
      { files: [{ id: "b", name: "b.mp3", mimeType: "audio/mpeg" }] },
    ];
    let call = 0;
    const list: DriveListFn = async () => pages[call++];
    const children = await listFolderChildren(list, "root");
    expect(children.map((f) => f.id)).toEqual(["a", "b"]);
  });
});

describe("listAudioFilesRecursive", () => {
  test("サブフォルダを再帰的にたどり、拡張子ベースで音楽ファイルのみ抽出する", async () => {
    const list = makeFakeListFn(makeFakeTree());
    const found = await listAudioFilesRecursive(list, "root");

    expect(found.map((e) => e.file.name).sort()).toEqual(
      [
        "01 世界が終るまでは....mp3",
        "Belinda Carlisle - Heaven Is A Place On Earth.mp3",
        "Michael Giacchino - Theme.m4a",
      ].sort()
    );
    // readme.txt / cover.jpgは含まれない
    expect(found.some((e) => e.file.name === "readme.txt")).toBe(false);
    expect(found.some((e) => e.file.name === "cover.jpg")).toBe(false);
  });

  test(".m4aはmimeTypeがvideo/mp4でも拡張子ベースで音楽ファイルとして拾う", async () => {
    const list = makeFakeListFn(makeFakeTree());
    const found = await listAudioFilesRecursive(list, "various");
    const m4a = found.find((e) => e.file.id === "v2");
    expect(m4a).toBeDefined();
    expect(m4a?.file.mimeType).toBe("video/mp4");
  });

  test("folderPathをアーティスト/アルバム階層で組み立てる", async () => {
    const list = makeFakeListFn(makeFakeTree());
    const found = await listAudioFilesRecursive(list, "root");
    const wandsTrack = found.find((e) => e.file.id === "w1");
    expect(wandsTrack?.folderPath).toBe("WANDS");
  });

  test("1フォルダの取得失敗はfailedFoldersに記録し、他フォルダのスキャンは継続する", async () => {
    const tree = makeFakeTree();
    const list: DriveListFn = async (folderId) => {
      if (folderId === "various") throw new Error("503");
      return { files: tree[folderId] ?? [] };
    };
    const failedFolders: string[] = [];
    const found = await listAudioFilesRecursive(list, "root", "", failedFolders);

    expect(failedFolders).toEqual(["VARIOUS"]);
    // WANDS配下は取得できているので結果に残る
    expect(found.some((e) => e.file.id === "w1")).toBe(true);
    expect(found.some((e) => e.file.id === "v1")).toBe(false);
  });

  test("ルートフォルダ自体の取得失敗は握りつぶさず呼び出し元に例外として伝える（フォルダID誤り等を「0件」と区別する）", async () => {
    const list: DriveListFn = async () => {
      throw new Error("404 Not Found");
    };
    const failedFolders: string[] = [];
    await expect(listAudioFilesRecursive(list, "does-not-exist", "", failedFolders)).rejects.toThrow(
      "404 Not Found"
    );
    // 子フォルダの失敗とは異なり、ルート自体の失敗はfailedFoldersにも積まれない（例外がそのまま伝わるため）
    expect(failedFolders).toEqual([]);
  });

  test("深い階層で401（認証エラー）が起きた場合は子フォルダの失敗として握りつぶさず、走査全体を中断して呼び出し元に伝える", async () => {
    const tree = makeFakeTree();
    const list: DriveListFn = async (folderId) => {
      if (folderId === "various") throw new DriveHttpError(401, "invalid_token");
      return { files: tree[folderId] ?? [] };
    };
    const failedFolders: string[] = [];
    await expect(listAudioFilesRecursive(list, "root", "", failedFolders)).rejects.toBeInstanceOf(DriveHttpError);
    // 401はfailedFoldersに積んで継続する対象ではない（トークンが有効な間は再試行しても同じ結果になるため）
    expect(failedFolders).toEqual([]);
  });

  test("401以外のDriveHttpError（例: 403）はこれまで通り子フォルダの失敗として記録し継続する", async () => {
    const tree = makeFakeTree();
    const list: DriveListFn = async (folderId) => {
      if (folderId === "various") throw new DriveHttpError(403, "insufficient permissions");
      return { files: tree[folderId] ?? [] };
    };
    const failedFolders: string[] = [];
    const found = await listAudioFilesRecursive(list, "root", "", failedFolders);
    expect(failedFolders).toEqual(["VARIOUS"]);
    expect(found.some((e) => e.file.id === "w1")).toBe(true);
  });

  test("401後は同時実行数の制限キューに並んでいた他の兄弟フォルダの走査を打ち切り、無効なトークンでAPIを叩き続けない（2026-08-19 Codexレビュー指摘）", async () => {
    // maxConcurrentLists=1にして、兄弟フォルダA/B/C/D/Eが厳密に1件ずつ順番に処理される
    // ようにする。Aが401を返した後、まだ実行に入っていなかった後方のフォルダ（少なくとも
    // 最後のE）は実際のAPI呼び出しが発生しないことを確認する。
    const wide: Record<string, DriveFile[]> = {
      root: ["A", "B", "C", "D", "E"].map((id) => ({
        id,
        name: id,
        mimeType: "application/vnd.google-apps.folder",
      })),
      A: [],
      B: [],
      C: [],
      D: [],
      E: [],
    };
    const calledFolders: string[] = [];
    const list: DriveListFn = async (folderId) => {
      calledFolders.push(folderId);
      if (folderId === "A") throw new DriveHttpError(401, "invalid_token");
      return { files: wide[folderId] ?? [] };
    };

    const failedFolders: string[] = [];
    await expect(listAudioFilesRecursive(list, "root", "", failedFolders, 1)).rejects.toBeInstanceOf(DriveHttpError);

    expect(calledFolders).toContain("A");
    // ConcurrencyLimiterのキューに既に並んでいた1件程度が「巻き込まれて」実行される可能性は
    // 許容するが（協調的キャンセルであり、発行済みのHTTPリクエストまでは止められない）、
    // 最後尾のEまで律儀に実行され続けることはない
    expect(calledFolders).not.toContain("E");
    expect(calledFolders.length).toBeLessThan(5);
    // 中断によるスキップはfailedFoldersに積む対象の失敗ではない
    expect(failedFolders).toEqual([]);
  });

  test("フォルダを指すショートカットは参照先を辿って走査する（2026-08-19 Codexレビュー指摘）", async () => {
    const tree: Record<string, DriveFile[]> = {
      root: [
        {
          id: "shortcut-to-wands",
          name: "WANDS (shortcut)",
          mimeType: "application/vnd.google-apps.shortcut",
          shortcutDetails: { targetId: "wands", targetMimeType: "application/vnd.google-apps.folder" },
        },
      ],
      wands: [{ id: "w1", name: "01.mp3", mimeType: "audio/mpeg" }],
    };
    const list: DriveListFn = async (folderId) => ({ files: tree[folderId] ?? [] });
    const found = await listAudioFilesRecursive(list, "root");
    expect(found.map((e) => e.file.id)).toEqual(["w1"]);
    expect(found[0].folderPath).toBe("WANDS (shortcut)");
  });

  test("ファイルを指すショートカットは走査対象に含めない（フォルダショートカットのみ解決する）", async () => {
    const tree: Record<string, DriveFile[]> = {
      root: [
        {
          id: "shortcut-to-file",
          name: "shortcut-to-file",
          mimeType: "application/vnd.google-apps.shortcut",
          shortcutDetails: { targetId: "some-file", targetMimeType: "audio/mpeg" },
        },
      ],
    };
    const list: DriveListFn = async (folderId) => ({ files: tree[folderId] ?? [] });
    const found = await listAudioFilesRecursive(list, "root");
    expect(found).toEqual([]);
  });

  test("ショートカットが祖先フォルダを指す循環参照でも無限再帰にならない", async () => {
    const tree: Record<string, DriveFile[]> = {
      root: [
        { id: "child", name: "child", mimeType: "application/vnd.google-apps.folder" },
      ],
      child: [
        {
          id: "shortcut-to-root",
          name: "back-to-root",
          mimeType: "application/vnd.google-apps.shortcut",
          shortcutDetails: { targetId: "root", targetMimeType: "application/vnd.google-apps.folder" },
        },
        { id: "song", name: "song.mp3", mimeType: "audio/mpeg" },
      ],
    };
    const list: DriveListFn = async (folderId) => ({ files: tree[folderId] ?? [] });
    const found = await listAudioFilesRecursive(list, "root");
    expect(found.map((e) => e.file.id)).toEqual(["song"]);
  });

  test("フォルダショートカットのtargetResourceKeyを参照先フォルダへの以降のリクエストに引き継ぐ（2026-08-19 Codexレビュー指摘: リンク共有のセキュリティ更新が適用された参照先はresource keyが無いと解決できない）", async () => {
    const tree: Record<string, DriveFile[]> = {
      root: [
        {
          id: "shortcut-to-protected",
          name: "Protected (shortcut)",
          mimeType: "application/vnd.google-apps.shortcut",
          shortcutDetails: {
            targetId: "protected-folder",
            targetMimeType: "application/vnd.google-apps.folder",
            targetResourceKey: "abc123",
          },
        },
      ],
      "protected-folder": [{ id: "song", name: "song.mp3", mimeType: "audio/mpeg" }],
    };
    const receivedResourceKeys: (string | undefined)[] = [];
    const list: DriveListFn = async (folderId, _pageToken, resourceKey) => {
      receivedResourceKeys.push(resourceKey);
      return { files: tree[folderId] ?? [] };
    };
    const found = await listAudioFilesRecursive(list, "root");
    expect(found.map((e) => e.file.id)).toEqual(["song"]);
    // ルートへのリクエストにはresourceKeyは付かず、ショートカット参照先へのリクエストにのみ付く
    expect(receivedResourceKeys).toEqual([undefined, "abc123"]);
  });

  test("ensureAccessToken()のサイレント再取得失敗（AuthError）も401と同様に走査全体を中断する（2026-08-19 Codexレビュー指摘）", async () => {
    const tree = makeFakeTree();
    const list: DriveListFn = async (folderId) => {
      if (folderId === "various") throw new AuthError("再ログインが必要です");
      return { files: tree[folderId] ?? [] };
    };
    const failedFolders: string[] = [];
    await expect(listAudioFilesRecursive(list, "root", "", failedFolders)).rejects.toBeInstanceOf(AuthError);
    expect(failedFolders).toEqual([]);
  });
});

describe("ConcurrencyLimiter", () => {
  test("同時実行数がmaxを超えない", async () => {
    const limiter = new ConcurrencyLimiter(2);
    let active = 0;
    let peak = 0;

    const task = () =>
      limiter.run(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
      });

    await Promise.all([task(), task(), task(), task(), task()]);
    expect(peak).toBeLessThanOrEqual(2);
  });

  test("全タスクが実行される（キューイングで取りこぼさない）", async () => {
    const limiter = new ConcurrencyLimiter(2);
    const results: number[] = [];
    await Promise.all(
      [1, 2, 3, 4, 5].map((n) =>
        limiter.run(async () => {
          results.push(n);
        })
      )
    );
    expect(results.sort()).toEqual([1, 2, 3, 4, 5]);
  });
});

function fakeResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response;
}

describe("createDriveListFn", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  test("resourceKeyが指定された場合はX-Goog-Drive-Resource-Keysヘッダーを付与する（2026-08-19 Codexレビュー指摘）", async () => {
    const response = fakeResponse(200, { files: [] });
    const fetchMock = vi.fn(async () => response);
    vi.stubGlobal("fetch", fetchMock);

    const list = createDriveListFn(async () => "token");
    await list("folder-id", undefined, "the-resource-key");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Goog-Drive-Resource-Keys"]).toBe("folder-id/the-resource-key");
  });

  test("resourceKey未指定の場合はヘッダーを付与しない", async () => {
    const response = fakeResponse(200, { files: [] });
    const fetchMock = vi.fn(async () => response);
    vi.stubGlobal("fetch", fetchMock);

    const list = createDriveListFn(async () => "token");
    await list("folder-id", undefined);

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Goog-Drive-Resource-Keys"]).toBeUndefined();
  });

  test("429は指数バックオフでリトライし、最終的に成功する", async () => {
    vi.useFakeTimers();
    const responses = [
      fakeResponse(429, { error: { errors: [{ reason: "rateLimitExceeded" }] } }),
      fakeResponse(200, { files: [{ id: "a", name: "a.mp3", mimeType: "audio/mpeg" }] }),
    ];
    let call = 0;
    vi.stubGlobal("fetch", vi.fn(async () => responses[call++]));

    const list = createDriveListFn(async () => "token");
    const promise = list("folder", undefined);
    await vi.runAllTimersAsync();
    const page = await promise;
    expect(page.files.map((f) => f.id)).toEqual(["a"]);
  });

  test("fetch()自体が例外を投げる一時的な通信断もリトライし、最終的に成功する（2026-08-19 Codexレビュー指摘）", async () => {
    vi.useFakeTimers();
    let call = 0;
    const fetchMock = vi.fn(async () => {
      call += 1;
      if (call === 1) throw new TypeError("Failed to fetch");
      return fakeResponse(200, { files: [{ id: "a", name: "a.mp3", mimeType: "audio/mpeg" }] });
    });
    vi.stubGlobal("fetch", fetchMock);

    const list = createDriveListFn(async () => "token");
    const promise = list("folder", undefined);
    await vi.runAllTimersAsync();
    const page = await promise;
    expect(page.files.map((f) => f.id)).toEqual(["a"]);
  });

  test("fetch()の通信断がリトライ上限まで続いた場合は最後の例外をそのまま投げる", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    vi.stubGlobal("fetch", fetchMock);

    const list = createDriveListFn(async () => "token");
    const promise = list("folder", undefined);
    promise.catch(() => {}); // unhandled rejection警告を避ける（下のexpectで実際にawaitして検証する）
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toBeInstanceOf(TypeError);
  });

  test("reasonがrateLimitExceeded/userRateLimitExceededの403もリトライする（2026-08-19 Codexレビュー指摘）", async () => {
    vi.useFakeTimers();
    const responses = [
      fakeResponse(403, { error: { errors: [{ reason: "userRateLimitExceeded" }] } }),
      fakeResponse(200, { files: [] }),
    ];
    let call = 0;
    vi.stubGlobal("fetch", vi.fn(async () => responses[call++]));

    const list = createDriveListFn(async () => "token");
    const promise = list("folder", undefined);
    await vi.runAllTimersAsync();
    const page = await promise;
    expect(page.files).toEqual([]);
  });

  test("権限無し等の恒久的な403（rateLimitExceeded系ではない）はリトライせず即座にDriveHttpErrorを投げる", async () => {
    const response = fakeResponse(403, { error: { errors: [{ reason: "insufficientPermissions" }] } });
    const fetchMock = vi.fn(async () => response);
    vi.stubGlobal("fetch", fetchMock);

    const list = createDriveListFn(async () => "token");
    await expect(list("folder", undefined)).rejects.toMatchObject({ status: 403 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("401はリトライせず即座にDriveHttpErrorを投げる", async () => {
    const response = fakeResponse(401, { error: { errors: [{ reason: "authError" }] } });
    const fetchMock = vi.fn(async () => response);
    vi.stubGlobal("fetch", fetchMock);

    const list = createDriveListFn(async () => "token");
    await expect(list("folder", undefined)).rejects.toBeInstanceOf(DriveHttpError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("validateRootFolder", () => {
  test("フォルダとして取得できれば何もしない（例外を投げない）", async () => {
    const getFile: DriveGetFn = async () => ({ mimeType: "application/vnd.google-apps.folder" });
    await expect(validateRootFolder(getFile, "some-folder-id")).resolves.toBeUndefined();
  });

  test("フォルダ以外（例: 通常ファイル）の場合はエラーを投げる", async () => {
    const getFile: DriveGetFn = async () => ({ mimeType: "audio/mpeg" });
    await expect(validateRootFolder(getFile, "some-file-id")).rejects.toThrow(/フォルダではありません/);
  });

  test("存在しない・権限が無いフォルダIDの場合はgetFileの例外（DriveHttpError）がそのまま伝わる（2026-08-19 Codexレビュー指摘: files.listは空一覧を返すだけでルート自体を検証しない）", async () => {
    const getFile: DriveGetFn = async () => {
      throw new DriveHttpError(404, "File not found");
    };
    await expect(validateRootFolder(getFile, "does-not-exist")).rejects.toBeInstanceOf(DriveHttpError);
  });
});

describe("createDriveGetFn", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("成功時はmimeTypeを返す", async () => {
    const response = fakeResponse(200, { id: "abc", mimeType: "application/vnd.google-apps.folder" });
    vi.stubGlobal("fetch", vi.fn(async () => response));

    const getFile = createDriveGetFn(async () => "token");
    await expect(getFile("abc")).resolves.toEqual({ mimeType: "application/vnd.google-apps.folder" });
  });

  test("404はDriveHttpErrorとして即座に投げる", async () => {
    const response = fakeResponse(404, { error: { errors: [{ reason: "notFound" }] } });
    const fetchMock = vi.fn(async () => response);
    vi.stubGlobal("fetch", fetchMock);

    const getFile = createDriveGetFn(async () => "token");
    await expect(getFile("does-not-exist")).rejects.toMatchObject({ status: 404 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
