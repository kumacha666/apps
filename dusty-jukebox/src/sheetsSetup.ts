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
  // columnCount: 新規タブの列数を明示的に指定する。Sheets APIは`gridProperties`省略時に
  // 既定26列（A〜Z）でタブを作成するため、27列（AAまで）の`INDEX_SHEET_HEADER`を後続の
  // writeHeaderRowでそのまま書こうとすると「範囲がグリッドを超える」エラーになり、
  // 初回自動セットアップが永久に失敗し続ける（2026-08-20 Codexレビュー指摘）。
  addSheetTab(title: string, columnCount: number): Promise<void>;
  writeHeaderRow(sheetName: string, header: readonly (string | number)[]): Promise<void>;
  // タブの管理対象範囲（columnCount列 × 十分な行数）にまったく値が無いかを確認する。
  // 「自分たちが作ったが初期化未完了のタブ」と「既にデータが入っている無関係なタブ」を
  // 区別するための安全確認（上記コメント参照）。columnCountはこのタブに書く予定のヘッダー幅
  // （呼び出し元のheader.length）を渡す：狭い固定範囲だけを見ると、ヘッダー幅を超えた列や
  // 数行より下にあるデータを見逃して「空」と誤判定してしまう（2026-08-20 Codexレビュー指摘）。
  isTabEmpty(sheetName: string, columnCount: number): Promise<boolean>;
}

async function ensureTabExists(
  io: SpreadsheetSetupIO,
  title: string,
  header: readonly (string | number)[],
  titles: Set<string>
): Promise<void> {
  if (titles.has(title)) {
    if (await io.isTabEmpty(title, header.length)) await io.writeHeaderRow(title, header);
    return;
  }
  try {
    await io.addSheetTab(title, header.length);
  } catch (err) {
    // 他クライアントが同時に同名タブを作成した可能性がある。最新のタブ一覧を再確認し、
    // 既に存在していれば（かつまだ空であれば）ヘッダーを書く。他クライアント側の
    // writeHeaderRowが既に完了していれば（空でなければ）上書きしない。
    const latestTitles = await io.listSheetTitles();
    if (latestTitles.includes(title)) {
      if (await io.isTabEmpty(title, header.length)) await io.writeHeaderRow(title, header);
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
    async addSheetTab(title, columnCount) {
      await sheetsFetch(`${base}:batchUpdate`, {
        method: "POST",
        body: JSON.stringify({
          // gridProperties.columnCountを明示する（既定26列だと27列のindexヘッダーが入らない）。
          requests: [{ addSheet: { properties: { title, gridProperties: { columnCount } } } }],
        }),
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
    async isTabEmpty(sheetName, columnCount) {
      // ヘッダー幅（columnCount）の列全体を行数の上限を付けずに確認する（A1記法の開いた範囲
      // 'sheet'!A:<lastCol>は列全体・全行を指す）。固定の行数上限（例：1000行）だと、それより
      // 下の行にしかデータが無い既存タブを誤って「空」と判定してしまう（2026-08-20 Codexレビュー
      // 指摘：新規タブの既定行数=1000という前提は、既存タブの実際の行数を何ら保証しない）。
      // values.getは対象範囲が実際のグリッドより広くてもエラーにならない（書き込みと違い
      // 範囲外は単に無視される）ため、上限を付けなくても安全。
      const lastCol = columnLetter(columnCount);
      const range = `'${sheetName.replace(/'/g, "''")}'!A:${lastCol}`;
      const res = await sheetsFetch(`${base}/values/${encodeURIComponent(range)}`);
      const data = (await res.json()) as { values?: unknown[][] };
      return !data.values || data.values.length === 0;
    },
  };
}
