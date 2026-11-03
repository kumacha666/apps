import { describe, expect, test } from "vitest";
import { albumArtKey, albumArtKeyOfGroup, albumArtKeysByFileId, albumInitial, albumTileHue, NowArtwork, thumbnailSize, type AlbumArtStore, type NowArtworkDeps, type RemoteArtResult } from "./albumArt";
import { annotateAlbumFolders, groupAlbumsForRack, type FolderInfo } from "./albumRack";
import type { Song } from "./catalog";
import type { CoverArtResult } from "./coverArt";

function song(fileId: string, album: string, parentId: string, extra: Partial<Song> = {}): Song {
  return { fileId, parentId, title: fileId, artist: "A", album, genre: "", composer: "", albumArtist: "", releaseYear: "", discNumber: "", trackNumber: "", releaseType: "", ...extra };
}

describe("albumArtKey", () => {
  test("アルバム名（前後の空白は除く）とフォルダで決まり、アルバム名が無ければnull", () => {
    expect(albumArtKey(" Abbey Road ", "f1")).toBe(albumArtKey("Abbey Road", "f1"));
    expect(albumArtKey("Abbey Road", "f1")).not.toBe(albumArtKey("Abbey Road", "f2"));
    expect(albumArtKey("  ", "f1")).toBeNull();
  });
});

describe("albumArtKeysByFileId", () => {
  test("何枚組（CD1/CD2のフォルダ）の曲は、どのディスクでも一覧の1件と同じキーになる", () => {
    const folders = new Map<string, FolderInfo>([
      ["cd1", { name: "CD1", parentId: "box" }],
      ["cd2", { name: "CD2", parentId: "box" }],
    ]);
    const groups = groupAlbumsForRack(annotateAlbumFolders([song("a", "Box", "cd1"), song("b", "Box", "cd2"), song("c", "Other", "x")], folders));
    const keys = albumArtKeysByFileId(groups);
    expect(keys.get("a")).toBe(albumArtKey("Box", "box"));
    expect(keys.get("b")).toBe(keys.get("a"));
    expect(keys.get("c")).toBe(albumArtKey("Other", "x"));
    const box = groups.find((g) => g.album === "Box");
    expect(box && albumArtKeyOfGroup(box)).toBe(keys.get("a"));
  });

  test("同じアルバム名でもフォルダが違えば別のキー", () => {
    const groups = groupAlbumsForRack(annotateAlbumFolders([song("a", "Best", "f1"), song("b", "Best", "f2")], new Map()));
    const keys = albumArtKeysByFileId(groups);
    expect(keys.get("a")).not.toBe(keys.get("b"));
  });
});

describe("albumInitial / albumTileHue", () => {
  test("頭文字は1書記素を大文字にし、空なら♪", () => {
    expect(albumInitial(" abbey")).toBe("A");
    expect(albumInitial("ひこうき雲")).toBe("ひ");
    expect(albumInitial("👨‍👩‍👧 family")).toBe("👨‍👩‍👧");
    expect(albumInitial("")).toBe("♪");
  });
  test("色相はアルバム名で決まり0〜359", () => {
    expect(albumTileHue("Abbey Road")).toBe(albumTileHue(" Abbey Road "));
    const hue = albumTileHue("ひこうき雲");
    expect(hue).toBeGreaterThanOrEqual(0);
    expect(hue).toBeLessThan(360);
  });
});

describe("thumbnailSize", () => {
  test("長い辺を上限に合わせて縮め、小さい画像はそのまま", () => {
    expect(thumbnailSize(1000, 500, 256)).toEqual({ width: 256, height: 128 });
    expect(thumbnailSize(500, 1000, 256)).toEqual({ width: 128, height: 256 });
    expect(thumbnailSize(100, 80, 256)).toEqual({ width: 100, height: 80 });
    expect(thumbnailSize(0, 80, 256)).toEqual({ width: 0, height: 0 });
  });
});

class MemoryStore implements AlbumArtStore {
  readonly map = new Map<string, string>();
  async get(key: string) { return this.map.get(key) ?? null; }
  async putIfAbsent(key: string, url: string) {
    if (this.map.has(key)) return false;
    this.map.set(key, url);
    return true;
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

function setup(keys: Record<string, string | null>, remote?: (key: string) => Promise<RemoteArtResult>) {
  const store = new MemoryStore();
  const shown: [string | null, string | null][] = [];
  const saved: [string, string][] = [];
  const extracts: { fileId: string; signal: AbortSignal; result: ReturnType<typeof deferred<CoverArtResult>> }[] = [];
  const deps: NowArtworkDeps = {
    keyOf: (fileId) => keys[fileId] ?? null,
    store,
    extract: (fileId, signal) => {
      const result = deferred<CoverArtResult>();
      extracts.push({ fileId, signal, result });
      return result.promise;
    },
    makeThumbnail: async (data) => `thumb:${new TextDecoder().decode(data)}`,
    show: (fileId, url) => shown.push([fileId, url]),
    onSaved: (key, url) => saved.push([key, url]),
    ...(remote ? { remote } : {}),
  };
  return { art: new NowArtwork(deps), store, shown, saved, extracts };
}
const picture = (text: string): CoverArtResult => ({ kind: "picture", format: "image/png", data: new TextEncoder().encode(text) });

describe("NowArtwork", () => {
  test("保存してあるアルバムの画像は、曲のファイルを読まずに出す", async () => {
    const t = setup({ s1: "k1" });
    t.store.map.set("k1", "saved-url");
    await t.art.setCurrent("s1");
    expect(t.extracts).toHaveLength(0);
    expect(t.shown.at(-1)).toEqual(["s1", "saved-url"]);
    expect(t.art.urlFor("s1")).toBe("saved-url");
  });

  test("保存が無ければ曲から読み、小さくしてアルバムとして保存して出す", async () => {
    const t = setup({ s1: "k1" });
    const done = t.art.setCurrent("s1");
    expect(t.shown.at(-1)).toEqual(["s1", null]); // 読み終わるまでは頭文字のタイル
    await Promise.resolve(); await Promise.resolve();
    t.extracts[0].result.resolve(picture("A"));
    await done;
    expect(t.store.map.get("k1")).toBe("thumb:A");
    expect(t.saved).toEqual([["k1", "thumb:A"]]);
    expect(t.shown.at(-1)).toEqual(["s1", "thumb:A"]);
  });

  test("読み終わる前に曲が変わったら、画像は読んだ曲のアルバムとして保存し、表示は変えない", async () => {
    const t = setup({ s1: "k1", s2: "k2" });
    const first = t.art.setCurrent("s1");
    await Promise.resolve(); await Promise.resolve();
    const firstExtract = t.extracts[0];
    const second = t.art.setCurrent("s2");
    expect(firstExtract.signal.aborted).toBe(true);
    // 中断が間に合わず、s1の画像が読めてしまった場合
    firstExtract.result.resolve(picture("A"));
    await first;
    expect(t.store.map.get("k1")).toBe("thumb:A");
    expect(t.store.map.has("k2")).toBe(false);
    expect(t.shown.at(-1)).toEqual(["s2", null]);
    expect(t.art.urlFor("s2")).toBeNull();
    await Promise.resolve(); await Promise.resolve();
    t.extracts[1].result.resolve(picture("B"));
    await second;
    expect(t.store.map.get("k2")).toBe("thumb:B");
    expect(t.shown.at(-1)).toEqual(["s2", "thumb:B"]);
  });

  test("画像の無い曲は、このページを開いている間は読み直さない。読めなかった曲は次にまた試す", async () => {
    const t = setup({ s1: "k1", s2: "k2" });
    let p = t.art.setCurrent("s1");
    await Promise.resolve(); await Promise.resolve();
    t.extracts[0].result.resolve({ kind: "none" });
    await p;
    p = t.art.setCurrent("s2");
    await Promise.resolve(); await Promise.resolve();
    t.extracts[1].result.resolve({ kind: "failed" });
    await p;
    await t.art.setCurrent("s1");
    expect(t.extracts).toHaveLength(2);
    p = t.art.setCurrent("s2");
    await Promise.resolve(); await Promise.resolve();
    expect(t.extracts).toHaveLength(3);
    expect(t.extracts[2].fileId).toBe("s2");
    t.extracts[2].result.resolve({ kind: "none" });
    await p;
  });

  test("同じ曲でもう一度呼んでも読み直さない。曲が無くなったら画像を消す", async () => {
    const t = setup({ s1: "k1" });
    t.store.map.set("k1", "saved");
    await t.art.setCurrent("s1");
    await t.art.setCurrent("s1");
    expect(t.shown.filter(([id]) => id === "s1")).toHaveLength(2); // タイル→画像の1回分だけ
    await t.art.setCurrent(null);
    expect(t.shown.at(-1)).toEqual([null, null]);
    expect(t.art.urlFor("s1")).toBeNull();
  });

  test("アルバム名の無い曲は、読んで出すが保存しない", async () => {
    const t = setup({ s1: null });
    const p = t.art.setCurrent("s1");
    await Promise.resolve(); await Promise.resolve();
    t.extracts[0].result.resolve(picture("A"));
    await p;
    expect(t.store.map.size).toBe(0);
    expect(t.saved).toEqual([]);
    expect(t.shown.at(-1)).toEqual(["s1", "thumb:A"]);
  });

  test("同じアルバムに先に保存した画像があれば上書きしない", async () => {
    const t = setup({ s1: "k1" });
    const p = t.art.setCurrent("s1");
    await Promise.resolve(); await Promise.resolve();
    t.store.map.set("k1", "other"); // 読んでいる間に、同じアルバムの別の曲の画像が保存された
    t.extracts[0].result.resolve(picture("A"));
    await p;
    expect(t.store.map.get("k1")).toBe("other");
    expect(t.saved).toEqual([]);
    expect(t.shown.at(-1)).toEqual(["s1", "thumb:A"]);
  });

  describe("Driveに置いた表紙（管理ツールが集めたもの）", () => {
    test("あれば、保存してある画像・曲のファイルより先に出す（確認画面で選び直した表紙を反映する）", async () => {
      const t = setup({ s1: "k1" }, async (key) => (key === "k1" ? { kind: "picture", url: "drive-url" } : { kind: "none" }));
      t.store.map.set("k1", "embedded-url");
      await t.art.setCurrent("s1");
      expect(t.extracts).toHaveLength(0);
      expect(t.shown.at(-1)).toEqual(["s1", "drive-url"]);
      expect(t.saved).toEqual([["k1", "drive-url"]]);
    });

    test("無い・取れなければ、これまでどおり保存してある画像、それも無ければ曲のファイルから", async () => {
      const results: Record<string, RemoteArtResult> = { k1: { kind: "none" }, k2: { kind: "failed" } };
      const t = setup({ s1: "k1", s2: "k2" }, async (key) => results[key]);
      t.store.map.set("k1", "embedded-url");
      await t.art.setCurrent("s1");
      expect(t.shown.at(-1)).toEqual(["s1", "embedded-url"]);
      const p = t.art.setCurrent("s2");
      for (let i = 0; i < 5; i += 1) await Promise.resolve();
      expect(t.extracts.map((e) => e.fileId)).toEqual(["s2"]);
      t.extracts[0].result.resolve(picture("B"));
      await p;
      expect(t.shown.at(-1)).toEqual(["s2", "thumb:B"]);
    });

    test("取っている間に曲が変わったら、前の曲の表紙は出さない", async () => {
      const pending = deferred<RemoteArtResult>();
      const t = setup({ s1: "k1", s2: "k2" }, (key) => (key === "k1" ? pending.promise : Promise.resolve({ kind: "picture", url: "drive-2" })));
      const first = t.art.setCurrent("s1");
      await t.art.setCurrent("s2");
      pending.resolve({ kind: "picture", url: "drive-1" });
      await first;
      expect(t.shown.at(-1)).toEqual(["s2", "drive-2"]);
      expect(t.art.urlFor("s2")).toBe("drive-2");
    });

    test("refresh：あとからDriveの表紙が分かったら、今の曲の画像を探し直す（それまでの表示は消さない）", async () => {
      let remote: RemoteArtResult = { kind: "none" };
      const t = setup({ s1: "k1" }, async () => remote);
      t.store.map.set("k1", "embedded-url");
      await t.art.setCurrent("s1");
      expect(t.shown.at(-1)).toEqual(["s1", "embedded-url"]);
      const shownBefore = t.shown.length;
      remote = { kind: "picture", url: "drive-url" };
      await t.art.refresh();
      expect(t.shown.slice(shownBefore)).toEqual([["s1", "drive-url"]]);
      await t.art.setCurrent(null);
      await t.art.refresh();
      expect(t.shown.at(-1)).toEqual([null, null]);
    });

    test("埋め込み画像を縮めている間にDriveの表紙が分かったら、保存はするが一覧へは知らせない（Driveの表紙を古い画像で上書きしない）", async () => {
      let remote: RemoteArtResult = { kind: "none" };
      const thumb = deferred<string | null>();
      const store = new MemoryStore();
      const shown: [string | null, string | null][] = [];
      const saved: [string, string][] = [];
      const extract = deferred<CoverArtResult>();
      const art = new NowArtwork({
        keyOf: () => "k1",
        store,
        extract: () => extract.promise,
        makeThumbnail: () => thumb.promise,
        show: (fileId, url) => shown.push([fileId, url]),
        onSaved: (key, url) => saved.push([key, url]),
        remote: async () => remote,
      });
      const first = art.setCurrent("s1");
      for (let i = 0; i < 5; i += 1) await Promise.resolve();
      extract.resolve(picture("A"));
      for (let i = 0; i < 5; i += 1) await Promise.resolve();
      // 縮めている間に、albumArtタブが届いた
      remote = { kind: "picture", url: "drive-url" };
      await art.refresh();
      expect(shown.at(-1)).toEqual(["s1", "drive-url"]);
      thumb.resolve("embedded-url");
      await first;
      expect(store.map.get("k1")).toBe("embedded-url");
      expect(saved).toEqual([["k1", "drive-url"]]);
      expect(shown.at(-1)).toEqual(["s1", "drive-url"]);
    });

    test("探すのが失敗（例外）しても、曲のファイルから読む", async () => {
      const t = setup({ s1: "k1" }, async () => { throw new Error("boom"); });
      const p = t.art.setCurrent("s1");
      for (let i = 0; i < 5; i += 1) await Promise.resolve();
      t.extracts[0].result.resolve(picture("A"));
      await p;
      expect(t.shown.at(-1)).toEqual(["s1", "thumb:A"]);
    });
  });
});
