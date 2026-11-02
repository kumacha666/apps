// アルバムアート（R17）：再生中の曲のファイルに埋め込まれた画像（ID3のAPIC・MP4のcovr・FLACのpicture）を
// Rangeリクエストで読み出す。タグ抽出（tagExtraction.ts）と同じDriveRangeTokenizer＋music-metadataを使うが、
// 画像は大きいことがあるので、タグ抽出（skipCovers: true）とは別の呼び出しにしている。
// 画像は「おまけ」なので、失敗はすべて結果として返し、例外にしない（認証エラーでもトークンを捨てない。
// 認証の扱いは再生側に任せる）。

import { parseFromTokenizer } from "music-metadata";
import { DriveRangeTokenizer, type FetchRangeFn } from "./rangeTokenizer";
import { computeTagExtractionTimeoutMs } from "./tagExtraction";

export interface PictureLike { format: string; data: Uint8Array; type?: string }

export type CoverArtResult =
  | { kind: "picture"; format: string; data: Uint8Array }
  // ファイルは読めたが画像が無い（同じ曲で何度も読み直さない）
  | { kind: "none" }
  // 読めなかった（通信・タイムアウト・中断など。次にその曲を鳴らしたとき、また試す）
  | { kind: "failed" };

/** 表紙（Cover (front)）を優先し、無ければ最初の画像。中身の無い画像は使わない。 */
export function pickCover(pictures: readonly PictureLike[] | undefined): PictureLike | null {
  const usable = (pictures ?? []).filter((p) => p.data && p.data.length > 0);
  return usable.find((p) => p.type === "Cover (front)") ?? usable[0] ?? null;
}

export interface CoverArtFile { id: string; size?: number; mimeType?: string }

/**
 * 1曲分の埋め込み画像を読む。[signal]が中断されたら（曲が変わった等）`failed`で終わる。
 * [createFetchRange]は、渡したsignalで中断できるRange取得を作る（tagExtraction.tsのCreateFetchRangeFnと同じ形）。
 */
export async function extractCoverArt(
  file: CoverArtFile,
  createFetchRange: (signal: AbortSignal) => FetchRangeFn,
  signal?: AbortSignal
): Promise<CoverArtResult> {
  const controller = new AbortController();
  if (signal) {
    if (signal.aborted) return { kind: "failed" };
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const tokenizer = new DriveRangeTokenizer(createFetchRange(controller.signal), { size: file.size, mimeType: file.mimeType });
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error("cover art timeout"));
      }, computeTagExtractionTimeoutMs(file.size));
    });
    const abort = new Promise<never>((_, reject) => {
      if (controller.signal.aborted) reject(new Error("aborted"));
      controller.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    });
    const parsePromise = parseFromTokenizer(tokenizer, { skipCovers: false, duration: false });
    parsePromise.catch(() => {});
    timeout.catch(() => {});
    abort.catch(() => {});
    const metadata = await Promise.race([parsePromise, timeout, abort]);
    const cover = pickCover(metadata.common.picture as PictureLike[] | undefined);
    return cover ? { kind: "picture", format: cover.format, data: cover.data } : { kind: "none" };
  } catch {
    return { kind: "failed" };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
