// Sheets索引（indexタブ）へのfileId起点upsert。CONCEPT.md 4.3節のスキーマに合わせた最小基盤。
// drive.ts/rangeTokenizer.tsと同じDI方針：Sheets APIへの実際のHTTP呼び出しはSheetsIndexIOとして
// 外側から注入し、このファイル自体は「fileIdで既存行を探し、あれば更新・無ければ追記する」
// upsertロジックだけを担当する（ユニットテストではフェイクのSheetsIndexIOを渡す）。
//
// このPRの範囲（着手順の目安2、最小基盤）: スキーマ定義＋fileId起点upsertのみ。
// sync タブ（startPageToken/rootFolderId/initialScanCompletedAt）の管理、重複行のマージ、
// _override列の競合検知（CONCEPT.md 4.3節）は後続PRで実装する。

import { detectGarbled, getExtension, sheetRange } from "./lib";

export const INDEX_SHEET_NAME = "index";

// CONCEPT.md 4.3節のindexタブスキーマそのまま（列順が唯一の真実。並べ替え・削除は
// 既存シートとの互換性を壊すため、追加のみ許容する）。
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
] as const;

// 抽出タグとfileId起点upsertに必要な最小限の入力。_override列は4.2節の方針通り、
// スキャナは絶対に書き込まない（新規行では空欄のまま作成する）。文字化け自動修復（4.4節）・
// 巨大ファイルのタイムアウト救済（5節）はこのPRの範囲外で、garbledResolved/extractionFailedは
// 常に初期値（未解決・失敗なし）として書き込む。
export interface IndexTagsLike {
  title?: string;
  artist?: string;
  albumArtist?: string;
  album?: string;
  composer?: string | string[];
  genre?: string | string[];
  releaseYear?: string | number;
  copyrightYear?: string | number;
  trackNumber?: string | number;
  discNumber?: string | number;
}

export interface BuildIndexRowArgs {
  fileId: string;
  fileName: string;
  parentId: string;
  driveModifiedTime: string;
  lastScannedAtIso: string;
  tags: IndexTagsLike | null | undefined;
  extractionFailed: boolean;
}

export function buildIndexRow({
  fileId,
  fileName,
  parentId,
  driveModifiedTime,
  lastScannedAtIso,
  tags,
  extractionFailed,
}: BuildIndexRowArgs): (string | number)[] {
  const title = tags?.title ?? "";
  const artist = tags?.artist ?? "";
  const albumArtist = tags?.albumArtist ?? "";
  const album = tags?.album ?? "";
  const composer = Array.isArray(tags?.composer) ? tags.composer.join(" / ") : (tags?.composer ?? "");
  const genre = Array.isArray(tags?.genre) ? tags.genre.join(" / ") : (tags?.genre ?? "");
  const releaseYear = tags?.releaseYear ?? "";
  const copyrightYear = tags?.copyrightYear ?? "";
  const trackNumber = tags?.trackNumber ?? "";
  const discNumber = tags?.discNumber ?? "";

  // 3.4節で確認済みのC1マーカー検出（detectGarbled）のみ。自動修復（4.4節）は後続PRで実装するため、
  // ここでは疑いフラグを立てるだけでgarbledResolvedは常にfalseのまま記録する。
  const garbledSuspect = [title, artist, albumArtist, album, composer].some((v) => detectGarbled(String(v)));

  return [
    fileId,
    getExtension(fileName),
    parentId,
    driveModifiedTime,
    lastScannedAtIso,
    title,
    "", // title_override（スキャナは書き込まない）
    artist,
    "", // artist_override
    albumArtist,
    "", // albumArtist_override
    album,
    "", // album_override
    composer,
    "", // composer_override
    genre,
    trackNumber,
    discNumber,
    releaseYear,
    "", // releaseYear_override
    copyrightYear,
    "", // releaseType_override
    "", // vocalGender_override
    "", // providerNote_override
    garbledSuspect ? "TRUE" : "FALSE",
    "FALSE", // garbledResolved（自動修復は後続PR）
    extractionFailed ? "TRUE" : "FALSE",
  ];
}

// indexタブへの実際の読み書きをDIするインターフェース（drive.tsのDriveListFnと同じ方針）。
export interface SheetsIndexIO {
  // A列（fileId）を上から順に返す。戻り値のインデックスiはシートの行番号 i+2 に対応する
  // （1行目はヘッダー固定のため）。
  listFileIds(): Promise<string[]>;
  // 1-indexedの行番号（ヘッダーの次が2）を指定して1行分を上書きする。
  updateRow(rowNumber: number, row: (string | number)[]): Promise<void>;
  // 複数行をシート末尾に追記する。
  appendRows(rows: (string | number)[][]): Promise<void>;
}

export interface UpsertIndexEntry {
  fileId: string;
  row: (string | number)[];
}

// fileIdを一意キーとしたupsert（CONCEPT.md 5節）。既存行があれば該当行を丸ごと上書き、
// 無ければ末尾に追記する。同一バッチ内に同じfileIdが複数含まれる場合は最後のものを採用する
// （呼び出し元が同一fileIdを重複して渡すこと自体を想定しないが、安全側の挙動として明記）。
export async function upsertIndexRows(io: SheetsIndexIO, entries: UpsertIndexEntry[]): Promise<void> {
  if (entries.length === 0) return;
  const existingIds = await io.listFileIds();
  const rowNumberByFileId = new Map<string, number>();
  existingIds.forEach((fileId, i) => {
    if (fileId) rowNumberByFileId.set(fileId, i + 2);
  });

  const toAppend: (string | number)[][] = [];
  for (const { fileId, row } of entries) {
    const rowNumber = rowNumberByFileId.get(fileId);
    if (rowNumber) {
      await io.updateRow(rowNumber, row);
    } else {
      toAppend.push(row);
    }
  }
  if (toAppend.length > 0) await io.appendRows(toAppend);
}

// SheetsIndexIOの実実装。ensureAccessTokenで取得したアクセストークンをAuthorizationヘッダーに載せる。
// スコープはauth.tsのSPREADSHEETS_SCOPE（音源そのものにアクセスするdrive.readonlyとは別スコープ、
// CONCEPT.md 2節・4.1節）。書き込み先はユーザー自身のGoogleドライブ内のスプレッドシート
// （spreadsheetId）のindexタブのみで、音源ファイルには一切触れない。
export function createSheetsIndexIO(spreadsheetId: string, getAccessToken: () => Promise<string>): SheetsIndexIO {
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values`;

  async function sheetsFetch(url: string, init?: RequestInit): Promise<Response> {
    const accessToken = await getAccessToken();
    const res = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", ...init?.headers },
    });
    if (!res.ok) {
      const bodyText = await res.text();
      throw new Error(`Sheets API request failed: ${res.status} ${bodyText}`);
    }
    return res;
  }

  return {
    async listFileIds() {
      const range = sheetRange(INDEX_SHEET_NAME, "A2:A");
      const res = await sheetsFetch(`${base}/${encodeURIComponent(range)}`);
      const data = (await res.json()) as { values?: string[][] };
      return (data.values ?? []).map((row) => row[0] ?? "");
    },
    async updateRow(rowNumber, row) {
      const lastCol = columnLetter(INDEX_SHEET_HEADER.length);
      const range = sheetRange(INDEX_SHEET_NAME, `A${rowNumber}:${lastCol}${rowNumber}`);
      await sheetsFetch(`${base}/${encodeURIComponent(range)}?valueInputOption=RAW`, {
        method: "PUT",
        body: JSON.stringify({ range, values: [row] }),
      });
    },
    async appendRows(rows) {
      const range = sheetRange(INDEX_SHEET_NAME, "A1");
      await sheetsFetch(`${base}/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
        method: "POST",
        body: JSON.stringify({ values: rows }),
      });
    },
  };
}

// 1-indexed列番号をA1記法の列文字に変換する（27列目=AA等）。INDEX_SHEET_HEADERは27列のためAAで足りるが、
// 将来列が増えても壊れないよう汎用的に実装しておく。
function columnLetter(colNumber: number): string {
  let n = colNumber;
  let result = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}
