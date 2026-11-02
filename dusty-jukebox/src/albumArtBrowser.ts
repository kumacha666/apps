// アルバムアート（R17）のブラウザ側：画像の縮小（canvas）と、保存先（IndexedDB）。
// IndexedDBが使えない環境（プライベートブラウズの一部など）では、このページを開いている間だけメモリに持つ。

import { thumbnailSize, type AlbumArtStore } from "./albumArt";

/** 一覧・再生バー・OSのメディア操作画面に出す大きさ（長い辺）。 */
export const ALBUM_ART_PX = 256;

/** 埋め込み画像を[maxPx]以下に縮めてJPEGのdata URLにする。読めない画像はnull。 */
export async function makeThumbnailDataUrl(data: Uint8Array, format: string, maxPx = ALBUM_ART_PX): Promise<string | null> {
  try {
    const type = /^image\//i.test(format) ? format : "image/jpeg";
    const bitmap = await createImageBitmap(new Blob([data as BlobPart], { type }));
    try {
      const { width, height } = thumbnailSize(bitmap.width, bitmap.height, maxPx);
      if (width === 0 || height === 0) return null;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(bitmap, 0, 0, width, height);
      return canvas.toDataURL("image/jpeg", 0.85);
    } finally {
      bitmap.close();
    }
  } catch {
    return null;
  }
}

const DB_NAME = "dusty-jukebox-album-art";
const STORE = "thumbnails";

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** IndexedDBに保存する置き場。読んだ画像は[memoryLimit]件までメモリにも持つ（古いものから捨てる）。 */
export function createIndexedDbAlbumArtStore(memoryLimit = 300): AlbumArtStore {
  const memory = new Map<string, string>();
  const remember = (key: string, url: string) => {
    memory.delete(key);
    memory.set(key, url);
    while (memory.size > memoryLimit) memory.delete(memory.keys().next().value as string);
  };
  let dbPromise: Promise<IDBDatabase | null> | null = null;
  const db = (): Promise<IDBDatabase | null> => {
    dbPromise ??= new Promise<IDBDatabase | null>((resolve) => {
      try {
        const open = indexedDB.open(DB_NAME, 1);
        open.onupgradeneeded = () => open.result.createObjectStore(STORE);
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => resolve(null);
        open.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    return dbPromise;
  };
  // IndexedDBが使えないときだけ、こちらに全件を持つ
  const fallback = new Map<string, string>();
  return {
    async get(key) {
      const hit = memory.get(key);
      if (hit) {
        remember(key, hit);
        return hit;
      }
      const database = await db();
      if (!database) return fallback.get(key) ?? null;
      try {
        const value = await request(database.transaction(STORE, "readonly").objectStore(STORE).get(key));
        if (typeof value !== "string") return null;
        remember(key, value);
        return value;
      } catch {
        return null;
      }
    },
    async putIfAbsent(key, url) {
      const database = await db();
      if (!database) {
        if (fallback.has(key)) return false;
        fallback.set(key, url);
        remember(key, url);
        return true;
      }
      try {
        const store = database.transaction(STORE, "readwrite").objectStore(STORE);
        // add()は同じキーがあると失敗する（＝すでにあれば上書きしない）
        await request(store.add(url, key));
        remember(key, url);
        return true;
      } catch {
        return false;
      }
    },
  };
}
