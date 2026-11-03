import { describe, expect, test, vi } from "vitest";
import type { ArtAlbum } from "./albumArtAlbums";
import { albumArtKey, type AlbumArtRecord } from "./albumArtSheet";
import { WebSearchError, type ArtCandidate } from "./albumArtSearch";
import { albumsToCollect, collectAlbumArt, ImageFetchError, planAlbumArtWrites, runCollection, type CollectDeps } from "./albumArtCollect";
import type { CoverArtResult } from "./coverArt";

const album = (fields: Partial<ArtAlbum> = {}): ArtAlbum => ({
  albumFolderId: "p1",
  album: "Blue",
  artist: "Band",
  shelf: "artist",
  tracks: [
    { fileId: "t1", disc: 1, track: 1, modifiedTime: "" },
    { fileId: "t9", disc: 1, track: 9, modifiedTime: "" },
  ],
  ...fields,
});

const picture: CoverArtResult = { kind: "picture", format: "image/png", data: new Uint8Array([1]) };
const mb: ArtCandidate = { source: "musicbrainz", sourceId: "rg1", imageUrl: "https://caa/rg1" };
const mb2: ArtCandidate = { source: "musicbrainz", sourceId: "rg2", imageUrl: "https://caa/rg2" };
const it: ArtCandidate = { source: "itunes", sourceId: "42", imageUrl: "https://itunes/42" };

function deps(overrides: Partial<CollectDeps> & { embedded?: Record<string, CoverArtResult>; mbResult?: ArtCandidate[]; itResult?: ArtCandidate[]; images?: Record<string, boolean> } = {}) {
  const uploads: string[] = [];
  const searched: string[] = [];
  const d: CollectDeps = {
    extractEmbedded: async (fileId) => overrides.embedded?.[fileId] ?? { kind: "none" },
    search: {
      musicBrainz: async (a, artist) => {
        searched.push(`mb:${a}:${artist}`);
        return overrides.mbResult ?? [];
      },
      iTunes: async (a, artist) => {
        searched.push(`it:${a}:${artist}`);
        return overrides.itResult ?? [];
      },
    },
    fetchImage: async (url) => (overrides.images?.[url] === false ? null : { data: new Uint8Array([2]), format: "image/jpeg" }),
    makeThumbnail: async () => new Blob(["jpg"]),
    upload: async (a) => {
      uploads.push(a.album);
      return `img-${uploads.length}`;
    },
    now: () => "2026-11-03T00:00:00Z",
    ...overrides,
  };
  return { d, uploads, searched };
}

describe("collectAlbumArt", () => {
  test("埋め込み画像があれば、それを縮めて置き、Webでは探さない", async () => {
    const { d, uploads, searched } = deps({ embedded: { t1: picture } });
    expect(await collectAlbumArt(album(), d)).toMatchObject({ embedded: "yes", source: "embedded", artFileId: "img-1", checkedFileId: "t1" });
    expect(uploads).toEqual(["Blue"]);
    expect(searched).toEqual([]);
  });

  test("最初の曲に無くても最後の曲にあれば、それを使う", async () => {
    const { d } = deps({ embedded: { t9: picture } });
    expect(await collectAlbumArt(album(), d)).toMatchObject({ embedded: "yes", source: "embedded", checkedFileId: "t9" });
  });

  test("曲が読めなかったら（画像が無いと決められないので）errorにしてWebでは探さない", async () => {
    const { d, searched } = deps({ embedded: { t1: { kind: "failed" } } });
    expect(await collectAlbumArt(album(), d)).toMatchObject({ embedded: "", source: "error", artFileId: "" });
    expect(searched).toEqual([]);
  });

  test("埋め込みが無ければMusicBrainzで探して置く（iTunesは呼ばない）", async () => {
    const { d, searched } = deps({ mbResult: [mb] });
    expect(await collectAlbumArt(album(), d)).toMatchObject({ embedded: "no", source: "musicbrainz", sourceId: "rg1", artFileId: "img-1", checkedFileId: "t1" });
    expect(searched).toEqual(["mb:Blue:Band"]);
  });

  test("候補の画像が無ければ次の候補、MusicBrainzで取れなければiTunes", async () => {
    const { d, searched } = deps({ mbResult: [mb, mb2], itResult: [it], images: { "https://caa/rg1": false, "https://caa/rg2": false } });
    expect(await collectAlbumArt(album(), d)).toMatchObject({ source: "itunes", sourceId: "42" });
    expect(searched).toEqual(["mb:Blue:Band", "it:Blue:Band"]);
  });

  test("どこにも無ければnotfound（何も置かない）", async () => {
    const { d, uploads } = deps();
    expect(await collectAlbumArt(album(), d)).toMatchObject({ embedded: "no", source: "notfound", artFileId: "" });
    expect(uploads).toEqual([]);
  });

  test("オムニバスは\"Various Artists\"で探し、アーティストが不明なアルバムは探さない", async () => {
    const various = deps();
    await collectAlbumArt(album({ artist: "", shelf: "various" }), various.d);
    expect(various.searched).toEqual(["mb:Blue:Various Artists", "it:Blue:Various Artists"]);
    const unknown = deps();
    expect(await collectAlbumArt(album({ artist: "", shelf: "unknown" }), unknown.d)).toMatchObject({ source: "notfound" });
    expect(unknown.searched).toEqual([]);
  });

  test("検索・画像の取得に失敗したらerror（次回やり直す）", async () => {
    const searchFails = deps();
    searchFails.d.search.musicBrainz = async () => {
      throw new WebSearchError("503");
    };
    expect(await collectAlbumArt(album(), searchFails.d)).toMatchObject({ embedded: "no", source: "error" });
    const imageFails = deps({ mbResult: [mb], fetchImage: async () => { throw new ImageFetchError("x"); } });
    expect(await collectAlbumArt(album(), imageFails.d)).toMatchObject({ source: "error" });
  });

  test("縮められない画像は使わない（埋め込みなら無い扱いでWebへ、Webなら次の候補へ）", async () => {
    const thumbs = vi.fn<CollectDeps["makeThumbnail"]>().mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValue(new Blob(["ok"]));
    const { d } = deps({ embedded: { t1: picture }, mbResult: [mb, mb2], makeThumbnail: thumbs });
    expect(await collectAlbumArt(album(), d)).toMatchObject({ embedded: "no", source: "musicbrainz", sourceId: "rg2" });
  });

  test("Driveへ置けない（認証エラー等）は例外のまま返す", async () => {
    const { d } = deps({ embedded: { t1: picture }, upload: async () => { throw new Error("401"); } });
    await expect(collectAlbumArt(album(), d)).rejects.toThrow("401");
  });
});

const rec = (a: ArtAlbum, source: AlbumArtRecord["source"]): AlbumArtRecord => ({
  albumFolderId: a.albumFolderId,
  album: a.album,
  artist: a.artist,
  embedded: "",
  artFileId: "",
  source,
  sourceId: "",
  checkedFileId: "",
  updatedAt: "",
});

test("albumsToCollect：記録の無いアルバムと、前回errorだったアルバムだけ", () => {
  const a = album({ album: "A" });
  const b = album({ album: "B" });
  const c = album({ album: "C" });
  const existing = new Map([
    [albumArtKey("p1", "A"), { rowNumber: 2, record: rec(a, "notfound") }],
    [albumArtKey("p1", "B"), { rowNumber: 3, record: rec(b, "error") }],
  ]);
  expect(albumsToCollect([a, b, c], existing).map((x) => x.album)).toEqual(["B", "C"]);
});

test("planAlbumArtWrites：記録のある行は上書き、無ければ追記", () => {
  const a = album({ album: "A" });
  const c = album({ album: "C" });
  const plan = planAlbumArtWrites([rec(a, "embedded"), rec(c, "itunes")], new Map([[albumArtKey("p1", "A"), { rowNumber: 5 }]]));
  expect(plan.updates.map((u) => [u.rowNumber, u.row[1], u.row[5]])).toEqual([[5, "A", "embedded"]]);
  expect(plan.appends.map((r) => [r[1], r[5]])).toEqual([["C", "itunes"]]);
});

describe("runCollection", () => {
  const albums = ["A", "B", "C", "D", "E"].map((name) => album({ album: name }));

  test("決まった件数ごとと最後に書き込み、全部を1回ずつ集める", async () => {
    const { d } = deps();
    const flushed: string[][] = [];
    const progress: number[] = [];
    const result = await runCollection({
      albums,
      deps: d,
      flush: async (records) => void flushed.push(records.map((r) => r.album)),
      flushEvery: 2,
      concurrency: 1,
      shouldStop: () => false,
      onProgress: (done) => progress.push(done),
    });
    expect(result).toEqual({ done: 5, stopped: false });
    expect(flushed).toEqual([["A", "B"], ["C", "D"], ["E"]]);
    expect(progress).toEqual([1, 2, 3, 4, 5]);
  });

  test("止めたら、いま集めている分を書き込んで終わる", async () => {
    const { d } = deps();
    const flushed: string[] = [];
    let stop = false;
    const result = await runCollection({
      albums,
      deps: d,
      flush: async (records) => void flushed.push(...records.map((r) => r.album)),
      concurrency: 1,
      shouldStop: () => stop,
      onProgress: (done) => {
        if (done === 2) stop = true;
      },
    });
    expect(result).toEqual({ done: 2, stopped: true });
    expect(flushed).toEqual(["A", "B"]);
  });

  test("Driveの認証エラー等で止まったら、集め終えた分を書き込んでから例外を返す", async () => {
    const { d } = deps({
      embedded: { t1: picture },
      upload: async (a) => {
        if (a.album === "C") throw new Error("401");
        return "img";
      },
    });
    const flushed: string[] = [];
    await expect(
      runCollection({
        albums,
        deps: d,
        flush: async (records) => void flushed.push(...records.map((r) => r.album)),
        concurrency: 1,
        shouldStop: () => false,
        onProgress: () => {},
      })
    ).rejects.toThrow("401");
    expect(flushed).toEqual(["A", "B"]);
  });
});
