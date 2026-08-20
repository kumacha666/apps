// スプレッドシートの`index`/`sync`タブが存在しない場合に自動作成する（CONCEPT.md 4.3節）。
// 着手順の目安2（sheets.ts）・3（tagExtraction.ts結線）では、ユーザーが両タブ（`index`は
// ヘッダー行含む）を事前に手作業で用意していることが前提だった。このファイルはその手作業を
// 自動化する：スプレッドシート内の既存タブ一覧を確認し、無いタブだけを追加してヘッダー行を書く。
//
// 安全のため、内容が入っているタブには一切書き込まない（ヘッダー行・データ行のどちらかでも
// 値があれば「既存タブ」として扱う）。「index」という名前の無関係なタブが偶然存在するケース等で、
// ユーザーのデータを上書きするリスクを避けるため。ヘッダー行が想定と異なる既存タブへの対応は、
// main.tsのisValidIndexHeader()/isValidSyncHeader()によるエラー表示（従来通り）に委ねる。
//
// 例外：タブは存在するが完全に空（ヘッダー行・データ行のどちらも無い）の場合は、そのタブへの
// ヘッダー書き込みを試みる。addSheetTabは成功したがその直後のwriteHeaderRowが通信断等で
// 失敗した場合（2026-08-20 Codexレビュー指摘）、次回の起動時にタブが「存在するがヘッダー未設定」
// のまま永続し、以降のスキャンが毎回ヘッダー検証エラーで失敗し続けてしまう。空タブへの
// ヘッダー書き込みはデータ損失が起こりようがないため、この回復だけは安全に自動化できる。

import { createSheetsFetch, INDEX_SHEET_HEADER, INDEX_SHEET_NAME } from "./sheets";
import { SYNC_SHEET_NAME, SYNC_TAB_HEADER } from "./sync";

// スプレッドシートのタブ一覧確認・タブ追加・ヘッダー行書き込みをDIするインターフェース
// （drive.ts/sheets.tsと同じDI方針）。
export interface SpreadsheetSetupIO {
  listSheetTitles(): Promise<string[]>;
  // 指定したタイトルのタブを追加する。他クライアントが同じタイミングで同名タブを作成済みだった場合
  // （複数デバイスからの同時初回アクセス）、Sheets APIは重複タイトルをエラーとして拒否する。
  // 呼び出し元（ensureIndexAndSyncTabsExist）はこの例外を捕捉し、その時点のタブ一覧を再確認して
  // 対応する（CONCEPT.md 4.3節「複数デバイスからの同時編集」と同じ、事前防止ではなく事後確認の方針）。
  addSheetTab(title: string): Promise<void>;
  writeHeaderRow(sheetName: string, header: readonly (string | number)[]): Promise<void>;
  // タブの先頭付近（ヘッダー行・データ行を含む範囲）にまったく値が無いかを確認する。
  // 「自分たちが作ったが初期化未完了のタブ」と「既にデータが入っている無関係なタブ」を
  // 区別するための安全確認（上記コメント参照）。
  isTabEmpty(sheetName: string): Promise<boolean>;
}

async function ensureTabExists(
  io: SpreadsheetSetupIO,
  title: string,
  header: readonly (string | number)[],
  titles: Set<string>
): Promise<void> {
  if (titles.has(title)) {
    if (await io.isTabEmpty(title)) await io.writeHeaderRow(title, header);
    return;
  }
  try {
    await io.addSheetTab(title);
  } catch (err) {
    // 他クライアントが同時に同名タブを作成した可能性がある。最新のタブ一覧を再確認し、
    // 既に存在していれば（かつまだ空であれば）ヘッダーを書く。他クライアント側の
    // writeHeaderRowが既に完了していれば（空でなければ）上書きしない。
    const latestTitles = await io.listSheetTitles();
    if (latestTitles.includes(title)) {
      if (await io.isTabEmpty(title)) await io.writeHeaderRow(title, header);
      return;
    }
    throw err;
  }
  await io.writeHeaderRow(title, header);
}

// main.tsのhandleScan()から、書き込み権限確認の後・スキャン開始前に呼ぶ。
export async function ensureIndexAndSyncTabsExist(io: SpreadsheetSetupIO): Promise<void> {
  const titles = new Set(await io.listSheetTitles());
  await ensureTabExists(io, INDEX_SHEET_NAME, INDEX_SHEET_HEADER, titles);
  await ensureTabExists(io, SYNC_SHEET_NAME, SYNC_TAB_HEADER, titles);
}

function columnLetter(colNumber: number): string {
  let n = colNumber;
  let result = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

// SpreadsheetSetupIOの実実装。sheets.tsのcreateSheetsFetch（認証・リトライ共通）を再利用する。
export function createSpreadsheetSetupIO(spreadsheetId: string, getAccessToken: () => Promise<string>): SpreadsheetSetupIO {
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}`;
  const sheetsFetch = createSheetsFetch(spreadsheetId, getAccessToken);

  return {
    async listSheetTitles() {
      const res = await sheetsFetch(`${base}?fields=${encodeURIComponent("sheets.properties.title")}`);
      const data = (await res.json()) as { sheets?: { properties?: { title?: string } }[] };
      return (data.sheets ?? []).map((s) => s.properties?.title).filter((t): t is string => Boolean(t));
    },
    async addSheetTab(title) {
      await sheetsFetch(`${base}:batchUpdate`, {
        method: "POST",
        body: JSON.stringify({ requests: [{ addSheet: { properties: { title } } }] }),
      });
    },
    async writeHeaderRow(sheetName, header) {
      const lastCol = columnLetter(header.length);
      const range = `'${sheetName.replace(/'/g, "''")}'!A1:${lastCol}1`;
      await sheetsFetch(`${base}/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
        method: "PUT",
        body: JSON.stringify({ values: [header] }),
      });
    },
    async isTabEmpty(sheetName) {
      // A1:Z5：index（27列=AAまで）/sync（2列=Bまで）のどちらのヘッダー幅もカバーしつつ、
      // ヘッダー行だけでなく最初の数データ行まで見て「本当に何も無いか」を確認する。
      const range = `'${sheetName.replace(/'/g, "''")}'!A1:Z5`;
      const res = await sheetsFetch(`${base}/values/${encodeURIComponent(range)}`);
      const data = (await res.json()) as { values?: unknown[][] };
      return !data.values || data.values.length === 0;
    },
  };
}
