import { describe, expect, test } from "vitest";
import {
  ALBUM_ART_SHEET_HEADER,
  albumArtKey,
  albumArtRow,
  isLegacyAlbumArtHeader,
  isSettled,
  isValidAlbumArtHeader,
  parseAlbumArtRows,
  summarize,
  type AlbumArtRecord,
} from "./albumArtSheet";

const record = (fields: Partial<AlbumArtRecord>): AlbumArtRecord => ({
  albumFolderId: "p",
  album: "A",
  artist: "",
  embedded: "",
  artFileId: "",
  source: "notfound",
  sourceId: "",
  checkedFileId: "",
  updatedAt: "",
  match: "",
  reviewedAt: "",
  ...fields,
});

describe("albumArtタブ", () => {
  test("行と記録を行き来でき、行番号は2始まり。キーの無い行は飛ばし、重複は先の行を使う", () => {
    const r = record({ albumFolderId: "f1", album: "Blue", embedded: "yes", artFileId: "img", source: "embedded" });
    const parsed = parseAlbumArtRows([albumArtRow(r), ["", "x"], albumArtRow({ ...r, artFileId: "later" })]);
    expect(parsed.size).toBe(1);
    expect(parsed.get(albumArtKey("f1", "Blue"))).toEqual({ rowNumber: 2, record: r });
  });

  test("知らない値は安全側に読む（sourceはerror＝やり直す、embeddedは空）", () => {
    const parsed = parseAlbumArtRows([["f", "A", "", "maybe", "", "unknown"]]);
    expect(parsed.get(albumArtKey("f", "A"))?.record).toMatchObject({ embedded: "", source: "error" });
  });

  test("どう見つけたか（match）を読み書きし、知らない値は空（自動で集めた）として読む", () => {
    const r = record({ albumFolderId: "f1", album: "Blue", artFileId: "img", source: "deezer", sourceId: "42", match: "ai-variant" });
    expect(albumArtRow(r)).toHaveLength(ALBUM_ART_SHEET_HEADER.length);
    expect(parseAlbumArtRows([albumArtRow(r)]).get(albumArtKey("f1", "Blue"))?.record).toEqual(r);
    expect(parseAlbumArtRows([[...albumArtRow(r).slice(0, 9), "maybe"]]).get(albumArtKey("f1", "Blue"))?.record.match).toBe("");
    // 確かめた印を読み書きする
    const seen = { ...r, reviewedAt: "2026-11-04T00:00:00Z" };
    expect(parseAlbumArtRows([albumArtRow(seen)]).get(albumArtKey("f1", "Blue"))?.record.reviewedAt).toBe("2026-11-04T00:00:00Z");
    // match列を足す前の9列の行は、自動で集めたもの
    expect(parseAlbumArtRows([albumArtRow(r).slice(0, 9)]).get(albumArtKey("f1", "Blue"))?.record.match).toBe("");
  });

  test("列を足す前の見出し（9列・10列）は、見出しを足して使う。それ以外の見出しは別の用途のタブ", () => {
    const legacy = ALBUM_ART_SHEET_HEADER.slice(0, 9);
    expect(isLegacyAlbumArtHeader(legacy)).toBe(true);
    expect(isValidAlbumArtHeader(legacy)).toBe(false);
    expect(isLegacyAlbumArtHeader(ALBUM_ART_SHEET_HEADER.slice(0, 10))).toBe(true);
    expect(isValidAlbumArtHeader(ALBUM_ART_SHEET_HEADER.slice(0, 10))).toBe(false);
    expect(isLegacyAlbumArtHeader([...ALBUM_ART_SHEET_HEADER.slice(0, 10), "memo"])).toBe(false);
    expect(isLegacyAlbumArtHeader([...legacy, "memo"])).toBe(false);
    expect(isLegacyAlbumArtHeader(["albumFolderId", "album"])).toBe(false);
  });

  test("ヘッダーの確認（右に列が増えていてもよい）", () => {
    expect(isValidAlbumArtHeader([...ALBUM_ART_SHEET_HEADER])).toBe(true);
    expect(isValidAlbumArtHeader([...ALBUM_ART_SHEET_HEADER, "memo"])).toBe(true);
    expect(isValidAlbumArtHeader(["albumFolderId", "album"])).toBe(false);
  });

  test("errorだけはやり直す。集計", () => {
    expect(isSettled(undefined)).toBe(false);
    expect(isSettled(record({ source: "error" }))).toBe(false);
    expect(isSettled(record({ source: "notfound" }))).toBe(true);
    expect(isSettled(record({ source: "rejected" }))).toBe(true);
    expect(summarize([record({ source: "embedded" }), record({ source: "itunes" }), record({ source: "itunes" })])).toEqual({
      embedded: 1,
      musicbrainz: 0,
      itunes: 2,
      deezer: 0,
      notfound: 0,
      error: 0,
      rejected: 0,
    });
  });

  test("キーはアルバム名の前後の空白を無視する", () => {
    expect(albumArtKey("p", " Blue ")).toBe(albumArtKey("p", "Blue"));
  });
});
