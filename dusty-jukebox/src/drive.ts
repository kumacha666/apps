// CONCEPT.md 5節「Phase 1」: 初回スキャンの前段となる、Drive上の音楽ファイル一覧取得。
// catalog-script/src/scan.js の listAudioFilesRecursive() と同じ方針（3.2節: ファイル発見は
// mimeTypeではなく拡張子ベースで行う）をブラウザ完結の`fetch`実装に移植したもの。
// Drive APIの実際のHTTP呼び出しは`DriveListFn`として外側から注入し、このファイル自体は
// 再帰走査・ページング・拡張子フィルタのロジックだけを担当する（rangeTokenizer.tsと同じDI方針でテスト可能にする）。

import { isAudioFile } from "./lib";

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  parents?: string[];
}

export interface DriveListPage {
  files: DriveFile[];
  nextPageToken?: string;
}

// 1回のfiles.list呼び出し。folderIdの直接の子（フォルダ・ファイル両方、trashedは除く）をページングして返す。
export type DriveListFn = (folderId: string, pageToken: string | undefined) => Promise<DriveListPage>;

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

function isAuthError(err: unknown): boolean {
  return err instanceof DriveHttpError && err.status === 401;
}

const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

export async function listFolderChildren(list: DriveListFn, folderId: string): Promise<DriveFile[]> {
  const all: DriveFile[] = [];
  let pageToken: string | undefined;
  do {
    const page = await list(folderId, pageToken);
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
export async function listAudioFilesRecursive(
  list: DriveListFn,
  folderId: string,
  folderPath = "",
  failedFolders: string[] = [],
  maxConcurrentLists = DEFAULT_MAX_CONCURRENT_LISTS
): Promise<AudioFileEntry[]> {
  const limiter = new ConcurrencyLimiter(maxConcurrentLists);
  return listAudioFilesRecursiveInternal(list, folderId, folderPath, failedFolders, true, limiter);
}

async function listAudioFilesRecursiveInternal(
  list: DriveListFn,
  folderId: string,
  folderPath: string,
  failedFolders: string[],
  isRoot: boolean,
  limiter: ConcurrencyLimiter
): Promise<AudioFileEntry[]> {
  let children: DriveFile[];
  try {
    children = await limiter.run(() => listFolderChildren(list, folderId));
  } catch (err) {
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
    if (file.mimeType === FOLDER_MIME_TYPE) {
      const childPath = folderPath ? `${folderPath}/${file.name}` : file.name;
      subfolderScans.push(listAudioFilesRecursiveInternal(list, file.id, childPath, failedFolders, false, limiter));
    } else if (isAudioFile(file.name)) {
      results.push({ file, folderPath });
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

function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

// DriveListFnの実実装。ensureAccessTokenで取得したアクセストークンをAuthorizationヘッダーに載せる。
// drive.readonlyスコープに固定されたトークンのみを使うため、書き込み系エンドポイントは呼びようがない（CONCEPT.md 2節）。
// 429/5xx（スロットリング・一時障害）は指数バックオフで数回リトライする。401等は即座にDriveHttpErrorとして
// 呼び出し元（listAudioFilesRecursiveInternal）に伝え、認証エラーとしての特別扱いを可能にする。
export function createDriveListFn(getAccessToken: () => Promise<string>): DriveListFn {
  return async (folderId, pageToken) => {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "nextPageToken, files(id, name, mimeType, size, parents)",
      pageSize: "1000",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const url = `https://www.googleapis.com/drive/v3/files?${params.toString()}`;

    const maxRetries = 3;
    let lastError: DriveHttpError | null = null;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const accessToken = await getAccessToken();
      const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (res.ok) {
        const data = (await res.json()) as { files?: DriveFile[]; nextPageToken?: string };
        return { files: data.files ?? [], nextPageToken: data.nextPageToken };
      }
      lastError = new DriveHttpError(res.status, `Drive files.list failed: ${res.status} ${await res.text()}`);
      if (attempt >= maxRetries || !isRetryableStatus(res.status)) throw lastError;
      await sleep(500 * 2 ** attempt);
    }
    // ループは必ずreturn/throwで終わるが、TypeScriptの制御フロー解析のために明示しておく
    throw lastError ?? new Error("unreachable");
  };
}
