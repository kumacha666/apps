// エントリポイント。着手順の目安4の一部: sync タブ基盤（startPageToken/rootFolderId/
// initialScanCompletedAt）とindexタブ／syncタブの初回自動作成を結線した。初回スキャンの
// バッチ処理・中断再開（ページ単位の進捗保存）・changes.listによる実際の差分同期・
// 索引upsertの重複行マージ・絞り込み/再生UIは引き続き未着手（dusty-jukebox/CLAUDE.md参照）。
// このPRのスキャンは引き続き「見つかった全ファイルを1回で最後まで処理する」素朴な実装で、途中で
// タブを閉じる／通信が長時間切れる等での中断・再開には対応しない。
import { AuthError, DriveAuth } from "./auth";
import {
  createDriveCapabilitiesGetFn,
  createDriveFetchRange,
  createDriveGetFn,
  createDriveListFn,
  createGetStartPageTokenFn,
  listAudioFilesRecursive,
  validateRootFolder,
  isAuthError,
  type AudioFileEntry,
} from "./drive";
import { extractAndBuildIndexEntries } from "./tagExtraction";
import { createSheetsIndexIO, isValidIndexHeader, upsertIndexRows, SheetsHttpError, INDEX_SHEET_NAME } from "./sheets";
import { ensureIndexAndSyncTabsExist, createSpreadsheetSetupIO } from "./sheetsSetup";
import { createSyncTabIO, isValidSyncHeader, markInitialScanCompleted, prepareSyncForScan, SYNC_SHEET_NAME } from "./sync";

// drive.tsのisAuthError()（AuthError・DriveHttpError(401)）に加え、main.tsではSheets側の
// 401（書き込み先検証・upsert時）も同じ「トークンはもう使えない」判定に含める必要がある
// （2026-08-20 /code-review指摘：この判定が複数ファイルに独立コピーされていたため、
// Drive/Auth関連の判定はdrive.tsのisAuthError()を唯一の情報源として合成する）
function isAuthFailure(err: unknown): boolean {
  return isAuthError(err) || (err instanceof SheetsHttpError && err.status === 401);
}

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

const auth = new DriveAuth();

function el<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`#${id} not found`);
  return found as T;
}

function render(): void {
  const app = el<HTMLDivElement>("app");
  app.innerHTML = `
    <h1>DustyJukebox</h1>
    <p class="lead">Googleドライブの音源ライブラリを索引化する準備段階です。</p>
    ${
      CLIENT_ID
        ? `
      <label class="field">
        <span>スキャン対象フォルダID</span>
        <input id="folder-id" type="text" placeholder="Google DriveのフォルダURLの末尾" />
      </label>
      <label class="field">
        <span>索引スプレッドシートID（indexタブ＋ヘッダー行を事前に作成済みのもの）</span>
        <input id="spreadsheet-id" type="text" placeholder="スプレッドシートURLの末尾" />
      </label>
      <button id="login-btn" type="button">Googleドライブ（読み取り専用）＋スプレッドシートへログイン</button>
      <button id="scan-btn" type="button" disabled>音楽ファイルをスキャンして索引に反映する</button>
      <p id="status" class="status"></p>
      <ul id="result-list" class="result-list"></ul>
    `
        : `<p class="status error">VITE_GOOGLE_CLIENT_ID が未設定です。.env に設定してください。</p>`
    }
  `;
}

function setStatus(message: string, isError = false): void {
  const status = el<HTMLParagraphElement>("status");
  status.textContent = message;
  status.classList.toggle("error", isError);
}

async function handleLogin(): Promise<void> {
  const loginBtn = el<HTMLButtonElement>("login-btn");
  loginBtn.disabled = true;
  try {
    setStatus("ログイン中...");
    await auth.requestAccessToken({ prompt: "consent" });
    setStatus("ログイン済み。フォルダIDを入力してスキャンできます。");
    el<HTMLButtonElement>("scan-btn").disabled = false;
  } catch (err) {
    setStatus(err instanceof AuthError ? err.message : String(err), true);
  } finally {
    loginBtn.disabled = false;
  }
}

function renderResults(entries: AudioFileEntry[], failedFolders: string[]): void {
  const list = el<HTMLUListElement>("result-list");
  list.innerHTML = "";
  const summary = document.createElement("li");
  summary.textContent = `音楽ファイル: ${entries.length}件${failedFolders.length > 0 ? `（取得失敗フォルダ: ${failedFolders.length}件）` : ""}`;
  list.appendChild(summary);
}

async function handleScan(): Promise<void> {
  const folderId = el<HTMLInputElement>("folder-id").value.trim();
  const spreadsheetId = el<HTMLInputElement>("spreadsheet-id").value.trim();
  if (!folderId) {
    setStatus("フォルダIDを入力してください", true);
    return;
  }
  if (!spreadsheetId) {
    setStatus("索引スプレッドシートIDを入力してください", true);
    return;
  }
  const scanBtn = el<HTMLButtonElement>("scan-btn");
  scanBtn.disabled = true;
  // 前回の結果を残したまま失敗すると、新しいフォルダのエラーと前回の件数が同時に
  // 表示され古い件数を今回の結果と誤認しうる（2026-08-19 Codexレビュー指摘）
  el<HTMLUListElement>("result-list").innerHTML = "";
  try {
    setStatus("フォルダを確認中...");
    const getFn = createDriveGetFn(() => auth.ensureAccessToken());
    // files.listは'<folderId>' in parentsのクエリで、folderId自体の存在・種別・権限は
    // 検証しない（誤ったIDでも単に空の子一覧を返しうる）。「フォルダが空」と
    // 「そもそも無効なID」を区別するため、スキャン開始前にフォルダ自身を検証する
    // （2026-08-19 Codexレビュー指摘）。共有ドライブ配下のルートの場合はdriveIdが返る
    // （changes.getStartPageTokenのスコープ指定に必要、2026-08-20 Codexレビュー指摘）
    const { driveId } = await validateRootFolder(getFn, folderId);

    // 書き込み権限自体は、抽出完了後のupdateRows()/appendRows()の403で初めて判明すると
    // 1万件規模のタグ抽出をやり直すことになる（2026-08-20 Codexレビュー指摘）ため先に検証する。
    // タブ自動作成（addSheet）にも書き込み権限が要るため、タブ作成より前に確認する必要がある。
    // スプレッドシートもDriveファイルの一種であるため、Sheets APIを呼ばずにDrive APIの
    // capabilities.canEditで確認できる
    setStatus("書き込み先スプレッドシートを確認中...");
    const capabilitiesGetFn = createDriveCapabilitiesGetFn(() => auth.ensureAccessToken());
    const { canEdit } = await capabilitiesGetFn(spreadsheetId);
    if (!canEdit) {
      throw new Error("索引スプレッドシートへの編集権限がありません。共有設定（編集者権限）をご確認ください。");
    }

    // index/syncタブが無ければ自動作成する（着手順の目安4）。既に存在するタブには一切触れない
    // ため、想定と異なる内容の既存タブへの対応は次のreadHeaderRow()検証に委ねる。
    setStatus("索引タブを確認中...");
    const setupIO = createSpreadsheetSetupIO(spreadsheetId, () => auth.ensureAccessToken());
    await ensureIndexAndSyncTabsExist(setupIO);

    // スプレッドシートIDのタイプミス等で、index/syncタブ以外の想定外のスプレッドシートを
    // 指しているケース、または既存indexタブのヘッダー行が想定と異なるケースをここで検出する。
    // listExistingRows()（A2以降のみ）だけではヘッダー行（1行目）自体の有無・列順を検証
    // できず、空/誤ったヘッダーのまま抽出を進めると初回のappendRows()がA1（本来ヘッダーが
    // あるべき行）に曲データを書き込んでしまい、次回スキャンがそれをヘッダーとして読み飛ばして
    // 重複行を生む（2026-08-20 Codexレビュー指摘）。readHeaderRow()で実際のヘッダー内容を検証する
    const sheetsIO = createSheetsIndexIO(spreadsheetId, () => auth.ensureAccessToken());
    const header = await sheetsIO.readHeaderRow();
    if (!isValidIndexHeader(header)) {
      throw new Error(`索引スプレッドシートの「${INDEX_SHEET_NAME}」タブのヘッダー行が想定と一致しません。ヘッダー行（1行目）を事前に作成してください。`);
    }

    // syncタブについてもindexタブと同じ理由でヘッダー行を検証する（2026-08-20 Codexレビュー指摘）：
    // ensureIndexAndSyncTabsExistは既存タブに一切触れないため、「sync」という名前の無関係な
    // 既存タブが指定スプレッドシートにあった場合、検証無しでは prepareSyncForScan がそのA2:Bを
    // アプリの同期状態として誤って読み書きしてしまう（無関係な行の上書き・データ破損につながる）。
    setStatus("同期状態を確認中...");
    const syncIO = createSyncTabIO(spreadsheetId, () => auth.ensureAccessToken());
    const syncHeader = await syncIO.readHeaderRow();
    if (!isValidSyncHeader(syncHeader)) {
      throw new Error(`索引スプレッドシートの「${SYNC_SHEET_NAME}」タブのヘッダー行が想定と一致しません。無関係なタブが同名で存在していないかご確認ください。`);
    }

    // 変更トークンの取得順序（CONCEPT.md 5節）：初回一覧の構築を始める前にstartPageTokenを
    // 確保しておく。ルート変更時は新規取得、初期化未完了中の再開時は既存トークンを使い回す
    // （sync.tsのprepareSyncForScan参照）。changes.listによる実際の差分再生は次PR以降。
    const { startPageToken } = await prepareSyncForScan(syncIO, createGetStartPageTokenFn(() => auth.ensureAccessToken(), driveId), folderId);

    setStatus("スキャン中...（フォルダ構成によっては時間がかかります）");
    const listFn = createDriveListFn(() => auth.ensureAccessToken());
    const failedFolders: string[] = [];
    const entries = await listAudioFilesRecursive(listFn, folderId, "", failedFolders);
    renderResults(entries, failedFolders);

    setStatus(`タグを抽出中...（0/${entries.length}件）`);
    const upsertEntries = await extractAndBuildIndexEntries(
      entries,
      (fileId, signal) => createDriveFetchRange(fileId, () => auth.ensureAccessToken(), { signal }),
      (done, total) => setStatus(`タグを抽出中...（${done}/${total}件）`)
    );

    setStatus("スプレッドシートへ書き込み中...");
    await upsertIndexRows(sheetsIO, upsertEntries);

    // 取得失敗フォルダ（failedFolders）が1件でもある場合、初回一覧の構築は完了していない
    // （2026-08-20 Codexレビュー指摘：listAudioFilesRecursiveは子フォルダ単位の一時的な失敗を
    // 例外にせずfailedFoldersへ積んで継続するため、部分的な結果のままここへ到達しうる。
    // それをinitialScanCompletedAtとして記録すると、取得できなかったサブツリー配下のファイルは
    // 差分同期（changes.list、未実装）が開始トークン以降の変更しか拾わない性質上、恒久的に
    // 索引から漏れてしまう。取得失敗があった場合は完了とみなさず、次回のスキャンでの再挑戦に委ねる）。
    if (failedFolders.length === 0) {
      // 準備時に確保したrootFolderId/startPageTokenと照合してから書く（sync.tsのmarkInitialScanCompleted
      // 参照）。長時間のスキャン中に別デバイスがルートを切り替えていた場合、無関係になった
      // ルートを誤って完了扱いにしないため。
      await markInitialScanCompleted(syncIO, new Date().toISOString(), { rootFolderId: folderId, startPageToken });
    }

    setStatus(`スキャン完了（${entries.length}件を索引に反映${failedFolders.length > 0 ? `、取得失敗フォルダ: ${failedFolders.length}件` : ""}）`);
  } catch (err) {
    // 401（トークン取り消し等）は、ローカルのexpiresAtがまだ有効に見えていても
    // Drive APIに拒否されたことを意味する。キャッシュを残したままだと次回の
    // ensureAccessToken()も同じ拒否済みトークンを返し続け、期限マージンに入るか
    // ユーザーが再ログインするまで必ず失敗し続けてしまう（2026-08-19 Codexレビュー指摘）
    if (isAuthFailure(err)) auth.clearToken();
    setStatus(err instanceof Error ? err.message : String(err), true);
  } finally {
    scanBtn.disabled = false;
  }
}

// Google Identity Servicesの<script async defer>は、同じくtype="module"で読み込まれる
// このスクリプトより先に実行が終わる保証も後に終わる保証も無い（asyncはdeferと違い実行順序を
// 保証しない）。window.loadは非同期スクリプトの読み込み完了も待つため、これを待ってから
// auth.init()を呼ぶことで「GISの読み込みが間に合わずwindow.googleが無い」競合を避ける
// （2026-08-19 Codexレビュー指摘）。
function whenPageLoaded(cb: () => void): void {
  if (document.readyState === "complete") {
    cb();
  } else {
    window.addEventListener("load", cb, { once: true });
  }
}

function init(): void {
  render();
  if (!CLIENT_ID) return;

  whenPageLoaded(() => {
    try {
      auth.init(CLIENT_ID);
    } catch (err) {
      setStatus(err instanceof AuthError ? err.message : String(err), true);
      return;
    }
    el<HTMLButtonElement>("login-btn").addEventListener("click", () => void handleLogin());
    el<HTMLButtonElement>("scan-btn").addEventListener("click", () => void handleScan());
  });
}

init();
