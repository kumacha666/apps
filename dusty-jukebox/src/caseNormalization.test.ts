import { describe, expect, it, vi } from "vitest";
import { INDEX_SHEET_HEADER } from "./sheets";
import {
  applyCasingWritesInChunks,
  buildCasingRevertUpdates,
  buildCasingRowUpdates,
  casingGroupKey,
  findCasingVariants,
  planCasingNormalization,
  revertCasingWritesInChunks,
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
  it("targets only the override cell of the affected row, not the whole row", () => {
    const currentRows = [makeRow({ fileId: "2", artist: "akb48" })];
    const { cellUpdates, applied, skippedStaleCount } = buildCasingRowUpdates(
      [{ field: "artist", fileId: "2", value: "AKB48", expectedSourceValue: "akb48" }],
      currentRows
    );
    expect(skippedStaleCount).toBe(0);
    expect(applied).toEqual([{ field: "artist", fileId: "2", value: "AKB48", expectedSourceValue: "akb48", rowNumber: 2 }]);
    expect(cellUpdates).toEqual([{ rowNumber: 2, columnIndex: INDEX_SHEET_HEADER.indexOf("artist_override"), value: "AKB48" }]);
  });

  it("produces one cell update per field, even for the same row", () => {
    const currentRows = [makeRow({ fileId: "2", artist: "akb48", composer: "freddie" })];
    const { cellUpdates } = buildCasingRowUpdates(
      [
        { field: "artist", fileId: "2", value: "AKB48", expectedSourceValue: "akb48" },
        { field: "composer", fileId: "2", value: "Freddie", expectedSourceValue: "freddie" },
      ],
      currentRows
    );
    expect(cellUpdates.sort((a, b) => a.columnIndex - b.columnIndex)).toEqual(
      [
        { rowNumber: 2, columnIndex: INDEX_SHEET_HEADER.indexOf("artist_override"), value: "AKB48" },
        { rowNumber: 2, columnIndex: INDEX_SHEET_HEADER.indexOf("composer_override"), value: "Freddie" },
      ].sort((a, b) => a.columnIndex - b.columnIndex)
    );
  });

  it("skips a write when the row is gone or someone else already set an override in the meantime", () => {
    const currentRows = [makeRow({ fileId: "2", artist: "akb48", artist_override: "AKB48" })];
    const { cellUpdates, applied, skippedStaleCount } = buildCasingRowUpdates(
      [
        { field: "artist", fileId: "2", value: "AKB48", expectedSourceValue: "akb48" },
        { field: "artist", fileId: "gone", value: "AKB48", expectedSourceValue: "akb48" },
      ],
      currentRows
    );
    expect(cellUpdates).toHaveLength(0);
    expect(applied).toHaveLength(0);
    expect(skippedStaleCount).toBe(2);
  });

  it("skips a write when the source field itself changed since the check (ChatGPT review P1)", () => {
    // チェック時は"akb48"だったが、適用直前に別デバイスが元のartistを"AC/DC"へ書き換えていた。
    const currentRows = [makeRow({ fileId: "2", artist: "AC/DC" })];
    const { cellUpdates, applied, skippedStaleCount } = buildCasingRowUpdates(
      [{ field: "artist", fileId: "2", value: "AKB48", expectedSourceValue: "akb48" }],
      currentRows
    );
    expect(cellUpdates).toHaveLength(0);
    expect(applied).toHaveLength(0);
    expect(skippedStaleCount).toBe(1);
  });
});

describe("buildCasingRevertUpdates", () => {
  it("clears the override written by this tool back to blank, targeting only that cell", () => {
    const currentRows = [makeRow({ fileId: "2", artist: "akb48", artist_override: "AKB48" })];
    const applied = [{ field: "artist" as const, fileId: "2", value: "AKB48", expectedSourceValue: "akb48", rowNumber: 2 }];
    const { cellUpdates, revertedEntries, staleEntries, revertedCount, skippedStaleCount } = buildCasingRevertUpdates(applied, currentRows);
    expect(revertedCount).toBe(1);
    expect(revertedEntries).toEqual(applied);
    expect(staleEntries).toHaveLength(0);
    expect(skippedStaleCount).toBe(0);
    expect(cellUpdates).toEqual([{ rowNumber: 2, columnIndex: INDEX_SHEET_HEADER.indexOf("artist_override"), value: "" }]);
  });

  it("does not revert if the override has since changed to something else, and reports it as permanently stale", () => {
    const currentRows = [makeRow({ fileId: "2", artist: "akb48", artist_override: "Something Else" })];
    const applied = [{ field: "artist" as const, fileId: "2", value: "AKB48", expectedSourceValue: "akb48", rowNumber: 2 }];
    const { cellUpdates, revertedEntries, staleEntries, revertedCount, skippedStaleCount } = buildCasingRevertUpdates(applied, currentRows);
    expect(cellUpdates).toHaveLength(0);
    expect(revertedEntries).toHaveLength(0);
    expect(staleEntries).toEqual(applied);
    expect(revertedCount).toBe(0);
    expect(skippedStaleCount).toBe(1);
  });

  it("skips revert if the row no longer exists, and reports it as permanently stale", () => {
    const applied = [{ field: "artist" as const, fileId: "gone", value: "AKB48", expectedSourceValue: "akb48", rowNumber: 2 }];
    const { staleEntries, revertedCount, skippedStaleCount } = buildCasingRevertUpdates(applied, []);
    expect(staleEntries).toEqual(applied);
    expect(revertedCount).toBe(0);
    expect(skippedStaleCount).toBe(1);
  });
});

describe("applyCasingWritesInChunks", () => {
  it("re-reads the index immediately before each chunk, so a later chunk sees changes made after an earlier chunk was written (ChatGPT re-review P1)", async () => {
    // 1件目のチャンク書き込み後、外部（別デバイス想定）が2件目の対象行のartistを書き換える。
    // 各チャンク直前に読み直していれば、2件目のチャンクはその新しい値を見てstale判定できる。
    const rows: Row[] = [makeRow({ fileId: "1", artist: "akb48" }), makeRow({ fileId: "2", artist: "akb48" })];
    const writes = [
      { field: "artist" as const, fileId: "1", value: "AKB48", expectedSourceValue: "akb48" },
      { field: "artist" as const, fileId: "2", value: "AKB48", expectedSourceValue: "akb48" },
    ];
    const io = {
      listExistingRows: vi.fn(async () => rows.map((r) => [...r])),
      updateCells: vi.fn(async (updates: { rowNumber: number; columnIndex: number; value: string }[]) => {
        for (const { rowNumber, columnIndex, value } of updates) rows[rowNumber - 2][columnIndex] = value;
        // 1件目のチャンクが書き込まれた直後、外部が2件目の行のartistを書き換えたことを模擬する。
        if (updates[0]?.rowNumber === 2) rows[1][INDEX_SHEET_HEADER.indexOf("artist")] = "AC/DC";
      }),
    };
    const results: { chunkApplied: { fileId: string }[]; chunkSkippedStaleCount: number }[] = [];
    await applyCasingWritesInChunks(io, writes, (result) => results.push(result), 1);
    expect(results[0].chunkApplied.map((e) => e.fileId)).toEqual(["1"]);
    expect(results[1].chunkApplied).toHaveLength(0);
    expect(results[1].chunkSkippedStaleCount).toBe(1);
    // 2件目のfileIdの行は、後から書き換えられた"AC/DC"のまま（古いスナップショットで巻き戻されていない）。
    expect(rows[1][INDEX_SHEET_HEADER.indexOf("artist")]).toBe("AC/DC");
  });

  it("only ever touches the override column, never other columns of the row (ChatGPT re-review #3 P1)", async () => {
    const row = makeRow({ fileId: "1", artist: "akb48", title: "元のタイトル" });
    const io = {
      listExistingRows: vi.fn(async () => [[...row]]),
      updateCells: vi.fn(async (_updates: { rowNumber: number; columnIndex: number; value: string }[]) => {}),
    };
    await applyCasingWritesInChunks(
      io,
      [{ field: "artist", fileId: "1", value: "AKB48", expectedSourceValue: "akb48" }],
      () => {}
    );
    const [updates] = io.updateCells.mock.calls[0];
    expect(updates).toEqual([{ rowNumber: 2, columnIndex: INDEX_SHEET_HEADER.indexOf("artist_override"), value: "AKB48" }]);
  });
});

describe("revertCasingWritesInChunks", () => {
  it("notifies chunkReverted/chunkStale per chunk after re-reading the index immediately before writing it", async () => {
    const rows: Row[] = [
      makeRow({ fileId: "1", artist: "akb48", artist_override: "AKB48" }),
      makeRow({ fileId: "2", artist: "akb48", artist_override: "AKB48" }),
    ];
    const applied = [
      { field: "artist" as const, fileId: "1", value: "AKB48", expectedSourceValue: "akb48", rowNumber: 2 },
      { field: "artist" as const, fileId: "2", value: "AKB48", expectedSourceValue: "akb48", rowNumber: 3 },
    ];
    const io = {
      listExistingRows: vi.fn(async () => rows.map((r) => [...r])),
      updateCells: vi.fn(async (updates: { rowNumber: number; columnIndex: number; value: string }[]) => {
        for (const { rowNumber, columnIndex, value } of updates) rows[rowNumber - 2][columnIndex] = value;
        // 1件目を元に戻した直後、別のユーザーが2件目のoverrideを手動で別の値へ変更したことを模擬する。
        if (updates[0]?.rowNumber === 2) rows[1][INDEX_SHEET_HEADER.indexOf("artist_override")] = "Manual Fix";
      }),
    };
    const results: { chunkReverted: { fileId: string }[]; chunkStale: { fileId: string }[] }[] = [];
    await revertCasingWritesInChunks(io, applied, (result) => results.push(result), 1);
    expect(results[0].chunkReverted.map((e) => e.fileId)).toEqual(["1"]);
    expect(results[1].chunkReverted).toHaveLength(0);
    expect(results[1].chunkStale.map((e) => e.fileId)).toEqual(["2"]);
    // 2件目のoverrideは手動修正のまま消されていない。
    expect(rows[1][INDEX_SHEET_HEADER.indexOf("artist_override")]).toBe("Manual Fix");
  });

  it("reports a stale entry even when another entry's write in the same chunk fails (ChatGPT re-review #3 P2)", async () => {
    // 1件目=手動変更されておりstale、2件目=revert可能。同一チャンク内でwriteが失敗しても、
    // 1件目のstale通知は失われてはならない。
    const rows: Row[] = [
      makeRow({ fileId: "1", artist: "akb48", artist_override: "Manual Fix" }),
      makeRow({ fileId: "2", artist: "akb48", artist_override: "AKB48" }),
    ];
    const applied = [
      { field: "artist" as const, fileId: "1", value: "AKB48", expectedSourceValue: "akb48", rowNumber: 2 },
      { field: "artist" as const, fileId: "2", value: "AKB48", expectedSourceValue: "akb48", rowNumber: 3 },
    ];
    const io = {
      listExistingRows: vi.fn(async () => rows.map((r) => [...r])),
      updateCells: vi.fn(async () => { throw new Error("network error"); }),
    };
    const results: { chunkReverted: { fileId: string }[]; chunkStale: { fileId: string }[] }[] = [];
    await expect(
      revertCasingWritesInChunks(io, applied, (result) => results.push(result))
    ).rejects.toThrow("network error");
    // updateCellsが失敗しても、staleと判定済みの1件目は通知されているはず。
    expect(results).toEqual([{ chunkReverted: [], chunkStale: [applied[0]] }]);
  });
});
