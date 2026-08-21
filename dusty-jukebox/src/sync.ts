// `sync`タブ（アプリ共有設定・同期状態）の読み書き（CONCEPT.md 4.3節）。
// `key, value`の2列だけを持つ単純なキーバリュー表として、`startPageToken`・`rootFolderId`・
// `initialScanCompletedAt`・`scanRunId`（着手順の目安5、バッチ処理・中断再開のウォーターマーク）
// の4行を管理する。sheets.tsのindexタブ用upsert（fileId起点）と同じ「既存キーがあれば行を
// 更新、無ければ追記」方針を、キー集合が固定・行数が少ない（4行）という前提のもとで実装したもの。
//
// このファイルの範囲：sync タブの読み書き基盤、CONCEPT.md 4.3節で確定している
// 「ルート変更時は3項目をまとめて書く」「初期化未完了中は既存トークンを使い回す」という
// 決定ロジック、着手順の目安5のscanRunId管理に加え、着手順の目安4の残り（changes.list消費）向けの
// hasCompletedInitialScan判定・advanceStartPageTokenまで。changes.list自体の呼び出し・
// リコンサイルの実際の判定ロジックはdrive.ts/sheets.ts/differentialSync.ts（main.tsから結線）
// を参照（apps/dusty-jukebox/CLAUDE.md参照）。

import { columnLetter, createSheetsFetch, type IndexRowScanState } from "./sheets";

export const SYNC_SHEET_NAME = "sync";
export const SYNC_TAB_HEADER = ["key", "value"] as const;

const SYNC_KEYS = ["startPageToken", "rootFolderId", "initialScanCompletedAt", "scanRunId"] as const;
export type SyncKey = (typeof SYNC_KEYS)[number];

export interface SyncState {
  startPageToken?: string;
  rootFolderId?: string;
  initialScanCompletedAt?: string;
  // 着手順の目安5（初回スキャンのバッチ処理・中断再開）向けの、進行中スキャン実行を識別する
  // 不透明なID（時刻ではなくランダム文字列、2026-08-21 Codexレビュー指摘：P1で時刻ベースの
  // ウォーターマークから変更。複数デバイスの時計ずれがあると時刻の大小比較では「今回の実行で
  // 処理済みか」を誤判定しうるため）。main.tsはこの値をindexタブの各行のscanRunId列と
  // 完全一致するかどうかで「今回の実行（過去のバッチ、または中断前のセッション）で既に
  // 処理済みか」を判定する（sheets.tsのindexRowsScanState参照）。スキャン実行が最後まで
  // 完了したらclearScanRunIdで空文字列に戻す（次回のスキャンクリックが新しい実行として
  // 扱われるようにするため）。
  scanRunId?: string;
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
//
// 同じキーの行が複数存在する場合、最後（シート上で最も下）の行を常に採用する（空文字列の
// 「クリア」行を含む）。2026-08-21 Codexレビュー指摘（P1）：以前は空文字列の行を
// 読み飛ばしていたため、「同じキーの行がまだ無い状態で2台のデバイスがほぼ同時に初回作成した
// 重複行」をclearScanRunId等が後から空文字列で更新しても、より上にある古い非空の重複行が
// 生き残ってしまい、クリアされたはずのウォーターマークが復活し続けていた（writeSyncEntriesの
// rowNumberByKeyも同じ「最後の行を採用」規則で該当行を特定するため、こう変更しても
// 書き込み先と整合する）。同じ理由でキーのみ空の行（空行等）はスキップする。
//
// SYNC_KEYSに対してswitch+default: neverで網羅性を保証する（AI開発ルール4）。以前はif/else if
// チェーンで個々のキー名をハードコードしており、SYNC_KEYSに新しいキーを追加してもコンパイル
// エラーにならず、この関数だけ更新を忘れてもビルドが通ってしまっていた（2026-08-20 /code-review
// 指摘：writeSyncEntriesはSYNC_KEYSを反復するため網羅的だが、この関数だけ非対称だった）。
export function parseSyncState(rows: (string | number)[][]): SyncState {
  const byKey = new Map<string, string>();
  for (const row of rows) {
    const key = String(row[0] ?? "");
    if (!key) continue;
    const value = row[1] !== undefined && row[1] !== null ? String(row[1]) : "";
    byKey.set(key, value); // 空文字列でも常に上書きする（tombstone、上記コメント参照）
  }

  const state: SyncState = {};
  for (const key of SYNC_KEYS) {
    const value = byKey.get(key);
    if (!value) continue; // 未設定・空文字列（クリア済み）はどちらもundefined相当として扱う
    switch (key) {
      case "startPageToken":
        state.startPageToken = value;
        break;
      case "rootFolderId":
        state.rootFolderId = value;
        break;
      case "initialScanCompletedAt":
        state.initialScanCompletedAt = value;
        break;
      case "scanRunId":
        state.scanRunId = value;
        break;
      default: {
        const _exhaustive: never = key;
        throw new Error(`unknown sync key: ${String(_exhaustive)}`);
      }
    }
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

// 着手順の目安5（初回スキャンのバッチ処理・中断再開）向け：あるファイルが今回のスキャン実行
// （scanRunId）で既に処理済みかどうかを判定する。main.tsのpendingEntriesフィルタが
// これに直書きされていたため、比較演算子の書き間違い（<を<=にする等）を検知するテストが
// 存在しなかった（2026-08-20 /code-review指摘：AI開発ルール1、ビジネスロジックの変更には
// ユニットテストが必要）。純粋関数として切り出し、main.tsからもテストからも同じ実装を使う。
//
// 2026-08-21、Codexレビュー指摘で判定方式を変更：
// - P1: 既存行のscanRunIdが現在のscanRunIdと完全一致する場合のみ「処理済み」とする（時刻の
//   大小比較はしない）。旧実装（lastScannedAt<scanRunStartedAtの時刻比較）は複数デバイスの
//   時計ずれで誤判定しうる：時計が進んだ端末が書いたlastScannedAtは、時計が遅い端末が新規
//   発行したウォーターマークより後に見えてしまい、実際には未処理のファイルを処理済みと
//   誤認してスキップしてしまう（逆方向のずれでは再開のたびに無駄な再処理が起こる）。
//   不透明なランダムID同士の完全一致であれば、端末間の時計のずれに影響されない。
// - P2: scanRunIdが一致していても、そのファイルのDrive側driveModifiedTimeが既存行の
//   記録値と異なる場合（＝あるバッチの書き込み後、残りのスキャンが中断している間にDrive上で
//   そのファイルが更新された場合）は、ウォーターマークに関わらず再処理対象に戻す。
export function isPendingForScanRun(existing: IndexRowScanState | undefined, currentScanRunId: string, currentDriveModifiedTime: string): boolean {
  if (!existing) return true;
  if (existing.scanRunId !== currentScanRunId) return true;
  return existing.driveModifiedTime !== currentDriveModifiedTime;
}

export interface PrepareSyncResult {
  startPageToken: string;
  // このスキャン実行を識別する不透明なID（着手順の目安5）。新規実行なら今回発行した
  // ランダムID、前回の実行が完走せず中断していた場合はその実行のIDを再利用する。
  scanRunId: string;
  // rootFolderIdが変わっていない、かつ前回のinitialScanCompletedAtが記録済み（＝直近の
  // 初回スキャンが最後まで完了している）場合のみtrue。main.tsはこれを見て、フォルダ全体の
  // 再帰走査（フルスキャン）ではなくchanges.list消費による差分同期に進む
  // （着手順の目安4の残り、differentialSync.ts参照）。
  hasCompletedInitialScan: boolean;
}

function defaultNewRunId(): string {
  return crypto.randomUUID();
}

// スキャン開始前に呼ぶ。CONCEPT.md 4.3節の3つのルールに加え、着手順の目安5（バッチ処理・
// 中断再開）のためのscanRunId管理を実装する：
// 1. rootFolderIdが変わった（または未設定）場合：新しいstartPageTokenを取得し、
//    rootFolderId・startPageToken・initialScanCompletedAtのクリア・新しいscanRunIdを
//    1回にまとめて書く（ルートが変わった以上、以前の実行の処理済みウォーターマークは無関係）
// 2. 同じrootFolderIdでinitialScanCompletedAtが無い（初期化未完了）場合：新規取得せず
//    既存のstartPageTokenを使い回す（複数デバイスが初期化未完了中に別々のトークンを
//    取得し直すと、取得し直された側との間で変更が記録されず漏れるため）
// 3. 同じrootFolderIdでinitialScanCompletedAtがある場合：引き続き既存のstartPageTokenを使う。
//    戻り値のhasCompletedInitialScanがtrueになり、main.tsはこの値からchanges.listで差分を
//    消費する（フルスキャンはしない、differentialSync.ts参照）
// 2・3のどちらでも、scanRunIdが既に設定されていれば（前回の初回スキャン実行が完走せず
// 中断していたことを意味する）そのまま再利用し、無ければ新しいIDを新規実行として書き込む
// （差分同期モード自体はscanRunIdのバッチ・中断再開ウォーターマークを使わない）。
//
// 「旧ルート配下だった行の削除（リコンサイル）」（CONCEPT.md 4.3節）は、新しい初回スキャン
// 完了時の仕上げとしてmain.tsから呼ぶのに加え、差分同期中にフォルダの変更イベントを検知した
// 場合の安全網としても使う（sheets.tsのreconcileIndexAgainstRoot、differentialSync.ts参照）。
export async function prepareSyncForScan(
  io: SyncTabIO,
  getNewStartPageToken: () => Promise<string>,
  requestedRootFolderId: string,
  newRunId: () => string = defaultNewRunId
): Promise<PrepareSyncResult> {
  const rows = await io.readAllRows();
  const state = parseSyncState(rows);

  if (state.rootFolderId !== requestedRootFolderId) {
    const newToken = await getNewStartPageToken();
    const scanRunId = newRunId();
    await writeSyncEntries(io, rows, {
      rootFolderId: requestedRootFolderId,
      startPageToken: newToken,
      initialScanCompletedAt: "",
      scanRunId,
    });
    return { startPageToken: newToken, scanRunId, hasCompletedInitialScan: false };
  }

  if (state.startPageToken) {
    // ルート不変・initialScanCompletedAtが記録済みなら、前回の初回スキャンは最後まで
    // 完了している。scanRunIdの有無（次の分岐）は初回スキャンのバッチ処理・中断再開専用の
    // 状態のため、差分同期に進めるかどうかの判定には関係しない。
    const hasCompletedInitialScan = Boolean(state.initialScanCompletedAt);
    if (state.scanRunId) {
      return { startPageToken: state.startPageToken, scanRunId: state.scanRunId, hasCompletedInitialScan };
    }
    const scanRunId = newRunId();
    await writeSyncEntries(io, rows, { scanRunId });
    return { startPageToken: state.startPageToken, scanRunId, hasCompletedInitialScan };
  }

  // rootFolderIdは記録済みだがstartPageTokenが無い異常系（書き込み途中の中断等）への
  // フォールバック。通常はrootFolderId書き込みと同時にstartPageTokenも書かれるため
  // 起こらないはずだが、安全のため新規取得して補う。initialScanCompletedAtが記録されようが
  // 無かろうがstartPageToken自体が失われている以上、差分同期の前提（消費開始点）が無いため
  // 必ずフルスキャンからやり直す。
  const newToken = await getNewStartPageToken();
  const scanRunId = state.scanRunId || newRunId();
  await writeSyncEntries(io, rows, { startPageToken: newToken, scanRunId });
  return { startPageToken: newToken, scanRunId, hasCompletedInitialScan: false };
}

// 1回のスキャン実行（全バッチ）が最後まで完走した後にmain.tsから呼ぶ。scanRunIdを
// クリアすることで、次回のスキャンクリックを新しい実行として扱う（＝新しいウォーターマークで
// 全ファイルを対象にする）。markInitialScanCompletedと同様、直前に現在のsync状態と照合し
// 一致する場合のみ書き込む（長時間のスキャン中に別デバイスがルートを切り替えていた場合、
// この実行とは無関係になったウォーターマークを誤ってクリアしないため）。
//
// expected.scanRunIdも照合する（2026-08-20 Codexレビュー指摘：P2）。rootFolderId・
// startPageTokenだけの一致では、同じルート・同じトークンのまま別デバイスが新しい実行を
// 開始し新しいscanRunIdを書き込んでいた場合（ルート変更を伴わないため両方とも
// 変わらない）を区別できず、この呼び出しが誤ってその新しい実行のウォーターマークを
// クリアしてしまう。その新しい実行が完走前に中断すると、次回は実行IDを再利用できず
// 中断・再開の効果が失われる（本アプリの明記された挙動）ため、このスキャン実行が確保した
// scanRunId自体と現在値が一致する場合のみクリアする。
export async function clearScanRunId(
  io: SyncTabIO,
  expected: { rootFolderId: string; startPageToken: string; scanRunId: string }
): Promise<void> {
  const rows = await io.readAllRows();
  const state = parseSyncState(rows);
  if (
    state.rootFolderId !== expected.rootFolderId ||
    state.startPageToken !== expected.startPageToken ||
    state.scanRunId !== expected.scanRunId
  ) {
    return;
  }
  await writeSyncEntries(io, rows, { scanRunId: "" });
}

// 初回スキャン（ページングによる一覧構築＋その後のchanges.list再生、CONCEPT.md 5節）が
// 最後まで完了した時点でmain.tsから呼ぶ。本PRのスキャンはchanges.list再生を行わない
// 「1回で最後まで処理する」実装のままのため、実際にはフルスキャン＋索引書き込みの成功をもって
// 完了とみなす（次PR以降、バッチ処理・中断再開を実装する際にこの呼び出しタイミングを見直す）。
//
// expected: このスキャンを開始する際にprepareSyncForScanから得たrootFolderId/startPageToken。
// 完了記録の直前に現在のsync状態と照合し、一致する場合のみ書き込む（2026-08-20 Codexレビュー
// 指摘）：長時間のスキャン中に別デバイスがrootFolderIdを切り替えた場合、無条件に書き込むと
// このスキャンとは無関係な（切り替え後の）ルートを誤って「完了」扱いにしてしまう。切り替え後の
// ルートは実際には誰もスキャンしていないため、この誤記録によって将来の差分同期がそのルート配下の
// 未索引ファイルを恒久的に取りこぼす。不一致の場合は書き込みをスキップする（このスキャンの結果は
// 索引タブへは既に反映済みのため無駄にはならないが、sync状態としての「完了」記録だけは見送られる）。
export async function markInitialScanCompleted(
  io: SyncTabIO,
  completedAtIso: string,
  expected: { rootFolderId: string; startPageToken: string }
): Promise<void> {
  const rows = await io.readAllRows();
  const state = parseSyncState(rows);
  if (state.rootFolderId !== expected.rootFolderId || state.startPageToken !== expected.startPageToken) {
    return;
  }
  await writeSyncEntries(io, rows, { initialScanCompletedAt: completedAtIso });
}

// 着手順の目安4の残り（changes.list消費）：差分同期がstartPageTokenから最後まで消費し終えた後に
// main.tsから呼ぶ。消費済みのstartPageTokenを、changes.listが返したnewStartPageTokenへ進める。
// markInitialScanCompleted/clearScanRunIdと同じTOCTOU対策：直前に確保したrootFolderId/
// startPageToken（＝差分同期を開始した時点の状態）と現在のsync状態を照合し、一致する場合のみ
// 書き込む。長時間の差分同期中に別デバイスがルートを切り替えていた場合、無関係になった
// （切り替え後のルートとは別の）トークンを誤って進めないため（不一致時は静かにスキップする：
// 切り替え後のルートは既にprepareSyncForScanのルート変更分岐で新しいstartPageTokenを
// 取得・保存済みのため、ここで書き込みをスキップしても問題にならない）。
export async function advanceStartPageToken(
  io: SyncTabIO,
  newStartPageToken: string,
  expected: { rootFolderId: string; startPageToken: string }
): Promise<void> {
  const rows = await io.readAllRows();
  const state = parseSyncState(rows);
  if (state.rootFolderId !== expected.rootFolderId || state.startPageToken !== expected.startPageToken) {
    return;
  }
  await writeSyncEntries(io, rows, { startPageToken: newStartPageToken });
}

// SyncTabIOの実実装。sheets.tsのcreateSheetsFetch（認証・リトライ共通）を再利用する。
export function createSyncTabIO(spreadsheetId: string, getAccessToken: () => Promise<string>): SyncTabIO {
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}`;
  const sheetsFetch = createSheetsFetch(spreadsheetId, getAccessToken);
  const range = (cell: string) => `'${SYNC_SHEET_NAME.replace(/'/g, "''")}'!${cell}`;
  // 列境界をSYNC_TAB_HEADER.lengthから動的に導出する（2026-08-20 /code-review指摘：以前は
  // "B"固定だったため、将来SYNC_TAB_HEADERに列が増えた場合、増えた列だけ静かに読み書きされなくなる
  // 潜在的な脆さがあった。sheets.ts/sheetsSetup.tsのindexタブと同じ方針に揃える）。
  const lastCol = columnLetter(SYNC_TAB_HEADER.length);

  return {
    async readAllRows() {
      const res = await sheetsFetch(`${base}/values/${encodeURIComponent(range(`A2:${lastCol}`))}`);
      const data = (await res.json()) as { values?: (string | number)[][] };
      return data.values ?? [];
    },
    async readHeaderRow() {
      // 列範囲を明示しない行全体記法（`1:1`）を使う。sheets.tsのSheetsIndexIO.readHeaderRowと
      // 同じ理由：列範囲をSYNC_TAB_HEADER.length分に固定すると、対象タブの実際のグリッド列数が
      // それより狭い場合にSheets APIの「範囲がグリッドを超える」エラーになる。現時点では
      // SYNC_TAB_HEADERが2列固定のため（Sheets既定の26列を下回り）実際には起きないが、
      // indexタブと同じ脆さのクラスを将来また踏まないよう揃えておく（2026-08-20 /code-review指摘）。
      const res = await sheetsFetch(`${base}/values/${encodeURIComponent(range("1:1"))}`);
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
              range: range(`A${rowNumber}:${lastCol}${rowNumber}`),
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
