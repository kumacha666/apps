// エントリポイント。着手順の目安4: sync タブ基盤・index/syncタブの初回自動作成・索引upsertの
// 重複行マージ・初回スキャンのバッチ処理/中断再開に続き、残りだったchanges.list消費による
// 差分同期とルート変更後の旧ルート配下行の削除（リコンサイル）を実装した。続けて着手順の目安5:
// Service Workerストリーミングプロキシ+単曲再生、着手順の目安6: 絞り込み/除外/連続再生キューUI
// を実装済み。アルバム単位の通し再生・保存済みプレイリストは引き続き未着手（dusty-jukebox/CLAUDE.md参照）。
//
// 初回スキャン完了前（sync.tsのhasCompletedInitialScan=false）は引き続きフルスキャン
// （runFullScan、フォルダ全体の再帰走査＋バッチ処理・中断再開）を行う。完了後
// （hasCompletedInitialScan=true）はrunDifferentialSync（changes.list消費）に切り替わる。
import { AuthError, DriveAuth } from "./auth";
import { PlaybackAuthenticationRequiredError } from "./playback";
import { DualAudioPlayer, createSharedStreamIdAllocator, type PlaybackControllerLike } from "./dualAudioPlayer";
import { playbackStatusForEvent, type PlaybackStatusEvent } from "./playbackStatus";
import { PlaybackAuthenticationGate } from "./playbackAuthGate";
import { PlaybackContinuationRegistry, type PlaybackContinuation } from "./playbackContinuation";
import { parseIndexRows, filterSongs, groupSongsByAlbum, groupAlbumsByArtist, filterAlbumGroups, filterAlbumGroupsBySongs, compareAlbumGroups, sortSongs, distinctFieldValuesForFilters, type AlbumGroup, type AlbumSort, type AutocompleteField, type Song, type SongFilters } from "./catalog";
import { withTimeout } from "./withTimeout";
import { CatalogOperationGate } from "./catalogOperationGate";
import { CatalogSession } from "./catalogSession";
import { FolderPathResolver, type FolderGetFn, type FolderMeta } from "./folderPaths";
import {
  createCacheFirstFolderGetFn,
  createFolderCacheIO,
  isValidFoldersHeader,
  parseFolderCacheEntries,
  upsertFolderCacheEntries,
  type FolderCacheEntry,
} from "./folderCache";
import { PlaybackQueue, REPEAT_MODES, REPEAT_MODE_LABELS, queueRowViews, songDisplayLabel, nowPlayingLabel } from "./queue";
import { QUEUE_SORT_FIELDS, type QueueSortField } from "./queueSort";

// union型の分岐をRecordの網羅性チェックに使う（AI開発ルール4）：QUEUE_SORT_FIELDSに
// キーを追加した際、このRecordへのラベル追加漏れがあればコンパイルエラーで検出できる。
const QUEUE_SORT_FIELD_LABELS: Record<QueueSortField, string> = {
  title: "タイトル",
  artist: "アーティスト",
  album: "アルバム",
  releaseYear: "リリース年",
  track: "トラック",
};
import { registerActionHandlers, updateNowPlayingMetadata, updatePlaybackState } from "./mediaSession";
import { formatSeekTime, isSeekableDuration } from "./seekBar";
import { shouldResumeExternalPlayback } from "./externalPlayback";
import { shouldAttemptBackgroundPlaybackRecovery } from "./backgroundPlaybackRecovery";
import {
  CROSSFADE_DURATION_OPTIONS_SEC,
  DEFAULT_CROSSFADE_DURATION_SEC,
  CrossfadeOrchestrator,
  crossfadeDurationMsForSeconds,
  isCrossfadeDurationSec,
} from "./crossfade";
import { registerStreamAuthResponder, notifyServiceWorkerTokenRotated } from "./streamAuth";
import { appendDiagLogEntry, formatDiagLog, parseDiagLog, type DiagLogEntry } from "./backgroundDiag";
import {
  createChangesListFn,
  createDriveCapabilitiesGetFn,
  createDriveFetchRange,
  createDriveFileGetFn,
  createDriveGetFn,
  createDriveListFn,
  createDriveParentsGetFn,
  createDriveFolderGetFn,
  ConcurrencyLimiter,
  createGetStartPageTokenFn,
  consumeAllChanges,
  isDescendantOfRoot,
  listAudioFilesRecursive,
  validateRootFolder,
  isAuthError,
  type AudioFileEntry,
} from "./drive";
import { applyShortcutChangesToExtraRootFolderIds, folderCacheUpdatesFromChanges, planDifferentialSync } from "./differentialSync";
import { commitInitialChangeReplay, consumeChangesOrHandleExpiry } from "./initialChangeReplay";
import { extractAndBuildIndexEntries } from "./tagExtraction";
import { filterStaleUpsertEntries, retryFailedExtractions, revalidateTrashedFileIds } from "./retryExtraction";
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
  listExtractionFailedFileIds,
} from "./sheets";
import {
  ensureFoldersTabExists,
  ensureIndexAndSyncTabsExist,
  ensurePlaylistsTabsExist,
  ensureValidHeader,
  createSpreadsheetSetupIO,
  migrateLegacyIndexHeaderV1,
  migrateLegacyIndexHeaderV2,
  migrateLegacyIndexHeaderV3,
} from "./sheetsSetup";
import {
  createPlaylist,
  createPlaylistsIO,
  deletePlaylist,
  fileIdsForPlaylist,
  generateDeviceRandomId,
  isValidPlaylistsHeader,
  isValidPlaylistTracksHeader,
  parsePlaylistRows,
  parsePlaylistTrackRows,
  PLAYLISTS_SHEET_HEADER,
  PLAYLISTS_SHEET_NAME,
  PLAYLIST_TRACKS_SHEET_HEADER,
  PLAYLIST_TRACKS_SHEET_NAME,
  type Playlist,
  type PlaylistTrackRow,
  type PlaylistsIO,
} from "./playlists";
import {
  advanceStartPageToken,
  clearScanRunId,
  createSyncTabIO,
  decodeFolderIdList,
  isPendingForScanRun,
  isSyncStateCurrent,
  isValidSyncHeader,
  markInitialScanCompleted,
  readCompletedSyncStateForCatalog,
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

// Service Workerがこのページを制御する（navigator.serviceWorker.controllerが立つ）までの
// 上限（開発体制#44、2026-09-08：強制リロードはService Workerの制御下に入らない仕様の
// ブラウザ挙動があり、この待機が永久に終わらず再生系ボタンが「押せるが何も起きない・
// エラーも出ない」まま固まる不具合の対応）。E2Eでは実時間で待つとテストが遅くなるため
// 短縮する（他の機能のVITE_E2E分岐と同じ方針、playback.tsのFADE_OUT_DURATION_MS参照）。
export const SERVICE_WORKER_READY_TIMEOUT_MS = import.meta.env.VITE_E2E === "true" ? 2000 : 8000;

const auth = new DriveAuth();
let playback: DualAudioPlayer | null = null;
let queue: PlaybackQueue | null = null;
let playbackAuthGate: PlaybackAuthenticationGate | null = null;
// クロスフェード（ロールスワップ、2026-09-14〜）のオーケストレーター本体。playback/queueの
// 両方が揃うwhenPageLoaded()内で1回だけ生成する（crossfade.ts参照）。
let crossfadeOrchestrator: CrossfadeOrchestrator | null = null;
// 単曲試聴（「この曲を再生」、キュー外）で最後に再生を開始したfileId（2026-09-09、ChatGPT
// レビュー指摘：P2。ネイティブ<audio controls>を廃止したことで、従来ネイティブの再生アイコンが
// 担っていた「一時停止位置からの再開」が単曲試聴では失われていた——キュー曲は`play-pause-btn`が
// `queue.canResumeCurrent()`で同じことをするが、キュー外の単曲試聴には対応する仕組みが無かった）。
// audio.srcがキュー側の再生に取って代わられると、audio.currentTimeがこのfileIdとは無関係な
// 位置を指すため、キュー由来の再生を試みるたびに必ずnullへ戻す（handleQueuePlayback()参照）。
let lastExternalFileId: string | null = null;
// テスト専用：直前の単曲試聴開始要求（startExternalPlayback/startExternalPlaybackAt）に
// 渡されたposition引数。E2Eモックの<audio>はcurrentTimeのリセットタイミングが実ブラウザの
// 挙動と一致するとは限らないため、shouldResumeExternalPlayback()の判定結果が実際に正しい
// 引数でstartExternalPlaybackAt()へ渡ったこと自体を直接検証する（__e2eフック経由）。
let lastExternalPlaybackPositionForE2E: number | null = null;
// ユーザー自身が明示的に一時停止した（アプリの「一時停止」ボタン、またはBluetooth/OSの
// メディアキーのpause）かどうか（2026-09-15、バックグラウンド再生の不安定さ対策）。
// queue.isPlayingFromQueue()はユーザー操作による一時停止でもtrueのまま残るため、これ単独では
// 「キュー曲の再生が止まっているのは意図的な一時停止か、それともバックグラウンドでの
// フリーズ・デコード停止等でJS側が気づかないまま止まったものか」を区別できない。この
// フラグをtrueにするのは上記2つの明示的な一時停止操作の呼び出し元のみに限定し、それ以外の
// 理由（OS/ブラウザ側が<audio>を内部的にpause()した場合を含む）で発生した`pause`イベントは
// このフラグを立てない。実際に新しい再生が成功する（handlePlaybackAction()の成功分岐、
// またはmediaSessionのplayハンドラ呼び出し時）たびにfalseへ戻す。
let userPausedPlayback = false;
// キュー曲の自然終了に伴う遷移（advanceOnEnded()）が、まだコミットされていない（次の曲への
// 再生成功がまだ確定していない）ことを示すフラグ（2026-09-15、Codexレビュー指摘：P1。
// attemptBackgroundPlaybackRecovery()参照）。曲の自然終了を検知した時点（onEndedコールバック）
// でtrueにし、実際に何らかの再生が成功する（handlePlaybackAction()の成功分岐）たびにfalseへ
// 戻す。userPausedPlaybackと同じく、main.ts内の一部の呼び出し元だけがtrue/falseを操作する。
let pendingNaturalEndAdvance = false;
// pendingNaturalEndAdvanceがtrueになった時点のqueue.generationId()（2026-09-15、Codexレビュー
// 指摘：P1「Discard recovery targets when replacing the queue」）。queue.setList()（絞り込み
// による新規再生リスト作成・プレイリスト読み込み等）はこの変数（main.ts側にありPlaybackQueue内部
// ではない）に一切触れないため、pendingNaturalEndAdvanceがtrueのまま別の（無関係な）キューへ
// 差し替えられると、attemptBackgroundPlaybackRecovery()が差し替え後の新しいキューに対して
// peekNextFileId()を呼び、ユーザーが再生を要求していない新しいキューの曲を自動的に再生し始めて
// しまう。setList()のたびに進むqueue.generationId()と突き合わせ、不一致（＝記録後にキューが
// 差し替えられた）ならこのフラグ自体を無効なものとして扱う。
let pendingNaturalEndAdvanceGeneration: number | null = null;
// PlaybackQueueが実際にaudio.srcをコミットしようとした瞬間（registerQueuePlaybackContinuation()、
// onBeforePlayコールバック経由）に更新される「最後に開始された遷移が狙っている曲」（2026-09-15、
// Codexレビュー指摘：P1「Preserve targets of pending manual navigation」）。pendingNaturalEndAdvance
// は自然終了専用のため、次へ/前へ/曲名クリック/「再生」ボタン等ユーザー起因のキュー由来
// ナビゲーションが未コミットのまま固まった場合を見逃す。トリガーの種類を問わず、PlaybackQueue内の
// playAndCommit()が実際にplayer.play()を呼ぶたびに（＝onStreamIdAllocated経由でaudio.srcの
// コミット直前に）更新されるため、この値がqueue.currentPlayingFileId()と異なっていれば、その
// ナビゲーションはまだコミットされていない（＝進行中）ことを意味する。実際に何らかの再生が
// 成功する（handlePlaybackAction()の成功分岐、またはクロスフェードのonPromoted——こちらは
// handlePlaybackAction()を経由しないコミット経路のため個別の解除が必要）たびにnullへ戻す。
let pendingQueueTransitionTarget: string | null = null;
// pendingNaturalEndAdvanceGenerationと同じ理由・同じ仕組み（2026-09-15、Codexレビュー指摘：P1
// 「Discard recovery targets when replacing the queue」）。pendingQueueTransitionTarget記録時点の
// queue.generationId()を保持し、その後queue.setList()が呼ばれていないかを確認する。
let pendingQueueTransitionTargetGeneration: number | null = null;
// 「この曲を再生」（handlePlay()）が開始した外部単曲試聴のうち、まだ成否が確定していない
// もの（2026-09-16、Codexレビュー指摘：P2「Preserve a pending external playback request」）。
// キュー側の曲が既にコミット済み（canResumeCurrent()がtrue）の状態でこの外部再生を開始すると、
// その成功はnotifyExternalPlaybackStarted()（play()成功後）でのみ反映されるため、native
// play()の解決待ち中はisQueuePlayback/currentFileIdがキュー側の古い曲を指したまま残る
// （handlePlay()の冒頭でpendingNaturalEndAdvance/pendingQueueTransitionTargetを破棄しても、
// これらはキュー由来の未コミット遷移専用でこの状況を捉えられない）。この間に
// attemptBackgroundPlaybackRecovery()が発火すると、pendingNaturalEndAdvance/
// pendingQueueTransitionTargetのどちらも該当しないため最後のフォールバック分岐（既にコミット
// 済みの現在曲をそのまま再開する）へ到達し、canResumeCurrent()がtrueのままなのでキュー側の
// 古い曲を誤ってresume()し、ユーザーのより新しい外部再生要求を横取りしてしまう。fileIdを
// 記録することで、フォールバック分岐がこの間だけ自分自身を差し控えられるようにする。
// handleQueuePlayback()先頭のlastExternalFileId破棄と対称に、キュー由来の操作が開始したら
// 即座に破棄する（新しい操作が古い保留状態を無条件に上書きする既存の不変条件と同じ）。
let pendingExternalPlaybackFileId: string | null = null;
// pendingExternalPlaybackFileIdの所有権確認をfileId比較ではなく採番トークンで行う
// （2026-09-16、Codexレビュー指摘：P2「Give pending external requests unique ownership」）。
// 同一fileIdへ「この曲を再生」を連打すると（例：ダブルクリック、通信が遅い間の焦れた再クリック）、
// 先発の試行（A）と後発の試行（B）が同じfileIdを記録するため、fileId比較の所有権確認では
// Aの`finally`がBのものも自分自身のものと誤認して消してしまう（`activeFadeToken`/
// `backgroundRetryAttemptToken`と同じ採番トークン方式で解消する既存の類似バグと同型）。
let pendingExternalPlaybackToken: number | null = null;
let externalPlaybackTokenCounter = 0;
// pendingQueueTransitionTargetの所有権確認もfileId比較ではなく採番トークンで行う（2026-09-16、
// Codexレビュー指摘：P2「Use a token when clearing a failed recovery target」、
// pendingExternalPlaybackTokenと同型のバグ）。registerQueuePlaybackContinuation()はPlaybackQueueが
// 起こすあらゆるplayAndCommit()呼び出しから共通して呼ばれる唯一のsetterのため、ここで毎回
// トークンを発行する。この対象（B）への復帰（attemptBackgroundPlaybackRecovery()の
// pendingQueueTransitionTarget分岐）が未解決のまま固まっている間に、ユーザーが同じBへの
// 別のナビゲーションを開始すると、そのナビゲーションのregisterQueuePlaybackContinuation()呼び出し
// がpendingQueueTransitionTargetを同じBで（新しいトークンで）再登録する。この後で復帰側の
// resume()が失敗して解決すると、fileId比較だけの所有権確認ではこの新しいナビゲーションの
// マーカーを誤って自分のものとみなして消してしまう。
//
// 続けて2026-09-16、Codexレビュー指摘：P2「Bind each capture to its own registration」を受けて
// 設計自体を再考した。当初（18回目・19回目の修正）は、queue.resume()を呼ぶ直前に「次回の
// registerQueuePlaybackContinuation()呼び出しで発行されたトークンを教えてほしい」という
// コールバックを単一の共有スロットへ設置する方式（19回目でPendingCaptureへ切り出し、解放を
// 所有者確認付きにした）を採っていたが、この方式そのものに根本的な欠陥があった：スロットは
// 「次に発生する登録」を捕捉するだけで、それが本当に自分自身のqueue.resume()呼び出しが
// もたらした登録かどうかを相関できない。Attempt Aがまだトークン確保待ちの間にAttempt Bが
// 自分のコールバックを設置し（Bのqueue.resume()自身の内部move()操作はまだ次のマイクロタスク
// まで走らない）、その後Aのトークン確保が先に解決してAの登録が先に発火すると、Aの登録が
// （現在スロットに設置されているのがBのコールバックであるにも関わらず）Bのコールバックを
// 誤って消費し、AのトークンをBのものとして伝えてしまう。releaseIfOwnedBy()による所有権確認は
// 「解放」を保護するだけで「消費」（consume）には所有者確認が無いため、この誤消費を防げない。
//
// 根本的な解決として、単一の共有スロットへの「次の登録を当てにいく」という予約方式自体を
// 廃止した。PlaybackQueue.resume()に第3引数`onRegistered`（`queue.ts`参照）を追加し、
// playAndCommit()がonStreamIdAllocated経由で、キュー全体共有のonBeforePlayに加えて、この
// 呼び出し自身専用のコールバックへ直接・確実にstreamIdを渡すようにした。streamIdは
// PlaybackController.allocateStreamId()がこの呼び出し自身に対して発行する一意な値のため、
// 呼び出し元（attemptBackgroundPlaybackRecovery()）はqueue.resume()の第3引数として渡した
// コールバックが呼ばれるのを待つだけでよく、他の同時進行中の呼び出しの登録と取り違える余地が
// 構造的に無い（共有スロットも、それに伴う所有権の考慮も不要になった）。これにより
// `pendingCapture.ts`（`PendingCapture`）は不要になったため削除した。
let pendingQueueTransitionTargetStreamId: number | null = null;
const playbackContinuations = new PlaybackContinuationRegistry();
const catalogSession = new CatalogSession<Song>();
// catalogSessionへ最後に読み込んだ（有効な）曲一覧の出所スプレッドシートID。プレイリストの
// 読み込んで再生リストにする操作は、この値がloadedPlaylistsSpreadsheetIdと一致する場合のみ
// 許可する（2026-09-03 Codexレビュー指摘：P2。カタログをAから読み込んだ後、一覧を
// 再読み込みせずに入力欄をBへ書き換えてBのプレイリスト一覧を読み込むと、Bの保存済みfileIdを
// Aのカタログに対して解決してしまい、実際には存在する曲を「索引に見つかりませんでした」と
// 誤表示したり、最悪キューを空にして再生を止めてしまう）。catalogSession自体が無効化
// （invalidate）される箇所すべてでnullに戻す。
let loadedCatalogSpreadsheetId: string | null = null;
// アルバム検索欄（#album-search）で入力の都度、索引を再読み込みせずに絞り込み直せるように
// loadCatalog()成功時点の全アルバムグループを保持する（開発体制#39④UI-3）。
let loadedAlbumGroups: AlbumGroup[] = [];
let serviceWorkerReady: Promise<void> | null = null;
const catalogOperationGate = new CatalogOperationGate();
// アプリ起動時に1回だけ生成し、以降のプレイリスト保存操作すべてで使い回す
// （CONCEPT.md 4.3節、playlists.tsのmakeOrderKey参照）。
const deviceRandomId = generateDeviceRandomId();
// 直近にloadPlaylists()で読み込んだ一覧（一覧表示・読み込み・削除で使い回す）。
let loadedPlaylists: Playlist[] = [];
let loadedPlaylistTracks: PlaylistTrackRow[] = [];
// 一覧を読み込んだ時点のスプレッドシートID。削除操作はこれを使う（2026-09-03 Codexレビュー
// 指摘：P2）。「スプレッドシートAから一覧を読み込んだ後、入力欄をBへ書き換えてから
// （一覧を再読み込みせずに）削除ボタンを押す」と、削除操作の対象スプレッドシートをその時点の
// 入力欄の値（B）から読み取ってしまうと、Aの行を消すつもりがBへ削除要求を送ってしまう
// （通常Bには一致する行が無いため`deletePlaylist`は静かに成功し、UIはAの項目が消えたかのように
// 見せてしまう）。一覧を読み込んだ時点のスプレッドシートIDを保持し、削除は常にそちらへ送る。
let loadedPlaylistsSpreadsheetId: string | null = null;
// loadPlaylists()の複数呼び出しが重なった場合の整合性は、下記reservePlaylistsLoadTarget/
// loadPlaylists本体のコメント参照。

// バックグラウンド再生の不安定さ（2026-09-14、実機フィードバック）を実機で切り分けるための
// 調査用診断ログ（backgroundDiag.ts参照）。localStorageへ都度書き込み、ページが凍結
// （Page Lifecycleのfreeze）される直前までのイベントもできるだけ残す。
const DIAG_LOG_STORAGE_KEY = "dusty-jukebox-diag-log-v1";
let diagLog: DiagLogEntry[] = loadDiagLog();

function loadDiagLog(): DiagLogEntry[] {
  try {
    return parseDiagLog(localStorage.getItem(DIAG_LOG_STORAGE_KEY));
  } catch {
    return [];
  }
}

function logDiag(event: string, detail?: string): void {
  diagLog = appendDiagLogEntry(diagLog, { t: Date.now(), event, detail });
  try {
    localStorage.setItem(DIAG_LOG_STORAGE_KEY, JSON.stringify(diagLog));
  } catch {
    // ストレージ不可・上限超過等でも、以後のメモリ上の記録自体は継続する。
  }
}

function el<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`#${id} not found`);
  return found as T;
}

function waitForServiceWorkerControl(): Promise<void> {
  if (navigator.serviceWorker.controller) return Promise.resolve();
  return new Promise((resolve) => {
    const onControllerChange = () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      resolve();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
  });
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
      <button id="retry-extraction-btn" type="button" disabled>抽出失敗曲の再抽出を試みる</button>
      <label class="field">
        <span>試聴するGoogle DriveファイルID</span>
        <input id="play-file-id" type="text" placeholder="Google DriveファイルID" />
      </label>
      <button id="play-btn" type="button" disabled>この曲を再生</button>
      <div class="now-playing-bar">
        <audio id="audio-player"></audio>
        <!-- 旧ハンドオフ方式（PR #442〜448）が使っていた一時的な第二audio要素。ロールスワップ
             再設計（PR2、2026-09-14〜）により、クロスフェードはaudio-player-b（下記、
             DualAudioPlayerの対等な第二スロット）で行うようになったため、このJS側の参照は
             既に無い。マークアップ自体の削除はPR3（旧handoffコード整理）へ回す。 -->
        <audio id="audio-player-crossfade"></audio>
        <!-- DualAudioPlayerの対等な第二スロット。ロールスワップ再設計（PR2）でクロスフェードの
             先読み再生・音量ランプはこちら（非アクティブ側）で行い、コミット瞬間はaudio要素の
             操作を一切伴わないポインタの付け替えだけで主従を入れ替える。 -->
        <audio id="audio-player-b"></audio>
        <div class="seek-bar">
          <span id="seek-current-time" class="seek-time">0:00</span>
          <input id="seek-slider" type="range" min="0" max="0" step="0.1" value="0" disabled />
          <span id="seek-duration" class="seek-time">0:00</span>
        </div>
        <div class="mini-player-controls">
          <button id="shuffle-btn" type="button" aria-label="シャッフル" disabled>🔀</button>
          <button id="previous-btn" type="button" aria-label="前へ" disabled>⏮</button>
          <button id="play-pause-btn" type="button" aria-label="再生" disabled>▶</button>
          <button id="next-btn" type="button" aria-label="次へ" disabled>⏭</button>
          <button id="repeat-btn" class="repeat-off" type="button" aria-label="リピート: オフ" disabled>🔁</button>
        </div>
        <p id="now-playing" class="status"></p>
        <p id="playback-auth-notice" class="status error" hidden>認証の更新が必要です。クリックして続行してください。 <button id="playback-auth-refresh-btn" type="button">認証を更新して続行</button></p>
        <p id="status" class="status"></p>
      </div>
      <section class="playlists">
        <h2>保存済みプレイリスト</h2>
        <label class="field"><span>プレイリスト名</span><input id="playlist-name" type="text" placeholder="例: ドライブ用" /></label>
        <button id="save-playlist-btn" type="button">現在の再生リストをプレイリストとして保存</button>
        <button id="refresh-playlists-btn" type="button">プレイリスト一覧を更新</button>
        <ul id="playlist-list" class="result-list"></ul>
      </section>
      <ul id="result-list" class="result-list"></ul>
      <section class="diagnostics">
        <h2>バックグラウンド再生 診断ログ（調査用）</h2>
        <p>再生が止まる操作（スマホをバックグラウンドにする・Bluetoothの再生ボタン等）を再現した後、下のボタンでログを表示し、内容をコピーして共有してください。</p>
        <button id="diag-log-show-btn" type="button">診断ログを表示</button>
        <button id="diag-log-clear-btn" type="button">診断ログをクリア</button>
        <textarea id="diag-log-output" class="diag-log-output" readonly rows="10" hidden></textarea>
      </section>
      <section class="catalog">
        <h2>ライブラリ</h2>
        <button id="load-catalog-btn" type="button" disabled>索引から曲一覧を読み込む</button>
        <label class="field"><span>検索</span><input id="filter-query" type="search" placeholder="タイトル・アーティスト・アルバム・作曲者を検索" /></label>
        <label class="field"><span>アーティスト</span><input id="filter-artist" type="search" list="filter-artist-options" /></label>
        <datalist id="filter-artist-options"></datalist>
        <label class="field"><span>アルバム</span><input id="filter-album" type="search" list="filter-album-options" /></label>
        <datalist id="filter-album-options"></datalist>
        <label class="field"><span>作曲者</span><input id="filter-composer" type="search" list="filter-composer-options" /></label>
        <datalist id="filter-composer-options"></datalist>
        <div class="filter-years"><label>年（最小）<input id="filter-min-year" type="number" /></label><label>年（最大）<input id="filter-max-year" type="number" /></label></div>
        <label class="field"><span>カテゴリ（Genre）</span><input id="filter-genre" type="search" list="filter-genre-options" /></label>
        <datalist id="filter-genre-options"></datalist>
        <label class="field"><span>リリース種別</span><input id="filter-release-type" type="search" list="filter-release-type-options" /></label>
        <datalist id="filter-release-type-options"></datalist>
        <label><input id="filter-unknown-year" type="checkbox" checked /> 年不明も含める</label>
        <button id="create-queue-btn" type="button" disabled>この条件で再生リストを作る</button>
        <div><button id="unshuffle-btn" type="button" disabled>シャッフルを元に戻す</button> <button id="clear-queue-btn" type="button" disabled>再生リストをクリア</button></div>
        <label><input id="fade-out-toggle" type="checkbox" /> 手動スキップ/一時停止時にフェードアウトする</label>
        <label><input id="crossfade-toggle" type="checkbox" /> 曲間をクロスフェードする</label>
        <label>長さ
          <select id="crossfade-duration-sec">
            ${CROSSFADE_DURATION_OPTIONS_SEC.map(
              (sec) => `<option value="${sec}"${sec === DEFAULT_CROSSFADE_DURATION_SEC ? " selected" : ""}>${sec}秒</option>`
            ).join("")}
          </select>
        </label>
        <div>
          <label>並び替え
            <select id="sort-field" disabled>
              ${QUEUE_SORT_FIELDS.map((field) => `<option value="${field}">${QUEUE_SORT_FIELD_LABELS[field]}</option>`).join("")}
            </select>
          </label>
          <select id="sort-direction" disabled>
            <option value="asc">昇順</option>
            <option value="desc">降順</option>
          </select>
          <label>第二候補
            <select id="sort-secondary-field" disabled>
              <option value="">（なし）</option>
              ${QUEUE_SORT_FIELDS.map((field) => `<option value="${field}">${QUEUE_SORT_FIELD_LABELS[field]}</option>`).join("")}
            </select>
          </label>
          <select id="sort-secondary-direction" disabled>
            <option value="asc">昇順</option>
            <option value="desc">降順</option>
          </select>
          <button id="sort-btn" type="button" disabled>並び替えを適用</button>
        </div>
        <ul id="catalog-list" class="result-list"></ul>
        <h3>アルバム</h3>
        <label class="field"><span>アルバム検索</span><input id="album-search" type="search" placeholder="アルバム名・アーティスト名で検索" /></label>
        <label class="field"><span>並び順</span><select id="album-sort"><option value="artist">アーティスト名順</option><option value="album-asc">アルバム名順（昇順）</option><option value="album-desc">アルバム名順（降順）</option><option value="year-asc">リリース年順（古い順）</option><option value="year-desc">リリース年順（新しい順）</option></select></label>
        <ul id="album-list" class="result-list"></ul>
      </section>
    `
        : `<p class="status error">VITE_GOOGLE_CLIENT_ID が未設定です。.env に設定してください。</p>`
    }
  `;
}

// .now-playing-bar（画面下に固定表示、開発体制#45参照）の実際の高さを`--now-playing-bar-height`
// CSS変数へ反映する。バーの高さは#statusの文言の長さ・#playback-auth-notice表示の有無・
// OSの文字サイズ拡大等で変動するため、固定のpadding-bottomだけでは末尾コンテンツがバーの
// 下に隠れうる（2026-09-09、ChatGPTレビュー指摘：P2）。ResizeObserverでバー自身の高さの
// 変化を監視し、`#app`側の余白（index.htmlのCSS参照）をそのつど追従させる。
// render()は起動時に1回しか呼ばれないため、このobserverも1回だけ設置すれば足りる。
function observeNowPlayingBarHeight(): void {
  if (typeof ResizeObserver === "undefined") return;
  const bar = document.querySelector<HTMLElement>(".now-playing-bar");
  if (!bar) return;
  const observer = new ResizeObserver((entries) => {
    const height = entries[0]?.contentRect.height;
    if (height !== undefined) document.documentElement.style.setProperty("--now-playing-bar-height", `${height}px`);
  });
  observer.observe(bar);
}

// 開発体制#42③（プレイヤーのUI見直し、2026-09-09）：ネイティブ<audio controls>を廃止し、
// #seek-sliderへ結線する。ドラッグ中（inputイベント）は表示のみ更新し、実際のシーク
// （audio.currentTimeへの反映）はドラッグを離した時点（changeイベント）でのみ行う
// （ユーザーとの相談で確認済み：ドラッグ中に逐次シークすると、Service Worker経由の
// ストリーミングで無駄なRange要求が連発するため）。
let seekBarDragging = false;

function updateSeekDuration(duration: number): void {
  const slider = el<HTMLInputElement>("seek-slider");
  if (isSeekableDuration(duration)) {
    slider.max = String(duration);
    slider.disabled = false;
    el<HTMLSpanElement>("seek-duration").textContent = formatSeekTime(duration);
  } else {
    slider.max = "0";
    slider.disabled = true;
    el<HTMLSpanElement>("seek-duration").textContent = "0:00";
  }
}

function updateSeekPosition(currentTime: number): void {
  if (seekBarDragging) return;
  el<HTMLInputElement>("seek-slider").value = String(currentTime);
  el<HTMLSpanElement>("seek-current-time").textContent = formatSeekTime(currentTime);
}

// ロールスワップ再設計（2026-09-14〜、PR2）：シークバーは「今どちらのaudio要素が主か」で
// 動的に対象を変える必要があるため、固定のHTMLAudioElement参照ではなくDualAudioPlayerの
// active-slot façade（addEventListener("timeupdate"等)）経由で結線する。promotion自体は
// 何のDOMイベントも発火しない（不変条件）ため、promotion直後のシークバー即時更新は
// crossfadeOrchestratorのonPromotedフック（whenPageLoaded参照）が別途担う。
function wireSeekBar(playback: DualAudioPlayer): void {
  const slider = el<HTMLInputElement>("seek-slider");
  playback.addEventListener("loadedmetadata", () => updateSeekDuration(playback.activeAudioElement().duration));
  playback.addEventListener("durationchange", () => updateSeekDuration(playback.activeAudioElement().duration));
  playback.addEventListener("timeupdate", () => updateSeekPosition(playback.activeAudioElement().currentTime));
  // src差し替え時（新しい曲への切り替え）にメタデータ確定前の古いdurationを表示し
  // 続けないよう、いったんリセットする（`emptied`はリソース選択アルゴリズムの再開時に
  // 発火する、`src`属性の書き換えを含む）。
  // 2026-09-09、ChatGPTレビュー指摘：P2。ドラッグ中（input→seekBarDragging=true）に
  // 曲が切り替わる（自然終了・次へ/前へ・Bluetooth/OSメディアキー等）と、updateSeekPosition()は
  // seekBarDragging中は早期returnするため、旧曲のドラッグ状態がクリアされないまま新曲へ
  // 引き継がれてしまっていた。この状態では新曲のtimeupdateが全て無視され表示が固まるうえ、
  // 遅れて発火した旧ドラッグのchangeイベントが新曲のcurrentTimeへ旧曲の値を誤って適用しうる。
  // `emptied`はドラッグ対象自体が失効した境界のため、duration/positionのリセットより先に
  // 必ずドラッグ状態を解除する。
  playback.addEventListener("emptied", () => {
    seekBarDragging = false;
    updateSeekDuration(NaN);
    updateSeekPosition(0);
  });
  slider.addEventListener("input", () => {
    seekBarDragging = true;
    el<HTMLSpanElement>("seek-current-time").textContent = formatSeekTime(Number(slider.value));
  });
  slider.addEventListener("change", () => {
    // 2026-09-09、ChatGPTレビュー指摘：P2続き。emptiedがseekBarDraggingを解除した後
    // （曲切り替え）に、旧曲へのドラッグ由来のchangeイベントが遅れて発火することがある。
    // seekBarDraggingが既にfalseなら、このchangeはもう有効なドラッグを表さない（emptiedで
    // 打ち切られた）ため、無条件にaudio.currentTimeへ適用すると新曲の再生位置を無関係な
    // 値で誤って書き換えてしまう。ドラッグが継続中だった場合だけ実際にシークする。
    if (!seekBarDragging) return;
    // 進行中のクロスフェードがあれば打ち切る（2026-09-10、Codexレビュー指摘：P1）。ロール
    // スワップでは、シークは常にactive側のaudio要素へそのまま適用するだけでよい（不変条件：
    // アクティブ側のsrc/currentTime/play/pauseはこのクラスの外で決まる、通常の再生操作が
    // そのまま機能する）。旧設計にあった「ハンドオフが既にaudio.srcを次曲へコミット済みの
    // 場合は退場側へ復元する」という特別扱いは、role-swapではアクティブ側のsrcが
    // コミット前に変化すること自体が無いため構造的に不要になった。
    crossfadeOrchestrator?.cancel();
    playback.activeAudioElement().currentTime = Number(slider.value);
    seekBarDragging = false;
  });
}

function numberOrUndefined(value: string): number | undefined { const n = Number(value); return value.trim() === "" || !Number.isFinite(n) ? undefined : n; }
// 手動スキップ（次へ/前へ/曲名クリック/Bluetooth・OSメディアキー）・一時停止（開発体制#45、
// 2026-09-09にユーザー要望で追加）時のフェードアウト設定（開発体制#42④の一部）。
// チェックボックスの現在値をそのまま読む（永続化はしない、他のUIトグルと同じくセッション
// 内限定）。曲の自然終了時（advanceOnEnded()経由）には適用しない——将来のクロスフェード
// 機能（曲間で2曲が重なる本格版、別PR）がこの経路を専用に扱うため。
function fadeOutEnabled(): boolean {
  return el<HTMLInputElement>("fade-out-toggle").checked;
}

// 曲間のクロスフェード（開発体制#42④続き、2026-09-10。2026-09-14〜、ロールスワップ再設計
// でオーケストレーション本体をcrossfade.tsのCrossfadeOrchestratorへ移した。詳細は
// dusty-jukebox/CLAUDE.mdのクロスフェード節参照）。手動スキップ時のフェードアウトとは
// 独立したチェックボックス（既定OFF）で、キュー内の曲の自然終了時のみ適用する（手動スキップ・
// 単曲試聴・保存プレイリスト読み込み直後の先頭曲等は対象外、ユーザーとの相談で確認済み）。
function crossfadeEnabled(): boolean {
  return el<HTMLInputElement>("crossfade-toggle").checked;
}

// クロスフェード長（秒、ユーザー選択）をms換算で返す（2026-09-11、ユーザー提案：ON/OFFの隣に
// 3/5/7/10秒から選べる設定を置く）。値がCROSSFADE_DURATION_OPTIONS_SECの範囲外（DOM改変等の
// 想定外の状態）の場合は既定値へフォールバックする。
function crossfadeDurationMs(): number {
  const raw = Number(el<HTMLSelectElement>("crossfade-duration-sec").value);
  const sec = isCrossfadeDurationSec(raw) ? raw : DEFAULT_CROSSFADE_DURATION_SEC;
  return crossfadeDurationMsForSeconds(sec);
}

// 明示的な手動遷移（次へ/前へ/曲名クリック/シャッフル等キュー由来の操作、および「一時停止」
// ボタン）が進行中の件数（2026-09-10、ChatGPTレビュー指摘：P1、続けてCodexレビュー指摘で
// booleanからカウンタへ変更）。手動フェードアウト（fadeOutEnabled()時、既定約2秒）を伴う
// 操作は、この待機中も旧曲がまだ再生中のままtimeupdateが継続するため、CrossfadeOrchestrator
// 自身のcrossfading/audioPaused/isPlayingFromQueue()判定だけではクロスフェードの開始を
// 防げず、フェード完了直前のonTransitionStart()で最終的な二重commitこそ防げるものの、その
// 手前でクロスフェードが実際に開始・先読み再生してしまう窓が生じていた（PRの仕様
// 「クロスフェードはキュー内曲の自然終了時のみ、手動スキップとは別」に反する）。増減の対象は
// 「handleQueuePlayback()がhandlePlaybackAction()へ渡すクロージャ自身の実行中」（認証継続の
// 再試行時も同じクロージャが再実行されるため自然にガードが掛かる）・「一時停止ボタンの各
// クリックごとの独立したフェード完了待ち」。0より大きい間はガードが掛かる。
let manualTransitionCount = 0;

// crossfade.tsのCrossfadeOrchestratorへ渡す現在のUI状態のスナップショット。maybeStartCrossfade()
// （timeupdate駆動）・queueのonEnded（準備中に退場側が先に自然終了した場合の即時ハンドオフ
// 試行）の両方から同じ形で使う。
function crossfadeStartParams(): { enabled: boolean; durationMs: number; manualTransitionInFlight: boolean } {
  return {
    enabled: crossfadeEnabled(),
    durationMs: crossfadeDurationMs(),
    manualTransitionInFlight: manualTransitionCount > 0,
  };
}

// キュー内の曲が自然終了に近づいたら、次の曲を先読み再生しながら2曲を重ねて鳴らす
// （activeスロットのtimeupdate façade経由でDualAudioPlayerから駆動する、wireSeekBar()と同じ
// 方式）。状態機械そのものはcrossfade.tsのCrossfadeOrchestratorに持たせてある（main.tsは
// DOM結線のみを担うという本リポジトリ全体の既存方針、AI開発ルール1）。
async function maybeStartCrossfade(): Promise<void> {
  await crossfadeOrchestrator?.maybeStart(crossfadeStartParams());
}
// 前へ/次へ/シャッフル等は「再生リストに曲がある間だけ使える」操作のため、有効/無効を
// まとめて切り替える。再生/一時停止トグルはキュー外の単曲試聴にも使うため対象外。
function setQueueNavEnabled(enabled: boolean): void {
  el<HTMLButtonElement>("next-btn").disabled = !enabled;
  el<HTMLButtonElement>("previous-btn").disabled = !enabled;
  el<HTMLButtonElement>("shuffle-btn").disabled = !enabled;
  el<HTMLButtonElement>("repeat-btn").disabled = !enabled;
  el<HTMLButtonElement>("clear-queue-btn").disabled = !enabled;
  el<HTMLSelectElement>("sort-field").disabled = !enabled;
  el<HTMLSelectElement>("sort-direction").disabled = !enabled;
  el<HTMLSelectElement>("sort-secondary-field").disabled = !enabled;
  el<HTMLSelectElement>("sort-secondary-direction").disabled = !enabled;
  el<HTMLButtonElement>("sort-btn").disabled = !enabled;
  // 元に戻す対象（シャッフル履歴）は新しいリストでは常に無い状態からスタートするため、
  // ここでまとめて無効化する（シャッフル実行後にupdateUnshuffleEnabled()が個別に有効化する）。
  updateUnshuffleEnabled();
}
// シャッフルを実行した直後だけ「元に戻す」を有効化する。setQueueNavEnabled()（新しい
// 再生リスト作成時）・shuffle()/unshuffle()完了後の両方から呼ぶ。
function updateUnshuffleEnabled(): void {
  el<HTMLButtonElement>("unshuffle-btn").disabled = !(queue?.hasShuffleHistory() ?? false);
}
// 再生リストを空にして初期状態へ戻す（2026-09-09、ユーザー要望：作った再生リストをリロード
// せずリセットしたい）。setList([])は再生中の曲・除外設定・シャッフル履歴もまとめてリセット
// する（queue.tsのsetList()参照）。再生中の曲があれば、キューを空にした後にaudio要素だけが
// 鳴り続けないよう明示的に一時停止する（読み込んだプレイリストの全曲が索引から消えていた
// 場合の既存の停止処理と同じ理由。フェードは掛けず即座に止める）。
function handleClearQueue(): void {
  crossfadeOrchestrator?.cancel();
  void playback?.pause();
  // Drive側の401等でPlaybackAuthenticationGateに再生継続操作が保留され、
  // 「認証を更新して続行」（#playback-auth-notice）が表示されている状態は
  // キューとは別管理のため、setList([])だけでは解消されない（2026-09-09、
  // ChatGPTレビュー指摘：P2。放置すると、キューが空・操作ボタン無効化された
  // 後もこの通知だけが残り、「クリア済み」と「再生継続待ち」の状態が矛盾する）。
  playbackAuthGate?.clear();
  setPlaybackAuthNotice(false);
  queue?.setList([]);
  renderQueue();
  setQueueNavEnabled(false);
  setStatus("再生リストをクリアしました。");
}
function renderQueue(): void {
  const list = el<HTMLUListElement>("catalog-list"); list.innerHTML = "";
  const currentFileId = queue?.currentPlayingFileId() ?? null;
  const rows = queueRowViews(queue?.all() ?? [], (fileId) => queue?.isExcluded(fileId) ?? false, currentFileId);
  rows.forEach((row, index) => {
    const item = document.createElement("li"); item.className = "queue-item";
    if (row.isCurrent) item.classList.add("now-playing");
    const check = document.createElement("input"); check.type = "checkbox"; check.checked = !row.excluded;
    check.addEventListener("change", () => { queue?.exclude(row.song.fileId, !check.checked); renderQueue(); });
    item.append(check, " ");
    const label = document.createElement("span"); label.textContent = songDisplayLabel(row.song);
    if (row.listIndex !== null) {
      // 除外されていない曲だけクリックで再生できる（除外中の曲はlist()の対象外のため、
      // 除外を解除してから再生する運用とする）。playAt(row.listIndex)ではなくfileIdを
      // 渡すqueue.playFileId()を使う（2026-09-08、Codexレビュー指摘：listIndexは描画時点の
      // スナップショットのため、moveSong()等がpendingMove待機中の間にこの行をクリックすると、
      // 待機中の並べ替えが先に反映された後の配列に対して古いインデックスが評価され、
      // クリックした曲と異なる曲が再生されうる。fileIdで探すplayFileId()なら、先に完了した
      // 並べ替え後の状態を必ず反映する）。
      label.className = "song-link";
      const fileId = row.song.fileId;
      label.addEventListener("click", () => void handleQueuePlayback(() => queue?.playFileId(fileId, fadeOutEnabled())));
    }
    item.append(label);
    // 上下ボタン（開発体制#42②、実機フィードバック）：一覧の表示順そのままの隣接行と入れ替える
    // （除外中の行も通常の行として一覧に表示されるため、除外の有無で特別扱いしない）。
    // 並び順を変えるだけで再生を開始する操作ではないためhandleQueuePlayback()は経由しない。
    const upBtn = document.createElement("button"); upBtn.type = "button"; upBtn.textContent = "↑";
    upBtn.disabled = index === 0;
    upBtn.addEventListener("click", () => { void queue?.moveSong(row.song.fileId, "up").then(() => { renderQueue(); updateUnshuffleEnabled(); }); });
    const downBtn = document.createElement("button"); downBtn.type = "button"; downBtn.textContent = "↓";
    downBtn.disabled = index === rows.length - 1;
    downBtn.addEventListener("click", () => { void queue?.moveSong(row.song.fileId, "down").then(() => { renderQueue(); updateUnshuffleEnabled(); }); });
    item.append(" ", upBtn, downBtn);
    list.append(item);
  });
  const currentSong = rows.find((r) => r.isCurrent)?.song;
  el<HTMLParagraphElement>("now-playing").textContent = nowPlayingLabel(currentSong);
  // Bluetoothスピーカー・OSのロック画面に現在再生中の曲名・アーティストを表示する。
  updateNowPlayingMetadata(navigator.mediaSession, window.MediaMetadata, currentSong);
}
// アーティスト/アルバム/作曲者/Genre欄のdatalistへ、索引から読み込んだ曲一覧に実際に
// 存在する値だけを候補として反映する（開発体制#39④、スプレッドシートを見ないと何が
// 登録されているか分からない、という使いづらさへの対応）。
const AUTOCOMPLETE_DATALISTS: { field: AutocompleteField; datalistId: string }[] = [
  { field: "artist", datalistId: "filter-artist-options" },
  { field: "album", datalistId: "filter-album-options" },
  { field: "composer", datalistId: "filter-composer-options" },
  { field: "genre", datalistId: "filter-genre-options" },
  { field: "releaseType", datalistId: "filter-release-type-options" },
];
// 現在絞り込み欄に入力されている値一式（フィールド連動の候補計算・「この条件で再生
// リストを作る」の両方で使う絞り込み条件を1箇所に集約）。
function currentFilterValues(): SongFilters {
  return {
    query: el<HTMLInputElement>("filter-query").value,
    artist: el<HTMLInputElement>("filter-artist").value,
    album: el<HTMLInputElement>("filter-album").value,
    composer: el<HTMLInputElement>("filter-composer").value,
    genre: el<HTMLInputElement>("filter-genre").value,
    releaseType: el<HTMLInputElement>("filter-release-type").value,
    minYear: numberOrUndefined(el<HTMLInputElement>("filter-min-year").value),
    maxYear: numberOrUndefined(el<HTMLInputElement>("filter-max-year").value),
    includeUnknownYear: el<HTMLInputElement>("filter-unknown-year").checked,
  };
}
// フィールド同士を連動させる（開発体制#43：アーティストを選んでいるのに、アルバム欄の
// 候補にそのアーティスト以外のアルバムまで出るのは意味が無い、というユーザー指摘への対応）。
// 各欄の候補は、その欄自身を除いた現在の絞り込み条件で絞り込んだ曲一覧から算出する
// （distinctFieldValuesForFilters参照）。
function renderFilterSuggestions(songs: Song[]): void {
  const filters = currentFilterValues();
  for (const { field, datalistId } of AUTOCOMPLETE_DATALISTS) {
    const datalist = el<HTMLDataListElement>(datalistId);
    datalist.innerHTML = "";
    for (const value of distinctFieldValuesForFilters(songs, field, filters)) {
      const option = document.createElement("option"); option.value = value; option.textContent = value; datalist.append(option);
    }
  }
}
// 絞り込み欄のいずれかが変わるたびに、他の欄の候補一覧を連動して再計算する。renderFilterSuggestions()が
// AUTOCOMPLETE_DATALISTSの5フィールド分distinctFieldValuesForFilters()（内部でfilterSongsを1回呼ぶ）を
// 呼ぶため、1回のrefreshにつき単純な文字列比較の絞り込みが数千曲規模で最大5回走るが、
// キー入力のたびに呼んでもjankの懸念は無い（album-searchの入力連動と同じ判断。カタログ規模が
// 大きくなった場合の最適化ポイントにはなりうる、2026-09-08 ChatGPTレビュー指摘）。
// カタログ未読み込み（catalogSession.createQueue()がnullを返す）時は何もしない。
function refreshFilterSuggestions(): void {
  const songs = catalogSession.createQueue((loadedSongs) => loadedSongs);
  if (songs) { renderFilterSuggestions(songs); refreshAlbumGroups(); }
}
// アーティスト別の見出し付きで表示する（開発体制#39④UI-3、全アルバムがフラットに
// 並んでいて探しにくい、という使いづらさへの対応）。
function renderAlbumGroups(groups: AlbumGroup[], sort: AlbumSort): void {
  const list = el<HTMLUListElement>("album-list"); list.innerHTML = "";
  const appendAlbum = (group: AlbumGroup, showArtist: boolean) => {
      const item = document.createElement("li");
      const label = `${group.album}${showArtist ? ` — ${group.albumArtist}` : ""}（${group.songs.length}曲） `;
      const button = document.createElement("button"); button.type = "button"; button.textContent = "このアルバムを再生";
      button.addEventListener("click", () => {
        if (!queue) return;
        const songs = catalogSession.createQueue(() => group.songs);
        if (!songs) { setStatus("スキャンにより索引が更新される可能性があるため、曲一覧を再読み込みしてから再生リストを作成してください。", true); return; }
        queue.setList(songs); renderQueue(); setQueueNavEnabled(songs.length > 0);
        setStatus(`${group.album}の${songs.length}曲を再生リストに設定しました。`);
        void handleQueuePlayback(() => queue?.playAt(0));
      });
      item.append(label, button); list.append(item);
  };
  if (sort !== "artist") {
    for (const group of [...groups].sort(compareAlbumGroups(sort))) appendAlbum(group, true);
    return;
  }
  for (const artistGroup of groupAlbumsByArtist(groups)) {
    const heading = document.createElement("li"); heading.className = "album-artist-heading";
    heading.textContent = artistGroup.albumArtist; list.append(heading);
    for (const group of artistGroup.albums) {
      appendAlbum(group, false);
    }
  }
}
function refreshAlbumGroups(): void {
  // 曲名のフリーワード検索は曲一覧専用。アルバム一覧には指定された項目別フィルタだけを適用する。
  const groups = filterAlbumGroupsBySongs(loadedAlbumGroups, { ...currentFilterValues(), query: undefined });
  const searched = filterAlbumGroups(groups, el<HTMLInputElement>("album-search").value);
  renderAlbumGroups(searched, el<HTMLSelectElement>("album-sort").value as AlbumSort);
}
function playlistsSpreadsheetIO(spreadsheetId: string): PlaylistsIO {
  return createPlaylistsIO(spreadsheetId, () => auth.ensureAccessToken());
}

// playlists/playlist_tracksタブの自動作成・ヘッダー検証。sheetsSetup.tsのensureIndexAndSyncTabsExist
// と同じ「既存タブには一切触れない」方針だが、index/syncタブとは別のタイミング（ユーザーが
// プレイリスト機能を初めて使おうとした時点）で呼ぶため独立した関数として持つ。
async function ensurePlaylistTabsReady(spreadsheetId: string, playlistsIO: PlaylistsIO): Promise<void> {
  const setupIO = createSpreadsheetSetupIO(spreadsheetId, () => auth.ensureAccessToken());
  await ensurePlaylistsTabsExist(setupIO);
  await ensureValidHeader(
    { readHeaderRow: () => playlistsIO.readPlaylistsHeaderRow() },
    setupIO,
    PLAYLISTS_SHEET_NAME,
    PLAYLISTS_SHEET_HEADER,
    isValidPlaylistsHeader
  );
  await ensureValidHeader(
    { readHeaderRow: () => playlistsIO.readPlaylistTracksHeaderRow() },
    setupIO,
    PLAYLIST_TRACKS_SHEET_NAME,
    PLAYLIST_TRACKS_SHEET_HEADER,
    isValidPlaylistTracksHeader
  );
}

function renderPlaylistList(): void {
  const list = el<HTMLUListElement>("playlist-list");
  list.innerHTML = "";
  for (const playlist of loadedPlaylists) {
    const trackCount = fileIdsForPlaylist(loadedPlaylistTracks, playlist.playlistId).length;
    const item = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = `${playlist.name}（${trackCount}曲） `;
    const loadButton = document.createElement("button");
    loadButton.type = "button";
    loadButton.textContent = "読み込んで再生リストにする";
    loadButton.addEventListener("click", () => void handleLoadPlaylistIntoQueue(playlist.playlistId));
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.textContent = "削除";
    deleteButton.addEventListener("click", () => {
      // 元に戻せない操作のため、誤クリックによる意図しない削除を避ける確認を挟む。
      if (window.confirm(`プレイリスト「${playlist.name}」を削除しますか？この操作は取り消せません。`)) {
        void handleDeletePlaylist(playlist.playlistId);
      }
    });
    item.append(label, loadButton, deleteButton);
    list.append(item);
  }
}

// E2Eテスト（overlapping loadPlaylists()呼び出しが正しく破棄・コミットされることの検証）
// 専用のコミット回数カウンタ。本番の挙動には一切影響しない（VITE_E2E時のみ意味を持つ）。
let playlistsCommitCountForE2E = 0;

// 「ユーザーが最後に指定した対象スプレッドシートID」。呼び出し元（handleRefreshPlaylists/
// handleSavePlaylist/handleDeletePlaylist）が、実際にloadPlaylists()を呼ぶより前の、操作を
// 開始した最初の同期的なタイミングで呼ぶ（2026-09-03 Codexレビュー指摘：P2。保存操作Aが
// `createPlaylist()`の完了を待っている間に、ユーザーが別のスプレッドシートBへ切り替えて
// 手動更新を完了させても、Aの保存完了後に初めて対象を記録すると、操作の開始順ではなく
// 「実際にloadPlaylists()に到達した順」で対象が決まってしまい、後から操作したBの結果を、
// 先に操作を始めたが完了が遅れたAの結果で上書きしてしまう）。
//
// 単調増加する世代番号ではなく対象スプレッドシートIDそのもので比較する（2026-09-03 さらに
// Codexレビュー指摘：P2。世代番号方式だと、同じスプレッドシートに対する2つの読み込みが
// 重なった場合（例：保存操作自身の自動更新と、それと並行して押された手動更新）、後から
// 開始した方が先に完了していったん表示された後、先に開始したがcreatePlaylist()の完了を
// 待っていた保存側の自動更新が後から完了しても、より古い世代という理由だけで一律に破棄
// されてしまい、保存されたはずのプレイリストが次に手動更新するまで一覧に現れなかった。
// 「対象スプレッドシートが変わっていないか」だけを見る方式に変更し、同じスプレッドシートを
// 対象とした重複読み込み同士は開始順に関わらずどちらが先に完了しても構わない（最後に完了
// した方の結果がそのまま表示される。次の更新で自然に解消するため実害は小さい。sync タブ等の
// 他のTOCTOUと同じ「事前防止ではなく事後の整合」という本アプリ全体の方針の範囲内）。
let currentPlaylistsTargetSpreadsheetId: string | null = null;

function reservePlaylistsLoadTarget(spreadsheetId: string): void {
  currentPlaylistsTargetSpreadsheetId = spreadsheetId;
}

// 戻り値は実際にコミットした（＝表示に反映した）かどうか。呼び出し元は、対象スプレッドシートが
// 既に切り替えられ自分の結果が破棄された場合、その旨のステータス表示を行ってはならない
// （2026-09-03 Codexレビュー指摘：P2。破棄された古い呼び出しが、より新しい呼び出し・別の
// 操作が既に出したステータス表示を「保存しました」等で上書きしてしまう）。
async function loadPlaylists(spreadsheetId: string): Promise<boolean> {
  const playlistsIO = playlistsSpreadsheetIO(spreadsheetId);
  await ensurePlaylistTabsReady(spreadsheetId, playlistsIO);
  const playlists = parsePlaylistRows(await playlistsIO.listPlaylists());
  const playlistTracks = parsePlaylistTrackRows(await playlistsIO.listPlaylistTracks());
  // 3フィールドへの代入直前に、自分が読みに行ったスプレッドシートが依然としてユーザーの
  // 対象と一致するか確認する。既に別のスプレッドシートへ切り替えられていれば結果を破棄する。
  if (spreadsheetId !== currentPlaylistsTargetSpreadsheetId) return false;
  loadedPlaylists = playlists;
  loadedPlaylistTracks = playlistTracks;
  loadedPlaylistsSpreadsheetId = spreadsheetId;
  playlistsCommitCountForE2E += 1;
  renderPlaylistList();
  return true;
}

async function handleRefreshPlaylists(): Promise<void> {
  const spreadsheetId = el<HTMLInputElement>("spreadsheet-id").value.trim();
  if (!spreadsheetId) { setStatus("索引スプレッドシートIDを入力してください", true); return; }
  // 操作を開始した時点（最初のawaitより前）で対象を予約する。loadPlaylists()自体は
  // ensurePlaylistTabsReady等の非同期処理を経てから対象を検証するため、予約が遅れると
  // 他の操作（保存・削除に伴う自動更新等）との開始順の逆転を防げない
  // （reservePlaylistsLoadTargetのコメント参照）。
  reservePlaylistsLoadTarget(spreadsheetId);
  const button = el<HTMLButtonElement>("refresh-playlists-btn");
  button.disabled = true;
  try {
    const committed = await loadPlaylists(spreadsheetId);
    // 対象スプレッドシートが既に切り替えられ結果が破棄された場合、より新しい操作が
    // 既に出したステータス表示を上書きしないよう、何も表示しない。
    if (committed) setStatus(`プレイリスト${loadedPlaylists.length}件を読み込みました。`);
  } catch (err) {
    if (isAuthFailure(err)) auth.clearToken();
    // 対象スプレッドシートが既に切り替えられていれば、より新しい操作のステータス表示を
    // このエラーで上書きしない（2026-09-03 Codexレビュー指摘：P2。成功時の抑制と対称）。
    if (spreadsheetId === currentPlaylistsTargetSpreadsheetId) {
      setStatus(err instanceof Error ? `プレイリスト一覧の読み込みに失敗しました: ${err.message}` : "プレイリスト一覧の読み込みに失敗しました", true);
    }
  } finally {
    button.disabled = false;
  }
}

async function handleSavePlaylist(): Promise<void> {
  const spreadsheetId = el<HTMLInputElement>("spreadsheet-id").value.trim();
  const nameInput = el<HTMLInputElement>("playlist-name");
  const name = nameInput.value.trim();
  if (!spreadsheetId) { setStatus("索引スプレッドシートIDを入力してください", true); return; }
  if (!name) { setStatus("プレイリスト名を入力してください", true); return; }
  // 件数だけを見る早期リターン用の判定（曲数自体はmoveSong等の並べ替えでは変わらないため、
  // 保留中の操作を待たなくても正確）。
  if ((queue?.list().length ?? 0) === 0) { setStatus("保存する再生リストがありません。条件を指定して再生リストを作ってから保存してください。", true); return; }
  // createPlaylist()（収録曲の件数次第で数秒かかりうる）を待つ前、操作を開始した最初の
  // 同期的なタイミングで対象を予約する（2026-09-03 Codexレビュー指摘：P2。保存完了後に
  // 初めてloadPlaylists()内で対象を記録すると、保存の完了を待っている間にユーザーが別の
  // スプレッドシートへ切り替えて手動更新を先に完了させていても、後から完了したこの保存の
  // 自動更新の方が新しい対象記録を得てしまい、ユーザーの最新の操作結果を上書きしてしまう）。
  reservePlaylistsLoadTarget(spreadsheetId);
  const button = el<HTMLButtonElement>("save-playlist-btn");
  button.disabled = true;
  // whenIdle()はpendingMove待機中の他の操作（アルバム再生・絞り込み等によるsetList()、
  // またはチェックボックスでの除外）までは防げないため、保存を開始した時点の世代・
  // 除外バージョンを記録しておく（2026-09-08、Codexレビュー指摘：P2）。
  const startGeneration = queue?.generationId();
  const startExclusionVersion = queue?.exclusionVersion();
  try {
    // 上下ボタン（moveSong）等、queueへの直前の操作がplayer.play()の解決待ちでまだ
    // pendingMove内に留まっている場合があるため、実際に保存する曲順を読む前に完了を待つ
    // （2026-09-08、Codexレビュー指摘：P2。待たずに読むと、画面上で要求した並び替えより前の
    // スナップショットを保存してしまう。reservePlaylistsLoadTargetより後にすることで、
    // その対象予約自体の「操作開始時点の同期的なタイミング」という既存の前提は崩さない）。
    await queue?.whenIdle();
    // 待機中に全く別のキューへ差し替えられていないか（アルバム再生・絞り込み等）・
    // チェックボックスで除外/除外解除されていないかを確認する（2026-09-08、Codexレビュー
    // 指摘：P2続き。exclude()はsetList()を経由しないためgenerationId()だけでは検出できず、
    // 一部の曲だけ除外された場合は0曲チェックにも該当しないまま、保存開始時点と異なる
    // 内容が保存されてしまっていた）。いずれかが変わっていれば、保存開始時点の意図と
    // 無関係な曲を保存してしまうため中止する。曲数チェックは差し替え確認と合わせて
    // ここでも行う（待機中の除外操作で全曲除外された場合、世代も除外バージョンも
    // チェックだけでは「元々何曲だったか」までは分からないため）。
    if (queue?.generationId() !== startGeneration || queue?.exclusionVersion() !== startExclusionVersion) {
      setStatus("保存を待っている間に再生リストが変更されたため、保存を中止しました。内容を確認してもう一度お試しください。", true);
      return;
    }
    const fileIds = queue?.list().map((song) => song.fileId) ?? [];
    if (fileIds.length === 0) {
      setStatus("保存を待っている間に再生リストが空になったため、保存を中止しました。内容を確認してもう一度お試しください。", true);
      return;
    }
    const playlistsIO = playlistsSpreadsheetIO(spreadsheetId);
    await ensurePlaylistTabsReady(spreadsheetId, playlistsIO);
    await createPlaylist(playlistsIO, name, fileIds, deviceRandomId);
    // createPlaylist()が正常終了した時点で保存は確定している（playlists.tsのcreatePlaylist
    // コメント参照：収録曲行を先に書き終えてから本体行を追記するため、resolveした＝両方とも
    // 書き込み済み）。この後のloadPlaylists()（一覧再読み込み）はUI表示の更新でしかないため、
    // 失敗を「保存に失敗しました」として同じcatchで報告してはならない（2026-09-03 Codex
    // レビュー指摘：P2。保存自体は成功しているのに失敗と誤表示すると、ユーザーが同じ名前で
    // 再度保存し直し、新しいUUIDで重複したプレイリストを作ってしまう）。
    // nameInput.value === name（保存開始時点の名前のまま）の場合のみ空欄に戻す。await中に
    // ユーザーが次のプレイリスト名を入力し始めていた場合、その入力を消してしまわないため
    // （2026-09-03 Codexレビュー指摘：P2）。
    // 前後の空白はnameが既にtrim済みのため、比較もtrimしてから行う（2026-09-03 Codex
    // レビュー指摘：P3。入力欄の値が" Road "等の場合、trim済みnameとの単純な===比較は
    // 常に不一致になり、ユーザーが何も変更していなくても入力欄が空欄化されなくなっていた）。
    if (nameInput.value.trim() === name) nameInput.value = "";
    try {
      const committed = await loadPlaylists(spreadsheetId);
      // 対象スプレッドシートが既に切り替えられ一覧の反映が破棄された場合、より新しい操作が
      // 既に出したステータス表示を上書きしないよう、何も表示しない（2026-09-03 Codex
      // レビュー指摘：P2。保存自体は成功しているが、既に別のスプレッドシートを見ている
      // ユーザーへ「保存しました」とだけ表示すると、どちらのスプレッドシートの話か
      // 紛らわしくもなる）。
      if (committed) setStatus(`プレイリスト「${name}」（${fileIds.length}曲）を保存しました。`);
    } catch (refreshErr) {
      if (isAuthFailure(refreshErr)) auth.clearToken();
      // 対象スプレッドシートが既に切り替えられていれば、より新しい操作のステータス表示を
      // このエラーで上書きしない（2026-09-03 Codexレビュー指摘：P2）。
      if (spreadsheetId === currentPlaylistsTargetSpreadsheetId) {
        setStatus(`プレイリスト「${name}」（${fileIds.length}曲）は保存済みですが、一覧の更新に失敗しました。「プレイリスト一覧を更新」をお試しください。`, true);
      }
    }
  } catch (err) {
    if (isAuthFailure(err)) auth.clearToken();
    setStatus(err instanceof Error ? `プレイリストの保存に失敗しました: ${err.message}` : "プレイリストの保存に失敗しました", true);
  } finally {
    button.disabled = false;
  }
}

async function handleLoadPlaylistIntoQueue(playlistId: string): Promise<void> {
  if (!queue) return;
  // 読み込み済みカタログとプレイリスト一覧が別のスプレッドシートに由来している場合は拒否する
  // （2026-09-03 Codexレビュー指摘：P2）。カタログをAから読み込んだ後、一覧を再読み込みせずに
  // 入力欄をBへ書き換えてBのプレイリスト一覧を読み込むと、Bの保存済みfileIdをAのカタログに
  // 対して解決してしまい、実際には存在する曲を「索引に見つかりませんでした」と誤表示したり、
  // 最悪キューを空にして再生を止めてしまう。
  if (loadedCatalogSpreadsheetId === null || loadedCatalogSpreadsheetId !== loadedPlaylistsSpreadsheetId) {
    setStatus("曲一覧とプレイリスト一覧が別のスプレッドシートから読み込まれています。両方を同じスプレッドシートIDで読み込み直してからお試しください。", true);
    return;
  }
  const orderedFileIds = fileIdsForPlaylist(loadedPlaylistTracks, playlistId);
  const songs = catalogSession.createQueue((loadedSongs) => {
    const byFileId = new Map(loadedSongs.map((song) => [song.fileId, song]));
    return orderedFileIds.map((fileId) => byFileId.get(fileId)).filter((song): song is Song => Boolean(song));
  });
  if (!songs) {
    setStatus("スキャンにより索引が更新される可能性があるため、曲一覧を再読み込みしてからプレイリストを読み込んでください。", true);
    return;
  }
  queue.setList(songs);
  renderQueue();
  setQueueNavEnabled(songs.length > 0);
  const missingCount = orderedFileIds.length - songs.length;
  setStatus(`プレイリストから${songs.length}曲を再生リストに設定しました${missingCount > 0 ? `（${missingCount}曲は現在の索引に見つかりませんでした）` : ""}。`);
  if (songs.length > 0) {
    void handleQueuePlayback(() => queue?.playAt(0));
  } else {
    // queue.setList()は音声要素を止めないため、プレイリストの全曲が現在の索引から消えていた
    // 場合、UIは「0曲・キュー操作は無効」を表示する一方で、直前のキューの曲が鳴り続けてしまう
    // （2026-09-03 Codexレビュー指摘：P2）。再生中のものを明示的に一時停止する。
    void playback?.pause();
  }
}

async function handleDeletePlaylist(playlistId: string): Promise<void> {
  // 一覧を読み込んだ時点のスプレッドシートIDへ削除を送る（入力欄の現在値ではない）。
  // 入力欄を書き換えてから一覧を再読み込みせずに削除ボタンを押した場合、無関係な
  // スプレッドシートへ削除要求を送ってしまう問題があった（2026-09-03 Codexレビュー指摘：P2）。
  const spreadsheetId = loadedPlaylistsSpreadsheetId;
  if (!spreadsheetId) { setStatus("先にプレイリスト一覧を読み込んでください", true); return; }
  // handleSavePlaylistと同じ理由：deletePlaylist()を待つ前、操作を開始した最初の同期的な
  // タイミングで対象を予約する（2026-09-03 Codexレビュー指摘：P2）。
  reservePlaylistsLoadTarget(spreadsheetId);
  try {
    const playlistsIO = playlistsSpreadsheetIO(spreadsheetId);
    await deletePlaylist(playlistsIO, playlistId);
    // handleSavePlaylistと同じ理由：deletePlaylist()が成功した時点で削除は確定しているため、
    // 以降のloadPlaylists()（一覧再読み込み）の失敗を「削除に失敗しました」として報告しては
    // ならない（2026-09-03 Codexレビュー指摘：P3）。
    try {
      const committed = await loadPlaylists(spreadsheetId);
      // handleSavePlaylistと同じ理由：対象スプレッドシートが既に切り替えられていれば、
      // より新しい操作のステータス表示を上書きしない（2026-09-03 Codexレビュー指摘：P2）。
      if (committed) setStatus("プレイリストを削除しました。");
    } catch (refreshErr) {
      if (isAuthFailure(refreshErr)) auth.clearToken();
      // 対象スプレッドシートが既に切り替えられていれば、より新しい操作のステータス表示を
      // このエラーで上書きしない（2026-09-03 Codexレビュー指摘：P2）。
      if (spreadsheetId === currentPlaylistsTargetSpreadsheetId) {
        setStatus("プレイリストは削除済みですが、一覧の更新に失敗しました。「プレイリスト一覧を更新」をお試しください。", true);
      }
    }
  } catch (err) {
    if (isAuthFailure(err)) auth.clearToken();
    setStatus(err instanceof Error ? `プレイリストの削除に失敗しました: ${err.message}` : "プレイリストの削除に失敗しました", true);
  }
}

async function loadCatalog(): Promise<void> {
  const spreadsheetInput = el<HTMLInputElement>("spreadsheet-id");
  const loadButton = el<HTMLButtonElement>("load-catalog-btn");
  const folderInput = el<HTMLInputElement>("folder-id");
  const scanButton = el<HTMLButtonElement>("scan-btn");
  const retryButton = el<HTMLButtonElement>("retry-extraction-btn");
  const spreadsheetId = spreadsheetInput.value.trim();
  if (!spreadsheetId) { setStatus("索引スプレッドシートIDを入力してください", true); return; }
  if (!catalogOperationGate.tryAcquire()) {
    setStatus("スキャンまたは索引の読み込みが進行中です。完了してからもう一度お試しください。", true);
    return;
  }
  // Catalog parsing must not observe a sheet while a scan is mutating it.
  // Disable both operation's controls before the first await so their runs
  // cannot overlap through two consecutive user actions.
  loadButton.disabled = true; spreadsheetInput.disabled = true;
  scanButton.disabled = true; retryButton.disabled = true; folderInput.disabled = true;
  try {
    const sheetsIO = createSheetsIndexIO(spreadsheetId, () => auth.ensureAccessToken());
    const syncIO = createSyncTabIO(spreadsheetId, () => auth.ensureAccessToken());
    // Unlike scanning, catalog loading must never create or migrate tabs. It
    // still has to verify the exact schema before positional row parsing.
    if (!isValidIndexHeader(await sheetsIO.readHeaderRow())) {
      throw new Error("索引スプレッドシートの「index」タブのヘッダー行が想定と一致しません。スプレッドシートIDが正しいか、無関係な「index」タブが既に存在していないかご確認ください。");
    }
    const syncState = readCompletedSyncStateForCatalog(await syncIO.readHeaderRow(), await syncIO.readAllRows());
    const rootFolderId = syncState.rootFolderId;
    const songs = parseIndexRows(await sheetsIO.listExistingRows());

    // フォルダパス解決はfolderCache.tsの`folders`タブ（スキャン・差分同期が書き込むキャッシュ）を
    // 優先し、キャッシュに無い分だけDriveへ問い合わせる（2026-09-03、実機利用で判明：曲ごとに
    // 毎回Driveへ祖先フォルダを1階層ずつ問い合わせる従来方式は、数千フォルダ規模の実ライブラリで
    // 起動のたびに5分以上かかっていた）。`folders`タブがまだ無い場合はここで作成する（index/sync
    // タブと異なり、ヘッダー3列固定で内容の解釈に幅が無い純粋なキャッシュのため、`loadCatalog`が
    // 作成しても安全と判断。無関係な既存「folders」タブがあった場合はensureFoldersTabExists自身が
    // 一切触れず、その後のヘッダー検証で弾かれてキャッシュ無し＝Drive解決のみにフォールバックする。
    // これにより、この機能の実装後まだ一度もスキャンしていない既存ユーザーも、1回のloadCatalogで
    // 以後は高速化されるようになる。2026-09-03、ChatGPTレビュー指摘：タブ未作成のままだと
    // 次にスキャンするまで高速化の恩恵を受けられず、今回の目的〈起動時間短縮〉と直接矛盾していた）。
    let folderCache = new Map<string, FolderCacheEntry>();
    let foldersTabReady = false;
    try {
      const setupIO = createSpreadsheetSetupIO(spreadsheetId, () => auth.ensureAccessToken());
      await ensureFoldersTabExists(setupIO);
      const folderCacheIO = createFolderCacheIO(spreadsheetId, () => auth.ensureAccessToken());
      if (isValidFoldersHeader(await folderCacheIO.readHeaderRow())) {
        folderCache = parseFolderCacheEntries(await folderCacheIO.listExistingRows());
        foldersTabReady = true;
      }
    } catch {
      // フォルダキャッシュは最適化に過ぎないため、読み取り・作成自体に失敗してもDriveのみでの
      // 解決（従来通り、遅いが正しい）に静かにフォールバックする。
    }

    // キャッシュに無くDriveへ実際に問い合わせて新規に解決できたエントリだけを追跡する（cache-first
    // ゲッター自体が返す値には、このloadCatalog開始時点で読んだ既存キャッシュの値もそのまま
    // 含まれてしまうため、それらと区別する必要がある。2026-09-03、ChatGPTレビュー指摘：
    // 区別せずに全件を書き戻すと、この読み込みが長時間かかる間に他デバイスがスキャン・差分同期で
    // 該当フォルダの新しい名前をキャッシュへ書き込んでいた場合、この読み込みが開始時点で読んだ
    // 古い値でそれを上書き＝巻き戻してしまう。Drive解決した値は「その時点のDrive上の実際の値」
    // であり巻き戻しの心配が無いため、こちらだけを書き戻し対象にする）。
    const newlyResolvedFromDrive = new Map<string, FolderMeta>();
    const liveGetFolder = createDriveFolderGetFn(() => auth.ensureAccessToken());
    const trackingGetFolder: FolderGetFn = async (folderId) => {
      const meta = await liveGetFolder(folderId);
      if (meta) newlyResolvedFromDrive.set(folderId, meta);
      return meta;
    };
    const resolver = new FolderPathResolver(
      createCacheFirstFolderGetFn(folderCache, trackingGetFolder),
      [rootFolderId, ...decodeFolderIdList(syncState.shortcutRootFolderIds)]
    );
    const limiter = new ConcurrencyLimiter(6);
    let failedPathCount = 0;
    let authFailure: unknown;
    await Promise.all(songs.map(async (song) => {
      await limiter.run(async () => {
        if (authFailure) throw authFailure;
        try {
          song.folderPath = await resolver.resolve(song.parentId);
        } catch (err) {
          if (isAuthError(err)) { authFailure = err; throw err; }
          failedPathCount += 1;
          song.folderPath = "";
        }
      });
    }));
    // Driveへ実際に問い合わせて新規解決できた分だけを`folders`タブへ書き戻す。次回以降の
    // 読み込みが速くなるセルフヒーリング。`folders`タブの用意自体に失敗していた場合は書き込まない
    // （上記の作成試行がフォールバック済みのため、遅いが正しい今回の結果はそのまま使う）。
    // insertOnly=true：書き込み時点で既に存在するfolderIdは上書きしない（この読み込みが長時間
    // かかる間に、別デバイスのスキャン・差分同期・別の読み込みがそのfolderIdをより新しい値で
    // 既に書き込んでいた場合、この読み込みが開始時点のDrive応答＝相対的に古い値で巻き戻すことを
    // 防ぐ。persistFolderCache参照、2026-09-03 ChatGPTレビュー指摘）。
    // 書き込み失敗はこの読み込み自体を失敗させない（persistFolderCache内でcatch済み）。
    if (foldersTabReady) await persistFolderCache(spreadsheetId, newlyResolvedFromDrive, undefined, true);
    catalogSession.replace(songs);
    loadedCatalogSpreadsheetId = spreadsheetId;
    loadedAlbumGroups = groupSongsByAlbum(songs);
    refreshAlbumGroups();
    renderFilterSuggestions(songs);
    el<HTMLButtonElement>("create-queue-btn").disabled = false;
    setStatus(`索引から${songs.length}曲を読み込みました${failedPathCount > 0 ? `（${failedPathCount}件はパス解決に失敗）` : ""}。条件を指定して再生リストを作れます。`);
  } catch (err) {
    if (isAuthFailure(err)) auth.clearToken();
    setStatus(err instanceof Error ? `索引の読み込みに失敗しました: ${err.message}` : "索引の読み込みに失敗しました", true);
  } finally {
    catalogOperationGate.release();
    spreadsheetInput.disabled = false;
    loadButton.disabled = false;
    folderInput.disabled = false;
    scanButton.disabled = false;
    retryButton.disabled = false;
  }
}
function createQueueFromFilters(): void {
  if (!queue) return;
  const songs = catalogSession.createQueue((loadedSongs) => sortSongs(filterSongs(loadedSongs, currentFilterValues())));
  if (!songs) {
    setStatus("スキャンにより索引が更新される可能性があるため、曲一覧を再読み込みしてから再生リストを作成してください。", true);
    return;
  }
  queue.setList(songs); renderQueue(); setQueueNavEnabled(songs.length > 0);
  setStatus(`${songs.length}曲の再生リストを作りました。`);
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
    el<HTMLButtonElement>("retry-extraction-btn").disabled = false;
    el<HTMLButtonElement>("play-btn").disabled = false;
    el<HTMLButtonElement>("play-pause-btn").disabled = false;
    el<HTMLButtonElement>("load-catalog-btn").disabled = false;
  } catch (err) {
    setStatus(err instanceof AuthError ? err.message : String(err), true);
  } finally {
    loginBtn.disabled = false;
  }
}

async function handlePlay(): Promise<void> {
  const fileId = el<HTMLInputElement>("play-file-id").value.trim();
  const currentPlayback = playback;
  if (!fileId || !currentPlayback) {
    setStatus("再生するGoogle DriveファイルIDを入力してください", true);
    return;
  }
  // 同じ曲を単曲試聴中に（黄色い「一時停止」ボタン等で）一時停止した後、もう一度
  // 「この曲を再生」を押した場合は、先頭からではなく一時停止位置から再開する
  // （externalPlayback.ts参照。ended時は自然終了なので先頭から再生し直す）。activeな
  // audio要素（ロールスワップにより固定の#audio-playerではなく動的に決まる）を見る。
  const canResumeExternal = shouldResumeExternalPlayback({
    lastExternalFileId,
    fileId,
    audioPaused: currentPlayback.activeAudioElement().paused,
    audioEnded: currentPlayback.activeAudioElement().ended,
  });
  await resumeOrStartExternalPlayback(fileId, canResumeExternal);
}

async function resumeOrStartExternalPlayback(fileId: string, resumeFromCurrentPosition: boolean): Promise<void> {
  const currentPlayback = playback;
  if (!currentPlayback) return;
  // キュー由来の未コミット遷移（自然終了・手動ナビゲーションいずれも）が記録した復帰対象を
  // ここで破棄する（2026-09-16、Codexレビュー指摘：P2「Preserve a newer external playback
  // request」）。外部単曲試聴（startExternalPlayback/startExternalPlaybackAt）はキューの
  // playAndCommit()を経由しないため、pendingNaturalEndAdvance/pendingQueueTransitionTargetに
  // 一切触れない。このため、キュー側の遷移が未解決のまま固まっている間にユーザーが
  // 「この曲を再生」で無関係な外部ファイルへ切り替え、それ自体も未解決のまま固まると、
  // 後から発火したバックグラウンド復帰がこの古いキュー側の対象を優先してresume()してしまい、
  // ユーザーのより新しい外部再生要求を横取りしてしまっていた。handleQueuePlayback()が
  // 逆方向（キュー由来の操作が外部試聴の状態=lastExternalFileIdを破棄する）で既に行っている
  // のと対称に、ここでもキュー側の状態を破棄する（この外部再生自体が成功するかどうかを
  // 待たずに行う：「最新の操作が古い保留状態を無条件に上書きする」という既存の不変条件
  // 〈handlePlaybackAction()の成功分岐・handleQueuePlayback()先頭のlastExternalFileId破棄〉
  // と同じ考え方）。
  pendingNaturalEndAdvance = false;
  pendingNaturalEndAdvanceGeneration = null;
  pendingQueueTransitionTarget = null;
  pendingQueueTransitionTargetGeneration = null;
  // 進行中のクロスフェードがあれば打ち切る（role-swapでは非アクティブ側のリセットのみ、
  // アクティブ側には触れない不変条件のため、旧設計にあった「退場曲の復元情報」の管理は
  // 構造的に不要になった）。
  crossfadeOrchestrator?.cancel();
  // handleQueuePlayback()と同じ理由でガードをこのクロージャ自身の中（SW準備待ちより前）に
  // 置く（2026-09-10、ChatGPTレビュー指摘：P1）。外部単曲試聴もキュー由来の操作と同じく
  // 「明示的な手動遷移」だが、cancel()の1回きりの呼び出しだけでは、この後の
  // Service Worker準備待ちが遅延している間にキュー側の曲が末尾3秒圏内へ入った場合、外部再生が
  // まだ`queue.notifyExternalPlaybackStarted()`を呼んでおらず（`isPlayingFromQueue()`が
  // true・audio.pausedがfalseのまま）、その待機中にクロスフェードが開始・完了してしまう窓が
  // 残っていた（PR仕様「外部単曲試聴はクロスフェード対象外」に反する）。
  await handlePlaybackAction(async () => {
    manualTransitionCount += 1;
    // この外部再生の試行が未解決の間、attemptBackgroundPlaybackRecovery()のフォールバック分岐が
    // キュー側の古い「現在の曲」を誤ってresume()しないよう記録する（pendingExternalPlaybackFileId
    // の定義コメント参照）。認証継続で同じクロージャが再試行される場合も、再試行のたびに
    // 同じfileId・新しいトークンで立て直される。
    pendingExternalPlaybackFileId = fileId;
    externalPlaybackTokenCounter += 1;
    const myExternalPlaybackToken = externalPlaybackTokenCounter;
    pendingExternalPlaybackToken = myExternalPlaybackToken;
    try {
      setStatus("Service Worker経由で再生を開始しています...");
      return resumeFromCurrentPosition
        ? await startExternalPlaybackAt(fileId, currentPlayback, currentPlayback.activeAudioElement().currentTime)
        : await startExternalPlayback(fileId, currentPlayback);
    } finally {
      manualTransitionCount -= 1;
      // 同一fileIdへの別の試行（連打等）が既に自分を上書きしていた場合、その新しい試行を
      // 誤って消さない（pendingExternalPlaybackTokenの定義コメント参照。fileId比較ではなく
      // 採番トークンの一致で所有権を確認する）。
      if (pendingExternalPlaybackToken === myExternalPlaybackToken) {
        pendingExternalPlaybackFileId = null;
        pendingExternalPlaybackToken = null;
      }
    }
  });
}

async function startExternalPlayback(fileId: string, currentPlayback: PlaybackControllerLike): Promise<boolean> {
  return startExternalPlaybackAt(fileId, currentPlayback, undefined);
}

// position省略時は先頭から（旧startExternalPlayback()相当）。継続登録は
// PlaybackController.play()がstream-idを実際に確定した瞬間（PlayOptions.
// onStreamIdAllocated、audio.src設定より前）に行う（2026-09-14〜、PR2）。以前は
// `currentGeneration()+1`で次のstream-idを予測してから登録していたが、共有stream-id
// アロケータ（A/B2つのコントローラが同じ採番カウンタを使う）下ではこの予測が成立しない
// ため廃止した。isSupersededコールバックも同じ通知に含まれるため、「この呼び出しが
// 依然として自分自身のコントローラで最新か」の確認もfaçade（DualAudioPlayer）の
// 揺れ動くactiveポインタ経由ではなく、実際に呼び出した特定のコントローラのprivateな
// generationを直接参照する。
async function startExternalPlaybackAt(fileId: string, currentPlayback: PlaybackControllerLike, position?: number): Promise<boolean> {
  lastExternalPlaybackPositionForE2E = position ?? 0;
  await awaitServiceWorkerReady();
  let continuation: PlaybackContinuation | undefined;
  let isStreamSuperseded: (() => boolean) | undefined;
  const playPromise = currentPlayback.play(fileId, position, {
    onStreamIdAllocated: (streamId, isSuperseded) => {
      isStreamSuperseded = isSuperseded;
      continuation = playbackContinuations.register({
        fileId,
        streamId,
        resume: async (resumePosition) => startExternalPlaybackAt(fileId, currentPlayback, resumePosition),
      });
    },
  });
  await playPromise;
  // Do not detach the existing queue until the new file has really reached the
  // playback controller. A locally-expired token must leave the old queue song
  // eligible to advance when it ends.
  if (!continuation || !playbackContinuations.isCurrent(continuation) || isStreamSuperseded?.()) return false;
  queue?.notifyExternalPlaybackStarted();
  lastExternalFileId = fileId;
  return true;
}

async function handleQueuePlayback(action: () => Promise<boolean> | undefined, onFinalFailure: () => void = () => {}): Promise<void> {
  // キュー由来の再生を試みるということは、成功すればaudio.srcが単曲試聴とは無関係な曲へ
  // 差し替わる（失敗時に据え置いても実害は無い：単曲試聴の「resume」機会を1回逃すだけで、
  // 次回「この曲を再生」が先頭から再生し直すフォールバックへ倒れるだけのため安全側）。
  lastExternalFileId = null;
  // pendingExternalPlaybackFileIdの定義コメント参照：キュー由来の操作を開始する時点で、
  // まだ未解決の外部再生試行があっても「最新の操作が古い保留状態を無条件に上書きする」
  // 既存の不変条件に従い破棄する（handlePlay()側の対称な破棄と同じ考え方）。
  pendingExternalPlaybackFileId = null;
  pendingExternalPlaybackToken = null;
  // 進行中のクロスフェードがあれば、この明示的なナビゲーション操作を優先して打ち切る
  // （crossfadeOrchestrator.cancel()は非アクティブ側だけを後始末し、アクティブ側の
  // src/currentTime/play/pauseには一切触れない不変条件のため、旧設計にあった「退場曲の
  // 復元情報」の管理は構造的に不要になった。クロスフェード自身の完了処理はこの関数を
  // 経由しないため、ここでの打ち切りが自分自身を巻き込むことはない）。
  crossfadeOrchestrator?.cancel();
  // ガードの増減をhandlePlaybackAction()へ渡すクロージャ自身の実行中に限定する（2026-09-10、
  // Codexレビュー指摘：P1。manualTransitionCountの定義コメント参照）。handlePlaybackAction()は
  // PlaybackAuthenticationRequiredError発生時、同じ`action`引数（＝このクロージャ自身）を
  // playbackAuthGate.defer(() => handlePlaybackAction(action))で後から再実行するため、この
  // クロージャの内側に増減を置くことで、再試行時も自然に同じガードが再び掛かる（外側の
  // try/finallyでは、最初のhandlePlaybackAction()呼び出しが認証待ちで即座に正常returnした
  // 時点でガードが解除され、実際の再試行の間はガードが掛からなくなってしまっていた）。
  // increment自体はawaitServiceWorkerReady()より前に行う（2026-09-10、Codexレビュー指摘：
  // P1続き）。Service Worker準備が遅延している間はガードがまだ掛からず、その待機中に
  // timeupdateがクロスフェードを開始・完了させてしまい、準備完了後にこの手動操作の遷移と
  // クロスフェードのハンドオフの両方が競合しうる窓が残っていた。
  await handlePlaybackAction(async () => {
    manualTransitionCount += 1;
    try {
      await awaitServiceWorkerReady();
      const started = await action();
      return Boolean(started);
    } finally {
      manualTransitionCount -= 1;
    }
  }, onFinalFailure);
}

// キュー曲の自然終了に伴う次曲への遷移（onEndedコールバック・クロスフェードのフォールバック・
// バックグラウンド自動復帰のいずれからも呼ばれる共通の入口、2026-09-15、Codexレビュー指摘：
// P1）。pendingNaturalEndAdvanceを、この遷移がまだコミットされていない間trueにする
// （queue.currentPlayingFileId()の定義コメント参照）。
//
// この操作全体（Service Worker準備待ち・queue.advanceOnEnded()の両方）が最終的に失敗した
// 場合はpendingNaturalEndAdvanceをここで明示的に解除する（2026-09-15、Codexレビュー指摘：
// P2「Prefer a later manual transition over stale natural-end state」、続けて同日「Clear
// natural-end state when service-worker readiness fails」）。handlePlaybackAction()は
// handled分岐（if (started) {...}）でのみこのフラグを解除するため、advanceOnEnded()自体が
// PlaybackAuthenticationRequiredError等で実際にrejectした場合はもちろん、handleQueuePlayback()
// が呼ぶawaitServiceWorkerReady()自身がタイムアウトで失敗した場合（advanceOnEnded()自体は
// 一度も呼ばれない）も、この失敗した遷移のフラグだけが永久にtrueのまま取り残されていた。
// その状態で後から開始された別のナビゲーション（例：MediaSessionのprevioustrack）が
// onBeforePlayまで到達しpendingQueueTransitionTargetを正しく更新しても、
// attemptBackgroundPlaybackRecovery()はpendingNaturalEndAdvance分岐を優先するため、この
// 古い（既に失敗して意味を失った）自然終了の遷移先（peekNextFileId()の再評価結果）で
// ユーザーの新しいナビゲーション要求を上書きしてしまう。handleQueuePlayback()に新設した
// onFinalFailureフック（handlePlaybackAction()が実際に最終失敗として扱った時だけ呼ばれ、
// PlaybackAuthenticationRequiredErrorによる認証継続への委譲では呼ばれない）へこの解除処理を
// 渡すことで、Service Worker準備待ちの失敗・advanceOnEnded()自体の失敗のどちらも同じ箇所で
// 一律に拾える。onFinalFailureはこの呼び出し専用に渡される引数のため、他の無関係な
// handleQueuePlayback()呼び出し（次へ/前へ等、既定の何もしないonFinalFailureのまま）の
// 失敗でこのフラグが誤って解除される心配は無い。
function handleNaturalEndAdvance(): Promise<void> {
  pendingNaturalEndAdvance = true;
  pendingNaturalEndAdvanceGeneration = queue?.generationId() ?? null;
  return handleQueuePlayback(
    () => queue?.advanceOnEnded(),
    () => { pendingNaturalEndAdvance = false; pendingNaturalEndAdvanceGeneration = null; }
  );
}

// serviceWorkerReady自体はタイムアウトでラップしない生のpromise（init()参照）：もしここで
// ラップした結果をserviceWorkerReadyへ保存してしまうと、一度タイムアウトした時点でreject済みの
// まま固定され、その後Service Workerが実際に制御を取得できても以後の再生が永久に失敗し続ける
// （2026-09-08、ChatGPTレビュー指摘：P2。強制リロード以外にも、初回インストール時の低速回線・
// 一時的なネットワーク遅延でService Workerのactivate/controlが8秒を超えるケースはありうるため、
// この回帰は許容できない）。呼び出しのたびにここでタイムアウトを適用することで、前回タイムアウト
// した後でも元のserviceWorkerReadyが解決していれば次の呼び出しはすぐ成功する。
function awaitServiceWorkerReady(): Promise<void> {
  if (!serviceWorkerReady) return Promise.resolve();
  return withTimeout(
    serviceWorkerReady,
    SERVICE_WORKER_READY_TIMEOUT_MS,
    "Service Workerの準備がタイムアウトしました。強制リロード（キャッシュを無視した再読み込み）を行った場合はこのページを制御しない仕様のため、通常の再読み込みかタブを閉じて開き直してください。"
  );
}

// streamId（2026-09-14〜、PR2）：PlaybackQueueが`onBeforePlay`（BeforeQueuePlay型）として渡す
// 際、PlaybackController.play()がstream-idを実際に確定した瞬間（audio.src設定より前）に
// 呼ばれ、その正確な値がそのまま届く。以前は呼び出し元がplayer.play()を呼ぶ直前に
// `currentGeneration()+1`で次の値を予測していたが、共有stream-idアロケータ（A/B2つの
// コントローラが同じ採番カウンタを使う）下ではこの予測が成立しないため廃止した。この
// 継続自体の「まだ有効か」の判定は、PlaybackQueue自身のgeneration（playAndCommit()の
// `if (generation !== this.generation) return false;`）が既に担っており、こちらは
// stream-idベースのルーティング（401がどの継続に属するか）専用のため、PlaybackController
// 側のisSuperseded確認は不要。
function registerQueuePlaybackContinuation(fileId: string, streamId: number): void {
  // PlaybackQueue invokes this immediately before PlaybackController commits
  // audio.src. Do not wait for the queue to commit currentFileId: a Drive 401
  // can arrive while native play() is still pending.
  // pendingQueueTransitionTargetの定義コメント参照（2026-09-15、Codexレビュー指摘：P1）。
  // ここはPlaybackQueueが起こすあらゆるplayAndCommit()呼び出し（自然終了・次へ/前へ/
  // 曲名クリック/「再生」ボタン等）が共通して通る唯一の場所のため、トリガーの種類を問わず
  // 「今まさにコミットしようとしている曲」を捕捉できる。
  pendingQueueTransitionTarget = fileId;
  pendingQueueTransitionTargetGeneration = queue?.generationId() ?? null;
  // pendingQueueTransitionTargetStreamIdの定義コメント参照。streamId自体がこの呼び出しに
  // 一意なため、追加のトークン発行・共有スロットは不要（onRegisteredコールバックの直接
  // 相関で足りる）。
  pendingQueueTransitionTargetStreamId = streamId;
  playbackContinuations.register({
    fileId,
    streamId,
    resume: async (position) => queue?.resume(fileId, position) ?? false,
  });
}

function setPlaybackAuthNotice(visible: boolean): void {
  el<HTMLParagraphElement>("playback-auth-notice").hidden = !visible;
}

function handleNativePlaybackStatus(audio: HTMLAudioElement, eventType: PlaybackStatusEvent): void {
  const status = playbackStatusForEvent(eventType, {
    hasAuthenticationNotice: !el<HTMLParagraphElement>("playback-auth-notice").hidden,
    hasMediaError: audio.error !== null,
    hasEnded: audio.ended,
  });
  if (status !== null) setStatus(status);
  // クロスフェードのランプ中に主audio要素が自然終了（'ended'、同時に'pause'も発火する）しても、
  // 実際には第二audio要素経由で音声が鳴り続けているため、Media Sessionのplaybackstateを
  // "paused"にしてはならない（2026-09-10、Codexレビュー指摘：P1）。ここでpaused扱いにすると、
  // OS/ヘッドセット側の表示がPlayに切り替わり、それを押すと既に終了済みの主audio要素へ
  // 再生要求（registerActionHandlersのplayハンドラ）が飛んでしまう。
  if (eventType === "pause" && crossfadeOrchestrator?.isCrossfading()) return;
  const playPauseButton = el<HTMLButtonElement>("play-pause-btn");
  const isPlaying = eventType === "playing";
  playPauseButton.textContent = isPlaying ? "⏸" : "▶";
  playPauseButton.setAttribute("aria-label", isPlaying ? "一時停止" : "再生");
  // Bluetoothデバイス・OSのロック画面等に再生/一時停止アイコンの状態を反映する。
  updatePlaybackState(navigator.mediaSession, eventType === "playing" ? "playing" : "paused");
}

async function handlePlaybackAction(action: () => Promise<boolean>, onFinalFailure: () => void = () => {}): Promise<void> {
  try {
    const started = await action();
    logDiag("playbackAction:result", String(started));
    if (started) {
      // A newer real playback supersedes any deferred operation. This also
      // removes its notice, so a later click cannot restore an older song.
      playbackAuthGate?.clear();
      setPlaybackAuthNotice(false);
      setStatus("再生中");
      // 実際に再生が始まった以上、ユーザーは（直前に一時停止していたとしても）再生を
      // 望んでいる。次にバックグラウンドで止まった場合の自動復帰対象に含めるため解除する。
      userPausedPlayback = false;
      // 何らかの再生が実際にコミットした以上、直前の自然終了に伴う遷移（もしあれば）は
      // 解決済み（成功にせよ、この再生自体が別の理由〈手動操作等〉によるものにせよ、もはや
      // 「まだコミットされていない自然終了遷移」を代表しない）。
      pendingNaturalEndAdvance = false;
      pendingNaturalEndAdvanceGeneration = null;
      // 同じ理由でpendingQueueTransitionTargetも解除する（2026-09-15、Codexレビュー指摘：P1）：
      // 何らかの再生が実際にコミットした以上、もはや「未コミットの遷移」を代表しない。
      pendingQueueTransitionTarget = null;
      pendingQueueTransitionTargetGeneration = null;
      // キュー表示（再生中のハイライト・「再生中」ラベル）の更新は、この関数が実際の
      // 再生開始経路の唯一の合流点であるここで行う。handleQueuePlayback()（クリック・次へ/前へ・
      // 曲の自然終了）だけでなく、handleStreamTokenRejected()の認証継続再開
      // （playbackAuthGate.defer(() => handlePlaybackAction(() => continuation.resume(...)))）も
      // handleQueuePlayback()を経由せずここへ合流するため、以前handleQueuePlayback内にだけ
      // 置いていた再描画呼び出しでは、Drive 401→認証継続で再開したキュー曲の表示が
      // 更新されないまま残っていた（2026-09-03、レビュー指摘）。
      renderQueue();
    } else {
      // actionが例外を投げずに`false`を返した場合（例：advanceOnEnded()がキューの末尾に
      // 達し次の曲が無いことを検知した、next()が有効な次の曲を見つけられなかった等）も、
      // 「この操作全体は再生を開始しないまま終わった」という点では例外による最終失敗と
      // 同じ結果のため、onFinalFailureを呼ぶ（2026-09-15、Codexレビュー指摘：P2「Clear
      // natural-end state when no next track starts」）。以前はこの分岐に何も無かったため、
      // handleNaturalEndAdvance()がキューの最後の曲の自然終了（advanceOnEnded()が次の曲
      // 無しでfalseを返す、正当な「キュー終了」）を処理した後もpendingNaturalEndAdvanceが
      // trueのまま取り残されていた。後で除外していた曲を再度有効化してからページを
      // バックグラウンドにすると、attemptBackgroundPlaybackRecovery()のpendingNaturalEndAdvance
      // 分岐がpeekNextFileId()でその曲を見つけてしまい、ユーザーが再生を要求していないのに
      // 自動的に再生を開始してしまっていた。
      onFinalFailure();
    }
  } catch (err) {
    if (err instanceof PlaybackAuthenticationRequiredError && playbackAuthGate) {
      logDiag("playbackAction:authRequired");
      // 認証待ちへの委譲は「最終失敗」ではない（ユーザーが「認証を更新して続行」をクリック
      // すれば同じactionが再試行される）ため、onFinalFailureはここでは呼ばない。再試行時も
      // 同じonFinalFailureが引き継がれるよう明示的に渡す。
      playbackAuthGate.defer(() => handlePlaybackAction(action, onFinalFailure));
      setPlaybackAuthNotice(true);
      setStatus("認証の更新が必要です。下のボタンをクリックして続行してください。", true);
      return;
    }
    logDiag("playbackAction:error", err instanceof Error ? err.message : String(err));
    setStatus(err instanceof Error ? err.message : String(err), true);
    onFinalFailure();
  }
}

// バックグラウンド再生の自動復帰（2026-09-15、ユーザー要望「バックグラウンド再生時に次曲が
// 再生されない問題も解決してほしい」）：ページが再びvisible/resumeになった時点で、「キュー曲を
// 再生中のはずなのに、ユーザー自身が明示的に一時停止したわけではなく、実際の<audio>要素は
// 一時停止・未終了のまま止まっている」場合にのみ、既存の再生/一時停止トグルボタン・
// Drive 401の認証継続と同じ経路（queue.resume()、replacePendingで直列化チェーンの詰まりを
// 迂回する既存の設計）で再開を試みる。新しい並行処理上のリスクを持ち込まず、既存の
// 実績あるパスを再利用する。
//
// この関数自体は実行中かどうかに関わらず常に呼び出し可能（2026-09-15、Codexレビュー指摘：P1）。
// 一度「再入しない」ガードを実装したが、queue.resume()が最終的に呼ぶネイティブaudio.play()は
// 本アプリの他の複数箇所のコメントが警告している通り解決が保証されない（長時間pendingのまま
// 残りうる）。このガードを本関数自体に持たせると、下記の定期リトライがそうした保留中の試行を
// 起こした直後にフォアグラウンド復帰しても、視認性復帰トリガーの1回きりの呼び出しがこの
// ガードで無条件にスキップされ、以後何も再試行しないまま復帰不能になる（PR #456で実機確認済み
// だったフォアグラウンド復帰自体の回帰）。「重ねて呼ばない」責務は、無制限に呼び出しうる
// 下記の定期リトライループ側だけが持つ（そちらは呼び出し元を1箇所に限定できるため安全に管理
// できる）。
//
// pendingNaturalEndAdvance（2026-09-15、Codexレビュー指摘：P1続き）：queue.currentPlayingFileId()
// は、次の曲へのadvanceOnEnded()が実際にコミットする（成功してcurrentFileIdが更新される）まで、
// 直前に自然終了した（既に鳴り終えた）曲のfileIdを指したまま残る——PlaybackControllerは
// audio.srcを次の曲へ既に差し替えた後でnative play()を待つため、audio.currentTimeも次の曲の
// （リセットされた）位置を指しているにも関わらず、queue側の「現在の曲」はまだ直前の曲のまま
// という食い違いが生じる。この状態で無条件にqueue.resume(currentFileId, audio.currentTime)する
// と、次の曲へ進む代わりに直前の（既に終わった）曲を最初から再生し直してしまう。この関数は
// 「直前のキュー由来の遷移が自然終了に伴うadvanceOnEnded()で、まだコミットされていない」場合を
// pendingNaturalEndAdvanceフラグ（onEnded時に立て、実際の再生成功時にhandlePlaybackAction()の
// 成功分岐でのみ解除する）で検知する。この場合、単純にadvanceOnEnded()自体を再試行しても、
// 元の遷移のネイティブplay()がqueue.pendingMoveに未解決のまま残っている限り、replacePendingを
// 指定しない通常のnext()はその後ろへ直列に連結されるだけで実行されないため、下記の分岐で
// resume()（replacePending方式）へ正しい遷移先を明示的に渡す形で迂回する。
//
// queue.invalidatePendingMove()の呼び出し（2026-09-15、Codexレビュー指摘：P2「Invalidate the
// bypassed natural-end operation」）：resume(..., replacePending=true)はqueue.pendingMoveの
// 直列化チェーンだけを置き換え、PlaybackQueue.generationは一切進めない（queue.tsのmove()参照）。
// このため、バイパスした元の（まだ未解決のまま残っている）自然終了の遷移が持つ古いgenerationは、
// バイパス後も現在のgenerationと一致したままになる。この元の遷移のネイティブplay()が後から
// （このバイパスが成功しコミットした後、さらに次の曲へ自然進行した後ですら）遅れて解決すると、
// playAndCommit()のgeneration一致チェックをそのまま通過し、currentFileIdを（既に古くなった）
// 曲2へ巻き戻してしまう——ハイライト表示が古いまま固定され、次の自然終了が曲2を再び選んで
// しまう。invalidatePendingMove()でgenerationを明示的に進めてから迂回することで、バイパスされた
// 元の遷移が後から解決してもgeneration不一致でfalseに収束し、新しい状態を巻き戻せなくする。
// 下記の（自然終了に伴わない）通常のresume()分岐にも同じ理由で適用する：定期リトライ・
// フォアグラウンド復帰の両トリガーが無制限にこの関数を呼びうるため、先に発行された
// resume()呼び出し（同じくreplacePending方式でネイティブplay()の解決が保証されない）が
// 未解決のまま残っている間に後続の呼び出しがバイパスする、という同型のレースが起こりうる。
function attemptBackgroundPlaybackRecovery(): Promise<void> | null {
  if (!playback || !queue) return null;
  // ユーザー自身が明示的に一時停止した場合は、どの分岐であっても勝手に再開しない
  // （2026-09-15、Codexレビュー指摘：P1「Recover the first pending queue track」を
  // 踏まえた再設計）。以前は下記のshouldAttemptBackgroundPlaybackRecovery()（canResumeCurrent
  // ガード込み）を関数の先頭で一括して確認していたため、新規キュー作成直後の最初の
  // playAt(0)がまだコミットしていない場合（isQueuePlayback/currentFileIdがまだ両方とも
  // 初期値のまま＝canResumeCurrent()がfalse）は、この時点で関数全体が早期returnし、
  // 下のpendingQueueTransitionTarget分岐（実際に固まっている最初の曲への正しい迂回先を
  // 持っている）へ一切到達できなかった。userPausedPlaybackだけを独立した最初のガードとして
  // 残し（一時停止時はどの分岐でも再開すべきではないため）、canResumeCurrent/audioPaused/
  // audioEndedのチェックは「既にコミット済みの現在曲をそのまま再開する」最後のフォール
  // バック分岐だけに限定する。
  if (userPausedPlayback) return null;
  const audio = playback.activeAudioElement();
  // キューがsetList()（絞り込みによる新規再生リスト作成・プレイリスト読み込み等）で
  // 丸ごと差し替えられた後は、その差し替え前に記録されたpendingNaturalEndAdvance/
  // pendingQueueTransitionTargetはもはや無関係（2026-09-15、Codexレビュー指摘：P1
  // 「Discard recovery targets when replacing the queue」）。setList()自体はこれら
  // main.ts側の変数に一切触れないため、記録時点のqueue.generationId()と現在値を
  // 突き合わせて不一致なら静かに破棄する（記録時点のpendingNaturalEndAdvanceGeneration
  // コメント参照）。
  const currentQueueGeneration = queue.generationId();
  if (pendingNaturalEndAdvance && pendingNaturalEndAdvanceGeneration !== currentQueueGeneration) {
    pendingNaturalEndAdvance = false;
    pendingNaturalEndAdvanceGeneration = null;
  }
  if (pendingQueueTransitionTarget !== null && pendingQueueTransitionTargetGeneration !== currentQueueGeneration) {
    pendingQueueTransitionTarget = null;
    pendingQueueTransitionTargetGeneration = null;
  }
  if (pendingNaturalEndAdvance) {
    // 直前の自然終了に伴う遷移（advanceOnEnded()）自体を素朴に再試行しても、その遷移の
    // ネイティブplay()がまだ未解決のままqueue.pendingMoveに残っている限り、次の曲への
    // move()はreplacePendingを指定しない通常のnext()経由のため、その未解決のpendingMoveの
    // 後ろへ直列に連結されるだけで実行されない（2026-09-15、Codexレビュー指摘：P1続き。
    // queue.ts:214-229のmove()参照）。resume()と同じreplacePending方式で直列化チェーンの
    // 詰まりを迂回しつつ、正しい遷移先（リピート設定を反映した自然終了先）をpeekAdvanceTarget()で
    // 先読みしてresume()へ明示的に渡す（resume()自体はfindNext()を使わないため、この
    // 先読みが必須）。
    const nextFileId = queue.peekAdvanceTarget();
    // 次の曲が無い（キューの残り全曲が除外済みになった等）場合、単に何もしないだけでは
    // 済まない（2026-09-16、Codexレビュー指摘：P2「Invalidate a natural-end move when its
    // target is excluded」）。この早期returnがpendingNaturalEndAdvanceを解除せず、かつ元の
    // （まだ未解決のまま固まっている）自然終了の遷移も無効化しないと、①この関数は以後の
    // あらゆるリトライで同じ早期returnを繰り返すだけになり、`pendingQueueTransitionTarget`
    // 分岐・最後のフォールバック分岐のどちらにも一切到達できなくなる、②exclude()は
    // queue.generationを一切進めないため、元の遷移の古いgenerationは現在のgenerationと
    // 一致したまま残り、そのネイティブplay()が後から遅れて解決すると、`playAndCommit()`の
    // generation一致チェックをそのまま通過し、今除外したはずの曲をcurrentFileIdへcommitして
    // 実際に再生してしまう。invalidatePendingMove()で元の遷移を無効化し、
    // pendingNaturalEndAdvanceも解除して次回以降このデッドエンドの分岐へ入らないようにする。
    // queue.invalidatePendingMove()はqueue自身のgenerationしか進めず、PlaybackController側の
    // generationには一切触れない（2026-09-16、Codexレビュー指摘：P2「Cancel the native
    // transition when abandoning an excluded target」）。他の分岐（後続で必ずqueue.resume()を
    // 呼ぶ＝新しいplayer.play()呼び出しが自然にisSuperseded()経由で元の遷移を追い越す）とは
    // 異なり、この分岐はここで諦めるだけで新しいplay()を呼ばないため、元の（除外済みの曲を
    // 対象とした）ネイティブplay()自体はplayer側では何も無効化されないまま残る。それが後から
    // 遅れて解決すると、queue側のcommitはgeneration不一致で拒否される一方、audio要素は実際に
    // その除外済みの曲を鳴らし始めてしまう。playback.cancelPendingTransition()で
    // PlaybackController側のgenerationも進め、既存のisSuperseded()安全網（audio.srcが
    // 一致する場合にaudio自身をpause()する）を発火させる。
    if (!nextFileId) {
      queue.invalidatePendingMove();
      playback.cancelPendingTransition();
      pendingNaturalEndAdvance = false;
      pendingNaturalEndAdvanceGeneration = null;
      return null;
    }
    logDiag("backgroundRecovery:attempt", `${document.visibilityState} advance`);
    queue.invalidatePendingMove();
    return handleQueuePlayback(() => queue?.resume(nextFileId, 0));
  }
  const currentFileId = queue.currentPlayingFileId();
  // pendingQueueTransitionTargetの定義コメント参照（2026-09-15、Codexレビュー指摘：P1
  // 「Preserve targets of pending manual navigation」）。自然終了以外の、ユーザー起因の
  // キュー由来ナビゲーション（次へ/前へ/曲名クリック/「再生」ボタン等）も、
  // PlaybackControllerがaudio.srcを新しい曲へ既に差し替えた後でnative play()を待つため、
  // その遷移がまだコミットされていない間はcurrentPlayingFileId()が依然として遷移前の
  // （outgoingの）曲を指す。pendingNaturalEndAdvanceは自然終了専用のため、この場合は上の
  // 分岐へ落ちず、下記のcurrentPlayingFileId()を無条件にresume()する素朴な実装のままだと、
  // 進行中のナビゲーションを（queue.invalidatePendingMove()で）無効化した上で誤った
  // （古い）曲を再生してしまう。pendingQueueTransitionTargetがcurrentFileIdと異なる場合、
  // そのナビゲーションはまだコミットされていないことを意味するため、pendingNaturalEndAdvance
  // 分岐と同じreplacePending方式でその正しい遷移先へ迂回する。
  if (pendingQueueTransitionTarget !== null && pendingQueueTransitionTarget !== currentFileId) {
    logDiag("backgroundRecovery:attempt", `${document.visibilityState} pendingTarget`);
    const target = pendingQueueTransitionTarget;
    queue.invalidatePendingMove();
    // resume(target, 0)は対象が除外済み等で無効な場合、例外を投げずfalseを返すだけで
    // player.play()自体を一度も呼ばない（queue.tsのresume()参照）。この失敗をonFinalFailureで
    // 拾わないと（2026-09-16、Codexレビュー指摘：P2「Discard excluded recovery targets」）、
    // pendingQueueTransitionTargetがこの無効な値のまま取り残され、以後のあらゆるリトライ
    // （定期リトライ・フォアグラウンド復帰の両方）がこの同じ失敗するresume()を無期限に
    // 繰り返し、下の「既にコミット済みの現在曲をそのまま再開する」フォールバック分岐へ
    // 一切到達できなくなる——復帰機能そのものが恒久的に機能しなくなる回帰。
    //
    // 続けて2026-09-16、この解除自体をpendingQueueTransitionTargetStreamId（定義コメント参照）で
    // 所有権確認するよう修正（Codexレビュー指摘：P2「Use a token when clearing a failed
    // recovery target」→「Clear only the capture owned by this recovery」→「Bind each capture
    // to its own registration」の3ラウンドを経て、単一の共有スロットへ「次の登録を当てにいく」
    // という予約方式自体を廃止した最終形）。fileId比較だけ（===target）では、このresume()が
    // 失敗して解決する前に、ユーザーが同じBへの別のナビゲーションを開始しonBeforePlay経由で
    // pendingQueueTransitionTargetを（新しいstreamIdで）B自身へ再登録していた場合、そのより
    // 新しいマーカーを自分自身のものと誤認して消してしまう。queue.resume()の第3引数
    // `onRegistered`（queue.tsのplayAndCommit()参照）が、この呼び出し自身の登録が実際に起きた
    // 時にstreamIdを直接渡してくれるため、他の同時進行中の呼び出しの登録と取り違える余地が
    // 構造的に無い（共有スロットも所有権の考慮も不要）。
    //
    // originalStreamIdはこの分岐へ入った時点（invalidatePendingMove()より前）の値を保持する。
    // resume(target, 0)が対象の除外等でregisterQueuePlaybackContinuation()に一度も到達しない
    // 場合、onRegisteredも呼ばれずmyStreamIdはnullのまま残る——この場合に「自分自身のstreamId
    // との一致」だけを条件にすると、この試行が何も新しく登録していないにも関わらず、元々
    // 登録されていた（この分岐へ入った理由そのものである）値との一致を検出できず、誰も
    // 上書きしていないのに解除できなくなってしまう（このPRが直そうとした「Discard excluded
    // recovery targets」の回帰）。resume()が一度も登録に到達しなかった場合は、代わりに
    // originalStreamIdとの一致（＝この試行が始まってから誰も新しく登録していないこと）で
    // 判定する。
    const originalStreamId = pendingQueueTransitionTargetStreamId;
    let myStreamId: number | null = null;
    return handleQueuePlayback(
      () => queue?.resume(target, 0, (streamId) => { myStreamId = streamId; }),
      () => {
        const expectedStreamId = myStreamId ?? originalStreamId;
        if (
          pendingQueueTransitionTarget === target &&
          pendingQueueTransitionTargetStreamId === expectedStreamId
        ) {
          pendingQueueTransitionTarget = null;
          pendingQueueTransitionTargetGeneration = null;
        }
      }
    );
  }
  // ここまで到達するのは、pendingNaturalEndAdvance/pendingQueueTransitionTargetのいずれも
  // 該当しない場合——つまり「既にコミット済みの現在曲をそのまま再開する」フォールバックの
  // ケースに限られる。
  //
  // pendingExternalPlaybackFileIdの定義コメント参照（2026-09-16、Codexレビュー指摘：P2
  // 「Preserve a pending external playback request」）。キュー側の曲が既にコミット済み
  // （canResumeCurrent()がtrue）の状態で「この曲を再生」を開始すると、その外部再生の
  // native play()が未解決の間はqueue.isQueuePlayback/currentFileIdがキュー側の古い曲を
  // 指したまま残る（notifyExternalPlaybackStarted()は成功後にしか呼ばれないため）。この
  // 外部再生はpendingNaturalEndAdvance/pendingQueueTransitionTargetのどちらにも一切触れない
  // （queueのplayAndCommit()を経由しないため）ため、上の2分岐はどちらも該当せずここへ
  // 到達してしまう。この間にこのフォールバックがcanResumeCurrent()==trueのまま古い曲を
  // resume()してしまうと、ユーザーのより新しい外部再生要求を横取りする。
  if (pendingExternalPlaybackFileId !== null) return null;
  // このケースだけ、既に再生中（audioPaused===false）・自然終了直後
  // （audioEnded===true、次の'ended'処理に委ねる）・再開できる状態にない
  // （canResumeCurrent===false）場合に不要な再開を試みないようshouldAttemptBackground
  // PlaybackRecovery()で確認する。
  const shouldRecover = shouldAttemptBackgroundPlaybackRecovery({
    userPausedPlayback,
    canResumeCurrent: queue.canResumeCurrent(),
    audioPaused: audio.paused,
    audioEnded: audio.ended,
  });
  if (!shouldRecover || !currentFileId) return null;
  logDiag("backgroundRecovery:attempt", `${document.visibilityState} resume`);
  queue.invalidatePendingMove();
  return handleQueuePlayback(() => queue?.resume(currentFileId, audio.currentTime));
}

// バックグラウンドのままでの定期リトライ（2026-09-15、実機フィードバック「PCは良いがスマホの
// ロック中に再生できないのは致命的」を受けて追加）。上記のattemptBackgroundPlaybackRecovery()は
// フォアグラウンド復帰（visibilitychange/resume）でのみ発火するため、ロックしたまま放置される
// 限り自動では復帰しなかった。実機ログで、曲の自然終了直後（documentがhiddenのまま、まだ
// freezeはしていない状態）に次曲への接続自体が失敗するケースを確認しており（Chromeが
// バックグラウンドタブの音声出力の有無でネットワーク/タイマーの抑制度合いを変えている可能性が
// ある。曲間の一瞬の無音の間に次の接続を試みて失敗している）、少し待ってから再試行すれば
// 接続し直せることを期待する。ブラウザ自身がバックグラウンドタブのタイマー間隔を経過時間に
// 応じて自動的に間引く（タブが長時間隠れているほど間隔を伸ばす）ため、ここでは固定間隔の
// setIntervalのみとし、独自のバックオフスケジュールは持たない。
//
// 前回の試行がまだ解決していない間は重ねて発行しない（queue.resume()はreplacePendingで
// 直列化チェーンの詰まりを迂回する設計のため、無条件に重ねて呼ぶと同じストリームへの要求が
// 重複しうる）。このガードはこのループ専用で、呼び出し元がこのsetInterval1箇所に限定される
// ため安全に管理できる——フォアグラウンド復帰トリガー側のattemptBackgroundPlaybackRecovery()
// 呼び出しはこのガードの影響を受けず、常に独立して試行できる（上記コメント参照）。
//
// 単純なbooleanではなく採番トークンで管理する（2026-09-15、Codexレビュー指摘：P2。
// queue.tsのactiveFadeTokenと同じ方針）：hidden→visible→hiddenと短時間で往復すると、
// visible化時にstopBackgroundRetryLoop()がタイマーを止めても、その時点で進行中だった試行
// （A）自体はバックグラウンドで解決し続ける。その後再度hiddenになり新しい試行（B）が始まった
// 後にAが遅れて解決すると、単純なbooleanではAのfinallyが無条件にfalseへ戻してしまいBの
// 「in-flight」状態を誤って解除し、次のtickがBとは別のCを並行して開始してしまう
// （C自身のqueue.resume(..., replacePending=true)がBを横取りし、正常に進行していたはずの
// Bの復帰を妨げる）。採番トークンなら、Aのfinallyは「自分がまだ現在のトークンか」を確認して
// からのみクリアするため、この誤ったクリアが起きない。
const BACKGROUND_RETRY_INTERVAL_MS = import.meta.env.VITE_E2E === "true" ? 50 : 10_000;
let backgroundRetryTimer: ReturnType<typeof setInterval> | null = null;
let backgroundRetryAttemptToken: number | null = null;
let backgroundRetryTokenCounter = 0;
function startBackgroundRetryLoop(): void {
  if (backgroundRetryTimer !== null) return;
  backgroundRetryTimer = setInterval(() => {
    if (backgroundRetryAttemptToken !== null) return;
    const attempt = attemptBackgroundPlaybackRecovery();
    if (!attempt) return;
    backgroundRetryTokenCounter += 1;
    const myToken = backgroundRetryTokenCounter;
    backgroundRetryAttemptToken = myToken;
    void attempt.finally(() => {
      if (backgroundRetryAttemptToken === myToken) backgroundRetryAttemptToken = null;
    });
  }, BACKGROUND_RETRY_INTERVAL_MS);
}
function stopBackgroundRetryLoop(): void {
  if (backgroundRetryTimer !== null) {
    clearInterval(backgroundRetryTimer);
    backgroundRetryTimer = null;
  }
  // 進行中だった試行の追跡自体を手放す（次回startBackgroundRetryLoop()が新しいトークンを
  // 発行するため、後から解決するこの試行のfinallyは自身のトークンと一致せず無害になる）。
  backgroundRetryAttemptToken = null;
}

// StreamTokenIssuedHandlerの4番目の引数（streamAuth.tsの命名上は`playbackGeneration`）は、
// SWがURLのクエリパラメータからそのまま読み取った値で、実体はstream-id（playback.tsの
// streamUrl()参照）そのもの。ここではstreamIdという名前で受ける。
function handleStreamTokenIssued(fileId: string, requestId: string, token: string | null, streamId: number): void {
  playbackContinuations.recordTokenRequest(requestId, fileId, streamId, token);
}

function handleStreamTokenRejected(fileId: string, requestId: string): void {
  logDiag("sw:401", fileId);
  const continuation = playbackContinuations.acceptTokenRejection(requestId, fileId, auth.getAccessToken());
  if (!continuation || !playback || !playbackAuthGate) return;
  // クロスフェードの先読み（まだpromotionされていない）自身のstreamへの401は、通常の認証継続
  // フローへ進めず静かにクロスフェードを中止する（2026-09-14〜、ChatGPTレビュー指摘：P1）。
  // active側（A）は無関係の別ストリームで問題なく再生を続けているため、ユーザーへ再認証を
  // 要求してA側の再生まで中断させる必要が無い（v1から続く既知の設計：クロスフェード自体は
  // 401リトライフローにフックしない）。promotion済みの同じstreamIdへの401は
  // isPendingPreview()がfalseを返すため、以下の通常経路（認証継続UI）で復旧する。
  if (crossfadeOrchestrator?.isPendingPreview(fileId, continuation.streamId)) {
    crossfadeOrchestrator.cancel();
    return;
  }
  const position = playback.markStreamTokenRejected(fileId, continuation.streamId);
  if (position === null) return;
  // A Drive-side revocation can happen before expiresAt. Clear only the token
  // that was actually used by this still-current stream request.
  auth.clearToken();
  continuation.position = position;
  playbackAuthGate.defer(() => handlePlaybackAction(() => continuation.resume(continuation.position)));
  setPlaybackAuthNotice(true);
  setStatus("認証の更新が必要です。下のボタンをクリックして続行してください。", true);
}

async function continuePlaybackAfterAuthentication(): Promise<void> {
  const refreshButton = el<HTMLButtonElement>("playback-auth-refresh-btn");
  if (!playbackAuthGate?.hasPendingOperation()) return;
  refreshButton.disabled = true;
  try {
    setStatus("認証を更新中...");
    await playbackAuthGate.continueFromUserGesture();
  } catch (err) {
    setStatus(err instanceof Error ? `認証の更新に失敗しました: ${err.message}` : "認証の更新に失敗しました", true);
  } finally {
    refreshButton.disabled = false;
    if (!playbackAuthGate.hasPendingOperation()) setPlaybackAuthNotice(false);
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
// フォルダ名キャッシュ（folderCache.ts）への書き込み。起動時のloadCatalog()がDriveへ曲ごとに
// フォルダパスを問い合わせていた（実ライブラリで5分以上かかっていた）問題への対処で、
// スキャン・差分同期のついでに発見したフォルダのid→{name,親ID}をタブへ反映する。
// これはあくまで起動時間短縮のための最適化キャッシュであり、書き込みに失敗してもスキャン
// 自体は失敗として扱わない（次回のスキャン・差分同期で自己修復する。folders タブが既に
// 存在するが無関係な内容の場合は静かにスキップする＝index/syncタブのような例外は投げない）。
// isStillCurrent: スキャン・差分同期からの呼び出しでは、書き込み直前にroot/tokenの所有権を
// 再確認するために渡す（sync.tsのisSyncStateCurrent、index側の書き込みで既に徹底している対策と
// 揃える。2026-09-03、ChatGPTレビュー指摘：以前はこのチェックが無く、別デバイスが既に新しい
// root/tokenへ切り替えていても、そのことに気づく前にfoldersタブへ書き込んでしまっていた）。
// loadCatalog（起動時の読み込み）からの呼び出しはscanRunId等の実行所有権という概念自体を
// 持たないため渡さない。代わりにinsertOnly=trueを渡す：Driveから取得した値も「書き込み時点で
// 最新」とは限らない（この読み込みが長時間かかる間に、別デバイスのスキャン・差分同期・別の
// 読み込みが同じfolderIdを新規に書き込む競合がありうる）ため、loadCatalogからの書き戻しは
// 既存行を上書きしない（folderCache.tsのupsertFolderCacheEntries参照、2026-09-03
// ChatGPTレビュー指摘）。
async function persistFolderCache(
  spreadsheetId: string,
  folderEntries: Map<string, { name: string; parentId?: string }>,
  isStillCurrent?: () => Promise<boolean>,
  insertOnly = false
): Promise<void> {
  if (folderEntries.size === 0) return;
  try {
    if (isStillCurrent && !(await isStillCurrent())) return;
    const setupIO = createSpreadsheetSetupIO(spreadsheetId, () => auth.ensureAccessToken());
    await ensureFoldersTabExists(setupIO);
    const folderCacheIO = createFolderCacheIO(spreadsheetId, () => auth.ensureAccessToken());
    if (!isValidFoldersHeader(await folderCacheIO.readHeaderRow())) return;
    const normalized = new Map<string, FolderCacheEntry>();
    for (const [id, entry] of folderEntries) normalized.set(id, { name: entry.name, parentId: entry.parentId ?? "" });
    await upsertFolderCacheEntries(folderCacheIO, normalized, undefined, insertOnly);
  } catch (err) {
    console.error("フォルダキャッシュの更新に失敗しました（次回のスキャンで自己修復します）", err);
  }
}

async function runFullScan(
  sheetsIO: SheetsIndexIO,
  syncIO: SyncTabIO,
  folderId: string,
  driveId: string | undefined,
  startPageToken: string,
  scanRunId: string,
  spreadsheetId: string
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
  const folderEntries = new Map<string, { name: string; parentId: string }>();
  const entries = await listAudioFilesRecursive(listFn, folderId, "", failedFolders, undefined, shortcutTargetFolderIds, undefined, folderEntries);
  renderResults(entries, failedFolders);
  await persistFolderCache(spreadsheetId, folderEntries, () => isSyncStateCurrent(syncIO, { rootFolderId: folderId, startPageToken, scanRunId }));

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
      const initialChangesCompleted = await runDifferentialSync(
        sheetsIO,
        syncIO,
        folderId,
        driveId,
        startPageToken,
        [...shortcutTargetFolderIds],
        spreadsheetId,
        { completedAt: new Date().toISOString(), scanRunId }
      );
      // 差分再生でフォルダ取得失敗・410・別デバイスとの競合が発生した場合は、初回一覧と
      // startPageTokenの組み合わせがまだ完了状態ではない。成功表示やscanRunIdのクリアへ進むと
      // 次回の再開に必要なウォーターマークを失うため、ここで止める。
      if (!initialChangesCompleted) return;
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
  spreadsheetId: string,
  initialCompletion?: { completedAt: string; scanRunId: string }
): Promise<boolean> {
  setStatus("前回からの変更を確認中...");
  const changesListFn = createChangesListFn(() => auth.ensureAccessToken(), driveId);
  // 410検知（保存済みstartPageTokenが古すぎるとDrive APIが返す、変更履歴保持期間切れ）〜
  // 復旧のオーケストレーション全体をinitialChangeReplay.tsのconsumeChangesOrHandleExpiryへ
  // 切り出し、main.tsはconsumeAllChanges/resetForFullRescanをバインドして呼ぶだけの薄い窓口に
  // する（2026-08-24 Codexレビュー指摘：P1）。handleTokenExpiryReset単体をテストしても、
  // main.tsのtry/catch自体（410だけを捕捉し復旧するか、それ以外は再throwするか）は
  // main.tsのcatch節を実際に実行しない限り検証できないという指摘を受け、410を投げる
  // フェイクのconsumeAllChangesでこの呼び出し境界ごと駆動できるようにした。initialCompletionが
  // ある場合（初回差分再生中）は自分自身のscanRunIdも渡す。渡さないと、所有権を失った実行が
  // root/tokenの一致だけで、既に別デバイスが確保した正当な状態をリセットしうる
  // （2026-08-21〜24の一連のCodexレビュー指摘）。
  const consumeResult = await consumeChangesOrHandleExpiry(
    {
      consumeAllChanges: (token) => consumeAllChanges(changesListFn, token),
      resetForFullRescan: (expected) => resetForFullRescan(syncIO, expected),
    },
    { rootFolderId: folderId, startPageToken, initialScanRunId: initialCompletion?.scanRunId }
  );
  if (!consumeResult.ok) {
    setStatus("変更履歴の保持期限切れのため、次回のスキャンはフルスキャンからやり直します。もう一度スキャンを実行してください。", true);
    return false;
  }
  const { changes, newStartPageToken } = consumeResult;

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
  const folderEntries = new Map<string, { name: string; parentId: string }>();

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
      const entries = await listAudioFilesRecursive(listFn, targetFolderId, "", failedFolders, 3, extraRootFolderIds, resourceKey, folderEntries);
      if (extraRootFolderIds.size !== sizeBefore) ancestryCache.clear();
      return entries;
    },
    existingScanState: scanStateByFileId,
  });
  // フォルダ自身のリネーム・移動はchanges.list応答から直接反映できる（folderCacheUpdatesFromChanges
  // 参照）。listSubtreeが発見した子フォルダのエントリ（folderEntries、上記）と統合してまとめて
  // 書き込む。後者を後にマージし、同じfolderIdが両方にあってもサブツリー再走査側の値を優先する
  // 理由は無いため、単純に上書き（実際にはほぼ同じ値のはず）。
  for (const [id, entry] of folderCacheUpdatesFromChanges(changes)) folderEntries.set(id, entry);
  await persistFolderCache(spreadsheetId, folderEntries, () =>
    isSyncStateCurrent(syncIO, { rootFolderId: folderId, startPageToken, scanRunId: initialCompletion?.scanRunId })
  );

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

  // initialCompletionがある場合（初回スキャン完了直後の差分再生）は、自分自身のscanRunIdも
  // 照合する（2026-08-24 Codexレビュー指摘：P1。初期化未完了中は同じroot/tokenのまま
  // 別デバイスが並行して初回スキャンを実行しうるため、root/tokenだけでは所有権を失った
  // 実行を区別できない。通常の差分同期にはscanRunIdの概念が無いため未指定のまま）。
  const stillCurrent = await isSyncStateCurrent(syncIO, {
    rootFolderId: folderId,
    startPageToken,
    scanRunId: initialCompletion?.scanRunId,
  });
  if (!stillCurrent) {
    setStatus("別のデバイスがルート設定を変更したため、今回の差分同期は見送りました。次回の同期で改めて反映されます。", true);
    return false;
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
      isSyncStateCurrent(syncIO, { rootFolderId: folderId, startPageToken, scanRunId: initialCompletion?.scanRunId })
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
      () => isSyncStateCurrent(syncIO, { rootFolderId: folderId, startPageToken, scanRunId: initialCompletion?.scanRunId })
    );
  }

  // 今回更新したextraRootFolderIds（フルスキャン後の永続値＋差分同期中のショートカット変更）を
  // 永続化する。次回以降の差分同期・リコンサイルが最新の状態を使えるようにするため
  // （2026-08-21 Codexレビュー指摘：P1）。
  // initialCompletionがある場合（初回スキャン完了直後の差分再生）は、自分自身のscanRunIdも
  // 照合する（2026-08-24 Codexレビュー指摘：P2）。以前はroot/tokenのみで照合していたため、
  // 所有権を失った端末の実行（同じルート・同じ初期化未完了中に別デバイスが並行して初回スキャンを
  // 実行していたケース）でも、このショートカット集合の書き込みだけはroot/tokenの一致のみで
  // 進んでしまい、既に他の状態確定処理（advanceStartPageToken等）ではscanRunId不一致で
  // ブロックされているにも関わらず、古い（このデバイスが取得した）shortcutRootFolderIdsが
  // 書き戻されうる。通常の差分同期はscanRunIdの概念が無いため未指定のまま。
  await persistShortcutRootFolderIds(syncIO, [...extraRootFolderIds], {
    rootFolderId: folderId,
    startPageToken,
    scanRunId: initialCompletion?.scanRunId,
  });

  // フォルダ変更イベントのサブツリー再走査で子フォルダの取得に失敗した場合
  // （listAudioFilesRecursiveは例外にせずfailedFoldersへ積んで継続する）、そのサブツリー配下は
  // 今回取りこぼした可能性がある。startPageTokenを進めてしまうと、次回のchanges.listはこの
  // フォルダ変更イベント自体を二度と返さない（既に消費済みのため）ため、取りこぼしたサブツリーが
  // 恒久的に再走査されなくなる。取得失敗があった場合はトークンを進めず、次回同じ範囲を
  // 再消費して再挑戦できるようにする（2026-08-21 Codexレビュー指摘：P1）。
  const replaySucceeded = failedFolders.length === 0;
  let committed = true;
  if (initialCompletion) {
    // advance→mark→clearの3段階すべてにscanRunIdを渡し、いずれかの段階で所有権
    // （同じルート・同じ初期化未完了中に別デバイスが並行して初回スキャンを実行していないか）が
    // 失われていた場合はcommitInitialChangeReplayがfalseを返し、以降の段階へ進まない
    // （2026-08-24 Codexレビュー指摘：P1。以前はadvanceStartPageTokenだけscanRunIdを
    // 照合しておらず、所有権を失った実行でもroot/tokenの一致だけでトークンが進み、
    // 続くmark・clearが無効化されてもcommitInitialChangeReplayは無条件でtrueを返していた）。
    committed = await commitInitialChangeReplay(replaySucceeded, {
      advanceStartPageToken: () =>
        advanceStartPageToken(syncIO, newStartPageToken, {
          rootFolderId: folderId,
          startPageToken,
          scanRunId: initialCompletion.scanRunId,
        }),
      markInitialScanCompleted: () =>
        markInitialScanCompleted(syncIO, initialCompletion.completedAt, {
          rootFolderId: folderId,
          startPageToken: newStartPageToken,
          scanRunId: initialCompletion.scanRunId,
        }),
      // runFullScan側の従来のclearScanRunIdは旧トークンを期待するため、トークン更新後の初回完了
      // パスではここで現在のトークンを使ってクリアする。
      clearScanRunId: () =>
        clearScanRunId(syncIO, {
          rootFolderId: folderId,
          startPageToken: newStartPageToken,
          scanRunId: initialCompletion.scanRunId,
        }),
    });
  } else if (replaySucceeded) {
    // 通常の差分同期では、トークンだけを進める（scanRunIdの概念が無いため省略）。
    await advanceStartPageToken(syncIO, newStartPageToken, { rootFolderId: folderId, startPageToken });
  }

  setStatus(
    initialCompletion && replaySucceeded && !committed
      ? "別のデバイスが同じルートへの初回スキャンを進めているため、今回の初回スキャン結果は確定しませんでした。次回のスキャンで改めて完了を試みます。"
      : `差分同期完了（反映 ${plan.entriesToProcess.length}件、削除 ${plan.removedFileIds.length}件${
          failedFolders.length > 0 ? `、フォルダ取得失敗: ${failedFolders.length}件（次回再試行します）` : ""
        }）`
  );
  return replaySucceeded && committed;
}

async function handleRetryExtraction(): Promise<void> {
  const spreadsheetInput = el<HTMLInputElement>("spreadsheet-id");
  const spreadsheetId = spreadsheetInput.value.trim();
  if (!spreadsheetId) { setStatus("索引スプレッドシートIDを入力してください", true); return; }
  if (!catalogOperationGate.tryAcquire()) {
    setStatus("スキャンまたは索引の読み込みが進行中です。完了してからもう一度お試しください。", true);
    return;
  }
  const retryButton = el<HTMLButtonElement>("retry-extraction-btn");
  const scanButton = el<HTMLButtonElement>("scan-btn");
  const loadButton = el<HTMLButtonElement>("load-catalog-btn");
  const folderInput = el<HTMLInputElement>("folder-id");
  retryButton.disabled = true; scanButton.disabled = true; loadButton.disabled = true;
  spreadsheetInput.disabled = true; folderInput.disabled = true;
  try {
    const sheetsIO = createSheetsIndexIO(spreadsheetId, () => auth.ensureAccessToken());
    // handleScan()と同じ方針：27列・45列の旧バージョンindexヘッダーを使っている既存ユーザーが
    // 一度もスキャンを実行しないまま再抽出ボタンを押しても、有効な旧ヘッダーとして通す
    // （2026-09-02 Codexレビュー指摘：厳密な一致チェックのみだと、旧スキーマの既存失敗行が
    // 永久にヘッダー不一致エラーでブロックされ、再抽出のために無関係なスキャンを強制してしまう）。
    const setupIO = createSpreadsheetSetupIO(spreadsheetId, () => auth.ensureAccessToken());
    await ensureValidHeader(
      sheetsIO,
      setupIO,
      INDEX_SHEET_NAME,
      INDEX_SHEET_HEADER,
      isValidIndexHeader,
      async (header) => (await migrateLegacyIndexHeaderV1(setupIO, header)) || (await migrateLegacyIndexHeaderV2(setupIO, header)) || (await migrateLegacyIndexHeaderV3(setupIO, header))
    );
    const existingRows = await sheetsIO.listExistingRows();
    const fileIds = listExtractionFailedFileIds(existingRows);
    if (fileIds.length === 0) {
      setStatus("抽出失敗として記録されている曲はありません。");
      return;
    }
    setStatus("書き込み先スプレッドシートを確認中...");
    const capabilitiesGetFn = createDriveCapabilitiesGetFn(() => auth.ensureAccessToken());
    const { canEdit } = await capabilitiesGetFn(spreadsheetId);
    if (!canEdit) {
      throw new Error("索引スプレッドシートへの編集権限がありません。共有設定（編集者権限）をご確認ください。");
    }
    // handleScan()と同じ方針：これから索引を書き換えるため、実際の変更前にセッションを無効化する。
    // 抽出完了後に無効化すると、書き込みが一部だけ成功して失敗した場合に古いカタログが有効なまま
    // 残り、削除・変更済みの内容から再生リストが作られてしまう恐れがある（2026-09-02 Codex
    // レビュー指摘、P2）。
    catalogSession.invalidate();
    loadedCatalogSpreadsheetId = null;
    // タグ抽出中に他デバイスの差分同期が同じファイルを先に処理していた場合、書き込み直前に
    // 索引を読み直しそのエントリを書き込まずスキップする（2026-09-02 Codexレビュー指摘、P1：
    // リトライの古い抽出結果が新しい差分同期結果を上書きしてしまうデータ整合性の問題）。
    const skippedStaleFileIds: string[] = [];
    const removedTrashedFileIds = new Set<string>();
    const incompletelyRemovedTrashedFileIds = new Set<string>();
    const result = await retryFailedExtractions(
      fileIds,
      createDriveFileGetFn(() => auth.ensureAccessToken()),
      (fileId, signal) => createDriveFetchRange(fileId, () => auth.ensureAccessToken(), { signal }),
      (done, total) => setStatus(`再抽出中... (${done}/${total})`),
      async (entries) => {
        // filterStaleUpsertEntriesの判定に使ったスナップショット（currentRows）を
        // upsertIndexRowsのexistingRowsSnapshotへそのまま渡し、内部でのもう一度の
        // listExistingRows()を省く。渡さない場合、判定時点と実際にmergeWithExistingが
        // 使う時点とで別々の読み取りになり、その間の一呼吸がガードとは無関係な
        // 追加のTOCTOU窓になってしまう（2026-09-02 Codexレビュー指摘、P1）。
        const currentRows = await sheetsIO.listExistingRows();
        const { fresh, staleFileIds } = filterStaleUpsertEntries(entries, currentRows, existingRows);
        skippedStaleFileIds.push(...staleFileIds);
        if (fresh.length > 0) await upsertIndexRows(sheetsIO, fresh, currentRows);
        return { staleFileIds };
      },
      () => mergeDuplicateIndexRows(sheetsIO).then(() => undefined),
      async (fileIds) => {
        // trashed再確認をremoveIndexRowsのisStillCurrentコールバックへ移す。isStillCurrentは
        // updateRowsInBatchesが実際のSheets書き込み（io.updateRows）の直前に呼ぶため、
        // revalidateTrashedFileIdsを外側で先に呼んでから渡す場合より、Drive再確認と
        // 実際の削除書き込みの間に挟まる自前の処理（索引の内部読み取り等）が無くなる
        // （2026-09-02 Codexレビュー指摘、P1）。isStillCurrentにはremoveIndexRows側から
        // 「そのバッチで実際に空欄化しようとしているfileIdだけ」が渡されるため、バッチの
        // たびにrevalidateTrashedFileIdsを直接呼び毎回Driveへ再照会する（キャッシュは使わない）。
        // 以前はfileIdごとの判定結果をキャッシュしていたが、重複行（同じfileIdの索引行が
        // 複数存在するケース）があるとremoveIndexRowsが同じfileIdを複数のバッチに分けて
        // 渡すことがあり、先行バッチで確認した「trashed=true」がキャッシュ経由で後続バッチにも
        // 使い回され、その間に復元されたファイルを誤って削除しうるTOCTOU窓があった
        // （2026-09-02 Codexレビュー指摘、P1）。バッチ内で同じfileIdが重複する場合に備え
        // 照会前にSetで重複排除する。対象ファイルの一部だけ復元されていた場合は誤って
        // 一部を消すより安全側に倒し、そのバッチだけ削除を見送る（次回のリトライで
        // 改めて対象になる）。バッチが複数に分かれうるため削除件数は加算する。判定は
        // バッチごとに独立しているため、onStaleBatch="skip"を指定し、見送ったバッチが
        // あっても後続のまだ本当にtrashedなバッチの削除は継続する（2026-09-02 Codex
        // レビュー指摘、P2。既定の"abort"のままだと、早いバッチで1件でも復元が見つかった
        // 時点で以降の全バッチの削除が打ち切られてしまっていた）。
        await removeIndexRows(sheetsIO, fileIds, async (batchFileIds) => {
          const uniqueBatchFileIds = new Set(batchFileIds);
          const stillTrashed = new Set(
            await revalidateTrashedFileIds([...uniqueBatchFileIds], createDriveFileGetFn(() => auth.ensureAccessToken()))
          );
          const allStillTrashed = batchFileIds.every((id) => stillTrashed.has(id));
          // 索引に同じfileIdの重複行があり、かつそれが200件バッチの境界を跨ぐ場合、
          // 同じfileIdが複数バッチのbatchFileIdsに分かれて登場しうる。バッチ内だけで
          // 重複排除して件数を加算すると、この場合に同じfileIdを2回以上数えてしまう
          // （2026-09-02 Codexレビュー指摘：P2。以前の修正はバッチ内の重複排除のみで、
          // バッチを跨いだ重複には対応していなかった）。リトライ全体で確認できたfileIdを
          // 1つのSetへ蓄積し、最後にその件数を報告する。
          // さらに、重複行の一方のバッチだけ成功しもう一方のバッチが見送られた場合、
          // そのfileIdはまだ完全には削除されていない（次回のリトライで改めて選ばれる）ため、
          // 「削除済み」に数えてはいけない（2026-09-02 Codexレビュー指摘：P2。以前は
          // 成功したバッチのfileIdを無条件でremovedTrashedFileIdsへ加算しており、他の
          // バッチで同じfileIdが見送られていても「削除済み」と誤表示していた）。
          // 見送られたバッチに含まれるfileIdは別のSetへ記録し、最終報告時に除外する。
          if (allStillTrashed) {
            for (const id of uniqueBatchFileIds) removedTrashedFileIds.add(id);
          } else {
            for (const id of uniqueBatchFileIds) incompletelyRemovedTrashedFileIds.add(id);
          }
          return allStillTrashed;
        }, "skip");
      }
    );
    const staleNotice = skippedStaleFileIds.length > 0 ? `、他デバイスの更新により書き込みスキップ ${skippedStaleFileIds.length}件` : "";
    // 削除済み件数は再確認後の実際の削除数（removedTrashedFileIds、一意のfileId基準）を
    // 表示する。result.trashedFileIds.length（再確認前のスナップショット）をそのまま
    // 使うと、再確認で復元と判明し実際には削除しなかったファイルまで「削除済み」と
    // 誤表示してしまう（2026-09-02 Codexレビュー指摘、P2）。重複行の一方のバッチだけ
    // 成功しもう一方が見送られたfileId（incompletelyRemovedTrashedFileIds）は、まだ
    // 完全には削除されていないため件数から除外する（2026-09-02 Codexレビュー指摘、P2）。
    const actuallyRemovedCount = [...removedTrashedFileIds].filter((id) => !incompletelyRemovedTrashedFileIds.has(id)).length;
    setStatus(`再抽出完了（成功 ${result.succeededCount}件、再度失敗 ${result.stillFailedCount}件、削除済み ${actuallyRemovedCount}件、Drive上で見つからずスキップ ${result.removedFileIds.length}件${staleNotice}）`);
  } catch (err) {
    if (isAuthFailure(err)) auth.clearToken();
    setStatus(err instanceof Error ? `再抽出に失敗しました: ${err.message}` : "再抽出に失敗しました", true);
  } finally {
    catalogOperationGate.release();
    retryButton.disabled = false; scanButton.disabled = false; loadButton.disabled = false;
    spreadsheetInput.disabled = false; folderInput.disabled = false;
  }
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
  if (!catalogOperationGate.tryAcquire()) {
    setStatus("スキャンまたは索引の読み込みが進行中です。完了してからもう一度お試しください。", true);
    return;
  }
  const scanBtn = el<HTMLButtonElement>("scan-btn");
  const folderInput = el<HTMLInputElement>("folder-id");
  const spreadsheetInput = el<HTMLInputElement>("spreadsheet-id");
  const loadButton = el<HTMLButtonElement>("load-catalog-btn");
  const retryButton = el<HTMLButtonElement>("retry-extraction-btn");
  scanBtn.disabled = true;
  retryButton.disabled = true;
  // A scan can update or delete index rows. Invalidate the previous snapshot
  // before the first asynchronous scan operation so it can never form a queue.
  catalogSession.invalidate();
  loadedCatalogSpreadsheetId = null;
  el<HTMLButtonElement>("create-queue-btn").disabled = true;
  // A scan can change both index and sync rows. Keep catalog loading from
  // consuming the intermediate state until the scan has fully completed.
  folderInput.disabled = true;
  spreadsheetInput.disabled = true;
  loadButton.disabled = true;
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
    // 2026-08-21のscanRunId列追加より前、またはgenre_override追加前の46列）のindexタブヘッダーを
    // 使っている既存ユーザーは、現行スキーマ（47列）とのisValidIndexHeader不一致でここに来る。
    // migrateLegacyIndexHeaderV1/V2/V3がそれぞれの旧ヘッダーを検出した場合のみグリッド拡張＋
    // ヘッダー書き換えを行う（2026-08-20/21
    // Codexレビュー指摘：この移行が無いと既存の旧indexタブが永久にヘッダー不一致エラーで
    // ブロックされ続けてしまっていた）。
    const sheetsIO = createSheetsIndexIO(spreadsheetId, () => auth.ensureAccessToken());
    await ensureValidHeader(
      sheetsIO,
      setupIO,
      INDEX_SHEET_NAME,
      INDEX_SHEET_HEADER,
      isValidIndexHeader,
      async (header) => (await migrateLegacyIndexHeaderV1(setupIO, header)) || (await migrateLegacyIndexHeaderV2(setupIO, header)) || (await migrateLegacyIndexHeaderV3(setupIO, header))
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
      await runDifferentialSync(sheetsIO, syncIO, folderId, driveId, prep.startPageToken, prep.shortcutRootFolderIds, spreadsheetId);
    } else {
      await runFullScan(sheetsIO, syncIO, folderId, driveId, prep.startPageToken, prep.scanRunId, spreadsheetId);
    }
  } catch (err) {
    // 401（トークン取り消し等）は、ローカルのexpiresAtがまだ有効に見えていても
    // Drive APIに拒否されたことを意味する。キャッシュを残したままだと次回の
    // ensureAccessToken()も同じ拒否済みトークンを返し続け、期限マージンに入るか
    // ユーザーが再ログインするまで必ず失敗し続けてしまう（2026-08-19 Codexレビュー指摘）
    if (isAuthFailure(err)) auth.clearToken();
    setStatus(err instanceof Error ? err.message : String(err), true);
  } finally {
    catalogOperationGate.release();
    scanBtn.disabled = false;
    folderInput.disabled = false;
    spreadsheetInput.disabled = false;
    loadButton.disabled = false;
    retryButton.disabled = false;
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
  observeNowPlayingBarHeight();
  // バックグラウンド再生の不安定さの調査（実機フィードバック、2026-09-14）：ページの
  // 表示状態変化・OSによるページ凍結（Page Lifecycle API、Chrome系のみ・未対応環境では
  // 単に発火しない）を診断ログへ記録する。CLIENT_ID未設定でも意味のある記録のため
  // 早期returnより前に登録する。
  document.addEventListener("visibilitychange", () => {
    logDiag("visibilitychange", document.visibilityState);
    if (document.visibilityState === "visible") {
      stopBackgroundRetryLoop();
      void attemptBackgroundPlaybackRecovery();
    } else {
      startBackgroundRetryLoop();
    }
  });
  document.addEventListener("freeze", () => logDiag("freeze"));
  // Page Lifecycle の resume（freezeからの復帰）。visibilitychangeより先に、あるいは
  // 単独で発火する場合があるため、こちらでも同じ復帰を試みる。
  document.addEventListener("resume", () => {
    logDiag("resume");
    void attemptBackgroundPlaybackRecovery();
  });
  if (!CLIENT_ID) return;

  if ("serviceWorker" in navigator) {
    registerStreamAuthResponder(navigator.serviceWorker, () => auth.getAccessToken(), handleStreamTokenRejected, handleStreamTokenIssued);
    // ストリームの401を経ないページ側トークンの変化（例：再生と並行したライブラリスキャンの
    // サイレント更新）をSWのtokenCacheへ伝える（2026-09-13、Codexレビュー指摘：P2）。
    auth.setOnTokenChanged(() => notifyServiceWorkerTokenRotated(navigator.serviceWorker));
    // タイムアウトはここでは適用しない（awaitServiceWorkerReady()参照）：ここで一度きり
    // withTimeout()した結果を保存すると、タイムアウト後にService Workerが実際に制御を
    // 取得できても、このpromise自体は既にreject確定済みのままになってしまう。
    serviceWorkerReady = (async () => {
      await navigator.serviceWorker.register("./sw.js");
      await navigator.serviceWorker.ready;
      await waitForServiceWorkerControl();
    })();
    // 誰も待っていないタイミングでこのpromiseが拒否された場合の「unhandled promise rejection」
    // コンソール警告を抑制するだけの空catch（.catch()を1つ付けても、awaitServiceWorkerReady()側の
    // 個別のawait/then経由の拒否検知は妨げられない）。
    serviceWorkerReady.catch(() => {});
  }

  whenPageLoaded(() => {
    try {
      auth.init(CLIENT_ID);
    } catch (err) {
      setStatus(err instanceof AuthError ? err.message : String(err), true);
      return;
    }
    const audioPlayer = el<HTMLAudioElement>("audio-player");
    const audioPlayerB = el<HTMLAudioElement>("audio-player-b");
    // ロールスワップ再設計（2026-09-14〜、PR2）：DualAudioPlayerが2本のaudio要素
    // （audio-player=スロット0・audio-player-b=スロット1）を対等に持ち、「今どちらが主か」を
    // 指すポインタの付け替えだけでクロスフェードを実現する（詳細はdusty-jukebox/CLAUDE.mdの
    // クロスフェード節参照）。
    playback = new DualAudioPlayer(
      audioPlayer,
      audioPlayerB,
      () => auth.getAccessToken(),
      (error) => {
        logDiag("playback:error", error instanceof Error ? error.message : String(error));
        // The SW message has already converted a confirmed Drive 401 into the
        // explicit continuation UI. Do not overwrite it with media's generic
        // error event, which carries no HTTP status.
        if (!(error instanceof PlaybackAuthenticationRequiredError)) {
          setStatus(error instanceof Error ? error.message : "再生に失敗しました", true);
        }
      },
      // クロスフェード：実際に新しい遷移がコミットされる瞬間（play()/pause()/
      // cancelPendingTransition()それぞれの先頭）で必ず打ち切る（2026-09-10、
      // Codexレビュー指摘：P1。詳細はplayback.tsのonTransitionStartコメント参照）。
      () => crossfadeOrchestrator?.cancel(),
      // 非アクティブ側（クロスフェードの先読み）が実際にstream-idを消費するようになった
      // ため、A/B間でstream-idが衝突しないよう共有アロケータを注入する（2026-09-14〜、
      // ChatGPTレビュー指摘：P1「production の main.ts では createSharedStreamIdAllocator()
      // を注入しておらず、A/Bは依然それぞれのprivate generationをstreamIdとして使っている」）。
      // これを注入する前提として、PlaybackContinuationRegistryをMap<streamId,...>化する
      // stream-id予測の廃止（27b11f8）と、先読み側のstreamIdが確定した瞬間に継続を登録する
      // onPreviewStreamAllocated配線（下記）が先に必要（このコメントの経緯はdusty-jukebox/
      // CLAUDE.mdのクロスフェード節参照）。
      createSharedStreamIdAllocator()
    );
    wireSeekBar(playback);
    playback.addEventListener("timeupdate", () => void maybeStartCrossfade());
    playbackAuthGate = new PlaybackAuthenticationGate(async () => {
      await auth.requestAccessToken({ prompt: "consent" });
    });
    queue = new PlaybackQueue(
      playback,
      // 'ended'はDualAudioPlayer自身のactive-slot façade経由で受ける（audio-player要素へ
      // 直接結線しない）：スロットが切り替わっても正しいaudio要素の自然終了だけを
      // 拾えるようにするため（ChatGPTレビュー指摘：④）。
      playback,
      (error) => setStatus(error instanceof Error ? error.message : String(error), true),
      () => {
        logDiag("queue:ended", document.visibilityState);
        // クロスフェードが進行中の間は、この自然終了（'ended'）は既にクロスフェード自身が
        // 引き継いでいる遷移の一部のため無視する（2026-09-10、Codexレビュー指摘：P1）。
        // ここで無条件にadvanceOnEnded()すると、クロスフェードのランプ・先読み再生とは別に
        // 次の曲が0秒目から即座に開始され、直後にクロスフェード側の昇格がそれを追い越して
        // 曲を最初からやり直してしまう。
        if (crossfadeOrchestrator?.isCrossfading()) return;
        // 準備中（非アクティブ側の接続確立中、まだランプは始まっていない）に退場側が先に
        // 自然終了した場合（実機フィードバックによる再設計。稀なケース：準備にクロスフェード
        // 長+CROSSFADE_PREPARE_LEAD_MSを超える時間がかかった場合）、通常の自然終了フローへ
        // 倒す前に、既に接続済みの先読み再生へ直ちにハンドオフできないか試す
        // （tryBeginRamp()、shouldBeginCrossfadeRampのaudioEnded分岐が拾う）。成立しなければ
        // （クロスフェードが無効化された等）通常のフォールバックへ進む。
        if (crossfadeOrchestrator?.isPreparing()) {
          void crossfadeOrchestrator.tryBeginRamp(crossfadeStartParams()).then((began) => {
            if (!began) void handleNaturalEndAdvance();
          });
          return;
        }
        void handleNaturalEndAdvance();
      },
      (fileId, streamId) => registerQueuePlaybackContinuation(fileId, streamId)
    );
    crossfadeOrchestrator = new CrossfadeOrchestrator(
      playback,
      queue,
      () => auth.getAccessToken() !== null,
      {
        // promotion自体は何のDOMイベントも発火しない（不変条件）ため、シークバー表示は
        // 次のtimeupdate発火を待たずここで即座に更新する。commitPreparedFile()の成功で
        // queue.currentFileIdは既に新しい曲へ確定しているが、キュー表示（再生中のハイライト・
        // 「再生中」ラベル）自体はここで明示的にrenderQueue()しない限り更新されない
        // （handleQueuePlayback()由来の通常のコミットはhandlePlaybackAction()の成功分岐が
        // 担うが、クロスフェードのコミットはそれを経由しないため）。
        onPromoted: () => {
          // クロスフェードのコミットはhandlePlaybackAction()を経由しないため、その成功分岐が
          // 担うpendingNaturalEndAdvanceの解除もここで行う（2026-09-15、Codexレビュー指摘：P1
          // への対応。この昇格自体、直前の自然終了に伴う遷移を代表する成功のため）。
          pendingNaturalEndAdvance = false;
          pendingNaturalEndAdvanceGeneration = null;
          // pendingQueueTransitionTargetも同じ理由で解除する（2026-09-15、Codexレビュー指摘：
          // P1続き）：クロスフェードの先読み再生はPlaybackQueue.playAndCommit()を経由しない
          // （非アクティブ側のPlaybackControllerを直接play()する）ため、この昇格自体は
          // registerQueuePlaybackContinuation()を発火させずpendingQueueTransitionTargetを
          // 更新しない。昇格前に発生した未解決の手動ナビゲーション（例：スタックしたまま
          // 放置された「次へ」クリック）が残したstaleな値が、この後の（無関係になった）
          // バックグラウンド復帰判定へ誤って使われないよう、実際に何らかの再生がコミットした
          // このタイミングで明示的に解除する。
          pendingQueueTransitionTarget = null;
          pendingQueueTransitionTargetGeneration = null;
          if (!playback) return;
          updateSeekDuration(playback.activeAudioElement().duration);
          updateSeekPosition(playback.activeAudioElement().currentTime);
          renderQueue();
        },
        onFallbackToNaturalEnd: () => void handleNaturalEndAdvance(),
        // 先読みの実際のstream-idが確定した時点で継続を登録する（2026-09-14〜、ChatGPTレビュー
        // 指摘：P1「preview側streamに認証Continuationが無いため、promotion後の401を回復できません」）。
        // この継続はpromotion後も（同じstreamIdがそのままactiveストリームとして使われ続けるため）
        // 有効なまま残る。resumeは「まだ現在の（先読みしていた）曲がcommit済みか」で分岐する：
        // 既にqueue.currentPlayingFileId()がこのfileIdならpromotion済みの通常の認証継続
        // （queue.resumeCurrent()）で復旧し、そうでなければ（まだpromotion前、または既に
        // 別の理由で状況が変わっている）何もしない——ChatGPTレビュー指摘の通り「previewの401は
        // crossfadeを中止してAを継続する」設計のため、promotion前の401自体は下記
        // handleStreamTokenRejected()側でcrossfadeOrchestrator.cancel()により静かに処理する
        // （このresumeが呼ばれるのはユーザーが「認証を更新して続行」をクリックした後、＝既に
        // promotion済みの場合のみ）。
        onPreviewStreamAllocated: (fileId, streamId) => {
          playbackContinuations.register({
            fileId,
            streamId,
            resume: async (position) => {
              if (queue?.currentPlayingFileId() !== fileId) return false;
              return queue.resumeCurrent(position);
            },
          });
        },
        // promotionされないまま打ち切られた先読み（cancel()・commit失敗）の継続を無効化する
        // （2026-09-14〜、ChatGPTレビュー指摘：P1）。遅れて届く401が、既に破棄された先読みへ
        // 向けて認証UIを復活させないようにする。
        onPreviewDiscarded: (streamId) => playbackContinuations.clearStreamId(streamId),
        // promotion成功直後、退役した旧activeストリームの継続を無効化する（2026-09-14〜、
        // ChatGPTレビュー指摘：P1「promotion後に旧outgoing streamの遅延401が来ても認証UIを
        // 復活させないよう、旧streamのcontroller/Continuationも無効化してください」）。
        onOutgoingStreamRetired: (streamId) => {
          if (streamId !== null) playbackContinuations.clearStreamId(streamId);
          // 退役した旧outgoingストリームの遅延認証継続操作も無効化する（2026-09-14〜、
          // Codexレビュー指摘：P1「Invalidate deferred outgoing auth actions on
          // promotion」）。旧outgoingがランプ中に401を受けていた場合、handleStreamTokenRejected()
          // が既にplaybackAuthGate.defer()へ「その旧ストリームを再開する」操作を積んでいる。
          // ここでレジストリのContinuationだけを無効化しても、この保留中のgate操作自体は
          // 残ったままのため、promotion成功後に「認証を更新して続行」をクリックすると
          // 退役した旧曲へ巻き戻ってしまう。promotionという「より新しい再生の成功」は、
          // handlePlaybackAction()の成功分岐が既存の保留操作を無条件にclear()するのと
          // 同じ既存の不変条件（「A later successful playback makes an older deferred
          // operation obsolete」）に従い、ここでも無条件にclear()・通知非表示にする。
          playbackAuthGate?.clear();
          setPlaybackAuthNotice(false);
        },
      }
    );
    // バックグラウンド再生の不安定さの調査（2026-09-15、実機ログで「queue:ended後の
    // playbackAction:result trueまでは成功しているのに、戻ると一時停止中で止まっている」
    // ことが判明した）：JS側のplay()呼び出しが成功した後に何が起きているかを切り分けるため、
    // <audio>要素自身のネイティブイベント（playing/pause/stalled/waiting/error）を
    // スロット（A/B）付きで記録する。
    for (const el2 of [audioPlayer, audioPlayerB]) {
      const slotLabel = el2 === audioPlayer ? "A" : "B";
      el2.addEventListener("playing", () => {
        logDiag(`audio:playing:${slotLabel}`, document.visibilityState);
        if (playback?.activeAudioElement() === el2) handleNativePlaybackStatus(el2, "playing");
      });
      el2.addEventListener("pause", () => {
        logDiag(`audio:pause:${slotLabel}`, `${document.visibilityState} readyState=${el2.readyState} ended=${el2.ended}`);
        if (playback?.activeAudioElement() === el2) handleNativePlaybackStatus(el2, "pause");
      });
      el2.addEventListener("stalled", () => logDiag(`audio:stalled:${slotLabel}`, document.visibilityState));
      el2.addEventListener("waiting", () => logDiag(`audio:waiting:${slotLabel}`, document.visibilityState));
      el2.addEventListener("error", () => logDiag(`audio:error:${slotLabel}`, `code=${el2.error?.code ?? "?"} ${document.visibilityState}`));
    }
    // Bluetoothスピーカー・OSのメディアキー対応（2026-09-05、実機利用フィードバック）。
    // play/pauseは<audio>要素のネイティブ再生・一時停止に委ねる（mediaSession.ts参照：
    // PlaybackController.pause()はアプリの「一時停止」ボタンと同じ完全停止のため、
    // Bluetoothの一時停止ボタンを押すたびに二度と同じボタンで再開できなくなってしまう）。
    registerActionHandlers(navigator.mediaSession, {
      play: () => {
        logDiag("mediaSession:play", document.visibilityState);
        // Bluetooth/OSのメディアキーによる明示的な再開のため、直前の一時停止状態は解除する
        // （2026-09-15、バックグラウンド再生の不安定さ対策）。
        userPausedPlayback = false;
        // 進行中のバックグラウンド復帰リトライがネイティブplay()未解決のまま固まっている間に
        // このネイティブ再開が起きた場合、その一時停止は既に取り消されたことを
        // PlaybackControllerへ伝える（2026-09-15、Codexレビュー指摘：P1「Supersede pause
        // ownership on Media Session play」）。これを呼ばないと、後から解決した古いplay()が
        // audio.srcの一致だけを根拠に再度audio.pause()し、この再開を打ち消してしまう。
        playback?.acknowledgeNativeResume();
        void playback?.activeAudioElement().play().then(
          () => logDiag("mediaSession:play:resolved"),
          (err) => {
            logDiag("mediaSession:play:rejected", err instanceof Error ? err.message : String(err));
            // 素のネイティブplay()が失敗した場合（失効したトークンのままsrcが古い等）は、
            // 「再生」ボタンと同じ認証継続込みの経路（queue.resume()）で再試行する。
            void attemptBackgroundPlaybackRecovery();
          }
        );
      },
      // playback.activeAudioElement().pause()はPlaybackController.pause()を経由しない
      // ネイティブ直接呼び出しのため、PlaybackController側のonTransitionStartフック
      // （play/pause/cancelPendingTransitionの先頭で発火）は通らない。クロスフェード中に
      // Bluetooth/OSのメディアキーで一時停止すると、非アクティブ側の先読み再生は鳴り続けて
      // しまうため、明示的にオーケストレーターを打ち切る（2026-09-10、Codexレビュー指摘：
      // P1。role-swapでは、打ち切り自体は非アクティブ側だけを後始末しアクティブ側の
      // src/currentTime/play/pauseに一切触れないため、旧設計にあった「退場側の曲への
      // 復元」は構造的に不要になった）。
      pause: () => {
        logDiag("mediaSession:pause", document.visibilityState);
        userPausedPlayback = true;
        crossfadeOrchestrator?.cancel();
        playback?.activeAudioElement().pause();
        // 進行中のバックグラウンド復帰リトライ（resume()）がネイティブplay()未解決のまま
        // 固まっている場合、この経路（PlaybackController.pause()を経由しないネイティブ
        // pause()直呼び）だけでは無効化されず、後から解決すると誤ってcommitしてしまう
        // （2026-09-15、Codexレビュー指摘：P1「Invalidate recovery on Media Session pause」）。
        playback?.invalidatePendingRecoveryOnNativePause();
      },
      previoustrack: () => {
        logDiag("mediaSession:previoustrack", document.visibilityState);
        void handleQueuePlayback(() => queue?.previous(fadeOutEnabled()));
      },
      nexttrack: () => {
        logDiag("mediaSession:nexttrack", document.visibilityState);
        void handleQueuePlayback(() => queue?.next(fadeOutEnabled()));
      },
    });
    el<HTMLButtonElement>("diag-log-show-btn").addEventListener("click", () => {
      const output = el<HTMLTextAreaElement>("diag-log-output");
      output.value = formatDiagLog(diagLog);
      output.hidden = false;
    });
    el<HTMLButtonElement>("diag-log-clear-btn").addEventListener("click", () => {
      diagLog = [];
      try {
        localStorage.removeItem(DIAG_LOG_STORAGE_KEY);
      } catch {
        // ストレージ不可でもメモリ上のログはクリアできているため無視する。
      }
      el<HTMLTextAreaElement>("diag-log-output").value = "";
    });
    el<HTMLButtonElement>("login-btn").addEventListener("click", () => void handleLogin());
    el<HTMLButtonElement>("scan-btn").addEventListener("click", () => void handleScan());
    el<HTMLButtonElement>("retry-extraction-btn").addEventListener("click", () => void handleRetryExtraction());
    el<HTMLButtonElement>("play-btn").addEventListener("click", () => void handlePlay());
    el<HTMLButtonElement>("play-pause-btn").addEventListener("click", () => {
      const playPauseButton = el<HTMLButtonElement>("play-pause-btn");
      playPauseButton.disabled = true;
      if (playback?.activeAudioElement().paused !== false) {
        const activeAudio = playback?.activeAudioElement();
        if (lastExternalFileId !== null && activeAudio?.paused === true) {
          void resumeOrStartExternalPlayback(lastExternalFileId, !activeAudio.ended)
            .finally(() => { playPauseButton.disabled = false; });
          return;
        }
        void handleQueuePlayback(() => {
          if (!queue) return undefined;
          // canResumeCurrent()が偽の場合（キュー曲を一度も再生していない、またはキュー外の
          // 単曲試聴で上書きされている）は先頭から再生する。currentPlayingFileId()単独では
          // 判定できない理由はcanResumeCurrent()のコメント参照（2026-09-06 レビュー指摘）。
          // playback.activeAudioElement()（動的な現在のactiveスロット）から読む（2026-09-14〜、
          // Codexレビュー指摘：P1）。以前は固定のaudioPlayer（スロットA）を直接参照していたため、
          // クロスフェードでBへpromotionされた後に一時停止→再生ボタンを押すと、Bの一時停止位置
          // ではなく固定のA（cleanup後は0のことが多い）の位置を渡してしまっていた。
          return queue.canResumeCurrent() ? queue.resume(queue.currentPlayingFileId()!, playback?.activeAudioElement().currentTime ?? 0) : queue.playAt(0);
        }).finally(() => { playPauseButton.disabled = false; });
        return;
      }
      // ユーザー自身の明示的な一時停止のため、バックグラウンド復帰時の自動再開の対象から
      // 外す（2026-09-15、userPausedPlaybackの定義コメント参照）。
      userPausedPlayback = true;
      // role-swapでは、打ち切り自体は非アクティブ側だけを後始末しアクティブ側の
      // src/currentTime/play/pauseに一切触れない（不変条件）ため、旧設計にあった「退場側の
      // 曲への復元」（loadPaused()・pendingPauseOutgoingRestoreの連打時引き継ぎ等）は
      // 構造的に不要になった。
      crossfadeOrchestrator?.cancel();
      // フェード完了までの待機中（manualTransitionCountの定義コメント参照）は新しい
      // クロスフェードの開始を防ぐ（2026-09-10、ChatGPTレビュー指摘：P1、続けてCodexレビュー
      // 指摘：P1。連打で2回目のクリックが1回目のフェード完了前に発生すると、1回目の
      // `finally`が2回目のフェードがまだ進行中でもガードを解除してしまうため、booleanでは
      // なくカウンタで各クリックごとの完了待ちを独立させる）。
      manualTransitionCount += 1;
      void playback?.pause(fadeOutEnabled()).finally(() => {
        manualTransitionCount -= 1;
        playPauseButton.disabled = false;
      });
    });
    el<HTMLButtonElement>("playback-auth-refresh-btn").addEventListener("click", () => void continuePlaybackAfterAuthentication());
    el<HTMLButtonElement>("load-catalog-btn").addEventListener("click", () => void loadCatalog());
    el<HTMLButtonElement>("create-queue-btn").addEventListener("click", createQueueFromFilters);
    // アルバム検索は曲の絞り込み（ボタン起点）とは別に、入力の都度その場で絞り込む
    // （アルバム件数は曲数よりずっと少なく、jankの懸念が無いためユーザーとの相談で確認済み）。
    el<HTMLInputElement>("album-search").addEventListener("input", () => {
      refreshAlbumGroups();
    });
    el<HTMLSelectElement>("album-sort").addEventListener("change", refreshAlbumGroups);
    // 絞り込み欄同士の連動（開発体制#43）：いずれかの欄が変わるたびに、他の欄の候補一覧を
    // 現在の絞り込み条件で絞り込み直す。年欄はtype=numberのため"input"に加え、スピナー
    // 操作やブラウザ差異を考慮し"change"でも拾う。
    for (const id of ["filter-query", "filter-artist", "filter-album", "filter-composer", "filter-genre", "filter-release-type"]) {
      el<HTMLInputElement>(id).addEventListener("input", refreshFilterSuggestions);
    }
    for (const id of ["filter-min-year", "filter-max-year"]) {
      el<HTMLInputElement>(id).addEventListener("input", refreshFilterSuggestions);
      el<HTMLInputElement>(id).addEventListener("change", refreshFilterSuggestions);
    }
    el<HTMLInputElement>("filter-unknown-year").addEventListener("change", refreshFilterSuggestions);
    el<HTMLButtonElement>("next-btn").addEventListener("click", () => void handleQueuePlayback(() => queue?.next(fadeOutEnabled())));
    el<HTMLButtonElement>("previous-btn").addEventListener("click", () => void handleQueuePlayback(() => queue?.previous(fadeOutEnabled())));
    // シャッフルは絞り込み結果の並び順を変えるだけで何かを再生開始するわけではないため、
    // handleQueuePlayback()（「再生中」表示・認証ゲート解除等、実際の再生成功時の副作用を伴う）は
    // 経由しない（再生中の曲・除外設定はqueue.shuffle()自体が変更しない。次へ/前へは新しい
    // 並び順をそのまま辿る）。ただしqueue.shuffle()自体は他のナビゲーション操作と同じ
    // pendingMoveの直列化チェーンに参加するため（2026-09-06 レビュー指摘：進行中のnext()等が
    // currentFileIdを確定させる前にシャッフルすると並べ替えの基準がずれる不具合の修正）、
    // 完了を待ってからrenderQueue()する。
    el<HTMLButtonElement>("shuffle-btn").addEventListener("click", () => { if (queue) void queue.shuffle().then(() => { renderQueue(); updateUnshuffleEnabled(); }); });
    // シャッフルと同じ理由（並び順を変えるだけで再生を開始する操作ではない）でhandleQueuePlayback()は
    // 経由しない。完了を待ってから表示を更新する。
    el<HTMLButtonElement>("unshuffle-btn").addEventListener("click", () => { if (queue) void queue.unshuffle().then(() => { renderQueue(); updateUnshuffleEnabled(); }); });
    el<HTMLButtonElement>("repeat-btn").addEventListener("click", () => {
      if (!queue) return;
      const currentIndex = REPEAT_MODES.indexOf(queue.repeatMode());
      const mode = REPEAT_MODES[(currentIndex + 1) % REPEAT_MODES.length];
      const currentQueueGeneration = queue.generationId();
      if (pendingNaturalEndAdvance && pendingNaturalEndAdvanceGeneration !== currentQueueGeneration) {
        pendingNaturalEndAdvance = false;
        pendingNaturalEndAdvanceGeneration = null;
      }
      const shouldRerouteNaturalEndAdvance = pendingNaturalEndAdvance;
      const outgoingEndedDuringCrossfade = crossfadeOrchestrator?.isCrossfading() === true
        && playback?.activeAudioElement().ended === true;
      crossfadeOrchestrator?.cancel();
      queue.setRepeatMode(mode);
      const repeatButton = el<HTMLButtonElement>("repeat-btn");
      repeatButton.textContent = mode === "single" ? "🔂" : "🔁";
      repeatButton.setAttribute("aria-label", `リピート: ${REPEAT_MODE_LABELS[mode]}`);
      repeatButton.classList.toggle("repeat-off", mode === "off");
      if (shouldRerouteNaturalEndAdvance) {
        const nextFileId = queue.peekAdvanceTarget();
        if (!nextFileId) {
          queue.invalidatePendingMove();
          playback?.cancelPendingTransition();
          pendingNaturalEndAdvance = false;
          pendingNaturalEndAdvanceGeneration = null;
        } else {
          queue.invalidatePendingMove();
          void handleQueuePlayback(() => queue?.resume(nextFileId, 0));
        }
      } else if (outgoingEndedDuringCrossfade) {
        void handleNaturalEndAdvance();
      }
    });
    el<HTMLButtonElement>("clear-queue-btn").addEventListener("click", () => handleClearQueue());
    // 並び替えもシャッフルと同じ理由（並び順を変えるだけで再生を開始する操作ではない）で
    // handleQueuePlayback()は経由しない。手動並び替えはシャッフル履歴を無効化するため
    // （queue.sortBy()参照）、完了後にupdateUnshuffleEnabled()も呼ぶ。
    // 第二候補（開発体制#42）：「（なし）」選択時は空文字列のためundefinedとして渡し、
    // queueSort.ts側の既定の副次キー（アーティスト/アルバムはアルバム→ディスク→トラック順）を使う。
    el<HTMLButtonElement>("sort-btn").addEventListener("click", () => {
      if (!queue) return;
      const field = el<HTMLSelectElement>("sort-field").value as QueueSortField;
      const direction = el<HTMLSelectElement>("sort-direction").value === "desc" ? "desc" : "asc";
      const secondaryFieldValue = el<HTMLSelectElement>("sort-secondary-field").value;
      const secondaryField = secondaryFieldValue === "" ? undefined : (secondaryFieldValue as QueueSortField);
      const secondaryDirection = el<HTMLSelectElement>("sort-secondary-direction").value === "desc" ? "desc" : "asc";
      void queue.sortBy(field, direction, secondaryField, secondaryDirection).then(() => { renderQueue(); updateUnshuffleEnabled(); });
    });
    el<HTMLButtonElement>("save-playlist-btn").addEventListener("click", () => void handleSavePlaylist());
    el<HTMLButtonElement>("refresh-playlists-btn").addEventListener("click", () => void handleRefreshPlaylists());
  });
}

init();

// Playwright の開発サーバーだけで公開する、画面操作の同期用フック。本番ビルドには
// VITE_E2E を与えないためこの分岐は到達不能になり、通常利用の API/UI には影響しない。
if (import.meta.env.VITE_E2E === "true") {
  (
    window as Window & {
      __e2e?: {
        serviceWorkerReady: () => Promise<void>;
        loadPlaylists: (spreadsheetId: string) => Promise<boolean>;
        getPlaylistsCommitCount: () => number;
        getLastExternalPlaybackPosition: () => number | null;
        isManualTransitionInFlight: () => boolean;
        isCrossfadeActive: () => boolean;
        activeAudioElementId: () => string | null;
      };
    }
  ).__e2e = {
    serviceWorkerReady: () => serviceWorkerReady ?? Promise.resolve(),
    // overlapping loadPlaylists()呼び出しの対象スプレッドシートガードを直接検証するためのフック。
    loadPlaylists: (spreadsheetId: string) => { reservePlaylistsLoadTarget(spreadsheetId); return loadPlaylists(spreadsheetId); },
    getPlaylistsCommitCount: () => playlistsCommitCountForE2E,
    // 単曲試聴の再開（shouldResumeExternalPlayback()）が実際に正しいpositionでstartExternal
    // PlaybackAt()を呼んだことを直接検証するためのフック（E2Eモックの<audio>はcurrentTimeの
    // リセットタイミングが実ブラウザと一致するとは限らないため、DOM上のcurrentTime読み取りでは
    // 検証できない）。
    getLastExternalPlaybackPosition: () => lastExternalPlaybackPositionForE2E,
    // manualTransitionCountのガードが、認証継続の再試行中（handlePlaybackAction()内部の
    // playbackAuthGate.defer()経由での再実行）・一時停止ボタンの連打中も正しく維持されることを
    // 直接検証するためのフック（2026-09-10、Codexレビュー指摘：P1×2。crossfade.tsのshould
    // StartCrossfade()自体は既存のユニットテストでカバー済みのため、main.ts側のガードの
    // 増減タイミングだけをこのフックで検証する）。
    isManualTransitionInFlight: () => manualTransitionCount > 0,
    // クロスフェードが準備中またはランプ中かどうかを直接検証するためのフック
    // （2026-09-14〜、ロールスワップ再設計。旧isCrossfadeFinishing——「無音のうちに先読み側の
    // 位置へ追いつく再シーク」の`seeked`待ち専用のフック——はrole-swapが再シーク自体を構造的に
    // 排除したため不要になった。E2Eから状態機械の進行を確認する用途はisCrossfadeActiveへ
    // 統合する）。
    isCrossfadeActive: () => crossfadeOrchestrator?.isActive() ?? false,
    // ロールスワップでは「今どちらのDOM要素がactiveか」がpromotionのたびに入れ替わるため、
    // 固定の#audio-player要素ではなくこのフックでE2Eから直接確認する（2026-09-14〜、PR2）。
    activeAudioElementId: () => (playback ? (playback.activeAudioElement() as unknown as HTMLAudioElement).id : null),
  };
}
