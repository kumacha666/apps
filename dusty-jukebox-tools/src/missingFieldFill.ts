// カタログ補正機能の第三弾：欠落フィールドの一括見直しUI。healthCheck.ts②で一覧化はできるが
// 埋める手段が無かったのを解消する。表記ゆれ統一（caseNormalization.ts）・文字化け修復
// （garbledRepair.ts）と同じ安全設計（対象`<field>_override`セルだけをピンポイント更新、
// チャンク直前の再読み込み、書き込み直前に「まだ空欄のまま」を確認、「元に戻す」で永久除去）を
// そのまま踏襲する。
//
// 表記ゆれ統一・文字化け修復との違い：書き込む値は自動算出（多数派表記・復元候補）ではなく、
// ユーザーがUI上で1件ずつ手入力した自由入力値をそのまま使う。同一アルバム内の他の曲からの
// 自動候補提示は今回のv1では見送った（曲名には使えず中途半端になるため、ユーザーとの相談で確定）。
//
// スコープ：title/artist/album（`<field>_override`列を持つフィールド）のみ対象。genreは
// override列自体が存在せず、この安全設計（対象セルのみ更新）に乗せられないため対象外
// （healthCheck.ts②の一覧には引き続き表示されるが、埋める手段は既存方針通りMp3tagでの
// 直接編集に委ねる）。

import { INDEX_SHEET_HEADER, WRITE_BATCH_SIZE } from "./sheets";

type Row = (string | number)[];

export const MISSING_FIELD_FILL_FIELDS = ["title", "artist", "album"] as const;
export type MissingFieldFillField = (typeof MISSING_FIELD_FILL_FIELDS)[number];

const col = (name: (typeof INDEX_SHEET_HEADER)[number]) => INDEX_SHEET_HEADER.indexOf(name);
const cell = (row: Row, name: (typeof INDEX_SHEET_HEADER)[number]) => String(row[col(name)] ?? "").trim();
const overrideColumnName = (field: MissingFieldFillField) => `${field}_override` as (typeof INDEX_SHEET_HEADER)[number];
const FILE_ID_INDEX = col("fileId");

// healthCheck.tsのeffective()と同じ規約（override優先、"(none)"は明示的な空）。
function effective(row: Row, field: MissingFieldFillField): string {
  const override = cell(row, overrideColumnName(field));
  if (override === "(none)") return "";
  if (override !== "") return override;
  return cell(row, field);
}

export interface MissingFieldEntry {
  fileId: string;
  field: MissingFieldFillField;
}

// 実効値（override込み）が空欄のフィールドを列挙する。
export function findMissingFieldEntries(
  rows: Row[],
  fields: readonly MissingFieldFillField[] = MISSING_FIELD_FILL_FIELDS
): MissingFieldEntry[] {
  const results: MissingFieldEntry[] = [];
  for (const row of rows) {
    const fileId = cell(row, "fileId");
    if (fileId === "") continue;
    for (const field of fields) {
      if (effective(row, field) === "") results.push({ fileId, field });
    }
  }
  return results;
}

export interface MissingFieldWrite {
  field: MissingFieldFillField;
  fileId: string;
  // ユーザーがUI上で入力した値。空文字は呼び出し元（UI層）で除外してからここへ渡す想定。
  value: string;
}

export interface AppliedMissingFieldWrite extends MissingFieldWrite {
  rowNumber: number;
}

export interface MissingFieldCellUpdate {
  rowNumber: number;
  columnIndex: number;
  value: string;
}

export interface BuildMissingFieldRowUpdatesResult {
  cellUpdates: MissingFieldCellUpdate[];
  applied: AppliedMissingFieldWrite[];
  skippedStaleCount: number;
}

// 書き込み直前に読み直した最新の索引行と突き合わせ、行が既に無い、または対象フィールドの
// 実効値が既に空でない（チェック後〜適用までの間に他デバイス・再スキャンで埋まった）場合は
// スキップする（caseNormalization.ts/garbledRepair.tsと同じ「書き込み直前の再確認」方針）。
export function buildMissingFieldRowUpdates(writes: MissingFieldWrite[], currentRows: Row[]): BuildMissingFieldRowUpdatesResult {
  const rowByFileId = new Map<string, { rowNumber: number; row: Row }>();
  currentRows.forEach((row, i) => {
    const fileId = String(row[FILE_ID_INDEX] ?? "");
    if (fileId) rowByFileId.set(fileId, { rowNumber: i + 2, row });
  });
  const cellUpdates: MissingFieldCellUpdate[] = [];
  const applied: AppliedMissingFieldWrite[] = [];
  let skippedStaleCount = 0;
  for (const write of writes) {
    const current = rowByFileId.get(write.fileId);
    if (!current || effective(current.row, write.field) !== "") {
      skippedStaleCount++;
      continue;
    }
    cellUpdates.push({ rowNumber: current.rowNumber, columnIndex: col(overrideColumnName(write.field)), value: write.value });
    applied.push({ ...write, rowNumber: current.rowNumber });
  }
  return { cellUpdates, applied, skippedStaleCount };
}

export interface BuildMissingFieldRevertUpdatesResult {
  cellUpdates: MissingFieldCellUpdate[];
  revertedEntries: AppliedMissingFieldWrite[];
  staleEntries: AppliedMissingFieldWrite[];
  revertedCount: number;
  skippedStaleCount: number;
}

// 「元に戻す」：このツールが書き込んだoverrideがそのまま残っている場合だけ空欄に戻す
// （caseNormalization.ts/garbledRepair.tsと同じ方針）。
export function buildMissingFieldRevertUpdates(
  applied: AppliedMissingFieldWrite[],
  currentRows: Row[]
): BuildMissingFieldRevertUpdatesResult {
  const rowByFileId = new Map<string, { rowNumber: number; row: Row }>();
  currentRows.forEach((row, i) => {
    const fileId = String(row[FILE_ID_INDEX] ?? "");
    if (fileId) rowByFileId.set(fileId, { rowNumber: i + 2, row });
  });
  const cellUpdates: MissingFieldCellUpdate[] = [];
  const revertedEntries: AppliedMissingFieldWrite[] = [];
  const staleEntries: AppliedMissingFieldWrite[] = [];
  for (const write of applied) {
    const current = rowByFileId.get(write.fileId);
    if (!current || cell(current.row, overrideColumnName(write.field)) !== write.value) {
      staleEntries.push(write);
      continue;
    }
    cellUpdates.push({ rowNumber: current.rowNumber, columnIndex: col(overrideColumnName(write.field)), value: "" });
    revertedEntries.push(write);
  }
  return {
    cellUpdates,
    revertedEntries,
    staleEntries,
    revertedCount: revertedEntries.length,
    skippedStaleCount: staleEntries.length,
  };
}

export interface MissingFieldRowIO {
  listExistingRows(): Promise<Row[]>;
  updateCells(updates: MissingFieldCellUpdate[]): Promise<void>;
}

export interface ApplyMissingFieldWritesChunkResult {
  chunkApplied: AppliedMissingFieldWrite[];
  chunkSkippedStaleCount: number;
}

export async function applyMissingFieldWritesInChunks(
  io: MissingFieldRowIO,
  writes: MissingFieldWrite[],
  onChunkWritten: (result: ApplyMissingFieldWritesChunkResult) => void,
  chunkSize = WRITE_BATCH_SIZE
): Promise<void> {
  for (let i = 0; i < writes.length; i += chunkSize) {
    const chunk = writes.slice(i, i + chunkSize);
    const currentRows = await io.listExistingRows();
    const { cellUpdates, applied, skippedStaleCount } = buildMissingFieldRowUpdates(chunk, currentRows);
    if (cellUpdates.length > 0) await io.updateCells(cellUpdates);
    onChunkWritten({ chunkApplied: applied, chunkSkippedStaleCount: skippedStaleCount });
  }
}

export interface RevertMissingFieldWritesChunkResult {
  chunkReverted: AppliedMissingFieldWrite[];
  chunkStale: AppliedMissingFieldWrite[];
}

export async function revertMissingFieldWritesInChunks(
  io: MissingFieldRowIO,
  applied: AppliedMissingFieldWrite[],
  onChunkWritten: (result: RevertMissingFieldWritesChunkResult) => void,
  chunkSize = WRITE_BATCH_SIZE
): Promise<void> {
  for (let i = 0; i < applied.length; i += chunkSize) {
    const chunk = applied.slice(i, i + chunkSize);
    const currentRows = await io.listExistingRows();
    const { cellUpdates, revertedEntries, staleEntries } = buildMissingFieldRevertUpdates(chunk, currentRows);
    if (staleEntries.length > 0) onChunkWritten({ chunkReverted: [], chunkStale: staleEntries });
    if (cellUpdates.length > 0) {
      await io.updateCells(cellUpdates);
      onChunkWritten({ chunkReverted: revertedEntries, chunkStale: [] });
    }
  }
}
