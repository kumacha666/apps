// `sync`タブ（アプリ共有設定・同期状態）の読み書き（CONCEPT.md 4.3節）。
// `key, value`の2列だけを持つ単純なキーバリュー表として、`startPageToken`・`rootFolderId`・
// `initialScanCompletedAt`の3行を管理する。sheets.tsのindexタブ用upsert（fileId起点）と同じ
// 「既存キーがあれば行を更新、無ければ追記」方針を、キー集合が固定・行数が少ない（3行）という
// 前提のもとで実装したもの。
//
// このファイルの範囲：sync タブの読み書き基盤と、CONCEPT.md 4.3節で確定している
// 「ルート変更時は3項目をまとめて書く」「初期化未完了中は既存トークンを使い回す」という
// 決定ロジックまで。changes.list による実際の差分同期の消費、初回スキャンのバッチ処理・
// 中断再開（ページ単位の進捗保存）、ルート変更後の旧ルート配下行の削除（リコンサイル）は
// 未実装のまま残す（apps/dusty-jukebox/CLAUDE.md参照）。

import { createSheetsFetch } from "./sheets";

export const SYNC_SHEET_NAME = "sync";
export const SYNC_TAB_HEADER = ["key", "value"] as const;

const SYNC_KEYS = ["startPageToken", "rootFolderId", "initialScanCompletedAt"] as const;
export type SyncKey = (typeof SYNC_KEYS)[number];

export interface SyncState {
  startPageToken?: string;
  rootFolderId?: string;
  initialScanCompletedAt?: string;
}

// syncタブへの実際の読み書きをDIするインターフェース（drive.ts/sheets.tsと同じ方針）。
// ヘッダー行（1行目）は含めない：readAllRowsはA2以降、rowNumberは1-indexedのシート行番号
// （sheets.tsのSheetsIndexIOと同じ規約）。
export interface SyncTabIO {
  readAllRows(): Promise<(string | number)[][]>;
  // ヘッダー行（1行目、A1:B1）をそのまま返す。sheets.tsのSheetsIndexIO.readHeaderRowと同じ理由：
  // 「syncという名前の無関係な既存タブ」をアプリの状態として誤って読み書きしてしまうのを防ぐため、
  // 呼び出し元（main.ts）は書き込み前にisValidSyncHeaderで検証する（2026-08-20 Codexレビュー指摘：
  // ensureIndexAndSyncTabsExistは既存タブに触れない設計だが、prepareSyncForScan自体はヘッダーを
  // 検証せずA2:Bをそのままアプリ状態として解釈・上書きしてしまっていた）。
  readHeaderRow(): Promise<(string | number)[]>;
  // 空配列（updates/appendsともに）ならAPIを呼ばない。
  writeRows(updates: { rowNumber: number; row: [string, string] }[], appends: [string, string][]): Promise<void>;
}

// sheets.tsのisValidIndexHeaderと同じ方針：ヘッダー行がSYNC_TAB_HEADERと完全一致することを確認する。
export function isValidSyncHeader(header: (string | number)[]): boolean {
  return header.length === SYNC_TAB_HEADER.length && header.every((v, i) => v === SYNC_TAB_HEADER[i]);
}

// rows（A2以降、[key, value]）をSyncStateへ変換する。空文字列は「未設定」として扱う
// （writeSyncEntriesでrootFolderId変更時にstartPageToken/initialScanCompletedAtを
// 空文字列で「クリア」する際、読み取り側もそれをundefined相当として扱う必要があるため）。
export function parseSyncState(rows: (string | number)[][]): SyncState {
  const state: SyncState = {};
  for (const row of rows) {
    const key = String(row[0] ?? "");
    const value = row[1] !== undefined && row[1] !== null ? String(row[1]) : "";
    if (!value) continue;
    if (key === "startPageToken") state.startPageToken = value;
    else if (key === "rootFolderId") state.rootFolderId = value;
    else if (key === "initialScanCompletedAt") state.initialScanCompletedAt = value;
  }
  return state;
}

// 指定したキーだけを更新する（未指定のキーの既存値はそのまま）。値に空文字列を渡すと
// そのキーを明示的にクリアする（CONCEPT.md 4.3節「rootFolderIdを変更したらinitialScanCompletedAtも
// クリアする」）。
async function writeSyncEntries(io: SyncTabIO, rows: (string | number)[][], entries: Partial<Record<SyncKey, string>>): Promise<void> {
  const rowNumberByKey = new Map<string, number>();
  rows.forEach((row, i) => {
    const key = String(row[0] ?? "");
    if (key) rowNumberByKey.set(key, i + 2); // 1行目はヘッダーのため、A2以降はi+2
  });

  const updates: { rowNumber: number; row: [string, string] }[] = [];
  const appends: [string, string][] = [];
  for (const key of SYNC_KEYS) {
    if (!(key in entries)) continue;
    const value = entries[key] ?? "";
    const rowNumber = rowNumberByKey.get(key);
    if (rowNumber !== undefined) {
      updates.push({ rowNumber, row: [key, value] });
    } else {
      appends.push([key, value]);
    }
  }
  await io.writeRows(updates, appends);
}

export interface PrepareSyncResult {
  startPageToken: string;
  // ルート変更（または初回のルート指定）を検知し、新しいstartPageTokenを取得・初期化状態を
  // クリアした場合true。main.ts側で「これは新しい初回スキャンである」ことの判定に使う。
  isNewRoot: boolean;
}

// スキャン開始前に呼ぶ。CONCEPT.md 4.3節の3つのルールを実装する：
// 1. rootFolderIdが変わった（または未設定）場合：新しいstartPageTokenを取得し、
//    rootFolderId・startPageToken・initialScanCompletedAtのクリアを1回にまとめて書く
// 2. 同じrootFolderIdでinitialScanCompletedAtが無い（初期化未完了）場合：新規取得せず
//    既存のstartPageTokenを使い回す（複数デバイスが初期化未完了中に別々のトークンを
//    取得し直すと、取得し直された側との間で変更が記録されず漏れるため）
// 3. 同じrootFolderIdでinitialScanCompletedAtがある場合：引き続き既存のstartPageTokenを使う
//    （changes.listによる実際の差分同期の消費は未実装のため、本PR時点ではこの分岐でも
//    main.ts は従来通りフルスキャンを行う。次PR以降、差分同期を実装する際にこの値を使う）
//
// 「旧ルート配下だった行の削除（リコンサイル）」はCONCEPT.md 4.3節が新規初回スキャン完了時の
// 仕上げとして定義しているが、本PRでは未実装（apps/dusty-jukebox/CLAUDE.md参照）。
export async function prepareSyncForScan(
  io: SyncTabIO,
  getNewStartPageToken: () => Promise<string>,
  requestedRootFolderId: string
): Promise<PrepareSyncResult> {
  const rows = await io.readAllRows();
  const state = parseSyncState(rows);

  if (state.rootFolderId !== requestedRootFolderId) {
    const newToken = await getNewStartPageToken();
    await writeSyncEntries(io, rows, {
      rootFolderId: requestedRootFolderId,
      startPageToken: newToken,
      initialScanCompletedAt: "",
    });
    return { startPageToken: newToken, isNewRoot: true };
  }

  if (state.startPageToken) {
    return { startPageToken: state.startPageToken, isNewRoot: false };
  }

  // rootFolderIdは記録済みだがstartPageTokenが無い異常系（書き込み途中の中断等）への
  // フォールバック。通常はrootFolderId書き込みと同時にstartPageTokenも書かれるため
  // 起こらないはずだが、安全のため新規取得して補う。
  const newToken = await getNewStartPageToken();
  await writeSyncEntries(io, rows, { startPageToken: newToken });
  return { startPageToken: newToken, isNewRoot: false };
}

// 初回スキャン（ページングによる一覧構築＋その後のchanges.list再生、CONCEPT.md 5節）が
// 最後まで完了した時点でmain.tsから呼ぶ。本PRのスキャンはchanges.list再生を行わない
// 「1回で最後まで処理する」実装のままのため、実際にはフルスキャン＋索引書き込みの成功をもって
// 完了とみなす（次PR以降、バッチ処理・中断再開を実装する際にこの呼び出しタイミングを見直す）。
export async function markInitialScanCompleted(io: SyncTabIO, completedAtIso: string): Promise<void> {
  const rows = await io.readAllRows();
  await writeSyncEntries(io, rows, { initialScanCompletedAt: completedAtIso });
}

// SyncTabIOの実実装。sheets.tsのcreateSheetsFetch（認証・リトライ共通）を再利用する。
export function createSyncTabIO(spreadsheetId: string, getAccessToken: () => Promise<string>): SyncTabIO {
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}`;
  const sheetsFetch = createSheetsFetch(spreadsheetId, getAccessToken);
  const range = (cell: string) => `'${SYNC_SHEET_NAME.replace(/'/g, "''")}'!${cell}`;

  return {
    async readAllRows() {
      const res = await sheetsFetch(`${base}/values/${encodeURIComponent(range("A2:B"))}`);
      const data = (await res.json()) as { values?: (string | number)[][] };
      return data.values ?? [];
    },
    async readHeaderRow() {
      const res = await sheetsFetch(`${base}/values/${encodeURIComponent(range("A1:B1"))}`);
      const data = (await res.json()) as { values?: (string | number)[][] };
      return data.values?.[0] ?? [];
    },
    async writeRows(updates, appends) {
      if (updates.length > 0) {
        await sheetsFetch(`${base}/values:batchUpdate`, {
          method: "POST",
          body: JSON.stringify({
            valueInputOption: "RAW",
            data: updates.map(({ rowNumber, row }) => ({
              range: range(`A${rowNumber}:B${rowNumber}`),
              values: [row],
            })),
          }),
        });
      }
      if (appends.length > 0) {
        // sheets.tsのappendRowsと同じ理由でリトライしない（POSTは非冪等：応答受信時だけ通信が
        // 切れた場合、サーバー側では追記が成功している可能性があり、再試行すると同じキーの行が
        // 二重に追記されてしまう）。
        await sheetsFetch(
          `${base}/values/${encodeURIComponent(range("A1"))}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
          { method: "POST", body: JSON.stringify({ values: appends }) },
          false
        );
      }
    },
  };
}
