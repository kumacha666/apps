// Sheets索引（indexタブ）へのfileId起点upsert。CONCEPT.md 4.3節のスキーマに合わせた最小基盤。
// drive.ts/rangeTokenizer.tsと同じDI方針：Sheets APIへの実際のHTTP呼び出しはSheetsIndexIOとして
// 外側から注入し、このファイル自体は「fileIdで既存行を探し、あれば更新・無ければ追記する」
// upsertロジックだけを担当する（ユニットテストではフェイクのSheetsIndexIOを渡す）。
//
// このPRの範囲（着手順の目安2、最小基盤）: スキーマ定義＋fileId起点upsertのみ。
// sync タブ（startPageToken/rootFolderId/initialScanCompletedAt）の管理・indexタブ自体の
// 初回作成（ヘッダー書き込み含む）は後続PRで実装する。ユーザーが事前にindex タブ＋ヘッダー行を
// 作成済みであることを前提とする。
//
// 2026-08-20、索引upsertの重複行マージ（CONCEPT.md 4.3節、mergeDuplicateIndexRows）を追加。
// 詳細はmergeDuplicateIndexRowsのコメント参照。

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
  // 2026-08-20追加（重複行マージ、CONCEPT.md 4.3節「`_override`同士が競合した場合は片方を
  // 捨てず両方を保持する」）。既存列の並び替え・削除は既存シートとの互換性を壊すため、
  // 追加は必ず末尾に行う。各_override列に対応する競合候補・競合フラグのペア。
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
  // 2026-08-21追加（着手順の目安5、Codexレビュー指摘：P1）。複数デバイスの時計ずれがあると
  // lastScannedAtとscanRunStartedAtの大小比較では「今回の実行で処理済みか」を誤判定しうる
  // （時計が進んだ端末のlastScannedAtが、時計が遅い端末が新規発行したウォーターマークより
  // 後に見えてしまう等）。ウォーターマークを時刻ではなく不透明な実行ID（sync.tsのscanRunId、
  // ランダム文字列）にし、この列に「そのファイルを最後に処理したスキャン実行のID」を記録して
  // 完全一致でのみ「今回の実行で処理済み」と判定する（main.tsのpendingEntries参照）。
  "scanRunId",
] as const;

// mergeDuplicateIndexRowsが対象にする_override列のベース名（列名から末尾"_override"を除いたもの）。
// 上記ヘッダーの並びと対応するconflictCandidate/hasConflict列を導出するために使う。
const OVERRIDE_FIELD_NAMES = [
  "title",
  "artist",
  "albumArtist",
  "album",
  "composer",
  "releaseYear",
  "releaseType",
  "vocalGender",
  "providerNote",
] as const;

// スキャナが絶対に書き換えてはならない列（4.2節）。upsert時、既存行に対してはこれらの列を
// 常に温存し、新規行に対してのみ空欄（オーバーライド無し）で作成する。
const OVERRIDE_COLUMN_INDEXES = new Set(
  INDEX_SHEET_HEADER.map((name, i) => (name.endsWith("_override") ? i : -1)).filter((i) => i >= 0)
);

// 重複行マージ（mergeDuplicateIndexRows）専用の列。_override列と同様、通常のfileId起点upsert
// （通常のスキャン・再スキャン）では絶対に書き換えてはならない。ここに含めないと、成功した
// 再スキャンのたびにbuildIndexRowの初期値（""/"FALSE"）で上書きされ、mergeDuplicateIndexRowsが
// 記録した競合状態が毎回消えてしまう。
const CONFLICT_META_COLUMN_INDEXES = new Set(
  INDEX_SHEET_HEADER.map((name, i) => (name.endsWith("_conflictCandidate") || name.endsWith("_hasConflict") ? i : -1)).filter(
    (i) => i >= 0
  )
);

// タグ抽出由来の列（識別子・タイムスタンプ・extractionFailed自体を除く）。再スキャンで
// タグ抽出に失敗した場合（5節：巨大ファイルのタイムアウト等）、これらの列は新しい行の
// 空値で上書きせず既存行の値を保持する（2026-08-20 Codexレビュー指摘：失敗するたびに
// 一度正常に索引化できていたタイトル・アーティスト等が消えてしまっていた）。
// scanRunIdもlastScannedAtと同じ扱い：タグの抽出成否に関わらず「このスキャン実行で
// このファイルを処理した」という事実を記録する識別子のため、抽出失敗時も既存値を保持せず
// 常に今回の値で上書きする。
const NON_TAG_COLUMN_NAMES = new Set([
  "fileId",
  "extension",
  "parentId",
  "driveModifiedTime",
  "lastScannedAt",
  "extractionFailed",
  "scanRunId",
]);
const TAG_COLUMN_INDEXES = new Set(
  INDEX_SHEET_HEADER.map((name, i) =>
    !OVERRIDE_COLUMN_INDEXES.has(i) && !CONFLICT_META_COLUMN_INDEXES.has(i) && !NON_TAG_COLUMN_NAMES.has(name) ? i : -1
  ).filter((i) => i >= 0)
);
const EXTRACTION_FAILED_INDEX = INDEX_SHEET_HEADER.indexOf("extractionFailed");
const LAST_SCANNED_AT_INDEX = INDEX_SHEET_HEADER.indexOf("lastScannedAt");
const FILE_ID_INDEX = INDEX_SHEET_HEADER.indexOf("fileId");
const PARENT_ID_INDEX = INDEX_SHEET_HEADER.indexOf("parentId");
const DRIVE_MODIFIED_TIME_INDEX = INDEX_SHEET_HEADER.indexOf("driveModifiedTime");
const SCAN_RUN_ID_INDEX = INDEX_SHEET_HEADER.indexOf("scanRunId");

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
  // このファイルを処理したスキャン実行のID（sync.tsのscanRunId）。省略時は空欄のまま
  // 記録する：この列を導入する前のテスト・呼び出し（scanRunIdの判定と無関係な観点を
  // 検証しているもの）を書き換えずに済ませるための既定値であり、main.tsの実際の呼び出しは
  // 必ず指定する。
  scanRunId?: string;
}

export function buildIndexRow({
  fileId,
  fileName,
  parentId,
  driveModifiedTime,
  lastScannedAtIso,
  tags,
  extractionFailed,
  scanRunId = "",
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
    // 2026-08-20追加：競合候補・競合フラグ列（mergeDuplicateIndexRows専用）。通常のスキャンは
    // 常に「競合なし」として新規行を作成する（これらの列を埋めるのはmergeDuplicateIndexRowsのみ）。
    ...OVERRIDE_FIELD_NAMES.flatMap(() => ["", "FALSE"]),
    scanRunId, // 2026-08-21追加：このファイルを処理したスキャン実行のID
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
  // ヘッダー行（1行目、A1:<lastCol>1）をそのまま返す。indexタブ自体は存在するがヘッダー行が
  // 無い・列順が異なる場合を検出するための専用メソッド（validateIndexHeader参照）。
  readHeaderRow(): Promise<(string | number)[]>;
  // 複数行の更新を1回のAPI呼び出しにまとめて書き込む（10235件規模でも逐次PUTにしない。
  // 2026-08-20 Codexレビュー指摘）。空配列ならAPIを呼ばない。
  updateRows(updates: { rowNumber: number; row: (string | number)[] }[]): Promise<void>;
  // 複数行をシート末尾に追記する。空配列ならAPIを呼ばない。
  appendRows(rows: (string | number)[][]): Promise<void>;
}

// listExistingRows()はA2以降しか読まないため、indexタブは存在するがヘッダー行（1行目）が
// 空・列順が異なる場合を検出できない。その状態でappendRows()するとA1（＝本来ヘッダーが
// あるべき行）に最初の曲データが書き込まれ、次回のlistExistingRows()はその行をヘッダーとして
// 読み飛ばしてしまい、同じ曲が再度追記され続けて索引が重複する（2026-08-20 Codexレビュー指摘）。
// 抽出開始前にヘッダー行がINDEX_SHEET_HEADERと完全一致することを確認する。
export function isValidIndexHeader(header: (string | number)[]): boolean {
  return header.length === INDEX_SHEET_HEADER.length && header.every((v, i) => v === INDEX_SHEET_HEADER[i]);
}

// 2026-08-20の重複行マージ実装で追加した18列（conflictCandidate/hasConflict）より前の、
// 旧バージョンのindexタブヘッダー（27列）。既存の27列indexタブを使っていたユーザーは
// isValidIndexHeaderで弾かれてしまい、ensureValidHeaderの「タブが真に空なら書き直す」
// フォールバックも対象外（データが入っているタブは空ではないため）のため、次回スキャンが
// 常にヘッダー不一致エラーでブロックされ続けてしまう（2026-08-20 Codexレビュー指摘：P1）。
// sheetsSetup.tsのmigrateLegacyIndexHeaderV1がこの旧ヘッダーを検出してグリッド拡張＋
// ヘッダー書き換えのマイグレーションを行う。
export const LEGACY_INDEX_SHEET_HEADER_V1 = INDEX_SHEET_HEADER.slice(0, 27);

export function isLegacyIndexHeaderV1(header: (string | number)[]): boolean {
  return (
    header.length === LEGACY_INDEX_SHEET_HEADER_V1.length && header.every((v, i) => v === LEGACY_INDEX_SHEET_HEADER_V1[i])
  );
}

// 2026-08-21追加のscanRunId列（1列）より前の、旧バージョンのindexタブヘッダー（45列）。
// LEGACY_INDEX_SHEET_HEADER_V1と同じ理由：この列を追加する前から使っていた既存ユーザーの
// indexタブがisValidIndexHeaderで弾かれ続けないよう、sheetsSetup.tsのmigrateLegacyIndexHeaderV2
// がこの旧ヘッダーを検出してグリッド拡張＋ヘッダー書き換えのマイグレーションを行う。
export const LEGACY_INDEX_SHEET_HEADER_V2 = INDEX_SHEET_HEADER.slice(0, INDEX_SHEET_HEADER.length - 1);

export function isLegacyIndexHeaderV2(header: (string | number)[]): boolean {
  return (
    header.length === LEGACY_INDEX_SHEET_HEADER_V2.length && header.every((v, i) => v === LEGACY_INDEX_SHEET_HEADER_V2[i])
  );
}

export interface UpsertIndexEntry {
  fileId: string;
  row: (string | number)[];
}

export interface IndexRowScanState {
  scanRunId: string;
  driveModifiedTime: string;
}

// 着手順の目安5（初回スキャンのバッチ処理・中断再開）向け：indexタブの既存行スナップショットから
// fileId→{scanRunId, driveModifiedTime}の対応を作る。main.tsはこれを使い、「今回のスキャン実行
// （sync.tsのscanRunId）で既にこのfileIdを処理済み、かつDrive側のdriveModifiedTimeも前回処理時
// から変わっていない」場合だけスキップする（着手順の目安5、2026-08-21 Codexレビュー指摘で
// lastScannedAtの時刻比較から変更）：
// - 時刻比較（旧lastScannedAt vs scanRunStartedAt）は複数デバイスの時計ずれで誤判定しうる
//   （P1）。scanRunIdは時刻に依存しない不透明な識別子のため、完全一致でのみ判定する。
// - scanRunIdが一致していても、そのファイルが中断中にDrive側で更新されていた場合
//   （driveModifiedTimeが変わっている）は、ウォーターマークに関わらず再処理対象に戻す（P2）。
// 列インデックス（FILE_ID_INDEX等）はこのファイル内に閉じた実装詳細のため、main.ts側に
// 漏らさずここで変換関数として提供する。
export function indexRowsScanState(rows: (string | number)[][]): Map<string, IndexRowScanState> {
  const map = new Map<string, IndexRowScanState>();
  for (const row of rows) {
    const fileId = row[FILE_ID_INDEX];
    if (!fileId) continue;
    map.set(String(fileId), {
      scanRunId: String(row[SCAN_RUN_ID_INDEX] ?? ""),
      driveModifiedTime: String(row[DRIVE_MODIFIED_TIME_INDEX] ?? ""),
    });
  }
  return map;
}

// 既存行のうち、スキャナが絶対に書き換えてはならない_override列（4.2節）は常に温存する。
// 今回の抽出が失敗（extractionFailed=TRUE）だった場合は、タグ抽出由来の列（title/artist等）も
// 空値で上書きせず既存値を保持する（失敗行は「今回読めなかった」ことを記録するだけで、
// 過去に読めていた情報を消してはならない）。
function mergeWithExisting(existingRow: (string | number)[], newRow: (string | number)[]): (string | number)[] {
  const extractionFailed = newRow[EXTRACTION_FAILED_INDEX] === "TRUE";
  return newRow.map((value, i) => {
    if (OVERRIDE_COLUMN_INDEXES.has(i) || CONFLICT_META_COLUMN_INDEXES.has(i)) return existingRow[i] ?? "";
    if (extractionFailed && TAG_COLUMN_INDEXES.has(i)) return existingRow[i] ?? value;
    return value;
  });
}

// fileIdを一意キーとしたupsert（CONCEPT.md 5節）。既存行があれば_override列を温存したうえで
// 抽出値列だけを更新し、無ければ末尾に追記する。
//
// existingRowsSnapshot: 呼び出し元が既に読み取り済みのlistExistingRows()結果を渡せる（省略時は
// このタブから改めて読み取る、従来通りの挙動）。着手順の目安5（初回スキャンのバッチ処理・
// 中断再開）でmain.tsが1回のスキャンを複数バッチに分けてこの関数を繰り返し呼ぶ際、バッチごとに
// 10235行規模の全件読み取りを繰り返すと非常に重くなるため、スキャン開始時に1回だけ読んだ
// スナップショットを全バッチで使い回せるようにする。各バッチが担当するfileId集合は互いに素
// （呼び出し元がpending分を1回ずつしか処理しないよう分割する）ため、あるバッチの追記が後続
// バッチの「既存行の行番号」を変えることはなく、使い回しても安全（appendは常にシート末尾へ、
// updateは各バッチが自分のfileId範囲内の行番号のみを参照するため）。
export async function upsertIndexRows(
  io: SheetsIndexIO,
  entries: UpsertIndexEntry[],
  existingRowsSnapshot?: (string | number)[][]
): Promise<void> {
  if (entries.length === 0) return;

  // 同一バッチ内に同じfileIdが複数含まれる場合は最後のものを採用する（挿入順を保つためMapを使う）
  // （2026-08-20 Codexレビュー指摘：dedupeせずに素通しすると、未登録のfileIdが複数回来た際に
  // toAppendへ重複してすべて積まれ、同じ曲の行が複数できてしまっていた）。
  const dedupedEntries = new Map<string, (string | number)[]>();
  for (const { fileId, row } of entries) dedupedEntries.set(fileId, row);

  const existingRows = existingRowsSnapshot ?? (await io.listExistingRows());
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

// 2台のデバイスがほぼ同時に同じ新規fileIdの行を追記した場合、片方が「まだ無い」と判断した
// 時点で両方が別行として追記してしまい索引に重複行が生じうる（CONCEPT.md 4.3節「索引upsertの
// 重複行対策」、Sheetsに一意制約が無くlast-write-winsでも解消しないため）。事前に完全には
// 防げないため、事後の整合として索引全体をfileId列でスキャンし、重複が見つかれば1行に
// マージする。呼び出しは差分同期完了時または起動時を想定（CONCEPT.md同節）。

// どちらの行を「勝者」として抽出値・メタデータ列（_override/競合列を除く）の採用元にするかを
// 決める。extractionFailed=falseの行を常に優先し（失敗した抽出が正常な抽出結果を上書きしない
// ため）、両方が同じ成否の場合のみlastScannedAtが新しい方を採用する二次基準として使う
// （CONCEPT.md 4.3節）。
function chooseWinner(a: (string | number)[], b: (string | number)[]): (string | number)[] {
  const aFailed = a[EXTRACTION_FAILED_INDEX] === "TRUE";
  const bFailed = b[EXTRACTION_FAILED_INDEX] === "TRUE";
  if (aFailed !== bFailed) return aFailed ? b : a;
  return String(a[LAST_SCANNED_AT_INDEX] ?? "") >= String(b[LAST_SCANNED_AT_INDEX] ?? "") ? a : b;
}

// _override列1つ分のマージ。単純に「新しい方/古い方」を優先すると、ユーザーがどちらか片方の
// 重複行にだけ手動補正を入れていた場合にその補正が消えてしまうため、値が入っている方を優先する。
// 両方に異なる値が入っていた場合は片方を捨てず、<field>_conflictCandidate/<field>_hasConflict
// 列に採用しなかった側の値と競合フラグを保持する（CONCEPT.md 4.3節「`_override`同士が競合した
// 場合は片方を捨てず両方を保持する」）。
function mergeOverrideField(
  merged: (string | number)[],
  a: (string | number)[],
  b: (string | number)[],
  field: (typeof OVERRIDE_FIELD_NAMES)[number]
): void {
  const overrideIdx = INDEX_SHEET_HEADER.indexOf(`${field}_override` as (typeof INDEX_SHEET_HEADER)[number]);
  const candidateIdx = INDEX_SHEET_HEADER.indexOf(`${field}_conflictCandidate` as (typeof INDEX_SHEET_HEADER)[number]);
  const hasConflictIdx = INDEX_SHEET_HEADER.indexOf(`${field}_hasConflict` as (typeof INDEX_SHEET_HEADER)[number]);

  const aVal = String(a[overrideIdx] ?? "");
  const bVal = String(b[overrideIdx] ?? "");
  const aHasConflict = a[hasConflictIdx] === "TRUE";
  const bHasConflict = b[hasConflictIdx] === "TRUE";

  if (aVal === bVal) {
    // 両方空、または両方が同じ値（同じ"(none)"を含む）。どちらかに既存の未解決競合が
    // 残っていれば（3行以上のマージ途中で生じた競合等）そのまま引き継ぐ。
    merged[overrideIdx] = aVal;
    if (aHasConflict || bHasConflict) {
      merged[hasConflictIdx] = "TRUE";
      merged[candidateIdx] = aHasConflict ? a[candidateIdx] : b[candidateIdx];
    } else {
      merged[hasConflictIdx] = "FALSE";
      merged[candidateIdx] = "";
    }
    return;
  }
  if (aVal === "") {
    merged[overrideIdx] = bVal;
    merged[hasConflictIdx] = bHasConflict ? "TRUE" : "FALSE";
    merged[candidateIdx] = bHasConflict ? b[candidateIdx] : "";
    return;
  }
  if (bVal === "") {
    merged[overrideIdx] = aVal;
    merged[hasConflictIdx] = aHasConflict ? "TRUE" : "FALSE";
    merged[candidateIdx] = aHasConflict ? a[candidateIdx] : "";
    return;
  }
  // 両方に異なる値が入っている＝新規の競合。片方をoverrideとして採用しつつ、
  // もう片方をconflictCandidateとして保持する（どちらを採用するかは任意で、ユーザーが
  // カタログ補正機能で確認・解決するまでの暫定値にすぎない）。
  merged[overrideIdx] = aVal;
  merged[hasConflictIdx] = "TRUE";
  merged[candidateIdx] = bVal;
}

// 同一fileIdの2行を1行にマージする。fileId自体はそのまま、抽出値・その他メタデータ列は
// chooseWinner()が選んだ行の値を、_override列と競合メタ列はmergeOverrideField()の結果を採用する。
// 3行以上の重複がある場合はArray.reduce()で2行ずつ畳み込んで使う想定（可換ではあるが、
// 3行以上での多段競合は「最後に競合した相手の値のみ」がconflictCandidateに残る点は既知の限界）。
function mergeTwoRows(a: (string | number)[], b: (string | number)[]): (string | number)[] {
  const winner = chooseWinner(a, b);
  const merged = new Array(INDEX_SHEET_HEADER.length).fill("") as (string | number)[];
  merged[FILE_ID_INDEX] = a[FILE_ID_INDEX] || b[FILE_ID_INDEX];
  INDEX_SHEET_HEADER.forEach((_name, i) => {
    if (i === FILE_ID_INDEX || OVERRIDE_COLUMN_INDEXES.has(i) || CONFLICT_META_COLUMN_INDEXES.has(i)) return;
    merged[i] = winner[i] ?? "";
  });
  for (const field of OVERRIDE_FIELD_NAMES) mergeOverrideField(merged, a, b, field);
  return merged;
}

export interface MergeDuplicateIndexRowsResult {
  // 重複が見つかったユニークfileIdの件数
  mergedGroups: number;
  // 空欄化した（削除相当の）重複行の件数
  rowsCleared: number;
}

// indexタブ全体をfileId列でスキャンし、重複行が見つかれば1行にマージして残りは空欄化する
// （Sheets APIには行削除に必要なnumericなsheetIdを持たない設計上、削除の代わりに全列を
// 空欄にする。空欄行のfileIdは空のためlistExistingRows()の以降の呼び出しでは無視され、
// 通常のupsertが誤ってこの行を再利用することもない）。重複が無ければAPIを呼ばない。
//
// **既知の限界（TOCTOU、2026-08-20 Codexレビュー指摘、対応は見送り）**：listExistingRows()で
// 読んだスナップショットとio.updateRows()での実際の書き込みの間に、別デバイスが同じ重複行の
// どちらかを更新（新しい抽出結果の反映・手動補正の追加等）した場合、この関数はその更新を
// 知らないまま古いスナップショットに基づいてマージ・空欄化を行い、別デバイスの更新を
// 上書き・消失させてしまいうる。Sheets APIには行単位のロックや条件付き書き込み（CAS）が
// 無く、この関数自体がまさに「事後の整合」（CONCEPT.md 4.3節）として設計されている以上、
// 根本解消にはバージョン/ロック用セル＋条件付き書き込みのような追加設計が必要でこのPRの
// 範囲を超える。sync.tsのTOCTOU（CLAUDE.md参照）と同じ理由で、事前防止ではなく事後の整合
// という本アプリ全体の方針の範囲内として受け入れる（実運用での発生頻度は、そもそも重複行
// 自体が2デバイスのほぼ同時書き込みという稀なケースの産物であるため、その上でさらに
// マージ実行と別の書き込みが競合する確率はさらに低いと想定）。
export async function mergeDuplicateIndexRows(io: SheetsIndexIO): Promise<MergeDuplicateIndexRowsResult> {
  const rows = await io.listExistingRows();
  const rowsByFileId = new Map<string, { rowNumber: number; row: (string | number)[] }[]>();
  rows.forEach((row, i) => {
    const fileId = row[FILE_ID_INDEX];
    if (!fileId) return;
    const key = String(fileId);
    const list = rowsByFileId.get(key) ?? [];
    list.push({ rowNumber: i + 2, row });
    rowsByFileId.set(key, list);
  });

  const updates: { rowNumber: number; row: (string | number)[] }[] = [];
  let mergedGroups = 0;
  let rowsCleared = 0;
  const blankRow = new Array(INDEX_SHEET_HEADER.length).fill("") as (string | number)[];
  for (const entries of rowsByFileId.values()) {
    if (entries.length < 2) continue;
    mergedGroups += 1;
    const sorted = [...entries].sort((x, y) => x.rowNumber - y.rowNumber);
    const merged = sorted.map((e) => e.row).reduce((acc, row) => mergeTwoRows(acc, row));
    const [keep, ...duplicates] = sorted;
    updates.push({ rowNumber: keep.rowNumber, row: merged });
    for (const dup of duplicates) {
      updates.push({ rowNumber: dup.rowNumber, row: blankRow });
      rowsCleared += 1;
    }
  }
  if (updates.length > 0) await io.updateRows(updates);
  return { mergedGroups, rowsCleared };
}

export interface RemoveIndexRowsResult {
  removedCount: number;
}

// 着手順の目安4の残り（changes.list消費、differentialSync.ts）：Driveから削除・ゴミ箱に
// 入れられたファイルのfileIdを指定して索引行を除去する。mergeDuplicateIndexRowsと同じ理由
// （Sheets APIに行削除用のnumeric sheetIdを保持していないDI設計）で、削除ではなく全列空欄化で
// 代替する（空欄行のfileIdは空のため以降のlistExistingRows()ベースの処理からは無視される）。
export async function removeIndexRows(io: SheetsIndexIO, fileIds: string[]): Promise<RemoveIndexRowsResult> {
  if (fileIds.length === 0) return { removedCount: 0 };
  const targets = new Set(fileIds);
  const rows = await io.listExistingRows();
  const blankRow = new Array(INDEX_SHEET_HEADER.length).fill("") as (string | number)[];
  const updates: { rowNumber: number; row: (string | number)[] }[] = [];
  rows.forEach((row, i) => {
    const fileId = row[FILE_ID_INDEX];
    if (fileId && targets.has(String(fileId))) updates.push({ rowNumber: i + 2, row: blankRow });
  });
  if (updates.length > 0) await io.updateRows(updates);
  return { removedCount: updates.length };
}

export interface ReconcileIndexResult {
  removedCount: number;
}

// 旧ルート配下だった行の削除（リコンサイル、CONCEPT.md 4.3節）。rootFolderId変更後の新しい
// 初回スキャン完了時の仕上げとして実行する想定だが、差分同期中にフォルダの変更イベントを
// 検知した場合の安全網としても使う（differentialSync.ts参照。フォルダがrootFolderIdの外へ
// 移動したケースは、そのフォルダ自体の変更イベントだけでは配下ファイル1件1件の変更を
// 検知できないため、リコンサイルによる事後の整合に委ねる、CONCEPT.md 5節）。
//
// indexタブ全行のparentIdについて、現在のrootFolderIdの祖先チェーンに到達するかどうかを
// isFolderUnderRootで判定し、到達しない行を削除（空欄化）する。distinctなparentId（≒フォルダ数）
// ごとに1回だけ判定する（10235件規模でも実際のフォルダ数は行数よりずっと少ないため、
// isFolderUnderRoot呼び出し回数を抑えられる）。
export async function reconcileIndexAgainstRoot(
  io: SheetsIndexIO,
  isFolderUnderRoot: (parentId: string) => Promise<boolean>
): Promise<ReconcileIndexResult> {
  const rows = await io.listExistingRows();
  const distinctParentIds = new Set<string>();
  rows.forEach((row) => {
    if (!row[FILE_ID_INDEX]) return;
    distinctParentIds.add(String(row[PARENT_ID_INDEX] ?? ""));
  });

  const reachable = new Map<string, boolean>();
  for (const parentId of distinctParentIds) {
    reachable.set(parentId, parentId ? await isFolderUnderRoot(parentId) : false);
  }

  const blankRow = new Array(INDEX_SHEET_HEADER.length).fill("") as (string | number)[];
  const updates: { rowNumber: number; row: (string | number)[] }[] = [];
  rows.forEach((row, i) => {
    if (!row[FILE_ID_INDEX]) return;
    const parentId = String(row[PARENT_ID_INDEX] ?? "");
    if (!reachable.get(parentId)) updates.push({ rowNumber: i + 2, row: blankRow });
  });
  if (updates.length > 0) await io.updateRows(updates);
  return { removedCount: updates.length };
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

// スプレッドシート単位のリトライ付きfetch。drive.tsのfetchDriveApiWithRetryと同じ方針：
// 429/5xx・クォータ超過理由の403は指数バックオフで数回リトライする（2026-08-20 /code-review指摘：
// リトライが無いと10235件規模の再スキャンで単発の429/5xxがバッチ全体を巻き込んで失敗させてしまい、
// batchUpdateでまとめた意味が薄れる）。Content-Typeはbodyを送るリクエスト（PUT/POST）にのみ付与し、
// GETには付けない（非simpleヘッダーによる不要なCORSプリフライトを避けるため）。
// allowRetry: 通信例外（fetch()自体が投げるTypeError等）・HTTPエラー（429/5xx等）のどちらも
// リトライしてよいかどうか。GET・PUT（batchUpdate、既存行の上書き）は冪等なので安全にリトライできるが、
// POST（append）は非冪等：サーバー側では書き込みが成功していたのに応答受信時だけ通信が切れた場合や、
// 処理自体は完了したが5xxを返した場合、そのまま再試行すると同じ行が二重に追記されてしまう
// （2026-08-20 Codexレビュー指摘）。appendを呼ぶ側はfalseを渡す。
// indexタブのupsert・syncタブの読み書き・スプレッドシートのタブ初回作成のいずれも同じ
// スプレッドシートへの同じ認証方式のHTTP呼び出しのため、この関数をSheets API呼び出し全体で共有する
// （2026-08-20時点はcreateSheetsIndexIOにのみ埋め込まれていたが、sync.ts/sheetsSetup.tsの追加に伴い
// 複製を避けるため関数として切り出した。振る舞いは変更していない）。
export function createSheetsFetch(spreadsheetId: string, getAccessToken: () => Promise<string>) {
  return async function sheetsFetch(url: string, init?: RequestInit, allowRetry = true): Promise<Response> {
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
        if (!allowRetry || attempt >= maxRetries) throw lastError;
        await sleep(500 * 2 ** attempt);
        continue;
      }
      if (res.ok) return res;
      const bodyText = await res.text();
      lastError = new SheetsHttpError(res.status, `Sheets API request failed: ${res.status} ${bodyText} (spreadsheet: ${spreadsheetId})`);
      if (!allowRetry || attempt >= maxRetries || !isRetryableError(res.status, bodyText)) throw lastError;
      await sleep(500 * 2 ** attempt);
    }
    throw lastError ?? new Error("unreachable");
  };
}

export function createSheetsIndexIO(spreadsheetId: string, getAccessToken: () => Promise<string>): SheetsIndexIO {
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
      // 列範囲を現行ヘッダー幅（lastCol）に固定すると、旧バージョンが作成した27列のままの
      // グリッド（migrateLegacyIndexHeaderV1で拡張する前の状態）に対してA1:AS1（45列分）を
      // 指定した瞬間にSheets APIが「範囲がグリッドを超える」エラーを返し、移行コールバックに
      // 到達する前に例外で落ちてしまう（2026-08-20 Codexレビュー指摘：migrateLegacyIndexHeaderV1
      // 自体はensureValidHeaderの中でこのreadHeaderRowの後に呼ばれるため、最初の読み取りが
      // 落ちると移行処理へ辿り着けない）。行全体を指定する記法（`'index'!1:1`）は対象タブの
      // 実際のグリッド列数に自動的にクリップされ、列範囲を明示しないため、グリッドの実際の
      // 列数が27・45のどちらであっても常に成功する。
      const range = sheetRange(INDEX_SHEET_NAME, "1:1");
      const res = await sheetsFetch(`${base}/values/${encodeURIComponent(range)}`);
      const data = (await res.json()) as { values?: (string | number)[][] };
      return data.values?.[0] ?? [];
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
      // appendは非冪等のため通信例外・HTTPエラーのどちらでもリトライしない（allowRetry=false、上記sheetsFetch参照）。
      await sheetsFetch(
        `${base}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
        {
          method: "POST",
          body: JSON.stringify({ values: rows }),
        },
        false
      );
    },
  };
}

// 1-indexed列番号をA1記法の列文字に変換する（27列目=AA等）。INDEX_SHEET_HEADERは27列のためAAで足りるが、
// 将来列が増えても壊れないよう汎用的に実装しておく。sheetsSetup.ts/sync.tsもこの実装を共有する
// （2026-08-20 /code-review指摘：sheetsSetup.tsに同じ実装が複製されており、修正が片方にしか
// 反映されない恐れがあった。sync.tsは列数を"B"に固定していたが、これもSYNC_TAB_HEADER.lengthから
// 動的に導出するよう合わせて修正した）。
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
