import { describe, expect, it } from "vitest";
import { INDEX_SHEET_HEADER } from "./sheets";
import {
  findDuplicateTitlesInFolder,
  findGarbledSuspects,
  findMissingFields,
  findYearOutliers,
} from "./healthCheck";

type Row = (string | number)[];

function makeRow(overrides: Partial<Record<(typeof INDEX_SHEET_HEADER)[number], string>>): Row {
  const row = new Array(INDEX_SHEET_HEADER.length).fill("");
  for (const [key, value] of Object.entries(overrides)) {
    row[INDEX_SHEET_HEADER.indexOf(key as (typeof INDEX_SHEET_HEADER)[number])] = value;
  }
  return row;
}

describe("findGarbledSuspects", () => {
  it("flags real-world corruption that detectGarbled() misses (Latin-1-range bytes, e.g. 'Rë¡')", () => {
    // 実データで見つかった実例（2026-09-07）：既存のdetectGarbled()（漢字マーカー繰り返し検出）
    // では拾えないが、明らかにShift_JISがLatin-1として誤読された文字化け。
    const rows = [makeRow({ fileId: "1", albumArtist: "Rë¡" })];
    const suspects = findGarbledSuspects(rows);
    expect(suspects).toEqual([{ fileId: "1", field: "albumArtist", value: "Rë¡" }]);
  });

  it("does not flag normal ASCII/Japanese text", () => {
    const rows = [makeRow({ fileId: "1", title: "負けないで", artist: "WANDS" })];
    expect(findGarbledSuspects(rows)).toHaveLength(0);
  });

  it("checks the override value when present (effective value), not the raw extracted one", () => {
    const rows = [makeRow({ fileId: "1", albumArtist: "Rë¡", albumArtist_override: "福山雅治" })];
    expect(findGarbledSuspects(rows)).toHaveLength(0);
  });

  it("checks genre even though it has no override column", () => {
    // 実データで見つかった実例：「その他」がShift_JISのまま誤読された genre 列の値。
    const rows = [makeRow({ fileId: "1", genre: "»Ì¼" })];
    const suspects = findGarbledSuspects(rows);
    expect(suspects.map((s) => s.field)).toContain("genre");
  });
});

describe("findMissingFields", () => {
  it("flags empty title/artist/album/genre", () => {
    const rows = [makeRow({ fileId: "1", title: "Song" })];
    const missing = findMissingFields(rows);
    expect(missing.map((m) => m.field).sort()).toEqual(["album", "artist", "genre"]);
  });

  it("does not flag a field covered by an override", () => {
    const rows = [makeRow({ fileId: "1", title: "Song", artist_override: "手動入力", album: "Album", genre: "Pop" })];
    expect(findMissingFields(rows)).toHaveLength(0);
  });
});

describe("findDuplicateTitlesInFolder", () => {
  it("flags the 2026-09-06 Mp3tag multi-select accident pattern (4 different songs all titled 'Houston')", () => {
    const rows = [
      makeRow({ fileId: "1", parentId: "folderA", title: "Houston" }),
      makeRow({ fileId: "2", parentId: "folderA", title: "Houston" }),
      makeRow({ fileId: "3", parentId: "folderA", title: "Houston" }),
      makeRow({ fileId: "4", parentId: "folderA", title: "Blue Orb" }),
    ];
    const groups = findDuplicateTitlesInFolder(rows);
    expect(groups).toEqual([{ parentId: "folderA", title: "Houston", fileIds: ["1", "2", "3"] }]);
  });

  it("does not flag the same title in different folders", () => {
    const rows = [
      makeRow({ fileId: "1", parentId: "folderA", title: "Intro" }),
      makeRow({ fileId: "2", parentId: "folderB", title: "Intro" }),
    ];
    expect(findDuplicateTitlesInFolder(rows)).toHaveLength(0);
  });
});

describe("findYearOutliers", () => {
  it("flags a track whose year differs from the album's majority year", () => {
    const rows = [
      makeRow({ fileId: "1", album: "Best", artist: "X", releaseYear: "2005" }),
      makeRow({ fileId: "2", album: "Best", artist: "X", releaseYear: "2005" }),
      makeRow({ fileId: "3", album: "Best", artist: "X", releaseYear: "2005" }),
      makeRow({ fileId: "4", album: "Best", artist: "X", releaseYear: "1999" }),
    ];
    expect(findYearOutliers(rows)).toEqual([{ fileId: "4", album: "Best", year: "1999", majorityYear: "2005" }]);
  });

  it("does not flag a genuine various-artists compilation with no clear majority year", () => {
    const rows = [
      makeRow({ fileId: "1", album: "Compilation", artist: "A", releaseYear: "1998" }),
      makeRow({ fileId: "2", album: "Compilation", artist: "B", releaseYear: "2003" }),
      makeRow({ fileId: "3", album: "Compilation", artist: "C", releaseYear: "2010" }),
    ];
    expect(findYearOutliers(rows)).toHaveLength(0);
  });

  it("does not flag albums with fewer than 3 tracks carrying a year", () => {
    const rows = [
      makeRow({ fileId: "1", album: "EP", artist: "X", releaseYear: "2005" }),
      makeRow({ fileId: "2", album: "EP", artist: "X", releaseYear: "1999" }),
    ];
    expect(findYearOutliers(rows)).toHaveLength(0);
  });

  it("respects releaseYear_override over the raw extracted value", () => {
    const rows = [
      makeRow({ fileId: "1", album: "Best", artist: "X", releaseYear: "2005" }),
      makeRow({ fileId: "2", album: "Best", artist: "X", releaseYear: "2005" }),
      makeRow({ fileId: "3", album: "Best", artist: "X", releaseYear: "2005" }),
      makeRow({ fileId: "4", album: "Best", artist: "X", releaseYear: "2005", releaseYear_override: "1999" }),
    ];
    expect(findYearOutliers(rows)).toEqual([{ fileId: "4", album: "Best", year: "1999", majorityYear: "2005" }]);
  });

  it("treats releaseYear '0' as unknown, not as a real year (ID3 placeholder convention, 2026-09-07 real-data finding)", () => {
    // 実データで見つかった実例：ID3タグの「年不明」プレースホルダーとして"0"が使われることがあり、
    // これを有効な年として扱うと、正しい年（1998）の方が少数派に見えて誤って外れ値扱いされていた。
    const rows = [
      makeRow({ fileId: "1", album: "Dracula Best", artist: "X", releaseYear: "0" }),
      makeRow({ fileId: "2", album: "Dracula Best", artist: "X", releaseYear: "0" }),
      makeRow({ fileId: "3", album: "Dracula Best", artist: "X", releaseYear: "1998" }),
      makeRow({ fileId: "4", album: "Dracula Best", artist: "X", releaseYear: "1998" }),
      makeRow({ fileId: "5", album: "Dracula Best", artist: "X", releaseYear: "1998" }),
    ];
    expect(findYearOutliers(rows)).toHaveLength(0);
  });

  it("groups the same album name in different folders separately (does not conflate distinct releases)", () => {
    const rows = [
      makeRow({ fileId: "1", parentId: "folderA", album: "Best", artist: "X", releaseYear: "2005" }),
      makeRow({ fileId: "2", parentId: "folderA", album: "Best", artist: "X", releaseYear: "2005" }),
      makeRow({ fileId: "3", parentId: "folderA", album: "Best", artist: "X", releaseYear: "2005" }),
      makeRow({ fileId: "4", parentId: "folderB", album: "Best", artist: "X", releaseYear: "1999" }),
      makeRow({ fileId: "5", parentId: "folderB", album: "Best", artist: "X", releaseYear: "1999" }),
      makeRow({ fileId: "6", parentId: "folderB", album: "Best", artist: "X", releaseYear: "1999" }),
    ];
    expect(findYearOutliers(rows)).toHaveLength(0);
  });
});
