import { describe, expect, test } from "vitest";
import {
  artistMatches,
  createWebArtSearch,
  iTunesCandidates,
  musicBrainzCandidates,
  musicBrainzSearchUrl,
  normalizeForMatch,
  Throttle,
  titleMatches,
  WebSearchError,
} from "./albumArtSearch";

describe("名前の照合", () => {
  test("全角・大文字小文字・記号・空白の違いは同じとみなす", () => {
    expect(normalizeForMatch("Ａｂｂｅｙ  Road!")).toBe("abbeyroad");
    expect(titleMatches("ABBEY ROAD", "Abbey Road")).toBe(true);
    expect(titleMatches("Ｍｅｌｏｄｙ～愛～", "Melody 愛")).toBe(true);
  });
  test("括弧の付記（Remastered・Disc・初回盤）は無視してよい。違うアルバム名は一致しない", () => {
    expect(titleMatches("Abbey Road", "Abbey Road (Remastered)")).toBe(true);
    expect(titleMatches("ベスト【初回盤】", "ベスト")).toBe(true);
    expect(titleMatches("Abbey Road", "Let It Be")).toBe(false);
    expect(titleMatches("", "x")).toBe(false);
  });
  test("アーティストは片方がもう片方を含めばよい。探す側が空なら比べない", () => {
    expect(artistMatches("The Beatles", "Beatles, The")).toBe(false);
    expect(artistMatches("Beatles", "The Beatles")).toBe(true);
    expect(artistMatches("ずっと真夜中でいいのに。", "ずっと真夜中でいいのに")).toBe(true);
    expect(artistMatches("", "anything")).toBe(true);
    expect(artistMatches("A", "")).toBe(false);
  });
});

describe("MusicBrainz", () => {
  test("検索の式：引用符と\\を逃がし、アーティストが無ければアルバム名だけ", () => {
    const url = decodeURIComponent(musicBrainzSearchUrl('Say "Hi"', "A\\B"));
    expect(url).toContain('releasegroup:"Say \\"Hi\\"" AND artist:"A\\\\B"');
    expect(decodeURIComponent(musicBrainzSearchUrl("X", ""))).toContain('query=releasegroup:"X"&');
  });
  test("スコア80以上・アルバム名とアーティストが一致する候補を、スコアの高い順に最大3件", () => {
    const response = {
      "release-groups": [
        { id: "low", title: "Blue", score: 70, "artist-credit": [{ name: "A" }] },
        { id: "other", title: "Red", score: 100, "artist-credit": [{ name: "A" }] },
        { id: "wrongArtist", title: "Blue", score: 100, "artist-credit": [{ name: "Z" }] },
        { id: "ok2", title: "Blue (Deluxe)", score: 90, "artist-credit": [{ name: "A" }] },
        { id: "ok1", title: "Blue", score: 95, "artist-credit": [{ artist: { name: "A" } }] },
      ],
    };
    expect(musicBrainzCandidates(response, "Blue", "A")).toEqual([
      { source: "musicbrainz", sourceId: "ok1", imageUrl: "https://coverartarchive.org/release-group/ok1/front-500" },
      { source: "musicbrainz", sourceId: "ok2", imageUrl: "https://coverartarchive.org/release-group/ok2/front-500" },
    ]);
    expect(musicBrainzCandidates({}, "Blue", "A")).toEqual([]);
  });
});

test("iTunes：一致する候補の画像を600×600に指定し直す", () => {
  const response = {
    results: [
      { collectionId: 1, collectionName: "Other", artistName: "A", artworkUrl100: "https://x/a/100x100bb.jpg" },
      { collectionId: 2, collectionName: "Blue - EP", artistName: "A", artworkUrl100: "https://x/b/100x100bb.jpg" },
      { collectionId: 3, collectionName: "Blue", artistName: "A & B", artworkUrl100: "https://x/c/100x100bb.jpg" },
    ],
  };
  expect(iTunesCandidates(response, "Blue", "A")).toEqual([{ source: "itunes", sourceId: "3", imageUrl: "https://x/c/600x600bb.jpg" }]);
});

test("Throttle：呼び出しの間隔を空ける", async () => {
  let now = 0;
  const waits: number[] = [];
  const throttle = new Throttle(1000, () => now, async (ms) => {
    waits.push(ms);
    now += ms;
  });
  await throttle.wait();
  await throttle.wait();
  now += 300;
  await throttle.wait();
  expect(waits).toEqual([1000, 700]);
});

test("createWebArtSearch：通信・応答の失敗はWebSearchError", async () => {
  const failing = createWebArtSearch(async () => new Response("busy", { status: 503 }));
  await expect(failing.musicBrainz("Blue", "A")).rejects.toBeInstanceOf(WebSearchError);
  const offline = createWebArtSearch(async () => {
    throw new TypeError("network");
  });
  await expect(offline.iTunes("Blue", "A")).rejects.toBeInstanceOf(WebSearchError);
});
