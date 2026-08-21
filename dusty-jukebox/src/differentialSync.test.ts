import { describe, expect, test, vi } from "vitest";
import { planDifferentialSync } from "./differentialSync";
import type { AudioFileEntry, DriveChange } from "./drive";
import type { IndexRowScanState } from "./sheets";

function audioFile(id: string, name = `${id}.mp3`, modifiedTime = "2026-08-01T00:00:00.000Z"): NonNullable<DriveChange["file"]> {
  return { id, name, mimeType: "audio/mpeg", modifiedTime, parents: ["parent1"] };
}

function folderChange(id: string, name = "Folder"): DriveChange {
  return { fileId: id, removed: false, file: { id, name, mimeType: "application/vnd.google-apps.folder" } };
}

describe("planDifferentialSync", () => {
  test("removed=trueの変更はremovedFileIdsに入る", async () => {
    const changes: DriveChange[] = [{ fileId: "f1", removed: true }];
    const plan = await planDifferentialSync(changes, {
      isDescendantOfRoot: async () => true,
      listSubtree: async () => [],
      existingScanState: new Map(),
    });
    expect(plan.removedFileIds).toEqual(["f1"]);
    expect(plan.entriesToProcess).toEqual([]);
    expect(plan.needsReconcile).toBe(false);
  });

  test("file.trashed=trueの変更もremovedFileIdsに入る（Drive APIの仕様：ゴミ箱はremoved=falseのまま通知される）", async () => {
    const changes: DriveChange[] = [{ fileId: "f1", removed: false, file: { ...audioFile("f1"), trashed: true } }];
    const plan = await planDifferentialSync(changes, {
      isDescendantOfRoot: async () => true,
      listSubtree: async () => [],
      existingScanState: new Map(),
    });
    expect(plan.removedFileIds).toEqual(["f1"]);
  });

  test("rootFolderId配下の音楽ファイルの変更はentriesToProcessに入る", async () => {
    const changes: DriveChange[] = [{ fileId: "f1", removed: false, file: audioFile("f1") }];
    const plan = await planDifferentialSync(changes, {
      isDescendantOfRoot: async () => true,
      listSubtree: async () => [],
      existingScanState: new Map(),
    });
    expect(plan.entriesToProcess.map((e) => e.file.id)).toEqual(["f1"]);
    expect(plan.removedFileIds).toEqual([]);
  });

  test("rootFolderId配下でない音楽ファイルの変更はremovedFileIdsに入る（無関係な変更、またはルート外へ移動）", async () => {
    const changes: DriveChange[] = [{ fileId: "f1", removed: false, file: audioFile("f1") }];
    const plan = await planDifferentialSync(changes, {
      isDescendantOfRoot: async () => false,
      listSubtree: async () => [],
      existingScanState: new Map(),
    });
    expect(plan.entriesToProcess).toEqual([]);
    expect(plan.removedFileIds).toEqual(["f1"]);
  });

  test("音楽ファイル以外（拡張子非対象）の変更は無視する", async () => {
    const changes: DriveChange[] = [
      { fileId: "f1", removed: false, file: { id: "f1", name: "readme.txt", mimeType: "text/plain", parents: ["parent1"] } },
    ];
    const plan = await planDifferentialSync(changes, {
      isDescendantOfRoot: async () => true,
      listSubtree: async () => [],
      existingScanState: new Map(),
    });
    expect(plan.entriesToProcess).toEqual([]);
    expect(plan.removedFileIds).toEqual([]);
    expect(plan.needsReconcile).toBe(false);
  });

  test("フォルダの変更イベントはneedsReconcileをtrueにし、サブツリーを再走査してentriesToProcessに加える", async () => {
    const changes: DriveChange[] = [folderChange("folder1")];
    const subtreeEntry: AudioFileEntry = { file: audioFile("f-new"), folderPath: "" };
    const listSubtree = vi.fn(async (folderId: string) => (folderId === "folder1" ? [subtreeEntry] : []));
    const plan = await planDifferentialSync(changes, {
      isDescendantOfRoot: async () => true,
      listSubtree,
      existingScanState: new Map(),
    });
    expect(plan.needsReconcile).toBe(true);
    expect(plan.entriesToProcess.map((e) => e.file.id)).toEqual(["f-new"]);
    expect(listSubtree).toHaveBeenCalledWith("folder1");
  });

  test("フォルダを指すショートカットの変更もサブツリー再走査の対象になる（targetIdを使う）", async () => {
    const changes: DriveChange[] = [
      {
        fileId: "shortcut1",
        removed: false,
        file: {
          id: "shortcut1",
          name: "Shortcut",
          mimeType: "application/vnd.google-apps.shortcut",
          shortcutDetails: { targetId: "realFolder", targetMimeType: "application/vnd.google-apps.folder" },
        },
      },
    ];
    const listSubtree = vi.fn(async () => []);
    const plan = await planDifferentialSync(changes, {
      isDescendantOfRoot: async () => true,
      listSubtree,
      existingScanState: new Map(),
    });
    expect(plan.needsReconcile).toBe(true);
    expect(listSubtree).toHaveBeenCalledWith("realFolder");
  });

  test("driveModifiedTimeが既存索引と一致するファイルは再抽出をスキップする（サブツリー再走査で拾った未変更ファイル）", async () => {
    const changes: DriveChange[] = [folderChange("folder1")];
    const unchanged: AudioFileEntry = { file: audioFile("f-unchanged", "unchanged.mp3", "2026-08-01T00:00:00.000Z"), folderPath: "" };
    const changed: AudioFileEntry = { file: audioFile("f-changed", "changed.mp3", "2026-08-21T00:00:00.000Z"), folderPath: "" };
    const existingScanState = new Map<string, IndexRowScanState>([
      ["f-unchanged", { scanRunId: "", driveModifiedTime: "2026-08-01T00:00:00.000Z" }],
      ["f-changed", { scanRunId: "", driveModifiedTime: "2026-08-01T00:00:00.000Z" }], // 古い値のまま
    ]);
    const plan = await planDifferentialSync(changes, {
      isDescendantOfRoot: async () => true,
      listSubtree: async () => [unchanged, changed],
      existingScanState,
    });
    expect(plan.entriesToProcess.map((e) => e.file.id)).toEqual(["f-changed"]);
  });

  test("サブツリー再走査で見つかったファイルは、同じfileIdの他の変更イベントによるremovedFileIds登録を上書きする", async () => {
    // 順序: まずrootFolderId外への移動として検出（removedFileIdsへ）、その後フォルダ変更イベント
    // 経由のサブツリー再走査で「実は今rootFolderId配下にある」ことが判明するケース
    // （2つの変更イベントの処理順序に依存せず、最終的にrootFolderId配下にあるファイルは
    // 削除対象から除外されるべき）。
    const movedOutFile = audioFile("f1", "moved.mp3");
    const changes: DriveChange[] = [
      { fileId: "f1", removed: false, file: movedOutFile },
      folderChange("folder1"),
    ];
    const subtreeEntry: AudioFileEntry = { file: audioFile("f1", "moved.mp3"), folderPath: "" };
    const plan = await planDifferentialSync(changes, {
      isDescendantOfRoot: async () => false, // f1自身の変更イベント時点ではルート外と判定される
      listSubtree: async () => [subtreeEntry], // だが実際にはフォルダ変更後のサブツリーに存在する
      existingScanState: new Map(),
    });
    expect(plan.removedFileIds).toEqual([]);
    expect(plan.entriesToProcess.map((e) => e.file.id)).toEqual(["f1"]);
  });

  test("同一fileIdの変更が複数回来ても最後の状態を採用する", async () => {
    const changes: DriveChange[] = [
      { fileId: "f1", removed: false, file: audioFile("f1", "a.mp3", "2026-08-01T00:00:00.000Z") },
      { fileId: "f1", removed: false, file: audioFile("f1", "a.mp3", "2026-08-21T00:00:00.000Z") },
    ];
    const plan = await planDifferentialSync(changes, {
      isDescendantOfRoot: async () => true,
      listSubtree: async () => [],
      existingScanState: new Map(),
    });
    expect(plan.entriesToProcess).toHaveLength(1);
    expect(plan.entriesToProcess[0].file.modifiedTime).toBe("2026-08-21T00:00:00.000Z");
  });
});
