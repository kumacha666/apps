import { ConcurrencyLimiter, type DriveFile } from "./drive";
import type { FetchRangeFn } from "./rangeTokenizer";
import { INDEX_SHEET_HEADER, type UpsertIndexEntry } from "./sheets";
import { extractAndBuildIndexEntries } from "./tagExtraction";

export interface RetryExtractionResult {
  upsertEntries: UpsertIndexEntry[];
  removedFileIds: string[];
  trashedFileIds: string[];
  succeededCount: number;
  stillFailedCount: number;
}

const MAX_CONCURRENT_METADATA_GETS = 4;

export async function retryFailedExtractions(
  fileIds: string[],
  getFile: (fileId: string) => Promise<DriveFile | null>,
  createFetchRangeForFile: (fileId: string, signal: AbortSignal) => FetchRangeFn,
  onProgress: (done: number, total: number) => void
): Promise<RetryExtractionResult> {
  const limiter = new ConcurrencyLimiter(MAX_CONCURRENT_METADATA_GETS);
  const files = await Promise.all(fileIds.map((fileId) => limiter.run(() => getFile(fileId))));
  const removedFileIds = fileIds.filter((_, index) => !files[index]);
  const trashedFileIds = fileIds.filter((_, index) => files[index]?.trashed === true);
  const entries = files
    .filter((file): file is DriveFile => Boolean(file && !file.trashed))
    .map((file) => ({ file, folderPath: "" }));
  const upsertEntries = await extractAndBuildIndexEntries(entries, createFetchRangeForFile, onProgress, "");
  const failedIndex = INDEX_SHEET_HEADER.indexOf("extractionFailed");
  const stillFailedCount = upsertEntries.filter(({ row }) => row[failedIndex] === "TRUE").length;
  return { upsertEntries, removedFileIds, trashedFileIds, succeededCount: upsertEntries.length - stillFailedCount, stillFailedCount };
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
    await mergeDuplicates();
  }
  if (result.trashedFileIds.length > 0) await removeTrashed(result.trashedFileIds);
}
