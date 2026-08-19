// CONCEPT.md 5節「Phase 1」: 初回スキャンの前段となる、Drive上の音楽ファイル一覧取得。
// catalog-script/src/scan.js の listAudioFilesRecursive() と同じ方針（3.2節: ファイル発見は
// mimeTypeではなく拡張子ベースで行う）をブラウザ完結の`fetch`実装に移植したもの。
// Drive APIの実際のHTTP呼び出しは`DriveListFn`として外側から注入し、このファイル自体は
// 再帰走査・ページング・拡張子フィルタのロジックだけを担当する（rangeTokenizer.tsと同じDI方針でテスト可能にする）。

import { isAudioFile } from "./lib";
import { AuthError } from "./auth";

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  parents?: string[];
  // フォルダショートカット（3.1節のフォルダ構成の実データには無かったが、Drive一般では
  // 存在しうる）解決用。files.list/files.getのfieldsに含めた場合のみ埋まる。
  // targetResourceKey: リンク共有のセキュリティ更新が適用されたファイル/フォルダへの
  // ショートカットは、参照先を単独のIDだけでは解決できず、後続のDrive APIリクエストに
  // このresource keyを添える必要がある（2026-08-19 Codexレビュー指摘）
  shortcutDetails?: { targetId?: string; targetMimeType?: string; targetResourceKey?: string };
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
function isAuthError(err: unknown): boolean {
  return (err instanceof DriveHttpError && err.status === 401) || err instanceof AuthError;
}

// 401検知後、ConcurrencyLimiterのキューに残っている・まだ開始していない走査タスクを
// 静かに打ち切るための内部エラー。同じ無効なトークンでAPIを叩き続けるのを防ぐ
// （2026-08-19 Codexレビュー指摘）。呼び出し元には伝播させない（failedFoldersにも積まない）。
class ScanAbortedError extends Error {}

const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
const SHORTCUT_MIME_TYPE = "application/vnd.google-apps.shortcut";

// フォルダIDそのものの存在・種別・アクセス権を確認する。files.list（'<folderId>' in parents）は
// folderId自体を検証せず、存在しない/権限が無いIDに対しても単に空の子一覧（200応答）を返しうるため、
// 「フォルダが空」と「そもそも無効なID」を区別できない（2026-08-19 Codexレビュー指摘）。
// 呼び出し元（main.ts）はlistAudioFilesRecursiveの前にこれを呼び、失敗時のエラー表示に使う。
export type DriveGetFn = (fileId: string) => Promise<{ mimeType: string }>;

export async function validateRootFolder(getFile: DriveGetFn, folderId: string): Promise<void> {
  const meta = await getFile(folderId);
  if (meta.mimeType !== FOLDER_MIME_TYPE) {
    throw new Error(`指定されたIDはフォルダではありません（mimeType: ${meta.mimeType}）`);
  }
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
export async function listAudioFilesRecursive(
  list: DriveListFn,
  folderId: string,
  folderPath = "",
  failedFolders: string[] = [],
  maxConcurrentLists = DEFAULT_MAX_CONCURRENT_LISTS
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
      undefined
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
  resourceKey: string | undefined
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
          targetResourceKey
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
  extraHeaders?: Record<string, string>
): Promise<Response> {
  const maxRetries = 3;
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const accessToken = await getAccessToken();
    let res: Response;
    try {
      res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}`, ...extraHeaders } });
    } catch (networkErr) {
      lastError = networkErr instanceof Error ? networkErr : new Error(String(networkErr));
      if (attempt >= maxRetries) throw lastError;
      await sleep(500 * 2 ** attempt);
      continue;
    }
    if (res.ok) return res;
    const bodyText = await res.text();
    lastError = new DriveHttpError(res.status, `Drive API request failed: ${res.status} ${bodyText}`);
    if (attempt >= maxRetries || !isRetryableError(res.status, bodyText)) throw lastError;
    await sleep(500 * 2 ** attempt);
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
      fields: "nextPageToken, files(id, name, mimeType, size, parents, shortcutDetails)",
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
export function createDriveGetFn(getAccessToken: () => Promise<string>): DriveGetFn {
  return async (fileId) => {
    const params = new URLSearchParams({ fields: "id,mimeType", supportsAllDrives: "true" });
    const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?${params.toString()}`;
    const res = await fetchDriveApiWithRetry(url, getAccessToken);
    const data = (await res.json()) as { mimeType: string };
    return { mimeType: data.mimeType };
  };
}
