import { describe, expect, test } from "vitest";
import { albumOpenKey, albumSummary, albumTracks } from "./albumDetail";
import { shelfOf, type RackSong } from "./albumRack";
import type { AlbumGroup } from "./catalog";

// アルバムの中身（トラック一覧）の表示（Android版の AlbumDetailTest と同じ確認）。
function song(fileId: string, f: { artist?: string; albumArtist?: string; disc?: string; track?: string; year?: string; discFolder?: string } = {}): RackSong {
  return {
    fileId, parentId: "p", title: `t${fileId}`, artist: f.artist ?? "Band", album: "Album", genre: "", composer: "", albumArtist: f.albumArtist ?? "",
    releaseYear: f.year ?? "", discNumber: f.disc ?? "", trackNumber: f.track ?? "", releaseType: "", ...(f.discFolder ? { discFolder: f.discFolder } : {}),
  };
}
const group = (...songs: RackSong[]): AlbumGroup => ({ album: "Album", albumArtist: shelfOf(songs), songs });

describe("トラック番号", () => {
  test("1枚もののアルバムは番号だけ、番号が無ければ空", () => {
    expect(albumTracks(group(song("a", { track: "1" }), song("b", { track: "02" }), song("c"))).map((t) => t.number)).toEqual(["1", "2", ""]);
  });
  test("何枚組はディスク-トラック（ディスクのタグが無くても、フォルダから分かるものを含む）", () => {
    const t = albumTracks(group(song("a", { disc: "1", track: "1" }), song("b", { disc: "1", track: "12" }), song("c", { track: "3", discFolder: "CD2" })));
    expect(t.map((x) => x.number)).toEqual(["1-01", "1-12", "2-03"]);
  });
  test("1枚もののディスク番号のタグは、番号にディスクを付けない", () => {
    expect(albumTracks(group(song("a", { disc: "1", track: "1" }), song("b", { disc: "1", track: "2" }))).map((t) => t.number)).toEqual(["1", "2"]);
  });
});

test("曲のアーティストは、棚のアーティストと違うときだけ出す", () => {
  const t = albumTracks(group(
    song("a", { artist: "Band", albumArtist: "Band", track: "1" }),
    song("b", { artist: "Band feat. Guest", albumArtist: "Band", track: "2" }),
    song("c", { artist: "", albumArtist: "Band", track: "3" }),
  ));
  expect(t.map((x) => x.artist)).toEqual(["", "Band feat. Guest", ""]);
});

test("補足は棚・曲数・発売年（年が違えば範囲）", () => {
  expect(albumSummary(group(song("a", { albumArtist: "Band", year: "2001" }), song("b", { albumArtist: "Band", year: "2001" })))).toBe("Band・2曲・2001年");
  expect(albumSummary(group(song("a", { albumArtist: "Band", year: "2001" }), song("b", { albumArtist: "Band", year: "1999" })))).toBe("Band・2曲・1999〜2001年");
  expect(albumSummary(group(song("a", { albumArtist: "Band" })))).toBe("Band・1曲");
});

test("開く印は先頭の曲のfileId", () => {
  expect(albumOpenKey(group(song("x"), song("y")))).toBe("x");
  expect(albumOpenKey({ album: "A", albumArtist: "", songs: [] })).toBeNull();
});
