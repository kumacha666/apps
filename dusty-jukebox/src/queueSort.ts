import type { Song } from "./catalog";

// 再生リストの手動並び替え機能（普通の音楽プレイヤーにある「並び替え」に相当）。
// catalog.tsのsortSongs()（絞り込みで新規に再生リストを作る際に自動適用される既定の並び
// ＝releaseYear→artist→album→discNumber→trackNumber）とは別物：こちらはユーザーが
// 既存の再生リストに対して都度選ぶ、明示的な並び替え操作。

export const QUEUE_SORT_FIELDS = ["title", "artist", "album", "releaseYear"] as const;
export type QueueSortField = (typeof QUEUE_SORT_FIELDS)[number];
export type QueueSortDirection = "asc" | "desc";

// localeCompareは使わず単純な文字コード順にする（caseNormalization.ts等、本リポジトリの
// 既存の慣例と同じ理由：localeCompareの結果はICUデータの有無・バージョンに依存し
// 環境によって変わりうるため）。空欄は昇順・降順どちらでも常に末尾に置く
// （アーティスト/アルバム不明の曲がソート方向によって先頭に来ないようにするため）。
function compareStrings(a: string, b: string, direction: QueueSortDirection): number {
  const aEmpty = a === "";
  const bEmpty = b === "";
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;
  if (a === b) return 0;
  const cmp = a < b ? -1 : 1;
  return direction === "asc" ? cmp : -cmp;
}

function numericValue(value: string): number {
  const n = Number(value);
  return value.trim() !== "" && Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
}

// 数値フィールド（リリース年等）も文字列フィールドと同じ「不明な値は常に末尾」方針にする。
function compareNumeric(a: string, b: string, direction: QueueSortDirection): number {
  const av = numericValue(a);
  const bv = numericValue(b);
  const aUnknown = !Number.isFinite(av);
  const bUnknown = !Number.isFinite(bv);
  if (aUnknown && bUnknown) return 0;
  if (aUnknown) return 1;
  if (bUnknown) return -1;
  return direction === "asc" ? av - bv : bv - av;
}

// アーティスト・アルバムでソートする際の副次キー：同じアルバム内はディスク番号→トラック番号→
// タイトルの順で安定させる（普通の音楽プレイヤーの「アーティスト別」「アルバム別」表示と同じ
// 挙動）。並び替え方向（昇順/降順）の影響は受けない＝グループ内は常に自然な再生順を保つ。
function albumOrderTiebreak(a: Song, b: Song): number {
  const albumCmp = compareStrings(a.album, b.album, "asc");
  if (albumCmp !== 0) return albumCmp;
  const discCmp = compareNumeric(a.discNumber, b.discNumber, "asc");
  if (discCmp !== 0) return discCmp;
  const trackCmp = compareNumeric(a.trackNumber, b.trackNumber, "asc");
  if (trackCmp !== 0) return trackCmp;
  return compareStrings(a.title, b.title, "asc");
}

export function compareSongsForQueueSort(a: Song, b: Song, field: QueueSortField, direction: QueueSortDirection): number {
  switch (field) {
    case "title":
      return compareStrings(a.title, b.title, direction) || compareStrings(a.fileId, b.fileId, "asc");
    case "artist": {
      const cmp = compareStrings(a.artist, b.artist, direction);
      return cmp !== 0 ? cmp : albumOrderTiebreak(a, b);
    }
    case "album": {
      const cmp = compareStrings(a.album, b.album, direction);
      return cmp !== 0 ? cmp : albumOrderTiebreak(a, b);
    }
    case "releaseYear":
      return compareNumeric(a.releaseYear, b.releaseYear, direction) || compareStrings(a.title, b.title, "asc");
    default: {
      const exhaustive: never = field;
      return exhaustive;
    }
  }
}

// 破壊的変更をしない純粋関数（呼び出し元、queue.tsのPlaybackQueue.sortBy()が配列を差し替える）。
export function sortSongsForQueue(songs: Song[], field: QueueSortField, direction: QueueSortDirection): Song[] {
  return [...songs].sort((a, b) => compareSongsForQueueSort(a, b, field, direction));
}
