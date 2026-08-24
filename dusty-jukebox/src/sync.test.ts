import { afterEach, describe, expect, test, vi } from "vitest";
import {
  advanceStartPageToken,
  clearScanRunId,
  createSyncTabIO,
  decodeFolderIdList,
  encodeFolderIdList,
  isPendingForScanRun,
  isSyncStateCurrent,
  isValidSyncHeader,
  markInitialScanCompleted,
  parseSyncState,
  persistShortcutRootFolderIds,
  prepareSyncForScan,
  resetForFullRescan,
  SYNC_TAB_HEADER,
  type SyncTabIO,
} from "./sync";
import type { IndexRowScanState } from "./sheets";

const FIXED_RUN_ID = "run-fixed-0001";
const fixedRunId = () => FIXED_RUN_ID;

function makeFakeIO(
  existingRows: (string | number)[][]
): SyncTabIO & { updateCalls: { rowNumber: number; row: [string, string] }[][]; appendCalls: [string, string][][] } {
  const updateCalls: { rowNumber: number; row: [string, string] }[][] = [];
  const appendCalls: [string, string][][] = [];
  let rows = existingRows;
  return {
    updateCalls,
    appendCalls,
    async readAllRows() {
      return rows;
    },
    async readHeaderRow() {
      return [...SYNC_TAB_HEADER];
    },
    async writeRows(updates, appends) {
      if (updates.length > 0) {
        updateCalls.push(updates);
        for (const { rowNumber, row } of updates) rows[rowNumber - 2] = row;
      }
      if (appends.length > 0) {
        appendCalls.push(appends);
        rows = [...rows, ...appends];
      }
    },
  };
}

describe("isPendingForScanRun", () => {
  const currentScanRunId = "run-current";
  const currentModifiedTime = "2026-08-20T00:00:00.000Z";
  const existing = (scanRunId: string, driveModifiedTime: string): IndexRowScanState => ({ scanRunId, driveModifiedTime });

  test("既存行が無い（初回スキャン対象）なら処理対象", () => {
    expect(isPendingForScanRun(undefined, currentScanRunId, currentModifiedTime)).toBe(true);
  });

  test("既存行のscanRunIdが今回のscanRunIdと異なる（別の実行、または未処理）なら処理対象", () => {
    expect(isPendingForScanRun(existing("run-other", currentModifiedTime), currentScanRunId, currentModifiedTime)).toBe(true);
  });

  test("既存行のscanRunIdが空文字列（旧スキーマからの移行直後等）なら処理対象", () => {
    expect(isPendingForScanRun(existing("", currentModifiedTime), currentScanRunId, currentModifiedTime)).toBe(true);
  });

  test("scanRunIdが一致し、driveModifiedTimeも一致すれば処理済みとしてスキップ", () => {
    expect(isPendingForScanRun(existing(currentScanRunId, currentModifiedTime), currentScanRunId, currentModifiedTime)).toBe(false);
  });

  test("scanRunIdが一致していても、driveModifiedTimeが異なる（中断中にDrive側で更新された）場合は処理対象に戻す（2026-08-21 Codexレビュー指摘：P2）", () => {
    const changedModifiedTime = "2026-08-20T01:00:00.000Z";
    expect(isPendingForScanRun(existing(currentScanRunId, currentModifiedTime), currentScanRunId, changedModifiedTime)).toBe(true);
  });

  test("scanRunIdは時刻の大小ではなく完全一致で判定する（クロックスキュー耐性、2026-08-21 Codexレビュー指摘：P1）", () => {
    // 辞書順で「後」に見えるIDでも、完全一致しなければ処理対象のまま
    expect(isPendingForScanRun(existing("run-zzz-later", currentModifiedTime), "run-aaa-earlier", currentModifiedTime)).toBe(true);
  });
});

describe("parseSyncState", () => {
  test("key,value行をSyncStateへ変換する", () => {
    const state = parseSyncState([
      ["startPageToken", "T0"],
      ["rootFolderId", "root1"],
      ["initialScanCompletedAt", "2026-08-20T00:00:00.000Z"],
      ["scanRunId", "run-1"],
    ]);
    expect(state).toEqual({
      startPageToken: "T0",
      rootFolderId: "root1",
      initialScanCompletedAt: "2026-08-20T00:00:00.000Z",
      scanRunId: "run-1",
    });
  });

  test("空文字列の値は未設定として扱う（クリアされた状態）", () => {
    const state = parseSyncState([
      ["startPageToken", "T0"],
      ["rootFolderId", "root1"],
      ["initialScanCompletedAt", ""],
    ]);
    expect(state.initialScanCompletedAt).toBeUndefined();
  });

  test("未知のキー・空行は無視する", () => {
    const state = parseSyncState([
      ["someFutureKey", "x"],
      [],
      ["rootFolderId", "root1"],
    ]);
    expect(state).toEqual({ rootFolderId: "root1" });
  });

  test("行が無い場合は全て未設定", () => {
    expect(parseSyncState([])).toEqual({});
  });

  test("同じキーの重複行が存在する場合、最後（シート上で最も下）の行の値を採用する（空文字列のtombstoneを含む、2026-08-21 Codexレビュー指摘：P1）", () => {
    // 2台のデバイスがscanRunIdの行がまだ無い状態でほぼ同時に初回作成すると重複行ができうる。
    // その後clearScanRunIdが「最後の行」を空文字列に更新しても、以前は空文字列の行を
    // 読み飛ばしていたため、より上にある古い非空の重複行が復活してしまっていた。
    const state = parseSyncState([
      ["rootFolderId", "root1"],
      ["scanRunId", "run-stale-duplicate"],
      ["scanRunId", ""], // clearScanRunIdが更新した、最後（＝現在値）の行
    ]);
    expect(state.scanRunId).toBeUndefined();
  });

  test("同じキーの重複行で最後が非空なら、その値を現在値として採用する", () => {
    const state = parseSyncState([
      ["scanRunId", "run-old"],
      ["scanRunId", "run-new"],
    ]);
    expect(state.scanRunId).toBe("run-new");
  });
});

describe("prepareSyncForScan", () => {
  test("初回（sync タブが空）はrootFolderIdが無いため新規トークンを取得し、4項目（scanRunId含む）をまとめて書く", async () => {
    const io = makeFakeIO([]);
    const getNewToken = vi.fn(async () => "T-new");

    const result = await prepareSyncForScan(io, getNewToken, "root1", fixedRunId);

    expect(result).toEqual({ startPageToken: "T-new", scanRunId: FIXED_RUN_ID, hasCompletedInitialScan: false, shortcutRootFolderIds: [] });
    expect(getNewToken).toHaveBeenCalledTimes(1);
    expect(io.appendCalls).toEqual([
      [
        ["startPageToken", "T-new"],
        ["rootFolderId", "root1"],
        ["initialScanCompletedAt", ""],
        ["scanRunId", FIXED_RUN_ID],
      ],
    ]);
    expect(io.updateCalls).toEqual([]);
  });

  test("ルートフォルダIDが変わった場合、新規トークンを取得しrootFolderId/startPageToken/initialScanCompletedAtクリア・新しいscanRunIdを1回でまとめて書く（CONCEPT.md 4.3節・着手順の目安5）", async () => {
    const io = makeFakeIO([
      ["startPageToken", "T-old"],
      ["rootFolderId", "root-old"],
      ["initialScanCompletedAt", "2026-08-19T00:00:00.000Z"],
      ["scanRunId", "run-old"],
    ]);
    const getNewToken = vi.fn(async () => "T-new");

    const result = await prepareSyncForScan(io, getNewToken, "root-new", fixedRunId);

    expect(result).toEqual({ startPageToken: "T-new", scanRunId: FIXED_RUN_ID, hasCompletedInitialScan: false, shortcutRootFolderIds: [] });
    expect(getNewToken).toHaveBeenCalledTimes(1);
    expect(io.updateCalls).toEqual([
      [
        { rowNumber: 2, row: ["startPageToken", "T-new"] },
        { rowNumber: 3, row: ["rootFolderId", "root-new"] },
        { rowNumber: 4, row: ["initialScanCompletedAt", ""] },
        { rowNumber: 5, row: ["scanRunId", FIXED_RUN_ID] },
      ],
    ]);
    expect(io.appendCalls).toEqual([]);
  });

  test("同じルートで初期化未完了（initialScanCompletedAt無し）の場合、既存のstartPageTokenを使い回し新規取得しない（4.3節：複数デバイスの取得し直し競合を避けるため）。scanRunIdが無ければ新規に書く", async () => {
    const io = makeFakeIO([
      ["startPageToken", "T-existing"],
      ["rootFolderId", "root1"],
    ]);
    const getNewToken = vi.fn(async () => "T-should-not-be-used");

    const result = await prepareSyncForScan(io, getNewToken, "root1", fixedRunId);

    expect(result).toEqual({ startPageToken: "T-existing", scanRunId: FIXED_RUN_ID, hasCompletedInitialScan: false, shortcutRootFolderIds: [] });
    expect(getNewToken).not.toHaveBeenCalled();
    expect(io.updateCalls).toEqual([]);
    expect(io.appendCalls).toEqual([[["scanRunId", FIXED_RUN_ID]]]);
  });

  test("同じルートでscanRunIdが既に設定済み（前回の実行が中断していた）場合はそのまま再利用し、書き込まない（着手順の目安5：中断・再開のウォーターマーク）", async () => {
    const io = makeFakeIO([
      ["startPageToken", "T-existing"],
      ["rootFolderId", "root1"],
      ["scanRunId", "run-in-progress"],
    ]);
    const getNewToken = vi.fn(async () => "T-should-not-be-used");

    const result = await prepareSyncForScan(io, getNewToken, "root1", fixedRunId);

    expect(result).toEqual({ startPageToken: "T-existing", scanRunId: "run-in-progress", hasCompletedInitialScan: false, shortcutRootFolderIds: [] });
    expect(getNewToken).not.toHaveBeenCalled();
    expect(io.updateCalls).toEqual([]);
    expect(io.appendCalls).toEqual([]);
  });

  test("同じルートで初回スキャン完了済みの場合も、既存のstartPageTokenをそのまま使う", async () => {
    const io = makeFakeIO([
      ["startPageToken", "T-existing"],
      ["rootFolderId", "root1"],
      ["initialScanCompletedAt", "2026-08-19T00:00:00.000Z"],
      ["scanRunId", "run-in-progress"],
    ]);
    const getNewToken = vi.fn(async () => "T-should-not-be-used");

    const result = await prepareSyncForScan(io, getNewToken, "root1", fixedRunId);

    expect(result).toEqual({ startPageToken: "T-existing", scanRunId: "run-in-progress", hasCompletedInitialScan: true, shortcutRootFolderIds: [] });
    expect(getNewToken).not.toHaveBeenCalled();
  });

  test("永続化済みのshortcutRootFolderIdsをデコードして返す（フォルダショートカット、2026-08-21 Codexレビュー指摘：P1）", async () => {
    const io = makeFakeIO([
      ["startPageToken", "T-existing"],
      ["rootFolderId", "root1"],
      ["initialScanCompletedAt", "2026-08-19T00:00:00.000Z"],
      ["shortcutRootFolderIds", "folderA,folderB"],
    ]);
    const getNewToken = vi.fn(async () => "T-should-not-be-used");

    const result = await prepareSyncForScan(io, getNewToken, "root1", fixedRunId);

    expect(result.shortcutRootFolderIds).toEqual(["folderA", "folderB"]);
  });

  test("rootFolderIdは記録済みだがstartPageTokenが無い異常系では新規取得して補う（scanRunIdも併せて設定する）", async () => {
    const io = makeFakeIO([["rootFolderId", "root1"]]);
    const getNewToken = vi.fn(async () => "T-recovered");

    const result = await prepareSyncForScan(io, getNewToken, "root1", fixedRunId);

    expect(result).toEqual({ startPageToken: "T-recovered", scanRunId: FIXED_RUN_ID, hasCompletedInitialScan: false, shortcutRootFolderIds: [] });
    expect(getNewToken).toHaveBeenCalledTimes(1);
    expect(io.appendCalls).toEqual([
      [
        ["startPageToken", "T-recovered"],
        ["scanRunId", FIXED_RUN_ID],
      ],
    ]);
  });

  test("newRunIdを省略した場合はcrypto.randomUUID()相当の実装がデフォルトで使われる", async () => {
    const io = makeFakeIO([]);
    const getNewToken = vi.fn(async () => "T-new");

    const result = await prepareSyncForScan(io, getNewToken, "root1");

    expect(typeof result.scanRunId).toBe("string");
    expect(result.scanRunId.length).toBeGreaterThan(0);
  });
});

describe("clearScanRunId", () => {
  test("準備時と現在のroot/token/scanRunIdが一致すれば空文字列で書き込む", async () => {
    const io = makeFakeIO([
      ["startPageToken", "T0"],
      ["rootFolderId", "root1"],
      ["scanRunId", "run-1"],
    ]);
    await clearScanRunId(io, { rootFolderId: "root1", startPageToken: "T0", scanRunId: "run-1" });
    expect(io.updateCalls).toEqual([[{ rowNumber: 4, row: ["scanRunId", ""] }]]);
  });

  test("root/tokenが不一致の場合は書き込まない（他デバイスが別実行に切り替え済み）", async () => {
    const io = makeFakeIO([
      ["startPageToken", "T-new"],
      ["rootFolderId", "root-B"],
      ["scanRunId", "run-1"],
    ]);
    await clearScanRunId(io, { rootFolderId: "root-A", startPageToken: "T-old", scanRunId: "run-1" });
    expect(io.updateCalls).toEqual([]);
    expect(io.appendCalls).toEqual([]);
  });

  test("root/tokenは一致するがscanRunIdが異なる場合は書き込まない（2026-08-20 Codexレビュー指摘：P2。同じルート・トークンのまま別デバイスが新しい実行を開始していた場合、その新しいウォーターマークを誤ってクリアしないため）", async () => {
    const io = makeFakeIO([
      ["startPageToken", "T0"],
      ["rootFolderId", "root1"],
      ["scanRunId", "run-2"], // 別デバイスが新しい実行を開始済み
    ]);
    await clearScanRunId(io, { rootFolderId: "root1", startPageToken: "T0", scanRunId: "run-1" });
    expect(io.updateCalls).toEqual([]);
    expect(io.appendCalls).toEqual([]);
  });

  test("scanRunIdが既に未設定なら何もしない", async () => {
    const io = makeFakeIO([
      ["startPageToken", "T0"],
      ["rootFolderId", "root1"],
    ]);
    await clearScanRunId(io, { rootFolderId: "root1", startPageToken: "T0", scanRunId: "run-1" });
    expect(io.updateCalls).toEqual([]);
    expect(io.appendCalls).toEqual([]);
  });
});

describe("markInitialScanCompleted", () => {
  test("initialScanCompletedAtが未設定なら追記する（現在のsync状態が準備時のroot/tokenと一致する場合）", async () => {
    const io = makeFakeIO([
      ["startPageToken", "T0"],
      ["rootFolderId", "root1"],
    ]);
    await markInitialScanCompleted(io, "2026-08-20T00:00:00.000Z", { rootFolderId: "root1", startPageToken: "T0" });
    expect(io.appendCalls).toEqual([[["initialScanCompletedAt", "2026-08-20T00:00:00.000Z"]]]);
  });

  test("既存の行があれば更新する", async () => {
    const io = makeFakeIO([
      ["startPageToken", "T0"],
      ["rootFolderId", "root1"],
      ["initialScanCompletedAt", "2026-08-19T00:00:00.000Z"],
    ]);
    await markInitialScanCompleted(io, "2026-08-20T00:00:00.000Z", { rootFolderId: "root1", startPageToken: "T0" });
    expect(io.updateCalls).toEqual([[{ rowNumber: 4, row: ["initialScanCompletedAt", "2026-08-20T00:00:00.000Z"] }]]);
  });

  test("準備時と現在のrootFolderIdが異なる場合は書き込まない（2026-08-20 Codexレビュー指摘：長時間のスキャン中に別デバイスがルートを切り替えていた場合、無関係なルートを誤って完了扱いにしないため）", async () => {
    const io = makeFakeIO([
      ["startPageToken", "T-new"],
      ["rootFolderId", "root-B"], // 別デバイスがrootAからrootBへ切り替え済み
    ]);
    await markInitialScanCompleted(io, "2026-08-20T00:00:00.000Z", { rootFolderId: "root-A", startPageToken: "T-old" });
    expect(io.appendCalls).toEqual([]);
    expect(io.updateCalls).toEqual([]);
  });

  test("rootFolderIdは一致するがstartPageTokenが異なる場合も書き込まない", async () => {
    const io = makeFakeIO([
      ["startPageToken", "T-changed"],
      ["rootFolderId", "root1"],
    ]);
    await markInitialScanCompleted(io, "2026-08-20T00:00:00.000Z", { rootFolderId: "root1", startPageToken: "T-original" });
    expect(io.appendCalls).toEqual([]);
    expect(io.updateCalls).toEqual([]);
  });

  test("scanRunIdを渡した場合、root/tokenが一致してもscanRunIdが異なれば書き込まない（2026-08-23 Codexレビュー指摘：P1。同一ルートの初期化未完了中に2台のデバイスがほぼ同時にフルスキャンを開始し、リコンサイル対象0件でisSyncStateCurrentのscanRunId確認自体が呼ばれなかった場合でも、この完了記録の直前確認で誤った完了扱いを防ぐ）", async () => {
    const io = makeFakeIO([
      ["startPageToken", "T0"],
      ["rootFolderId", "root1"],
      ["scanRunId", "run-B"],
    ]);
    await markInitialScanCompleted(io, "2026-08-20T00:00:00.000Z", { rootFolderId: "root1", startPageToken: "T0", scanRunId: "run-A" });
    expect(io.appendCalls).toEqual([]);
    expect(io.updateCalls).toEqual([]);
  });

  test("scanRunIdを渡した場合、root/token/scanRunIdすべて一致すれば書き込む", async () => {
    const io = makeFakeIO([
      ["startPageToken", "T0"],
      ["rootFolderId", "root1"],
      ["scanRunId", "run-A"],
    ]);
    await markInitialScanCompleted(io, "2026-08-20T00:00:00.000Z", { rootFolderId: "root1", startPageToken: "T0", scanRunId: "run-A" });
    expect(io.appendCalls).toEqual([[["initialScanCompletedAt", "2026-08-20T00:00:00.000Z"]]]);
  });

  test("scanRunIdを省略した場合は従来通りroot/tokenのみで判定する", async () => {
    const io = makeFakeIO([
      ["startPageToken", "T0"],
      ["rootFolderId", "root1"],
      ["scanRunId", "run-B"],
    ]);
    await markInitialScanCompleted(io, "2026-08-20T00:00:00.000Z", { rootFolderId: "root1", startPageToken: "T0" });
    expect(io.appendCalls).toEqual([[["initialScanCompletedAt", "2026-08-20T00:00:00.000Z"]]]);
  });
});

describe("advanceStartPageToken", () => {
  test("準備時と現在のroot/tokenが一致すれば新しいstartPageTokenで更新する", async () => {
    const io = makeFakeIO([
      ["startPageToken", "T0"],
      ["rootFolderId", "root1"],
    ]);
    await advanceStartPageToken(io, "T1", { rootFolderId: "root1", startPageToken: "T0" });
    expect(io.updateCalls).toEqual([[{ rowNumber: 2, row: ["startPageToken", "T1"] }]]);
  });

  test("root不一致の場合は書き込まない（差分同期中に別デバイスがルートを切り替えていた場合）", async () => {
    const io = makeFakeIO([
      ["startPageToken", "T-new"],
      ["rootFolderId", "root-B"],
    ]);
    await advanceStartPageToken(io, "T1", { rootFolderId: "root-A", startPageToken: "T-old" });
    expect(io.updateCalls).toEqual([]);
    expect(io.appendCalls).toEqual([]);
  });

  test("startPageToken不一致の場合は書き込まない（他デバイスが先に進めていた等）", async () => {
    const io = makeFakeIO([
      ["startPageToken", "T-already-advanced"],
      ["rootFolderId", "root1"],
    ]);
    await advanceStartPageToken(io, "T1", { rootFolderId: "root1", startPageToken: "T0" });
    expect(io.updateCalls).toEqual([]);
    expect(io.appendCalls).toEqual([]);
  });
});

describe("encodeFolderIdList/decodeFolderIdList", () => {
  test("空配列は空文字列にエンコードされ、空文字列は空配列にデコードされる", () => {
    expect(encodeFolderIdList([])).toBe("");
    expect(decodeFolderIdList("")).toEqual([]);
    expect(decodeFolderIdList(undefined)).toEqual([]);
  });

  test("複数IDをカンマ区切りで往復できる", () => {
    const ids = ["folder1", "folder2", "folder3"];
    expect(decodeFolderIdList(encodeFolderIdList(ids))).toEqual(ids);
  });
});

describe("persistShortcutRootFolderIds", () => {
  test("準備時と現在のroot/tokenが一致すればカンマ区切りで書き込む", async () => {
    const io = makeFakeIO([
      ["startPageToken", "T0"],
      ["rootFolderId", "root1"],
    ]);
    await persistShortcutRootFolderIds(io, ["folderA", "folderB"], { rootFolderId: "root1", startPageToken: "T0" });
    expect(io.appendCalls).toEqual([[["shortcutRootFolderIds", "folderA,folderB"]]]);
  });

  test("空配列を渡しても明示的に空文字列で書き込む（前回はショートカットがあったが今回は無くなった変化を反映するため）", async () => {
    const io = makeFakeIO([
      ["startPageToken", "T0"],
      ["rootFolderId", "root1"],
      ["shortcutRootFolderIds", "folderA"],
    ]);
    await persistShortcutRootFolderIds(io, [], { rootFolderId: "root1", startPageToken: "T0" });
    expect(io.updateCalls).toEqual([[{ rowNumber: 4, row: ["shortcutRootFolderIds", ""] }]]);
  });

  test("root/token不一致の場合は書き込まない", async () => {
    const io = makeFakeIO([
      ["startPageToken", "T-new"],
      ["rootFolderId", "root-B"],
    ]);
    await persistShortcutRootFolderIds(io, ["folderA"], { rootFolderId: "root-A", startPageToken: "T-old" });
    expect(io.updateCalls).toEqual([]);
    expect(io.appendCalls).toEqual([]);
  });

  test("scanRunIdを渡した場合、root/tokenが一致してもscanRunIdが異なれば書き込まない（2026-08-23 Codexレビュー指摘：P1。markInitialScanCompletedと同じ理由）", async () => {
    const io = makeFakeIO([
      ["startPageToken", "T0"],
      ["rootFolderId", "root1"],
      ["scanRunId", "run-B"],
    ]);
    await persistShortcutRootFolderIds(io, ["folderA"], { rootFolderId: "root1", startPageToken: "T0", scanRunId: "run-A" });
    expect(io.updateCalls).toEqual([]);
    expect(io.appendCalls).toEqual([]);
  });

  test("scanRunIdを渡した場合、root/token/scanRunIdすべて一致すれば書き込む", async () => {
    const io = makeFakeIO([
      ["startPageToken", "T0"],
      ["rootFolderId", "root1"],
      ["scanRunId", "run-A"],
    ]);
    await persistShortcutRootFolderIds(io, ["folderA"], { rootFolderId: "root1", startPageToken: "T0", scanRunId: "run-A" });
    expect(io.appendCalls).toEqual([[["shortcutRootFolderIds", "folderA"]]]);
  });
});

describe("isSyncStateCurrent", () => {
  test("root/tokenが一致すればtrue", async () => {
    const io = makeFakeIO([
      ["startPageToken", "T0"],
      ["rootFolderId", "root1"],
    ]);
    await expect(isSyncStateCurrent(io, { rootFolderId: "root1", startPageToken: "T0" })).resolves.toBe(true);
  });

  test("rootFolderIdが異なればfalse", async () => {
    const io = makeFakeIO([
      ["startPageToken", "T0"],
      ["rootFolderId", "root-B"],
    ]);
    await expect(isSyncStateCurrent(io, { rootFolderId: "root-A", startPageToken: "T0" })).resolves.toBe(false);
  });

  test("startPageTokenが異なればfalse", async () => {
    const io = makeFakeIO([
      ["startPageToken", "T-changed"],
      ["rootFolderId", "root1"],
    ]);
    await expect(isSyncStateCurrent(io, { rootFolderId: "root1", startPageToken: "T0" })).resolves.toBe(false);
  });

  test("scanRunIdを渡さない場合は従来通りroot/tokenのみで判定する（differentialSync等、scanRunIdの概念が無い呼び出し元との後方互換）", async () => {
    const io = makeFakeIO([
      ["startPageToken", "T0"],
      ["rootFolderId", "root1"],
      ["scanRunId", "run-B"],
    ]);
    await expect(isSyncStateCurrent(io, { rootFolderId: "root1", startPageToken: "T0" })).resolves.toBe(true);
  });

  test("scanRunIdを渡した場合、root/tokenが一致してもscanRunIdが異なればfalse（2026-08-23 Codexレビュー指摘：P1。初期化未完了中の同一ルートで2台のデバイスがほぼ同時にフルスキャンを開始し、異なるscanRunIdを取得した場合、root/tokenの一致だけでは2つの並行実行を区別できず、先に完了した側の索引を後から到達した側が古いknownFileIdsで誤って空欄化しうる）", async () => {
    const io = makeFakeIO([
      ["startPageToken", "T0"],
      ["rootFolderId", "root1"],
      ["scanRunId", "run-B"],
    ]);
    await expect(isSyncStateCurrent(io, { rootFolderId: "root1", startPageToken: "T0", scanRunId: "run-A" })).resolves.toBe(false);
  });

  test("scanRunIdを渡した場合、root/token/scanRunIdすべて一致すればtrue", async () => {
    const io = makeFakeIO([
      ["startPageToken", "T0"],
      ["rootFolderId", "root1"],
      ["scanRunId", "run-A"],
    ]);
    await expect(isSyncStateCurrent(io, { rootFolderId: "root1", startPageToken: "T0", scanRunId: "run-A" })).resolves.toBe(true);
  });
});

describe("resetForFullRescan", () => {
  test("準備時と現在のroot/tokenが一致すればinitialScanCompletedAt・startPageTokenの両方を空文字列にクリアする（2026-08-21 Codexレビュー指摘：P2。startPageTokenも消さないと、拒否された同じトークンを次回also使い回してしまい再び410になる）", async () => {
    const io = makeFakeIO([
      ["startPageToken", "T0"],
      ["rootFolderId", "root1"],
      ["initialScanCompletedAt", "2026-08-20T00:00:00.000Z"],
    ]);
    await resetForFullRescan(io, { rootFolderId: "root1", startPageToken: "T0" });
    expect(io.updateCalls).toEqual([
      [
        { rowNumber: 2, row: ["startPageToken", ""] },
        { rowNumber: 4, row: ["initialScanCompletedAt", ""] },
      ],
    ]);
  });

  test("root/token不一致の場合は書き込まない", async () => {
    const io = makeFakeIO([
      ["startPageToken", "T-new"],
      ["rootFolderId", "root-B"],
      ["initialScanCompletedAt", "2026-08-20T00:00:00.000Z"],
    ]);
    await resetForFullRescan(io, { rootFolderId: "root-A", startPageToken: "T-old" });
    expect(io.updateCalls).toEqual([]);
  });
});

describe("isValidSyncHeader", () => {
  test("SYNC_TAB_HEADERと完全一致する場合はtrue", () => {
    expect(isValidSyncHeader([...SYNC_TAB_HEADER])).toBe(true);
  });

  test("無関係な既存タブ等でヘッダーが異なる・空の場合はfalse（2026-08-20 Codexレビュー指摘：無検証のままsyncタブとして読み書きするとデータ破損の恐れがあった）", () => {
    expect(isValidSyncHeader([])).toBe(false);
    expect(isValidSyncHeader(["foo", "bar"])).toBe(false);
    expect(isValidSyncHeader(["key"])).toBe(false);
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

describe("createSyncTabIO", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  test("readHeaderRowは1行目全体（列範囲を指定しない`1:1`記法）をそのまま返す", async () => {
    const fetchMock = vi.fn(async () => fakeResponse(200, { values: [[...SYNC_TAB_HEADER]] }));
    vi.stubGlobal("fetch", fetchMock);

    const io = createSyncTabIO("sheet1", async () => "token");
    await expect(io.readHeaderRow()).resolves.toEqual([...SYNC_TAB_HEADER]);
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    // 列範囲（A1:B1等）を明示しない。sheets.tsのSheetsIndexIO.readHeaderRowと同じ理由
    // （2026-08-20 /code-review指摘：狭いグリッドに対する範囲超過エラーの同種バグを避ける）。
    const decoded = decodeURIComponent(url);
    expect(decoded).toContain("'sync'!1:1");
    expect(decoded).not.toMatch(/![A-Z]+\d*:[A-Z]/);
  });

  test("readHeaderRowはヘッダー行が空の場合は空配列を返す", async () => {
    const fetchMock = vi.fn(async () => fakeResponse(200, { values: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const io = createSyncTabIO("sheet1", async () => "token");
    await expect(io.readHeaderRow()).resolves.toEqual([]);
  });

  test("readAllRowsはA2:B以降を読む", async () => {
    const fetchMock = vi.fn(async () => fakeResponse(200, { values: [["rootFolderId", "root1"]] }));
    vi.stubGlobal("fetch", fetchMock);

    const io = createSyncTabIO("sheet1", async () => "token");
    const rows = await io.readAllRows();

    expect(rows).toEqual([["rootFolderId", "root1"]]);
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(decodeURIComponent(url)).toContain("'sync'!A2:B");
  });

  test("appendは通信例外時にリトライしない（非冪等のため、sheets.tsのappendRowsと同じ方針）", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    vi.stubGlobal("fetch", fetchMock);

    const io = createSyncTabIO("sheet1", async () => "token");
    await expect(io.writeRows([], [["rootFolderId", "root1"]])).rejects.toBeInstanceOf(TypeError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("updateは500等のHTTPエラー応答をリトライする（batchUpdateは冪等なため）", async () => {
    vi.useFakeTimers();
    let call = 0;
    const fetchMock = vi.fn(async () => {
      call += 1;
      if (call === 1) return fakeResponse(500, { error: { errors: [{ reason: "backendError" }] } });
      return fakeResponse(200, {});
    });
    vi.stubGlobal("fetch", fetchMock);

    const io = createSyncTabIO("sheet1", async () => "token");
    const promise = io.writeRows([{ rowNumber: 2, row: ["rootFolderId", "root1"] }], []);
    await vi.runAllTimersAsync();
    await promise;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
