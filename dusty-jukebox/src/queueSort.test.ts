import { describe, expect, it } from "vitest";
import type { Song } from "./catalog";
import { compareSongsForQueueSort, sortSongsForQueue } from "./queueSort";

function makeSong(overrides: Partial<Song> & { fileId: string }): Song {
  return {
    parentId: "",
    title: "",
    artist: "",
    album: "",
    genre: "",
    composer: "",
    albumArtist: "",
    releaseYear: "",
    discNumber: "",
    trackNumber: "",
    releaseType: "",
    ...overrides,
  };
}

describe("sortSongsForQueue", () => {
  it("sorts by title ascending/descending without mutating the input array", () => {
    const songs = [makeSong({ fileId: "1", title: "Banana" }), makeSong({ fileId: "2", title: "Apple" })];
    const original = [...songs];
    const asc = sortSongsForQueue(songs, "title", "asc");
    expect(asc.map((s) => s.fileId)).toEqual(["2", "1"]);
    const desc = sortSongsForQueue(songs, "title", "desc");
    expect(desc.map((s) => s.fileId)).toEqual(["1", "2"]);
    expect(songs).toEqual(original);
  });

  it("puts songs with an empty title at the end regardless of direction", () => {
    const songs = [makeSong({ fileId: "1", title: "" }), makeSong({ fileId: "2", title: "Zebra" })];
    expect(sortSongsForQueue(songs, "title", "asc").map((s) => s.fileId)).toEqual(["2", "1"]);
    expect(sortSongsForQueue(songs, "title", "desc").map((s) => s.fileId)).toEqual(["2", "1"]);
  });

  it("sorts by artist, then groups each artist's songs by album/disc/track regardless of direction", () => {
    const songs = [
      makeSong({ fileId: "1", artist: "B", album: "Y", discNumber: "1", trackNumber: "2" }),
      makeSong({ fileId: "2", artist: "A", album: "X", discNumber: "1", trackNumber: "2" }),
      makeSong({ fileId: "3", artist: "A", album: "X", discNumber: "1", trackNumber: "1" }),
    ];
    const asc = sortSongsForQueue(songs, "artist", "asc");
    expect(asc.map((s) => s.fileId)).toEqual(["3", "2", "1"]);
    // 降順でもアーティストAの中の曲順（トラック順）自体は変わらない。
    const desc = sortSongsForQueue(songs, "artist", "desc");
    expect(desc.map((s) => s.fileId)).toEqual(["1", "3", "2"]);
  });

  it("sorts by album, then by disc/track number within the album", () => {
    const songs = [
      makeSong({ fileId: "1", album: "Best", discNumber: "1", trackNumber: "10" }),
      makeSong({ fileId: "2", album: "Best", discNumber: "1", trackNumber: "2" }),
      makeSong({ fileId: "3", album: "Aaa" }),
    ];
    expect(sortSongsForQueue(songs, "album", "asc").map((s) => s.fileId)).toEqual(["3", "2", "1"]);
  });

  it("sorts numerically by releaseYear, not lexicographically, and pushes unknown years last in both directions", () => {
    const songs = [
      makeSong({ fileId: "1", releaseYear: "2" }),
      makeSong({ fileId: "2", releaseYear: "10" }),
      makeSong({ fileId: "3", releaseYear: "" }),
    ];
    expect(sortSongsForQueue(songs, "releaseYear", "asc").map((s) => s.fileId)).toEqual(["1", "2", "3"]);
    expect(sortSongsForQueue(songs, "releaseYear", "desc").map((s) => s.fileId)).toEqual(["2", "1", "3"]);
  });
});

describe("compareSongsForQueueSort", () => {
  it("breaks ties on identical titles by fileId for a deterministic order", () => {
    const a = makeSong({ fileId: "b", title: "Same" });
    const b = makeSong({ fileId: "a", title: "Same" });
    expect(compareSongsForQueueSort(a, b, "title", "asc")).toBeGreaterThan(0);
  });
});
