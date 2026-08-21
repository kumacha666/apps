import { describe, expect, test, vi } from "vitest";
import { applyShortcutChangesToExtraRootFolderIds, planDifferentialSync } from "./differentialSync";
import type { AudioFileEntry, DriveChange } from "./drive";
import type { IndexRowScanState } from "./sheets";

function audioFile(id: string, name = `${id}.mp3`, modifiedTime = "2026-08-01T00:00:00.000Z"): NonNullable<DriveChange["file"]> {
  return { id, name, mimeType: "audio/mpeg", modifiedTime, parents: ["parent1"] };
}

function folderChange(id: string, name = "Folder"): DriveChange {
  return { fileId: id, removed: false, file: { id, name, mimeType: "application/vnd.google-apps.folder" } };
}

describe("planDifferentialSync", () => {
  test("removed=trueの変更はremovedFileIdsに入る（種別不明のためneedsReconcileも立つ、下記の専用テスト参照）", async () => {
    const changes: DriveChange[] = [{ fileId: "f1", removed: true }];
    const plan = await planDifferentialSync(changes, {
      isDescendantOfRoot: async () => true,
      listSubtree: async () => [],
      existingScanState: new Map(),
    });
    expect(plan.removedFileIds).toEqual(["f1"]);
    expect(plan.entriesToProcess).toEqual([]);
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

  test("音楽ファイル以外（拡張子非対象）へリネームされた既存曲は索引から削除する（2026-08-21 Codexレビュー指摘：P1）", async () => {
    const changes: DriveChange[] = [
      { fileId: "f1", removed: false, file: { id: "f1", name: "readme.txt", mimeType: "text/plain", parents: ["parent1"] } },
    ];
    const plan = await planDifferentialSync(changes, {
      isDescendantOfRoot: async () => true,
      listSubtree: async () => [],
      existingScanState: new Map(),
    });
    expect(plan.entriesToProcess).toEqual([]);
    expect(plan.removedFileIds).toEqual(["f1"]);
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
    expect(listSubtree).toHaveBeenCalledWith("folder1", undefined);
  });

  test("フォルダを指すショートカットの変更もサブツリー再走査の対象になる（targetId・targetResourceKeyを使う）", async () => {
    const changes: DriveChange[] = [
      {
        fileId: "shortcut1",
        removed: false,
        file: {
          id: "shortcut1",
          name: "Shortcut",
          mimeType: "application/vnd.google-apps.shortcut",
          shortcutDetails: {
            targetId: "realFolder",
            targetMimeType: "application/vnd.google-apps.folder",
            targetResourceKey: "rk-123",
          },
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
    // リンク共有のセキュリティ更新が適用されたショートカット参照先は、targetResourceKeyを
    // 引き継がないとfiles.listが404になる（2026-08-21 Codexレビュー指摘：P2）。
    expect(listSubtree).toHaveBeenCalledWith("realFolder", "rk-123");
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

  test("フォルダ変更イベントの後にサブツリー再走査で見つかったファイルは、その前に来た同じfileIdの削除判定を上書きする（イベント順で後勝ち）", async () => {
    // 順序: まずrootFolderId外への移動として検出（削除判定）、その後フォルダ変更イベント
    // 経由のサブツリー再走査で「実は今rootFolderId配下にある」ことが判明するケース。
    // フォルダ自身の containment チェックは true（folder1はroot配下）、ファイル自身の直接の
    // containment チェックは false（f1自身の変更イベント時点ではルート外と判定される）を
    // 使い分けることで、後続のフォルダ変更イベントが先の判定を正しく上書きすることを確認する。
    const movedOutFile = audioFile("f1", "moved.mp3");
    const changes: DriveChange[] = [
      { fileId: "f1", removed: false, file: movedOutFile },
      folderChange("folder1"),
    ];
    const subtreeEntry: AudioFileEntry = { file: audioFile("f1", "moved.mp3"), folderPath: "" };
    const plan = await planDifferentialSync(changes, {
      isDescendantOfRoot: async (parentIds) => (parentIds?.includes("parent1") ? false : true),
      listSubtree: async () => [subtreeEntry],
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

  test("同一区間で更新の後に削除された場合は削除が勝つ（2026-08-21 Codexレビュー指摘：P1、イベント順序依存バグ）", async () => {
    const changes: DriveChange[] = [
      { fileId: "f1", removed: false, file: audioFile("f1", "a.mp3", "2026-08-01T00:00:00.000Z") },
      { fileId: "f1", removed: true },
    ];
    const plan = await planDifferentialSync(changes, {
      isDescendantOfRoot: async () => true,
      listSubtree: async () => [],
      existingScanState: new Map(),
    });
    expect(plan.entriesToProcess).toEqual([]);
    expect(plan.removedFileIds).toEqual(["f1"]);
  });

  test("removed=trueでfile情報が無い（種別不明の削除）場合はneedsReconcileを立てる（フォルダかもしれないため安全側、2026-08-21 Codexレビュー指摘：P1）", async () => {
    const changes: DriveChange[] = [{ fileId: "unknown1", removed: true }];
    const plan = await planDifferentialSync(changes, {
      isDescendantOfRoot: async () => true,
      listSubtree: async () => [],
      existingScanState: new Map(),
    });
    expect(plan.needsReconcile).toBe(true);
    expect(plan.removedFileIds).toEqual(["unknown1"]);
  });

  test("フォルダがゴミ箱へ移動された場合（file.trashed=true）もneedsReconcileを立てる（2026-08-21 Codexレビュー指摘：P1）", async () => {
    const changes: DriveChange[] = [
      { fileId: "folder1", removed: false, file: { id: "folder1", name: "Folder", mimeType: "application/vnd.google-apps.folder", trashed: true } },
    ];
    const plan = await planDifferentialSync(changes, {
      isDescendantOfRoot: async () => true,
      listSubtree: async () => [],
      existingScanState: new Map(),
    });
    expect(plan.needsReconcile).toBe(true);
  });

  test("フォルダの変更イベントでも、現在rootFolderId配下でなければサブツリーを再走査しない（無関係な別ライブラリの変更、2026-08-21 Codexレビュー指摘：P2）。needsReconcileは立てたままにする", async () => {
    const changes: DriveChange[] = [folderChange("unrelatedFolder")];
    const listSubtree = vi.fn(async () => []);
    const plan = await planDifferentialSync(changes, {
      isDescendantOfRoot: async () => false,
      listSubtree,
      existingScanState: new Map(),
    });
    expect(listSubtree).not.toHaveBeenCalled();
    expect(plan.needsReconcile).toBe(true);
    expect(plan.entriesToProcess).toEqual([]);
  });

  test("直接の音楽ファイル変更イベントは、driveModifiedTimeが既存索引と同じでも常に処理する（純粋な移動でmodifiedTimeが変わらないケースでもparentIdを更新するため、2026-08-21 Codexレビュー指摘：P1）", async () => {
    const changed = audioFile("f1", "a.mp3", "2026-08-01T00:00:00.000Z");
    const changes: DriveChange[] = [{ fileId: "f1", removed: false, file: changed }];
    const existingScanState = new Map<string, IndexRowScanState>([
      ["f1", { scanRunId: "", driveModifiedTime: "2026-08-01T00:00:00.000Z" }], // 一致しているが移動された想定
    ]);
    const plan = await planDifferentialSync(changes, {
      isDescendantOfRoot: async () => true,
      listSubtree: async () => [],
      existingScanState,
    });
    expect(plan.entriesToProcess.map((e) => e.file.id)).toEqual(["f1"]);
  });

  test("同一fileIdのフォルダ変更が「更新」の後に「完全削除」で来た場合、削除後の状態のみを処理し、既に消えたフォルダへ再帰走査を行わない（2026-08-21 Codexレビュー指摘：P1。以前は更新イベント処理時点でlistSubtreeを呼んでしまい、404等の例外で後続の削除イベントへ到達できず、changes.list全体の処理が失敗し続けていた）", async () => {
    const changes: DriveChange[] = [folderChange("folder1"), { fileId: "folder1", removed: true }];
    const listSubtree = vi.fn(async () => {
      throw new Error("既に存在しないフォルダへのfiles.listは404になるはず（呼ばれてはならない）");
    });
    const plan = await planDifferentialSync(changes, {
      isDescendantOfRoot: async () => true,
      listSubtree,
      existingScanState: new Map(),
    });
    expect(listSubtree).not.toHaveBeenCalled();
    expect(plan.needsReconcile).toBe(true);
    expect(plan.removedFileIds).toEqual(["folder1"]);
  });

  test("サブツリー再走査で見つかったファイルは、同じfileIdの直接変更イベントが既に指定したskipIfUnchanged=falseを弱めない（2026-08-21 Codexレビュー指摘：P1）", async () => {
    // f1自身の直接の変更イベント（常に処理、skipIfUnchanged=false）の後に、
    // 同じf1を含む別フォルダのサブツリー再走査結果（skipIfUnchanged=trueが既定）が来ても、
    // f1は既存索引と同じdriveModifiedTimeを理由にスキップされてはならない。
    const changes: DriveChange[] = [
      { fileId: "f1", removed: false, file: audioFile("f1", "a.mp3", "2026-08-01T00:00:00.000Z") },
      folderChange("folder1"),
    ];
    const subtreeEntry: AudioFileEntry = { file: audioFile("f1", "a.mp3", "2026-08-01T00:00:00.000Z"), folderPath: "" };
    const existingScanState = new Map<string, IndexRowScanState>([
      ["f1", { scanRunId: "", driveModifiedTime: "2026-08-01T00:00:00.000Z" }], // driveModifiedTime一致
    ]);
    const plan = await planDifferentialSync(changes, {
      isDescendantOfRoot: async () => true,
      listSubtree: async () => [subtreeEntry],
      existingScanState,
    });
    expect(plan.entriesToProcess.map((e) => e.file.id)).toEqual(["f1"]);
  });

  test("既知のショートカット参照先フォルダ自身の変更イベント（例：ゴミ箱からの復元）は、物理的な親がrootFolderId外でもサブツリーを再走査する（2026-08-21 Codexレビュー指摘：P1）", async () => {
    // shortcutTarget自身がfile.idとして変更イベントに現れるケース。物理的な親（file.parents）を
    // 辿ってもrootFolderIdには到達しないが、shortcutTarget自身は既知の追加ルート（extraRootFolderIds）
    // のメンバーである、という状況をisDescendantOfRootのモックで再現する。
    const restoredFolder: DriveChange = {
      fileId: "shortcutTarget",
      removed: false,
      file: { id: "shortcutTarget", name: "Restored", mimeType: "application/vnd.google-apps.folder", parents: ["somewhereElse"] },
    };
    const subtreeEntry: AudioFileEntry = { file: audioFile("f-restored"), folderPath: "" };
    const listSubtree = vi.fn(async () => [subtreeEntry]);
    const plan = await planDifferentialSync([restoredFolder], {
      // file.parents（["somewhereElse"]）はfalse、file.id自身（["shortcutTarget"]）はtrueを返す
      isDescendantOfRoot: async (parentIds) => (parentIds?.includes("shortcutTarget") ? true : false),
      listSubtree,
      existingScanState: new Map(),
    });
    expect(listSubtree).toHaveBeenCalledWith("shortcutTarget", undefined);
    expect(plan.entriesToProcess.map((e) => e.file.id)).toEqual(["f-restored"]);
  });
});

function shortcutChange(id: string, targetId: string, opts?: { removed?: boolean; trashed?: boolean }): DriveChange {
  if (opts?.removed) return { fileId: id, removed: true };
  return {
    fileId: id,
    removed: false,
    file: {
      id,
      name: "Shortcut",
      mimeType: "application/vnd.google-apps.shortcut",
      trashed: opts?.trashed,
      shortcutDetails: { targetId, targetMimeType: "application/vnd.google-apps.folder" },
    },
  };
}

describe("applyShortcutChangesToExtraRootFolderIds", () => {
  test("新しく追加されたショートカット（現在rootFolderId配下）の参照先を追加する", async () => {
    const extraRootFolderIds = new Set<string>();
    await applyShortcutChangesToExtraRootFolderIds([shortcutChange("s1", "target1")], extraRootFolderIds, async () => true);
    expect([...extraRootFolderIds]).toEqual(["target1"]);
  });

  test("rootFolderId配下でないショートカットの参照先は追加しない", async () => {
    const extraRootFolderIds = new Set<string>();
    await applyShortcutChangesToExtraRootFolderIds([shortcutChange("s1", "target1")], extraRootFolderIds, async () => false);
    expect([...extraRootFolderIds]).toEqual([]);
  });

  test("removed=true（完全削除、file情報が無い）の場合はショートカットだったかどうか判定できないため何もしない。この場合の後始末はplanDifferentialSyncのneedsReconcile（種別不明の削除は安全側でリコンサイルを立てる）に委ねる", async () => {
    const extraRootFolderIds = new Set<string>(["target1"]);
    await applyShortcutChangesToExtraRootFolderIds(
      [shortcutChange("s1", "target1", { removed: true })],
      extraRootFolderIds,
      async () => true
    );
    expect([...extraRootFolderIds]).toEqual(["target1"]);
  });

  test("ショートカットがゴミ箱へ移動された場合も参照先を除去する", async () => {
    const extraRootFolderIds = new Set<string>(["target1"]);
    await applyShortcutChangesToExtraRootFolderIds(
      [shortcutChange("s1", "target1", { trashed: true })],
      extraRootFolderIds,
      async () => true
    );
    expect([...extraRootFolderIds]).toEqual([]);
  });

  test("ショートカットがrootFolderId外へ移動された場合も参照先を除去する", async () => {
    const extraRootFolderIds = new Set<string>(["target1"]);
    await applyShortcutChangesToExtraRootFolderIds([shortcutChange("s1", "target1")], extraRootFolderIds, async () => false);
    expect([...extraRootFolderIds]).toEqual([]);
  });

  test("ショートカット以外の変更（フォルダ本体・音楽ファイル）は無視する", async () => {
    const extraRootFolderIds = new Set<string>();
    const changes: DriveChange[] = [
      { fileId: "folder1", removed: false, file: { id: "folder1", name: "Folder", mimeType: "application/vnd.google-apps.folder" } },
      { fileId: "f1", removed: false, file: { id: "f1", name: "a.mp3", mimeType: "audio/mpeg", parents: ["p1"] } },
    ];
    await applyShortcutChangesToExtraRootFolderIds(changes, extraRootFolderIds, async () => true);
    expect([...extraRootFolderIds]).toEqual([]);
  });
});
