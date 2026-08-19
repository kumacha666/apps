import { describe, expect, test } from "vitest";
import {
  listAudioFilesRecursive,
  listFolderChildren,
  ConcurrencyLimiter,
  DriveHttpError,
  type DriveFile,
  type DriveListFn,
} from "./drive";

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
