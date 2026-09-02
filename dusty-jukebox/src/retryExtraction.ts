import { ConcurrencyLimiter, isAuthError, type DriveFile } from "./drive";
import type { FetchRangeFn } from "./rangeTokenizer";
import { INDEX_SHEET_HEADER, indexRowsScanState, type UpsertIndexEntry } from "./sheets";
import { extractAndBuildIndexEntries } from "./tagExtraction";

export interface RetryExtractionSummary {
  removedFileIds: string[];
  trashedFileIds: string[];
  succeededCount: number;
  stillFailedCount: number;
}

export interface PersistBatchResult {
  staleFileIds: string[];
}

const MAX_CONCURRENT_METADATA_GETS = 4;
const EXTRACTION_BATCH_SIZE = 200;
const SCAN_RUN_ID_INDEX = INDEX_SHEET_HEADER.indexOf("scanRunId");
const FILE_ID_INDEX = INDEX_SHEET_HEADER.indexOf("fileId");
const EXTRACTION_FAILED_INDEX = INDEX_SHEET_HEADER.indexOf("extractionFailed");

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

// removeIndexRowsのisStillCurrentは、書き込みバッチ（既定200件）のたびに「そのバッチで
// 実際に空欄化しようとしているfileId」だけを渡して呼ばれる（sheets.tsのupdateRowsInBatches
// 参照、2026-09-02 Codexレビュー指摘：P1で修正）。以前は呼び出し側（main.ts）がバッチに
// 関係なく毎回trashedFileIds全件を渡していたため、バッチ1で確認した「trashed=true」を
// 後続の（時間の経った）バッチでもキャッシュ経由でそのまま信用してしまい、その間に復元
// されたファイルを誤って削除しうる、というTOCTOU窓を意図せず広げてしまっていた。
// 現在は各fileIdがちょうど1つのバッチにしか属さないため、このキャッシュは基本的に
// 「同じfileIdを2回照会しない」防御的な意味合いのみを持つ。
export function createCachedTrashRevalidator(
  getFile: (fileId: string) => Promise<DriveFile | null>
): (fileIds: string[]) => Promise<boolean> {
  const cache = new Map<string, boolean>();
  return async (fileIds: string[]): Promise<boolean> => {
    const uncached = fileIds.filter((id) => !cache.has(id));
    if (uncached.length > 0) {
      const stillTrashed = new Set(await revalidateTrashedFileIds(uncached, getFile));
      for (const id of uncached) cache.set(id, stillTrashed.has(id));
    }
    return fileIds.every((id) => cache.get(id) === true);
  };
}

// リトライ全体のオーケストレーション。ライブラリ全体規模の失敗をまとめてリトライすると
// タグ抽出だけで数時間かかりうるため、runFullScan（フルスキャン）と同じ「一定件数ごとに
// タグ抽出→索引への書き込みを行う」バッチ処理にする。全件の抽出が終わるまで一切書き込まない
// 実装だと、認証切れ・タブを閉じる・通信断等で中断した場合にそれまでの抽出結果が丸ごと失われ、
// 次回リトライがゼロからやり直しになってしまう（2026-09-02 Codexレビュー指摘、P2）。
// persistBatch: 1バッチ分のUpsertIndexEntry[]を実際に書き込む（呼び出し元でfilterStale
// UpsertEntries＋upsertIndexRowsを行う想定。書き込み直前の鮮度チェックは呼び出し元の責務のまま）。
// 呼び出し元は実際に書き込みをスキップしたfileId（staleFileIds）を返す必要がある。
// これを使って完了サマリーのsucceededCount/stillFailedCountから、鮮度チェックで除外された
// エントリを差し引く（2026-09-02 Codexレビュー指摘：P2。以前はpersistBatch呼び出し前の
// 抽出結果だけでカウントしており、他デバイスの更新により実際には書き込まれなかった
// エントリも「成功」として利用者に表示してしまっていた）。
// mergeDuplicates／removeTrashedは全バッチ完了後に1回だけ呼ぶ（重複マージは索引全体を
// 読み直すため、バッチのたびに呼ぶと大規模リトライで無駄なコストが積み上がる）。
export async function retryFailedExtractions(
  fileIds: string[],
  getFile: (fileId: string) => Promise<DriveFile | null>,
  createFetchRangeForFile: (fileId: string, signal: AbortSignal) => FetchRangeFn,
  onProgress: (done: number, total: number) => void,
  existingScanRunIds: Map<string, string>,
  persistBatch: (entries: UpsertIndexEntry[]) => Promise<PersistBatchResult>,
  mergeDuplicates: () => Promise<void>,
  removeTrashed: (fileIds: string[]) => Promise<void>,
  batchSize = EXTRACTION_BATCH_SIZE
): Promise<RetryExtractionSummary> {
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

  let succeededCount = 0;
  let stillFailedCount = 0;
  let done = 0;
  for (let offset = 0; offset < entries.length; offset += batchSize) {
    const batch = entries.slice(offset, offset + batchSize);
    const batchUpsertEntries = await extractAndBuildIndexEntries(
      batch,
      createFetchRangeForFile,
      (batchDone) => onProgress(done + batchDone, entries.length),
      ""
    );
    done += batch.length;
    for (const entry of batchUpsertEntries) {
      const preserved = existingScanRunIds.get(entry.fileId);
      if (preserved !== undefined) entry.row[SCAN_RUN_ID_INDEX] = preserved;
    }
    let staleFileIds: string[] = [];
    if (batchUpsertEntries.length > 0) ({ staleFileIds } = await persistBatch(batchUpsertEntries));
    const staleFileIdSet = new Set(staleFileIds);
    for (const entry of batchUpsertEntries) {
      if (staleFileIdSet.has(entry.fileId)) continue;
      if (entry.row[EXTRACTION_FAILED_INDEX] === "TRUE") stillFailedCount++;
      else succeededCount++;
    }
  }

  if (succeededCount + stillFailedCount > 0) await mergeDuplicates();
  if (trashedFileIds.length > 0) await removeTrashed(trashedFileIds);

  return { removedFileIds, trashedFileIds, succeededCount, stillFailedCount };
}
