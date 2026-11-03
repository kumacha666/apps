import { describe, expect, test } from "vitest";
import type { AlbumArtRecord } from "./albumArtSheet";
import { WebSearchError } from "./albumArtSearch";
import {
  chosenRecord,
  createReviewSearch,
  isSameArtRecord,
  looseITunesCandidates,
  looseMusicBrainzCandidates,
  recordsForView,
  rejectedRecord,
  sourcePageUrl,
} from "./albumArtReview";

const rec = (album: string, artist: string, source: AlbumArtRecord["source"], extra: Partial<AlbumArtRecord> = {}): AlbumArtRecord => ({
  albumFolderId: `f-${album}`,
  album,
  artist,
  embedded: "no",
  artFileId: source === "notfound" || source === "rejected" ? "" : `img-${album}`,
  source,
  sourceId: "",
  checkedFileId: "",
  updatedAt: "",
  match: "",
  ...extra,
});

test("recordsForView：表示の種類ごとに絞り、アーティスト→アルバム名の順に並べる", () => {
  const records = [
    rec("B", "Zeta", "musicbrainz"),
    rec("A", "Alpha", "itunes"),
    rec("C", "Alpha", "embedded"),
    rec("D", "", "notfound"),
    rec("E", "X", "rejected"),
    rec("F", "X", "error"),
  ];
  expect(recordsForView(records, "web").map((r) => r.album)).toEqual(["A", "B"]);
  expect(recordsForView(records, "notfound").map((r) => r.album)).toEqual(["D"]);
  expect(recordsForView(records, "rejected").map((r) => r.album)).toEqual(["E"]);
  expect(recordsForView(records, "error").map((r) => r.album)).toEqual(["F"]);
  expect(recordsForView(records, "embedded").map((r) => r.album)).toEqual(["C"]);
  expect(recordsForView(records, "all").map((r) => r.album)).toEqual(["D", "A", "C", "E", "F", "B"]);
});

test("recordsForView：AIが探した表紙は、どう見つけたか（確からしさ）で絞れる。自動・手で選んだものとは分ける", () => {
  const records = [
    rec("Auto", "A", "itunes"),
    rec("Exact", "A", "deezer", { match: "ai-exact" }),
    rec("Variant", "A", "itunes", { match: "ai-variant" }),
    rec("Close", "A", "musicbrainz", { match: "ai-close" }),
    rec("Guess", "A", "deezer", { match: "ai-guess" }),
    rec("Manual", "A", "musicbrainz", { match: "manual" }),
    // 外した表紙は、AIが探したものでも外したアルバムの方に出す
    rec("Gone", "A", "rejected"),
  ];
  const albums = (view: Parameters<typeof recordsForView>[1]) => recordsForView(records, view).map((r) => r.album);
  expect(albums("web")).toEqual(["Auto"]);
  expect(albums("ai")).toEqual(["Close", "Exact", "Guess", "Variant"]);
  expect(albums("ai-exact")).toEqual(["Exact"]);
  expect(albums("ai-variant")).toEqual(["Variant"]);
  expect(albums("ai-close")).toEqual(["Close"]);
  expect(albums("ai-guess")).toEqual(["Guess"]);
  expect(albums("manual")).toEqual(["Manual"]);
  expect(albums("rejected")).toEqual(["Gone"]);
});

describe("記録の書き換え", () => {
  test("外す：画像と取得元を消し、rejectedにする（埋め込みの有無・キーはそのまま）", () => {
    const r = rec("A", "Alpha", "itunes", { sourceId: "42" });
    expect(rejectedRecord(r, "now")).toEqual({ ...r, artFileId: "", source: "rejected", sourceId: "", updatedAt: "now", match: "" });
    // AIが探した表紙を外したら、どう見つけたかも消す（外したアルバムとして扱う）
    expect(rejectedRecord({ ...r, match: "ai-guess" }, "now").match).toBe("");
  });
  test("これにする：選んだ候補の画像・取得元に差し替える", () => {
    const r = rec("D", "", "notfound");
    const chosen = chosenRecord(r, { source: "musicbrainz", sourceId: "rg9", imageUrl: "x" }, "img-new", "now");
    expect(chosen).toEqual({ ...r, artFileId: "img-new", source: "musicbrainz", sourceId: "rg9", updatedAt: "now", match: "manual" });
  });
});

test("sourcePageUrl：Webから補完したものだけ取得元のページ", () => {
  expect(sourcePageUrl({ source: "musicbrainz", sourceId: "rg1" })).toBe("https://musicbrainz.org/release-group/rg1");
  expect(sourcePageUrl({ source: "itunes", sourceId: "42" })).toBe("https://music.apple.com/jp/album/42");
  expect(sourcePageUrl({ source: "deezer", sourceId: "7" })).toBe("https://www.deezer.com/album/7");
  expect(sourcePageUrl({ source: "embedded", sourceId: "" })).toBeNull();
  expect(sourcePageUrl({ source: "itunes", sourceId: "" })).toBeNull();
});

describe("別の候補（緩い検索）", () => {
  test("MusicBrainz：照合せずスコア順、小さな画像と選んだときの画像", () => {
    const list = looseMusicBrainzCandidates({
      "release-groups": [
        { id: "a", title: "Other", score: 60, "artist-credit": [{ name: "X" }] },
        { id: "b", title: "Blue", score: 95, "artist-credit": [{ name: "A" }, { name: " & B" }] },
        { title: "no id", score: 100 },
      ],
    });
    expect(list.map((c) => [c.sourceId, c.title, c.artist])).toEqual([
      ["b", "Blue", "A & B"],
      ["a", "Other", "X"],
    ]);
    expect(list[0].previewUrl).toBe("https://coverartarchive.org/release-group/b/front-250");
    expect(list[0].imageUrl).toBe("https://coverartarchive.org/release-group/b/front-500");
  });
  test("iTunes：画像のあるものを並べ、小さな画像は200px・選んだときは600px", () => {
    const list = looseITunesCandidates({
      results: [
        { collectionId: 1, collectionName: "Blue", artistName: "A", artworkUrl100: "https://x/1/100x100bb.jpg" },
        { collectionId: 2, collectionName: "No art", artistName: "A" },
      ],
    });
    expect(list).toEqual([
      { source: "itunes", sourceId: "1", imageUrl: "https://x/1/600x600bb.jpg", previewUrl: "https://x/1/200x200bb.jpg", title: "Blue", artist: "A" },
    ]);
  });
  test("片方が失敗しても、もう片方の候補を出す。両方失敗ならWebSearchError", async () => {
    const onlyItunes = createReviewSearch(async (input) =>
      String(input).includes("musicbrainz")
        ? new Response("busy", { status: 503 })
        : new Response(JSON.stringify({ results: [{ collectionId: 7, collectionName: "Blue", artistName: "A", artworkUrl100: "https://x/7/100x100bb.jpg" }] }))
    );
    expect((await onlyItunes("Blue", "A")).map((c) => c.sourceId)).toEqual(["7"]);
    const none = createReviewSearch(async () => new Response("busy", { status: 503 }));
    await expect(none("Blue", "A")).rejects.toBeInstanceOf(WebSearchError);
  });
});

test("isSameArtRecord：表紙・取得元・更新日時のどれかが変わっていれば別物", () => {
  const shown = rec("A", "Alpha", "itunes", { sourceId: "42", updatedAt: "t1" });
  expect(isSameArtRecord({ ...shown, artist: "renamed" }, shown)).toBe(true);
  expect(isSameArtRecord({ ...shown, artFileId: "img-other" }, shown)).toBe(false);
  expect(isSameArtRecord({ ...shown, source: "rejected" }, shown)).toBe(false);
  expect(isSameArtRecord({ ...shown, sourceId: "43" }, shown)).toBe(false);
  expect(isSameArtRecord({ ...shown, updatedAt: "t2" }, shown)).toBe(false);
});
