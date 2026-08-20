import { describe, expect, test } from "vitest";
import { buildIndexRow, INDEX_SHEET_HEADER, upsertIndexRows, type SheetsIndexIO } from "./sheets";

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
});
