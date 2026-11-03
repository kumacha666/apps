import { describe, expect, test } from "vitest";
import { buildArtAlbums, coverCandidateTracks, discNumberFromFolderName, parseFolderRows, type FolderInfo } from "./albumArtAlbums";
import { INDEX_SHEET_HEADER } from "./sheets";

type Field = (typeof INDEX_SHEET_HEADER)[number];
function row(fields: Partial<Record<Field, string>>): string[] {
  const r = new Array(INDEX_SHEET_HEADER.length).fill("");
  for (const [k, v] of Object.entries(fields)) r[INDEX_SHEET_HEADER.indexOf(k as Field)] = v;
  return r;
}

describe("buildArtAlbums", () => {
  test("アルバム名＋親フォルダで1枚にまとめ、ディスク→トラックの順に並べる", () => {
    const albums = buildArtAlbums(
      [
        row({ fileId: "b", album: "Blue", artist: "A", parentId: "p1", trackNumber: "2" }),
        row({ fileId: "a", album: "Blue", artist: "A", parentId: "p1", trackNumber: "1" }),
        row({ fileId: "c", album: "Blue", artist: "A", parentId: "p2", trackNumber: "1" }),
        row({ fileId: "x", album: "", artist: "A", parentId: "p1" }),
      ],
      new Map()
    );
    expect(albums.map((a) => [a.album, a.albumFolderId, a.tracks.map((t) => t.fileId)])).toEqual([
      ["Blue", "p1", ["a", "b"]],
      ["Blue", "p2", ["c"]],
    ]);
  });

  test("ディスクごとのフォルダ（CD1・Disc 2）に入った曲は上のフォルダでまとめ、ディスクのフォルダの番号で並べる", () => {
    const folders = new Map<string, FolderInfo>([
      ["cd1", { name: "CD1", parentId: "album" }],
      ["cd2", { name: "Disc 2", parentId: "album" }],
    ]);
    const albums = buildArtAlbums(
      [
        row({ fileId: "d2t1", album: "Box", artist: "A", parentId: "cd2", trackNumber: "1" }),
        row({ fileId: "d1t2", album: "Box", artist: "A", parentId: "cd1", trackNumber: "2" }),
        row({ fileId: "d1t1", album: "Box", artist: "A", parentId: "cd1", trackNumber: "1" }),
      ],
      folders
    );
    expect(albums).toHaveLength(1);
    expect(albums[0].albumFolderId).toBe("album");
    expect(albums[0].tracks.map((t) => t.fileId)).toEqual(["d1t1", "d1t2", "d2t1"]);
  });

  test("アルバム名・アーティストはoverride優先（(none)は空）", () => {
    const albums = buildArtAlbums(
      [
        row({ fileId: "1", album: "old", album_override: "New", artist: "A", artist_override: "B", parentId: "p" }),
        row({ fileId: "2", album: "Gone", album_override: "(none)", parentId: "p" }),
      ],
      new Map()
    );
    expect(albums.map((a) => [a.album, a.artist])).toEqual([["New", "B"]]);
  });

  test("棚：アルバムアーティスト → 半分を超える曲のアーティスト → オムニバス → 不明", () => {
    const albums = buildArtAlbums(
      [
        row({ fileId: "1", album: "AA", albumArtist: "Band", artist: "X", parentId: "p1" }),
        row({ fileId: "2", album: "Maj", artist: "Y", parentId: "p2" }),
        row({ fileId: "3", album: "Maj", artist: "Y", parentId: "p2" }),
        row({ fileId: "4", album: "Maj", artist: "Z", parentId: "p2" }),
        row({ fileId: "5", album: "VA", artist: "Y", parentId: "p3" }),
        row({ fileId: "6", album: "VA", artist: "Z", parentId: "p3" }),
        row({ fileId: "7", album: "None", parentId: "p4" }),
      ],
      new Map()
    );
    const byAlbum = Object.fromEntries(albums.map((a) => [a.album, [a.artist, a.shelf]]));
    expect(byAlbum).toEqual({ AA: ["Band", "artist"], Maj: ["Y", "artist"], VA: ["", "various"], None: ["", "unknown"] });
  });

  test("同じfileIdの重複行は先の行だけを使う", () => {
    const albums = buildArtAlbums(
      [row({ fileId: "1", album: "First", parentId: "p" }), row({ fileId: "1", album: "Second", parentId: "p" })],
      new Map()
    );
    expect(albums.map((a) => a.album)).toEqual(["First"]);
  });
});

test("coverCandidateTracks：最初の曲と最後の曲（1曲なら1つ）", () => {
  const [album] = buildArtAlbums(
    ["1", "2", "3"].map((n) => row({ fileId: `t${n}`, album: "A", parentId: "p", trackNumber: n })),
    new Map()
  );
  expect(coverCandidateTracks(album).map((t) => t.fileId)).toEqual(["t1", "t3"]);
  const [single] = buildArtAlbums([row({ fileId: "s", album: "S", parentId: "p" })], new Map());
  expect(coverCandidateTracks(single).map((t) => t.fileId)).toEqual(["s"]);
});

test("discNumberFromFolderName・parseFolderRows", () => {
  expect(discNumberFromFolderName("CD1")).toBe(1);
  expect(discNumberFromFolderName("disc-02")).toBe(2);
  expect(discNumberFromFolderName("ディスク3")).toBe(3);
  expect(discNumberFromFolderName("Bonus")).toBeUndefined();
  expect(parseFolderRows([["f1", "CD1", "p"], ["", "x", "y"]])).toEqual(new Map([["f1", { name: "CD1", parentId: "p" }]]));
});
