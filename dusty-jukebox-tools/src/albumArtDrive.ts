// アルバムアートの収集で使う、Drive・Web画像・縮小の実装（ブラウザで動く部分）。
// - 曲のファイルはdrive.readonlyで読む（埋め込み画像を読むだけ）
// - 表紙の小さな画像は、このツールが作るフォルダ（appPropertiesで見分ける）へdrive.fileで置く
// 判断の部分はalbumArtCollect.ts・albumArtSearch.tsにあり、ここは通信と画像の変換だけ。

import type { ArtAlbum } from "./albumArtAlbums";
import { ImageFetchError } from "./albumArtCollect";
import { extractCoverArt, type CoverArtResult } from "./coverArt";
import type { FetchRangeFn } from "./rangeTokenizer";

const DRIVE = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
/** 表紙を置くフォルダの名前と、見分けるための印。 */
export const ART_FOLDER_NAME = "DustyJukebox アルバムアート";
export const ART_FOLDER_PROPERTY = { key: "dustyJukeboxRole", value: "albumArtFolder" } as const;
/** 表紙の大きさ（長い辺）。アプリの一覧・再生画面で足りる大きさ。 */
export const ART_THUMBNAIL_PX = 512;

export class DriveHttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 429・5xx・通信の失敗は少し待って3回までやり直す。401等はDriveHttpErrorのまま返す。 */
async function driveFetch(getAccessToken: () => Promise<string>, url: string, init: RequestInit = {}): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= 3; attempt += 1) {
    const token = await getAccessToken();
    let res: Response;
    try {
      res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers as Record<string, string> | undefined) } });
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt === 3) throw lastError;
      await sleep(500 * 2 ** attempt);
      continue;
    }
    if (res.ok) return res;
    const body = await res.text();
    lastError = new DriveHttpError(res.status, `Drive API request failed: ${res.status} ${body.slice(0, 300)}`);
    if (attempt === 3 || !(res.status === 429 || res.status >= 500)) throw lastError;
    await sleep(500 * 2 ** attempt);
  }
  throw lastError ?? new Error("unreachable");
}

/** 曲のファイルの埋め込み画像を読む（読めなければfailed。認証エラーも含めて例外にしない＝そのアルバムはerrorで次回やり直す）。 */
export function createEmbeddedExtractor(getAccessToken: () => Promise<string>): (fileId: string) => Promise<CoverArtResult> {
  return async (fileId) => {
    let meta: { size?: string; mimeType?: string };
    try {
      const res = await driveFetch(getAccessToken, `${DRIVE}/files/${encodeURIComponent(fileId)}?fields=size,mimeType&supportsAllDrives=true`);
      meta = (await res.json()) as { size?: string; mimeType?: string };
    } catch {
      return { kind: "failed" };
    }
    const size = meta.size !== undefined ? Number(meta.size) : undefined;
    const createFetchRange = (signal: AbortSignal): FetchRangeFn => async (start, end) => {
      const res = await driveFetch(getAccessToken, `${DRIVE}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`, {
        headers: { Range: `bytes=${start}-${end}` },
        signal,
      });
      return new Uint8Array(await res.arrayBuffer());
    };
    return extractCoverArt({ id: fileId, size: Number.isFinite(size) ? size : undefined, mimeType: meta.mimeType }, createFetchRange);
  };
}

/** Webの画像を取る（404等の「無い」はnull、通信の失敗はImageFetchError）。 */
export async function fetchWebImage(url: string): Promise<{ data: Uint8Array; format: string } | null> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    throw new ImageFetchError(`画像を取れませんでした: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (res.status === 404 || res.status === 400) return null;
  if (!res.ok) throw new ImageFetchError(`画像を取れませんでした: ${res.status}`);
  const format = res.headers.get("content-type") ?? "";
  if (!format.startsWith("image/")) return null;
  return { data: new Uint8Array(await res.arrayBuffer()), format };
}

/** 長い辺を[maxPx]以下に縮めた大きさ（元が小さければそのまま）。 */
export function thumbnailSize(width: number, height: number, maxPx: number): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const scale = Math.min(1, maxPx / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** 画像を[ART_THUMBNAIL_PX]以下のJPEGにする（ブラウザで読めない画像はnull）。 */
export async function makeJpegThumbnail(data: Uint8Array, format: string): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(new Blob([data as Uint8Array<ArrayBuffer>], { type: format || "image/jpeg" }));
    const { width, height } = thumbnailSize(bitmap.width, bitmap.height, ART_THUMBNAIL_PX);
    if (width === 0) return null;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    return await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", 0.86));
  } catch {
    return null;
  }
}

/** 表紙を置くフォルダ（このツールが作ったもの）。無ければ作る。 */
export async function ensureArtFolder(getAccessToken: () => Promise<string>): Promise<string> {
  const q = `mimeType='application/vnd.google-apps.folder' and trashed=false and appProperties has { key='${ART_FOLDER_PROPERTY.key}' and value='${ART_FOLDER_PROPERTY.value}' }`;
  const res = await driveFetch(getAccessToken, `${DRIVE}/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`);
  const found = ((await res.json()) as { files?: { id: string }[] }).files?.[0]?.id;
  if (found) return found;
  const created = await driveFetch(getAccessToken, `${DRIVE}/files?fields=id`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: ART_FOLDER_NAME,
      mimeType: "application/vnd.google-apps.folder",
      appProperties: { [ART_FOLDER_PROPERTY.key]: ART_FOLDER_PROPERTY.value },
    }),
  });
  return ((await created.json()) as { id: string }).id;
}

/** Driveに置くファイル名（アルバム名＋フォルダIDの先頭。Driveで見たときに分かるように）。 */
export function artFileName(album: ArtAlbum): string {
  const name = album.album.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 120);
  return `${name} [${album.albumFolderId.slice(0, 8)}].jpg`;
}

/** 表紙をフォルダへ置き、ファイルIDを返す。 */
export function createArtUploader(getAccessToken: () => Promise<string>, folderId: string): (album: ArtAlbum, image: Blob) => Promise<string> {
  return async (album, image) => {
    const metadata = {
      name: artFileName(album),
      parents: [folderId],
      mimeType: "image/jpeg",
      appProperties: { dustyJukeboxAlbumFolderId: album.albumFolderId },
    };
    const boundary = `dj-${Math.random().toString(36).slice(2)}`;
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
      `--${boundary}\r\nContent-Type: image/jpeg\r\n\r\n`,
      image,
      `\r\n--${boundary}--`,
    ]);
    const res = await driveFetch(getAccessToken, `${UPLOAD}?uploadType=multipart&fields=id`, {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    });
    return ((await res.json()) as { id: string }).id;
  };
}
