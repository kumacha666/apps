// 保存済みプレイリスト機能（CONCEPT.md 4.3節「絞り込み→除外→保存という操作フローで作る
// 「保存済みプレイリスト」機能」）。動的なスマートプレイリストではなく、確定した具体的な
// 曲リスト（fileIdの並び）として`playlists`/`playlist_tracks`タブに保存し、後から呼び出して
// 再生キューへ設定できるようにする。sheets.ts/sync.tsと同じDI方針：Sheets APIへの実際の
// HTTP呼び出しはPlaylistsIOとして外側から注入し、このファイルはパース・順序キー生成・
// 保存/削除ロジックのみを担当する。
//
// このPRの範囲（MVP）：新規プレイリストとしての保存・一覧表示・再生キューへの読み込み・削除。
// 既存プレイリストへの曲の追加・並べ替え・改名は次PR以降（dusty-jukebox/CLAUDE.md参照）。

import { columnLetter, createSheetsFetch, updateRowsInBatches, WRITE_BATCH_SIZE } from "./sheets";

export const PLAYLISTS_SHEET_NAME = "playlists";
// CONCEPT.md 4.3節のplaylistsタブスキーマそのまま。
export const PLAYLISTS_SHEET_HEADER = ["playlistId", "name", "createdAt", "updatedAt"] as const;

export const PLAYLIST_TRACKS_SHEET_NAME = "playlist_tracks";
// CONCEPT.md 4.3節のplaylist_tracksタブスキーマそのまま（1プレイリスト＝複数行の縦持ち）。
export const PLAYLIST_TRACKS_SHEET_HEADER = ["playlistId", "order", "fileId"] as const;

export function isValidPlaylistsHeader(header: (string | number)[]): boolean {
  return header.length === PLAYLISTS_SHEET_HEADER.length && header.every((v, i) => v === PLAYLISTS_SHEET_HEADER[i]);
}
export function isValidPlaylistTracksHeader(header: (string | number)[]): boolean {
  return (
    header.length === PLAYLIST_TRACKS_SHEET_HEADER.length && header.every((v, i) => v === PLAYLIST_TRACKS_SHEET_HEADER[i])
  );
}

export interface Playlist {
  playlistId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

// playlistIdが空の行（削除により空欄化された行）は除外する。重複playlistId（本来生じない想定だが
// 万一の複数デバイス同時作成競合に備え）は先勝ちで採用する（sheets.tsのparseIndexRowsと同じ方針）。
export function parsePlaylistRows(rows: (string | number)[][]): Playlist[] {
  const seen = new Set<string>();
  const result: Playlist[] = [];
  for (const row of rows) {
    const playlistId = String(row[0] ?? "");
    if (!playlistId || seen.has(playlistId)) continue;
    seen.add(playlistId);
    result.push({ playlistId, name: String(row[1] ?? ""), createdAt: String(row[2] ?? ""), updatedAt: String(row[3] ?? "") });
  }
  return result;
}

export interface PlaylistTrackRow {
  playlistId: string;
  order: string;
  fileId: string;
}

export function parsePlaylistTrackRows(rows: (string | number)[][]): PlaylistTrackRow[] {
  const result: PlaylistTrackRow[] = [];
  for (const row of rows) {
    const playlistId = String(row[0] ?? "");
    const fileId = String(row[2] ?? "");
    if (!playlistId || !fileId) continue;
    result.push({ playlistId, order: String(row[1] ?? ""), fileId });
  }
  return result;
}

// CONCEPT.md 4.3節：`${Date.now()}-${batchSeq}-${deviceRandomId}`。2台のデバイスがほぼ同時に
// 同じプレイリストへ追記しても、行が別なのでlast-write-winsでは解決しない「orderの重複」を、
// batchSeq（同一保存操作内の連番）とdeviceRandomId（アプリ起動時に生成する短いランダム文字列、
// 最終的な一意性の決定的なタイブレーク）で回避する。
export function makeOrderKey(nowMs: number, batchSeq: number, deviceRandomId: string): string {
  return `${nowMs}-${batchSeq}-${deviceRandomId}`;
}

interface ParsedOrderKey {
  timestamp: number;
  batchSeq: number;
  deviceRandomId: string;
}

// 桁数に依存しないため、辞書順ではなくタイムスタンプ・batchSeqをそれぞれ数値としてパースして
// 比較する（CONCEPT.md 4.3節「batchSeqのゼロ埋め桁数に依存しない比較にする」）。
function parseOrderKey(key: string): ParsedOrderKey {
  const match = key.match(/^(\d+)-(\d+)-(.*)$/);
  if (!match) return { timestamp: Number.POSITIVE_INFINITY, batchSeq: 0, deviceRandomId: key };
  return { timestamp: Number(match[1]), batchSeq: Number(match[2]), deviceRandomId: match[3] };
}

export function compareOrderKeys(a: string, b: string): number {
  const pa = parseOrderKey(a);
  const pb = parseOrderKey(b);
  return pa.timestamp - pb.timestamp || pa.batchSeq - pb.batchSeq || (pa.deviceRandomId < pb.deviceRandomId ? -1 : pa.deviceRandomId > pb.deviceRandomId ? 1 : 0);
}

// 指定プレイリストのfileIdを保存順（order昇順）で返す。同一fileIdが複数行ある場合
// （複数デバイスからのほぼ同時追記等）は先に並ぶ方（orderが小さい方）を採用する。
export function fileIdsForPlaylist(trackRows: PlaylistTrackRow[], playlistId: string): string[] {
  const sorted = trackRows
    .filter((row) => row.playlistId === playlistId)
    .sort((a, b) => compareOrderKeys(a.order, b.order));
  const seen = new Set<string>();
  const result: string[] = [];
  for (const row of sorted) {
    if (seen.has(row.fileId)) continue;
    seen.add(row.fileId);
    result.push(row.fileId);
  }
  return result;
}

export function buildPlaylistRow(args: { playlistId: string; name: string; createdAtIso: string; updatedAtIso: string }): (string | number)[] {
  return [args.playlistId, args.name, args.createdAtIso, args.updatedAtIso];
}

export function buildPlaylistTrackRows(args: {
  playlistId: string;
  fileIds: string[];
  nowMs: number;
  deviceRandomId: string;
  batchSeqStart?: number;
}): (string | number)[][] {
  const batchSeqStart = args.batchSeqStart ?? 0;
  return args.fileIds.map((fileId, i) => [args.playlistId, makeOrderKey(args.nowMs, batchSeqStart + i, args.deviceRandomId), fileId]);
}

// アプリ起動時に1回生成し、以降のプレイリスト保存操作すべてで使い回す想定（main.tsが保持する）。
export function generateDeviceRandomId(): string {
  return Math.random().toString(36).slice(2, 10);
}

// playlists/playlist_tracksタブへの実際の読み書きをDIするインターフェース（sheets.tsの
// SheetsIndexIOと同じ方針）。
export interface PlaylistsIO {
  listPlaylists(): Promise<(string | number)[][]>;
  readPlaylistsHeaderRow(): Promise<(string | number)[]>;
  appendPlaylistRows(rows: (string | number)[][]): Promise<void>;
  updatePlaylistRows(updates: { rowNumber: number; row: (string | number)[] }[]): Promise<void>;
  listPlaylistTracks(): Promise<(string | number)[][]>;
  readPlaylistTracksHeaderRow(): Promise<(string | number)[]>;
  appendPlaylistTrackRows(rows: (string | number)[][]): Promise<void>;
  updatePlaylistTrackRows(updates: { rowNumber: number; row: (string | number)[] }[]): Promise<void>;
}

async function appendInBatches(append: (rows: (string | number)[][]) => Promise<void>, rows: (string | number)[][]): Promise<void> {
  for (let i = 0; i < rows.length; i += WRITE_BATCH_SIZE) {
    await append(rows.slice(i, i + WRITE_BATCH_SIZE));
  }
}

// 新規プレイリストとして保存する。fileIdsは現在の再生キューの並び順（除外を除いた表示順）を
// そのまま渡す想定。
export async function createPlaylist(
  io: PlaylistsIO,
  name: string,
  fileIds: string[],
  deviceRandomId: string,
  nowMs = Date.now(),
  generatePlaylistId: () => string = () => crypto.randomUUID()
): Promise<string> {
  const playlistId = generatePlaylistId();
  const nowIso = new Date(nowMs).toISOString();
  await io.appendPlaylistRows([buildPlaylistRow({ playlistId, name, createdAtIso: nowIso, updatedAtIso: nowIso })]);
  if (fileIds.length > 0) {
    await appendInBatches(
      (rows) => io.appendPlaylistTrackRows(rows),
      buildPlaylistTrackRows({ playlistId, fileIds, nowMs, deviceRandomId })
    );
  }
  return playlistId;
}

// プレイリストと収録曲行を両方とも空欄化する（sheets.tsのremoveIndexRowsと同じ、行削除の
// 代わりに全列空欄化する方式。Sheets APIに行削除用のnumeric sheetIdを保持しないDI設計のため）。
export async function deletePlaylist(io: PlaylistsIO, playlistId: string): Promise<void> {
  const playlistRows = await io.listPlaylists();
  const blankPlaylistRow = new Array(PLAYLISTS_SHEET_HEADER.length).fill("") as (string | number)[];
  const playlistUpdates = playlistRows
    .map((row, i) => ({ rowNumber: i + 2, row }))
    .filter(({ row }) => String(row[0] ?? "") === playlistId)
    .map(({ rowNumber }) => ({ rowNumber, row: blankPlaylistRow }));
  if (playlistUpdates.length > 0) {
    await updateRowsInBatches({ updateRows: io.updatePlaylistRows }, playlistUpdates);
  }

  const trackRows = await io.listPlaylistTracks();
  const blankTrackRow = new Array(PLAYLIST_TRACKS_SHEET_HEADER.length).fill("") as (string | number)[];
  const trackUpdates = trackRows
    .map((row, i) => ({ rowNumber: i + 2, row }))
    .filter(({ row }) => String(row[0] ?? "") === playlistId)
    .map(({ rowNumber }) => ({ rowNumber, row: blankTrackRow }));
  if (trackUpdates.length > 0) {
    await updateRowsInBatches({ updateRows: io.updatePlaylistTrackRows }, trackUpdates);
  }
}

// PlaylistsIOの実実装。sheets.tsのcreateSheetsFetch（認証・リトライ共通）を再利用する。
export function createPlaylistsIO(spreadsheetId: string, getAccessToken: () => Promise<string>): PlaylistsIO {
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}`;
  const sheetsFetch = createSheetsFetch(spreadsheetId, getAccessToken);

  function sheetRangeFor(sheetName: string, cellRange: string): string {
    return `'${sheetName.replace(/'/g, "''")}'!${cellRange}`;
  }

  function listRows(sheetName: string, lastCol: string) {
    return async (): Promise<(string | number)[][]> => {
      const range = sheetRangeFor(sheetName, `A2:${lastCol}`);
      const res = await sheetsFetch(`${base}/values/${encodeURIComponent(range)}`);
      const data = (await res.json()) as { values?: (string | number)[][] };
      return data.values ?? [];
    };
  }
  function readHeaderRow(sheetName: string) {
    // sheets.tsのreadHeaderRowと同じ理由：列範囲を明示しない行全体記法にすることで、対象タブの
    // 実際のグリッド列数に関わらず常に成功する。
    return async (): Promise<(string | number)[]> => {
      const range = sheetRangeFor(sheetName, "1:1");
      const res = await sheetsFetch(`${base}/values/${encodeURIComponent(range)}`);
      const data = (await res.json()) as { values?: (string | number)[][] };
      return data.values?.[0] ?? [];
    };
  }
  function appendRows(sheetName: string) {
    return async (rows: (string | number)[][]): Promise<void> => {
      if (rows.length === 0) return;
      const range = sheetRangeFor(sheetName, "A1");
      // appendは非冪等のためリトライしない（sheets.tsのappendRowsと同じ方針）。
      await sheetsFetch(
        `${base}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
        { method: "POST", body: JSON.stringify({ values: rows }) },
        false
      );
    };
  }
  function updateRows(sheetName: string, lastCol: string) {
    return async (updates: { rowNumber: number; row: (string | number)[] }[]): Promise<void> => {
      if (updates.length === 0) return;
      await sheetsFetch(`${base}/values:batchUpdate`, {
        method: "POST",
        body: JSON.stringify({
          valueInputOption: "RAW",
          data: updates.map(({ rowNumber, row }) => ({
            range: sheetRangeFor(sheetName, `A${rowNumber}:${lastCol}${rowNumber}`),
            values: [row],
          })),
        }),
      });
    };
  }

  const playlistsLastCol = columnLetter(PLAYLISTS_SHEET_HEADER.length);
  const tracksLastCol = columnLetter(PLAYLIST_TRACKS_SHEET_HEADER.length);
  return {
    listPlaylists: listRows(PLAYLISTS_SHEET_NAME, playlistsLastCol),
    readPlaylistsHeaderRow: readHeaderRow(PLAYLISTS_SHEET_NAME),
    appendPlaylistRows: appendRows(PLAYLISTS_SHEET_NAME),
    updatePlaylistRows: updateRows(PLAYLISTS_SHEET_NAME, playlistsLastCol),
    listPlaylistTracks: listRows(PLAYLIST_TRACKS_SHEET_NAME, tracksLastCol),
    readPlaylistTracksHeaderRow: readHeaderRow(PLAYLIST_TRACKS_SHEET_NAME),
    appendPlaylistTrackRows: appendRows(PLAYLIST_TRACKS_SHEET_NAME),
    updatePlaylistTrackRows: updateRows(PLAYLIST_TRACKS_SHEET_NAME, tracksLastCol),
  };
}
