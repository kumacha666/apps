import { describe, expect, test } from "vitest";
import { albumRackRows, annotateAlbumFolders, discNumberFromFolderName, groupAlbumsForRack, shelfOf, UNKNOWN_LABEL, VARIOUS_LABEL, VARIOUS_SHELF, type FolderInfo } from "./albumRack";
import type { Song } from "./catalog";

let seq = 0;
function song(fields: Partial<Song>): Song {
  seq += 1;
  return {
    fileId: `f${seq}`, parentId: "p1", title: `t${seq}`, artist: "", album: "", genre: "", composer: "", albumArtist: "",
    releaseYear: "", discNumber: "", trackNumber: "", releaseType: "", ...fields,
  };
}

describe("ディスクのフォルダ名", () => {
  test.each([["CD1", 1], ["CD 2", 2], ["Disc-3", 3], ["DISK04", 4], ["ディスク1", 1], ["cd1 本編", 1], ["Disc #12", 12]])("%s はディスク %i", (name, n) => {
    expect(discNumberFromFolderName(name)).toBe(n);
  });
  test.each(["CD123", "Discography", "Best of CD", "2CD"])("%s はディスクのフォルダではない", (name) => {
    expect(discNumberFromFolderName(name)).toBeUndefined();
  });
});

describe("CD1枚＝1件", () => {
  test("アルバムアーティストが空で、曲ごとにアーティストが違っても、同じフォルダの同じアルバムは1枚", () => {
    const groups = groupAlbumsForRack([
      song({ album: "Mix", artist: "A", trackNumber: "1" }),
      song({ album: "Mix", artist: "B feat. C", trackNumber: "2" }),
      song({ album: "Mix", artist: "D", trackNumber: "3" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].songs.map((s) => s.artist)).toEqual(["A", "B feat. C", "D"]);
  });

  test("同じアルバム名でも、別のフォルダなら別の1枚", () => {
    const groups = groupAlbumsForRack([song({ album: "Best", artist: "A", parentId: "x" }), song({ album: "Best", artist: "B", parentId: "y" })]);
    expect(groups).toHaveLength(2);
  });

  test("ディスクごとのフォルダに分かれた2枚組は、上のフォルダで1枚にまとまり、ディスク→トラックの順に並ぶ", () => {
    const folders = new Map<string, FolderInfo>([
      ["d1", { name: "CD1", parentId: "album" }],
      ["d2", { name: "Disc 2", parentId: "album" }],
    ]);
    const songs = annotateAlbumFolders([
      song({ album: "Double", artist: "A", parentId: "d2", trackNumber: "1", title: "2-1" }),
      song({ album: "Double", artist: "A", parentId: "d1", trackNumber: "2", title: "1-2" }),
      song({ album: "Double", artist: "A", parentId: "d1", trackNumber: "1", title: "1-1" }),
    ], folders);
    const groups = groupAlbumsForRack(songs);
    expect(groups).toHaveLength(1);
    expect(groups[0].songs.map((s) => s.title)).toEqual(["1-1", "1-2", "2-1"]);
  });

  test("ディスク番号のタグがあれば、フォルダの番号より優先する", () => {
    const folders = new Map<string, FolderInfo>([["d1", { name: "CD1", parentId: "album" }], ["d2", { name: "CD2", parentId: "album" }]]);
    const groups = groupAlbumsForRack(annotateAlbumFolders([
      song({ album: "X", parentId: "d1", discNumber: "2", trackNumber: "1", title: "tag2" }),
      song({ album: "X", parentId: "d2", trackNumber: "1", title: "folder2" }),
      song({ album: "X", parentId: "d2", discNumber: "1", trackNumber: "1", title: "tag1" }),
    ], folders));
    expect(groups[0].songs.map((s) => s.title)).toEqual(["tag1", "tag2", "folder2"]);
  });

  test("ディスクのフォルダでなければ、まとめない", () => {
    const folders = new Map<string, FolderInfo>([["a", { name: "Live", parentId: "artist" }], ["b", { name: "Studio", parentId: "artist" }]]);
    const groups = groupAlbumsForRack(annotateAlbumFolders([song({ album: "Same", parentId: "a" }), song({ album: "Same", parentId: "b" })], folders));
    expect(groups).toHaveLength(2);
  });

  test("アルバム名の無い曲は入れない", () => {
    expect(groupAlbumsForRack([song({ album: "  " })])).toEqual([]);
  });
});

describe("棚（見出し）", () => {
  test("アルバムアーティストがあればそれ（いちばん多いもの）", () => {
    expect(shelfOf([song({ albumArtist: "AA", artist: "x" }), song({ albumArtist: "", artist: "y" })])).toBe("AA");
  });
  test("無ければ、半分を超える曲のアーティスト", () => {
    expect(shelfOf([song({ artist: "A" }), song({ artist: "A" }), song({ artist: "B" })])).toBe("A");
  });
  test("ちょうど半分ではオムニバス", () => {
    expect(shelfOf([song({ artist: "A" }), song({ artist: "B" })])).toBe(VARIOUS_SHELF);
  });
  test("アーティストが全く無ければ不明", () => {
    expect(shelfOf([song({}), song({})])).toBe("");
  });
});

describe("一覧の行", () => {
  const groups = groupAlbumsForRack([
    song({ album: "Late", artist: "Beta", releaseYear: "2010", parentId: "1" }),
    song({ album: "Early", artist: "Beta", releaseYear: "1999", parentId: "2" }),
    song({ album: "Unknown year", artist: "Beta", parentId: "3" }),
    song({ album: "Solo", artist: "alpha", releaseYear: "2005", parentId: "4" }),
    song({ album: "Comp", artist: "X", parentId: "5" }),
    song({ album: "Comp", artist: "Y", parentId: "5" }),
    song({ album: "Nameless", parentId: "6" }),
  ]);

  test("既定は棚ごと：アーティスト名順（大文字小文字に関わらず）、オムニバス・不明は最後。棚の中は発売の古い順（年不明は最後）", () => {
    const rows = albumRackRows(groups, "", "shelf");
    expect(rows.map((r) => (r.kind === "shelf" ? `# ${r.label} ${r.albumCount}` : r.group.album))).toEqual([
      "# alpha 1", "Solo",
      "# Beta 3", "Early", "Late", "Unknown year",
      `# ${VARIOUS_LABEL} 1`, "Comp",
      `# ${UNKNOWN_LABEL} 1`, "Nameless",
    ]);
    expect(rows.filter((r) => r.kind === "album").every((r) => r.kind === "album" && !r.showArtist)).toBe(true);
  });

  test("発売の新しい順・アルバム名順は見出し無しの1列で、行にアーティストを出す", () => {
    const desc = albumRackRows(groups, "", "year-desc");
    expect(desc.every((r) => r.kind === "album" && r.showArtist)).toBe(true);
    expect(desc.map((r) => (r.kind === "album" ? r.group.album : "")).slice(0, 3)).toEqual(["Late", "Solo", "Early"]);
    const title = albumRackRows(groups, "", "title");
    expect(title.map((r) => (r.kind === "album" ? r.group.album : ""))).toEqual(["Comp", "Early", "Late", "Nameless", "Solo", "Unknown year"]);
  });

  test("検索はアルバム名と棚の表示名（オムニバス・不明を含む）の部分一致", () => {
    expect(albumRackRows(groups, "beta", "title").map((r) => (r.kind === "album" ? r.group.album : ""))).toEqual(["Early", "Late", "Unknown year"]);
    expect(albumRackRows(groups, "オムニ", "title").map((r) => (r.kind === "album" ? r.group.album : ""))).toEqual(["Comp"]);
    expect(albumRackRows(groups, "late", "shelf").map((r) => (r.kind === "shelf" ? `# ${r.label}` : r.group.album))).toEqual(["# Beta", "Late"]);
  });
});
