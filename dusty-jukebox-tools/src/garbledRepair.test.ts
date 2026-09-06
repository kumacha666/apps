import { describe, expect, it, vi } from "vitest";
import Encoding from "encoding-japanese";
import { INDEX_SHEET_HEADER } from "./sheets";
import {
  applyGarbledWritesInChunks,
  buildGarbledRevertUpdates,
  buildGarbledRowUpdates,
  findGarbledCandidates,
  garbledCandidateKey,
  planGarbledRepair,
  revertGarbledWritesInChunks,
} from "./garbledRepair";

type Row = (string | number)[];

function makeRow(overrides: Partial<Record<(typeof INDEX_SHEET_HEADER)[number], string>>): Row {
  const row = new Array(INDEX_SHEET_HEADER.length).fill("");
  for (const [key, value] of Object.entries(overrides)) {
    row[INDEX_SHEET_HEADER.indexOf(key as (typeof INDEX_SHEET_HEADER)[number])] = value;
  }
  return row;
}

function garble(text: string): string {
  const utf8Bytes = new TextEncoder().encode(text);
  const codes = Encoding.convert(Array.from(utf8Bytes), { to: "UNICODE", from: "SJIS" });
  return Encoding.codeToString(codes);
}

describe("findGarbledCandidates", () => {
  it("finds a repairable candidate for a garbled field", () => {
    const original = "こんにちは世界";
    const garbled = garble(original);
    const rows = [makeRow({ fileId: "1", artist: garbled })];
    const candidates = findGarbledCandidates(rows, ["artist"]);
    expect(candidates).toEqual([{ field: "artist", fileId: "1", currentValue: garbled, repairedValue: original }]);
  });

  it("does not flag normal (non-garbled) text", () => {
    const rows = [makeRow({ fileId: "1", artist: "負けないで" })];
    expect(findGarbledCandidates(rows, ["artist"])).toHaveLength(0);
  });

  it("excludes rows that already have an override for the field", () => {
    const garbled = garble("テスト");
    const rows = [makeRow({ fileId: "1", artist: garbled, artist_override: "手動補正済み" })];
    expect(findGarbledCandidates(rows, ["artist"])).toHaveLength(0);
  });

  it("skips a garbled value that repairGarbledText cannot fix (repair returns null)", () => {
    // U+FFFDを含む文字列はSJIS往復修復では直らない
    const rows = [makeRow({ fileId: "1", artist: "譁�蟄怜喧縺�" })];
    expect(findGarbledCandidates(rows, ["artist"])).toHaveLength(0);
  });

  it("checks multiple fields independently", () => {
    // "アーティスト"自体はこの往復では復元できない実例（lib.test.ts参照:
    // UTF-8バイト列の区切りがSJIS2バイト文字の境界とずれると誤デコード時点で情報が失われる）
    // ため、いずれも往復確認済みの実例を使う。
    const g1 = garble("こんにちは");
    const g2 = garble("アルバム");
    const rows = [makeRow({ fileId: "1", artist: g1, album: g2 })];
    const candidates = findGarbledCandidates(rows, ["artist", "album"]);
    expect(candidates).toHaveLength(2);
    expect(candidates.map((c) => c.field).sort()).toEqual(["album", "artist"]);
  });
});

describe("garbledCandidateKey", () => {
  it("combines field and fileId", () => {
    expect(garbledCandidateKey({ field: "artist", fileId: "1" })).toBe("artist:1");
  });
});

describe("planGarbledRepair", () => {
  it("plans a write for every candidate when acceptedKeys is omitted", () => {
    const candidates = [
      { field: "artist" as const, fileId: "1", currentValue: "g1", repairedValue: "r1" },
      { field: "album" as const, fileId: "2", currentValue: "g2", repairedValue: "r2" },
    ];
    const writes = planGarbledRepair(candidates);
    expect(writes).toEqual([
      { field: "artist", fileId: "1", value: "r1", expectedSourceValue: "g1" },
      { field: "album", fileId: "2", value: "r2", expectedSourceValue: "g2" },
    ]);
  });

  it("only plans writes for accepted keys when acceptedKeys is provided (user unchecked a candidate)", () => {
    const candidates = [
      { field: "artist" as const, fileId: "1", currentValue: "g1", repairedValue: "r1" },
      { field: "album" as const, fileId: "2", currentValue: "g2", repairedValue: "r2" },
    ];
    const writes = planGarbledRepair(candidates, new Set(["artist:1"]));
    expect(writes).toEqual([{ field: "artist", fileId: "1", value: "r1", expectedSourceValue: "g1" }]);
  });
});

describe("buildGarbledRowUpdates", () => {
  it("skips a write when the row's current value has drifted from expectedSourceValue since the check", () => {
    const rows: Row[] = [makeRow({ fileId: "1", artist: "changed-since-check" })];
    const writes = [{ field: "artist" as const, fileId: "1", value: "repaired", expectedSourceValue: "old-garbled" }];
    const { cellUpdates, applied, skippedStaleCount } = buildGarbledRowUpdates(writes, rows);
    expect(cellUpdates).toHaveLength(0);
    expect(applied).toHaveLength(0);
    expect(skippedStaleCount).toBe(1);
  });

  it("emits a single-cell update targeting only the override column", () => {
    const rows: Row[] = [makeRow({ fileId: "1", artist: "garbled", title: "元のタイトル" })];
    const writes = [{ field: "artist" as const, fileId: "1", value: "repaired", expectedSourceValue: "garbled" }];
    const { cellUpdates } = buildGarbledRowUpdates(writes, rows);
    expect(cellUpdates).toEqual([
      { rowNumber: 2, columnIndex: INDEX_SHEET_HEADER.indexOf("artist_override"), value: "repaired" },
    ]);
  });
});

describe("applyGarbledWritesInChunks", () => {
  it("re-reads the index immediately before each chunk (same safety pattern as caseNormalization.ts)", async () => {
    const rows: Row[] = [makeRow({ fileId: "1", artist: "g1" }), makeRow({ fileId: "2", artist: "g2" })];
    const writes = [
      { field: "artist" as const, fileId: "1", value: "r1", expectedSourceValue: "g1" },
      { field: "artist" as const, fileId: "2", value: "r2", expectedSourceValue: "g2" },
    ];
    const io = {
      listExistingRows: vi.fn(async () => rows.map((r) => [...r])),
      updateCells: vi.fn(async (updates: { rowNumber: number; columnIndex: number; value: string }[]) => {
        for (const { rowNumber, columnIndex, value } of updates) rows[rowNumber - 2][columnIndex] = value;
        if (updates[0]?.rowNumber === 2) rows[1][INDEX_SHEET_HEADER.indexOf("artist")] = "changed-by-someone-else";
      }),
    };
    const results: { chunkApplied: { fileId: string }[]; chunkSkippedStaleCount: number }[] = [];
    await applyGarbledWritesInChunks(io, writes, (result) => results.push(result), 1);
    expect(results[0].chunkApplied.map((e) => e.fileId)).toEqual(["1"]);
    expect(results[1].chunkApplied).toHaveLength(0);
    expect(results[1].chunkSkippedStaleCount).toBe(1);
  });
});

describe("revertGarbledWritesInChunks", () => {
  it("evicts a stale entry from lastApplied even when another entry's write in the same chunk fails", async () => {
    const rows: Row[] = [
      makeRow({ fileId: "1", artist: "g1", artist_override: "Manual Fix" }),
      makeRow({ fileId: "2", artist: "g2", artist_override: "r2" }),
    ];
    const applied = [
      { field: "artist" as const, fileId: "1", value: "r1", expectedSourceValue: "g1", rowNumber: 2 },
      { field: "artist" as const, fileId: "2", value: "r2", expectedSourceValue: "g2", rowNumber: 3 },
    ];
    const io = {
      listExistingRows: vi.fn(async () => rows.map((r) => [...r])),
      updateCells: vi.fn(async () => {
        throw new Error("network error");
      }),
    };
    const results: { chunkReverted: { fileId: string }[]; chunkStale: { fileId: string }[] }[] = [];
    await expect(revertGarbledWritesInChunks(io, applied, (result) => results.push(result))).rejects.toThrow(
      "network error"
    );
    expect(results).toEqual([{ chunkReverted: [], chunkStale: [applied[0]] }]);
  });
});

describe("buildGarbledRevertUpdates", () => {
  it("only reverts entries whose override still holds the value this tool wrote", () => {
    const rows: Row[] = [
      makeRow({ fileId: "1", artist: "g1", artist_override: "r1" }),
      makeRow({ fileId: "2", artist: "g2", artist_override: "Manual Fix" }),
    ];
    const applied = [
      { field: "artist" as const, fileId: "1", value: "r1", expectedSourceValue: "g1", rowNumber: 2 },
      { field: "artist" as const, fileId: "2", value: "r2", expectedSourceValue: "g2", rowNumber: 3 },
    ];
    const { revertedEntries, staleEntries } = buildGarbledRevertUpdates(applied, rows);
    expect(revertedEntries.map((e) => e.fileId)).toEqual(["1"]);
    expect(staleEntries.map((e) => e.fileId)).toEqual(["2"]);
  });
});
