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
// 1フォルダの取得失敗はfailedFoldersに積んで先へ進み、スキャン全体を止めない
// （catalog-script/src/scan.jsの方針と同じ）。
export async function listAudioFilesRecursive(
  list: DriveListFn,
  folderId: string,
  folderPath = "",
  failedFolders: string[] = []
): Promise<AudioFileEntry[]> {
  let children: DriveFile[];
  try {
    children = await listFolderChildren(list, folderId);
  } catch {
    failedFolders.push(folderPath || folderId);
    return [];
  }

  const results: AudioFileEntry[] = [];
  for (const file of children) {
    if (file.mimeType === FOLDER_MIME_TYPE) {
      const childPath = folderPath ? `${folderPath}/${file.name}` : file.name;
      const nested = await listAudioFilesRecursive(list, file.id, childPath, failedFolders);
      results.push(...nested);
    } else if (isAudioFile(file.name)) {
      results.push({ file, folderPath });
    }
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
