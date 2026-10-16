// ライブラリの「検索」→ヒットした曲の一覧→一覧から再生リストへ追加、を繰り返して再生リストを
// 作る導線の、表示まわりの純粋ロジック（2026-10-16、ユーザー要望：再生リストを作るときに、
// どの曲を入れようか探す導線が無い）。DOM操作自体はmain.tsが担う。
import type { Song } from "./catalog";

// 一覧に描画する最大件数。全曲が対象になる条件では数万曲がヒットしうるため、DOMを膨らませない
// よう先頭だけ表示する。件数の表示と「すべて追加」は表示件数に関わらず全ヒット分が対象。
export const SEARCH_RESULT_DISPLAY_LIMIT = 200;

export interface SearchResultView {
  // 一覧に描画する曲（先頭から上限まで）。
  shown: Song[];
  // 全ヒット件数。
  total: number;
  // 上限を超えて描画しなかった件数。
  hiddenCount: number;
  // 全ヒットのうち、既に再生リストに入っていて再生対象の件数（「追加済み」）。
  inQueueCount: number;
  // 全ヒットのうち、既に再生リストに入っているが除外中（チェックなし）の件数。足し直しても
  // 除外のままで再生されないため、「追加済み」とは別に数える。
  excludedCount: number;
  // 全ヒットのうち、まだ再生リストに入っておらず「すべて追加」で足せる件数。
  addableCount: number;
  // 一覧の上に出す要約。
  summary: string;
}

// results === null は「まだ検索していない」。0件ヒット（空配列）とは区別する。
export function buildSearchResultView(
  results: Song[] | null,
  inQueueIds: ReadonlySet<string>,
  excludedIds: ReadonlySet<string> = new Set(),
  limit: number = SEARCH_RESULT_DISPLAY_LIMIT
): SearchResultView {
  const empty = { shown: [], total: 0, hiddenCount: 0, inQueueCount: 0, excludedCount: 0, addableCount: 0 };
  if (results === null) return { ...empty, summary: "" };
  if (results.length === 0) return { ...empty, summary: "条件に合う曲がありませんでした。" };
  let inQueueCount = 0;
  let excludedCount = 0;
  for (const song of results) {
    if (!inQueueIds.has(song.fileId)) continue;
    if (excludedIds.has(song.fileId)) excludedCount += 1;
    else inQueueCount += 1;
  }
  const shown = results.slice(0, limit);
  const hiddenCount = results.length - shown.length;
  const notes: string[] = [];
  if (inQueueCount > 0) notes.push(`${inQueueCount}曲は再生リストに追加済み`);
  if (excludedCount > 0) notes.push(`${excludedCount}曲は除外中`);
  let summary = `${results.length}曲ヒット${notes.length > 0 ? `（うち${notes.join("、")}）` : ""}。`;
  if (hiddenCount > 0) summary += `先頭${limit}曲を表示しています（「すべて追加」は${results.length}曲すべてが対象です）。`;
  return { shown, total: results.length, hiddenCount, inQueueCount, excludedCount, addableCount: results.length - inQueueCount - excludedCount, summary };
}

// 再生リストへ曲を足した結果のステータス文言。attempted：足そうとした曲数、added：実際に足せた
// 曲数、alreadyExcluded：既に入っていて除外中だった曲数（除外のままで再生されないため別に案内）、
// total：足した後の再生リストの合計曲数。
export function appendStatusMessage(attempted: number, added: number, alreadyExcluded: number, total: number): string {
  const skipped = attempted - added;
  const excludedNote = alreadyExcluded > 0 ? `${alreadyExcluded}曲は除外中のため再生されません（チェックを入れると再生対象になります）。` : "";
  if (added === 0) return `条件に合う${attempted}曲はすべて再生リストに入っています（合計${total}曲）。${excludedNote}`;
  return `${added}曲を再生リストに追加しました${skipped > 0 ? `（${skipped}曲は既に入っているため除く）` : ""}。合計${total}曲。${excludedNote}`;
}
