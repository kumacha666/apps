// カタログ補正機能の第二弾：文字化けの自動修復。表記ゆれ統一（caseNormalization.ts）と
// 同じ安全設計（対象`<field>_override`セルだけをピンポイント更新、チャンク直前の再読み込み、
// 書き込み直前のexpectedSourceValue確認、staleエントリの永久除去）をそのまま踏襲する
// （caseNormalization.tsは複数ラウンドのレビューでこの設計に到達済みのため、独自に再設計せず
// 同じ形に合わせる）。
//
// 表記ゆれ統一との違い：曲同士のグルーピングが不要（1曲＝1候補。件数の多い表記を選ぶような
// 合意形成は無く、repairGarbledText()が導いた1つの復元候補をそのまま採用する）。ユーザーは
// UI上で候補ごとに個別に適用対象から外せる（acceptedKeysで選択）。
//
// スコープ：Genre（" / "区切りの多値フィールド）は対象外（caseNormalization.tsと同じ理由、
// トークン分解が必要で複雑さが増すため次回以降）。既に`<field>_override`が設定済みの曲も対象外
// （手動補正を上書きしない）。
//
// garbledSuspect/garbledResolved列は意図的に書き込まない（2026-09-06 ChatGPTレビュー指摘：
// このままでは行単位のgarbledResolvedが永久にFALSEのままになり列が実質使われない、という
// 指摘を受けて検討した結果）。理由は2つ：①本体の`buildIndexRow()`はgarbledSuspect/
// garbledResolvedを`_override`とは違う「タグ抽出値列」として扱っており、フルスキャン
// （初回スキャン・410 Gone復旧時）で再抽出に成功するたびに無条件でgarbledSuspectを再計算・
// garbledResolvedをFALSEへ引き戻す。このアプリが書いたTRUEは、この上書きが起きた時点で
// 静かに失われる（`_override`列は保護されるためこの上書きの影響を受けないのと対照的）。
// ②仮に書き込んでも、行のどのフィールドが「解決済み」かという情報の実体は既に
// `<field>_override`の非空判定だけで完全に導出できるため、別列に同じ情報を二重管理する
// 意味が薄い。列自体をスキーマから削除する判断（既存データとの互換性、ai-workspaceの
// CONCEPT.md更新を伴う）はこのPRの範囲を超えるため、まずは「このアプリからは触らない」
// 方針を明記するにとどめる（列自体の廃止判断は今後、非公開ai-workspace側の設計セッションで
// 改めて検討する）。

import { detectGarbled, repairGarbledText } from "./lib";
import { INDEX_SHEET_HEADER, WRITE_BATCH_SIZE } from "./sheets";

type Row = (string | number)[];

// buildIndexRow()がgarbledSuspectの判定に使うのと同じ5フィールド（本体のlib.ts参照）。
export const GARBLED_REPAIR_FIELDS = ["title", "artist", "albumArtist", "album", "composer"] as const;
export type GarbledRepairField = (typeof GARBLED_REPAIR_FIELDS)[number];

const col = (name: (typeof INDEX_SHEET_HEADER)[number]) => INDEX_SHEET_HEADER.indexOf(name);
const cell = (row: Row, name: (typeof INDEX_SHEET_HEADER)[number]) => String(row[col(name)] ?? "").trim();
const overrideColumnName = (field: GarbledRepairField) => `${field}_override` as (typeof INDEX_SHEET_HEADER)[number];
const FILE_ID_INDEX = col("fileId");

function hasOverride(row: Row, field: GarbledRepairField): boolean {
  return cell(row, overrideColumnName(field)) !== "";
}

export interface GarbledCandidate {
  field: GarbledRepairField;
  fileId: string;
  currentValue: string;
  repairedValue: string;
}

export function garbledCandidateKey(c: Pick<GarbledCandidate, "field" | "fileId">): string {
  return `${c.field}:${c.fileId}`;
}

// 手動補正が無い曲だけを対象に、文字化けと判定され(detectGarbled)、かつ実際に修復候補が
// 得られた(repairGarbledText)ものだけを候補として返す。修復に失敗した（nullが返る）ものは
// 候補に含めない＝「修復できないので保留」扱い（元の値も書き換えない）。
export function findGarbledCandidates(
  rows: Row[],
  fields: readonly GarbledRepairField[] = GARBLED_REPAIR_FIELDS
): GarbledCandidate[] {
  const candidates: GarbledCandidate[] = [];
  for (const row of rows) {
    const fileId = cell(row, "fileId");
    if (fileId === "") continue;
    for (const field of fields) {
      if (hasOverride(row, field)) continue;
      const value = cell(row, field);
      if (value === "" || !detectGarbled(value)) continue;
      const repaired = repairGarbledText(value);
      if (repaired === null) continue;
      candidates.push({ field, fileId, currentValue: value, repairedValue: repaired });
    }
  }
  return candidates;
}

export interface GarbledWrite {
  field: GarbledRepairField;
  fileId: string;
  value: string;
  // チェック時点でこの曲が実際に持っていた文字化けした値。書き込み直前にこの値のまま
  // 変わっていないかを確認するために保持する（caseNormalization.tsのexpectedSourceValueと同じ理由）。
  expectedSourceValue: string;
}

// acceptedKeys未指定の場合は全候補を適用対象にする。UIで個別に外す場合はgarbledCandidateKey()
// のキー集合を渡す。
export function planGarbledRepair(candidates: GarbledCandidate[], acceptedKeys?: Set<string>): GarbledWrite[] {
  return candidates
    .filter((c) => !acceptedKeys || acceptedKeys.has(garbledCandidateKey(c)))
    .map((c) => ({ field: c.field, fileId: c.fileId, value: c.repairedValue, expectedSourceValue: c.currentValue }));
}

export interface AppliedGarbledWrite extends GarbledWrite {
  rowNumber: number;
}

export interface GarbledCellUpdate {
  rowNumber: number;
  columnIndex: number;
  value: string;
}

export interface BuildGarbledRowUpdatesResult {
  cellUpdates: GarbledCellUpdate[];
  applied: AppliedGarbledWrite[];
  skippedStaleCount: number;
}

export function buildGarbledRowUpdates(writes: GarbledWrite[], currentRows: Row[]): BuildGarbledRowUpdatesResult {
  const rowByFileId = new Map<string, { rowNumber: number; row: Row }>();
  currentRows.forEach((row, i) => {
    const fileId = String(row[FILE_ID_INDEX] ?? "");
    if (fileId) rowByFileId.set(fileId, { rowNumber: i + 2, row });
  });
  const cellUpdates: GarbledCellUpdate[] = [];
  const applied: AppliedGarbledWrite[] = [];
  let skippedStaleCount = 0;
  for (const write of writes) {
    const current = rowByFileId.get(write.fileId);
    if (
      !current ||
      hasOverride(current.row, write.field) ||
      cell(current.row, write.field) !== write.expectedSourceValue
    ) {
      skippedStaleCount++;
      continue;
    }
    cellUpdates.push({ rowNumber: current.rowNumber, columnIndex: col(overrideColumnName(write.field)), value: write.value });
    applied.push({ ...write, rowNumber: current.rowNumber });
  }
  return { cellUpdates, applied, skippedStaleCount };
}

export interface BuildGarbledRevertUpdatesResult {
  cellUpdates: GarbledCellUpdate[];
  revertedEntries: AppliedGarbledWrite[];
  staleEntries: AppliedGarbledWrite[];
  revertedCount: number;
  skippedStaleCount: number;
}

export function buildGarbledRevertUpdates(applied: AppliedGarbledWrite[], currentRows: Row[]): BuildGarbledRevertUpdatesResult {
  const rowByFileId = new Map<string, { rowNumber: number; row: Row }>();
  currentRows.forEach((row, i) => {
    const fileId = String(row[FILE_ID_INDEX] ?? "");
    if (fileId) rowByFileId.set(fileId, { rowNumber: i + 2, row });
  });
  const cellUpdates: GarbledCellUpdate[] = [];
  const revertedEntries: AppliedGarbledWrite[] = [];
  const staleEntries: AppliedGarbledWrite[] = [];
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

export interface GarbledRowIO {
  listExistingRows(): Promise<Row[]>;
  updateCells(updates: GarbledCellUpdate[]): Promise<void>;
}

export interface ApplyGarbledWritesChunkResult {
  chunkApplied: AppliedGarbledWrite[];
  chunkSkippedStaleCount: number;
}

export async function applyGarbledWritesInChunks(
  io: GarbledRowIO,
  writes: GarbledWrite[],
  onChunkWritten: (result: ApplyGarbledWritesChunkResult) => void,
  chunkSize = WRITE_BATCH_SIZE
): Promise<void> {
  for (let i = 0; i < writes.length; i += chunkSize) {
    const chunk = writes.slice(i, i + chunkSize);
    const currentRows = await io.listExistingRows();
    const { cellUpdates, applied, skippedStaleCount } = buildGarbledRowUpdates(chunk, currentRows);
    if (cellUpdates.length > 0) await io.updateCells(cellUpdates);
    onChunkWritten({ chunkApplied: applied, chunkSkippedStaleCount: skippedStaleCount });
  }
}

export interface RevertGarbledWritesChunkResult {
  chunkReverted: AppliedGarbledWrite[];
  chunkStale: AppliedGarbledWrite[];
}

export async function revertGarbledWritesInChunks(
  io: GarbledRowIO,
  applied: AppliedGarbledWrite[],
  onChunkWritten: (result: RevertGarbledWritesChunkResult) => void,
  chunkSize = WRITE_BATCH_SIZE
): Promise<void> {
  for (let i = 0; i < applied.length; i += chunkSize) {
    const chunk = applied.slice(i, i + chunkSize);
    const currentRows = await io.listExistingRows();
    const { cellUpdates, revertedEntries, staleEntries } = buildGarbledRevertUpdates(chunk, currentRows);
    if (staleEntries.length > 0) onChunkWritten({ chunkReverted: [], chunkStale: staleEntries });
    if (cellUpdates.length > 0) {
      await io.updateCells(cellUpdates);
      onChunkWritten({ chunkReverted: revertedEntries, chunkStale: [] });
    }
  }
}
