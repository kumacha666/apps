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

// folderId配下を再帰的に走査し、拡張子ベースで音楽ファイルを発見する（3.2節）。
// 呼び出し元が指定したルートフォルダ自体の取得失敗は、フォルダIDの誤り・権限無し・
// トークン拒否等スキャン全体が無効な可能性が高いため、子フォルダの失敗（failedFoldersに
// 積んで継続）とは区別して呼び出し元に例外として伝える（2026-08-19 Codexレビュー指摘:
// 「0件見つかった」と「そもそも取得に失敗した」を区別できないと、誤ったフォルダIDでの
// スキャンが「完了・0件」と表示されてしまう）。
export async function listAudioFilesRecursive(
  list: DriveListFn,
  folderId: string,
  folderPath = "",
  failedFolders: string[] = []
): Promise<AudioFileEntry[]> {
  return listAudioFilesRecursiveInternal(list, folderId, folderPath, failedFolders, true);
}

async function listAudioFilesRecursiveInternal(
  list: DriveListFn,
  folderId: string,
  folderPath: string,
  failedFolders: string[],
  isRoot: boolean
): Promise<AudioFileEntry[]> {
  let children: DriveFile[];
  try {
    children = await listFolderChildren(list, folderId);
  } catch (err) {
    if (isRoot) throw err;
    failedFolders.push(folderPath || folderId);
    return [];
  }

  const results: AudioFileEntry[] = [];
  // 兄弟フォルダは互いに依存しないため並行に走査する。10235件規模のライブラリ（CONCEPT.md 3.4節）を
  // 直列に走査すると、フォルダ数だけ往復レイテンシが積み上がってしまうため
  const subfolderScans: Promise<AudioFileEntry[]>[] = [];
  for (const file of children) {
    if (file.mimeType === FOLDER_MIME_TYPE) {
      const childPath = folderPath ? `${folderPath}/${file.name}` : file.name;
      subfolderScans.push(listAudioFilesRecursiveInternal(list, file.id, childPath, failedFolders, false));
    } else if (isAudioFile(file.name)) {
      results.push({ file, folderPath });
    }
  }
  for (const nested of await Promise.all(subfolderScans)) {
    results.push(...nested);
  }
  return results;
}

// DriveListFnの実実装。ensureAccessTokenで取得したアクセストークンをAuthorizationヘッダーに載せる。
// drive.readonlyスコープに固定されたトークンのみを使うため、書き込み系エンドポイントは呼びようがない（CONCEPT.md 2節）。
export function createDriveListFn(getAccessToken: () => Promise<string>): DriveListFn {
  return async (folderId, pageToken) => {
    const accessToken = await getAccessToken();
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "nextPageToken, files(id, name, mimeType, size, parents)",
      pageSize: "1000",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new Error(`Drive files.list failed: ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as { files?: DriveFile[]; nextPageToken?: string };
    return { files: data.files ?? [], nextPageToken: data.nextPageToken };
  };
}
