import { describe, expect, test } from "vitest";
import { INDEX_SHEET_HEADER } from "./sheets";
import { filterSongs, parseIndexRows, sortSongs, type Song } from "./catalog";
const row = (values: Record<string, string>): string[] => INDEX_SHEET_HEADER.map((header) => values[header] ?? "");
describe("索引行の読み取り", () => {
  test("overrideの空欄/(none)/値とfileIdフォールバックを扱う", () => {
    const songs = parseIndexRows([row({ fileId: "a", title: "raw", title_override: "Manual", artist: "A", artist_override: "(none)", album: "Al" }), row({ fileId: "fallback" })]);
    expect(songs[0]).toMatchObject({ title: "Manual", artist: "", album: "Al" }); expect(songs[1].title).toBe("fallback");
  });
});
const song = (v: Partial<Song>): Song => ({ fileId: "id", parentId: "p", title: "t", artist: "", album: "", genre: "", releaseYear: "", discNumber: "", trackNumber: "", ...v });
describe("絞り込みとソート", () => {
  test("artist、genre、年範囲をANDで適用し年不明を切替える", () => {
    const songs = [song({ fileId: "1", artist: "Alpha", genre: "Rock", releaseYear: "1999" }), song({ fileId: "2", artist: "Alpha", genre: "Rock" }), song({ fileId: "3", artist: "Beta", genre: "Rock", releaseYear: "2000" })];
    expect(filterSongs(songs, { artist: "ALP", genre: "rock", minYear: 1990, maxYear: 2000, includeUnknownYear: false }).map((s) => s.fileId)).toEqual(["1"]);
    expect(filterSongs(songs, { artist: "alpha", includeUnknownYear: true }).map((s) => s.fileId)).toEqual(["1", "2"]);
    expect(filterSongs([song({ fileId: "multi", genre: "Soundtrack / Game" })], { genre: "game", includeUnknownYear: true }).map((s) => s.fileId)).toEqual(["multi"]);
    expect(filterSongs([song({ fileId: "unknown", releaseYear: "  " })], { minYear: 1990, includeUnknownYear: true }).map((s) => s.fileId)).toEqual(["unknown"]);
  });
  test("年、artist、album、disc、trackを数値順でソートする", () => {
    expect(sortSongs([song({ fileId: "10", releaseYear: "2000", artist: "A", album: "X", discNumber: "1", trackNumber: "10" }), song({ fileId: "2", releaseYear: "2000", artist: "A", album: "X", discNumber: "1", trackNumber: "2" }), song({ fileId: "disc2", releaseYear: "2000", artist: "A", album: "X", discNumber: "2", trackNumber: "1" }), song({ fileId: "unknown" })]).map((s) => s.fileId)).toEqual(["2", "10", "disc2", "unknown"]);
  });
});
