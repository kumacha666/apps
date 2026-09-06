// dusty-jukebox（本体）のsrc/sheets.tsから、このアプリ（カタログ補正専用）に必要な部分だけを
// 移植したサブセット。索引スキーマ（INDEX_SHEET_HEADER）は本体と完全に同じ列順を保つこと
// （このアプリが読み書きするのは本体と同じindexタブのため。列を追加・変更する場合は
// 本体のsheets.tsと両方を更新する必要がある。apps全体の方針でアプリ間のコード共有はしないため、
// この重複は意図的なもの）。
// upsert・重複行マージ・削除・リコンサイル等、スキャン・差分同期に関わるロジックはこのアプリの
// スコープ外のため移植していない（本体のみが担当）。

import { sheetRange } from "./lib";

export const INDEX_SHEET_NAME = "index";

export const INDEX_SHEET_HEADER = [
  "fileId",
  "extension",
  "parentId",
  "driveModifiedTime",
  "lastScannedAt",
  "title",
  "title_override",
  "artist",
  "artist_override",
  "albumArtist",
  "albumArtist_override",
  "album",
  "album_override",
  "composer",
  "composer_override",
  "genre",
  "trackNumber",
  "discNumber",
  "releaseYear",
  "releaseYear_override",
  "copyrightYear",
  "releaseType_override",
  "vocalGender_override",
  "providerNote_override",
  "garbledSuspect",
  "garbledResolved",
  "extractionFailed",
  "title_conflictCandidate",
  "title_hasConflict",
  "artist_conflictCandidate",
  "artist_hasConflict",
  "albumArtist_conflictCandidate",
  "albumArtist_hasConflict",
  "album_conflictCandidate",
  "album_hasConflict",
  "composer_conflictCandidate",
  "composer_hasConflict",
  "releaseYear_conflictCandidate",
  "releaseYear_hasConflict",
  "releaseType_conflictCandidate",
  "releaseType_hasConflict",
  "vocalGender_conflictCandidate",
  "vocalGender_hasConflict",
  "providerNote_conflictCandidate",
  "providerNote_hasConflict",
  "scanRunId",
] as const;

export const WRITE_BATCH_SIZE = 200;

export class SheetsHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
  }
}

// このアプリが必要とする最小限のIO（本体のSheetsIndexIOのサブセット）。行全体の更新
// （updateRows）・追記（appendRows）はこのアプリでは行わない：カタログ補正機能は対象
// `<field>_override`セル1つだけをピンポイントで更新する設計のため（caseNormalization.ts/
// garbledRepair.ts参照。行全体を書き戻すと、読み取り〜書き込みの間に他デバイスが更新した
// 無関係な列を巻き戻してしまうリスクがあるため、意図的にupdateCellsのみを提供する）。
export interface SheetsIndexReadWriteIO {
  listExistingRows(): Promise<(string | number)[][]>;
  readHeaderRow(): Promise<(string | number)[]>;
  updateCells(updates: { rowNumber: number; columnIndex: number; value: string | number }[]): Promise<void>;
}

export function isValidIndexHeader(header: (string | number)[]): boolean {
  return header.length === INDEX_SHEET_HEADER.length && header.every((v, i) => v === INDEX_SHEET_HEADER[i]);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const RETRYABLE_403_REASONS = new Set(["rateLimitExceeded", "userRateLimitExceeded"]);

function isRetryableError(status: number, bodyText: string): boolean {
  if (status === 429) return true;
  if (status >= 500 && status < 600) return true;
  if (status === 403) {
    try {
      const body = JSON.parse(bodyText) as { error?: { errors?: { reason?: string }[] } };
      return (body.error?.errors ?? []).some((e) => RETRYABLE_403_REASONS.has(e.reason ?? ""));
    } catch {
      return false;
    }
  }
  return false;
}

// 本体のcreateSheetsFetchと同じ方針（429/5xx・クォータ超過403・通信例外を指数バックオフで
// リトライ）。このアプリはGET（listExistingRows/readHeaderRow）とPOST（updateCells、
// values:batchUpdateは冪等）のみを発行するため、appendRowsのような非冪等リトライ制御は不要。
export function createSheetsFetch(spreadsheetId: string, getAccessToken: () => Promise<string>) {
  return async function sheetsFetch(url: string, init?: RequestInit): Promise<Response> {
    const maxRetries = 3;
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const accessToken = await getAccessToken();
      const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}` };
      if (init?.body !== undefined) headers["Content-Type"] = "application/json";
      let res: Response;
      try {
        res = await fetch(url, { ...init, headers: { ...headers, ...init?.headers } });
      } catch (networkErr) {
        lastError = networkErr instanceof Error ? networkErr : new Error(String(networkErr));
        if (attempt >= maxRetries) throw lastError;
        await sleep(500 * 2 ** attempt);
        continue;
      }
      if (res.ok) return res;
      const bodyText = await res.text();
      lastError = new SheetsHttpError(res.status, `Sheets API request failed: ${res.status} ${bodyText} (spreadsheet: ${spreadsheetId})`);
      if (attempt >= maxRetries || !isRetryableError(res.status, bodyText)) throw lastError;
      await sleep(500 * 2 ** attempt);
    }
    throw lastError ?? new Error("unreachable");
  };
}

export function createSheetsIndexIO(spreadsheetId: string, getAccessToken: () => Promise<string>): SheetsIndexReadWriteIO {
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}`;
  const lastCol = columnLetter(INDEX_SHEET_HEADER.length);
  const sheetsFetch = createSheetsFetch(spreadsheetId, getAccessToken);

  return {
    async listExistingRows() {
      const range = sheetRange(INDEX_SHEET_NAME, `A2:${lastCol}`);
      const res = await sheetsFetch(`${base}/values/${encodeURIComponent(range)}`);
      const data = (await res.json()) as { values?: (string | number)[][] };
      return data.values ?? [];
    },
    async readHeaderRow() {
      const range = sheetRange(INDEX_SHEET_NAME, "1:1");
      const res = await sheetsFetch(`${base}/values/${encodeURIComponent(range)}`);
      const data = (await res.json()) as { values?: (string | number)[][] };
      return data.values?.[0] ?? [];
    },
    async updateCells(updates) {
      if (updates.length === 0) return;
      await sheetsFetch(`${base}/values:batchUpdate`, {
        method: "POST",
        body: JSON.stringify({
          valueInputOption: "RAW",
          data: updates.map(({ rowNumber, columnIndex, value }) => ({
            range: sheetRange(INDEX_SHEET_NAME, `${columnLetter(columnIndex + 1)}${rowNumber}`),
            values: [[value]],
          })),
        }),
      });
    },
  };
}

export function columnLetter(colNumber: number): string {
  let n = colNumber;
  let result = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}
