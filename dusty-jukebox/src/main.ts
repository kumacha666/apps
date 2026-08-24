// エントリポイント。着手順の目安4: sync タブ基盤・index/syncタブの初回自動作成・索引upsertの
// 重複行マージ・初回スキャンのバッチ処理/中断再開に続き、残りだったchanges.list消費による
// 差分同期とルート変更後の旧ルート配下行の削除（リコンサイル）を実装した。絞り込み/再生UI・
// Service Workerストリーミングプロキシは引き続き未着手（dusty-jukebox/CLAUDE.md参照）。
//
// 初回スキャン完了前（sync.tsのhasCompletedInitialScan=false）は引き続きフルスキャン
// （runFullScan、フォルダ全体の再帰走査＋バッチ処理・中断再開）を行う。完了後
// （hasCompletedInitialScan=true）はrunDifferentialSync（changes.list消費）に切り替わる。
import { AuthError, DriveAuth } from "./auth";
import {
  createChangesListFn,
  createDriveCapabilitiesGetFn,
  createDriveFetchRange,
  createDriveGetFn,
  createDriveListFn,
  createDriveParentsGetFn,
  createGetStartPageTokenFn,
  consumeAllChanges,
  isDescendantOfRoot,
  listAudioFilesRecursive,
  validateRootFolder,
  isAuthError,
  DriveHttpError,
  type AudioFileEntry,
} from "./drive";
import { applyShortcutChangesToExtraRootFolderIds, planDifferentialSync } from "./differentialSync";
import { extractAndBuildIndexEntries } from "./tagExtraction";
import {
  createSheetsIndexIO,
  indexRowsScanState,
  isValidIndexHeader,
  mergeDuplicateIndexRows,
  reconcileIndexAgainstRoot,
  removeIndexRows,
  upsertIndexRows,
  SheetsHttpError,
  SheetsIndexIO,
  INDEX_SHEET_HEADER,
  INDEX_SHEET_NAME,
} from "./sheets";
import {
  ensureIndexAndSyncTabsExist,
  ensureValidHeader,
  createSpreadsheetSetupIO,
  migrateLegacyIndexHeaderV1,
  migrateLegacyIndexHeaderV2,
} from "./sheetsSetup";
import {
  advanceStartPageToken,
  clearScanRunId,
  createSyncTabIO,
  isPendingForScanRun,
  isSyncStateCurrent,
  isValidSyncHeader,
  markInitialScanCompleted,
  persistShortcutRootFolderIds,
  prepareSyncForScan,
  resetForFullRescan,
  SYNC_SHEET_NAME,
  SYNC_TAB_HEADER,
  type SyncTabIO,
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

// 初回スキャン（初期化未完了、またはルート変更直後）: フォルダ全体を再帰走査し、
// バッチ処理・中断再開（着手順の目安5）で索引に書き込む。完了時にリコンサイル
// （reconcileIndexAgainstRoot）とショートカット参照先フォルダIDの永続化も行う
// （2026-08-21 Codexレビュー指摘：P1、下記参照）。
async function runFullScan(
  sheetsIO: SheetsIndexIO,
  syncIO: SyncTabIO,
  folderId: string,
  startPageToken: string,
  scanRunId: string
): Promise<void> {
  setStatus("スキャン中...（フォルダ構成によっては時間がかかります）");
  const listFn = createDriveListFn(() => auth.ensureAccessToken());
  const failedFolders: string[] = [];
  // フォルダを指すショートカットの参照先フォルダID（drive.tsのlistAudioFilesRecursive参照）。
  // 通常のparents関係を作らないため、差分同期・リコンサイルの祖先チェーン確認だけでは
  // 発見できない。フルスキャンが解決した結果をsyncタブへ永続化し、以降の差分同期・
  // リコンサイルがrootFolderIdと同格の追加のルートとして扱えるようにする
  // （2026-08-21 Codexレビュー指摘：P1）。
  const shortcutTargetFolderIds = new Set<string>();
  const entries = await listAudioFilesRecursive(listFn, folderId, "", failedFolders, undefined, shortcutTargetFolderIds);
  renderResults(entries, failedFolders);

  // 前回の実行（このscanRunId）で既に処理済み、かつDrive側で以後更新されていないファイルは
  // スキップする。中断・再開時にタグ抽出（重い処理）をやり直さないための判定
  // （着手順の目安5、2026-08-21 Codexレビュー指摘でscanRunId完全一致＋driveModifiedTime
  // 比較へ変更。sync.tsのisPendingForScanRun参照）。この読み取り結果は「何をスキップするか」の
  // 判定だけに使い、多少古くても実害は無い（最悪の場合、他デバイスが直後に処理し終えた
  // ファイルをもう一度処理するだけ）。
  setStatus("進捗を確認中...");
  const scanStateByFileId = indexRowsScanState(await sheetsIO.listExistingRows());
  const pendingEntries = entries.filter((entry) =>
    isPendingForScanRun(scanStateByFileId.get(entry.file.id), scanRunId, entry.file.modifiedTime ?? "")
  );
  const alreadyDoneCount = entries.length - pendingEntries.length;

  // 中断・再開可能なバッチ処理（CONCEPT.md 5節）：全件をまとめて抽出・1回だけ書き込む
  // のではなく、一定件数ごとにタグ抽出→索引への書き込みを行う。ブラウザのタブを閉じる・
  // 通信が長時間切れる等でスキャンが中断しても、既に書き込み済みのバッチはスプレッドシート側に
  // 残るため、再開時（次のスキャンクリック）はscanRunIdのウォーターマークで
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
        ),
      scanRunId
    );
    // タグ抽出（数十秒以上かかりうる）の後・実際の書き込みの直前にroot/tokenを再確認する
    // （2026-08-21 Codexレビュー指摘：P1）。10235件規模のフルスキャンは全バッチで長時間かかる
    // ため、開始前の1回きりの確認では別デバイスが途中でルートを切り替えて新しいフルスキャンを
    // 完了させた場合に気づけない。末尾のisSyncStateCurrentチェックはその後のリコンサイル・
    // 完了記録をスキップするだけで、既にここで書いてしまった行は戻せないため、各バッチの
    // 書き込み前に確認して不一致ならその場でスキャン自体を中止する。
    const stillCurrentForBatch = await isSyncStateCurrent(syncIO, { rootFolderId: folderId, startPageToken, scanRunId });
    if (!stillCurrentForBatch) {
      setStatus("別のデバイスがルート設定を変更したため、今回のスキャンを中止しました。次回のスキャンで改めて反映されます。", true);
      return;
    }
    // upsert直前に読み直す（このバッチのタグ抽出中に加えられた手動補正まではカバーできないが、
    // それより前の他バッチ・他デバイスの更新は反映された状態でマージできる）。
    const freshExistingRows = await sheetsIO.listExistingRows();
    await upsertIndexRows(sheetsIO, upsertEntries, freshExistingRows);
    processedCount += batch.length;
  }

  // 索引upsertの重複行マージ（CONCEPT.md 4.3節）。複数デバイスがほぼ同時にスキャンした場合、
  // 片方が「まだ無い」と判断した新規fileIdを両方が別行として追記してしまう競合が起こりうる。
  // 本来の「差分同期完了時」に加え、初回スキャン完了時にもこのチェックを行う（CONCEPT.md同節
  // 「事前防止ではなく事後の整合」の方針通り）。無条件に毎回呼ぶ：一時的に「新規追記が無ければ
  // 今回は重複が増えようがないので呼ばなくてよい」という最適化を入れていたが、直前のスキャンで
  // 追記直後にタブを閉じる／mergeDuplicateIndexRows自体が通信エラーで失敗する等により重複行が
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
  // 差分同期（changes.list）が開始トークン以降の変更しか拾わない性質上、恒久的に索引から
  // 漏れてしまう。取得失敗があった場合は完了とみなさず、次回のスキャンでの再挑戦に委ねる）。
  if (failedFolders.length === 0) {
    // reconcileIndexAgainstRoot（索引全体を書き換えうる）を実行する前に、準備時に確保した
    // rootFolderId/startPageTokenがまだ現在のsync状態と一致するかを確認する（2026-08-21
    // Codexレビュー指摘：P1）。markInitialScanCompletedは不一致なら静かに書き込みをスキップする
    // だけで、それを判定材料にせず後続処理を続けてしまうと、長時間のスキャン中に別デバイスが
    // 既に新しいルートへの完了したフルスキャンを終えていた場合、この（もはや無関係な）
    // ルート基準のリコンサイルが別デバイスの新ルートの索引行を誤って空欄化しうる
    // （sync.tsのisSyncStateCurrent、runDifferentialSyncと同じ対策）。
    const stillCurrent = await isSyncStateCurrent(syncIO, { rootFolderId: folderId, startPageToken, scanRunId });
    if (stillCurrent) {
      // 「旧ルート配下だった行の削除（リコンサイル）」（CONCEPT.md 4.3節）：新しい初回スキャンが
      // 完了した時点の仕上げとして実行する。以前はこの呼び出しが無く、ルート変更後にフルスキャンが
      // 成功しても旧ルート配下の行が索引に残り続けていた（2026-08-21 Codexレビュー指摘：P1）。
      // ルート変更を伴わない（中断からの再開）フルスキャン完了時に呼んでも、全行が新ルート配下の
      // はずなので無害（isFolderUnderRootの祖先チェーン確認コストが掛かるのみ）。
      setStatus("フォルダ構成を確認中...");
      const getParentsFn = createDriveParentsGetFn(() => auth.ensureAccessToken());
      const ancestryCache = new Map<string, boolean>();
      // knownFileIdsに今回のフルスキャンが実際に発見したfileId集合を渡す：410 Gone
      // （changes.list保持期間切れ）からの復旧でフルスキャンをやり直す場合、410で失われた
      // 期間中に削除・ゴミ箱移動・対象外拡張子へリネームされたファイルは今回の一覧に現れないが、
      // 親フォルダ自体はrootFolderId配下にあり続けるためparentId基準の判定だけでは
      // 「まだ到達可能」と誤判定され続け、以後の差分同期（新トークンは410欠落期間より後）でも
      // 削除イベントを二度と取得できず恒久的に残ってしまう（2026-08-21 Codexレビュー指摘：P2）。
      // 完全な一覧が取れているフルスキャンの後でのみ安全な照合のため、差分同期側の
      // フォルダ変更イベント安全網としての呼び出しでは渡さない（sheets.tsのコメント参照）。
      // knownFileIds基準の削除は「親の到達性に関係なく同一ルートの新規行まで削除しうる」ため、
      // listExistingRows()〜書き込みの間に別デバイスが同じrootFolderIdのまま差分同期を完了させ
      // startPageTokenを進めていた場合に備え、書き込み直前にもsync状態を再確認する
      // （2026-08-22 Codexレビュー指摘：P1）。
      await reconcileIndexAgainstRoot(
        sheetsIO,
        (parentId) => isDescendantOfRoot(getParentsFn, [parentId], folderId, ancestryCache, shortcutTargetFolderIds),
        new Set(entries.map((entry) => entry.file.id)),
        () => isSyncStateCurrent(syncIO, { rootFolderId: folderId, startPageToken, scanRunId })
      );

      // 今回のフルスキャンが解決したショートカット参照先フォルダIDの集合をsyncタブへ永続化する。
      // 前回のスキャン以降にショートカットが増減した場合も、今回発見した集合でそのまま上書きする
      // （自己修復。持ち越さない）。
      await persistShortcutRootFolderIds(syncIO, [...shortcutTargetFolderIds], { rootFolderId: folderId, startPageToken, scanRunId });

      // 初回一覧の構築中に発生した変更も、完了前に同じstartPageTokenから再生する。
      // 先に完了を記録すると通常の差分同期へ切り替わり、初回一覧が取得済みだった時点より後の
      // 追加・更新・削除を取りこぼしうる。runDifferentialSyncがトークンを進め、成功後にだけ
      // initialScanCompletedAtを記録するため、失敗時は次回も初回スキャンとして安全に再開できる。
      await runDifferentialSync(
        sheetsIO,
        syncIO,
        folderId,
        undefined,
        startPageToken,
        [...shortcutTargetFolderIds],
        { completedAt: new Date().toISOString(), scanRunId }
      );
    }
  }

  // 全バッチが最後まで完走した（=ここに到達した）ので、このスキャン実行のウォーターマークは
  // 役目を終えた。クリアしておくことで、次回のスキャンクリックは新しい実行として扱われ、
  // 今回処理済みのファイルも次のscanRunId以降で改めて対象になる（着手順の目安5）。
  // failedFolders自体はinitialScanCompletedAtとは独立に、常にクリアしてよい（フォルダ一覧の
  // 取得失敗は別の問題であり、見つかった全ファイルに対するタグ抽出・書き込みは完走している）。
  await clearScanRunId(syncIO, { rootFolderId: folderId, startPageToken, scanRunId });

  setStatus(
    `スキャン完了（${entries.length}件を索引に反映${alreadyDoneCount > 0 ? `、前回実行分${alreadyDoneCount}件はスキップ` : ""}${
      failedFolders.length > 0 ? `、取得失敗フォルダ: ${failedFolders.length}件` : ""
    }）`
  );
}

// 着手順の目安4の残り：初回スキャン完了後の差分同期（CONCEPT.md 5節）。フォルダ全体の
// 再帰走査は行わず、startPageTokenからのchanges.list消費だけでDriveの変更を索引に反映する。
// differentialSync.tsのplanDifferentialSyncへDrive/Sheets呼び出しをDIし、判定結果
// （タグ抽出が必要なエントリ・削除すべきfileId・リコンサイルの要否）に基づいて
// extractAndBuildIndexEntries/upsertIndexRows/removeIndexRows/reconcileIndexAgainstRootを呼ぶ。
async function runDifferentialSync(
  sheetsIO: SheetsIndexIO,
  syncIO: SyncTabIO,
  folderId: string,
  driveId: string | undefined,
  startPageToken: string,
  shortcutRootFolderIds: string[],
  initialCompletion?: { completedAt: string; scanRunId: string }
): Promise<void> {
  setStatus("前回からの変更を確認中...");
  const changesListFn = createChangesListFn(() => auth.ensureAccessToken(), driveId);
  let changes;
  let newStartPageToken: string;
  try {
    ({ changes, newStartPageToken } = await consumeAllChanges(changesListFn, startPageToken));
  } catch (err) {
    // 保存済みのstartPageTokenが古すぎるとDrive APIは410 Goneを返す（変更履歴の保持期間切れ）。
    // このまま失敗し続けると毎回同じ箇所で止まるため、initialScanCompletedAtをクリアして
    // 次回のスキャンクリックがフルスキャンからやり直すようにする（2026-08-21 Codexレビュー
    // 指摘：P2、sync.tsのresetForFullRescan参照）。
    if (err instanceof DriveHttpError && err.status === 410) {
      await resetForFullRescan(syncIO, { rootFolderId: folderId, startPageToken });
      setStatus("変更履歴の保持期限切れのため、次回のスキャンはフルスキャンからやり直します。もう一度スキャンを実行してください。", true);
      return;
    }
    throw err;
  }

  const getParentsFn = createDriveParentsGetFn(() => auth.ensureAccessToken());
  // 祖先チェーンの確認結果（フォルダID→rootFolderId配下かどうか）をこの同期実行の中で
  // 使い回す（drive.tsのisDescendantOfRoot参照）。差分同期・その後のリコンサイルの両方で
  // 同じフォルダIDへの重複した確認を避けられる。extraRootFolderIdsはフォルダショートカットの
  // 参照先（直近のフルスキャンが解決し永続化した集合）を、rootFolderId自体と同格の追加の
  // ルートとして扱う（2026-08-21 Codexレビュー指摘：P1）。
  const ancestryCache = new Map<string, boolean>();
  const extraRootFolderIds = new Set(shortcutRootFolderIds);
  const isUnderRoot = (parentIds: string[] | undefined) =>
    isDescendantOfRoot(getParentsFn, parentIds, folderId, ancestryCache, extraRootFolderIds);
  const listFn = createDriveListFn(() => auth.ensureAccessToken());
  const failedFolders: string[] = [];

  // フルスキャンでのみ永続化されるextraRootFolderIdsは、差分同期中に発生したショートカットの
  // 追加・削除・移動をまだ反映していない。このまま使うと、今回新しく追加されたショートカット
  // 配下のアップサート直後にreconcileIndexAgainstRootが走った場合に誤って削除されたり、
  // 逆に削除・移動されたショートカットの配下がリコンサイルで削除されなくなる
  // （2026-08-21 Codexレビュー指摘：P1）。planDifferentialSync呼び出し前に最新化する。
  // applyShortcutChangesToExtraRootFolderIds自身も、extraRootFolderIdsを変更するたびに
  // ancestryCacheを破棄する（同一バッチ内の後続イテレーションが古いキャッシュを再利用しない
  // ようにするため、2026-08-23 Codexレビュー指摘：P1）。
  await applyShortcutChangesToExtraRootFolderIds(changes, extraRootFolderIds, isUnderRoot, () => ancestryCache.clear());
  // 上記の呼び出し自体がisUnderRoot（＝ancestryCacheを使うisDescendantOfRoot）を呼びながら
  // extraRootFolderIdsを書き換えるため、その過程でキャッシュされた到達性判定は「更新前の
  // extraRootFolderIds」を前提にした値のまま残っている。以降のplanDifferentialSync・
  // reconcileIndexAgainstRootがこの古いキャッシュを再利用すると、今回追加・除去された
  // 参照先を反映しないまま判定してしまう（2026-08-21 Codexレビュー指摘：P2）。
  // extraRootFolderIdsの更新が完了した時点でキャッシュを破棄し、以降は新しい集合を前提に
  // 再計算させる（呼び出し内で既に都度破棄されているため、ここでの呼び出しは冪等な保険）。
  ancestryCache.clear();

  const scanStateByFileId = indexRowsScanState(await sheetsIO.listExistingRows());
  const plan = await planDifferentialSync(changes, {
    isDescendantOfRoot: isUnderRoot,
    // フォルダ変更イベントで検知したサブツリーの再走査。フルスキャンより並行数を抑える
    // （通常は少数のフォルダのみが対象のため、ここで大きく並行実行する必要は無い）。resourceKeyは
    // リンク共有のセキュリティ更新が適用されたショートカット参照先の解決に必要
    // （2026-08-21 Codexレビュー指摘：P2。渡さないとfiles.listが404になり、このフォルダ変更
    // イベントを毎回再試行し続けてしまう）。
    // extraRootFolderIdsをそのままshortcutTargetFolderIds出力引数として渡す：サブツリー内に
    // さらに別のショートカットが含まれる場合、その参照先も同じ集合に追加され、以降の
    // isDescendantOfRoot判定・最終的なpersistShortcutRootFolderIdsに反映される
    // （2026-08-21 Codexレビュー指摘：P1。以前は捨てていた第6引数を省略していたため、
    // ネストしたショートカットの参照先が発見されても集合に反映されず、直後のリコンサイルで
    // その配下のアップサート結果が誤って削除されていた）。
    // listSubtree自体もextraRootFolderIds（上記のshortcutTargetFolderIds出力引数）を
    // サブツリー内で発見したネストしたショートカットの参照先で拡張しうる。同じ
    // planDifferentialSync呼び出し内で後続のフォルダ変更イベントがisDescendantOfRoot
    // （＝ancestryCacheを共有するisUnderRoot）を呼ぶ場合、この拡張前にキャッシュされた
    // 到達不可（false）が残っていると、新しく追加された参照先を反映しないまま古い判定を
    // 再利用してしまう（2026-08-23 Codexレビュー指摘：P1。applyShortcutChangesToExtraRootFolderIds
    // 側の同種の問題と同じ根本原因）。extraRootFolderIdsのサイズが変化した場合のみキャッシュを
    // 破棄する（変化が無ければ既存のキャッシュは引き続き有効なため、無条件clearより安価）。
    listSubtree: async (targetFolderId, resourceKey) => {
      const sizeBefore = extraRootFolderIds.size;
      const entries = await listAudioFilesRecursive(listFn, targetFolderId, "", failedFolders, 3, extraRootFolderIds, resourceKey);
      if (extraRootFolderIds.size !== sizeBefore) ancestryCache.clear();
      return entries;
    },
    existingScanState: scanStateByFileId,
  });

  // タグ抽出（数十秒以上かかりうる）の後、破壊的・追加的な書き込み（アップサート・削除・
  // リコンサイル）の直前に、差分同期を開始した時点のroot/tokenがまだ現在のsync状態と
  // 一致するかを確認する（2026-08-21 Codexレビュー指摘：P1。以前はプラン計算の直後・
  // タグ抽出の前にこの確認を1回行うだけだったため、確認からタグ抽出完了までの間に
  // 別デバイスがルートを切り替えていた場合、それに気づかないまま書き込みへ進んでいた）。
  // 長時間の差分同期の実行中に別デバイスがrootFolderIdを切り替えて新しいフルスキャンを
  // 完了させていた場合、それに気づかず処理を続けると、別デバイスが追加した新ルートの行を
  // 汚染・削除しうる（advanceStartPageTokenのTOCTOU対策はトークンの書き込みしか防げず、
  // 既に実行してしまった索引の書き込みは取り消せないため、実行前に確認する）。Sheets APIには
  // 行単位のロックが無く完全な排他はできないため、この確認は競合の窓を狭める緩和策であって
  // 根本解消ではない（sync.ts全体の「事前防止ではなく事後の整合」という既知の限界と同じ扱い）。
  let upsertEntries: Awaited<ReturnType<typeof extractAndBuildIndexEntries>> = [];
  if (plan.entriesToProcess.length > 0) {
    setStatus(`タグを抽出中...（差分 ${plan.entriesToProcess.length}件）`);
    upsertEntries = await extractAndBuildIndexEntries(
      plan.entriesToProcess,
      (fileId, signal) => createDriveFetchRange(fileId, () => auth.ensureAccessToken(), { signal }),
      (done) => setStatus(`タグを抽出中...（差分 ${done}/${plan.entriesToProcess.length}件）`),
      ""
    );
  }

  const stillCurrent = await isSyncStateCurrent(syncIO, { rootFolderId: folderId, startPageToken });
  if (!stillCurrent) {
    setStatus("別のデバイスがルート設定を変更したため、今回の差分同期は見送りました。次回の同期で改めて反映されます。", true);
    return;
  }

  if (upsertEntries.length > 0) {
    await upsertIndexRows(sheetsIO, upsertEntries);
  }

  if (plan.removedFileIds.length > 0) {
    setStatus("削除されたファイルを索引から除去中...");
    // upsertIndexRowsの実行後・削除の直前にもsync状態を再確認する（2026-08-23 Codexレビュー
    // 指摘：P1）。同じ差分同期にupsertと削除の両方が含まれる場合、上のisSyncStateCurrent確認は
    // upsertの前にしか行われないため、upsert実行中に別デバイスが同じファイルをルート内へ
    // 戻して行を更新しトークンを進めると、この削除呼び出しがその正当な行を再び空欄化しうる。
    // reconcileIndexAgainstRootと同様、破壊的な書き込みごとに専用の確認コールバックを渡す
    // （removeIndexRows内部でも複数バッチに分割される場合は各バッチ直前で再確認される）。
    await removeIndexRows(sheetsIO, plan.removedFileIds, () =>
      isSyncStateCurrent(syncIO, { rootFolderId: folderId, startPageToken })
    );
  }

  // 索引upsertの重複行マージ。フルスキャンと同じ理由（CONCEPT.md 4.3節）で、本来の
  // 「差分同期完了時」に呼ぶ想定通りここで実行する。
  setStatus("重複行を確認中...");
  await mergeDuplicateIndexRows(sheetsIO);

  // フォルダの変更イベントを検知した場合のみ実行する（CONCEPT.md 5節「フォルダがrootFolderIdの
  // 内外をまたいで移動した場合」）。フォルダ自身の変更イベントだけでは配下ファイル1件1件の
  // 変更を検知できないため、rootFolderId配下から外れた行が残っていないかを索引全体に対して
  // 事後確認する（sheets.tsのreconcileIndexAgainstRoot参照）。
  if (plan.needsReconcile) {
    setStatus("フォルダ構成の変更を反映中...");
    // 共有のancestryCacheは使わず、ここで新しいキャッシュを渡す（2026-08-21 Codexレビュー
    // 指摘：P1）。planDifferentialSync計算中のフォルダ変更イベント処理（listSubtreeによる
    // ネストしたショートカットの発見、extraRootFolderIdsへ都度追加される）は、共有キャッシュに
    // 「更新前のextraRootFolderIds」を前提とした古い到達性判定を残しうる。索引全体を書き換える
    // 最も破壊的な処理であるリコンサイルだけは、常に最新のextraRootFolderIdsで再計算する。
    // ただしこの新しいキャッシュは、reconcileIndexAgainstRoot呼び出し1回の中で毎回のparentId
    // 判定コールバック呼び出しをまたいで共有する必要がある：コールバック内でnew Map()していた
    // ため実質キャッシュが機能せず、同じ祖先フォルダ（例：同じアーティストフォルダ配下の
    // 複数アルバムフォルダ）への祖先チェーン確認（files.get）が行数分重複していた
    // （2026-08-22 Codexレビュー指摘：P2）。
    const reconcileAncestryCache = new Map<string, boolean>();
    await reconcileIndexAgainstRoot(
      sheetsIO,
      (parentId) => isDescendantOfRoot(getParentsFn, [parentId], folderId, reconcileAncestryCache, extraRootFolderIds),
      undefined,
      () => isSyncStateCurrent(syncIO, { rootFolderId: folderId, startPageToken })
    );
  }

  // 今回更新したextraRootFolderIds（フルスキャン後の永続値＋差分同期中のショートカット変更）を
  // 永続化する。次回以降の差分同期・リコンサイルが最新の状態を使えるようにするため
  // （2026-08-21 Codexレビュー指摘：P1）。
  await persistShortcutRootFolderIds(syncIO, [...extraRootFolderIds], { rootFolderId: folderId, startPageToken });

  // フォルダ変更イベントのサブツリー再走査で子フォルダの取得に失敗した場合
  // （listAudioFilesRecursiveは例外にせずfailedFoldersへ積んで継続する）、そのサブツリー配下は
  // 今回取りこぼした可能性がある。startPageTokenを進めてしまうと、次回のchanges.listはこの
  // フォルダ変更イベント自体を二度と返さない（既に消費済みのため）ため、取りこぼしたサブツリーが
  // 恒久的に再走査されなくなる。取得失敗があった場合はトークンを進めず、次回同じ範囲を
  // 再消費して再挑戦できるようにする（2026-08-21 Codexレビュー指摘：P1）。
  if (failedFolders.length === 0) {
    // 消費し終えたstartPageTokenを進める。差分同期の最後に行う（途中でエラーが起きた場合、
    // 次回起動時に同じstartPageTokenから再度consumeAllChangesできるようにするため）。
    await advanceStartPageToken(syncIO, newStartPageToken, { rootFolderId: folderId, startPageToken });
    if (initialCompletion) {
      // 初回スキャンの完了記録は、一覧の構築・整合・差分再生・トークン更新のすべてが成功した後に
      // 行う。scanRunIdも照合し、同じルートで別デバイスが開始した初回スキャンを誤って完了扱いに
      // しない（runFullScanの各バッチ・整合処理と同じ競合緩和策）。
      await markInitialScanCompleted(syncIO, initialCompletion.completedAt, {
        rootFolderId: folderId,
        startPageToken: newStartPageToken,
        scanRunId: initialCompletion.scanRunId,
      });
      // runFullScan側の従来のclearScanRunIdは旧トークンを期待するため、トークン更新後の初回完了
      // パスではここで現在のトークンを使ってクリアする。
      await clearScanRunId(syncIO, {
        rootFolderId: folderId,
        startPageToken: newStartPageToken,
        scanRunId: initialCompletion.scanRunId,
      });
    }
  }

  setStatus(
    `差分同期完了（反映 ${plan.entriesToProcess.length}件、削除 ${plan.removedFileIds.length}件${
      failedFolders.length > 0 ? `、フォルダ取得失敗: ${failedFolders.length}件（次回再試行します）` : ""
    }）`
  );
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
    // 旧バージョン（27列、2026-08-20の重複行マージ実装より前。またはその後の45列、
    // 2026-08-21のscanRunId列追加より前）のindexタブヘッダーを使っている既存ユーザーは、
    // 現行スキーマ（46列）とのisValidIndexHeader不一致でここに来る。migrateLegacyIndexHeaderV1/V2が
    // それぞれの旧ヘッダーを検出した場合のみグリッド拡張＋ヘッダー書き換えを行う（2026-08-20/21
    // Codexレビュー指摘：この移行が無いと既存の旧indexタブが永久にヘッダー不一致エラーで
    // ブロックされ続けてしまっていた）。
    const sheetsIO = createSheetsIndexIO(spreadsheetId, () => auth.ensureAccessToken());
    await ensureValidHeader(
      sheetsIO,
      setupIO,
      INDEX_SHEET_NAME,
      INDEX_SHEET_HEADER,
      isValidIndexHeader,
      async (header) => (await migrateLegacyIndexHeaderV1(setupIO, header)) || (await migrateLegacyIndexHeaderV2(setupIO, header))
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
    // （sync.tsのprepareSyncForScan参照）。hasCompletedInitialScanがtrueなら前回の初回スキャンが
    // 完了済み（＝以降はフルスキャンでなく差分同期に進む）ことを意味する。
    const prep = await prepareSyncForScan(
      syncIO,
      createGetStartPageTokenFn(() => auth.ensureAccessToken(), driveId),
      folderId
    );

    if (prep.hasCompletedInitialScan) {
      await runDifferentialSync(sheetsIO, syncIO, folderId, driveId, prep.startPageToken, prep.shortcutRootFolderIds);
    } else {
      await runFullScan(sheetsIO, syncIO, folderId, prep.startPageToken, prep.scanRunId);
    }
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
