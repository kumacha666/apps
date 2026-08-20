// CONCEPT.md 5節「Phase 1」: 音源1件からのタグ抽出。rangeTokenizer.ts（Rangeリクエストによる
// 部分取得）+ music-metadataを組み合わせ、抽出結果をsheets.tsのIndexTagsLikeへ変換する。
// Drive呼び出し部分（fetchRange）はdrive.tsのcreateDriveFetchRangeとして既にDIされているため、
// このファイルはDriveRangeTokenizer/music-metadataとの結線・タイムアウト制御だけを担当する。

import { parseFromTokenizer } from "music-metadata";
import { DriveRangeTokenizer, type FetchRangeFn } from "./rangeTokenizer";
import { deriveFallbackTitle, guessMimeType, parseFileSizeBytes } from "./lib";
import { buildIndexRow, type IndexTagsLike, type UpsertIndexEntry } from "./sheets";
import { ConcurrencyLimiter, isAuthError, type AudioFileEntry } from "./drive";

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
      if (isAuthError(err)) capturedAuthError = err;
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
    // 呼び出し元のisAuthError()判定を介して検知しスキャン全体を中断し、トークンをクリアできる。
    if (capturedAuthError) throw capturedAuthError;
    return { tags: null, extractionFailed: true };
  } finally {
    clearTimeout(timer!);
  }
}

// タグ抽出は1ファイルあたり複数回のRangeリクエスト＋パース処理を伴い、フォルダ一覧取得より
// 重い。drive.tsのフォルダ走査と同じ暫定値（DEFAULT_MAX_CONCURRENT_LISTS=6）よりやや控えめにする。
const MAX_CONCURRENT_EXTRACTIONS = 4;

// 見つかった音楽ファイル全件のタグを抽出し、sheets.tsのupsertIndexRowsへ渡せる形に組み立てる。
// 1ファイルの抽出失敗（タイムアウト等）はextractionFailed=trueとして記録するだけでスキャン全体は
// 止めない（CONCEPT.md 5節）。認証エラーが起きた場合は、drive.tsのlistAudioFilesRecursiveと
// 同じ方針で、ConcurrencyLimiterのキューに残っている未着手タスクを打ち切る（2026-08-20
// Codexレビュー指摘: Promise.all自体は最初のrejectで即座に確定するが、キュー済みタスクには
// 打ち切りシグナルが無く動き続けるため、呼び出し元がトークンをクリアした後もバックグラウンドで
// 無効なトークンのままAPIを叩き続けてしまっていた。既に発行済みのHTTPリクエストまでは
// 止められない点はdrive.tsのlistAudioFilesRecursiveと同じ既知の限界）。
export async function extractAndBuildIndexEntries(
  entries: AudioFileEntry[],
  createFetchRangeForFile: (fileId: string, signal: AbortSignal) => FetchRangeFn,
  onProgress: (done: number, total: number) => void
): Promise<UpsertIndexEntry[]> {
  const limiter = new ConcurrencyLimiter(MAX_CONCURRENT_EXTRACTIONS);
  const controller = new AbortController();
  const lastScannedAtIso = new Date().toISOString();
  let done = 0;
  const results = await Promise.all(
    entries.map(({ file }) =>
      limiter.run(async (): Promise<UpsertIndexEntry | null> => {
        if (controller.signal.aborted) return null;
        let extraction: ExtractTagsResult;
        try {
          extraction = await extractTags({ id: file.id, name: file.name, size: parseFileSizeBytes(file.size) }, (signal) =>
            createFetchRangeForFile(file.id, signal)
          );
        } catch (err) {
          // 認証エラーだけ打ち切りシグナルを立てる。それ以外（このcatchに来ることは通常無い。
          // extractTagsは認証エラー以外を投げない設計だが、想定外のバグでスキャン全体が
          // 完全に停止するのを避けるため、認証エラー以外はそのままこのファイルの失敗として伝播させる）
          if (isAuthError(err)) controller.abort();
          throw err;
        }
        done += 1;
        onProgress(done, entries.length);
        const { tags, extractionFailed } = extraction;
        // indexスキーマには元のファイル名を保存する列が無いため、タイトルタグが無い
        // （抽出失敗、またはtitleタグ自体が空）行はfileId以外で識別できなくなる
        // （2026-08-20 Codexレビュー指摘）。ファイル名（拡張子除く）を暫定タイトルとして補う。
        // 既存行の再スキャンで抽出に失敗した場合は、この値はsheets.tsのmergeWithExistingが
        // 既存の抽出値を優先するため使われない（新規ファイルの初回スキャンでのみ効く）。
        const effectiveTags = { ...(tags ?? {}), title: tags?.title || deriveFallbackTitle(file.name) };
        const row = buildIndexRow({
          fileId: file.id,
          fileName: file.name,
          parentId: file.parents?.[0] ?? "",
          driveModifiedTime: file.modifiedTime ?? "",
          lastScannedAtIso,
          tags: effectiveTags,
          extractionFailed,
        });
        return { fileId: file.id, row };
      })
    )
  );
  return results.filter((r): r is UpsertIndexEntry => r !== null);
}
