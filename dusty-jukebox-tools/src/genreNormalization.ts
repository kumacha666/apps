import { INDEX_SHEET_HEADER, WRITE_BATCH_SIZE } from "./sheets";

type Row = (string | number)[];
const col = (name: (typeof INDEX_SHEET_HEADER)[number]) => INDEX_SHEET_HEADER.indexOf(name);
const cell = (row: Row, name: (typeof INDEX_SHEET_HEADER)[number]) => String(row[col(name)] ?? "").trim();
const FILE_ID_INDEX = col("fileId");
const GENRE_OVERRIDE_INDEX = col("genre_override");

export interface GenreVariant {
  value: string;
  fileIds: string[];
}

export interface GenreCasingGroup {
  normalizedKey: string;
  variants: GenreVariant[];
  suggestedCanonical: string;
  /** The complete source genre is retained so planning can coalesce token changes by song. */
  sourceGenresByFileId: Map<string, string>;
}

export function genreGroupKey(group: Pick<GenreCasingGroup, "normalizedKey">): string {
  return group.normalizedKey;
}

const splitGenre = (genre: string): string[] => genre.split(" / ").map((token) => token.trim());

/** Finds casing differences at token level, using the same delimiter rule as catalog.ts. */
export function findGenreCasingVariants(rows: Row[]): GenreCasingGroup[] {
  const grouped = new Map<string, { byValue: Map<string, Set<string>>; sourceGenresByFileId: Map<string, string> }>();
  for (const row of rows) {
    if (cell(row, "genre_override") !== "") continue;
    const fileId = cell(row, "fileId");
    const sourceGenre = cell(row, "genre");
    if (!fileId || !sourceGenre) continue;
    for (const token of splitGenre(sourceGenre)) {
      if (!token) continue;
      const normalizedKey = token.toLowerCase();
      let group = grouped.get(normalizedKey);
      if (!group) {
        group = { byValue: new Map(), sourceGenresByFileId: new Map() };
        grouped.set(normalizedKey, group);
      }
      group.sourceGenresByFileId.set(fileId, sourceGenre);
      let fileIds = group.byValue.get(token);
      if (!fileIds) {
        fileIds = new Set();
        group.byValue.set(token, fileIds);
      }
      fileIds.add(fileId);
    }
  }

  const results: GenreCasingGroup[] = [];
  for (const [normalizedKey, group] of grouped) {
    if (group.byValue.size < 2) continue;
    const variants = [...group.byValue].map(([value, ids]) => ({ value, fileIds: [...ids] })).sort(
      (a, b) => b.fileIds.length - a.fileIds.length || (a.value < b.value ? -1 : a.value > b.value ? 1 : 0)
    );
    results.push({ normalizedKey, variants, suggestedCanonical: variants[0].value, sourceGenresByFileId: group.sourceGenresByFileId });
  }
  return results;
}

export interface GenreWrite {
  fileId: string;
  value: string;
  expectedSourceGenre: string;
}

/** Coalesces all token replacements into exactly one complete genre value per song. */
export function planGenreNormalization(
  groups: GenreCasingGroup[],
  canonicalByGroupKey: Map<string, string> = new Map()
): GenreWrite[] {
  const canonicalByToken = new Map(groups.map((group) => [group.normalizedKey, canonicalByGroupKey.get(genreGroupKey(group)) ?? group.suggestedCanonical]));
  const sourceByFileId = new Map<string, string>();
  for (const group of groups) for (const [fileId, genre] of group.sourceGenresByFileId) sourceByFileId.set(fileId, genre);
  const writes: GenreWrite[] = [];
  for (const [fileId, expectedSourceGenre] of sourceByFileId) {
    const value = splitGenre(expectedSourceGenre).map((token) => canonicalByToken.get(token.toLowerCase()) ?? token).join(" / ");
    if (value !== expectedSourceGenre) writes.push({ fileId, value, expectedSourceGenre });
  }
  return writes;
}

export interface GenreCellUpdate { rowNumber: number; columnIndex: number; value: string }
export interface AppliedGenreWrite extends GenreWrite { rowNumber: number }

export function buildGenreRowUpdates(writes: GenreWrite[], currentRows: Row[]) {
  const rows = new Map<string, { row: Row; rowNumber: number }>();
  currentRows.forEach((row, index) => rows.set(String(row[FILE_ID_INDEX] ?? ""), { row, rowNumber: index + 2 }));
  const cellUpdates: GenreCellUpdate[] = [];
  const applied: AppliedGenreWrite[] = [];
  let skippedStaleCount = 0;
  for (const write of writes) {
    const current = rows.get(write.fileId);
    if (!current || cell(current.row, "genre_override") !== "" || cell(current.row, "genre") !== write.expectedSourceGenre) {
      skippedStaleCount++;
      continue;
    }
    cellUpdates.push({ rowNumber: current.rowNumber, columnIndex: GENRE_OVERRIDE_INDEX, value: write.value });
    applied.push({ ...write, rowNumber: current.rowNumber });
  }
  return { cellUpdates, applied, skippedStaleCount };
}

export function buildGenreRevertUpdates(applied: AppliedGenreWrite[], currentRows: Row[]) {
  const rows = new Map<string, { row: Row; rowNumber: number }>();
  currentRows.forEach((row, index) => rows.set(String(row[FILE_ID_INDEX] ?? ""), { row, rowNumber: index + 2 }));
  const cellUpdates: GenreCellUpdate[] = [];
  const revertedEntries: AppliedGenreWrite[] = [];
  const staleEntries: AppliedGenreWrite[] = [];
  for (const write of applied) {
    const current = rows.get(write.fileId);
    if (!current || cell(current.row, "genre_override") !== write.value) staleEntries.push(write);
    else {
      cellUpdates.push({ rowNumber: current.rowNumber, columnIndex: GENRE_OVERRIDE_INDEX, value: "" });
      revertedEntries.push(write);
    }
  }
  return { cellUpdates, revertedEntries, staleEntries, revertedCount: revertedEntries.length, skippedStaleCount: staleEntries.length };
}

export interface GenreRowIO {
  listExistingRows(): Promise<Row[]>;
  updateCells(updates: GenreCellUpdate[]): Promise<void>;
}

export async function applyGenreWritesInChunks(
  io: GenreRowIO,
  writes: GenreWrite[],
  onChunkWritten: (result: { chunkApplied: AppliedGenreWrite[]; chunkSkippedStaleCount: number }) => void,
  chunkSize = WRITE_BATCH_SIZE
): Promise<void> {
  for (let index = 0; index < writes.length; index += chunkSize) {
    const result = buildGenreRowUpdates(writes.slice(index, index + chunkSize), await io.listExistingRows());
    if (result.cellUpdates.length) await io.updateCells(result.cellUpdates);
    onChunkWritten({ chunkApplied: result.applied, chunkSkippedStaleCount: result.skippedStaleCount });
  }
}

export async function revertGenreWritesInChunks(
  io: GenreRowIO,
  applied: AppliedGenreWrite[],
  onChunkWritten: (result: { chunkReverted: AppliedGenreWrite[]; chunkStale: AppliedGenreWrite[] }) => void,
  chunkSize = WRITE_BATCH_SIZE
): Promise<void> {
  for (let index = 0; index < applied.length; index += chunkSize) {
    const result = buildGenreRevertUpdates(applied.slice(index, index + chunkSize), await io.listExistingRows());
    if (result.staleEntries.length) onChunkWritten({ chunkReverted: [], chunkStale: result.staleEntries });
    if (result.cellUpdates.length) {
      await io.updateCells(result.cellUpdates);
      onChunkWritten({ chunkReverted: result.revertedEntries, chunkStale: [] });
    }
  }
}
