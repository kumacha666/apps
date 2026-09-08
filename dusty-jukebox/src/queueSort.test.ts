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

  it("sorts numerically by trackNumber, not lexicographically, and pushes unknown track numbers last", () => {
    const songs = [
      makeSong({ fileId: "1", trackNumber: "2" }),
      makeSong({ fileId: "2", trackNumber: "10" }),
      makeSong({ fileId: "3", trackNumber: "" }),
    ];
    expect(sortSongsForQueue(songs, "track", "asc").map((s) => s.fileId)).toEqual(["1", "2", "3"]);
    expect(sortSongsForQueue(songs, "track", "desc").map((s) => s.fileId)).toEqual(["2", "1", "3"]);
  });

  it("開発体制#42：第二候補を指定すると、第一候補が同値の曲同士を第二候補で並べ替える（例：リリース年→トラック番号）", () => {
    const songs = [
      makeSong({ fileId: "1", releaseYear: "2000", trackNumber: "2" }),
      makeSong({ fileId: "2", releaseYear: "2000", trackNumber: "1" }),
      makeSong({ fileId: "3", releaseYear: "1990", trackNumber: "5" }),
    ];
    expect(
      sortSongsForQueue(songs, "releaseYear", "asc", "track", "asc").map((s) => s.fileId)
    ).toEqual(["3", "2", "1"]);
  });

  it("第二候補を指定した場合、第一候補がアーティスト/アルバムでも既定の副次キー（アルバム→ディスク→トラック）は使わず第二候補を優先する", () => {
    const songs = [
      makeSong({ fileId: "1", artist: "A", album: "Z", trackNumber: "1", releaseYear: "2010" }),
      makeSong({ fileId: "2", artist: "A", album: "Y", trackNumber: "1", releaseYear: "2000" }),
    ];
    // 第二候補が無ければアルバム名順（"Y"が先）だが、releaseYearを第二候補にすると年代順になる。
    expect(
      sortSongsForQueue(songs, "artist", "asc", "releaseYear", "asc").map((s) => s.fileId)
    ).toEqual(["2", "1"]);
  });

  it("2026-09-08：リリース年でソートすると、同じ年の複数アルバムがアルバム名単位でまとまり、トラック番号だけで曲が混ざらない（ユーザー指摘：アーティストの活動歴を追う用途で、同じ年に複数アルバムがあるとバラバラに混ざってしまっていた）", () => {
    const songs = [
      makeSong({ fileId: "b2", album: "Beta", trackNumber: "2", releaseYear: "2000" }),
      makeSong({ fileId: "a1", album: "Alpha", trackNumber: "1", releaseYear: "2000" }),
      makeSong({ fileId: "b1", album: "Beta", trackNumber: "1", releaseYear: "2000" }),
      makeSong({ fileId: "a2", album: "Alpha", trackNumber: "2", releaseYear: "2000" }),
    ];
    // 第二候補を指定しない場合：アルバム名順（Alpha→Beta）でグループ化され、
    // 各アルバム内はトラック順（旧実装ではトラック番号だけで1,1,2,2と混ざっていた）。
    expect(sortSongsForQueue(songs, "releaseYear", "asc").map((s) => s.fileId)).toEqual([
      "a1",
      "a2",
      "b1",
      "b2",
    ]);
  });

  it("2026-09-08：リリース年ソートで第二候補にtrackを指定していても、アルバムのグループ化が優先される（第二候補はグループ化後の並び替えに使われる）", () => {
    const songs = [
      makeSong({ fileId: "b2", album: "Beta", trackNumber: "2", releaseYear: "2000" }),
      makeSong({ fileId: "a1", album: "Alpha", trackNumber: "1", releaseYear: "2000" }),
      makeSong({ fileId: "b1", album: "Beta", trackNumber: "1", releaseYear: "2000" }),
      makeSong({ fileId: "a2", album: "Alpha", trackNumber: "2", releaseYear: "2000" }),
    ];
    expect(
      sortSongsForQueue(songs, "releaseYear", "asc", "track", "asc").map((s) => s.fileId)
    ).toEqual(["a1", "a2", "b1", "b2"]);
  });

  it("2026-09-08：リリース年でソートすると、releaseTypeの値に関わらずアルバム名の文字列順でグループ化される（ChatGPTレビュー指摘：P2、2ラウンド目。releaseTypeを条件付きで比較に使うとcomparatorの推移律が壊れるため、releaseTypeによるグループ化自体を撤回しアルバム名のみに一本化した）", () => {
    const songs = [
      // releaseTypeの値（Album<Single、文字列順）だけを見ればalbum→singleの順になりうるが、
      // アルバム名（Zeta→Alpha）を見ればsingle→albumの順になるべき、というように矛盾する
      // データにする（releaseTypeが実際には比較に使われていないことを確認するため）。
      makeSong({ fileId: "single", album: "Alpha Single", releaseType: "Single", releaseYear: "2000" }),
      makeSong({ fileId: "album", album: "Zeta Album", releaseType: "Album", releaseYear: "2000" }),
    ];
    expect(
      sortSongsForQueue(songs, "releaseYear", "asc").map((s) => s.fileId)
    ).toEqual(["single", "album"]);
  });

  it("2026-09-08：releaseTypeが未入力の曲同士は、リリース年ソートでも従来通りアルバム名でグループ化される（releaseType空欄は互いに区別しない）", () => {
    const songs = [
      makeSong({ fileId: "b", album: "Beta", releaseYear: "2000" }),
      makeSong({ fileId: "a", album: "Alpha", releaseYear: "2000" }),
    ];
    expect(sortSongsForQueue(songs, "releaseYear", "asc").map((s) => s.fileId)).toEqual(["a", "b"]);
  });

  it("2026-09-08：同じアルバム内で一部の曲だけreleaseTypeが入力済みでも、そのアルバムが分断されない（ChatGPTレビュー指摘：P2。releaseTypeを先に比較すると、同じアルバム・同じリリース年の曲でもreleaseTypeの有無だけで別グループに分かれてしまっていた）", () => {
    const songs = [
      // trackNumber=3の曲だけreleaseTypeが入力済み：releaseTypeを先に比較する実装だと、
      // 非空欄は空欄より必ず先に来る（compareStringsの規則）ため、本来トラック順で最後に
      // 来るべきこの曲が真っ先に来てしまう（アルバムが分断される）回帰を検出できる。
      makeSong({ fileId: "t3", album: "Same Album", trackNumber: "3", releaseType: "Album", releaseYear: "2000" }),
      makeSong({ fileId: "t1", album: "Same Album", trackNumber: "1", releaseType: "", releaseYear: "2000" }),
      makeSong({ fileId: "t2", album: "Same Album", trackNumber: "2", releaseType: "", releaseYear: "2000" }),
    ];
    // releaseTypeの有無に関わらず、同じアルバム名の曲は常にまとまり、アルバム内はトラック順。
    expect(sortSongsForQueue(songs, "releaseYear", "asc").map((s) => s.fileId)).toEqual([
      "t1",
      "t2",
      "t3",
    ]);
  });

  it("2026-09-08：リリース年ソートで第二候補にtrack以外（例：artist）を指定した場合、暗黙のアルバムグループ化を適用せず第二候補をそのまま優先する（ChatGPTレビュー指摘：P2。第二候補を明示した場合は第二候補で直接比較するという既存契約を、releaseYearだけ無条件に壊してはならない）", () => {
    const songs = [
      // アルバム名順（Alpha→Zeta）とartist順（A→B）が逆になるデータにする：
      // 万一暗黙グループ化が働いてしまっても、期待値と偶然一致してテストが false negative に
      // ならないようにするため（2026-09-08、以前のデータはalbum順・artist順が偶然一致しており
      // このテストが実際には何も検証できていなかったことが発覚したため修正）。
      makeSong({ fileId: "1", album: "Alpha", artist: "B", releaseYear: "2000" }),
      makeSong({ fileId: "2", album: "Zeta", artist: "A", releaseYear: "2000" }),
    ];
    // アルバムグループ化が優先されれば1→2（アルバム名順）になるはずだが、
    // 第二候補にartistを明示しているので、artist順（A→B、つまり2→1）がそのまま適用される。
    expect(
      sortSongsForQueue(songs, "releaseYear", "asc", "artist", "asc").map((s) => s.fileId)
    ).toEqual(["2", "1"]);
  });
});

describe("compareSongsForQueueSort", () => {
  it("breaks ties on identical titles by fileId for a deterministic order", () => {
    const a = makeSong({ fileId: "b", title: "Same" });
    const b = makeSong({ fileId: "a", title: "Same" });
    expect(compareSongsForQueueSort(a, b, "title", "asc")).toBeGreaterThan(0);
  });
});
