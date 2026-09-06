import { describe, expect, it, vi } from "vitest";
import { INDEX_SHEET_HEADER } from "./sheets";
import {
  buildCasingRevertUpdates,
  buildCasingRowUpdates,
  casingGroupKey,
  findCasingVariants,
  planCasingNormalization,
  writeCasingUpdatesInBatches,
} from "./caseNormalization";

type Row = (string | number)[];

function makeRow(overrides: Partial<Record<(typeof INDEX_SHEET_HEADER)[number], string>>): Row {
  const row = new Array(INDEX_SHEET_HEADER.length).fill("");
  for (const [key, value] of Object.entries(overrides)) {
    row[INDEX_SHEET_HEADER.indexOf(key as (typeof INDEX_SHEET_HEADER)[number])] = value;
  }
  return row;
}

describe("findCasingVariants", () => {
  it("groups case-insensitive matches and picks the majority as suggestedCanonical", () => {
    const rows = [
      makeRow({ fileId: "1", artist: "AKB48" }),
      makeRow({ fileId: "2", artist: "akb48" }),
      makeRow({ fileId: "3", artist: "AKB48" }),
    ];
    const groups = findCasingVariants(rows, ["artist"]);
    expect(groups).toHaveLength(1);
    expect(groups[0].field).toBe("artist");
    expect(groups[0].suggestedCanonical).toBe("AKB48");
    expect(groups[0].variants).toEqual([
      { value: "AKB48", fileIds: ["1", "3"] },
      { value: "akb48", fileIds: ["2"] },
    ]);
  });

  it("does not create a group when only one casing exists", () => {
    const rows = [makeRow({ fileId: "1", artist: "Queen" }), makeRow({ fileId: "2", artist: "Queen" })];
    expect(findCasingVariants(rows, ["artist"])).toHaveLength(0);
  });

  it("ties are broken alphabetically for determinism", () => {
    const rows = [makeRow({ fileId: "1", artist: "queen" }), makeRow({ fileId: "2", artist: "Queen" })];
    const groups = findCasingVariants(rows, ["artist"]);
    expect(groups[0].variants.map((v) => v.value)).toEqual(["Queen", "queen"]);
    expect(groups[0].suggestedCanonical).toBe("Queen");
  });

  it("excludes rows that already have an override for the field, including the (none) sentinel", () => {
    const rows = [
      makeRow({ fileId: "1", artist: "AKB48" }),
      makeRow({ fileId: "2", artist: "akb48", artist_override: "AKB48" }),
      makeRow({ fileId: "3", artist: "akb48", artist_override: "(none)" }),
      makeRow({ fileId: "4", artist: "akb48" }),
    ];
    const groups = findCasingVariants(rows, ["artist"]);
    expect(groups).toHaveLength(1);
    const fileIds = groups[0].variants.flatMap((v) => v.fileIds).sort();
    expect(fileIds).toEqual(["1", "4"]);
  });

  it("ignores blank values and treats fields independently", () => {
    const rows = [
      makeRow({ fileId: "1", artist: "Queen", composer: "Freddie" }),
      makeRow({ fileId: "2", artist: "queen", composer: "" }),
      makeRow({ fileId: "3", composer: "freddie" }),
    ];
    const groups = findCasingVariants(rows, ["artist", "composer"]);
    expect(groups.map((g) => g.field).sort()).toEqual(["artist", "composer"]);
  });
});

describe("planCasingNormalization", () => {
  it("plans writes only for rows not already matching the canonical value, keeping the expected source value", () => {
    const rows = [
      makeRow({ fileId: "1", artist: "AKB48" }),
      makeRow({ fileId: "2", artist: "akb48" }),
      makeRow({ fileId: "3", artist: "AKB48" }),
    ];
    const groups = findCasingVariants(rows, ["artist"]);
    const writes = planCasingNormalization(groups);
    expect(writes).toEqual([{ field: "artist", fileId: "2", value: "AKB48", expectedSourceValue: "akb48" }]);
  });

  it("honors a user-chosen canonical override for a specific group", () => {
    const rows = [
      makeRow({ fileId: "1", artist: "AKB48" }),
      makeRow({ fileId: "2", artist: "akb48" }),
      makeRow({ fileId: "3", artist: "AKB48" }),
    ];
    const groups = findCasingVariants(rows, ["artist"]);
    const canonicalByGroupKey = new Map([[casingGroupKey(groups[0]), "akb48"]]);
    const writes = planCasingNormalization(groups, canonicalByGroupKey);
    expect(writes.sort((a, b) => a.fileId.localeCompare(b.fileId))).toEqual([
      { field: "artist", fileId: "1", value: "akb48", expectedSourceValue: "AKB48" },
      { field: "artist", fileId: "3", value: "akb48", expectedSourceValue: "AKB48" },
    ]);
  });
});

describe("buildCasingRowUpdates", () => {
  it("writes the canonical value into the override column of the affected row", () => {
    const currentRows = [makeRow({ fileId: "2", artist: "akb48" })];
    const { updates, applied, skippedStaleCount } = buildCasingRowUpdates(
      [{ field: "artist", fileId: "2", value: "AKB48", expectedSourceValue: "akb48" }],
      currentRows
    );
    expect(skippedStaleCount).toBe(0);
    expect(applied).toEqual([{ field: "artist", fileId: "2", value: "AKB48", expectedSourceValue: "akb48", rowNumber: 2 }]);
    expect(updates).toHaveLength(1);
    expect(updates[0].rowNumber).toBe(2);
    expect(updates[0].row[INDEX_SHEET_HEADER.indexOf("artist_override")]).toBe("AKB48");
    // 元の行の他の列は破壊しない
    expect(updates[0].row[INDEX_SHEET_HEADER.indexOf("artist")]).toBe("akb48");
  });

  it("merges multiple field writes for the same row into a single update", () => {
    const currentRows = [makeRow({ fileId: "2", artist: "akb48", composer: "freddie" })];
    const { updates } = buildCasingRowUpdates(
      [
        { field: "artist", fileId: "2", value: "AKB48", expectedSourceValue: "akb48" },
        { field: "composer", fileId: "2", value: "Freddie", expectedSourceValue: "freddie" },
      ],
      currentRows
    );
    expect(updates).toHaveLength(1);
    expect(updates[0].row[INDEX_SHEET_HEADER.indexOf("artist_override")]).toBe("AKB48");
    expect(updates[0].row[INDEX_SHEET_HEADER.indexOf("composer_override")]).toBe("Freddie");
  });

  it("skips a write when the row is gone or someone else already set an override in the meantime", () => {
    const currentRows = [makeRow({ fileId: "2", artist: "akb48", artist_override: "AKB48" })];
    const { updates, applied, skippedStaleCount } = buildCasingRowUpdates(
      [
        { field: "artist", fileId: "2", value: "AKB48", expectedSourceValue: "akb48" },
        { field: "artist", fileId: "gone", value: "AKB48", expectedSourceValue: "akb48" },
      ],
      currentRows
    );
    expect(updates).toHaveLength(0);
    expect(applied).toHaveLength(0);
    expect(skippedStaleCount).toBe(2);
  });

  it("skips a write when the source field itself changed since the check (ChatGPT review P1)", () => {
    // チェック時は"akb48"だったが、適用直前に別デバイスが元のartistを"AC/DC"へ書き換えていた。
    const currentRows = [makeRow({ fileId: "2", artist: "AC/DC" })];
    const { updates, applied, skippedStaleCount } = buildCasingRowUpdates(
      [{ field: "artist", fileId: "2", value: "AKB48", expectedSourceValue: "akb48" }],
      currentRows
    );
    expect(updates).toHaveLength(0);
    expect(applied).toHaveLength(0);
    expect(skippedStaleCount).toBe(1);
  });
});

describe("buildCasingRevertUpdates", () => {
  it("clears the override written by this tool back to blank", () => {
    const currentRows = [makeRow({ fileId: "2", artist: "akb48", artist_override: "AKB48" })];
    const applied = [{ field: "artist" as const, fileId: "2", value: "AKB48", expectedSourceValue: "akb48", rowNumber: 2 }];
    const { updates, revertedEntries, revertedCount, skippedStaleCount } = buildCasingRevertUpdates(applied, currentRows);
    expect(revertedCount).toBe(1);
    expect(revertedEntries).toEqual(applied);
    expect(skippedStaleCount).toBe(0);
    expect(updates[0].row[INDEX_SHEET_HEADER.indexOf("artist_override")]).toBe("");
  });

  it("does not revert if the override has since changed to something else", () => {
    const currentRows = [makeRow({ fileId: "2", artist: "akb48", artist_override: "Something Else" })];
    const applied = [{ field: "artist" as const, fileId: "2", value: "AKB48", expectedSourceValue: "akb48", rowNumber: 2 }];
    const { updates, revertedEntries, revertedCount, skippedStaleCount } = buildCasingRevertUpdates(applied, currentRows);
    expect(updates).toHaveLength(0);
    expect(revertedEntries).toHaveLength(0);
    expect(revertedCount).toBe(0);
    expect(skippedStaleCount).toBe(1);
  });

  it("skips revert if the row no longer exists", () => {
    const applied = [{ field: "artist" as const, fileId: "gone", value: "AKB48", expectedSourceValue: "akb48", rowNumber: 2 }];
    const { revertedCount, skippedStaleCount } = buildCasingRevertUpdates(applied, []);
    expect(revertedCount).toBe(0);
    expect(skippedStaleCount).toBe(1);
  });
});

describe("writeCasingUpdatesInBatches", () => {
  it("notifies each batch's entries as that batch is written, grouped by rowNumber", async () => {
    const updates = [
      { rowNumber: 2, row: ["r2"] as (string | number)[] },
      { rowNumber: 3, row: ["r3"] as (string | number)[] },
    ];
    const entries = [
      { rowNumber: 2, fileId: "a" },
      { rowNumber: 3, fileId: "b" },
      { rowNumber: 3, fileId: "c" },
    ];
    const writtenBatches: { rowNumber: number; row: (string | number)[] }[][] = [];
    const io = { updateRows: vi.fn(async (batch: typeof updates) => { writtenBatches.push(batch); }) };
    const notified: { rowNumber: number; fileId: string }[][] = [];
    await writeCasingUpdatesInBatches(io, updates, entries, (batchEntries) => notified.push(batchEntries), 1);
    expect(writtenBatches).toHaveLength(2);
    expect(notified).toEqual([[{ rowNumber: 2, fileId: "a" }], [{ rowNumber: 3, fileId: "b" }, { rowNumber: 3, fileId: "c" }]]);
  });

  it("preserves the notifications from batches written before a later batch throws", async () => {
    const updates = [
      { rowNumber: 2, row: ["r2"] as (string | number)[] },
      { rowNumber: 3, row: ["r3"] as (string | number)[] },
    ];
    const entries = [
      { rowNumber: 2, fileId: "a" },
      { rowNumber: 3, fileId: "b" },
    ];
    let callCount = 0;
    const io = {
      updateRows: vi.fn(async () => {
        callCount++;
        if (callCount === 2) throw new Error("boom");
      }),
    };
    const notified: { rowNumber: number; fileId: string }[][] = [];
    await expect(
      writeCasingUpdatesInBatches(io, updates, entries, (batchEntries) => notified.push(batchEntries), 1)
    ).rejects.toThrow("boom");
    // 1件目のバッチ分は例外発生前に既に通知済みのはず。
    expect(notified).toEqual([[{ rowNumber: 2, fileId: "a" }]]);
  });
});
