import { describe, expect, test } from "vitest";
import { albumArtKey } from "./albumArt";
import { ALBUM_ART_SHEET_HEADER, createRemoteAlbumArt, driveArtStoreKey, fetchDriveImage, isReadableAlbumArtHeader, parseAlbumArtTab } from "./albumArtTab";

const header = [...ALBUM_ART_SHEET_HEADER];
const row = (albumFolderId: string, album: string, artFileId: string, source = "itunes") => [albumFolderId, album, "Artist", "no", artFileId, source, "1", "", "2026-11-03"];

describe("albumArtタブ", () => {
  test("ヘッダーは先頭9列だけ確かめる（右に列が足されていてもよい）", () => {
    expect(isReadableAlbumArtHeader(header)).toBe(true);
    expect(isReadableAlbumArtHeader([...header, "note"])).toBe(true);
    expect(isReadableAlbumArtHeader(header.slice(0, 8))).toBe(false);
    expect(isReadableAlbumArtHeader(["album", ...header.slice(1)])).toBe(false);
  });

  test("アルバム一覧と同じキー（アルバム名の前後の空白を除く＋フォルダ）で、画像のあるアルバムだけを返す", () => {
    const ids = parseAlbumArtTab([
      header,
      row("f1", " Abbey Road ", "img-1"),
      row("f2", "Abbey Road", "img-2"),
      row("f3", "Missing", "", "notfound"),
      row("f4", "Rejected", "", "rejected"),
      row("f5", "  ", "img-5"),
    ]);
    expect([...ids]).toEqual([
      [albumArtKey("Abbey Road", "f1"), "img-1"],
      [albumArtKey("Abbey Road", "f2"), "img-2"],
    ]);
  });

  test("同じアルバムの先の行に画像が無ければ（外した等）、後の古い行の画像は使わない。フォルダの無い行は飛ばす", () => {
    const ids = parseAlbumArtTab([header, row("f1", "Symphony", "", "rejected"), row("f1", "Symphony", "art-old", "itunes"), row("", "NoFolder", "img")]);
    expect(ids.size).toBe(0);
  });

  test("ヘッダーが違えば何も使わない。同じアルバムが2行あれば先の行", () => {
    expect(parseAlbumArtTab([["x"], row("f1", "A", "img")]).size).toBe(0);
    expect(parseAlbumArtTab([]).size).toBe(0);
    const ids = parseAlbumArtTab([header, row("f1", "A", "first"), row("f1", "A", "second")]);
    expect(ids.get(albumArtKey("A", "f1")!)).toBe("first");
  });
});

describe("fetchDriveImage", () => {
  test("ログイン中のトークンでalt=mediaを取り、形式はContent-Typeから", async () => {
    const calls: [string, RequestInit | undefined][] = [];
    const image = await fetchDriveImage("img 1", "tok", undefined, async (input, init) => {
      calls.push([String(input), init]);
      return new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "image/jpeg" } });
    });
    expect(calls[0][0]).toBe("https://www.googleapis.com/drive/v3/files/img%201?alt=media");
    expect((calls[0][1]?.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(image).toEqual({ data: new Uint8Array([1, 2, 3]), format: "image/jpeg" });
  });
  test("401・404・空・通信の失敗はnull（ログインを求めない）", async () => {
    expect(await fetchDriveImage("x", "tok", undefined, async () => new Response("no", { status: 401 }))).toBeNull();
    expect(await fetchDriveImage("x", "tok", undefined, async () => new Response("no", { status: 404 }))).toBeNull();
    expect(await fetchDriveImage("x", "tok", undefined, async () => new Response(new Uint8Array()))).toBeNull();
    expect(await fetchDriveImage("x", "tok", undefined, async () => { throw new TypeError("offline"); })).toBeNull();
  });
});

describe("createRemoteAlbumArt", () => {
  function setup(ids: Record<string, string>, images: Record<string, string | null>) {
    const store = new Map<string, string>();
    const fetches: string[] = [];
    let thumbnailOk = true;
    const remote = createRemoteAlbumArt({
      fileIdOf: (key) => ids[key] ?? null,
      store: {
        get: async (key) => store.get(key) ?? null,
        putIfAbsent: async (key, url) => (store.has(key) ? false : (store.set(key, url), true)),
      },
      fetchImage: async (fileId) => {
        fetches.push(fileId);
        const text = images[fileId];
        return text == null ? null : { data: new TextEncoder().encode(text), format: "image/jpeg" };
      },
      makeThumbnail: async (data) => (thumbnailOk ? `thumb:${new TextDecoder().decode(data)}` : null),
    });
    return { remote, store, fetches, breakThumbnails: () => { thumbnailOk = false; } };
  }

  test("albumArtタブに無いアルバムはnone（取りに行かない）", async () => {
    const t = setup({}, {});
    expect(await t.remote("k")).toEqual({ kind: "none" });
    expect(t.fetches).toEqual([]);
  });

  test("取って縮め、画像のファイルIDごとに保存する。保存してあれば取りに行かない", async () => {
    const t = setup({ k: "img-1" }, { "img-1": "A" });
    expect(await t.remote("k")).toEqual({ kind: "picture", url: "thumb:A" });
    expect(t.store.get(driveArtStoreKey("img-1"))).toBe("thumb:A");
    expect(await t.remote("k")).toEqual({ kind: "picture", url: "thumb:A" });
    expect(t.fetches).toEqual(["img-1"]);
  });

  test("確認画面で表紙を差し替えた（画像のファイルIDが変わった）ら、新しい画像を取る", async () => {
    const ids: Record<string, string> = { k: "img-1" };
    const t = setup(ids, { "img-1": "old", "img-2": "new" });
    await t.remote("k");
    ids.k = "img-2";
    expect(await t.remote("k")).toEqual({ kind: "picture", url: "thumb:new" });
  });

  test("同じ画像を同時に頼まれても1回だけ取る", async () => {
    const t = setup({ k1: "img", k2: "img" }, { img: "A" });
    const [a, b] = await Promise.all([t.remote("k1"), t.remote("k2")]);
    expect(a).toEqual({ kind: "picture", url: "thumb:A" });
    expect(b).toEqual(a);
    expect(t.fetches).toEqual(["img"]);
  });

  test("取れなかったら failed で、次に頼まれたらまた取る。画像として読めなかったものは取り直さない", async () => {
    const images: Record<string, string | null> = { a: null, b: "B" };
    const t = setup({ ka: "a", kb: "b" }, images);
    expect(await t.remote("ka")).toEqual({ kind: "failed" });
    images.a = "A";
    expect(await t.remote("ka")).toEqual({ kind: "picture", url: "thumb:A" });
    t.breakThumbnails();
    expect(await t.remote("kb")).toEqual({ kind: "failed" });
    expect(await t.remote("kb")).toEqual({ kind: "failed" });
    expect(t.fetches).toEqual(["a", "a", "b"]);
  });
});
