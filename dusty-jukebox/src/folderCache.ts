// フォルダの id→{name, parentId} 対応表を、索引スプレッドシートの`folders`タブへキャッシュする。
//
// 背景：loadCatalog()は曲ごとにfolderPaths.tsのFolderPathResolverでフォルダパスを解決していたが、
// これは曲の`parentId`から祖先フォルダをDrive API（files.get）で1階層ずつ辿る方式で、実ライブラリ
// （数千フォルダ規模）では起動のたびに5分以上かかっていた（Codexレビュー指摘ではなく実機利用での
// 発見、2026-09-03）。listAudioFilesRecursive（drive.ts）はスキャン時に各フォルダのfiles.list応答
// （fields=...,parents）からフォルダの真の親IDを追加コストゼロで既に得ているため、それを永続化して
// loadCatalog()側はDrive呼び出し無し（またはキャッシュに無い分だけ）でパスを組み立てられるようにする。
//
// スキーマはfolderId起点の単純な3列で、_override等の補正列は持たない（フォルダ名・親IDは
// ユーザーが編集する対象ではなく、Drive側の実際のフォルダ構造をそのまま反映するキャッシュのため）。

import { columnLetter, createSheetsFetch, updateRowsInBatches, WRITE_BATCH_SIZE } from "./sheets";
import type { RowUpdateWriter } from "./sheets";
import { sheetRange } from "./lib";
import type { FolderGetFn } from "./folderPaths";

export const FOLDERS_SHEET_NAME = "folders";
export const FOLDERS_SHEET_HEADER = ["folderId", "name", "parentId"] as const;

export interface FolderCacheEntry {
  name: string;
  parentId: string;
}

export function isValidFoldersHeader(header: (string | number)[]): boolean {
  return header.length === FOLDERS_SHEET_HEADER.length && header.every((v, i) => v === FOLDERS_SHEET_HEADER[i]);
}

// listExistingRows()相当（A2以降、行番号は`i+2`に対応）から folderId→{name, parentId} の
// Mapを作る。rowNumberも保持し、upsertFolderCacheEntries()が更新対象の行番号を引けるようにする。
export interface FolderCacheRow {
  rowNumber: number;
  entry: FolderCacheEntry;
}

export function parseFolderCacheRows(rows: (string | number)[][]): Map<string, FolderCacheRow> {
  const map = new Map<string, FolderCacheRow>();
  rows.forEach((row, i) => {
    const folderId = String(row[0] ?? "");
    if (!folderId) return;
    map.set(folderId, { rowNumber: i + 2, entry: { name: String(row[1] ?? ""), parentId: String(row[2] ?? "") } });
  });
  return map;
}

export function buildFolderCacheRow(folderId: string, entry: FolderCacheEntry): (string | number)[] {
  return [folderId, entry.name, entry.parentId];
}

// loadCatalog()向けの読み取り専用版（rowNumberは不要、更新対象行を引く必要が無いため）。
export function parseFolderCacheEntries(rows: (string | number)[][]): Map<string, FolderCacheEntry> {
  const map = new Map<string, FolderCacheEntry>();
  for (const [folderId, { entry }] of parseFolderCacheRows(rows)) map.set(folderId, entry);
  return map;
}

export interface FolderCacheReadIO {
  readHeaderRow(): Promise<(string | number)[]>;
  listExistingRows(): Promise<(string | number)[][]>;
}

export interface FolderCacheIO extends FolderCacheReadIO, RowUpdateWriter {
  appendRows(rows: (string | number)[][]): Promise<void>;
}

// 新たに発見した（または名前/親IDが変わった）フォルダエントリだけをタブへ反映する。
// 変化の無いエントリはAPI呼び出しを一切発生させない（数千フォルダ規模でも、実際に変化した
// 分だけが書き込み対象になる）。existingRowsSnapshotを渡すと、呼び出し元が既に読み取り済みの
// listExistingRows()結果を使い回せる（sheets.tsのupsertIndexRowsと同じ方針）。
// この機能の初回展開時（loadCatalog()のバックフィル、folderPaths.test.ts参照）は数千件規模の
// 新規行が一度に発生しうるため、更新・追記のどちらもsheets.tsのWRITE_BATCH_SIZE単位に分割する
// （1回のvalues:batchUpdate/values:appendに数千行を積むとリクエストサイズ上限・クォータで
// 途中失敗しやすいため、既存のupsertIndexRows/updateRowsInBatchesと同じ方針を踏襲する）。
export async function upsertFolderCacheEntries(
  io: FolderCacheIO,
  discovered: Map<string, FolderCacheEntry>,
  existingRowsSnapshot?: (string | number)[][]
): Promise<void> {
  if (discovered.size === 0) return;
  const existingRows = existingRowsSnapshot ?? (await io.listExistingRows());
  const existingByFolderId = parseFolderCacheRows(existingRows);

  const toAppend: (string | number)[][] = [];
  const toUpdate: { rowNumber: number; row: (string | number)[] }[] = [];
  for (const [folderId, entry] of discovered) {
    const existing = existingByFolderId.get(folderId);
    if (!existing) {
      toAppend.push(buildFolderCacheRow(folderId, entry));
    } else if (existing.entry.name !== entry.name || existing.entry.parentId !== entry.parentId) {
      toUpdate.push({ rowNumber: existing.rowNumber, row: buildFolderCacheRow(folderId, entry) });
    }
  }
  await updateRowsInBatches(io, toUpdate);
  for (let i = 0; i < toAppend.length; i += WRITE_BATCH_SIZE) {
    await io.appendRows(toAppend.slice(i, i + WRITE_BATCH_SIZE));
  }
}

// loadCatalog()向け：folderIdがキャッシュに載っていればDriveを一切呼ばず返し、無ければ
// fallback（folderPaths.tsの実Drive実装、createDriveFolderGetFn）へ委ねる。キャッシュが
// 空（`folders`タブがまだ無い等）の場合はfallbackだけが呼ばれ続け、従来通りの（遅いが正しい）
// 挙動に自然にフォールバックする。
export function createCacheFirstFolderGetFn(cache: Map<string, FolderCacheEntry>, fallback: FolderGetFn): FolderGetFn {
  return async (folderId) => cache.get(folderId) ?? (await fallback(folderId));
}

// FolderCacheIOの実実装。sheets.tsのcreateSheetsFetch（認証・リトライ共通）を再利用する。
export function createFolderCacheIO(spreadsheetId: string, getAccessToken: () => Promise<string>): FolderCacheIO {
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}`;
  const sheetsFetch = createSheetsFetch(spreadsheetId, getAccessToken);
  const lastCol = columnLetter(FOLDERS_SHEET_HEADER.length);

  return {
    async readHeaderRow() {
      const res = await sheetsFetch(`${base}/values/${encodeURIComponent(sheetRange(FOLDERS_SHEET_NAME, "1:1"))}`);
      const data = (await res.json()) as { values?: (string | number)[][] };
      return data.values?.[0] ?? [];
    },
    async listExistingRows() {
      const res = await sheetsFetch(`${base}/values/${encodeURIComponent(sheetRange(FOLDERS_SHEET_NAME, `A2:${lastCol}`))}`);
      const data = (await res.json()) as { values?: (string | number)[][] };
      return data.values ?? [];
    },
    async updateRows(updates) {
      if (updates.length === 0) return;
      await sheetsFetch(`${base}/values:batchUpdate`, {
        method: "POST",
        body: JSON.stringify({
          valueInputOption: "RAW",
          data: updates.map(({ rowNumber, row }) => ({
            range: sheetRange(FOLDERS_SHEET_NAME, `A${rowNumber}:${lastCol}${rowNumber}`),
            values: [row],
          })),
        }),
      });
    },
    async appendRows(rows) {
      if (rows.length === 0) return;
      await sheetsFetch(
        `${base}/values/${encodeURIComponent(sheetRange(FOLDERS_SHEET_NAME, "A1"))}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
        { method: "POST", body: JSON.stringify({ values: rows }) },
        false // POSTは非冪等なためリトライしない（sheets.ts createSheetsIndexIO.appendRowsと同じ方針）
      );
    },
  };
}
