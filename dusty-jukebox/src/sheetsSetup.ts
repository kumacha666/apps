// スプレッドシートの`index`/`sync`タブが存在しない場合に自動作成する（CONCEPT.md 4.3節）。
// 着手順の目安2（sheets.ts）・3（tagExtraction.ts結線）では、ユーザーが両タブ（`index`は
// ヘッダー行含む）を事前に手作業で用意していることが前提だった。このファイルはその手作業を
// 自動化する：スプレッドシート内の既存タブ一覧を確認し、無いタブだけを追加してヘッダー行を書く。
//
// 安全のため、内容が入っているタブには一切書き込まない（ヘッダー行・データ行のどちらかでも
// 値があれば「既存タブ」として扱う）。「index」という名前の無関係なタブが偶然存在するケース等で、
// ユーザーのデータを上書きするリスクを避けるため。
//
// タブが既に存在する場合、ここでは中身を一切検査しない（`isTabEmpty`は呼ばない）。中身の検査は
// `values.get`で対象範囲全体（indexタブなら最大10235行規模、CLAUDE.md参照）を読む比較的重い
// 呼び出しのため、以前はこの関数内で「既存タブなら毎回空かどうか確認する」実装にしていたが、
// それだと定常状態（両タブとも既に有効な内容を持つ）のスキャンのたびに、後続の`readHeaderRow`
// （ヘッダー行1行だけを読む軽い呼び出し）で十分なはずの検証に加えて、この重い呼び出しを
// 無条件に払うことになっていた（2026-08-20 /code-review指摘）。
// タブが存在するが空（addSheetTab成功後にwriteHeaderRowだけ失敗して中断したケース等）の回復は
// `ensureValidHeader`（下記）が、`main.ts`側のヘッダー検証が実際に失敗した場合にのみ行う
// フォールバックとして引き受ける。定常状態のスキャンでは一切呼ばれない。

import { columnLetter, createSheetsFetch, INDEX_SHEET_HEADER, INDEX_SHEET_NAME, isLegacyIndexHeaderV1, isLegacyIndexHeaderV2 } from "./sheets";
import { SYNC_SHEET_NAME, SYNC_TAB_HEADER } from "./sync";
import { PLAYLISTS_SHEET_HEADER, PLAYLISTS_SHEET_NAME, PLAYLIST_TRACKS_SHEET_HEADER, PLAYLIST_TRACKS_SHEET_NAME } from "./playlists";
import { FOLDERS_SHEET_HEADER, FOLDERS_SHEET_NAME } from "./folderCache";

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
  // タブ全体（全列・全行）にまったく値が無いかを確認する。「自分たちが作ったが初期化未完了の
  // タブ」と「既にデータが入っている無関係なタブ」を区別するための安全確認。以前は呼び出し元の
  // ヘッダー幅（例：indexなら27列）に限定した範囲しか見ていなかったため、無関係な既存タブの
  // データがその列範囲より外（例：indexならAB列以降、syncならC列以降）にしか無い場合、
  // 誤って「空」と判定してアプリのヘッダーで上書きしてしまう恐れがあった（2026-08-20
  // Codexレビュー指摘：行数上限の修正では列幅の限定は解消されていなかった）。列範囲を
  // 限定せずタブ全体を確認するよう修正。呼び出しコストが比較的重いため、`ensureValidHeader`の
  // フォールバック経路でのみ呼ばれる（上記コメント参照）。
  isTabEmpty(sheetName: string): Promise<boolean>;
  // 指定タブのグリッド列数がcolumnCount未満であれば拡張する（既にcolumnCount以上ならAPIを呼ばない）。
  // 旧バージョン（27列）のindexタブを新スキーマ（45列）へマイグレーションする際、ヘッダー行の
  // 書き込み範囲がグリッドの列数を超えると「範囲がグリッドを超える」エラーになるため、
  // writeHeaderRowの前に呼ぶ必要がある（migrateLegacyIndexHeaderV1参照）。
  expandColumnCount(sheetName: string, columnCount: number): Promise<void>;
}

async function ensureTabExists(io: SpreadsheetSetupIO, title: string, header: readonly (string | number)[], titles: Set<string>): Promise<void> {
  if (titles.has(title)) return; // 既存タブには一切触れない（中身の検証・回復はensureValidHeaderに委ねる）
  try {
    await io.addSheetTab(title, header.length);
  } catch (err) {
    // 他クライアントが同時に同名タブを作成した可能性がある。最新のタブ一覧を再確認し、
    // 既に存在していればヘッダー書き込みを譲って何もしない（そちらが書いたヘッダーを
    // 上書きしない。ヘッダーがまだ書かれていない場合の回復もensureValidHeaderに委ねる）。
    const latestTitles = await io.listSheetTitles();
    if (latestTitles.includes(title)) return;
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

// 保存済みプレイリスト機能（playlists.ts）専用。ensureIndexAndSyncTabsExistと同じ「既存タブには
// 一切触れない」方針だが、index/syncタブとは呼び出しタイミングが異なる（スキャン開始前ではなく、
// ユーザーが初めてプレイリスト機能を使おうとした時点でmain.tsから呼ぶ）ため独立した関数にする。
export async function ensurePlaylistsTabsExist(io: SpreadsheetSetupIO): Promise<void> {
  const titles = new Set(await io.listSheetTitles());
  await ensureTabExists(io, PLAYLISTS_SHEET_NAME, PLAYLISTS_SHEET_HEADER, titles);
  await ensureTabExists(io, PLAYLIST_TRACKS_SHEET_NAME, PLAYLIST_TRACKS_SHEET_HEADER, titles);
}

// フォルダ名キャッシュ（folderCache.ts）専用。index/syncタブと同じ「既存タブには一切触れない」
// 方針だが、呼び出しタイミングが異なる（スキャン完了時、フォルダエントリを実際に書き込む
// 直前にmain.tsから呼ぶ）ため独立した関数にする。起動時間短縮のための最適化キャッシュであり、
// 呼び出し元は失敗してもスキャン自体を失敗させない想定（main.ts参照）。
export async function ensureFoldersTabExists(io: SpreadsheetSetupIO): Promise<void> {
  const titles = new Set(await io.listSheetTitles());
  await ensureTabExists(io, FOLDERS_SHEET_NAME, FOLDERS_SHEET_HEADER, titles);
}

// ヘッダー行を読んで検証する、というensureIndexAndSyncTabsExist呼び出し後にindex/syncタブ
// それぞれで必要になる処理（旧handleScan()に2回ほぼ同じ形で書かれていた、2026-08-20
// /code-review指摘）を1つにまとめたもの。無効だった場合、そのタブが完全に空（addSheetTab
// 成功後にwriteHeaderRowが失敗して中断した、または他クライアントが同時に作成したがヘッダーは
// まだ書いていない）ならヘッダーを書いて回復を試み、再検証する。それでも無効なら例外を投げる。
export interface HeaderCheckIO {
  readHeaderRow(): Promise<(string | number)[]>;
}

export async function ensureValidHeader(
  headerIO: HeaderCheckIO,
  setupIO: SpreadsheetSetupIO,
  sheetName: string,
  expectedHeader: readonly (string | number)[],
  isValid: (header: (string | number)[]) => boolean,
  // ヘッダーが無効だった場合に先に試す、スキーマ移行のためのフック（例：旧バージョンの
  // indexタブヘッダーを新スキーマへ書き換えるmigrateLegacyIndexHeaderV1）。「タブが真に空」
  // フォールバックとは独立した経路で、データが入っている既存タブ（＝isTabEmptyがfalseを
  // 返すタブ）でも対象になりうる。移行を行った場合はtrueを返す。
  migrateLegacy?: (header: (string | number)[]) => Promise<boolean>
): Promise<void> {
  let header = await headerIO.readHeaderRow();
  if (!isValid(header) && migrateLegacy && (await migrateLegacy(header))) {
    header = await headerIO.readHeaderRow();
  }
  if (!isValid(header) && (await setupIO.isTabEmpty(sheetName))) {
    // writeHeaderRowはexpectedHeader.length分の列範囲（例：indexなら A1:AS1）へPUTするため、
    // タブのグリッドがそれより狭い（例：ユーザーが手作業で作った既定26列の空タブ、または
    // 他デバイスが今回のexpectedHeaderより古いバージョンのcolumnCountで作成した空タブ）場合、
    // 「範囲がグリッドを超える」エラーになる。migrateLegacyIndexHeaderV1が旧ヘッダー移行の
    // 際に行っているのと同じグリッド拡張をここでも先に行う必要がある（2026-08-20
    // /code-review指摘：readHeaderRowの同種バグ修正がこちらの回復経路には波及していなかった）。
    await setupIO.expandColumnCount(sheetName, expectedHeader.length);
    await setupIO.writeHeaderRow(sheetName, expectedHeader);
    header = await headerIO.readHeaderRow();
  }
  if (!isValid(header)) {
    throw new Error(
      `索引スプレッドシートの「${sheetName}」タブのヘッダー行が想定と一致しません。スプレッドシートIDが正しいか、無関係な「${sheetName}」タブが既に存在していないかご確認ください。`
    );
  }
}

// 旧バージョン（27列、2026-08-20の重複行マージ実装より前）のindexタブヘッダーを検出し、
// グリッドを45列へ拡張したうえで新ヘッダーを書き込むマイグレーション（2026-08-20 Codexレビュー
// 指摘：P1、この移行が無いと既存の27列indexタブが次回スキャン時に永久にヘッダー不一致
// エラーでブロックされ続ける）。既存のデータ行（A2以降）には一切触れない：新設列は
// 空欄のまま残るが、sheets.tsのbuildIndexRow/upsertIndexRowsは空欄を「オーバーライド無し」
// 「競合なし」の初期値と同じ意味で扱うため、読み取り側の解釈に影響しない。
export async function migrateLegacyIndexHeaderV1(setupIO: SpreadsheetSetupIO, header: (string | number)[]): Promise<boolean> {
  if (!isLegacyIndexHeaderV1(header)) return false;
  await setupIO.expandColumnCount(INDEX_SHEET_NAME, INDEX_SHEET_HEADER.length);
  await setupIO.writeHeaderRow(INDEX_SHEET_NAME, INDEX_SHEET_HEADER);
  return true;
}

// 2026-08-21追加のscanRunId列（1列、着手順の目安5のバッチ再開判定をクロックスキュー耐性の
// ある実行IDベースへ変更したことに伴う追加、Codexレビュー指摘P1）より前の、旧バージョン
// （45列、2026-08-20の重複行マージ実装時点のスキーマ）のindexタブヘッダーを検出し、
// migrateLegacyIndexHeaderV1と同じ方針でグリッド拡張＋新ヘッダー書き込みを行う。
// 既存のデータ行には一切触れない：新設したscanRunId列は空欄のままだが、main.tsの
// pending判定は「空欄 !== 現在のscanRunId」として扱うため、既存行は次回スキャンで
// 通常通り再処理対象になる（読み取り側の解釈に影響しない）。
export async function migrateLegacyIndexHeaderV2(setupIO: SpreadsheetSetupIO, header: (string | number)[]): Promise<boolean> {
  if (!isLegacyIndexHeaderV2(header)) return false;
  await setupIO.expandColumnCount(INDEX_SHEET_NAME, INDEX_SHEET_HEADER.length);
  await setupIO.writeHeaderRow(INDEX_SHEET_NAME, INDEX_SHEET_HEADER);
  return true;
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
    async isTabEmpty(sheetName) {
      // 列・行どちらの上限も付けず、シート名だけを範囲として指定する（Sheets APIの仕様として、
      // セル参照を付けずシート名のみを渡すとそのタブの全データを返す）。以前は呼び出し元の
      // ヘッダー幅（例：indexなら27列）に列範囲を限定していたが、無関係な既存タブのデータが
      // その範囲より外の列にしか無い場合に誤って「空」と判定してしまう恐れがあった
      // （2026-08-20 Codexレビュー指摘）。
      const range = `'${sheetName.replace(/'/g, "''")}'`;
      const res = await sheetsFetch(`${base}/values/${encodeURIComponent(range)}`);
      const data = (await res.json()) as { values?: unknown[][] };
      return !data.values || data.values.length === 0;
    },
    async expandColumnCount(sheetName, columnCount) {
      const res = await sheetsFetch(
        `${base}?fields=${encodeURIComponent("sheets.properties(sheetId,title,gridProperties.columnCount)")}`
      );
      const data = (await res.json()) as {
        sheets?: { properties?: { sheetId?: number; title?: string; gridProperties?: { columnCount?: number } } }[];
      };
      const sheet = (data.sheets ?? []).find((s) => s.properties?.title === sheetName);
      const sheetId = sheet?.properties?.sheetId;
      if (sheetId === undefined) throw new Error(`シート「${sheetName}」が見つかりません`);
      const currentColumnCount = sheet?.properties?.gridProperties?.columnCount ?? 0;
      if (currentColumnCount >= columnCount) return; // 既に十分な列数がある場合はAPIを呼ばない
      await sheetsFetch(`${base}:batchUpdate`, {
        method: "POST",
        body: JSON.stringify({
          requests: [
            {
              updateSheetProperties: {
                properties: { sheetId, gridProperties: { columnCount } },
                fields: "gridProperties.columnCount",
              },
            },
          ],
        }),
      });
    },
  };
}
