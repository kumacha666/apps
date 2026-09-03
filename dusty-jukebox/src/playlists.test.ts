import { describe, expect, test } from "vitest";
import {
  buildPlaylistRow,
  buildPlaylistTrackRows,
  compareOrderKeys,
  createPlaylist,
  deletePlaylist,
  fileIdsForPlaylist,
  isValidPlaylistsHeader,
  isValidPlaylistTracksHeader,
  makeOrderKey,
  parsePlaylistRows,
  parsePlaylistTrackRows,
  PLAYLISTS_SHEET_HEADER,
  PLAYLIST_TRACKS_SHEET_HEADER,
  type PlaylistsIO,
} from "./playlists";

describe("isValidPlaylistsHeader / isValidPlaylistTracksHeader", () => {
  test("正しいヘッダーはtrue", () => {
    expect(isValidPlaylistsHeader([...PLAYLISTS_SHEET_HEADER])).toBe(true);
    expect(isValidPlaylistTracksHeader([...PLAYLIST_TRACKS_SHEET_HEADER])).toBe(true);
  });
  test("列数・列名が違えばfalse", () => {
    expect(isValidPlaylistsHeader(["playlistId", "name"])).toBe(false);
    expect(isValidPlaylistTracksHeader(["playlistId", "wrong", "fileId"])).toBe(false);
  });
});

describe("parsePlaylistRows", () => {
  test("playlistIdが空の行は除外し、重複playlistIdは先勝ちで採用する", () => {
    const rows = [
      ["p1", "お気に入り", "2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z"],
      ["", "", "", ""],
      ["p1", "後から来た重複", "2026-01-02T00:00:00Z", "2026-01-02T00:00:00Z"],
      ["p2", "作業用", "2026-01-03T00:00:00Z", "2026-01-03T00:00:00Z"],
    ];
    expect(parsePlaylistRows(rows)).toEqual([
      { playlistId: "p1", name: "お気に入り", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
      { playlistId: "p2", name: "作業用", createdAt: "2026-01-03T00:00:00Z", updatedAt: "2026-01-03T00:00:00Z" },
    ]);
  });
});

describe("parsePlaylistTrackRows", () => {
  test("playlistIdまたはfileIdが空の行は除外する", () => {
    const rows = [
      ["p1", "1-0-abc", "song-1"],
      ["", "1-0-abc", "song-2"],
      ["p1", "1-1-abc", ""],
    ];
    expect(parsePlaylistTrackRows(rows)).toEqual([{ playlistId: "p1", order: "1-0-abc", fileId: "song-1" }]);
  });
});

describe("makeOrderKey / compareOrderKeys", () => {
  test("タイムスタンプ→batchSeq→deviceRandomIdの順で比較する", () => {
    expect(compareOrderKeys(makeOrderKey(100, 0, "aaa"), makeOrderKey(200, 0, "aaa"))).toBeLessThan(0);
    expect(compareOrderKeys(makeOrderKey(100, 5, "aaa"), makeOrderKey(100, 9, "aaa"))).toBeLessThan(0);
    expect(compareOrderKeys(makeOrderKey(100, 0, "aaa"), makeOrderKey(100, 0, "bbb"))).toBeLessThan(0);
    expect(compareOrderKeys(makeOrderKey(100, 0, "aaa"), makeOrderKey(100, 0, "aaa"))).toBe(0);
  });

  test("桁数に依存しない比較（CONCEPT.md 4.3節：辞書順だと桁あふれで崩れる）", () => {
    // 辞書順なら"9999"より"10000"の方が前に来てしまうケース。数値パースなら正しく後になる。
    expect(compareOrderKeys(makeOrderKey(100, 9999, "aaa"), makeOrderKey(100, 10000, "aaa"))).toBeLessThan(0);
  });
});

describe("fileIdsForPlaylist", () => {
  test("orderの昇順に並べ、他プレイリストの行は無視する", () => {
    const rows = parsePlaylistTrackRows([
      ["p1", makeOrderKey(200, 0, "dev"), "song-b"],
      ["p1", makeOrderKey(100, 0, "dev"), "song-a"],
      ["p2", makeOrderKey(50, 0, "dev"), "song-x"],
    ]);
    expect(fileIdsForPlaylist(rows, "p1")).toEqual(["song-a", "song-b"]);
  });

  test("同一fileIdが複数行ある場合はorderが早い方（先勝ち）を採用する", () => {
    const rows = parsePlaylistTrackRows([
      ["p1", makeOrderKey(100, 0, "dev"), "song-a"],
      ["p1", makeOrderKey(200, 0, "dev"), "song-a"],
    ]);
    expect(fileIdsForPlaylist(rows, "p1")).toEqual(["song-a"]);
  });
});

describe("buildPlaylistRow / buildPlaylistTrackRows", () => {
  test("buildPlaylistRowは4列を順番通りに返す", () => {
    expect(buildPlaylistRow({ playlistId: "p1", name: "N", createdAtIso: "c", updatedAtIso: "u" })).toEqual(["p1", "N", "c", "u"]);
  });
  test("buildPlaylistTrackRowsはbatchSeqを0起点で連番付与する", () => {
    const rows = buildPlaylistTrackRows({ playlistId: "p1", fileIds: ["a", "b"], nowMs: 1000, deviceRandomId: "dev" });
    expect(rows).toEqual([
      ["p1", "1000-0-dev", "a"],
      ["p1", "1000-1-dev", "b"],
    ]);
  });
  test("batchSeqStartを指定すればそこから連番を振る", () => {
    const rows = buildPlaylistTrackRows({ playlistId: "p1", fileIds: ["a"], nowMs: 1000, deviceRandomId: "dev", batchSeqStart: 5 });
    expect(rows).toEqual([["p1", "1000-5-dev", "a"]]);
  });
});

function makeFakeIO(): PlaylistsIO & {
  playlistRows: (string | number)[][];
  trackRows: (string | number)[][];
  updatePlaylistCalls: { rowNumber: number; row: (string | number)[] }[][];
  updateTrackCalls: { rowNumber: number; row: (string | number)[] }[][];
} {
  const playlistRows: (string | number)[][] = [];
  const trackRows: (string | number)[][] = [];
  const updatePlaylistCalls: { rowNumber: number; row: (string | number)[] }[][] = [];
  const updateTrackCalls: { rowNumber: number; row: (string | number)[] }[][] = [];
  return {
    playlistRows,
    trackRows,
    updatePlaylistCalls,
    updateTrackCalls,
    async listPlaylists() {
      return [...playlistRows];
    },
    async readPlaylistsHeaderRow() {
      return [...PLAYLISTS_SHEET_HEADER];
    },
    async appendPlaylistRows(rows) {
      playlistRows.push(...rows);
    },
    async updatePlaylistRows(updates) {
      updatePlaylistCalls.push(updates);
      for (const { rowNumber, row } of updates) playlistRows[rowNumber - 2] = row;
    },
    async listPlaylistTracks() {
      return [...trackRows];
    },
    async readPlaylistTracksHeaderRow() {
      return [...PLAYLIST_TRACKS_SHEET_HEADER];
    },
    async appendPlaylistTrackRows(rows) {
      trackRows.push(...rows);
    },
    async updatePlaylistTrackRows(updates) {
      updateTrackCalls.push(updates);
      for (const { rowNumber, row } of updates) trackRows[rowNumber - 2] = row;
    },
  };
}

describe("createPlaylist", () => {
  test("playlistsタブへ1行、playlist_tracksタブへ曲数分の行を追記し、生成したplaylistIdを返す", async () => {
    const io = makeFakeIO();
    const playlistId = await createPlaylist(io, "お気に入り", ["song-1", "song-2"], "dev", 1000, () => "p1");
    expect(playlistId).toBe("p1");
    expect(io.playlistRows).toEqual([["p1", "お気に入り", new Date(1000).toISOString(), new Date(1000).toISOString()]]);
    expect(io.trackRows).toEqual([
      ["p1", "1000-0-dev", "song-1"],
      ["p1", "1000-1-dev", "song-2"],
    ]);
  });

  test("曲数0件ならplaylist_tracksタブへは何も書かない", async () => {
    const io = makeFakeIO();
    await createPlaylist(io, "空のリスト", [], "dev", 1000, () => "p1");
    expect(io.trackRows).toEqual([]);
  });
});

describe("deletePlaylist", () => {
  test("対象プレイリストの行・収録曲行を全列空欄化し、他プレイリストの行には触れない", async () => {
    const io = makeFakeIO();
    io.playlistRows.push(["p1", "対象", "c", "u"], ["p2", "対象外", "c", "u"]);
    io.trackRows.push(["p1", "1000-0-dev", "song-1"], ["p2", "1000-0-dev", "song-x"], ["p1", "1000-1-dev", "song-2"]);

    await deletePlaylist(io, "p1");

    expect(io.playlistRows).toEqual([
      ["", "", "", ""],
      ["p2", "対象外", "c", "u"],
    ]);
    expect(io.trackRows).toEqual([
      ["", "", ""],
      ["p2", "1000-0-dev", "song-x"],
      ["", "", ""],
    ]);
  });

  test("存在しないplaylistIdを指定してもAPIを呼ばない", async () => {
    const io = makeFakeIO();
    io.playlistRows.push(["p1", "対象", "c", "u"]);
    await deletePlaylist(io, "does-not-exist");
    expect(io.updatePlaylistCalls).toEqual([]);
    expect(io.updateTrackCalls).toEqual([]);
  });
});
