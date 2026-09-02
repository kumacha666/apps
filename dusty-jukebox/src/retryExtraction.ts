import { ConcurrencyLimiter, isAuthError, type DriveFile } from "./drive";
import type { FetchRangeFn } from "./rangeTokenizer";
import { INDEX_SHEET_HEADER, indexRowsScanState, type IndexRowScanState, type UpsertIndexEntry } from "./sheets";
import { extractAndBuildIndexEntries } from "./tagExtraction";

export interface RetryExtractionResult {
  upsertEntries: UpsertIndexEntry[];
  removedFileIds: string[];
  trashedFileIds: string[];
  succeededCount: number;
  stillFailedCount: number;
}

const MAX_CONCURRENT_METADATA_GETS = 4;
const SCAN_RUN_ID_INDEX = INDEX_SHEET_HEADER.indexOf("scanRunId");

// existingScanRunIds: fileId -> このリトライ開始前に行が持っていたscanRunId。retry自体は
// sync.tsのscanRunId概念（フルスキャンのバッチ処理・中断再開のウォーターマーク）とは無関係の
// 単発操作のため、リトライ成功時にscanRunId列を空欄で上書きしてしまうと、中断中のフルスキャンが
// 既に処理済みだったファイルの watermark が消え、再開時に不要な再抽出が走ってしまう
// （2026-09-02 Codexレビュー指摘、P2）。空欄で上書きする代わりに、リトライ前の値をそのまま
// 保持することで、フルスキャン側のwatermark判定に影響を与えないようにする。
export async function retryFailedExtractions(
  fileIds: string[],
  getFile: (fileId: string) => Promise<DriveFile | null>,
  createFetchRangeForFile: (fileId: string, signal: AbortSignal) => FetchRangeFn,
  onProgress: (done: number, total: number) => void,
  existingScanRunIds: Map<string, string> = new Map()
): Promise<RetryExtractionResult> {
  const limiter = new ConcurrencyLimiter(MAX_CONCURRENT_METADATA_GETS);
  // 401等の認証エラーが1件でも起きたら、ConcurrencyLimiterのキューに残っている未着手の
  // files.getを打ち切る（drive.tsのlistAudioFilesRecursive・tagExtraction.tsの
  // extractAndBuildIndexEntriesと同じ方針）。打ち切らないと、呼び出し元がトークンを
  // クリアした後もバックグラウンドで無効なトークンのままAPIを叩き続けてしまう
  // （2026-09-02 Codexレビュー指摘、P2）。
  const controller = new AbortController();
  const files = await Promise.all(
    fileIds.map((fileId) =>
      limiter.run(async (): Promise<DriveFile | null> => {
        if (controller.signal.aborted) return null;
        try {
          return await getFile(fileId);
        } catch (err) {
          if (isAuthError(err)) controller.abort();
          throw err;
        }
      })
    )
  );
  const removedFileIds = fileIds.filter((_, index) => !files[index]);
  const trashedFileIds = fileIds.filter((_, index) => files[index]?.trashed === true);
  const entries = files
    .filter((file): file is DriveFile => Boolean(file && !file.trashed))
    .map((file) => ({ file, folderPath: "" }));
  const upsertEntries = await extractAndBuildIndexEntries(entries, createFetchRangeForFile, onProgress, "");
  for (const entry of upsertEntries) {
    const preserved = existingScanRunIds.get(entry.fileId);
    if (preserved !== undefined) entry.row[SCAN_RUN_ID_INDEX] = preserved;
  }
  const failedIndex = INDEX_SHEET_HEADER.indexOf("extractionFailed");
  const stillFailedCount = upsertEntries.filter(({ row }) => row[failedIndex] === "TRUE").length;
  return { upsertEntries, removedFileIds, trashedFileIds, succeededCount: upsertEntries.length - stillFailedCount, stillFailedCount };
}

// リトライは抽出に時間がかかるため、開始時に読んだ索引スナップショットは書き込み時点では
// 古くなっている可能性がある。他デバイスの差分同期が同じファイルを先に処理していた場合、
// リトライ側の（古い時点の）抽出結果でそのファイルの行を上書きしてしまうと、差分同期側の
// 新しい結果が失われる（2026-09-02 Codexレビュー指摘、P1：データ整合性の問題）。
// 書き込み直前に読み直した現在の索引状態（currentIndexState）と比較し、driveModifiedTimeが
// 変わっている、または行自体が既に無い（他プロセスによる削除・リコンサイル）場合は
// そのエントリを書き込み対象から除外する。
export function filterStaleUpsertEntries(
  entries: UpsertIndexEntry[],
  currentIndexState: Map<string, IndexRowScanState>
): { fresh: UpsertIndexEntry[]; staleFileIds: string[] } {
  const oursByFileId = indexRowsScanState(entries.map((entry) => entry.row));
  const staleFileIds: string[] = [];
  const fresh = entries.filter((entry) => {
    const current = currentIndexState.get(entry.fileId);
    const ours = oursByFileId.get(entry.fileId);
    const isStale = !current || (ours !== undefined && current.driveModifiedTime !== ours.driveModifiedTime);
    if (isStale) staleFileIds.push(entry.fileId);
    return !isStale;
  });
  return { fresh, staleFileIds };
}

export async function persistRetryExtractionResult(
  result: RetryExtractionResult,
  upsertBatch: (entries: UpsertIndexEntry[]) => Promise<void>,
  mergeDuplicates: () => Promise<void>,
  removeTrashed: (fileIds: string[]) => Promise<void>,
  batchSize = 200
): Promise<void> {
  for (let offset = 0; offset < result.upsertEntries.length; offset += batchSize) {
    await upsertBatch(result.upsertEntries.slice(offset, offset + batchSize));
  }
  // 重複マージ（mergeDuplicateIndexRows）は索引全体を読み直して走査するため、バッチのたびに
  // 呼ぶと大規模リトライ（数千〜1万件規模）で索引全体の読み取りが繰り返し発生し、レイテンシと
  // Sheets APIのクォータを浪費する（2026-09-02 Codexレビュー指摘、P2）。全バッチ完了後に1回だけ
  // 実行すれば十分（重複が生じるのは書き込みの競合時であり、バッチ単位で即座に解消する必要はない）。
  if (result.upsertEntries.length > 0) await mergeDuplicates();
  if (result.trashedFileIds.length > 0) await removeTrashed(result.trashedFileIds);
}
