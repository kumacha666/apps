import { describe, expect, test } from "vitest";
import { buildIndexRow, INDEX_SHEET_HEADER, upsertIndexRows, type SheetsIndexIO } from "./sheets";

function makeFakeIO(initialFileIds: string[]): SheetsIndexIO & { updated: { rowNumber: number; row: (string | number)[] }[]; appended: (string | number)[][] } {
  const updated: { rowNumber: number; row: (string | number)[] }[] = [];
  const appended: (string | number)[][] = [];
  return {
    updated,
    appended,
    async listFileIds() {
      return initialFileIds;
    },
    async updateRow(rowNumber, row) {
      updated.push({ rowNumber, row });
    },
    async appendRows(rows) {
      appended.push(...rows);
    },
  };
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
    const io = makeFakeIO(["f1", "f2"]);
    await upsertIndexRows(io, [
      { fileId: "f1", row: ["f1", "row-for-f1-updated"] },
      { fileId: "f3", row: ["f3", "row-for-f3-new"] },
    ]);
    expect(io.updated).toEqual([{ rowNumber: 2, row: ["f1", "row-for-f1-updated"] }]);
    expect(io.appended).toEqual([["f3", "row-for-f3-new"]]);
  });

  test("空の入力は何もしない（listFileIdsすら呼ばない）", async () => {
    let listCalled = false;
    const io: SheetsIndexIO = {
      async listFileIds() {
        listCalled = true;
        return [];
      },
      async updateRow() {},
      async appendRows() {},
    };
    await upsertIndexRows(io, []);
    expect(listCalled).toBe(false);
  });

  test("既存fileIdが1件も無い場合は全件追記になる（初回スキャン相当）", async () => {
    const io = makeFakeIO([]);
    await upsertIndexRows(io, [
      { fileId: "f1", row: ["f1", "a"] },
      { fileId: "f2", row: ["f2", "b"] },
    ]);
    expect(io.updated).toEqual([]);
    expect(io.appended).toEqual([
      ["f1", "a"],
      ["f2", "b"],
    ]);
  });
});
