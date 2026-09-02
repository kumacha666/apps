// CONCEPT.md 5節「Phase 1」: 初回スキャンの前段となる、Drive上の音楽ファイル一覧取得。
// catalog-script/src/scan.js の listAudioFilesRecursive() と同じ方針（3.2節: ファイル発見は
// mimeTypeではなく拡張子ベースで行う）をブラウザ完結の`fetch`実装に移植したもの。
// Drive APIの実際のHTTP呼び出しは`DriveListFn`として外側から注入し、このファイル自体は
// 再帰走査・ページング・拡張子フィルタのロジックだけを担当する（rangeTokenizer.tsと同じDI方針でテスト可能にする）。

import { isAudioFile } from "./lib";
import { AuthError } from "./auth";
import type { FetchRangeFn } from "./rangeTokenizer";

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  // タグ抽出結果のindexタブへのupsert（sheets.ts）でdriveModifiedTime列に使う。差分同期
  // （CONCEPT.md 5節のchanges.list）の実装時にも参照する想定。
  modifiedTime?: string;
  parents?: string[];
  // フォルダショートカット（3.1節のフォルダ構成の実データには無かったが、Drive一般では
  // 存在しうる）解決用。files.list/files.getのfieldsに含めた場合のみ埋まる。
  // targetResourceKey: リンク共有のセキュリティ更新が適用されたファイル/フォルダへの
  // ショートカットは、参照先を単独のIDだけでは解決できず、後続のDrive APIリクエストに
  // このresource keyを添える必要がある（2026-08-19 Codexレビュー指摘）
  shortcutDetails?: { targetId?: string; targetMimeType?: string; targetResourceKey?: string };
  // changes.listのfile(...)にのみ含める。files.list/files.get(通常の走査)では要求していないため
  // 常にundefinedのまま（trashed=falseのファイルはfiles.listのクエリ自体が除外するため不要）。
  trashed?: boolean;
}

export interface DriveListPage {
  files: DriveFile[];
  nextPageToken?: string;
}

// 1回のfiles.list呼び出し。folderIdの直接の子（フォルダ・ファイル両方、trashedは除く）をページングして返す。
// resourceKeyは、folderIdがリンク共有のセキュリティ更新が適用されたフォルダへの
// ショートカット経由で解決された場合にのみ渡される（shortcutDetails.targetResourceKey）。
export type DriveListFn = (folderId: string, pageToken: string | undefined, resourceKey?: string) => Promise<DriveListPage>;

// HTTPステータスを保持したエラー。401（トークン失効・拒否）は、フォルダ単位の一時的な失敗
// （権限無し・503等）とは性質が異なり、走査を続けても全滅するだけなので特別扱いする
// （2026-08-19 Codexレビュー指摘）。
export class DriveHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
  }
}

// トークン失効・拒否を表す認証エラー全般。Drive APIが直接401を返したケース（DriveHttpError）
// だけでなく、GISのサイレント再取得自体が失敗したケース（auth.tsのAuthError、
// createDriveListFn呼び出し前のgetAccessToken()段階で発生）も同じ「走査全体を中断すべき
// エラー」として扱う（2026-08-19 Codexレビュー指摘：後者がDriveHttpErrorではないため
// 子フォルダの一時的な失敗として握りつぶされ、走査が中断されずに無効なトークンで
// 続行してしまっていた）。
// tagExtraction.ts/main.tsからも同じ判定が必要になったため、Drive/Auth関連の「トークンは
// もう使えない」の唯一の判定箇所としてexportする（2026-08-20 /code-review指摘：
// 同じ判定ロジックがファイルごとに独立コピーされ、将来どれか1つを更新し忘れると
// 「無効なトークンでAPIを叩き続ける」バグが特定の経路だけで再発しうる）。main.tsは
// これに加えてSheetsHttpError(401)も判定する必要があるため、そちらは独自に合成する。
export function isAuthError(err: unknown): boolean {
  return (err instanceof DriveHttpError && err.status === 401) || err instanceof AuthError;
}

// 401検知後、ConcurrencyLimiterのキューに残っている・まだ開始していない走査タスクを
// 静かに打ち切るための内部エラー。同じ無効なトークンでAPIを叩き続けるのを防ぐ
// （2026-08-19 Codexレビュー指摘）。呼び出し元には伝播させない（failedFoldersにも積まない）。
class ScanAbortedError extends Error {}

// 着手順の目安4の残り（changes.list消費、differentialSync.ts）でもフォルダ/ショートカット
// 判定に使うためexportする。
export const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
export const SHORTCUT_MIME_TYPE = "application/vnd.google-apps.shortcut";

// フォルダIDそのものの存在・種別・アクセス権を確認する。files.list（'<folderId>' in parents）は
// folderId自体を検証せず、存在しない/権限が無いIDに対しても単に空の子一覧（200応答）を返しうるため、
// 「フォルダが空」と「そもそも無効なID」を区別できない（2026-08-19 Codexレビュー指摘）。
// 呼び出し元（main.ts）はlistAudioFilesRecursiveの前にこれを呼び、失敗時のエラー表示に使う。
// driveId：ルートフォルダが共有ドライブ配下にある場合、そのドライブのID（マイドライブ配下なら
// フィールド自体が省略される）。change.getStartPageTokenのスコープ指定（2026-08-20 Codexレビュー
// 指摘、下記createGetStartPageTokenFn参照）に必要なため、validateRootFolderの結果として
// 呼び出し元（main.ts）に返す。
export type DriveGetFn = (fileId: string) => Promise<{ mimeType: string; driveId?: string }>;

export async function validateRootFolder(getFile: DriveGetFn, folderId: string): Promise<{ driveId?: string }> {
  const meta = await getFile(folderId);
  if (meta.mimeType !== FOLDER_MIME_TYPE) {
    throw new Error(`指定されたIDはフォルダではありません（mimeType: ${meta.mimeType}）`);
  }
  return { driveId: meta.driveId };
}

export async function listFolderChildren(list: DriveListFn, folderId: string, resourceKey?: string): Promise<DriveFile[]> {
  const all: DriveFile[] = [];
  let pageToken: string | undefined;
  do {
    const page = await list(folderId, pageToken, resourceKey);
    all.push(...page.files);
    pageToken = page.nextPageToken;
  } while (pageToken);
  return all;
}

export interface AudioFileEntry {
  file: DriveFile;
  folderPath: string;
}

// フォルダ走査の並行数を制限する共有セマフォ。制限が無いと、アーティスト/アルバムフォルダが
// 多数並ぶ実ライブラリ（CONCEPT.md 3.4節、10235件規模）でツリー全体に数百〜数千の
// files.list が同時発行されてしまい、Drive APIのスロットリング（429/5xx）を大量に誘発して
// 「フォルダ単位の失敗」として静かに取りこぼされる（2026-08-19 Codexレビュー指摘）。
// 実際のスキャン処理（バッチ・中断再開込み）の実装時に妥当な値へ調整する前提の暫定値。
const DEFAULT_MAX_CONCURRENT_LISTS = 6;

export class ConcurrencyLimiter {
  private active = 0;
  private readonly queue: (() => void)[] = [];

  constructor(private readonly max: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.active += 1;
    try {
      return await fn();
    } finally {
      this.active -= 1;
      const next = this.queue.shift();
      if (next) next();
    }
  }
}

// folderId配下を再帰的に走査し、拡張子ベースで音楽ファイルを発見する（3.2節）。
// 呼び出し元が指定したルートフォルダ自体の取得失敗（フォルダIDの誤り・権限無し等）と、
// 認証エラー（401、トークン失効・拒否）は、走査を続けても意味が無いため呼び出し元に
// 例外として伝える。それ以外の子フォルダ単位の失敗（一時的な5xx等）はfailedFoldersに
// 積んで先へ進み、スキャン全体は止めない（catalog-script/src/scan.jsの方針と同じ）。
//
// 401が起きた際、他の兄弟フォルダの走査（既にConcurrencyLimiterのキューに並んでいる、
// またはこれから並ぶ分）は共有のAbortControllerで打ち切る。同じ無効なトークンのまま
// 走査を続けさせない（2026-08-19 Codexレビュー指摘）。JS版のfetchにsignalを渡す形の
// 厳密な中断ではなく、キュー未消化のタスクを対象にした協調的な打ち切りである点に注意
// （既にHTTPリクエストが発行済みのタスクまでは止められない。実装の詳細はdrive.test.ts参照）。
// shortcutTargetFolderIds: 走査中に解決した「フォルダを指すショートカット」の参照先フォルダID
// を集める出力用引数（failedFoldersと同じ、呼び出し元が渡した配列/Setを変更する方式）。
// 参照先フォルダは自身の実体としての親チェーンをどれだけ遡ってもrootFolderIdに到達しない
// （ショートカットは通常のparents関係を作らないため、drive.tsのisDescendantOfRootが前提とする
// 祖先チェーン確認では原理的に発見できない）。差分同期・リコンサイル（main.ts）がこの集合を
// 「rootFolderId自体と同格の追加のルート」としてisDescendantOfRootに渡すことで、ショートカット
// 経由で索引化された曲を誤ってrootFolderId外と判定しない（2026-08-21 Codexレビュー指摘：P1）。
// rootResourceKey: folderId自体がリンク共有のセキュリティ更新が適用されたフォルダ（ショートカット
// 参照先）の場合に渡す。differentialSync.tsのフォルダ変更イベント処理で、そのショートカットの
// targetResourceKeyをそのままこの走査のルートへ引き継ぐために必要（2026-08-21 Codexレビュー
// 指摘：P2。渡さないとfiles.listが404になり、差分同期がそのサブツリーを毎回再試行し続ける）。
export async function listAudioFilesRecursive(
  list: DriveListFn,
  folderId: string,
  folderPath = "",
  failedFolders: string[] = [],
  maxConcurrentLists = DEFAULT_MAX_CONCURRENT_LISTS,
  shortcutTargetFolderIds: Set<string> = new Set(),
  rootResourceKey?: string
): Promise<AudioFileEntry[]> {
  const limiter = new ConcurrencyLimiter(maxConcurrentLists);
  const controller = new AbortController();
  // 通常の親子関係だけを辿る限り循環は起きないが、フォルダショートカットは任意のフォルダ
  // （自分の祖先を含む）を指しうるため、訪問済みフォルダIDを共有して無限再帰を防ぐ
  // （2026-08-19 Codexレビュー指摘。ルート自身も最初から訪問済みとして登録する）
  const visited = new Set<string>([folderId]);
  try {
    return await listAudioFilesRecursiveInternal(
      list,
      folderId,
      folderPath,
      failedFolders,
      true,
      limiter,
      controller,
      visited,
      rootResourceKey,
      shortcutTargetFolderIds
    );
  } finally {
    // 正常終了時は既に全タスクが完了しているため実質no-opだが、想定外の経路で
    // キュー済みタスクが残っていた場合の安全網として明示的に打ち切っておく
    controller.abort();
  }
}

async function listAudioFilesRecursiveInternal(
  list: DriveListFn,
  folderId: string,
  folderPath: string,
  failedFolders: string[],
  isRoot: boolean,
  limiter: ConcurrencyLimiter,
  controller: AbortController,
  visited: Set<string>,
  resourceKey: string | undefined,
  shortcutTargetFolderIds: Set<string>
): Promise<AudioFileEntry[]> {
  let children: DriveFile[];
  try {
    children = await limiter.run(() => {
      if (controller.signal.aborted) throw new ScanAbortedError("走査は中断されました");
      return listFolderChildren(list, folderId, resourceKey);
    });
  } catch (err) {
    if (isAuthError(err)) controller.abort();
    if (err instanceof ScanAbortedError) return []; // 中断による静かな終了。failedFoldersには積まない
    if (isRoot || isAuthError(err)) throw err;
    failedFolders.push(folderPath || folderId);
    return [];
  }

  const results: AudioFileEntry[] = [];
  // 兄弟フォルダは互いに依存しないため並行に走査する（ConcurrencyLimiterで同時実行数は制限する）。
  // 10235件規模のライブラリ（CONCEPT.md 3.4節）を直列に走査すると、フォルダ数だけ往復
  // レイテンシが積み上がってしまうため
  const subfolderScans: Promise<AudioFileEntry[]>[] = [];
  for (const file of children) {
    // フォルダ本体・フォルダを指すショートカットのどちらも再帰対象にする
    // （2026-08-19 Codexレビュー指摘：ショートカットは走査対象外のためライブラリ整理に
    // ショートカットを使っている場合、参照先のサブツリーが丸ごと欠落していた。
    // ファイルを指すショートカット＝音源そのものの解決は対象外のまま残す）
    let targetFolderId: string | null = null;
    let targetResourceKey: string | undefined;
    if (file.mimeType === FOLDER_MIME_TYPE) {
      targetFolderId = file.id;
    } else if (
      file.mimeType === SHORTCUT_MIME_TYPE &&
      file.shortcutDetails?.targetMimeType === FOLDER_MIME_TYPE &&
      file.shortcutDetails.targetId
    ) {
      targetFolderId = file.shortcutDetails.targetId;
      // リンク共有のセキュリティ更新が適用された参照先は、targetIdだけでは以降のリクエストが
      // 404になる。targetResourceKeyを取得し、参照先フォルダへの一覧要求に引き継ぐ
      // （2026-08-19 Codexレビュー指摘）
      targetResourceKey = file.shortcutDetails.targetResourceKey;
      shortcutTargetFolderIds.add(targetFolderId);
    } else if (isAudioFile(file.name)) {
      results.push({ file, folderPath });
      continue;
    }

    if (targetFolderId && !visited.has(targetFolderId)) {
      visited.add(targetFolderId);
      const childPath = folderPath ? `${folderPath}/${file.name}` : file.name;
      subfolderScans.push(
        listAudioFilesRecursiveInternal(
          list,
          targetFolderId,
          childPath,
          failedFolders,
          false,
          limiter,
          controller,
          visited,
          targetResourceKey,
          shortcutTargetFolderIds
        )
      );
    }
  }
  for (const nested of await Promise.all(subfolderScans)) {
    results.push(...nested);
  }
  return results;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// fetchDriveApiWithRetry/fetchRangeWithBodyRetry共通の指数バックオフ（2026-08-20 /code-review
// 指摘：同じ式が本ファイル内で複数回コピーされていた。sheets.tsのsheetsFetchも同じ式を使うが、
// Drive/Sheetsでバックオフ方針を将来別々に調整する可能性を考慮し、ファイルをまたいだ共有はしない）
function backoffDelayMs(attempt: number): number {
  return 500 * 2 ** attempt;
}

// Drive APIはクォータ超過を429だけでなく、reasonが"rateLimitExceeded"/"userRateLimitExceeded"の
// HTTP 403でも返すことがある（2026-08-19 Codexレビュー指摘）。403を一律リトライ対象にはできない
// （権限無し等の恒久的な403もあるため）ので、レスポンス本文のerror reasonを見て判定する。
const RETRYABLE_403_REASONS = new Set(["rateLimitExceeded", "userRateLimitExceeded"]);

function isRetryableError(status: number, bodyText: string): boolean {
  if (status === 429) return true;
  if (status >= 500 && status < 600) return true;
  if (status === 403) {
    try {
      const body = JSON.parse(bodyText) as { error?: { errors?: { reason?: string }[] } };
      return (body.error?.errors ?? []).some((e) => RETRYABLE_403_REASONS.has(e.reason ?? ""));
    } catch {
      return false; // レスポンス本文がJSONでない場合は判定できないためリトライしない
    }
  }
  return false;
}

// files.list/files.get共通のリトライ付きfetch。getAccessToken()自体が失敗した場合
// （AuthError、GISのサイレント再取得失敗）はリトライせずそのまま投げる
// （isAuthError()でDriveHttpError(401)と同様に扱われ、走査全体の中断につながる）。
// 429/5xx・クォータ超過理由の403（スロットリング・一時障害）は指数バックオフで数回リトライする。
// fetch()自体が例外を投げるケース（一時的な切断・DNS障害等のTypeError、HTTPレスポンスすら
// 返ってこない）も同じリトライ予算で扱う（2026-08-19 Codexレビュー指摘。元々はHTTPレスポンスを
// 受け取った場合しかリトライ対象にしておらず、この種の一時的な通信断がそのまま
// 子フォルダの失敗として確定してしまっていた）。
async function fetchDriveApiWithRetry(
  url: string,
  getAccessToken: () => Promise<string>,
  extraHeaders?: Record<string, string>,
  signal?: AbortSignal
): Promise<Response> {
  const maxRetries = 3;
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const accessToken = await getAccessToken();
    let res: Response;
    try {
      res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}`, ...extraHeaders }, signal });
    } catch (networkErr) {
      // 呼び出し元（タグ抽出のタイムアウト等）が意図的にsignalをabortしたケースはリトライ対象の
      // 一時的な通信断ではないため、そのまま呼び出し元に伝える（extractTags側のPromise.raceが
      // 既にタイムアウトを検知しており、ここでリトライ待ちしても無駄になる）。
      if (networkErr instanceof Error && networkErr.name === "AbortError") throw networkErr;
      lastError = networkErr instanceof Error ? networkErr : new Error(String(networkErr));
      if (attempt >= maxRetries) throw lastError;
      await sleep(backoffDelayMs(attempt));
      continue;
    }
    if (res.ok) return res;
    const bodyText = await res.text();
    lastError = new DriveHttpError(res.status, `Drive API request failed: ${res.status} ${bodyText}`);
    if (attempt >= maxRetries || !isRetryableError(res.status, bodyText)) throw lastError;
    await sleep(backoffDelayMs(attempt));
  }
  // ループは必ずreturn/throwで終わるが、TypeScriptの制御フロー解析のために明示しておく
  throw lastError ?? new Error("unreachable");
}

// DriveListFnの実実装。ensureAccessTokenで取得したアクセストークンをAuthorizationヘッダーに載せる。
// drive.readonlyスコープに固定されたトークンのみを使うため、書き込み系エンドポイントは呼びようがない（CONCEPT.md 2節）。
// 401等は即座にDriveHttpErrorとして呼び出し元（listAudioFilesRecursiveInternal）に伝え、
// 認証エラーとしての特別扱いを可能にする。
// supportsAllDrives/includeItemsFromAllDrivesを指定し、共有ドライブ配下のフォルダを
// ルートに指定した場合でも子が取得できるようにする（既定ではマイドライブのみが対象になり、
// 共有ドライブは空のライブラリとして「スキャン完了」してしまう。2026-08-19 Codexレビュー指摘）。
// resourceKeyが渡された場合はX-Goog-Drive-Resource-Keysヘッダーで添える
// （リンク共有のセキュリティ更新が適用されたショートカット参照先の解決に必要。同日Codexレビュー指摘）
export function createDriveListFn(getAccessToken: () => Promise<string>): DriveListFn {
  return async (folderId, pageToken, resourceKey) => {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "nextPageToken, files(id, name, mimeType, size, modifiedTime, parents, shortcutDetails)",
      pageSize: "1000",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const url = `https://www.googleapis.com/drive/v3/files?${params.toString()}`;
    const extraHeaders = resourceKey ? { "X-Goog-Drive-Resource-Keys": `${folderId}/${resourceKey}` } : undefined;

    const res = await fetchDriveApiWithRetry(url, getAccessToken, extraHeaders);
    const data = (await res.json()) as { files?: DriveFile[]; nextPageToken?: string };
    return { files: data.files ?? [], nextPageToken: data.nextPageToken };
  };
}

// DriveGetFnの実実装。validateRootFolder()（ルートフォルダの存在・種別検証）専用。
// driveIdもfieldsに含める：ルートが共有ドライブ配下の場合、changes.getStartPageTokenの
// スコープ指定（createGetStartPageTokenFn参照）に必要なため。
export function createDriveGetFn(getAccessToken: () => Promise<string>): DriveGetFn {
  return async (fileId) => {
    const params = new URLSearchParams({ fields: "id,mimeType,driveId", supportsAllDrives: "true" });
    const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?${params.toString()}`;
    const res = await fetchDriveApiWithRetry(url, getAccessToken);
    const data = (await res.json()) as { mimeType: string; driveId?: string };
    return { mimeType: data.mimeType, driveId: data.driveId };
  };
}

export function createDriveFileGetFn(
  getAccessToken: () => Promise<string>
): (fileId: string) => Promise<DriveFile | null> {
  return async (fileId) => {
    const params = new URLSearchParams({
      fields: "id,name,mimeType,size,parents,modifiedTime,trashed",
      supportsAllDrives: "true",
    });
    const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?${params.toString()}`;
    try {
      const res = await fetchDriveApiWithRetry(url, getAccessToken);
      return (await res.json()) as DriveFile;
    } catch (err) {
      // resourceKey保護された音源は既知の制約により404になりうる。
      if (err instanceof DriveHttpError && err.status === 404) return null;
      throw err;
    }
  };
}

// Googleスプレッドシート自体もDriveファイルの一種であるため、Sheets APIを一切呼ばずとも
// Drive API（drive.readonlyスコープのみで十分）のcapabilities.canEditで書き込み権限の
// 有無を確認できる。indexタブへの事前検証（readHeaderRow、GETのみ）は「読める」ことしか
// 確認しておらず、閲覧専用で共有されたスプレッドシートを指定した場合、1万件規模のタグ抽出が
// すべて終わった後になって初めてupdateRows()/appendRows()が403で失敗してしまう
// （2026-08-20 Codexレビュー指摘）。main.tsのhandleScan()から抽出開始前に呼ぶ。
export type DriveCapabilitiesGetFn = (fileId: string) => Promise<{ canEdit: boolean }>;

export function createDriveCapabilitiesGetFn(getAccessToken: () => Promise<string>): DriveCapabilitiesGetFn {
  return async (fileId) => {
    const params = new URLSearchParams({ fields: "capabilities(canEdit)", supportsAllDrives: "true" });
    const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?${params.toString()}`;
    const res = await fetchDriveApiWithRetry(url, getAccessToken);
    const data = (await res.json()) as { capabilities?: { canEdit?: boolean } };
    return { canEdit: data.capabilities?.canEdit ?? false };
  };
}

// Drive変更トークンの取得（CONCEPT.md 5節「変更トークンの取得順序」）。初回スキャン開始前に
// 取得・sync タブへ永続化しておき、初回一覧の構築完了後にこのトークンからchanges.listで
// 変更を再生する（差分再生自体は次PR以降、changes.list呼び出しは未実装のまま）。
// スキャンしてからトークンを取る順序だと、スキャン中に発生した追加・更新・削除を
// 取りこぼす同期ギャップが生じるため、順序が重要。
// driveId：ルートフォルダが共有ドライブ配下にある場合、そのドライブのIDを渡す
// （main.tsがvalidateRootFolder()の戻り値から取得しcreateGetStartPageTokenFn呼び出し時に
// 渡す）。`supportsAllDrives`だけでは対象の変更ログを共有ドライブ側に切り替えられず、
// 省略するとマイドライブのユーザー変更ログのトークンを取得してしまい、共有ドライブ配下の
// 変更を追跡できなくなる（2026-08-20 Codexレビュー指摘）。ただし本PR時点ではこのトークンを
// 実際に消費するchanges.list自体が未実装のため、実害はまだ顕在化しない。差分同期
// （changes.list呼び出し）を実装する際は、そちらにも同じdriveIdを渡す必要がある。
export type GetStartPageTokenFn = () => Promise<string>;

export function createGetStartPageTokenFn(getAccessToken: () => Promise<string>, driveId?: string): GetStartPageTokenFn {
  return async () => {
    const params = new URLSearchParams({ supportsAllDrives: "true" });
    if (driveId) params.set("driveId", driveId);
    const url = `https://www.googleapis.com/drive/v3/changes/startPageToken?${params.toString()}`;
    const res = await fetchDriveApiWithRetry(url, getAccessToken);
    const data = (await res.json()) as { startPageToken?: string };
    if (!data.startPageToken) throw new Error("startPageTokenの取得に失敗しました（Drive APIの応答にstartPageTokenが含まれていません）");
    return data.startPageToken;
  };
}

// rangeTokenizer.tsのFetchRangeFnの実実装（CONCEPT.md 5節: タグ抽出はRangeリクエストによる
// 部分取得で行い、10235件規模のライブラリをフルダウンロードしない）。alt=mediaで音源本体の
// バイト列を取得する。書き込み系エンドポイントではないためdrive.readonlyスコープのままで良い。
// signalはタグ抽出側（tagExtraction.ts）のタイムアウト処理から渡され、タイムアウト時に
// 発行中のRangeリクエストを実際に中断する（catalog-scriptのverify-range.jsと同じ方針）。
// fetchDriveApiWithRetry()はfetch()自体（ヘッダー受信まで）のみをリトライ対象にしており、
// レスポンス受信後・本文（arrayBuffer）ダウンロード中に接続が切れた場合はカバーしない
// （2026-08-20 Codexレビュー指摘）。本文読み取りが失敗した場合は、fetchDriveApiWithRetry()を
// 最初からやり直す（ヘッダー受信済みのストリームを再開する手段は無いため、リクエスト自体を
// 再送する）。401等の非リトライ対象エラーはfetchDriveApiWithRetry()が即座に投げるため、
// ここでの追加リトライは発生しない。
// fetchDriveApiWithRetry自体も内部でリトライするため、最悪ケースでは両方の再試行が重なりうる
// （2026-08-20 /code-review指摘）が、呼び出し元のextractTags()がファイル単位の
// タイムアウト（computeTagExtractionTimeoutMs、既定30秒〜上限180秒）でPromise.raceして
// おり、両者が積み重なった場合でも最終的にはそちらで頭打ちになる。ここでの再試行回数は
// その安全網を前提に控えめ（2回）にとどめる。
async function fetchRangeWithBodyRetry(
  url: string,
  getAccessToken: () => Promise<string>,
  extraHeaders: Record<string, string> | undefined,
  signal: AbortSignal | undefined
): Promise<Uint8Array> {
  const maxBodyRetries = 2;
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxBodyRetries; attempt += 1) {
    const res = await fetchDriveApiWithRetry(url, getAccessToken, extraHeaders, signal);
    try {
      const buf = await res.arrayBuffer();
      return new Uint8Array(buf);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") throw err;
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt >= maxBodyRetries) throw lastError;
      await sleep(backoffDelayMs(attempt));
    }
  }
  throw lastError ?? new Error("unreachable");
}

// 着手順の目安4の残り（changes.list消費）: 初回スキャン完了後の差分同期。
// 1件のchanges.listエントリ。removed=trueは「Driveから完全に削除された」ことを示し、
// この場合fileは含まれない。trashed（ゴミ箱）はremoved=falseのままfile.trashed=trueで通知される
// （Drive APIの仕様）。本アプリはどちらも「もはや索引対象ではない」として同じ扱いにする
// （differentialSync.ts参照）。
export interface DriveChange {
  fileId: string;
  removed: boolean;
  file?: DriveFile;
}

export interface ChangesListPage {
  changes: DriveChange[];
  nextPageToken?: string;
  // 最終ページ（nextPageTokenが無い）にのみ含まれる、次回の差分同期の開始点。
  newStartPageToken?: string;
}

export type ChangesListFn = (pageToken: string) => Promise<ChangesListPage>;

// changes.list APIの実実装。createGetStartPageTokenFnと同じ理由でdriveId（共有ドライブ配下の
// ルートの場合）を指定する：省略するとマイドライブのユーザー変更ログがスコープになり、
// 共有ドライブ配下の変更を取りこぼす。
export function createChangesListFn(getAccessToken: () => Promise<string>, driveId?: string): ChangesListFn {
  return async (pageToken) => {
    const params = new URLSearchParams({
      pageToken,
      fields:
        "nextPageToken, newStartPageToken, changes(fileId, removed, file(id, name, mimeType, size, modifiedTime, parents, trashed, shortcutDetails))",
      pageSize: "1000",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });
    if (driveId) params.set("driveId", driveId);
    const url = `https://www.googleapis.com/drive/v3/changes?${params.toString()}`;
    const res = await fetchDriveApiWithRetry(url, getAccessToken);
    const data = (await res.json()) as { changes?: DriveChange[]; nextPageToken?: string; newStartPageToken?: string };
    return { changes: data.changes ?? [], nextPageToken: data.nextPageToken, newStartPageToken: data.newStartPageToken };
  };
}

// startPageTokenから最後（newStartPageTokenが得られるページ）まで全ページを消費し、
// 全変更を1つの配列にまとめて返す。CONCEPT.md 3.4節規模のライブラリでも、通常のスキャン間隔
// （アプリを開くたび）で蓄積する変更件数はフルスキャン（10235件）よりずっと少ない前提のため、
// フルスキャンのようなバッチ処理・中断再開は設けない（差分同期自体が長時間化するライブラリ規模
// になった場合は別途検討）。
export async function consumeAllChanges(
  listChanges: ChangesListFn,
  startPageToken: string
): Promise<{ changes: DriveChange[]; newStartPageToken: string }> {
  let pageToken = startPageToken;
  const allChanges: DriveChange[] = [];
  for (;;) {
    const page = await listChanges(pageToken);
    allChanges.push(...page.changes);
    if (page.nextPageToken) {
      pageToken = page.nextPageToken;
      continue;
    }
    if (!page.newStartPageToken) {
      throw new Error("changes.list応答にnewStartPageTokenが含まれていません（最終ページのはずですが取得できませんでした）");
    }
    return { changes: allChanges, newStartPageToken: page.newStartPageToken };
  }
}

// フォルダの祖先チェーン確認（changes.listで通知されたファイル/フォルダがrootFolderId配下か
// どうかの判定、CONCEPT.md 5節「フォルダがrootFolderIdの内外をまたいで移動した場合」・
// 4.3節「旧ルート配下だった行の削除（リコンサイル）」の両方で使う）。fields=parentsのみの
// 軽量なfiles.get。404（対象自体が削除済み等）はnullを返す。
// trashedも取得する：ゴミ箱に入れられたフォルダは通常のparentsメタデータをそのまま保持し続ける
// （完全削除されるまでparentsは変わらない）ため、trashedを見ずに祖先チェーンを辿ると
// ゴミ箱内のフォルダ配下の索引行を「rootFolderId配下のまま」と誤判定してしまう
// （2026-08-21 Codexレビュー指摘：P1、folderReachesRoot参照）。
export type DriveParentsGetFn = (fileId: string) => Promise<{ parents?: string[]; trashed?: boolean } | null>;

export type DriveFolderGetFn = (fileId: string) => Promise<{ name: string; parentId?: string } | null>;

// 表示用のフォルダ名・直接親だけを読む。読み取り専用スコープの範囲内。
export function createDriveFolderGetFn(getAccessToken: () => Promise<string>): DriveFolderGetFn {
  return async (fileId) => {
    const params = new URLSearchParams({ fields: "name,parents", supportsAllDrives: "true" });
    const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?${params.toString()}`;
    try { const res = await fetchDriveApiWithRetry(url, getAccessToken); const data = await res.json() as { name: string; parents?: string[] }; return { name: data.name, parentId: data.parents?.[0] }; }
    catch (err) { if (err instanceof DriveHttpError && err.status === 404) return null; throw err; }
  };
}

export function createDriveParentsGetFn(getAccessToken: () => Promise<string>): DriveParentsGetFn {
  return async (fileId) => {
    const params = new URLSearchParams({ fields: "parents,trashed", supportsAllDrives: "true" });
    const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?${params.toString()}`;
    try {
      const res = await fetchDriveApiWithRetry(url, getAccessToken);
      const data = (await res.json()) as { parents?: string[]; trashed?: boolean };
      return { parents: data.parents, trashed: data.trashed };
    } catch (err) {
      if (err instanceof DriveHttpError && err.status === 404) return null;
      throw err;
    }
  };
}

// folderIdからrootFolderIdへの祖先チェーンをfiles.get(fields=parents)で1階層ずつ遡って
// 確認する。結果はcacheにフォルダID単位でメモ化する（indexタブの行数よりdistinctな
// parentId（≒フォルダ数）はずっと少ないため、reconcileIndexAgainstRootでの呼び出しに対して
// 効果が大きい）。visitingは1回の呼び出し内の循環参照ガード（通常の親子関係では循環は
// 起きないが、フォルダショートカットは任意のフォルダを指しうるため安全のため設ける）。
//
// extraRootIds: rootFolderId自体に加えて「到達済み」とみなす追加のフォルダID集合
// （listAudioFilesRecursiveのshortcutTargetFolderIds、main.tsがsync タブに永続化したものを
// 渡す）。フォルダショートカットの参照先は、Drive上の通常のparents関係を作らない
// （ショートカットは参照先フォルダに対して「親」ではない）ため、この祖先チェーン確認だけでは
// ショートカット経由でrootFolderId配下に見える曲を原理的に発見できない（2026-08-21 Codex
// レビュー指摘：P1。以前の実装ではショートカット経由で索引化された曲が、差分同期・
// リコンサイルの初回実行で誤って「rootFolderId外」と判定され削除されてしまっていた）。
//
// **既知の限界（2026-08-21 さらにCodexレビュー指摘：P1、対応は見送り）**：extraRootIdsは
// フォルダIDのみのSetで、そのショートカット参照先がリンク共有のセキュリティ更新の対象で
// あった場合に必要なresourceKeyを保持しない。そのため、下記でextraRootIds一致時に行う
// trashed確認のためのgetParents呼び出しがresourceKeyを渡せず、resource key保護された
// ショートカット参照先フォルダでは404になり「到達不可」と誤判定されうる（listAudioFilesRecursive
// によるフルスキャン時の走査自体はresourceKeyを正しく引き継いでいるため、フルスキャンでの
// 索引化自体は成功する。誤判定の影響が及ぶのはその後のtrashed確認を伴う祖先チェーン確認
// ＝差分同期・リコンサイルの経路のみ）。正しく解決するにはextraRootIdsをid単体のSetから
// `Map<string, string | undefined>`（フォルダID→resourceKey）へ拡張し、sync タブの
// 永続化フォーマット・関連する複数の呼び出し元シグネチャを変更する必要がある。resource key
// 保護されたショートカット参照先という状況自体が既存のCLAUDE.mdの「見送った2件」（ルート
// フォルダ自体がresource key保護・ショートカットの場合は未対応）と同種の稀なケースのため、
// 次PR以降の対応とする。
async function folderReachesRoot(
  getParents: DriveParentsGetFn,
  folderId: string,
  rootFolderId: string,
  cache: Map<string, boolean>,
  visiting: Set<string>,
  extraRootIds: Set<string>
): Promise<boolean> {
  // rootFolderId自体だけは即座にtrueを返す（ルート自身のゴミ箱状態はスキャン開始前の
  // validateRootFolderの検証範囲外・既知の限界として別途扱う）。extraRootIds（ショートカット
  // 参照先）はrootFolderIdと違い、差分同期中にゴミ箱へ移動されうる実在のフォルダのため、
  // 一致するだけで即trueにはせず、下のtrashed確認を必ず通す（2026-08-21 Codexレビュー
  // 指摘：P1。以前はここで早期returnしていたため、ショートカット参照先自体がゴミ箱へ
  // 移動された場合でもtrashedを確認せず到達済み扱いのままになっていた）。
  if (folderId === rootFolderId) return true;
  const cached = cache.get(folderId);
  if (cached !== undefined) return cached;
  if (visiting.has(folderId)) return false;
  visiting.add(folderId);
  let result = false;
  const meta = await getParents(folderId);
  // ゴミ箱に入れられたフォルダは「もはやそこに無い」ものとして扱う。trashedのままでも
  // parentsは保持され続けるため、これを見ないと祖先チェーンの途中にあるゴミ箱内フォルダを
  // 素通りしてrootFolderIdに到達してしまう（2026-08-21 Codexレビュー指摘：P1）。
  if (meta && !meta.trashed) {
    if (extraRootIds.has(folderId)) {
      result = true;
    } else {
      for (const parentId of meta.parents ?? []) {
        if (await folderReachesRoot(getParents, parentId, rootFolderId, cache, visiting, extraRootIds)) {
          result = true;
          break;
        }
      }
    }
  }
  visiting.delete(folderId);
  cache.set(folderId, result);
  return result;
}

// ファイル（またはフォルダ）の直接の親ID群のいずれかがrootFolderIdの祖先チェーンに到達するかを
// 判定する。cacheを呼び出し元（main.ts）が使い回すことで、同じスキャン・同期の中で同じ
// フォルダIDへの重複した祖先チェーン確認を避けられる。extraRootIdsは上記folderReachesRoot参照
// （ショートカット経由の到達性を補うための追加ルート集合、省略時は空集合＝従来通りの挙動）。
export async function isDescendantOfRoot(
  getParents: DriveParentsGetFn,
  candidateParentIds: string[] | undefined,
  rootFolderId: string,
  cache: Map<string, boolean> = new Map(),
  extraRootIds: Set<string> = new Set()
): Promise<boolean> {
  for (const parentId of candidateParentIds ?? []) {
    if (await folderReachesRoot(getParents, parentId, rootFolderId, cache, new Set(), extraRootIds)) return true;
  }
  return false;
}

export function createDriveFetchRange(
  fileId: string,
  getAccessToken: () => Promise<string>,
  options?: { resourceKey?: string; signal?: AbortSignal }
): FetchRangeFn {
  return async (startByte, endByteInclusive) => {
    const params = new URLSearchParams({ alt: "media", supportsAllDrives: "true" });
    const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?${params.toString()}`;
    const extraHeaders: Record<string, string> = { Range: `bytes=${startByte}-${endByteInclusive}` };
    if (options?.resourceKey) extraHeaders["X-Goog-Drive-Resource-Keys"] = `${fileId}/${options.resourceKey}`;
    return fetchRangeWithBodyRetry(url, getAccessToken, extraHeaders, options?.signal);
  };
}
