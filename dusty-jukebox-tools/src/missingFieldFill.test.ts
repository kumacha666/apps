import { describe, expect, it, vi } from "vitest";
import { INDEX_SHEET_HEADER } from "./sheets";
import {
  applyMissingFieldWritesInChunks,
  buildMissingFieldRevertUpdates,
  buildMissingFieldRowUpdates,
  findMissingFieldEntries,
  revertMissingFieldWritesInChunks,
} from "./missingFieldFill";

type Row = (string | number)[];

function makeRow(overrides: Partial<Record<(typeof INDEX_SHEET_HEADER)[number], string>>): Row {
  const row = new Array(INDEX_SHEET_HEADER.length).fill("");
  for (const [key, value] of Object.entries(overrides)) {
    row[INDEX_SHEET_HEADER.indexOf(key as (typeof INDEX_SHEET_HEADER)[number])] = value;
  }
  return row;
}

describe("findMissingFieldEntries", () => {
  it("lists title/artist/album entries whose effective value is empty, with context and the raw override value", () => {
    const rows = [makeRow({ fileId: "1", title: "Song" })];
    const entries = findMissingFieldEntries(rows);
    expect(entries.map((e) => e.field).sort()).toEqual(["album", "artist"]);
    expect(entries[0].context).toEqual({ title: "Song", artist: "", album: "" });
    expect(entries[0].originalOverrideValue).toBe("");
  });

  it("treats a field covered by an override (including the (none) sentinel) as not missing/still missing correctly", () => {
    const rows = [
      makeRow({ fileId: "1", title: "Song", artist_override: "手動入力", album: "Album" }),
      makeRow({ fileId: "2", title: "Song2", artist: "X", album_override: "(none)" }),
    ];
    const entries = findMissingFieldEntries(rows);
    // fileId1: artist is covered by override -> not missing. album has a value -> not missing.
    // fileId2: album_override="(none)" means explicitly empty -> still missing, and the raw
    // "(none)" value must be captured (ChatGPT review P1: needed to restore it correctly later).
    expect(entries).toHaveLength(1);
    expect(entries[0].fileId).toBe("2");
    expect(entries[0].field).toBe("album");
    expect(entries[0].originalOverrideValue).toBe("(none)");
  });

  it("does not include genre (no override column, out of scope for this feature)", () => {
    const rows = [makeRow({ fileId: "1", title: "Song", artist: "X", album: "Y" })];
    expect(findMissingFieldEntries(rows)).toHaveLength(0);
  });

  it("skips rows without a fileId", () => {
    const rows = [makeRow({ title: "Song" })];
    expect(findMissingFieldEntries(rows)).toHaveLength(0);
  });
});

describe("buildMissingFieldRowUpdates", () => {
  it("targets only the override cell of the affected row, not the whole row", () => {
    const currentRows = [makeRow({ fileId: "1", title: "Song" })];
    const { cellUpdates, applied, skippedStaleCount } = buildMissingFieldRowUpdates(
      [{ field: "artist", fileId: "1", value: "手動入力アーティスト", expectedOverrideValue: "" }],
      currentRows
    );
    expect(skippedStaleCount).toBe(0);
    expect(applied).toEqual([
      { field: "artist", fileId: "1", value: "手動入力アーティスト", expectedOverrideValue: "", rowNumber: 2 },
    ]);
    expect(cellUpdates).toEqual([
      { rowNumber: 2, columnIndex: INDEX_SHEET_HEADER.indexOf("artist_override"), value: "手動入力アーティスト" },
    ]);
  });

  it("skips a write when the row is gone", () => {
    const { cellUpdates, applied, skippedStaleCount } = buildMissingFieldRowUpdates(
      [{ field: "artist", fileId: "gone", value: "X", expectedOverrideValue: "" }],
      []
    );
    expect(cellUpdates).toHaveLength(0);
    expect(applied).toHaveLength(0);
    expect(skippedStaleCount).toBe(1);
  });

  it("skips a write when the override cell changed since the check, even if effective() would still read as empty (ChatGPT review P2)", () => {
    // チェック時点はoverride無し（""）だったが、適用直前に別デバイスがoverrideを
    // "(none)"（明示的に空、という別の意図）へ変更していた。effective()だけを見ると
    // どちらも""に見えてしまうため、override列の生値そのものを比較する必要がある。
    const currentRows = [makeRow({ fileId: "1", album_override: "(none)" })];
    const { cellUpdates, applied, skippedStaleCount } = buildMissingFieldRowUpdates(
      [{ field: "album", fileId: "1", value: "手動入力アルバム", expectedOverrideValue: "" }],
      currentRows
    );
    expect(cellUpdates).toHaveLength(0);
    expect(applied).toHaveLength(0);
    expect(skippedStaleCount).toBe(1);
  });
});

describe("buildMissingFieldRevertUpdates", () => {
  it("clears the override written by this tool back to blank when it was originally unset", () => {
    const currentRows = [makeRow({ fileId: "1", artist_override: "手動入力" })];
    const applied = [{ field: "artist" as const, fileId: "1", value: "手動入力", expectedOverrideValue: "", rowNumber: 2 }];
    const { cellUpdates, revertedEntries, staleEntries, revertedCount, skippedStaleCount } = buildMissingFieldRevertUpdates(
      applied,
      currentRows
    );
    expect(revertedCount).toBe(1);
    expect(revertedEntries).toEqual(applied);
    expect(staleEntries).toHaveLength(0);
    expect(skippedStaleCount).toBe(0);
    expect(cellUpdates).toEqual([{ rowNumber: 2, columnIndex: INDEX_SHEET_HEADER.indexOf("artist_override"), value: "" }]);
  });

  it("restores the (none) sentinel rather than blanking it out (ChatGPT review P1)", () => {
    // album_override="(none)"（明示的な空）だった曲にこの機能で値を書き込んだ後、
    // 元に戻すと単純に""へ戻すのではなく、元の"(none)"という状態へ戻す必要がある
    // （""に戻すと、override無し＝素の抽出値が復活する、という異なる状態になってしまう）。
    const currentRows = [makeRow({ fileId: "1", album: "元の抽出値", album_override: "手動入力アルバム" })];
    const applied = [
      { field: "album" as const, fileId: "1", value: "手動入力アルバム", expectedOverrideValue: "(none)", rowNumber: 2 },
    ];
    const { cellUpdates, revertedEntries, staleEntries } = buildMissingFieldRevertUpdates(applied, currentRows);
    expect(staleEntries).toHaveLength(0);
    expect(revertedEntries).toEqual(applied);
    expect(cellUpdates).toEqual([{ rowNumber: 2, columnIndex: INDEX_SHEET_HEADER.indexOf("album_override"), value: "(none)" }]);
  });

  it("does not revert if the override has since changed to something else, and reports it as permanently stale", () => {
    const currentRows = [makeRow({ fileId: "1", artist_override: "別の値に変更済み" })];
    const applied = [{ field: "artist" as const, fileId: "1", value: "手動入力", expectedOverrideValue: "", rowNumber: 2 }];
    const { cellUpdates, staleEntries, revertedCount, skippedStaleCount } = buildMissingFieldRevertUpdates(applied, currentRows);
    expect(cellUpdates).toHaveLength(0);
    expect(staleEntries).toEqual(applied);
    expect(revertedCount).toBe(0);
    expect(skippedStaleCount).toBe(1);
  });
});

describe("applyMissingFieldWritesInChunks", () => {
  it("re-reads the index immediately before each chunk", async () => {
    const rows: Row[] = [makeRow({ fileId: "1" }), makeRow({ fileId: "2" })];
    const writes = [
      { field: "artist" as const, fileId: "1", value: "X", expectedOverrideValue: "" },
      { field: "artist" as const, fileId: "2", value: "Y", expectedOverrideValue: "" },
    ];
    const io = {
      listExistingRows: vi.fn(async () => rows.map((r) => [...r])),
      updateCells: vi.fn(async (updates: { rowNumber: number; columnIndex: number; value: string }[]) => {
        for (const { rowNumber, columnIndex, value } of updates) rows[rowNumber - 2][columnIndex] = value;
        // 1件目のチャンク書き込み後、外部（別デバイス想定）が2件目のartist_overrideを既に
        // "(none)"へ変更したことを模擬する。
        if (updates[0]?.rowNumber === 2) rows[1][INDEX_SHEET_HEADER.indexOf("artist_override")] = "(none)";
      }),
    };
    const results: { chunkApplied: { fileId: string }[]; chunkSkippedStaleCount: number }[] = [];
    await applyMissingFieldWritesInChunks(io, writes, (result) => results.push(result), 1);
    expect(results[0].chunkApplied.map((e) => e.fileId)).toEqual(["1"]);
    expect(results[1].chunkApplied).toHaveLength(0);
    expect(results[1].chunkSkippedStaleCount).toBe(1);
  });
});

describe("revertMissingFieldWritesInChunks", () => {
  it("notifies chunkReverted/chunkStale per chunk after re-reading the index immediately before writing it", async () => {
    const rows: Row[] = [
      makeRow({ fileId: "1", artist_override: "X" }),
      makeRow({ fileId: "2", artist_override: "Y" }),
    ];
    const applied = [
      { field: "artist" as const, fileId: "1", value: "X", expectedOverrideValue: "", rowNumber: 2 },
      { field: "artist" as const, fileId: "2", value: "Y", expectedOverrideValue: "", rowNumber: 3 },
    ];
    const io = {
      listExistingRows: vi.fn(async () => rows.map((r) => [...r])),
      updateCells: vi.fn(async (updates: { rowNumber: number; columnIndex: number; value: string }[]) => {
        for (const { rowNumber, columnIndex, value } of updates) rows[rowNumber - 2][columnIndex] = value;
        if (updates[0]?.rowNumber === 2) rows[1][INDEX_SHEET_HEADER.indexOf("artist_override")] = "Manual Fix";
      }),
    };
    const results: { chunkReverted: { fileId: string }[]; chunkStale: { fileId: string }[] }[] = [];
    await revertMissingFieldWritesInChunks(io, applied, (result) => results.push(result), 1);
    expect(results[0].chunkReverted.map((e) => e.fileId)).toEqual(["1"]);
    expect(results[1].chunkReverted).toHaveLength(0);
    expect(results[1].chunkStale.map((e) => e.fileId)).toEqual(["2"]);
  });
});
