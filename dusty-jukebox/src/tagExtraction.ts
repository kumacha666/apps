// CONCEPT.md 5節「Phase 1」: 音源1件からのタグ抽出。rangeTokenizer.ts（Rangeリクエストによる
// 部分取得）+ music-metadataを組み合わせ、抽出結果をsheets.tsのIndexTagsLikeへ変換する。
// Drive呼び出し部分（fetchRange）はdrive.tsのcreateDriveFetchRangeとして既にDIされているため、
// このファイルはDriveRangeTokenizer/music-metadataとの結線・タイムアウト制御だけを担当する。

import { parseFromTokenizer } from "music-metadata";
import { DriveRangeTokenizer, type FetchRangeFn } from "./rangeTokenizer";
import { guessMimeType } from "./lib";
import type { IndexTagsLike } from "./sheets";
import { DriveHttpError } from "./drive";
import { AuthError } from "./auth";

// drive.tsのisAuthError()と同じ判定（401・GISのサイレント再取得失敗）。長時間のスキャン中に
// トークンが失効した場合、これをファイル単位の失敗（extractionFailed）として握りつぶすと、
// main.ts側のisAuthFailure()に到達せず、残り全ファイルが同じ無効なトークンで失敗し続けてしまう
// （2026-08-20 Codexレビュー指摘）。呼び出し元がトークンをクリアし再ログインを促せるよう、
// このエラーだけは呼び出し元へそのまま再throwする。
function isAuthFailure(err: unknown): boolean {
  return err instanceof AuthError || (err instanceof DriveHttpError && err.status === 401);
}

// 巨大ファイル（数百MB級）向けのタイムアウト方針（CONCEPT.md 5節、2026-08-18確定）:
// 基本30秒＋ファイルサイズが100MBを超える分は10MBごとに+3秒を加算、上限180秒。
const BASE_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 180_000;
const LARGE_FILE_THRESHOLD_BYTES = 100 * 1024 * 1024;
const EXTRA_MS_PER_10MB = 3_000;

export function computeTagExtractionTimeoutMs(sizeBytes: number | undefined): number {
  if (!sizeBytes || sizeBytes <= LARGE_FILE_THRESHOLD_BYTES) return BASE_TIMEOUT_MS;
  const extraBytes = sizeBytes - LARGE_FILE_THRESHOLD_BYTES;
  const extraMs = Math.floor(extraBytes / (10 * 1024 * 1024)) * EXTRA_MS_PER_10MB;
  return Math.min(BASE_TIMEOUT_MS + extraMs, MAX_TIMEOUT_MS);
}

// 著作権表記の年は「リリース年」として確定させない（CONCEPT.md 3.3節）が、低信頼の参考値として
// copyrightYear列に別途保持する。表記文字列（例: "2018 CAPCOM CO., LTD."）から西暦4桁を拾う。
export function extractYearFromCopyright(copyright: string | undefined): string | undefined {
  const match = copyright?.match(/\b(19|20)\d{2}\b/);
  return match?.[0];
}

// music-metadataのcommonブロック相当（呼び出し側でnullを許容）。lib.tsのCommonTagsLikeは
// catalog-script移植時のcatalog-script/scan.js向け（composer/genreがstring|string[]混在）と
// 型が異なるため、本体の抽出結果専用に定義する。
export interface MusicMetadataCommonLike {
  title?: string;
  artist?: string;
  albumartist?: string;
  album?: string;
  composer?: string[];
  genre?: string[];
  year?: number;
  copyright?: string;
  track?: { no?: number | null };
  disk?: { no?: number | null };
}

function toIndexTags(common: MusicMetadataCommonLike): IndexTagsLike {
  return {
    title: common.title,
    artist: common.artist,
    albumArtist: common.albumartist,
    album: common.album,
    composer: common.composer,
    genre: common.genre,
    releaseYear: common.year,
    copyrightYear: extractYearFromCopyright(common.copyright),
    trackNumber: common.track?.no ?? undefined,
    discNumber: common.disk?.no ?? undefined,
  };
}

export interface ExtractTagsResult {
  tags: IndexTagsLike | null;
  extractionFailed: boolean;
}

// signalを受け取り、そのタイミングでのfetchRangeを組み立てるファクトリ。extractTags自身が
// AbortControllerのライフサイクル（タイムアウト時のabort）を握るため、呼び出し元
// （main.ts）は生のFetchRangeFnではなくこの形で渡す
// （drive.tsのcreateDriveFetchRangeの第三引数signalに、ここで生成したsignalをそのまま渡す想定）。
export type CreateFetchRangeFn = (signal: AbortSignal) => FetchRangeFn;

// 1ファイル分のタグ抽出。タイムアウト・パースエラーはどちらもextractionFailed=trueとして
// 呼び出し元に返す（5節: ファイル単位の失敗でスキャン全体を止めない。ファイル名フォールバックや
// extractionFailedの記録はsheets.ts/main.ts側の責務）。
export async function extractTags(
  file: { id: string; name: string; size?: number },
  createFetchRange: CreateFetchRangeFn
): Promise<ExtractTagsResult> {
  const abortController = new AbortController();
  const baseFetchRange = createFetchRange(abortController.signal);
  // music-metadataはtokenizerが投げたI/Oエラーを内部で独自の例外型にラップすることがあるため、
  // parseFromTokenizer()側の例外だけを見ていると認証エラー（DriveHttpError/AuthError）の
  // instanceof判定が生き残る保証が無い。fetchRange自身が投げた時点で捕捉して保持しておき、
  // 最終的にどんな形でエラーが浮上してきても判定できるようにする（2026-08-20 Codexレビュー指摘）。
  let capturedAuthError: unknown = null;
  const fetchRange: FetchRangeFn = async (start, endInclusive) => {
    try {
      return await baseFetchRange(start, endInclusive);
    } catch (err) {
      if (isAuthFailure(err)) capturedAuthError = err;
      throw err;
    }
  };
  const tokenizer = new DriveRangeTokenizer(fetchRange, { size: file.size, mimeType: guessMimeType(file.name) });
  const timeoutMs = computeTagExtractionTimeoutMs(file.size);

  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      abortController.abort();
      reject(new Error(`タグ抽出タイムアウト（${file.name}）`));
    }, timeoutMs);
  });

  // 負けた側（タイムアウト時のparseFromTokenizer、正常終了時のtimeout）が未処理の
  // rejectionとしてプロセスに警告を出さないよう、Promise.raceとは別に必ずcatchしておく
  // （catalog-script/src/verify-range.jsと同じ方針）
  const parsePromise = parseFromTokenizer(tokenizer, { skipCovers: true, duration: false });
  parsePromise.catch(() => {});
  timeout.catch(() => {});

  try {
    const metadata = await Promise.race([parsePromise, timeout]);
    return { tags: toIndexTags(metadata.common), extractionFailed: false };
  } catch {
    // 認証エラーはファイル単位の失敗として握りつぶさず、呼び出し元（main.ts）へ再throwする。
    // 呼び出し元のisAuthFailure()がこれを検知してスキャン全体を中断し、トークンをクリアできる。
    if (capturedAuthError) throw capturedAuthError;
    return { tags: null, extractionFailed: true };
  } finally {
    clearTimeout(timer!);
  }
}
