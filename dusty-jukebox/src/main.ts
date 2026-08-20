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
import {
  createSheetsIndexIO,
  indexRowsLastScannedAt,
  isValidIndexHeader,
  mergeDuplicateIndexRows,
  upsertIndexRows,
  SheetsHttpError,
  INDEX_SHEET_HEADER,
  INDEX_SHEET_NAME,
} from "./sheets";
import { ensureIndexAndSyncTabsExist, ensureValidHeader, createSpreadsheetSetupIO, migrateLegacyIndexHeaderV1 } from "./sheetsSetup";
import {
  clearScanRunStartedAt,
  createSyncTabIO,
  isValidSyncHeader,
  markInitialScanCompleted,
  prepareSyncForScan,
  SYNC_SHEET_NAME,
  SYNC_TAB_HEADER,
} from "./sync";

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
    // 指しているケース、または既存index/syncタブのヘッダー行が想定と異なるケースをここで検出する。
    // A2以降のみを読む後続の索引読み書き・sync状態読み書きだけではヘッダー行（1行目）自体の
    // 有無・列順を検証できず、空/誤ったヘッダーのまま進めると重複行やデータ破損につながる
    // （2026-08-20 Codexレビュー指摘）。ensureValidHeader()がヘッダー検証・失敗時の回復
    // （タブが真に空なら書き直して再検証）・それでも無効な場合のエラーをまとめて行う
    // （index/syncで同じ検証ロジックが重複していたのを共通化、2026-08-20 /code-review指摘）
    // 旧バージョン（27列、2026-08-20の重複行マージ実装より前）のindexタブヘッダーを使っている
    // 既存ユーザーは、新スキーマ（45列）とのisValidIndexHeader不一致でここに来る。
    // migrateLegacyIndexHeaderV1がこの旧ヘッダーを検出した場合のみグリッド拡張＋ヘッダー
    // 書き換えを行う（2026-08-20 Codexレビュー指摘：この移行が無いと既存の27列indexタブが
    // 永久にヘッダー不一致エラーでブロックされ続けてしまっていた）。
    const sheetsIO = createSheetsIndexIO(spreadsheetId, () => auth.ensureAccessToken());
    await ensureValidHeader(sheetsIO, setupIO, INDEX_SHEET_NAME, INDEX_SHEET_HEADER, isValidIndexHeader, (header) =>
      migrateLegacyIndexHeaderV1(setupIO, header)
    );

    // syncタブについてもindexタブと同じ理由でヘッダー行を検証する（2026-08-20 Codexレビュー指摘）：
    // ensureIndexAndSyncTabsExistは既存タブに一切触れないため、「sync」という名前の無関係な
    // 既存タブが指定スプレッドシートにあった場合、検証無しでは prepareSyncForScan がそのA2:Bを
    // アプリの同期状態として誤って読み書きしてしまう（無関係な行の上書き・データ破損につながる）。
    setStatus("同期状態を確認中...");
    const syncIO = createSyncTabIO(spreadsheetId, () => auth.ensureAccessToken());
    await ensureValidHeader(syncIO, setupIO, SYNC_SHEET_NAME, SYNC_TAB_HEADER, isValidSyncHeader);

    // 変更トークンの取得順序（CONCEPT.md 5節）：初回一覧の構築を始める前にstartPageTokenを
    // 確保しておく。ルート変更時は新規取得、初期化未完了中の再開時は既存トークンを使い回す
    // （sync.tsのprepareSyncForScan参照）。changes.listによる実際の差分再生は次PR以降。
    // scanRunStartedAtは着手順の目安5（バッチ処理・中断再開）のウォーターマーク：前回の実行が
    // 完走せず中断していた場合はその開始時刻を再利用し、以降で「今回の実行で既に処理済みの
    // ファイル」を判定するのに使う。
    const { startPageToken, scanRunStartedAt } = await prepareSyncForScan(
      syncIO,
      createGetStartPageTokenFn(() => auth.ensureAccessToken(), driveId),
      folderId
    );

    setStatus("スキャン中...（フォルダ構成によっては時間がかかります）");
    const listFn = createDriveListFn(() => auth.ensureAccessToken());
    const failedFolders: string[] = [];
    const entries = await listAudioFilesRecursive(listFn, folderId, "", failedFolders);
    renderResults(entries, failedFolders);

    // 前回の実行（このscanRunStartedAt）で既に処理済み（lastScannedAt >= scanRunStartedAt）の
    // ファイルはスキップする。中断・再開時にタグ抽出（重い処理）をやり直さないための判定
    // （着手順の目安5）。この読み取り結果は「何をスキップするか」の判定だけに使い、多少
    // 古くても実害は無い（最悪の場合、他デバイスが直後に処理し終えたファイルをもう一度
    // 処理するだけ）。
    setStatus("進捗を確認中...");
    const lastScannedAtByFileId = indexRowsLastScannedAt(await sheetsIO.listExistingRows());
    const pendingEntries = entries.filter((entry) => {
      const lastScannedAt = lastScannedAtByFileId.get(entry.file.id);
      return !lastScannedAt || lastScannedAt < scanRunStartedAt;
    });
    const alreadyDoneCount = entries.length - pendingEntries.length;

    // 中断・再開可能なバッチ処理（CONCEPT.md 5節）：全件をまとめて抽出・1回だけ書き込む
    // のではなく、一定件数ごとにタグ抽出→索引への書き込みを行う。ブラウザのタブを閉じる・
    // 通信が長時間切れる等でスキャンが中断しても、既に書き込み済みのバッチはスプレッドシート側に
    // 残るため、再開時（次のスキャンクリック）はscanRunStartedAtのウォーターマークで
    // 既に処理済みのファイルをスキップし、残りのバッチから再開できる。
    //
    // 各バッチのupsertIndexRows直前に改めてlistExistingRows()を読み直す（バッチ開始前の
    // スキップ判定用スナップショットを全バッチで使い回さない）。10235件規模で全バッチ分の
    // 全件読み取りを繰り返すコストはあるが、スキャン開始時に読んだ1回のスナップショットを
    // 全バッチに使い回すと、長時間のタグ抽出中にユーザー（または別デバイス）が加えた
    // `_override`列の手動補正を、後続バッチのupsertIndexRows（sheets.tsのmergeWithExisting）が
    // 古いスナップショットの値で上書きして消してしまう（2026-08-20 Codexレビュー指摘：P1、
    // 変更前は抽出完了後に1回だけlistExistingRowsを読んでいたためこの回帰は無かった）。
    // データ損失の回避を全件読み取りの節約より優先する。
    const BATCH_SIZE = 200;
    let processedCount = 0;
    for (let i = 0; i < pendingEntries.length; i += BATCH_SIZE) {
      const batch = pendingEntries.slice(i, i + BATCH_SIZE);
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(pendingEntries.length / BATCH_SIZE);
      setStatus(
        `タグを抽出中...（バッチ ${batchNumber}/${totalBatches}、${processedCount + alreadyDoneCount}/${entries.length}件${
          alreadyDoneCount > 0 ? `、前回実行分${alreadyDoneCount}件はスキップ済み` : ""
        }）`
      );
      const upsertEntries = await extractAndBuildIndexEntries(
        batch,
        (fileId, signal) => createDriveFetchRange(fileId, () => auth.ensureAccessToken(), { signal }),
        (done) =>
          setStatus(
            `タグを抽出中...（バッチ ${batchNumber}/${totalBatches}、${processedCount + alreadyDoneCount + done}/${entries.length}件）`
          )
      );
      // upsert直前に読み直す（このバッチのタグ抽出中に加えられた手動補正まではカバーできないが、
      // それより前の他バッチ・他デバイスの更新は反映された状態でマージできる）。
      const freshExistingRows = await sheetsIO.listExistingRows();
      await upsertIndexRows(sheetsIO, upsertEntries, freshExistingRows);
      processedCount += batch.length;
    }

    // 索引upsertの重複行マージ（CONCEPT.md 4.3節）。複数デバイスがほぼ同時にスキャンした場合、
    // 片方が「まだ無い」と判断した新規fileIdを両方が別行として追記してしまう競合が起こりうる。
    // changes.listによる実際の差分同期はまだ実装していないため、本来の「差分同期完了時」の
    // 代わりに毎回のフルスキャン完了時にこのチェックを行う（CONCEPT.md同節「事前防止ではなく
    // 事後の整合」の方針通り）。無条件に毎回呼ぶ：一時的に「新規追記が無ければ今回は重複が
    // 増えようがないので呼ばなくてよい」という最適化を入れていたが、直前のスキャンで追記直後に
    // タブを閉じる／mergeDuplicateIndexRows自体が通信エラーで失敗する等により重複行が
    // 残った場合、そのfileIdは次回以降「既存」扱いになり新規追記が二度と発生しないため、
    // 事後整合による回復手段がこの呼び出し以外に無いのに永久にスキップされ続けてしまう
    // （2026-08-20 Codexレビュー指摘：P2。パフォーマンスよりも「唯一の回復経路を塞がない」
    // ことを優先し、無条件呼び出しに戻した）。
    setStatus("重複行を確認中...");
    await mergeDuplicateIndexRows(sheetsIO);

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

    // 全バッチが最後まで完走した（=ここに到達した）ので、このスキャン実行のウォーターマークは
    // 役目を終えた。クリアしておくことで、次回のスキャンクリックは新しい実行として扱われ、
    // 今回処理済みのファイルも次のscanRunStartedAt以降で改めて対象になる（着手順の目安5）。
    // failedFolders自体はinitialScanCompletedAtとは独立に、常にクリアしてよい（フォルダ一覧の
    // 取得失敗は別の問題であり、見つかった全ファイルに対するタグ抽出・書き込みは完走している）。
    await clearScanRunStartedAt(syncIO, { rootFolderId: folderId, startPageToken, scanRunStartedAt });

    setStatus(
      `スキャン完了（${entries.length}件を索引に反映${alreadyDoneCount > 0 ? `、前回実行分${alreadyDoneCount}件はスキップ` : ""}${
        failedFolders.length > 0 ? `、取得失敗フォルダ: ${failedFolders.length}件` : ""
      }）`
    );
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
