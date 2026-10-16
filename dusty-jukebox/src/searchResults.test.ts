import { describe, expect, test } from "vitest";
import { appendStatusMessage, buildSearchResultView, SEARCH_RESULT_DISPLAY_LIMIT } from "./searchResults";
import type { Song } from "./catalog";

const song = (fileId: string): Song => ({ fileId, parentId: "p", title: fileId, artist: "", album: "", composer: "", albumArtist: "", genre: "", releaseYear: "", discNumber: "", trackNumber: "", releaseType: "" });
const songs = (n: number): Song[] => Array.from({ length: n }, (_, i) => song(`s${i}`));

// 検索ボタン→ヒットした曲の一覧→一覧から再生リストへ追加、を繰り返して再生リストを作る導線
// （2026-10-16、ユーザー要望：再生リストを作るときに、どの曲を入れようか探す導線が無い）。
describe("buildSearchResultView", () => {
  test("まだ検索していない（null）場合は何も表示しない", () => {
    const view = buildSearchResultView(null, new Set());
    expect(view).toMatchObject({ shown: [], total: 0, addableCount: 0, summary: "" });
  });

  test("0件ヒットは、その旨の案内を出し、追加できる曲は0", () => {
    const view = buildSearchResultView([], new Set());
    expect(view.total).toBe(0);
    expect(view.addableCount).toBe(0);
    expect(view.summary).toBe("条件に合う曲がありませんでした。");
  });

  test("ヒット件数と、再生リストに追加済みの件数・まだ追加できる件数を数える", () => {
    const view = buildSearchResultView(songs(5), new Set(["s1", "s3"]));
    expect(view.total).toBe(5);
    expect(view.inQueueCount).toBe(2);
    expect(view.addableCount).toBe(3);
    expect(view.summary).toContain("5曲ヒット");
    expect(view.summary).toContain("2曲は再生リストに追加済み");
    expect(view.hiddenCount).toBe(0);
  });

  // 除外中の曲は再生リストには入っているが再生されない。「追加済み」と同じに扱うと、再生されない
  // のに追加できたように読めるため、別枠で数える。
  test("再生リストに入っていて除外中の曲は、追加済みとは別に数える", () => {
    const view = buildSearchResultView(songs(5), new Set(["s1", "s3", "s4"]), new Set(["s3"]));
    expect(view.inQueueCount).toBe(2);
    expect(view.excludedCount).toBe(1);
    expect(view.addableCount).toBe(2);
    expect(view.summary).toContain("2曲は再生リストに追加済み");
    expect(view.summary).toContain("1曲は除外中");
  });

  test("ヒットがすべて除外中なら、追加できる曲は0（除外中の案内は出る）", () => {
    const view = buildSearchResultView(songs(2), new Set(["s0", "s1"]), new Set(["s0", "s1"]));
    expect(view.addableCount).toBe(0);
    expect(view.excludedCount).toBe(2);
    expect(view.summary).toContain("2曲は除外中");
  });

  test("全部追加済みなら、追加できる曲は0", () => {
    const view = buildSearchResultView(songs(2), new Set(["s0", "s1"]));
    expect(view.addableCount).toBe(0);
  });

  test("表示は先頭の上限件数までで、残りは件数だけ案内する（件数・追加対象は全件分）", () => {
    const view = buildSearchResultView(songs(SEARCH_RESULT_DISPLAY_LIMIT + 50), new Set());
    expect(view.shown).toHaveLength(SEARCH_RESULT_DISPLAY_LIMIT);
    expect(view.shown[0].fileId).toBe("s0");
    expect(view.total).toBe(SEARCH_RESULT_DISPLAY_LIMIT + 50);
    expect(view.hiddenCount).toBe(50);
    expect(view.addableCount).toBe(SEARCH_RESULT_DISPLAY_LIMIT + 50);
    expect(view.summary).toContain(`先頭${SEARCH_RESULT_DISPLAY_LIMIT}曲を表示`);
  });

  test("上限ちょうどなら、非表示の案内は出さない", () => {
    const view = buildSearchResultView(songs(SEARCH_RESULT_DISPLAY_LIMIT), new Set());
    expect(view.hiddenCount).toBe(0);
    expect(view.summary).not.toContain("先頭");
  });
});

describe("appendStatusMessage", () => {
  test("足せた曲があれば、件数と合計を伝える", () => {
    expect(appendStatusMessage(3, 3, 0, 10)).toBe("3曲を再生リストに追加しました。合計10曲。");
  });

  test("一部が既に入っていれば、その件数も伝える", () => {
    expect(appendStatusMessage(5, 3, 0, 10)).toBe("3曲を再生リストに追加しました（2曲は既に入っているため除く）。合計10曲。");
  });

  test("全部が既に入っていれば、足していないことを伝える", () => {
    expect(appendStatusMessage(2, 0, 0, 7)).toBe("条件に合う2曲はすべて再生リストに入っています（合計7曲）。");
  });

  // 除外中の曲は足し直しても除外のままで再生されない。「入っています」だけだと再生されるように読める。
  test("既に入っていて除外中の曲があれば、再生されない旨を案内する", () => {
    expect(appendStatusMessage(2, 0, 1, 7)).toContain("1曲は除外中のため再生されません（チェックを入れると再生対象になります）。");
    expect(appendStatusMessage(3, 1, 1, 7)).toContain("1曲は除外中のため再生されません");
  });
});
