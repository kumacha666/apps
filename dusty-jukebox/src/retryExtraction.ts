import type { DriveFile } from "./drive";
import type { FetchRangeFn } from "./rangeTokenizer";
import { INDEX_SHEET_HEADER, type UpsertIndexEntry } from "./sheets";
import { extractAndBuildIndexEntries } from "./tagExtraction";

export interface RetryExtractionResult {
  upsertEntries: UpsertIndexEntry[];
  removedFileIds: string[];
  succeededCount: number;
  stillFailedCount: number;
}

export async function retryFailedExtractions(
  fileIds: string[],
  getFile: (fileId: string) => Promise<DriveFile | null>,
  createFetchRangeForFile: (fileId: string, signal: AbortSignal) => FetchRangeFn,
  onProgress: (done: number, total: number) => void
): Promise<RetryExtractionResult> {
  const files = await Promise.all(fileIds.map((fileId) => getFile(fileId)));
  const removedFileIds = fileIds.filter((_, index) => !files[index] || files[index]?.trashed);
  const entries = files
    .filter((file): file is DriveFile => Boolean(file && !file.trashed))
    .map((file) => ({ file, folderPath: "" }));
  const upsertEntries = await extractAndBuildIndexEntries(entries, createFetchRangeForFile, onProgress, "");
  const failedIndex = INDEX_SHEET_HEADER.indexOf("extractionFailed");
  const stillFailedCount = upsertEntries.filter(({ row }) => row[failedIndex] === "TRUE").length;
  return { upsertEntries, removedFileIds, succeededCount: upsertEntries.length - stillFailedCount, stillFailedCount };
}
