import { afterEach, describe, expect, test, vi } from "vitest";
import {
  listAudioFilesRecursive,
  listFolderChildren,
  createDriveListFn,
  createDriveGetFn,
  createDriveCapabilitiesGetFn,
  createGetStartPageTokenFn,
  createChangesListFn,
  consumeAllChanges,
  createDriveParentsGetFn,
  isDescendantOfRoot,
  createDriveFetchRange,
  validateRootFolder,
  ConcurrencyLimiter,
  DriveHttpError,
  type ChangesListFn,
  type DriveChange,
  type DriveFile,
  type DriveGetFn,
  type DriveListFn,
  type DriveParentsGetFn,
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

  test("フォルダを指すショートカットの参照先フォルダIDをshortcutTargetFolderIds出力引数に集める（2026-08-21 Codexレビュー指摘：P1、差分同期・リコンサイルの祖先チェーン確認に補うため）", async () => {
    const tree: Record<string, DriveFile[]> = {
      root: [
        {
          id: "shortcut-to-wands",
          name: "WANDS (shortcut)",
          mimeType: "application/vnd.google-apps.shortcut",
          shortcutDetails: { targetId: "wands", targetMimeType: "application/vnd.google-apps.folder" },
        },
        { id: "various", name: "VARIOUS", mimeType: "application/vnd.google-apps.folder" },
      ],
      wands: [{ id: "w1", name: "01.mp3", mimeType: "audio/mpeg" }],
      various: [{ id: "v1", name: "02.mp3", mimeType: "audio/mpeg" }],
    };
    const list: DriveListFn = async (folderId) => ({ files: tree[folderId] ?? [] });
    const shortcutTargetFolderIds = new Set<string>();
    await listAudioFilesRecursive(list, "root", "", [], undefined, shortcutTargetFolderIds);
    // 通常のフォルダ（various）はショートカットではないため含まれない
    expect([...shortcutTargetFolderIds]).toEqual(["wands"]);
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
  test("フォルダとして取得できれば何もしない（例外を投げない）。マイドライブ配下ならdriveIdは無い", async () => {
    const getFile: DriveGetFn = async () => ({ mimeType: "application/vnd.google-apps.folder" });
    await expect(validateRootFolder(getFile, "some-folder-id")).resolves.toEqual({ driveId: undefined });
  });

  test("共有ドライブ配下の場合はdriveIdを返す（2026-08-20 Codexレビュー指摘：changes.getStartPageTokenのスコープ指定に必要）", async () => {
    const getFile: DriveGetFn = async () => ({ mimeType: "application/vnd.google-apps.folder", driveId: "shared-drive-1" });
    await expect(validateRootFolder(getFile, "some-folder-id")).resolves.toEqual({ driveId: "shared-drive-1" });
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

  test("共有ドライブ配下の場合はdriveIdも返す。fieldsパラメータにdriveIdを含める（2026-08-20 Codexレビュー指摘）", async () => {
    const response = fakeResponse(200, { id: "abc", mimeType: "application/vnd.google-apps.folder", driveId: "shared-drive-1" });
    const fetchMock = vi.fn(async () => response);
    vi.stubGlobal("fetch", fetchMock);

    const getFile = createDriveGetFn(async () => "token");
    await expect(getFile("abc")).resolves.toEqual({ mimeType: "application/vnd.google-apps.folder", driveId: "shared-drive-1" });
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(decodeURIComponent(url)).toContain("fields=id,mimeType,driveId");
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

describe("createDriveCapabilitiesGetFn", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("canEdit=trueの場合はtrueを返す（2026-08-20 Codexレビュー指摘: タグ抽出前の書き込み権限事前検証用）", async () => {
    const response = fakeResponse(200, { capabilities: { canEdit: true } });
    const fetchMock = vi.fn(async () => response);
    vi.stubGlobal("fetch", fetchMock);

    const getCapabilities = createDriveCapabilitiesGetFn(async () => "token");
    await expect(getCapabilities("sheet-1")).resolves.toEqual({ canEdit: true });
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(decodeURIComponent(url)).toContain("capabilities(canEdit)");
  });

  test("閲覧専用で共有されている場合（canEdit=false）はfalseを返す", async () => {
    const response = fakeResponse(200, { capabilities: { canEdit: false } });
    vi.stubGlobal("fetch", vi.fn(async () => response));

    const getCapabilities = createDriveCapabilitiesGetFn(async () => "token");
    await expect(getCapabilities("sheet-1")).resolves.toEqual({ canEdit: false });
  });

  test("capabilitiesフィールド自体が欠けている場合は安全側のfalseを返す", async () => {
    const response = fakeResponse(200, {});
    vi.stubGlobal("fetch", vi.fn(async () => response));

    const getCapabilities = createDriveCapabilitiesGetFn(async () => "token");
    await expect(getCapabilities("sheet-1")).resolves.toEqual({ canEdit: false });
  });
});

describe("createGetStartPageTokenFn", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("startPageTokenを返す（CONCEPT.md 5節: 初回スキャン開始前に取得・永続化する）", async () => {
    const response = fakeResponse(200, { startPageToken: "T0" });
    const fetchMock = vi.fn(async () => response);
    vi.stubGlobal("fetch", fetchMock);

    const getStartPageToken = createGetStartPageTokenFn(async () => "token");
    await expect(getStartPageToken()).resolves.toBe("T0");
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toContain("changes/startPageToken");
  });

  test("応答にstartPageTokenが含まれない場合はエラーを投げる", async () => {
    const response = fakeResponse(200, {});
    vi.stubGlobal("fetch", vi.fn(async () => response));

    const getStartPageToken = createGetStartPageTokenFn(async () => "token");
    await expect(getStartPageToken()).rejects.toThrow(/startPageToken/);
  });

  test("driveIdを渡すとリクエストパラメータに含める（2026-08-20 Codexレビュー指摘：共有ドライブ配下のルートではsupportsAllDrivesだけでは対象の変更ログをスコープできない）", async () => {
    const response = fakeResponse(200, { startPageToken: "T0" });
    const fetchMock = vi.fn(async () => response);
    vi.stubGlobal("fetch", fetchMock);

    const getStartPageToken = createGetStartPageTokenFn(async () => "token", "shared-drive-1");
    await getStartPageToken();
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toContain("driveId=shared-drive-1");
  });

  test("driveId未指定の場合はdriveIdパラメータを付けない（マイドライブ配下）", async () => {
    const response = fakeResponse(200, { startPageToken: "T0" });
    const fetchMock = vi.fn(async () => response);
    vi.stubGlobal("fetch", fetchMock);

    const getStartPageToken = createGetStartPageTokenFn(async () => "token");
    await getStartPageToken();
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).not.toContain("driveId");
  });
});

describe("createChangesListFn", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("pageTokenをクエリに含め、changes/nextPageToken/newStartPageTokenを返す", async () => {
    const body = {
      changes: [{ fileId: "f1", removed: false, file: { id: "f1", name: "a.mp3", mimeType: "audio/mpeg" } }],
      nextPageToken: "p2",
    };
    const fetchMock = vi.fn(async () => fakeResponse(200, body));
    vi.stubGlobal("fetch", fetchMock);

    const listChanges = createChangesListFn(async () => "token");
    const page = await listChanges("T0");
    expect(page.changes).toEqual(body.changes);
    expect(page.nextPageToken).toBe("p2");
    expect(page.newStartPageToken).toBeUndefined();
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toContain("pageToken=T0");
    expect(url).toContain("/drive/v3/changes?");
  });

  test("driveIdを渡すとリクエストパラメータに含める（共有ドライブ配下の変更ログをスコープするため）", async () => {
    const fetchMock = vi.fn(async () => fakeResponse(200, { changes: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const listChanges = createChangesListFn(async () => "token", "shared-drive-1");
    await listChanges("T0");
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toContain("driveId=shared-drive-1");
  });
});

describe("consumeAllChanges", () => {
  test("nextPageTokenが無くなるまで全ページを結合し、最終ページのnewStartPageTokenを返す", async () => {
    const pages: Record<string, { changes: DriveChange[]; nextPageToken?: string; newStartPageToken?: string }> = {
      T0: { changes: [{ fileId: "a", removed: false }], nextPageToken: "p2" },
      p2: { changes: [{ fileId: "b", removed: true }], newStartPageToken: "T1" },
    };
    const listChanges: ChangesListFn = async (pageToken) => pages[pageToken];

    const result = await consumeAllChanges(listChanges, "T0");
    expect(result.changes.map((c) => c.fileId)).toEqual(["a", "b"]);
    expect(result.newStartPageToken).toBe("T1");
  });

  test("最終ページにnewStartPageTokenが含まれない場合はエラーを投げる", async () => {
    const listChanges: ChangesListFn = async () => ({ changes: [] });
    await expect(consumeAllChanges(listChanges, "T0")).rejects.toThrow(/newStartPageToken/);
  });
});

describe("createDriveParentsGetFn", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("parentsを返す", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse(200, { parents: ["p1"] })));
    const getParents = createDriveParentsGetFn(async () => "token");
    await expect(getParents("f1")).resolves.toEqual({ parents: ["p1"] });
  });

  test("404はnullを返す（対象自体が削除済み等）", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse(404, { error: "not found" })));
    const getParents = createDriveParentsGetFn(async () => "token");
    await expect(getParents("f1")).resolves.toBeNull();
  });

  test("404以外のエラーはそのまま投げる", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse(500, { error: "server error" })));
    const getParents = createDriveParentsGetFn(async () => "token");
    await expect(getParents("f1")).rejects.toThrow(DriveHttpError);
  });
});

describe("isDescendantOfRoot", () => {
  // フォルダID -> 直接の親IDのフェイクツリー（folder1 -> parentA -> root、folder2は無関係な木）
  function makeGetParents(tree: Record<string, string[] | undefined>): DriveParentsGetFn {
    return async (id) => (id in tree ? { parents: tree[id] } : null);
  }

  test("直接の親がrootFolderIdの場合はtrue", async () => {
    const getParents = makeGetParents({});
    await expect(isDescendantOfRoot(getParents, ["root"], "root")).resolves.toBe(true);
  });

  test("祖先チェーンを遡ってrootFolderIdに到達すればtrue", async () => {
    const getParents = makeGetParents({ parentA: ["root"], parentB: ["parentA"] });
    await expect(isDescendantOfRoot(getParents, ["parentB"], "root")).resolves.toBe(true);
  });

  test("rootFolderIdに到達しない場合はfalse", async () => {
    const getParents = makeGetParents({ unrelated: ["otherRoot"], otherRoot: undefined });
    await expect(isDescendantOfRoot(getParents, ["unrelated"], "root")).resolves.toBe(false);
  });

  test("循環参照があっても無限ループせずfalseを返す", async () => {
    const getParents = makeGetParents({ a: ["b"], b: ["a"] });
    await expect(isDescendantOfRoot(getParents, ["a"], "root")).resolves.toBe(false);
  });

  test("複数の直接の親のいずれかがrootに到達すればtrue", async () => {
    const getParents = makeGetParents({ p1: ["otherRoot"], otherRoot: undefined, p2: ["root"] });
    await expect(isDescendantOfRoot(getParents, ["p1", "p2"], "root")).resolves.toBe(true);
  });

  test("cacheを渡すと同じフォルダIDへの重複した祖先チェーン確認を避ける", async () => {
    const getParentsSpy = vi.fn(async (id: string) => (id === "shared" ? { parents: ["root"] } : null));
    const cache = new Map<string, boolean>();
    await isDescendantOfRoot(getParentsSpy, ["shared"], "root", cache);
    await isDescendantOfRoot(getParentsSpy, ["shared"], "root", cache);
    expect(getParentsSpy).toHaveBeenCalledTimes(1);
  });

  test("extraRootIdsに含まれるフォルダIDはrootFolderId自体と同格の到達済みとして扱う（フォルダショートカットの参照先、2026-08-21 Codexレビュー指摘：P1）", async () => {
    // ショートカット参照先フォルダ（physicalTarget）は、実体としての親チェーンをどれだけ
    // 遡ってもrootFolderIdには到達しない（getParentsは呼ばれれば「無関係な祖先」を返す）。
    // extraRootIdsに直接登録されている場合のみ到達済みと判定できることを確認する。
    const getParents = makeGetParents({ physicalTarget: ["somewhereElseEntirely"], somewhereElseEntirely: undefined });
    await expect(isDescendantOfRoot(getParents, ["physicalTarget"], "root")).resolves.toBe(false);
    await expect(isDescendantOfRoot(getParents, ["physicalTarget"], "root", new Map(), new Set(["physicalTarget"]))).resolves.toBe(true);
  });

  test("extraRootIdsはフォルダID自体だけでなく、その配下の祖先チェーンの途中に現れても到達済みと判定する", async () => {
    const getParents = makeGetParents({ childOfShortcutTarget: ["physicalTarget"] });
    await expect(
      isDescendantOfRoot(getParents, ["childOfShortcutTarget"], "root", new Map(), new Set(["physicalTarget"]))
    ).resolves.toBe(true);
  });
});

function fakeBinaryResponse(status: number, bytes: Uint8Array): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => "",
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  } as unknown as Response;
}

describe("createDriveFetchRange", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  test("Rangeヘッダーを指定してalt=mediaで取得し、Uint8Arrayを返す", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const fetchMock = vi.fn(async () => fakeBinaryResponse(206, bytes));
    vi.stubGlobal("fetch", fetchMock);

    const fetchRange = createDriveFetchRange("file-1", async () => "token");
    const result = await fetchRange(10, 13);

    expect(result).toEqual(bytes);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("alt=media");
    expect(url).toContain(encodeURIComponent("file-1"));
    expect((init.headers as Record<string, string>)["Range"]).toBe("bytes=10-13");
  });

  test("resourceKeyが指定された場合はX-Goog-Drive-Resource-Keysヘッダーを付与する", async () => {
    const fetchMock = vi.fn(async () => fakeBinaryResponse(206, new Uint8Array(0)));
    vi.stubGlobal("fetch", fetchMock);

    const fetchRange = createDriveFetchRange("file-1", async () => "token", { resourceKey: "rk-1" });
    await fetchRange(0, 0);

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)["X-Goog-Drive-Resource-Keys"]).toBe("file-1/rk-1");
  });

  test("429は指数バックオフでリトライし、最終的に成功する", async () => {
    vi.useFakeTimers();
    const bytes = new Uint8Array([9, 9]);
    const responses = [fakeResponse(429, { error: { errors: [{ reason: "rateLimitExceeded" }] } }), fakeBinaryResponse(206, bytes)];
    let call = 0;
    vi.stubGlobal("fetch", vi.fn(async () => responses[call++]));

    const fetchRange = createDriveFetchRange("file-1", async () => "token");
    const promise = fetchRange(0, 1);
    await vi.runAllTimersAsync();
    expect(await promise).toEqual(bytes);
  });

  test("signalが渡されタイムアウト等でabortされた場合はAbortErrorをリトライせずそのまま伝える（タグ抽出タイムアウトとの結線用）", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn(async () => {
      controller.abort();
      const err = new Error("The operation was aborted");
      err.name = "AbortError";
      throw err;
    });
    vi.stubGlobal("fetch", fetchMock);

    const fetchRange = createDriveFetchRange("file-1", async () => "token", { signal: controller.signal });
    await expect(fetchRange(0, 1)).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledTimes(1); // リトライしていないことを確認
  });

  test("本文（arrayBuffer）読み取り中の通信断はリクエスト自体をやり直してリトライする（2026-08-20 Codexレビュー指摘: fetch()自体は成功済みのためfetchDriveApiWithRetryのリトライだけではカバーされない）", async () => {
    vi.useFakeTimers();
    const bytes = new Uint8Array([5, 6, 7]);
    let call = 0;
    const fetchMock = vi.fn(async () => {
      call += 1;
      if (call === 1) {
        // ヘッダー受信（fetch自体）は成功するが、本文ダウンロード中に接続が切れたケースを模す
        return {
          ok: true,
          status: 206,
          text: async () => "",
          arrayBuffer: async () => {
            throw new TypeError("Failed to fetch");
          },
        } as unknown as Response;
      }
      return fakeBinaryResponse(206, bytes);
    });
    vi.stubGlobal("fetch", fetchMock);

    const fetchRange = createDriveFetchRange("file-1", async () => "token");
    const promise = fetchRange(0, 2);
    await vi.runAllTimersAsync();
    expect(await promise).toEqual(bytes);
    expect(fetchMock).toHaveBeenCalledTimes(2); // fetch自体をもう一度やり直している
  });

  test("本文読み取りのリトライがすべて失敗した場合は最後の例外を投げる", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 206,
      text: async () => "",
      arrayBuffer: async () => {
        throw new TypeError("Failed to fetch");
      },
    })) as unknown as () => Promise<Response>;
    vi.stubGlobal("fetch", fetchMock);

    const fetchRange = createDriveFetchRange("file-1", async () => "token");
    const promise = fetchRange(0, 2);
    promise.catch(() => {});
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toBeInstanceOf(TypeError);
  });
});
