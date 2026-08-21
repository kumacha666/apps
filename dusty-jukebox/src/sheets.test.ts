import { afterEach, describe, expect, test, vi } from "vitest";
import {
  buildIndexRow,
  createSheetsIndexIO,
  indexRowsScanState,
  INDEX_SHEET_HEADER,
  INDEX_SHEET_NAME,
  isLegacyIndexHeaderV1,
  isLegacyIndexHeaderV2,
  isValidIndexHeader,
  LEGACY_INDEX_SHEET_HEADER_V1,
  LEGACY_INDEX_SHEET_HEADER_V2,
  mergeDuplicateIndexRows,
  reconcileIndexAgainstRoot,
  removeIndexRows,
  upsertIndexRows,
  type SheetsIndexIO,
} from "./sheets";

function makeFakeIO(
  existingRows: (string | number)[][]
): SheetsIndexIO & { updateCalls: { rowNumber: number; row: (string | number)[] }[][]; appendCalls: (string | number)[][][] } {
  const updateCalls: { rowNumber: number; row: (string | number)[] }[][] = [];
  const appendCalls: (string | number)[][][] = [];
  return {
    updateCalls,
    appendCalls,
    async listExistingRows() {
      return existingRows;
    },
    async readHeaderRow() {
      return [...INDEX_SHEET_HEADER];
    },
    async updateRows(updates) {
      updateCalls.push(updates);
    },
    async appendRows(rows) {
      appendCalls.push(rows);
    },
  };
}

function indexOf(name: (typeof INDEX_SHEET_HEADER)[number]): number {
  return INDEX_SHEET_HEADER.indexOf(name);
}

describe("buildIndexRow", () => {
  test("列数がINDEX_SHEET_HEADERと一致する", () => {
    const row = buildIndexRow({
      fileId: "f1",
      fileName: "01 世界が終るまでは....mp3",
      parentId: "wands",
      driveModifiedTime: "2026-08-01T00:00:00.000Z",
      lastScannedAtIso: "2026-08-20T00:00:00.000Z",
      tags: { title: "世界が終るまでは...", artist: "WANDS", releaseYear: 1994 },
      extractionFailed: false,
    });
    expect(row).toHaveLength(INDEX_SHEET_HEADER.length);
  });

  test("抽出値を対応する列に書き込み、_override列は常に空欄で作成する（4.2節）", () => {
    const row = buildIndexRow({
      fileId: "f1",
      fileName: "Theme.m4a",
      parentId: "folder1",
      driveModifiedTime: "2026-08-01T00:00:00.000Z",
      lastScannedAtIso: "2026-08-20T00:00:00.000Z",
      tags: { title: "Theme", artist: "Michael Giacchino", composer: ["Michael Giacchino", "Others"], releaseYear: 2018 },
      extractionFailed: false,
    });
    const byName = Object.fromEntries(INDEX_SHEET_HEADER.map((name, i) => [name, row[i]]));
    expect(byName.fileId).toBe("f1");
    expect(byName.extension).toBe("m4a");
    expect(byName.title).toBe("Theme");
    expect(byName.title_override).toBe("");
    expect(byName.composer).toBe("Michael Giacchino / Others");
    expect(byName.composer_override).toBe("");
    expect(byName.releaseYear).toBe(2018);
    expect(byName.releaseYear_override).toBe("");
    expect(byName.extractionFailed).toBe("FALSE");
  });

  test("文字化けマーカーを検出した場合garbledSuspectを立てるが、修復は行わずgarbledResolvedはFALSEのまま", () => {
    const row = buildIndexRow({
      fileId: "f1",
      fileName: "junk.mp3",
      parentId: "various",
      driveModifiedTime: "2026-08-01T00:00:00.000Z",
      lastScannedAtIso: "2026-08-20T00:00:00.000Z",
      tags: { composer: "縺薙ｓ縺ｫ縺｡縺ｯ" },
      extractionFailed: false,
    });
    const byName = Object.fromEntries(INDEX_SHEET_HEADER.map((name, i) => [name, row[i]]));
    expect(byName.garbledSuspect).toBe("TRUE");
    expect(byName.garbledResolved).toBe("FALSE");
  });

  test("タグ抽出に失敗した場合extractionFailedを立てる（5節の巨大ファイルタイムアウト等）", () => {
    const row = buildIndexRow({
      fileId: "f1",
      fileName: "huge-concert.flac",
      parentId: "orchestra",
      driveModifiedTime: "2026-08-01T00:00:00.000Z",
      lastScannedAtIso: "2026-08-20T00:00:00.000Z",
      tags: null,
      extractionFailed: true,
    });
    const byName = Object.fromEntries(INDEX_SHEET_HEADER.map((name, i) => [name, row[i]]));
    expect(byName.extractionFailed).toBe("TRUE");
    expect(byName.title).toBe("");
  });

  test("scanRunIdを指定した場合、対応する列に書き込む（着手順の目安5、2026-08-21追加）", () => {
    const row = buildIndexRow({
      fileId: "f1",
      fileName: "a.mp3",
      parentId: "p",
      driveModifiedTime: "2026-08-20T00:00:00.000Z",
      lastScannedAtIso: "2026-08-20T00:00:00.000Z",
      tags: {},
      extractionFailed: false,
      scanRunId: "run-abc",
    });
    const byName = Object.fromEntries(INDEX_SHEET_HEADER.map((name, i) => [name, row[i]]));
    expect(byName.scanRunId).toBe("run-abc");
  });

  test("scanRunIdを省略した場合は空欄で作成する", () => {
    const row = buildIndexRow({
      fileId: "f1",
      fileName: "a.mp3",
      parentId: "p",
      driveModifiedTime: "2026-08-20T00:00:00.000Z",
      lastScannedAtIso: "2026-08-20T00:00:00.000Z",
      tags: {},
      extractionFailed: false,
    });
    const byName = Object.fromEntries(INDEX_SHEET_HEADER.map((name, i) => [name, row[i]]));
    expect(byName.scanRunId).toBe("");
  });
});

describe("upsertIndexRows", () => {
  test("既存のfileIdは該当行を上書きし、新規fileIdは末尾に追記する", async () => {
    // 2行目=f1(既存)、3行目=f2(既存)。f3は新規。
    const existingF1 = buildIndexRow({
      fileId: "f1",
      fileName: "old.mp3",
      parentId: "p",
      driveModifiedTime: "2026-08-01T00:00:00.000Z",
      lastScannedAtIso: "2026-08-01T00:00:00.000Z",
      tags: {},
      extractionFailed: false,
    });
    const existingF2 = buildIndexRow({
      fileId: "f2",
      fileName: "old2.mp3",
      parentId: "p",
      driveModifiedTime: "2026-08-01T00:00:00.000Z",
      lastScannedAtIso: "2026-08-01T00:00:00.000Z",
      tags: {},
      extractionFailed: false,
    });
    const io = makeFakeIO([existingF1, existingF2]);
    const newF1 = buildIndexRow({
      fileId: "f1",
      fileName: "updated.mp3",
      parentId: "p",
      driveModifiedTime: "2026-08-20T00:00:00.000Z",
      lastScannedAtIso: "2026-08-20T00:00:00.000Z",
      tags: { title: "Updated Title" },
      extractionFailed: false,
    });
    const newF3 = buildIndexRow({
      fileId: "f3",
      fileName: "new.mp3",
      parentId: "p",
      driveModifiedTime: "2026-08-20T00:00:00.000Z",
      lastScannedAtIso: "2026-08-20T00:00:00.000Z",
      tags: { title: "Brand New" },
      extractionFailed: false,
    });
    await upsertIndexRows(io, [
      { fileId: "f1", row: newF1 },
      { fileId: "f3", row: newF3 },
    ]);

    expect(io.updateCalls).toHaveLength(1);
    expect(io.updateCalls[0]).toEqual([{ rowNumber: 2, row: newF1 }]);
    expect(io.appendCalls).toEqual([[newF3]]);
  });

  test("既存行の_override列は温存し、抽出値列だけ新しい値で上書きする（4.2節: スキャナはoverrideを書き換えない）", async () => {
    const existing = buildIndexRow({
      fileId: "f1",
      fileName: "old.mp3",
      parentId: "p",
      driveModifiedTime: "2026-08-01T00:00:00.000Z",
      lastScannedAtIso: "2026-08-01T00:00:00.000Z",
      tags: { title: "抽出タイトル(旧)", artist: "抽出アーティスト" },
      extractionFailed: false,
    });
    // ユーザーが手動でtitle_override/artist_overrideを補正済みと仮定
    existing[indexOf("title_override")] = "ユーザー補正タイトル";
    existing[indexOf("artist_override")] = "ユーザー補正アーティスト";

    const io = makeFakeIO([existing]);
    const rescanned = buildIndexRow({
      fileId: "f1",
      fileName: "old.mp3",
      parentId: "p",
      driveModifiedTime: "2026-08-20T00:00:00.000Z",
      lastScannedAtIso: "2026-08-20T00:00:00.000Z",
      tags: { title: "抽出タイトル(新)", artist: "抽出アーティスト" },
      extractionFailed: false,
    });

    await upsertIndexRows(io, [{ fileId: "f1", row: rescanned }]);

    const [update] = io.updateCalls[0];
    expect(update.row[indexOf("title")]).toBe("抽出タイトル(新)"); // 抽出値は更新される
    expect(update.row[indexOf("title_override")]).toBe("ユーザー補正タイトル"); // overrideは温存
    expect(update.row[indexOf("artist_override")]).toBe("ユーザー補正アーティスト");
  });

  test("再スキャンでタグ抽出に失敗した場合、既存のタグ列を保持しextractionFailedだけ更新する（5節: 巨大ファイルのタイムアウト等）", async () => {
    const existing = buildIndexRow({
      fileId: "f1",
      fileName: "huge-concert.flac",
      parentId: "orchestra",
      driveModifiedTime: "2026-08-01T00:00:00.000Z",
      lastScannedAtIso: "2026-08-01T00:00:00.000Z",
      tags: { title: "既存タイトル", artist: "既存アーティスト", releaseYear: 1994 },
      extractionFailed: false,
    });
    const io = makeFakeIO([existing]);
    const failedRescan = buildIndexRow({
      fileId: "f1",
      fileName: "huge-concert.flac",
      parentId: "orchestra",
      driveModifiedTime: "2026-08-20T00:00:00.000Z",
      lastScannedAtIso: "2026-08-20T00:00:00.000Z",
      tags: null, // タイムアウトでタグが取れなかった
      extractionFailed: true,
    });

    await upsertIndexRows(io, [{ fileId: "f1", row: failedRescan }]);

    const [update] = io.updateCalls[0];
    expect(update.row[indexOf("title")]).toBe("既存タイトル"); // タグ列は既存値を保持
    expect(update.row[indexOf("artist")]).toBe("既存アーティスト");
    expect(update.row[indexOf("releaseYear")]).toBe(1994);
    expect(update.row[indexOf("extractionFailed")]).toBe("TRUE"); // 失敗フラグ自体は更新される
    expect(update.row[indexOf("lastScannedAt")]).toBe("2026-08-20T00:00:00.000Z"); // 走査時刻も更新される
  });

  test("同一バッチ内に同じ新規fileIdが複数含まれる場合、重複行を作らず最後の値を採用する", async () => {
    const io = makeFakeIO([]);
    const first = buildIndexRow({
      fileId: "f1",
      fileName: "a.mp3",
      parentId: "p",
      driveModifiedTime: "2026-08-20T00:00:00.000Z",
      lastScannedAtIso: "2026-08-20T00:00:00.000Z",
      tags: { title: "1回目" },
      extractionFailed: false,
    });
    const second = buildIndexRow({
      fileId: "f1",
      fileName: "a.mp3",
      parentId: "p",
      driveModifiedTime: "2026-08-20T00:00:00.000Z",
      lastScannedAtIso: "2026-08-20T00:00:01.000Z",
      tags: { title: "2回目" },
      extractionFailed: false,
    });
    await upsertIndexRows(io, [
      { fileId: "f1", row: first },
      { fileId: "f1", row: second },
    ]);
    expect(io.appendCalls).toEqual([[second]]);
  });

  test("空の入力は何もしない（listExistingRowsすら呼ばない）", async () => {
    let listCalled = false;
    const io: SheetsIndexIO = {
      async listExistingRows() {
        listCalled = true;
        return [];
      },
      async readHeaderRow() {
        return [...INDEX_SHEET_HEADER];
      },
      async updateRows() {},
      async appendRows() {},
    };
    await upsertIndexRows(io, []);
    expect(listCalled).toBe(false);
  });

  test("既存fileIdが1件も無い場合は全件追記になる（初回スキャン相当）", async () => {
    const io = makeFakeIO([]);
    const rowF1 = buildIndexRow({
      fileId: "f1",
      fileName: "a.mp3",
      parentId: "p",
      driveModifiedTime: "2026-08-20T00:00:00.000Z",
      lastScannedAtIso: "2026-08-20T00:00:00.000Z",
      tags: {},
      extractionFailed: false,
    });
    const rowF2 = buildIndexRow({
      fileId: "f2",
      fileName: "b.mp3",
      parentId: "p",
      driveModifiedTime: "2026-08-20T00:00:00.000Z",
      lastScannedAtIso: "2026-08-20T00:00:00.000Z",
      tags: {},
      extractionFailed: false,
    });
    await upsertIndexRows(io, [
      { fileId: "f1", row: rowF1 },
      { fileId: "f2", row: rowF2 },
    ]);
    expect(io.updateCalls).toEqual([]);
    expect(io.appendCalls).toEqual([[rowF1, rowF2]]);
  });

  test("existingRowsSnapshotを渡した場合、listExistingRowsを呼ばずそのスナップショットを使う（着手順の目安5：バッチ処理での全件読み取り回避）", async () => {
    const existingF1 = buildIndexRow({
      fileId: "f1",
      fileName: "old.mp3",
      parentId: "p",
      driveModifiedTime: "2026-08-01T00:00:00.000Z",
      lastScannedAtIso: "2026-08-01T00:00:00.000Z",
      tags: {},
      extractionFailed: false,
    });
    let listCalled = false;
    const io: SheetsIndexIO = {
      async listExistingRows() {
        listCalled = true;
        return [];
      },
      async readHeaderRow() {
        return [...INDEX_SHEET_HEADER];
      },
      updateRows: vi.fn(async () => {}),
      appendRows: vi.fn(async () => {}),
    };
    const newF1 = buildIndexRow({
      fileId: "f1",
      fileName: "updated.mp3",
      parentId: "p",
      driveModifiedTime: "2026-08-20T00:00:00.000Z",
      lastScannedAtIso: "2026-08-20T00:00:00.000Z",
      tags: { title: "Updated Title" },
      extractionFailed: false,
    });

    await upsertIndexRows(io, [{ fileId: "f1", row: newF1 }], [existingF1]);

    expect(listCalled).toBe(false);
    expect(io.updateRows).toHaveBeenCalledWith([{ rowNumber: 2, row: newF1 }]);
  });
});

describe("indexRowsScanState", () => {
  test("fileId→{scanRunId, driveModifiedTime}のMapを作る", () => {
    const rowF1 = buildIndexRow({
      fileId: "f1",
      fileName: "a.mp3",
      parentId: "p",
      driveModifiedTime: "2026-08-20T00:00:00.000Z",
      lastScannedAtIso: "2026-08-20T09:00:00.000Z",
      tags: {},
      extractionFailed: false,
      scanRunId: "run-1",
    });
    const rowF2 = buildIndexRow({
      fileId: "f2",
      fileName: "b.mp3",
      parentId: "p",
      driveModifiedTime: "2026-08-19T00:00:00.000Z",
      lastScannedAtIso: "2026-08-19T00:00:00.000Z",
      tags: {},
      extractionFailed: false,
      scanRunId: "run-2",
    });
    const map = indexRowsScanState([rowF1, rowF2]);
    expect(map.get("f1")).toEqual({ scanRunId: "run-1", driveModifiedTime: "2026-08-20T00:00:00.000Z" });
    expect(map.get("f2")).toEqual({ scanRunId: "run-2", driveModifiedTime: "2026-08-19T00:00:00.000Z" });
    expect(map.has("f3")).toBe(false);
  });

  test("scanRunIdを指定しない場合は空文字列として記録される（既定値）", () => {
    const row = buildIndexRow({
      fileId: "f1",
      fileName: "a.mp3",
      parentId: "p",
      driveModifiedTime: "2026-08-20T00:00:00.000Z",
      lastScannedAtIso: "2026-08-20T09:00:00.000Z",
      tags: {},
      extractionFailed: false,
    });
    const map = indexRowsScanState([row]);
    expect(map.get("f1")).toEqual({ scanRunId: "", driveModifiedTime: "2026-08-20T00:00:00.000Z" });
  });

  test("fileIdが空の行は無視する（重複行マージで空欄化された行等）", () => {
    const blank = new Array(INDEX_SHEET_HEADER.length).fill("");
    const map = indexRowsScanState([blank]);
    expect(map.size).toBe(0);
  });
});

describe("mergeDuplicateIndexRows", () => {
  test("重複が無ければ何もしない（updateRowsを呼ばない）", async () => {
    const rowF1 = buildIndexRow({
      fileId: "f1",
      fileName: "a.mp3",
      parentId: "p",
      driveModifiedTime: "2026-08-01T00:00:00.000Z",
      lastScannedAtIso: "2026-08-01T00:00:00.000Z",
      tags: {},
      extractionFailed: false,
    });
    const io = makeFakeIO([rowF1]);
    const result = await mergeDuplicateIndexRows(io);
    expect(result).toEqual({ mergedGroups: 0, rowsCleared: 0 });
    expect(io.updateCalls).toEqual([]);
  });

  test("extractionFailed=falseの行を常に優先する（失敗した抽出が成功した抽出結果を上書きしない）", async () => {
    const success = buildIndexRow({
      fileId: "f1",
      fileName: "a.mp3",
      parentId: "p",
      driveModifiedTime: "2026-08-01T00:00:00.000Z",
      lastScannedAtIso: "2026-08-01T00:00:00.000Z", // より古い
      tags: { title: "成功した抽出結果" },
      extractionFailed: false,
    });
    const failed = buildIndexRow({
      fileId: "f1",
      fileName: "a.mp3",
      parentId: "p",
      driveModifiedTime: "2026-08-20T00:00:00.000Z",
      lastScannedAtIso: "2026-08-20T00:00:00.000Z", // より新しいが失敗
      tags: null,
      extractionFailed: true,
    });
    const io = makeFakeIO([success, failed]);
    const result = await mergeDuplicateIndexRows(io);
    expect(result).toEqual({ mergedGroups: 1, rowsCleared: 1 });

    const updates = io.updateCalls[0];
    const kept = updates.find((u) => u.rowNumber === 2)!;
    const cleared = updates.find((u) => u.rowNumber === 3)!;
    expect(kept.row[indexOf("title")]).toBe("成功した抽出結果");
    expect(kept.row[indexOf("extractionFailed")]).toBe("FALSE");
    expect(cleared.row.every((v) => v === "")).toBe(true);
  });

  test("両方とも成否が同じ場合はlastScannedAtが新しい方を採用する", async () => {
    const older = buildIndexRow({
      fileId: "f1",
      fileName: "a.mp3",
      parentId: "p",
      driveModifiedTime: "2026-08-01T00:00:00.000Z",
      lastScannedAtIso: "2026-08-01T00:00:00.000Z",
      tags: { title: "旧タイトル" },
      extractionFailed: false,
    });
    const newer = buildIndexRow({
      fileId: "f1",
      fileName: "a.mp3",
      parentId: "p",
      driveModifiedTime: "2026-08-20T00:00:00.000Z",
      lastScannedAtIso: "2026-08-20T00:00:00.000Z",
      tags: { title: "新タイトル" },
      extractionFailed: false,
    });
    const io = makeFakeIO([older, newer]);
    await mergeDuplicateIndexRows(io);
    const kept = io.updateCalls[0].find((u) => u.rowNumber === 2)!;
    expect(kept.row[indexOf("title")]).toBe("新タイトル");
  });

  test("_override列は値が入っている方を優先する（片方だけ手動補正済み）", async () => {
    const rowA = buildIndexRow({
      fileId: "f1",
      fileName: "a.mp3",
      parentId: "p",
      driveModifiedTime: "2026-08-01T00:00:00.000Z",
      lastScannedAtIso: "2026-08-01T00:00:00.000Z",
      tags: {},
      extractionFailed: false,
    });
    rowA[indexOf("title_override")] = "ユーザー補正";
    const rowB = buildIndexRow({
      fileId: "f1",
      fileName: "a.mp3",
      parentId: "p",
      driveModifiedTime: "2026-08-20T00:00:00.000Z",
      lastScannedAtIso: "2026-08-20T00:00:00.000Z",
      tags: {},
      extractionFailed: false,
    });
    const io = makeFakeIO([rowA, rowB]);
    await mergeDuplicateIndexRows(io);
    const kept = io.updateCalls[0].find((u) => u.rowNumber === 2)!;
    expect(kept.row[indexOf("title_override")]).toBe("ユーザー補正");
    expect(kept.row[indexOf("title_hasConflict")]).toBe("FALSE");
  });

  test("_override同士が異なる値で競合した場合、両方を保持しconflictCandidate/hasConflictを立てる", async () => {
    const rowA = buildIndexRow({
      fileId: "f1",
      fileName: "a.mp3",
      parentId: "p",
      driveModifiedTime: "2026-08-01T00:00:00.000Z",
      lastScannedAtIso: "2026-08-01T00:00:00.000Z",
      tags: {},
      extractionFailed: false,
    });
    rowA[indexOf("artist_override")] = "デバイスAの補正";
    const rowB = buildIndexRow({
      fileId: "f1",
      fileName: "a.mp3",
      parentId: "p",
      driveModifiedTime: "2026-08-20T00:00:00.000Z",
      lastScannedAtIso: "2026-08-20T00:00:00.000Z",
      tags: {},
      extractionFailed: false,
    });
    rowB[indexOf("artist_override")] = "デバイスBの補正";
    const io = makeFakeIO([rowA, rowB]);
    await mergeDuplicateIndexRows(io);
    const kept = io.updateCalls[0].find((u) => u.rowNumber === 2)!;
    expect(kept.row[indexOf("artist_hasConflict")]).toBe("TRUE");
    // 採用しなかった側の値がconflictCandidateに残る
    const candidateAndOverride = [kept.row[indexOf("artist_override")], kept.row[indexOf("artist_conflictCandidate")]];
    expect(candidateAndOverride).toContain("デバイスAの補正");
    expect(candidateAndOverride).toContain("デバイスBの補正");
  });

  test("同じ_override値なら競合とみなさない（両方とも同じ値を書いていた）", async () => {
    const rowA = buildIndexRow({
      fileId: "f1",
      fileName: "a.mp3",
      parentId: "p",
      driveModifiedTime: "2026-08-01T00:00:00.000Z",
      lastScannedAtIso: "2026-08-01T00:00:00.000Z",
      tags: {},
      extractionFailed: false,
    });
    rowA[indexOf("album_override")] = "同じ補正値";
    const rowB = buildIndexRow({
      fileId: "f1",
      fileName: "a.mp3",
      parentId: "p",
      driveModifiedTime: "2026-08-20T00:00:00.000Z",
      lastScannedAtIso: "2026-08-20T00:00:00.000Z",
      tags: {},
      extractionFailed: false,
    });
    rowB[indexOf("album_override")] = "同じ補正値";
    const io = makeFakeIO([rowA, rowB]);
    await mergeDuplicateIndexRows(io);
    const kept = io.updateCalls[0].find((u) => u.rowNumber === 2)!;
    expect(kept.row[indexOf("album_override")]).toBe("同じ補正値");
    expect(kept.row[indexOf("album_hasConflict")]).toBe("FALSE");
  });

  test("3行以上の重複も1行にマージし、残りは全列空欄化する", async () => {
    const rows = [
      buildIndexRow({
        fileId: "f1",
        fileName: "a.mp3",
        parentId: "p",
        driveModifiedTime: "2026-08-01T00:00:00.000Z",
        lastScannedAtIso: "2026-08-01T00:00:00.000Z",
        tags: { title: "1つ目" },
        extractionFailed: false,
      }),
      buildIndexRow({
        fileId: "f1",
        fileName: "a.mp3",
        parentId: "p",
        driveModifiedTime: "2026-08-10T00:00:00.000Z",
        lastScannedAtIso: "2026-08-10T00:00:00.000Z",
        tags: { title: "2つ目" },
        extractionFailed: false,
      }),
      buildIndexRow({
        fileId: "f1",
        fileName: "a.mp3",
        parentId: "p",
        driveModifiedTime: "2026-08-20T00:00:00.000Z",
        lastScannedAtIso: "2026-08-20T00:00:00.000Z",
        tags: { title: "3つ目（最新）" },
        extractionFailed: false,
      }),
    ];
    const io = makeFakeIO(rows);
    const result = await mergeDuplicateIndexRows(io);
    expect(result).toEqual({ mergedGroups: 1, rowsCleared: 2 });
    const updates = io.updateCalls[0];
    expect(updates).toHaveLength(3);
    const kept = updates.find((u) => u.rowNumber === 2)!;
    expect(kept.row[indexOf("title")]).toBe("3つ目（最新）");
    expect(updates.find((u) => u.rowNumber === 3)!.row.every((v) => v === "")).toBe(true);
    expect(updates.find((u) => u.rowNumber === 4)!.row.every((v) => v === "")).toBe(true);
  });

  test("異なるfileIdの重複グループが複数ある場合、それぞれ独立してマージする", async () => {
    const f1a = buildIndexRow({
      fileId: "f1",
      fileName: "a.mp3",
      parentId: "p",
      driveModifiedTime: "2026-08-01T00:00:00.000Z",
      lastScannedAtIso: "2026-08-01T00:00:00.000Z",
      tags: {},
      extractionFailed: false,
    });
    const f1b = buildIndexRow({
      fileId: "f1",
      fileName: "a.mp3",
      parentId: "p",
      driveModifiedTime: "2026-08-20T00:00:00.000Z",
      lastScannedAtIso: "2026-08-20T00:00:00.000Z",
      tags: {},
      extractionFailed: false,
    });
    const f2 = buildIndexRow({
      fileId: "f2",
      fileName: "b.mp3",
      parentId: "p",
      driveModifiedTime: "2026-08-01T00:00:00.000Z",
      lastScannedAtIso: "2026-08-01T00:00:00.000Z",
      tags: {},
      extractionFailed: false,
    });
    const f3a = buildIndexRow({
      fileId: "f3",
      fileName: "c.mp3",
      parentId: "p",
      driveModifiedTime: "2026-08-01T00:00:00.000Z",
      lastScannedAtIso: "2026-08-01T00:00:00.000Z",
      tags: {},
      extractionFailed: false,
    });
    const f3b = buildIndexRow({
      fileId: "f3",
      fileName: "c.mp3",
      parentId: "p",
      driveModifiedTime: "2026-08-20T00:00:00.000Z",
      lastScannedAtIso: "2026-08-20T00:00:00.000Z",
      tags: {},
      extractionFailed: false,
    });
    const io = makeFakeIO([f1a, f1b, f2, f3a, f3b]);
    const result = await mergeDuplicateIndexRows(io);
    expect(result).toEqual({ mergedGroups: 2, rowsCleared: 2 });
  });
});

describe("isValidIndexHeader", () => {
  test("INDEX_SHEET_HEADERと完全一致する場合はtrue", () => {
    expect(isValidIndexHeader([...INDEX_SHEET_HEADER])).toBe(true);
  });

  test("列が欠けている・列順が異なる場合はfalse", () => {
    expect(isValidIndexHeader(INDEX_SHEET_HEADER.slice(0, -1) as unknown as string[])).toBe(false);
    expect(isValidIndexHeader(["fileId", "parentId", "extension", ...INDEX_SHEET_HEADER.slice(3)])).toBe(false);
  });

  test("ヘッダー行が空（indexタブは存在するがヘッダー未作成）の場合はfalse", () => {
    expect(isValidIndexHeader([])).toBe(false);
  });
});

describe("isLegacyIndexHeaderV1", () => {
  test("2026-08-20の重複行マージ実装より前の旧27列ヘッダーと完全一致する場合はtrue", () => {
    expect(isLegacyIndexHeaderV1([...LEGACY_INDEX_SHEET_HEADER_V1])).toBe(true);
  });

  test("現行ヘッダーはfalse（旧ヘッダーではない）", () => {
    expect(isLegacyIndexHeaderV1([...INDEX_SHEET_HEADER])).toBe(false);
  });

  test("無関係なヘッダーはfalse", () => {
    expect(isLegacyIndexHeaderV1(["foo", "bar"])).toBe(false);
  });
});

describe("isLegacyIndexHeaderV2", () => {
  test("2026-08-21のscanRunId列追加より前の旧45列ヘッダーと完全一致する場合はtrue", () => {
    expect(isLegacyIndexHeaderV2([...LEGACY_INDEX_SHEET_HEADER_V2])).toBe(true);
  });

  test("現行ヘッダーはfalse（旧ヘッダーではない）", () => {
    expect(isLegacyIndexHeaderV2([...INDEX_SHEET_HEADER])).toBe(false);
  });

  test("旧27列ヘッダー（V1）はfalse（V1はmigrateLegacyIndexHeaderV1が別途扱う）", () => {
    expect(isLegacyIndexHeaderV2([...LEGACY_INDEX_SHEET_HEADER_V1])).toBe(false);
  });

  test("無関係なヘッダーはfalse", () => {
    expect(isLegacyIndexHeaderV2(["foo", "bar"])).toBe(false);
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

describe("createSheetsIndexIO", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  test("fetch()自体が例外を投げる一時的な通信断もリトライし、最終的に成功する（2026-08-20 Codexレビュー指摘）", async () => {
    vi.useFakeTimers();
    let call = 0;
    const fetchMock = vi.fn(async () => {
      call += 1;
      if (call === 1) throw new TypeError("Failed to fetch");
      return fakeResponse(200, { values: [["f1"]] });
    });
    vi.stubGlobal("fetch", fetchMock);

    const io = createSheetsIndexIO("sheet1", async () => "token");
    const promise = io.listExistingRows();
    await vi.runAllTimersAsync();
    const rows = await promise;
    expect(rows).toEqual([["f1"]]);
  });

  test("通信断がリトライ上限まで続いた場合は最後の例外をそのまま投げる", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    vi.stubGlobal("fetch", fetchMock);

    const io = createSheetsIndexIO("sheet1", async () => "token");
    const promise = io.listExistingRows();
    promise.catch(() => {}); // unhandled rejection警告を避ける（下のexpectで実際にawaitして検証する）
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toBeInstanceOf(TypeError);
  });

  test("readHeaderRowは1行目全体（列範囲を指定しない`1:1`記法）をそのまま返す", async () => {
    const fetchMock = vi.fn(async () => fakeResponse(200, { values: [[...INDEX_SHEET_HEADER]] }));
    vi.stubGlobal("fetch", fetchMock);

    const io = createSheetsIndexIO("sheet1", async () => "token");
    const header = await io.readHeaderRow();
    expect(header).toEqual([...INDEX_SHEET_HEADER]);
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    // 列範囲（A1:AS1等）を明示しない。旧27列のままのグリッド（マイグレーション前）に対して
    // 現行45列分の列範囲を指定すると「範囲がグリッドを超える」エラーになり、移行コールバックに
    // 到達する前に例外で落ちてしまう（2026-08-20 Codexレビュー指摘）。行全体を指す`1:1`記法は
    // 対象タブの実際のグリッド列数に自動的にクリップされるため、27列・45列どちらでも成功する。
    const decoded = decodeURIComponent(url);
    expect(decoded).toContain(`${INDEX_SHEET_NAME}'!1:1`);
    expect(decoded).not.toMatch(/![A-Z]+\d*:[A-Z]/);
  });

  test("readHeaderRowはヘッダー行が空の場合は空配列を返す（indexタブは存在するがヘッダー未作成のケース）", async () => {
    const fetchMock = vi.fn(async () => fakeResponse(200, { values: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const io = createSheetsIndexIO("sheet1", async () => "token");
    await expect(io.readHeaderRow()).resolves.toEqual([]);
  });

  test("GETリクエスト（listExistingRows）にはContent-Typeヘッダーを付けない（不要なCORSプリフライトを避ける）", async () => {
    const fetchMock = vi.fn(async () => fakeResponse(200, { values: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const io = createSheetsIndexIO("sheet1", async () => "token");
    await io.listExistingRows();

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
  });

  test("POSTリクエスト（appendRows）にはContent-Typeヘッダーを付ける", async () => {
    const fetchMock = vi.fn(async () => fakeResponse(200, {}));
    vi.stubGlobal("fetch", fetchMock);

    const io = createSheetsIndexIO("sheet1", async () => "token");
    await io.appendRows([["f1"]]);

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  test("appendRowsは通信例外が起きた場合リトライせず即座に例外を伝える（2026-08-20 Codexレビュー指摘：appendは非冪等なため）", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    vi.stubGlobal("fetch", fetchMock);

    const io = createSheetsIndexIO("sheet1", async () => "token");
    await expect(io.appendRows([["f1"]])).rejects.toBeInstanceOf(TypeError);
    expect(fetchMock).toHaveBeenCalledTimes(1); // リトライしていないことを確認
  });

  test("appendRowsは500等のHTTPエラー応答でもリトライせず即座に例外を伝える（2026-08-20 Codexレビュー指摘：通信例外だけでなくHTTPエラー経路もガードが必要だった）", async () => {
    const fetchMock = vi.fn(async () => fakeResponse(500, { error: { errors: [{ reason: "backendError" }] } }));
    vi.stubGlobal("fetch", fetchMock);

    const io = createSheetsIndexIO("sheet1", async () => "token");
    await expect(io.appendRows([["f1"]])).rejects.toThrow(/500/);
    expect(fetchMock).toHaveBeenCalledTimes(1); // リトライしていないことを確認
  });

  test("updateRowsは500等のHTTPエラー応答をリトライする（PUT/batchUpdateは冪等なため）", async () => {
    vi.useFakeTimers();
    let call = 0;
    const fetchMock = vi.fn(async () => {
      call += 1;
      if (call === 1) return fakeResponse(500, { error: { errors: [{ reason: "backendError" }] } });
      return fakeResponse(200, {});
    });
    vi.stubGlobal("fetch", fetchMock);

    const io = createSheetsIndexIO("sheet1", async () => "token");
    const promise = io.updateRows([{ rowNumber: 2, row: ["f1"] }]);
    await vi.runAllTimersAsync();
    await promise;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("removeIndexRows", () => {
  test("fileIdが空なら何もしない（APIを呼ばない）", async () => {
    const io = makeFakeIO([]);
    const result = await removeIndexRows(io, []);
    expect(result).toEqual({ removedCount: 0 });
    expect(io.updateCalls).toEqual([]);
  });

  test("指定したfileIdの行を空欄化する（Sheets APIに行削除のためのnumeric sheetIdを持たないため）", async () => {
    const rowF1 = buildIndexRow({
      fileId: "f1",
      fileName: "a.mp3",
      parentId: "p",
      driveModifiedTime: "2026-08-01T00:00:00.000Z",
      lastScannedAtIso: "2026-08-01T00:00:00.000Z",
      tags: {},
      extractionFailed: false,
    });
    const rowF2 = buildIndexRow({
      fileId: "f2",
      fileName: "b.mp3",
      parentId: "p",
      driveModifiedTime: "2026-08-01T00:00:00.000Z",
      lastScannedAtIso: "2026-08-01T00:00:00.000Z",
      tags: {},
      extractionFailed: false,
    });
    const io = makeFakeIO([rowF1, rowF2]);

    const result = await removeIndexRows(io, ["f1"]);
    expect(result).toEqual({ removedCount: 1 });
    expect(io.updateCalls).toEqual([[{ rowNumber: 2, row: new Array(INDEX_SHEET_HEADER.length).fill("") }]]);
  });

  test("存在しないfileIdを指定しても何もしない", async () => {
    const rowF1 = buildIndexRow({
      fileId: "f1",
      fileName: "a.mp3",
      parentId: "p",
      driveModifiedTime: "2026-08-01T00:00:00.000Z",
      lastScannedAtIso: "2026-08-01T00:00:00.000Z",
      tags: {},
      extractionFailed: false,
    });
    const io = makeFakeIO([rowF1]);
    const result = await removeIndexRows(io, ["nonexistent"]);
    expect(result).toEqual({ removedCount: 0 });
    expect(io.updateCalls).toEqual([]);
  });
});

describe("reconcileIndexAgainstRoot", () => {
  function rowFor(fileId: string, parentId: string): (string | number)[] {
    return buildIndexRow({
      fileId,
      fileName: `${fileId}.mp3`,
      parentId,
      driveModifiedTime: "2026-08-01T00:00:00.000Z",
      lastScannedAtIso: "2026-08-01T00:00:00.000Z",
      tags: {},
      extractionFailed: false,
    });
  }

  test("全行のparentIdがrootFolderId配下なら何もしない", async () => {
    const io = makeFakeIO([rowFor("f1", "root"), rowFor("f2", "sub1")]);
    const isFolderUnderRoot = vi.fn(async () => true);
    const result = await reconcileIndexAgainstRoot(io, isFolderUnderRoot);
    expect(result).toEqual({ removedCount: 0 });
    expect(io.updateCalls).toEqual([]);
  });

  test("rootFolderId配下でないparentIdを持つ行を空欄化する", async () => {
    const io = makeFakeIO([rowFor("f1", "root"), rowFor("f2", "oldRoot")]);
    const isFolderUnderRoot = vi.fn(async (parentId: string) => parentId === "root");
    const result = await reconcileIndexAgainstRoot(io, isFolderUnderRoot);
    expect(result).toEqual({ removedCount: 1 });
    expect(io.updateCalls).toEqual([[{ rowNumber: 3, row: new Array(INDEX_SHEET_HEADER.length).fill("") }]]);
  });

  test("distinctなparentIdごとに1回だけisFolderUnderRootを呼ぶ（同じフォルダ配下の複数行で重複確認しない）", async () => {
    const io = makeFakeIO([rowFor("f1", "sub1"), rowFor("f2", "sub1"), rowFor("f3", "sub1")]);
    const isFolderUnderRoot = vi.fn(async () => true);
    await reconcileIndexAgainstRoot(io, isFolderUnderRoot);
    expect(isFolderUnderRoot).toHaveBeenCalledTimes(1);
  });

  test("空欄行（fileIdが空）はスキップする", async () => {
    const blank = new Array(INDEX_SHEET_HEADER.length).fill("");
    const io = makeFakeIO([blank, rowFor("f1", "root")]);
    const isFolderUnderRoot = vi.fn(async () => true);
    await reconcileIndexAgainstRoot(io, isFolderUnderRoot);
    expect(isFolderUnderRoot).toHaveBeenCalledTimes(1);
    expect(isFolderUnderRoot).toHaveBeenCalledWith("root");
  });

  test("空欄化対象が200件を超える場合は複数回のupdateRowsに分割する（2026-08-21 Codexレビュー指摘：P2。ルート変更直後は索引のほぼ全行が対象になりうるため、1回の大規模batchUpdateでリクエストサイズ・処理時間上限に抵触しないようにする）", async () => {
    const rows = Array.from({ length: 250 }, (_, i) => rowFor(`f${i}`, "oldRoot"));
    const io = makeFakeIO(rows);
    const isFolderUnderRoot = vi.fn(async () => false);
    const result = await reconcileIndexAgainstRoot(io, isFolderUnderRoot);
    expect(result).toEqual({ removedCount: 250 });
    expect(io.updateCalls).toHaveLength(2);
    expect(io.updateCalls[0]).toHaveLength(200);
    expect(io.updateCalls[1]).toHaveLength(50);
  });
});
