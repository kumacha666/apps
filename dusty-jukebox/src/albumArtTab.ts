// アルバムアート：管理ツール（dusty-jukebox-tools）が集めてDriveへ置いた表紙を読む側。
// ツールは索引の`albumArt`タブに「アルバム→Drive上の画像のファイルID」を書く（1アルバム＝1行）。
// こちらは読むだけ（タブを作らない・書かない）。タブが無い・読めないときは、これまでどおり再生した曲の埋め込み画像だけを使う。
//
// 列（ツールとの契約、ツールの`src/albumArtSheet.ts`と同じ）：
//   albumFolderId, album, artist, embedded, artFileId, source, sourceId, checkedFileId, updatedAt
// キーはアルバム名（前後の空白を除く）＋まとめる単位のフォルダ。アルバム一覧の1件（`albumArtKeyOfGroup`）と同じ単位。
// `artFileId`が空でなければその画像を使う（見つからなかった・確認画面で外した等は空）。右に列が足されてもよい（先頭9列だけ確かめる）。

import { albumArtKey, type RemoteArtResult } from "./albumArt";
import { createSheetsFetch } from "./sheets";

export const ALBUM_ART_SHEET_NAME = "albumArt";
export const ALBUM_ART_SHEET_HEADER = [
  "albumFolderId",
  "album",
  "artist",
  "embedded",
  "artFileId",
  "source",
  "sourceId",
  "checkedFileId",
  "updatedAt",
] as const;

/** ヘッダーの先頭9列が契約どおりか（右に列が足されていてもよい）。 */
export function isReadableAlbumArtHeader(header: readonly (string | number)[]): boolean {
  return ALBUM_ART_SHEET_HEADER.every((name, i) => String(header[i] ?? "").trim() === name);
}

/** タブの行（ヘッダーを含む）→アルバムのキー→画像のファイルID。ヘッダーが違えば空。同じキーが2行あれば先の行。 */
export function parseAlbumArtTab(values: readonly (readonly (string | number)[])[]): Map<string, string> {
  const ids = new Map<string, string>();
  const [header, ...rows] = values;
  if (!header || !isReadableAlbumArtHeader(header)) return ids;
  for (const row of rows) {
    const key = albumArtKey(String(row[1] ?? ""), String(row[0] ?? "").trim());
    const artFileId = String(row[4] ?? "").trim();
    if (!key || !artFileId || ids.has(key)) continue;
    ids.set(key, artFileId);
  }
  return ids;
}

/** 索引の`albumArt`タブを読む。タブが無ければ空（作らない）。 */
export async function readAlbumArtFileIds(spreadsheetId: string, getAccessToken: () => Promise<string>): Promise<Map<string, string>> {
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}`;
  const sheetsFetch = createSheetsFetch(spreadsheetId, getAccessToken);
  const titlesRes = await sheetsFetch(`${base}?fields=${encodeURIComponent("sheets.properties.title")}`);
  const titles = ((await titlesRes.json()) as { sheets?: { properties?: { title?: string } }[] }).sheets ?? [];
  if (!titles.some((s) => s.properties?.title === ALBUM_ART_SHEET_NAME)) return new Map();
  const range = `'${ALBUM_ART_SHEET_NAME}'`;
  const res = await sheetsFetch(`${base}/values/${encodeURIComponent(range)}`);
  const data = (await res.json()) as { values?: (string | number)[][] };
  return parseAlbumArtTab(data.values ?? []);
}

/** Driveの画像を1枚取る（ログイン中のトークンで。画像を公開しなくてよい）。取れなければnull（理由は問わない）。 */
export async function fetchDriveImage(
  fileId: string,
  accessToken: string,
  signal?: AbortSignal,
  fetchFn: typeof fetch = (...args) => fetch(...args)
): Promise<{ data: Uint8Array; format: string } | null> {
  try {
    const res = await fetchFn(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal,
    });
    if (!res.ok) return null;
    const data = new Uint8Array(await res.arrayBuffer());
    if (data.length === 0) return null;
    return { data, format: res.headers.get("Content-Type") ?? "image/jpeg" };
  } catch {
    return null;
  }
}

/** ブラウザの保存先での、Driveの画像のキー（画像のファイルIDごと。確認画面で表紙を差し替えればIDが変わり、読み直す）。 */
export function driveArtStoreKey(artFileId: string): string {
  return `drive:${artFileId}`;
}

export interface RemoteAlbumArtDeps {
  /** アルバムのキー→Driveの画像のファイルID（albumArtタブに無ければnull）。 */
  fileIdOf(key: string): string | null;
  store: { get(key: string): Promise<string | null>; putIfAbsent(key: string, url: string): Promise<boolean> };
  /** 画像を取る。取れなければnull。 */
  fetchImage(fileId: string): Promise<{ data: Uint8Array; format: string } | null>;
  makeThumbnail(data: Uint8Array, format: string): Promise<string | null>;
}

/**
 * アルバムのキー→Driveの表紙（小さなdata URL）。albumArtタブに無ければ`none`（埋め込み画像の読み出しへ）。
 * 保存してあればそれを使い、無ければ取って保存する。同じ画像を同時に何度も取りに行かない。
 * 取れなかったときは`failed`（呼び出し元は埋め込み画像の読み出しへ）。通信・ログインの都合で取れなかった画像は次に頼まれたとき
 * また取りに行くが、取れたのに画像として読めなかったものは、このページを開いている間は取り直さない。
 */
export function createRemoteAlbumArt(deps: RemoteAlbumArtDeps): (key: string) => Promise<RemoteArtResult> {
  const inFlight = new Map<string, Promise<string | null>>();
  const unreadable = new Set<string>();
  const load = async (fileId: string): Promise<string | null> => {
    const storeKey = driveArtStoreKey(fileId);
    const cached = await deps.store.get(storeKey).catch(() => null);
    if (cached) return cached;
    const image = await deps.fetchImage(fileId).catch(() => null);
    if (!image) return null;
    const url = await deps.makeThumbnail(image.data, image.format).catch(() => null);
    if (!url) {
      unreadable.add(fileId);
      return null;
    }
    await deps.store.putIfAbsent(storeKey, url).catch(() => false);
    return url;
  };
  return async (key) => {
    const fileId = deps.fileIdOf(key);
    if (!fileId) return { kind: "none" };
    if (unreadable.has(fileId)) return { kind: "failed" };
    let pending = inFlight.get(fileId);
    if (!pending) {
      pending = load(fileId).finally(() => inFlight.delete(fileId));
      inFlight.set(fileId, pending);
    }
    const url = await pending;
    return url ? { kind: "picture", url } : { kind: "failed" };
  };
}
