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
import { PlaybackAuthenticationRequiredError, PlaybackController } from "./playback";
import { playbackStatusForEvent, type PlaybackStatusEvent } from "./playbackStatus";
import { PlaybackAuthenticationGate } from "./playbackAuthGate";
import { continuationGeneration, PlaybackContinuationRegistry, type PlaybackContinuation } from "./playbackContinuation";
import { parseIndexRows, filterSongs, groupSongsByAlbum, sortSongs, type AlbumGroup, type Song } from "./catalog";
import { CatalogOperationGate } from "./catalogOperationGate";
import { CatalogSession } from "./catalogSession";
import { FolderPathResolver } from "./folderPaths";
import { PlaybackQueue } from "./queue";
import { registerStreamAuthResponder } from "./streamAuth";
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
import { applyShortcutChangesToExtraRootFolderIds, planDifferentialSync } from "./differentialSync";
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
  ensureIndexAndSyncTabsExist,
  ensurePlaylistsTabsExist,
  ensureValidHeader,
  createSpreadsheetSetupIO,
  migrateLegacyIndexHeaderV1,
  migrateLegacyIndexHeaderV2,
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

const auth = new DriveAuth();
let playback: PlaybackController | null = null;
let queue: PlaybackQueue | null = null;
let playbackAuthGate: PlaybackAuthenticationGate | null = null;
const playbackContinuations = new PlaybackContinuationRegistry();
const catalogSession = new CatalogSession<Song>();
let serviceWorkerReady: Promise<void> | null = null;
const catalogOperationGate = new CatalogOperationGate();
// アプリ起動時に1回だけ生成し、以降のプレイリスト保存操作すべてで使い回す
// （CONCEPT.md 4.3節、playlists.tsのmakeOrderKey参照）。
const deviceRandomId = generateDeviceRandomId();
// 直近にloadPlaylists()で読み込んだ一覧（一覧表示・読み込み・削除で使い回す）。
let loadedPlaylists: Playlist[] = [];
let loadedPlaylistTracks: PlaylistTrackRow[] = [];

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
      <button id="pause-btn" type="button" disabled>一時停止</button>
      <audio id="audio-player" controls></audio>
      <p id="playback-auth-notice" class="status error" hidden>認証の更新が必要です。クリックして続行してください。 <button id="playback-auth-refresh-btn" type="button">認証を更新して続行</button></p>
      <section class="catalog">
        <h2>ライブラリ</h2>
        <button id="load-catalog-btn" type="button" disabled>索引から曲一覧を読み込む</button>
        <label class="field"><span>検索</span><input id="filter-query" type="search" placeholder="タイトル・アーティスト・アルバム・作曲者を検索" /></label>
        <label class="field"><span>アーティスト</span><input id="filter-artist" type="search" /></label>
        <label class="field"><span>アルバム</span><input id="filter-album" type="search" /></label>
        <label class="field"><span>作曲者</span><input id="filter-composer" type="search" /></label>
        <div class="filter-years"><label>年（最小）<input id="filter-min-year" type="number" /></label><label>年（最大）<input id="filter-max-year" type="number" /></label></div>
        <label class="field"><span>カテゴリ（Genre）</span><input id="filter-genre" type="search" /></label>
        <label><input id="filter-unknown-year" type="checkbox" checked /> 年不明も含める</label>
        <button id="create-queue-btn" type="button" disabled>この条件で再生リストを作る</button>
        <div><button id="previous-btn" type="button" disabled>前へ</button> <button id="next-btn" type="button" disabled>次へ</button></div>
        <ul id="catalog-list" class="result-list"></ul>
        <h3>アルバム</h3>
        <ul id="album-list" class="result-list"></ul>
      </section>
      <section class="playlists">
        <h2>保存済みプレイリスト</h2>
        <label class="field"><span>プレイリスト名</span><input id="playlist-name" type="text" placeholder="例: ドライブ用" /></label>
        <button id="save-playlist-btn" type="button">現在の再生リストをプレイリストとして保存</button>
        <button id="refresh-playlists-btn" type="button">プレイリスト一覧を更新</button>
        <ul id="playlist-list" class="result-list"></ul>
      </section>
      <p id="status" class="status"></p>
      <ul id="result-list" class="result-list"></ul>
    `
        : `<p class="status error">VITE_GOOGLE_CLIENT_ID が未設定です。.env に設定してください。</p>`
    }
  `;
}

function numberOrUndefined(value: string): number | undefined { const n = Number(value); return value.trim() === "" || !Number.isFinite(n) ? undefined : n; }
function renderQueue(): void {
  const list = el<HTMLUListElement>("catalog-list"); list.innerHTML = "";
  for (const song of queue?.all() ?? []) { const item = document.createElement("li"); const check = document.createElement("input"); check.type = "checkbox"; check.checked = !queue?.isExcluded(song.fileId);
    check.addEventListener("change", () => { queue?.exclude(song.fileId, !check.checked); renderQueue(); });
    item.append(check, ` ${song.title}${song.artist ? ` — ${song.artist}` : ""}${song.album ? ` / ${song.album}` : ""}${song.folderPath ? ` [${song.folderPath}]` : ""}`); list.append(item); }
}
function renderAlbumGroups(groups: AlbumGroup[]): void {
  const list = el<HTMLUListElement>("album-list"); list.innerHTML = "";
  for (const group of groups) {
    const item = document.createElement("li");
    const label = `${group.album} — ${group.albumArtist}（${group.songs.length}曲） `;
    const button = document.createElement("button"); button.type = "button"; button.textContent = "このアルバムを再生";
    button.addEventListener("click", () => {
      if (!queue) return;
      const songs = catalogSession.createQueue(() => group.songs);
      if (!songs) {
        setStatus("スキャンにより索引が更新される可能性があるため、曲一覧を再読み込みしてから再生リストを作成してください。", true);
        return;
      }
      queue.setList(songs); renderQueue();
      el<HTMLButtonElement>("next-btn").disabled = songs.length === 0; el<HTMLButtonElement>("previous-btn").disabled = songs.length === 0;
      setStatus(`${group.album}の${songs.length}曲を再生リストに設定しました。`);
      void handleQueuePlayback(() => queue?.playAt(0));
    });
    item.append(label, button); list.append(item);
  }
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
    deleteButton.addEventListener("click", () => void handleDeletePlaylist(playlist.playlistId));
    item.append(label, loadButton, deleteButton);
    list.append(item);
  }
}

async function loadPlaylists(spreadsheetId: string): Promise<void> {
  const playlistsIO = playlistsSpreadsheetIO(spreadsheetId);
  await ensurePlaylistTabsReady(spreadsheetId, playlistsIO);
  loadedPlaylists = parsePlaylistRows(await playlistsIO.listPlaylists());
  loadedPlaylistTracks = parsePlaylistTrackRows(await playlistsIO.listPlaylistTracks());
  renderPlaylistList();
}

async function handleRefreshPlaylists(): Promise<void> {
  const spreadsheetId = el<HTMLInputElement>("spreadsheet-id").value.trim();
  if (!spreadsheetId) { setStatus("索引スプレッドシートIDを入力してください", true); return; }
  const button = el<HTMLButtonElement>("refresh-playlists-btn");
  button.disabled = true;
  try {
    await loadPlaylists(spreadsheetId);
    setStatus(`プレイリスト${loadedPlaylists.length}件を読み込みました。`);
  } catch (err) {
    if (isAuthFailure(err)) auth.clearToken();
    setStatus(err instanceof Error ? `プレイリスト一覧の読み込みに失敗しました: ${err.message}` : "プレイリスト一覧の読み込みに失敗しました", true);
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
  const fileIds = queue?.list().map((song) => song.fileId) ?? [];
  if (fileIds.length === 0) { setStatus("保存する再生リストがありません。条件を指定して再生リストを作ってから保存してください。", true); return; }
  const button = el<HTMLButtonElement>("save-playlist-btn");
  button.disabled = true;
  try {
    const playlistsIO = playlistsSpreadsheetIO(spreadsheetId);
    await ensurePlaylistTabsReady(spreadsheetId, playlistsIO);
    await createPlaylist(playlistsIO, name, fileIds, deviceRandomId);
    nameInput.value = "";
    await loadPlaylists(spreadsheetId);
    setStatus(`プレイリスト「${name}」（${fileIds.length}曲）を保存しました。`);
  } catch (err) {
    if (isAuthFailure(err)) auth.clearToken();
    setStatus(err instanceof Error ? `プレイリストの保存に失敗しました: ${err.message}` : "プレイリストの保存に失敗しました", true);
  } finally {
    button.disabled = false;
  }
}

async function handleLoadPlaylistIntoQueue(playlistId: string): Promise<void> {
  if (!queue) return;
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
  el<HTMLButtonElement>("next-btn").disabled = songs.length === 0;
  el<HTMLButtonElement>("previous-btn").disabled = songs.length === 0;
  const missingCount = orderedFileIds.length - songs.length;
  setStatus(`プレイリストから${songs.length}曲を再生リストに設定しました${missingCount > 0 ? `（${missingCount}曲は現在の索引に見つかりませんでした）` : ""}。`);
  if (songs.length > 0) void handleQueuePlayback(() => queue?.playAt(0));
}

async function handleDeletePlaylist(playlistId: string): Promise<void> {
  const spreadsheetId = el<HTMLInputElement>("spreadsheet-id").value.trim();
  if (!spreadsheetId) { setStatus("索引スプレッドシートIDを入力してください", true); return; }
  try {
    const playlistsIO = playlistsSpreadsheetIO(spreadsheetId);
    await deletePlaylist(playlistsIO, playlistId);
    await loadPlaylists(spreadsheetId);
    setStatus("プレイリストを削除しました。");
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
    const resolver = new FolderPathResolver(
      createDriveFolderGetFn(() => auth.ensureAccessToken()),
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
    catalogSession.replace(songs);
    renderAlbumGroups(groupSongsByAlbum(songs));
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
  const songs = catalogSession.createQueue((loadedSongs) => sortSongs(filterSongs(loadedSongs, { query: el<HTMLInputElement>("filter-query").value, artist: el<HTMLInputElement>("filter-artist").value,
    album: el<HTMLInputElement>("filter-album").value, composer: el<HTMLInputElement>("filter-composer").value, genre: el<HTMLInputElement>("filter-genre").value,
    minYear: numberOrUndefined(el<HTMLInputElement>("filter-min-year").value), maxYear: numberOrUndefined(el<HTMLInputElement>("filter-max-year").value), includeUnknownYear: el<HTMLInputElement>("filter-unknown-year").checked })));
  if (!songs) {
    setStatus("スキャンにより索引が更新される可能性があるため、曲一覧を再読み込みしてから再生リストを作成してください。", true);
    return;
  }
  queue.setList(songs); renderQueue(); el<HTMLButtonElement>("next-btn").disabled = songs.length === 0; el<HTMLButtonElement>("previous-btn").disabled = songs.length === 0;
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
    el<HTMLButtonElement>("pause-btn").disabled = false;
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
  await handlePlaybackAction(async () => {
    setStatus("Service Worker経由で再生を開始しています...");
    return startExternalPlayback(fileId, currentPlayback);
  });
}

async function startExternalPlayback(fileId: string, currentPlayback: PlaybackController): Promise<boolean> {
  if (serviceWorkerReady) await serviceWorkerReady;
  // Register first: HTMLMediaElement.play() can remain pending (or reject) while
  // the first stream request already receives a Drive 401.
  let continuation!: PlaybackContinuation;
  continuation = playbackContinuations.register({
    fileId,
    generation: currentPlayback.currentGeneration() + 1,
    resume: async (position) => startExternalPlaybackAt(fileId, currentPlayback, position),
  });
  const playPromise = currentPlayback.play(fileId);
  continuation.generation = continuationGeneration(continuation.generation, currentPlayback.currentStreamGeneration());
  await playPromise;
  if (!playbackContinuations.isCurrent(continuation) || continuation.generation !== currentPlayback.currentGeneration()) return false;
  // Do not detach the existing queue until the new file has really reached the
  // playback controller. A locally-expired token must leave the old queue song
  // eligible to advance when it ends.
  queue?.notifyExternalPlaybackStarted();
  return true;
}

async function startExternalPlaybackAt(fileId: string, currentPlayback: PlaybackController, position: number): Promise<boolean> {
  if (serviceWorkerReady) await serviceWorkerReady;
  let continuation!: PlaybackContinuation;
  continuation = playbackContinuations.register({
    fileId,
    generation: currentPlayback.currentGeneration() + 1,
    resume: async (resumePosition) => startExternalPlaybackAt(fileId, currentPlayback, resumePosition),
  });
  const playPromise = currentPlayback.play(fileId, position);
  continuation.generation = continuationGeneration(continuation.generation, currentPlayback.currentStreamGeneration());
  await playPromise;
  if (!playbackContinuations.isCurrent(continuation) || continuation.generation !== currentPlayback.currentGeneration()) return false;
  queue?.notifyExternalPlaybackStarted();
  return true;
}

async function handleQueuePlayback(action: () => Promise<boolean> | undefined): Promise<void> {
  await handlePlaybackAction(async () => {
    if (serviceWorkerReady) await serviceWorkerReady;
    const started = await action();
    return Boolean(started);
  });
}

function registerQueuePlaybackContinuation(fileId: string, currentPlayback: PlaybackController): void {
  // PlaybackQueue invokes this immediately before PlaybackController.play().
  // Do not wait for the queue to commit currentFileId: a Drive 401 can arrive
  // while native play() is still pending.
  playbackContinuations.register({
    fileId,
    generation: currentPlayback.currentGeneration() + 1,
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
}

async function handlePlaybackAction(action: () => Promise<boolean>): Promise<void> {
  try {
    const started = await action();
    if (started) {
      // A newer real playback supersedes any deferred operation. This also
      // removes its notice, so a later click cannot restore an older song.
      playbackAuthGate?.clear();
      setPlaybackAuthNotice(false);
      setStatus("再生中");
    }
  } catch (err) {
    if (err instanceof PlaybackAuthenticationRequiredError && playbackAuthGate) {
      playbackAuthGate.defer(() => handlePlaybackAction(action));
      setPlaybackAuthNotice(true);
      setStatus("認証の更新が必要です。下のボタンをクリックして続行してください。", true);
      return;
    }
    setStatus(err instanceof Error ? err.message : String(err), true);
  }
}

function handleStreamTokenIssued(fileId: string, requestId: string, token: string | null, generation: number): void {
  playbackContinuations.recordTokenRequest(requestId, fileId, generation, token);
}

function handleStreamTokenRejected(fileId: string, requestId: string): void {
  const continuation = playbackContinuations.acceptTokenRejection(requestId, fileId, auth.getAccessToken());
  if (!continuation || !playback || !playbackAuthGate) return;
  const position = playback.markStreamTokenRejected(fileId, continuation.generation);
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
async function runFullScan(
  sheetsIO: SheetsIndexIO,
  syncIO: SyncTabIO,
  folderId: string,
  driveId: string | undefined,
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
      const initialChangesCompleted = await runDifferentialSync(
        sheetsIO,
        syncIO,
        folderId,
        driveId,
        startPageToken,
        [...shortcutTargetFolderIds],
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
      async (header) => (await migrateLegacyIndexHeaderV1(setupIO, header)) || (await migrateLegacyIndexHeaderV2(setupIO, header))
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
      await runFullScan(sheetsIO, syncIO, folderId, driveId, prep.startPageToken, prep.scanRunId);
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
  if (!CLIENT_ID) return;

  if ("serviceWorker" in navigator) {
    registerStreamAuthResponder(navigator.serviceWorker, () => auth.getAccessToken(), handleStreamTokenRejected, handleStreamTokenIssued);
    serviceWorkerReady = (async () => {
      await navigator.serviceWorker.register("./sw.js");
      await navigator.serviceWorker.ready;
      await waitForServiceWorkerControl();
    })();
  }

  whenPageLoaded(() => {
    try {
      auth.init(CLIENT_ID);
    } catch (err) {
      setStatus(err instanceof AuthError ? err.message : String(err), true);
      return;
    }
    const audioPlayer = el<HTMLAudioElement>("audio-player");
    playback = new PlaybackController(
      audioPlayer,
      () => auth.getAccessToken(),
      (error) => {
        // The SW message has already converted a confirmed Drive 401 into the
        // explicit continuation UI. Do not overwrite it with media's generic
        // error event, which carries no HTTP status.
        if (!(error instanceof PlaybackAuthenticationRequiredError)) {
          setStatus(error instanceof Error ? error.message : "再生に失敗しました", true);
        }
      }
    );
    playbackAuthGate = new PlaybackAuthenticationGate(async () => {
      await auth.requestAccessToken({ prompt: "consent" });
    });
    queue = new PlaybackQueue(
      playback,
      audioPlayer,
      (error) => setStatus(error instanceof Error ? error.message : String(error), true),
      () => void handleQueuePlayback(() => queue?.next()),
      (fileId) => registerQueuePlaybackContinuation(fileId, playback!)
    );
    audioPlayer.addEventListener("playing", () => handleNativePlaybackStatus(audioPlayer, "playing"));
    audioPlayer.addEventListener("pause", () => handleNativePlaybackStatus(audioPlayer, "pause"));
    el<HTMLButtonElement>("login-btn").addEventListener("click", () => void handleLogin());
    el<HTMLButtonElement>("scan-btn").addEventListener("click", () => void handleScan());
    el<HTMLButtonElement>("retry-extraction-btn").addEventListener("click", () => void handleRetryExtraction());
    el<HTMLButtonElement>("play-btn").addEventListener("click", () => void handlePlay());
    el<HTMLButtonElement>("pause-btn").addEventListener("click", () => playback?.pause());
    el<HTMLButtonElement>("playback-auth-refresh-btn").addEventListener("click", () => void continuePlaybackAfterAuthentication());
    el<HTMLButtonElement>("load-catalog-btn").addEventListener("click", () => void loadCatalog());
    el<HTMLButtonElement>("create-queue-btn").addEventListener("click", createQueueFromFilters);
    el<HTMLButtonElement>("next-btn").addEventListener("click", () => void handleQueuePlayback(() => queue?.next()));
    el<HTMLButtonElement>("previous-btn").addEventListener("click", () => void handleQueuePlayback(() => queue?.previous()));
    el<HTMLButtonElement>("save-playlist-btn").addEventListener("click", () => void handleSavePlaylist());
    el<HTMLButtonElement>("refresh-playlists-btn").addEventListener("click", () => void handleRefreshPlaylists());
  });
}

init();

// Playwright の開発サーバーだけで公開する、画面操作の同期用フック。本番ビルドには
// VITE_E2E を与えないためこの分岐は到達不能になり、通常利用の API/UI には影響しない。
if (import.meta.env.VITE_E2E === "true") {
  (window as Window & { __e2e?: { serviceWorkerReady: () => Promise<void> } }).__e2e = {
    serviceWorkerReady: () => serviceWorkerReady ?? Promise.resolve(),
  };
}
