// Sheets索引（indexタブ）へのfileId起点upsert。CONCEPT.md 4.3節のスキーマに合わせた最小基盤。
// drive.ts/rangeTokenizer.tsと同じDI方針：Sheets APIへの実際のHTTP呼び出しはSheetsIndexIOとして
// 外側から注入し、このファイル自体は「fileIdで既存行を探し、あれば更新・無ければ追記する」
// upsertロジックだけを担当する（ユニットテストではフェイクのSheetsIndexIOを渡す）。
//
// このPRの範囲（着手順の目安2、最小基盤）: スキーマ定義＋fileId起点upsertのみ。
// sync タブ（startPageToken/rootFolderId/initialScanCompletedAt）の管理・indexタブ自体の
// 初回作成（ヘッダー書き込み含む）、重複行のマージ、_override列の競合検知（CONCEPT.md 4.3節）は
// 後続PRで実装する。ユーザーが事前にindex タブ＋ヘッダー行を作成済みであることを前提とする。

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

// スキャナが絶対に書き換えてはならない列（4.2節）。upsert時、既存行に対してはこれらの列を
// 常に温存し、新規行に対してのみ空欄（オーバーライド無し）で作成する。
const OVERRIDE_COLUMN_INDEXES = new Set(
  INDEX_SHEET_HEADER.map((name, i) => (name.endsWith("_override") ? i : -1)).filter((i) => i >= 0)
);

// タグ抽出由来の列（識別子・タイムスタンプ・extractionFailed自体を除く）。再スキャンで
// タグ抽出に失敗した場合（5節：巨大ファイルのタイムアウト等）、これらの列は新しい行の
// 空値で上書きせず既存行の値を保持する（2026-08-20 Codexレビュー指摘：失敗するたびに
// 一度正常に索引化できていたタイトル・アーティスト等が消えてしまっていた）。
const NON_TAG_COLUMN_NAMES = new Set(["fileId", "extension", "parentId", "driveModifiedTime", "lastScannedAt", "extractionFailed"]);
const TAG_COLUMN_INDEXES = new Set(
  INDEX_SHEET_HEADER.map((name, i) => (!OVERRIDE_COLUMN_INDEXES.has(i) && !NON_TAG_COLUMN_NAMES.has(name) ? i : -1)).filter(
    (i) => i >= 0
  )
);
const EXTRACTION_FAILED_INDEX = INDEX_SHEET_HEADER.indexOf("extractionFailed");

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

// HTTPステータスを保持したエラー。drive.tsのDriveHttpErrorと同じ方針：401（トークン失効・拒否）は
// 呼び出し元（将来main.tsに結線した際）がDriveAuth.clearToken()を呼ぶ判断材料として必要になる
// （2026-08-20 Codexレビュー指摘：ステータスを持たない素のErrorに変換すると、Sheets側の401が
// 走査/同期の中断や再ログイン誘導に一切つながらなくなる）。
export class SheetsHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
  }
}

// indexタブへの実際の読み書きをDIするインターフェース（drive.tsのDriveListFnと同じ方針）。
export interface SheetsIndexIO {
  // ヘッダー行を除く全行（A2以降）を、INDEX_SHEET_HEADERと同じ列順でそのまま返す。
  // 戻り値のインデックスiはシートの行番号 i+2 に対応する（1行目はヘッダー固定のため）。
  // fileId自体はrow[0]に含まれる。既存の_override列を読み取って温存するために全列必要
  // （fileId列だけを読む設計だと、更新のたびにユーザーの手動補正が消えてしまう。後述）。
  listExistingRows(): Promise<(string | number)[][]>;
  // 複数行の更新を1回のAPI呼び出しにまとめて書き込む（10235件規模でも逐次PUTにしない。
  // 2026-08-20 Codexレビュー指摘）。空配列ならAPIを呼ばない。
  updateRows(updates: { rowNumber: number; row: (string | number)[] }[]): Promise<void>;
  // 複数行をシート末尾に追記する。空配列ならAPIを呼ばない。
  appendRows(rows: (string | number)[][]): Promise<void>;
}

export interface UpsertIndexEntry {
  fileId: string;
  row: (string | number)[];
}

// 既存行のうち、スキャナが絶対に書き換えてはならない_override列（4.2節）は常に温存する。
// 今回の抽出が失敗（extractionFailed=TRUE）だった場合は、タグ抽出由来の列（title/artist等）も
// 空値で上書きせず既存値を保持する（失敗行は「今回読めなかった」ことを記録するだけで、
// 過去に読めていた情報を消してはならない）。
function mergeWithExisting(existingRow: (string | number)[], newRow: (string | number)[]): (string | number)[] {
  const extractionFailed = newRow[EXTRACTION_FAILED_INDEX] === "TRUE";
  return newRow.map((value, i) => {
    if (OVERRIDE_COLUMN_INDEXES.has(i)) return existingRow[i] ?? "";
    if (extractionFailed && TAG_COLUMN_INDEXES.has(i)) return existingRow[i] ?? value;
    return value;
  });
}

// fileIdを一意キーとしたupsert（CONCEPT.md 5節）。既存行があれば_override列を温存したうえで
// 抽出値列だけを更新し、無ければ末尾に追記する。
export async function upsertIndexRows(io: SheetsIndexIO, entries: UpsertIndexEntry[]): Promise<void> {
  if (entries.length === 0) return;

  // 同一バッチ内に同じfileIdが複数含まれる場合は最後のものを採用する（挿入順を保つためMapを使う）
  // （2026-08-20 Codexレビュー指摘：dedupeせずに素通しすると、未登録のfileIdが複数回来た際に
  // toAppendへ重複してすべて積まれ、同じ曲の行が複数できてしまっていた）。
  const dedupedEntries = new Map<string, (string | number)[]>();
  for (const { fileId, row } of entries) dedupedEntries.set(fileId, row);

  const existingRows = await io.listExistingRows();
  const existingRowByFileId = new Map<string, { rowNumber: number; row: (string | number)[] }>();
  existingRows.forEach((row, i) => {
    const fileId = row[0];
    if (fileId) existingRowByFileId.set(String(fileId), { rowNumber: i + 2, row });
  });

  const updates: { rowNumber: number; row: (string | number)[] }[] = [];
  const toAppend: (string | number)[][] = [];
  for (const [fileId, row] of dedupedEntries) {
    const existing = existingRowByFileId.get(fileId);
    if (existing) {
      updates.push({ rowNumber: existing.rowNumber, row: mergeWithExisting(existing.row, row) });
    } else {
      toAppend.push(row);
    }
  }
  if (updates.length > 0) await io.updateRows(updates);
  if (toAppend.length > 0) await io.appendRows(toAppend);
}

// SheetsIndexIOの実実装。ensureAccessTokenで取得したアクセストークンをAuthorizationヘッダーに載せる。
// スコープはauth.tsのSPREADSHEETS_SCOPE（音源そのものにアクセスするdrive.readonlyとは別スコープ、
// CONCEPT.md 2節・4.1節）。書き込み先はユーザー自身のGoogleドライブ内のスプレッドシート
// （spreadsheetId）のindexタブのみで、音源ファイルには一切触れない。
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// drive.tsのRETRYABLE_403_REASONS/isRetryableErrorと同じ方針。Sheets APIも書き込みクォータ超過を
// 429だけでなくreasonが"rateLimitExceeded"等の403でも返しうるため、同じ判定ロジックを踏襲する。
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

export function createSheetsIndexIO(spreadsheetId: string, getAccessToken: () => Promise<string>): SheetsIndexIO {
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}`;
  const lastCol = columnLetter(INDEX_SHEET_HEADER.length);

  // drive.tsのfetchDriveApiWithRetryと同じ方針：429/5xx・クォータ超過理由の403は指数バックオフで
  // 数回リトライする（2026-08-20 /code-review指摘：リトライが無いと10235件規模の再スキャンで
  // 単発の429/5xxがバッチ全体を巻き込んで失敗させてしまい、batchUpdateでまとめた意味が薄れる）。
  // Content-Typeはbodyを送るリクエスト（PUT/POST）にのみ付与し、GET（listExistingRows）には
  // 付けない。GETに非simpleヘッダーを付けるとブラウザがCORSプリフライトを発行してしまうため
  // （2026-08-20 /code-review指摘）。
  async function sheetsFetch(url: string, init?: RequestInit): Promise<Response> {
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
        // fetch()自体が例外を投げるケース（一時的な切断・DNS障害等のTypeError、HTTPレスポンスすら
        // 返ってこない）も同じリトライ予算で扱う（2026-08-20 Codexレビュー指摘。drive.tsの
        // fetchDriveApiWithRetryと同じ方針）
        lastError = networkErr instanceof Error ? networkErr : new Error(String(networkErr));
        if (attempt >= maxRetries) throw lastError;
        await sleep(500 * 2 ** attempt);
        continue;
      }
      if (res.ok) return res;
      const bodyText = await res.text();
      lastError = new SheetsHttpError(res.status, `Sheets API request failed: ${res.status} ${bodyText}`);
      if (attempt >= maxRetries || !isRetryableError(res.status, bodyText)) throw lastError;
      await sleep(500 * 2 ** attempt);
    }
    throw lastError ?? new Error("unreachable");
  }

  return {
    async listExistingRows() {
      const range = sheetRange(INDEX_SHEET_NAME, `A2:${lastCol}`);
      const res = await sheetsFetch(`${base}/values/${encodeURIComponent(range)}`);
      const data = (await res.json()) as { values?: (string | number)[][] };
      return data.values ?? [];
    },
    async updateRows(updates) {
      if (updates.length === 0) return;
      // 複数行をvalues:batchUpdateで1回のHTTP呼び出しにまとめる（逐次PUTだと10235件規模で
      // 同数のリクエストが直列発行され、時間がかかるうえ書き込みクォータで途中失敗しやすい。
      // 2026-08-20 Codexレビュー指摘）。
      await sheetsFetch(`${base}/values:batchUpdate`, {
        method: "POST",
        body: JSON.stringify({
          valueInputOption: "RAW",
          data: updates.map(({ rowNumber, row }) => ({
            range: sheetRange(INDEX_SHEET_NAME, `A${rowNumber}:${lastCol}${rowNumber}`),
            values: [row],
          })),
        }),
      });
    },
    async appendRows(rows) {
      if (rows.length === 0) return;
      const range = sheetRange(INDEX_SHEET_NAME, "A1");
      await sheetsFetch(`${base}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
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
