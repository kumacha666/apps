import { describe, expect, it, vi } from "vitest";
import { INDEX_SHEET_HEADER } from "./sheets";
import {
  applyGenreWritesInChunks,
  buildGenreRevertUpdates,
  buildGenreRowUpdates,
  findGenreCasingVariants,
  genreGroupKey,
  planGenreNormalization,
  revertGenreWritesInChunks,
  type AppliedGenreWrite,
} from "./genreNormalization";

type Row = (string | number)[];

function makeRow(values: Partial<Record<(typeof INDEX_SHEET_HEADER)[number], string>>): Row {
  const row = new Array(INDEX_SHEET_HEADER.length).fill("");
  for (const [key, value] of Object.entries(values)) row[INDEX_SHEET_HEADER.indexOf(key as never)] = value;
  return row;
}

describe("findGenreCasingVariants", () => {
  it("splits genres into trimmed tokens and groups case variants by song count", () => {
    const groups = findGenreCasingVariants([
      makeRow({ fileId: "1", genre: "rock / Jazz" }),
      makeRow({ fileId: "2", genre: "Rock / jazz" }),
      makeRow({ fileId: "3", genre: "Rock" }),
    ]);
    expect(groups.map((group) => [group.normalizedKey, group.suggestedCanonical])).toEqual([
      ["rock", "Rock"],
      ["jazz", "Jazz"],
    ]);
    expect(groups[0].variants.map((variant) => [variant.value, variant.fileIds])).toEqual([
      ["Rock", ["2", "3"]],
      ["rock", ["1"]],
    ]);
  });

  it("excludes songs with any genre override, including (none)", () => {
    const groups = findGenreCasingVariants([
      makeRow({ fileId: "1", genre: "rock" }),
      makeRow({ fileId: "2", genre: "Rock" }),
      makeRow({ fileId: "3", genre: "ROCK", genre_override: "Rock" }),
      makeRow({ fileId: "4", genre: "ROCK", genre_override: "(none)" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].variants.flatMap((variant) => variant.fileIds).sort()).toEqual(["1", "2"]);
  });

  it("does not group a token when only one casing exists", () => {
    expect(findGenreCasingVariants([makeRow({ fileId: "1", genre: "Rock / Jazz" })])).toHaveLength(0);
  });
});

describe("planGenreNormalization", () => {
  it("creates one write per song with every affected token normalized", () => {
    const groups = findGenreCasingVariants([
      makeRow({ fileId: "1", genre: "rock / Jazz" }),
      makeRow({ fileId: "2", genre: "Rock / jazz" }),
    ]);
    const canonical = new Map(groups.map((group) => [genreGroupKey(group), group.normalizedKey === "rock" ? "Rock" : "Jazz"]));
    expect(planGenreNormalization(groups, canonical)).toEqual([
      { fileId: "1", value: "Rock / Jazz", expectedSourceGenre: "rock / Jazz" },
      { fileId: "2", value: "Rock / Jazz", expectedSourceGenre: "Rock / jazz" },
    ]);
  });

  it("preserves unaffected tokens and their order", () => {
    const groups = findGenreCasingVariants([
      makeRow({ fileId: "1", genre: "rock / jazz / pop" }),
      makeRow({ fileId: "2", genre: "Rock / jazz / Classical" }),
    ]);
    expect(planGenreNormalization(groups)).toEqual([
      { fileId: "1", value: "Rock / jazz / pop", expectedSourceGenre: "rock / jazz / pop" },
    ]);
  });
});

describe("genre writes and reverts", () => {
  it("updates only genre_override and skips a changed source genre", () => {
    const write = { fileId: "1", value: "Rock / Jazz", expectedSourceGenre: "rock / jazz" };
    const fresh = buildGenreRowUpdates([write], [makeRow({ fileId: "1", genre: "rock / jazz" })]);
    expect(fresh.cellUpdates).toEqual([{ rowNumber: 2, columnIndex: INDEX_SHEET_HEADER.indexOf("genre_override"), value: "Rock / Jazz" }]);
    expect(buildGenreRowUpdates([write], [makeRow({ fileId: "1", genre: "Metal" })]).skippedStaleCount).toBe(1);
  });

  it("skips a missing song or a genre override added after the check", () => {
    const writes = [
      { fileId: "gone", value: "Rock", expectedSourceGenre: "rock" },
      { fileId: "1", value: "Rock", expectedSourceGenre: "rock" },
    ];
    const result = buildGenreRowUpdates(writes, [makeRow({ fileId: "1", genre: "rock", genre_override: "Manual" })]);
    expect(result.cellUpdates).toHaveLength(0);
    expect(result.skippedStaleCount).toBe(2);
  });

  it("reverts an unchanged tool value and permanently skips a later edit", () => {
    const applied = [{ fileId: "1", value: "Rock / Jazz", expectedSourceGenre: "rock / jazz", rowNumber: 2 }];
    const fresh = buildGenreRevertUpdates(applied, [makeRow({ fileId: "1", genre_override: "Rock / Jazz" })]);
    expect(fresh.cellUpdates[0].value).toBe("");
    const stale = buildGenreRevertUpdates(applied, [makeRow({ fileId: "1", genre_override: "Other" })]);
    expect(stale.staleEntries).toEqual(applied);
    expect(stale.cellUpdates).toHaveLength(0);
  });

  it("re-reads before each apply and revert chunk", async () => {
    const rows = [makeRow({ fileId: "1", genre: "rock", genre_override: "" })];
    const io = {
      listExistingRows: vi.fn(async () => rows.map((row) => [...row])),
      updateCells: vi.fn(async (updates: { rowNumber: number; columnIndex: number; value: string }[]) => {
        for (const update of updates) rows[update.rowNumber - 2][update.columnIndex] = update.value;
      }),
    };
    const applied: AppliedGenreWrite[] = [];
    await applyGenreWritesInChunks(io, [{ fileId: "1", value: "Rock", expectedSourceGenre: "rock" }], (result) => applied.push(...result.chunkApplied), 1);
    expect(io.listExistingRows).toHaveBeenCalledTimes(1);
    await revertGenreWritesInChunks(io, applied, () => {}, 1);
    expect(io.listExistingRows).toHaveBeenCalledTimes(2);
    expect(rows[0][INDEX_SHEET_HEADER.indexOf("genre_override")]).toBe("");
  });
});
