import { describe, expect, test } from "vitest";
import { INDEX_SHEET_HEADER } from "./sheets";
import { filterSongs, groupSongsByAlbum, parseIndexRows, readOverride, sortSongs, type Song } from "./catalog";
const row = (values: Record<string, string>): string[] => INDEX_SHEET_HEADER.map((header) => values[header] ?? "");
describe("索引行の読み取り", () => {
  test("overrideの空欄/(none)/値とfileIdフォールバックを扱う", () => {
    const songs = parseIndexRows([row({ fileId: "a", title: "raw", title_override: "Manual", artist: "A", artist_override: "(none)", album: "Al", composer: "Raw composer", composer_override: "Composer", albumArtist: "Raw album artist", albumArtist_override: "Album Artist" }), row({ fileId: "fallback" })]);
    expect(songs[0]).toMatchObject({ title: "Manual", artist: "", album: "Al", composer: "Composer", albumArtist: "Album Artist" }); expect(songs[1].title).toBe("fallback");
  });
  test.each(["composer", "albumArtist"] as const)("%s overrideの空欄/(none)/補正値を扱う", (field) => {
    expect(readOverride(row({ [field]: "Extracted" }), field)).toBe("Extracted");
    expect(readOverride(row({ [field]: "Extracted", [`${field}_override`]: "(none)" }), field)).toBe("");
    expect(readOverride(row({ [field]: "Extracted", [`${field}_override`]: "Corrected" }), field)).toBe("Corrected");
  });
  test("同じfileIdは先に現れた行だけを採用する", () => {
    const songs = parseIndexRows([row({ fileId: "duplicate", title: "first" }), row({ fileId: "duplicate", title: "later" }), row({ fileId: "unique" })]);
    expect(songs.map((song) => song.fileId)).toEqual(["duplicate", "unique"]);
    expect(songs[0].title).toBe("first");
  });
});
const song = (v: Partial<Song>): Song => ({ fileId: "id", parentId: "p", title: "t", artist: "", album: "", composer: "", albumArtist: "", genre: "", releaseYear: "", discNumber: "", trackNumber: "", ...v });
describe("絞り込みとソート", () => {
  test("artist、genre、年範囲をANDで適用し年不明を切替える", () => {
    const songs = [song({ fileId: "1", artist: "Alpha", genre: "Rock", releaseYear: "1999" }), song({ fileId: "2", artist: "Alpha", genre: "Rock" }), song({ fileId: "3", artist: "Beta", genre: "Rock", releaseYear: "2000" })];
    expect(filterSongs(songs, { artist: "ALP", genre: "rock", minYear: 1990, maxYear: 2000, includeUnknownYear: false }).map((s) => s.fileId)).toEqual(["1"]);
    expect(filterSongs(songs, { artist: "alpha", includeUnknownYear: true }).map((s) => s.fileId)).toEqual(["1", "2"]);
    expect(filterSongs([song({ fileId: "multi", genre: "Soundtrack / Game" })], { genre: "game", includeUnknownYear: true }).map((s) => s.fileId)).toEqual(["multi"]);
    expect(filterSongs([song({ fileId: "unknown", releaseYear: "  " })], { minYear: 1990, includeUnknownYear: true }).map((s) => s.fileId)).toEqual(["unknown"]);
    expect(filterSongs([song({ fileId: "unknown", releaseYear: "not-a-year" })], { includeUnknownYear: false }).map((s) => s.fileId)).toEqual([]);
  });
  test("queryは4フィールドのOR部分一致、album/composerと既存条件はANDで適用する", () => {
    const songs = [
      song({ fileId: "title", title: "Moonlight", artist: "Alpha", album: "Suite", composer: "Beethoven", genre: "Classical" }),
      song({ fileId: "artist", title: "Other", artist: "Moon Band", album: "Live", composer: "Writer" }),
      song({ fileId: "album", title: "Other", artist: "Alpha", album: "Moon Album", composer: "Writer" }),
      song({ fileId: "composer", title: "Other", artist: "Alpha", album: "Suite", composer: "Moon Composer", genre: "Classical" }),
    ];
    expect(filterSongs(songs, { query: "MOON", includeUnknownYear: true }).map((s) => s.fileId)).toEqual(["title", "artist", "album", "composer"]);
    expect(filterSongs(songs, { query: "", includeUnknownYear: true })).toHaveLength(4);
    expect(filterSongs(songs, { album: "sui", includeUnknownYear: true }).map((s) => s.fileId)).toEqual(["title", "composer"]);
    expect(filterSongs(songs, { composer: "WRIT", includeUnknownYear: true }).map((s) => s.fileId)).toEqual(["artist", "album"]);
    expect(filterSongs(songs, { query: "moon", artist: "alpha", album: "suite", composer: "beeth", genre: "classical", includeUnknownYear: true }).map((s) => s.fileId)).toEqual(["title"]);
  });
  test("年、artist、album、disc、trackを数値順でソートする", () => {
    expect(sortSongs([song({ fileId: "10", releaseYear: "2000", artist: "A", album: "X", discNumber: "1", trackNumber: "10" }), song({ fileId: "2", releaseYear: "2000", artist: "A", album: "X", discNumber: "1", trackNumber: "2" }), song({ fileId: "disc2", releaseYear: "2000", artist: "A", album: "X", discNumber: "2", trackNumber: "1" }), song({ fileId: "unknown" })]).map((s) => s.fileId)).toEqual(["2", "10", "disc2", "unknown"]);
  });
});
describe("アルバムグルーピング", () => {
  test("同じアルバムと代表アーティストでもparentIdが異なれば別グループにする", () => {
    const groups = groupSongsByAlbum([
      song({ fileId: "original", parentId: "release-original", album: "Same Album", artist: "Track Artist", albumArtist: "Album Artist" }),
      song({ fileId: "remaster", parentId: "release-remaster", album: "Same Album", artist: "Other Track Artist", albumArtist: "Album Artist" }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.songs.map((item) => item.fileId))).toEqual([["original"], ["remaster"]]);
  });
  test("代表アーティストでまとめ、空アルバムを除外し、グループと曲を規定順に並べる", () => {
    const groups = groupSongsByAlbum([
      song({ fileId: "non-numeric", album: "Beta", artist: "Track Artist", albumArtist: "Various", discNumber: "x", trackNumber: "1" }),
      song({ fileId: "track-10", album: "Beta", artist: "Other", albumArtist: "Various", discNumber: "1", trackNumber: "10" }),
      song({ fileId: "track-2", album: "Beta", artist: "Other", albumArtist: "Various", discNumber: "1", trackNumber: "2" }),
      song({ fileId: "fallback", album: "Alpha", artist: "Fallback Artist", albumArtist: "" }),
      song({ fileId: "other-artist", album: "Alpha", artist: "Another Artist", albumArtist: "" }),
      song({ fileId: "blank", album: "  ", artist: "Ignored" }),
    ]);
    expect(groups.map(({ album, albumArtist }) => [album, albumArtist])).toEqual([["Alpha", "Another Artist"], ["Alpha", "Fallback Artist"], ["Beta", "Various"]]);
    expect(groups[2].songs.map((s) => s.fileId)).toEqual(["track-2", "track-10", "non-numeric"]);
  });
});
