import { ConcurrencyLimiter, isAuthError, type DriveFile } from "./drive";
import type { FetchRangeFn } from "./rangeTokenizer";
import { INDEX_SHEET_HEADER, indexRowsScanState, type UpsertIndexEntry } from "./sheets";
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
const FILE_ID_INDEX = INDEX_SHEET_HEADER.indexOf("fileId");
const EXTRACTION_FAILED_INDEX = INDEX_SHEET_HEADER.indexOf("extractionFailed");

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
// 書き込み直前に読み直した現在の索引の生データ（currentRows）と比較し、以下のいずれかに
// 該当するエントリを書き込み対象から除外する：
// - 行自体が既に無い（他プロセスによる削除・リコンサイル）
// - driveModifiedTimeが変わっている（Drive側でファイルが更新された）
// - 現在の行が既にextractionFailed=FALSE（別デバイスが同じ失敗行を同時にリトライして
//   先に成功していた。ファイル自体は変更されていないためdriveModifiedTimeの比較だけでは
//   検出できない「同一バージョンの同時リトライ」も、2026-09-02 Codexレビュー指摘で追加）
export function filterStaleUpsertEntries(
  entries: UpsertIndexEntry[],
  currentRows: (string | number)[][]
): { fresh: UpsertIndexEntry[]; staleFileIds: string[] } {
  const currentState = indexRowsScanState(currentRows);
  const currentRowByFileId = new Map(currentRows.map((row) => [String(row[FILE_ID_INDEX] ?? ""), row]));
  const oursByFileId = indexRowsScanState(entries.map((entry) => entry.row));
  const staleFileIds: string[] = [];
  const fresh = entries.filter((entry) => {
    const current = currentState.get(entry.fileId);
    const currentRow = currentRowByFileId.get(entry.fileId);
    const ours = oursByFileId.get(entry.fileId);
    const alreadyFixed = currentRow ? currentRow[EXTRACTION_FAILED_INDEX] !== "TRUE" : false;
    const isStale = !current || alreadyFixed || (ours !== undefined && current.driveModifiedTime !== ours.driveModifiedTime);
    if (isStale) staleFileIds.push(entry.fileId);
    return !isStale;
  });
  return { fresh, staleFileIds };
}

// trashed判定は「メタデータ取得時点」のスナップショットであり、タグ抽出・バッチ書き込みには
// 時間がかかるため、その間にファイルがゴミ箱から復元される可能性がある
// （2026-09-02 Codexレビュー指摘、P1：データ整合性の問題）。他デバイスの差分同期が既に
// その復元を処理し変更トークンを進めていた場合、復元後に索引側だけ行を消してしまうと
// 二度と補正されない。削除の直前にDriveへ再照会し、その時点でも実際にtrashed（または
// 削除済み＝404）であるファイルだけを削除対象として返す。
export async function revalidateTrashedFileIds(
  fileIds: string[],
  getFile: (fileId: string) => Promise<DriveFile | null>
): Promise<string[]> {
  const limiter = new ConcurrencyLimiter(MAX_CONCURRENT_METADATA_GETS);
  // retryFailedExtractionsと同じ方針：401等の認証エラーが1件でも起きたら、キューに残っている
  // 未着手のfiles.getを打ち切る（2026-09-02 Codexレビュー指摘、P2）。
  const controller = new AbortController();
  const results = await Promise.all(
    fileIds.map((fileId) =>
      limiter.run(async (): Promise<string | null> => {
        if (controller.signal.aborted) return null;
        try {
          const file = await getFile(fileId);
          return file === null || file.trashed === true ? fileId : null;
        } catch (err) {
          if (isAuthError(err)) controller.abort();
          throw err;
        }
      })
    )
  );
  return results.filter((fileId): fileId is string => fileId !== null);
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
