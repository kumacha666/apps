// カタログ補正機能の第一弾：Artist/AlbumArtist/Composerの大文字小文字の表記ゆれ統一。
// CONCEPT.md 4.4節にはまだ無い論点（文字化け・フォルダ名推定とは別の正規化問題）。
//
// スコープ（ユーザーとの相談で確定）：
// - 対象はArtist/AlbumArtist/Composer（単一値フィールド）のみ。Genreは複数値フィールド
//   （" / "区切り）でトークン単位の分解が必要になり複雑さが増すため次回以降に回す。
// - 既に`<field>_override`が設定されている曲（"(none)"の明示的空欄を含む）は対象外にする。
//   手動補正済みの曲を自動正規化が上書きしてしまうリスクを避け、「元に戻す」もシンプルに保つ
//   （このツールが書き込んだoverrideだけを対象にすればよく、書き込み前の値の復元ロジックが
//   不要になる＝常に空欄に戻せばよい）。
// - 正規化後の値は「件数が多い方を自動採用」がユーザーの既定選択。呼び出し元（UI）は
//   canonicalByGroupKeyで個別グループごとに上書きできる。

import { INDEX_SHEET_HEADER, WRITE_BATCH_SIZE } from "./sheets";

type Row = (string | number)[];

export const CASE_NORMALIZATION_FIELDS = ["artist", "albumArtist", "composer"] as const;
export type CaseNormalizationField = (typeof CASE_NORMALIZATION_FIELDS)[number];

const col = (name: (typeof INDEX_SHEET_HEADER)[number]) => INDEX_SHEET_HEADER.indexOf(name);
const cell = (row: Row, name: (typeof INDEX_SHEET_HEADER)[number]) => String(row[col(name)] ?? "").trim();
const overrideColumnName = (field: CaseNormalizationField) => `${field}_override` as (typeof INDEX_SHEET_HEADER)[number];
const FILE_ID_INDEX = col("fileId");

function hasOverride(row: Row, field: CaseNormalizationField): boolean {
  return cell(row, overrideColumnName(field)) !== "";
}

export interface CasingVariant {
  value: string;
  fileIds: string[];
}

export interface CasingGroup {
  field: CaseNormalizationField;
  normalizedKey: string;
  // 件数の多い順。同数の場合はvalueの辞書順（テスト・UI表示の決定性のため）。
  variants: CasingVariant[];
  suggestedCanonical: string;
}

export function casingGroupKey(group: Pick<CasingGroup, "field" | "normalizedKey">): string {
  return `${group.field}:${group.normalizedKey}`;
}

// 手動補正が無い曲だけを対象に、大文字小文字違い（trim済み・大文字小文字を無視した完全一致）
// でグルーピングする。2種類以上の表記が実在するキーだけを結果に含める。
export function findCasingVariants(
  rows: Row[],
  fields: readonly CaseNormalizationField[] = CASE_NORMALIZATION_FIELDS
): CasingGroup[] {
  const groups: CasingGroup[] = [];
  for (const field of fields) {
    const byNormalizedKey = new Map<string, Map<string, string[]>>();
    for (const row of rows) {
      if (hasOverride(row, field)) continue;
      const value = cell(row, field);
      if (value === "") continue;
      const fileId = cell(row, "fileId");
      if (fileId === "") continue;
      const normalizedKey = value.toLowerCase();
      let byValue = byNormalizedKey.get(normalizedKey);
      if (!byValue) {
        byValue = new Map();
        byNormalizedKey.set(normalizedKey, byValue);
      }
      const fileIds = byValue.get(value);
      if (fileIds) fileIds.push(fileId);
      else byValue.set(value, [fileId]);
    }
    for (const [normalizedKey, byValue] of byNormalizedKey) {
      if (byValue.size < 2) continue;
      const variants = [...byValue.entries()]
        .map(([value, fileIds]) => ({ value, fileIds }))
        // localeCompareは環境（ICUデータ）依存で結果が変わりうるため、同数タイブレークは
        // 単純な文字コード順（<）で決定的にする。
        .sort((a, b) => b.fileIds.length - a.fileIds.length || (a.value < b.value ? -1 : a.value > b.value ? 1 : 0));
      groups.push({ field, normalizedKey, variants, suggestedCanonical: variants[0].value });
    }
  }
  return groups;
}

export interface CasingWrite {
  field: CaseNormalizationField;
  fileId: string;
  value: string;
  // チェック時点でこの曲が実際に持っていた表記（variant.value）。書き込み直前にこの値のまま
  // 変わっていないかを確認するために保持する（ChatGPTレビュー指摘：チェック後〜適用前に
  // 別デバイス・再スキャンで元のタグ自体が変わっていた場合、overrideが空というだけでは
  // 古い候補のまま誤って書き込んでしまう）。
  expectedSourceValue: string;
}

// canonicalByGroupKey未指定のグループはsuggestedCanonical（件数の多い表記）を採用する。
// 既に正規化後の表記と一致している曲は書き込み対象から除く。
export function planCasingNormalization(
  groups: CasingGroup[],
  canonicalByGroupKey: Map<string, string> = new Map()
): CasingWrite[] {
  const writes: CasingWrite[] = [];
  for (const group of groups) {
    const canonical = canonicalByGroupKey.get(casingGroupKey(group)) ?? group.suggestedCanonical;
    for (const variant of group.variants) {
      if (variant.value === canonical) continue;
      for (const fileId of variant.fileIds) {
        writes.push({ field: group.field, fileId, value: canonical, expectedSourceValue: variant.value });
      }
    }
  }
  return writes;
}

export interface AppliedCasingWrite extends CasingWrite {
  rowNumber: number;
}

export interface BuildCasingRowUpdatesResult {
  updates: { rowNumber: number; row: Row }[];
  applied: AppliedCasingWrite[];
  skippedStaleCount: number;
}

// 書き込み直前に読み直した最新の索引行（currentRows）と突き合わせ、以下のいずれかに該当する
// 書き込みはスキップする（他デバイスとの競合を安全側に倒す。playlists.ts/retryExtraction.tsと
// 同じ「書き込み直前の再確認」方針）：
// - 行自体が既に無い（削除・リコンサイル済み）
// - 対象フィールドのoverrideが既に空でない（この一括正規化の対象選定後、実行までの間に
//   他デバイス・別の操作がこの曲を手動補正した）
// - 対象フィールドの抽出値自体がチェック時点（expectedSourceValue）から変わっている
//   （overrideは空のままでも、別デバイス・再スキャンが元のタグ自体を書き換えていた場合、
//   チェック時点の古い候補をそのまま書き込むと新しい値を意図せず上書きしてしまう）
export function buildCasingRowUpdates(writes: CasingWrite[], currentRows: Row[]): BuildCasingRowUpdatesResult {
  const rowByFileId = new Map<string, { rowNumber: number; row: Row }>();
  currentRows.forEach((row, i) => {
    const fileId = String(row[FILE_ID_INDEX] ?? "");
    if (fileId) rowByFileId.set(fileId, { rowNumber: i + 2, row });
  });
  const updatesByRowNumber = new Map<number, Row>();
  const applied: AppliedCasingWrite[] = [];
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
    const overrideIdx = col(overrideColumnName(write.field));
    const row = updatesByRowNumber.get(current.rowNumber) ?? [...current.row];
    row[overrideIdx] = write.value;
    updatesByRowNumber.set(current.rowNumber, row);
    applied.push({ ...write, rowNumber: current.rowNumber });
  }
  return {
    updates: [...updatesByRowNumber.entries()].map(([rowNumber, row]) => ({ rowNumber, row })),
    applied,
    skippedStaleCount,
  };
}

export interface BuildCasingRevertUpdatesResult {
  updates: { rowNumber: number; row: Row }[];
  // 実際に元に戻す対象になった（これから書き込む）エントリ。
  revertedEntries: AppliedCasingWrite[];
  // 行が既に無い、またはoverrideの現在値がこのツールが書いた値と異なっていたエントリ。
  // 一度でも不一致を観測した時点で「今の値が自分の書き込み由来である」という前提
  // （provenance）は失われるため、呼び出し元はこれらをlastApplied（undo対象）から
  // 永久に取り除く必要がある（ChatGPTレビュー再指摘：staleと判定された後もundo対象に
  // 残り続けると、後日ユーザーが偶然/意図的に同じ値へ手動で書き換えた場合、次回の
  // 「元に戻す」がその後日の手動変更を誤って消してしまう）。
  staleEntries: AppliedCasingWrite[];
  revertedCount: number;
  skippedStaleCount: number;
}

// 「元に戻す」：このツールが書き込んだoverride（applied、buildCasingRowUpdatesの戻り値）だけを
// 対象に空欄へ戻す。書き込み直前の再確認と同様、現在のoverride値がこのツールが書いた値のまま
// （誰にも触られていない）場合だけ空欄に戻す。他の値に変わっていた場合はスキップする
// （このツールが関知しない後続の変更を巻き戻さないため）。
export function buildCasingRevertUpdates(applied: AppliedCasingWrite[], currentRows: Row[]): BuildCasingRevertUpdatesResult {
  const rowByFileId = new Map<string, { rowNumber: number; row: Row }>();
  currentRows.forEach((row, i) => {
    const fileId = String(row[FILE_ID_INDEX] ?? "");
    if (fileId) rowByFileId.set(fileId, { rowNumber: i + 2, row });
  });
  const updatesByRowNumber = new Map<number, Row>();
  const revertedEntries: AppliedCasingWrite[] = [];
  const staleEntries: AppliedCasingWrite[] = [];
  for (const write of applied) {
    const current = rowByFileId.get(write.fileId);
    const overrideIdx = col(overrideColumnName(write.field));
    if (!current || cell(current.row, overrideColumnName(write.field)) !== write.value) {
      staleEntries.push(write);
      continue;
    }
    const row = updatesByRowNumber.get(current.rowNumber) ?? [...current.row];
    row[overrideIdx] = "";
    updatesByRowNumber.set(current.rowNumber, row);
    revertedEntries.push(write);
  }
  return {
    updates: [...updatesByRowNumber.entries()].map(([rowNumber, row]) => ({ rowNumber, row })),
    revertedEntries,
    staleEntries,
    revertedCount: revertedEntries.length,
    skippedStaleCount: staleEntries.length,
  };
}

export interface CasingRowIO {
  listExistingRows(): Promise<Row[]>;
  updateRows(updates: { rowNumber: number; row: Row }[]): Promise<void>;
}

export interface ApplyCasingWritesChunkResult {
  chunkApplied: AppliedCasingWrite[];
  chunkSkippedStaleCount: number;
}

// writesをchunkSizeずつ処理し、各チャンクの直前に索引を読み直してからbuildCasingRowUpdates()で
// 書き込み行を組み立てる（ChatGPTレビュー再指摘：`updateRows()`は対象行を丸ごと上書きするため、
// 一度だけ読んだ最新行のスナップショットを複数バッチにわたって使い回すと、最初のチェック～
// 最後のバッチ書き込みまでの間に他デバイスが同じ行の無関係な列（title・lastScannedAt等）や
// 対象フィールド自体を更新していても、そのバッチの書き込みで古いスナップショットへ巻き戻して
// しまう。各チャンクの直前に読み直すことで、この「古い行の巻き戻し」が起こりうる時間窓を
// 1チャンク分の処理時間まで縮める。完全な単一セル更新ではなく行全体の上書きである点は変わらない
// ため、根本的な排他制御ではなく「事前防止ではなく窓を狭める」という本アプリ全体の既存方針の
// 範囲内の対策である点に留意）。
export async function applyCasingWritesInChunks(
  io: CasingRowIO,
  writes: CasingWrite[],
  onChunkWritten: (result: ApplyCasingWritesChunkResult) => void,
  chunkSize = WRITE_BATCH_SIZE
): Promise<void> {
  for (let i = 0; i < writes.length; i += chunkSize) {
    const chunk = writes.slice(i, i + chunkSize);
    const currentRows = await io.listExistingRows();
    const { updates, applied, skippedStaleCount } = buildCasingRowUpdates(chunk, currentRows);
    if (updates.length > 0) await io.updateRows(updates);
    onChunkWritten({ chunkApplied: applied, chunkSkippedStaleCount: skippedStaleCount });
  }
}

export interface RevertCasingWritesChunkResult {
  chunkReverted: AppliedCasingWrite[];
  // このチャンクで永久にstaleと判定されたエントリ（行が無い、またはoverrideの現在値が
  // 書き込んだ値と異なる）。呼び出し元はこれをlastAppliedから即座に取り除く必要がある
  // （buildCasingRevertUpdatesのstaleEntries参照）。
  chunkStale: AppliedCasingWrite[];
}

// applyCasingWritesInChunks()と同じ理由（行全体上書きの巻き戻しリスクを縮める）で、
// 各チャンクの直前に索引を読み直す。
export async function revertCasingWritesInChunks(
  io: CasingRowIO,
  applied: AppliedCasingWrite[],
  onChunkWritten: (result: RevertCasingWritesChunkResult) => void,
  chunkSize = WRITE_BATCH_SIZE
): Promise<void> {
  for (let i = 0; i < applied.length; i += chunkSize) {
    const chunk = applied.slice(i, i + chunkSize);
    const currentRows = await io.listExistingRows();
    const { updates, revertedEntries, staleEntries } = buildCasingRevertUpdates(chunk, currentRows);
    if (updates.length > 0) await io.updateRows(updates);
    onChunkWritten({ chunkReverted: revertedEntries, chunkStale: staleEntries });
  }
}
