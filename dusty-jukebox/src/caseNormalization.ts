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

import { INDEX_SHEET_HEADER } from "./sheets";

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
      for (const fileId of variant.fileIds) writes.push({ field: group.field, fileId, value: canonical });
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
    if (!current || hasOverride(current.row, write.field)) {
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
  let revertedCount = 0;
  let skippedStaleCount = 0;
  for (const write of applied) {
    const current = rowByFileId.get(write.fileId);
    const overrideIdx = col(overrideColumnName(write.field));
    if (!current || cell(current.row, overrideColumnName(write.field)) !== write.value) {
      skippedStaleCount++;
      continue;
    }
    const row = updatesByRowNumber.get(current.rowNumber) ?? [...current.row];
    row[overrideIdx] = "";
    updatesByRowNumber.set(current.rowNumber, row);
    revertedCount++;
  }
  return { updates: [...updatesByRowNumber.entries()].map(([rowNumber, row]) => ({ rowNumber, row })), revertedCount, skippedStaleCount };
}
