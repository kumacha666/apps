// DustyJukebox Tools — dusty-jukebox本体のカタログ補正機能（表記ゆれ統一・文字化け修復）を
// 分離した、必要な時だけ起動する管理ツール。本体とは独立したVite+TSアプリ（apps全体の方針
// 「アプリ間のコード共有はしない」に沿い、auth.ts/sheets.tsは本体から必要な部分だけを移植）。
// スキャン・タグ抽出・再生機能は一切持たない：既存の索引スプレッドシート（indexタブ）を
// 読み書きするだけの単機能ツール。
import { AuthError, DriveAuth } from "./auth";
import { createSheetsIndexIO, isReadableIndexHeader, isValidIndexHeader, SheetsHttpError } from "./sheets";
import {
  applyCasingWritesInChunks,
  casingGroupKey,
  findCasingVariants,
  planCasingNormalization,
  revertCasingWritesInChunks,
  type AppliedCasingWrite,
  type CaseNormalizationField,
  type CasingGroup,
} from "./caseNormalization";
import {
  applyGenreWritesInChunks,
  findGenreCasingVariants,
  genreGroupKey,
  planGenreNormalization,
  revertGenreWritesInChunks,
  type AppliedGenreWrite,
  type GenreCasingGroup,
} from "./genreNormalization";
import {
  applyGarbledWritesInChunks,
  findGarbledCandidates,
  garbledCandidateKey,
  planGarbledRepair,
  revertGarbledWritesInChunks,
  type AppliedGarbledWrite,
  type GarbledCandidate,
} from "./garbledRepair";
import { runHealthCheck, type HealthCheckReport } from "./healthCheck";
import {
  applyMissingFieldWritesInChunks,
  findMissingFieldEntries,
  revertMissingFieldWritesInChunks,
  type AppliedMissingFieldWrite,
  type MissingFieldEntry,
  type MissingFieldWrite,
} from "./missingFieldFill";
import { buildArtAlbums, parseFolderRows } from "./albumArtAlbums";
import { albumArtKey, albumArtRow, createAlbumArtSheetIO, parseAlbumArtRows, summarize, type AlbumArtRecord, type AlbumArtSummary } from "./albumArtSheet";
import {
  chosenRecord,
  uploadedRecord,
  createReviewSearch,
  isReviewView,
  recordsForView,
  isSameArtRecord,
  MATCH_LABELS,
  planReviewedWrites,
  rejectedRecord,
  reviewedRecord,
  REVIEW_VIEW_LABELS,
  REVIEW_VIEWS,
  SOURCE_LABELS,
  sourcePageUrl,
  type ReviewCandidate,
  type ReviewView,
} from "./albumArtReview";
import { albumsToCollect, knownNoEmbeddedOf, planAlbumArtWrites, runCollection, runInBatches } from "./albumArtCollect";
import { CANDIDATES_SHEET_NAME, candidatesToImport, importCandidate, parseCandidateRows } from "./albumArtImport";
import { createWebArtSearch } from "./albumArtSearch";
import {
  createArtUploader,
  createEmbeddedExtractor,
  DriveHttpError,
  ensureArtFolder,
  fetchDriveImage,
  fetchWebImage,
  makeJpegThumbnail,
  trashDriveFile,
} from "./albumArtDrive";

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

const auth = new DriveAuth();

// 表記ゆれ統一・文字化け修復のいずれも同じindexタブを読み書きするため、同時実行を防ぐ
// 単純な排他フラグ（本体のCatalogOperationGateと同じ目的だが、このアプリはスキャン・
// カタログ読み込みが無いためもっと単純な形でよい）。
let operationInProgress = false;
function tryAcquire(): boolean {
  if (operationInProgress) return false;
  operationInProgress = true;
  return true;
}
function release(): void {
  operationInProgress = false;
}

function isAuthFailure(err: unknown): boolean {
  return err instanceof AuthError || ((err instanceof SheetsHttpError || err instanceof DriveHttpError) && err.status === 401);
}

function el<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`#${id} not found`);
  return found as T;
}

function setStatus(message: string, isError = false): void {
  const status = el<HTMLParagraphElement>("status");
  status.textContent = message;
  status.classList.toggle("error", isError);
}

function render(): void {
  const app = el<HTMLDivElement>("app");
  app.innerHTML = `
    <h1>DustyJukebox Tools</h1>
    <p class="lead">DustyJukeboxの索引スプレッドシートに対するカタログ補正ツールです。普段は使いません。</p>
    ${
      CLIENT_ID
        ? `
      <label class="field">
        <span>索引スプレッドシートID（indexタブ）</span>
        <input id="spreadsheet-id" type="text" placeholder="スプレッドシートURLの末尾" />
      </label>
      <button id="login-btn" type="button">Googleへログイン（スプレッドシート・ドライブ）</button>
      <section class="section">
        <h2>表記ゆれ統一</h2>
        <p>アーティスト・アルバムアーティスト・作曲者の大文字小文字の表記ゆれ（例:「AKB48」と「akb48」）を統一します。既に手動補正済みの曲は対象外です。</p>
        <button id="check-casing-btn" type="button" disabled>表記ゆれをチェック</button>
        <div id="casing-results"></div>
        <div><button id="apply-casing-btn" type="button" disabled>統一を適用</button> <button id="revert-casing-btn" type="button" disabled>直前の統一を元に戻す</button></div>
      </section>
      <section class="section">
        <h2>Genre表記ゆれ統一</h2>
        <p>複数ジャンルが「 / 」区切りで入っている場合も、ジャンルのトークン単位で大文字小文字の表記ゆれを統一します。既にgenre_overrideが設定済み（明示的な空を含む）の曲は対象外です。</p>
        <button id="check-genre-btn" type="button" disabled>Genre表記ゆれをチェック</button>
        <div id="genre-results"></div>
        <div><button id="apply-genre-btn" type="button" disabled>Genre統一を適用</button> <button id="revert-genre-btn" type="button" disabled>直前のGenre統一を元に戻す</button></div>
      </section>
      <section class="section">
        <h2>文字化け修復</h2>
        <p>タイトル・アーティスト・アルバムアーティスト・アルバム・作曲者の文字化けを自動修復します。修復できない値は候補に出しません。候補ごとにチェックを外して適用対象から除外できます。</p>
        <button id="check-garbled-btn" type="button" disabled>文字化けをチェック</button>
        <ul id="garbled-results" class="result-list"></ul>
        <div><button id="apply-garbled-btn" type="button" disabled>修復を適用</button> <button id="revert-garbled-btn" type="button" disabled>直前の修復を元に戻す</button></div>
      </section>
      <section class="section">
        <h2>ライブラリ健全性チェック</h2>
        <p>索引データだけを見た読み取り専用のチェックです。書き込みは一切行いません。①文字化けの疑い（自動修復できないパターンも広めに拾います）②欠落フィールド（title/artist/album/genreが空欄）③同一フォルダ内でのタイトル重複（複数ファイル選択編集の事故検知用）④同一アルバム内でのリリース年の外れ値、の4項目を確認します。</p>
        <button id="check-health-btn" type="button" disabled>健全性チェックを実行</button>
        <div id="healthcheck-results"></div>
      </section>
      <section class="section">
        <h2>欠落フィールドの一括見直し</h2>
        <p>タイトル・アーティスト・アルバムが空欄の曲を一覧表示し、1件ずつ入力して保存できます。他の曲からの自動推測は行いません（空欄のまま保存すると対象から除外されます）。Genreはoverride列が無いためこの機能の対象外です（Mp3tag等でタグ自体を編集してください）。</p>
        <button id="check-missing-btn" type="button" disabled>欠落フィールドをチェック</button>
        <div id="missing-field-results"></div>
        <div><button id="apply-missing-btn" type="button" disabled>入力した内容を保存</button> <button id="revert-missing-btn" type="button" disabled>直前の保存を元に戻す</button></div>
      </section>
      <section class="section">
        <h2>アルバムアート</h2>
        <p>アルバムごとの表紙を集めて、Googleドライブの「DustyJukebox アルバムアート」フォルダに小さな画像（512px）を置き、索引の「albumArt」タブに記録します。曲のファイルに表紙が埋め込まれていればそれを、無ければWeb（MusicBrainz・iTunes）で探したものを使います。音楽ファイルは書き換えません。途中で止めても、次回は続きから集めます（読めなかった・取れなかったアルバムはもう一度試します）。「見つからなかったアルバムをもう一度探す」は、Webで見つからなかったアルバムだけを、探し方を広げて探し直します（ディスクの番号を外す、サウンドトラックはアルバム名だけで探す等）。「AIが探した候補を取り込む」は、AI（Claude）がWebで探して索引の「albumArtCandidates」タブに書いた候補のうち、いまも見つからないままのアルバムの分だけを取り込みます（どう見つけたか〈一致・表記違い・近い・推測〉を記録するので、確認画面で怪しい順に見直せます）。</p>
        <div class="art-review-bar"><button id="collect-art-btn" type="button" disabled>表紙を集める</button> <button id="retry-art-btn" type="button" class="secondary" disabled>見つからなかったアルバムをもう一度探す</button> <button id="import-art-btn" type="button" class="secondary" disabled>AIが探した候補を取り込む</button> <button id="stop-art-btn" type="button" disabled>止める</button></div>
        <p id="art-progress"></p>
        <div id="art-results"></div>
        <p>集めた表紙は「確認する」で一覧にできます。違うものは「外す」（表紙なしにし、次に集めるときも入れ直さない）か「別の候補」で選び直してください。見つからなかったアルバムも「別の候補」から探して入れられます。候補に無ければ、「別の候補」の「画像ファイルから入れる」で手元の画像（自分で保存したジャケット画像など）を選べます。合っている表紙は「OK」を押すと確認済みになり、「未確認の表紙だけ表示」のときは一覧に出なくなります（外した・選び直した表紙も確認済みになります。何度取り込んでも、まだ見ていない表紙だけを見直せます）。</p>
        <div class="art-review-bar"><select id="art-view" aria-label="表示する表紙"></select> <button id="review-art-btn" type="button" disabled>確認する</button></div>
        <div class="art-review-bar"><label><input type="checkbox" id="art-unreviewed" checked> 未確認の表紙だけ表示</label> <button id="art-mark-all-btn" type="button" class="secondary" disabled>表示中の未確認をすべてOKにする</button></div>
        <div id="art-candidates" class="art-candidates" hidden></div>
        <div id="art-review" class="art-grid"></div>
      </section>
      <p id="status" class="status"></p>
    `
        : `<p class="status error">VITE_GOOGLE_CLIENT_ID が未設定です。.env に設定してください。</p>`
    }
  `;
}

// ===== 表記ゆれ統一 =====

interface CasingUiState {
  spreadsheetId: string | null;
  groups: CasingGroup[];
  canonicalByGroupKey: Map<string, string>;
  lastApplied: AppliedCasingWrite[];
}
let casingUiState: CasingUiState = { spreadsheetId: null, groups: [], canonicalByGroupKey: new Map(), lastApplied: [] };
const CASE_NORMALIZATION_FIELD_LABELS: Record<CaseNormalizationField, string> = {
  artist: "アーティスト",
  albumArtist: "アルバムアーティスト",
  composer: "作曲者",
};

function renderCasingGroups(): void {
  const container = el<HTMLDivElement>("casing-results");
  container.innerHTML = "";
  for (const group of casingUiState.groups) {
    const item = document.createElement("p");
    const summary = group.variants.map((v) => `「${v.value}」(${v.fileIds.length}曲)`).join(" / ");
    item.append(`${CASE_NORMALIZATION_FIELD_LABELS[group.field]}: ${summary} → `);
    const select = document.createElement("select");
    const chosenCanonical = casingUiState.canonicalByGroupKey.get(casingGroupKey(group)) ?? group.suggestedCanonical;
    for (const variant of group.variants) {
      const option = document.createElement("option");
      option.value = variant.value;
      option.textContent = variant.value;
      option.selected = variant.value === chosenCanonical;
      select.append(option);
    }
    select.addEventListener("change", () => casingUiState.canonicalByGroupKey.set(casingGroupKey(group), select.value));
    item.append(select);
    container.append(item);
  }
  el<HTMLButtonElement>("apply-casing-btn").disabled = casingUiState.groups.length === 0;
  el<HTMLButtonElement>("revert-casing-btn").disabled = casingUiState.lastApplied.length === 0;
}

async function handleCheckCasing(): Promise<void> {
  const spreadsheetId = el<HTMLInputElement>("spreadsheet-id").value.trim();
  if (!spreadsheetId) {
    setStatus("索引スプレッドシートIDを入力してください", true);
    return;
  }
  if (!tryAcquire()) {
    setStatus("他の操作が進行中です。完了してからもう一度お試しください。", true);
    return;
  }
  try {
    const sheetsIO = createSheetsIndexIO(spreadsheetId, () => auth.ensureAccessToken());
    if (!isReadableIndexHeader(await sheetsIO.readHeaderRow())) {
      throw new Error("索引スプレッドシートの「index」タブのヘッダー行が想定と一致しません。");
    }
    const rows = await sheetsIO.listExistingRows();
    const preservedLastApplied = casingUiState.spreadsheetId === spreadsheetId ? casingUiState.lastApplied : [];
    casingUiState = {
      spreadsheetId,
      groups: findCasingVariants(rows),
      canonicalByGroupKey: new Map(),
      lastApplied: preservedLastApplied,
    };
    renderCasingGroups();
    setStatus(
      casingUiState.groups.length > 0
        ? `${casingUiState.groups.length}件の表記ゆれ候補が見つかりました。内容を確認して適用してください。`
        : "表記ゆれは見つかりませんでした。"
    );
  } catch (err) {
    if (isAuthFailure(err)) auth.clearToken();
    setStatus(err instanceof Error ? `表記ゆれのチェックに失敗しました: ${err.message}` : "表記ゆれのチェックに失敗しました", true);
  } finally {
    release();
  }
}

async function handleApplyCasingNormalization(): Promise<void> {
  const spreadsheetId = el<HTMLInputElement>("spreadsheet-id").value.trim();
  if (!spreadsheetId || casingUiState.groups.length === 0) return;
  if (spreadsheetId !== casingUiState.spreadsheetId) {
    setStatus("チェック時と異なるスプレッドシートIDが入力されています。もう一度「表記ゆれをチェック」を実行してください。", true);
    return;
  }
  if (!tryAcquire()) {
    setStatus("他の操作が進行中です。完了してからもう一度お試しください。", true);
    return;
  }
  try {
    const writes = planCasingNormalization(casingUiState.groups, casingUiState.canonicalByGroupKey);
    if (writes.length === 0) {
      setStatus("適用対象の変更はありません（選択済みの表記が既にすべての曲に反映されています）。");
      return;
    }
    const sheetsIO = createSheetsIndexIO(spreadsheetId, () => auth.ensureAccessToken());
    casingUiState.groups = [];
    casingUiState.canonicalByGroupKey = new Map();
    const newlyApplied: AppliedCasingWrite[] = [];
    let hasSwitchedToNewApplied = false;
    let totalSkippedStaleCount = 0;
    await applyCasingWritesInChunks(sheetsIO, writes, ({ chunkApplied, chunkSkippedStaleCount }) => {
      totalSkippedStaleCount += chunkSkippedStaleCount;
      if (chunkApplied.length === 0) return;
      newlyApplied.push(...chunkApplied);
      if (!hasSwitchedToNewApplied) {
        casingUiState.lastApplied = newlyApplied;
        hasSwitchedToNewApplied = true;
      }
      renderCasingGroups();
    });
    renderCasingGroups();
    setStatus(
      `${newlyApplied.length}件の表記ゆれを統一しました${totalSkippedStaleCount > 0 ? `（${totalSkippedStaleCount}件は他の変更と競合したためスキップ）` : ""}。`
    );
  } catch (err) {
    if (isAuthFailure(err)) auth.clearToken();
    setStatus(
      err instanceof Error
        ? `表記ゆれの統一に失敗しました（一部は既に書き込まれている可能性があります。「直前の統一を元に戻す」で確認できます）: ${err.message}`
        : "表記ゆれの統一に失敗しました",
      true
    );
    renderCasingGroups();
  } finally {
    release();
  }
}

async function handleRevertCasingNormalization(): Promise<void> {
  const spreadsheetId = el<HTMLInputElement>("spreadsheet-id").value.trim();
  if (!spreadsheetId || casingUiState.lastApplied.length === 0) return;
  if (spreadsheetId !== casingUiState.spreadsheetId) {
    setStatus("チェック時と異なるスプレッドシートIDが入力されています。もう一度「表記ゆれをチェック」を実行してください。", true);
    return;
  }
  if (!tryAcquire()) {
    setStatus("他の操作が進行中です。完了してからもう一度お試しください。", true);
    return;
  }
  try {
    const sheetsIO = createSheetsIndexIO(spreadsheetId, () => auth.ensureAccessToken());
    let totalRevertedCount = 0;
    let totalStaleCount = 0;
    await revertCasingWritesInChunks(sheetsIO, casingUiState.lastApplied, ({ chunkReverted, chunkStale }) => {
      totalRevertedCount += chunkReverted.length;
      totalStaleCount += chunkStale.length;
      const handled = new Set([...chunkReverted, ...chunkStale]);
      casingUiState.lastApplied = casingUiState.lastApplied.filter((entry) => !handled.has(entry));
      renderCasingGroups();
    });
    renderCasingGroups();
    setStatus(
      `${totalRevertedCount}件の表記ゆれ統一を元に戻しました${totalStaleCount > 0 ? `（${totalStaleCount}件は既に他の変更があったためスキップ）` : ""}。`
    );
  } catch (err) {
    if (isAuthFailure(err)) auth.clearToken();
    setStatus(
      err instanceof Error ? `元に戻す処理に失敗しました（一部は既に元に戻っている可能性があります）: ${err.message}` : "元に戻す処理に失敗しました",
      true
    );
    renderCasingGroups();
  } finally {
    release();
  }
}

// ===== Genre表記ゆれ統一 =====

interface GenreUiState {
  spreadsheetId: string | null;
  groups: GenreCasingGroup[];
  canonicalByGroupKey: Map<string, string>;
  lastApplied: AppliedGenreWrite[];
}
let genreUiState: GenreUiState = { spreadsheetId: null, groups: [], canonicalByGroupKey: new Map(), lastApplied: [] };

function renderGenreGroups(): void {
  const container = el<HTMLDivElement>("genre-results");
  container.innerHTML = "";
  for (const group of genreUiState.groups) {
    const item = document.createElement("p");
    item.append(`トークン: ${group.variants.map((variant) => `「${variant.value}」(${variant.fileIds.length}曲)`).join(" / ")} → `);
    const select = document.createElement("select");
    const chosen = genreUiState.canonicalByGroupKey.get(genreGroupKey(group)) ?? group.suggestedCanonical;
    for (const variant of group.variants) {
      const option = document.createElement("option");
      option.value = variant.value;
      option.textContent = variant.value;
      option.selected = variant.value === chosen;
      select.append(option);
    }
    select.addEventListener("change", () => genreUiState.canonicalByGroupKey.set(genreGroupKey(group), select.value));
    item.append(select);
    container.append(item);
  }
  el<HTMLButtonElement>("apply-genre-btn").disabled = genreUiState.groups.length === 0;
  el<HTMLButtonElement>("revert-genre-btn").disabled = genreUiState.lastApplied.length === 0;
}

async function handleCheckGenre(): Promise<void> {
  const spreadsheetId = el<HTMLInputElement>("spreadsheet-id").value.trim();
  if (!spreadsheetId) return setStatus("索引スプレッドシートIDを入力してください", true);
  if (!tryAcquire()) return setStatus("他の操作が進行中です。完了してからもう一度お試しください。", true);
  try {
    const io = createSheetsIndexIO(spreadsheetId, () => auth.ensureAccessToken());
    if (!isValidIndexHeader(await io.readHeaderRow())) {
      throw new Error("索引スプレッドシートの「index」タブのヘッダー行が想定と一致しません。本体アプリ（dusty-jukebox）でスキャンを一度実行してから、もう一度お試しください。");
    }
    const preserved = genreUiState.spreadsheetId === spreadsheetId ? genreUiState.lastApplied : [];
    genreUiState = { spreadsheetId, groups: findGenreCasingVariants(await io.listExistingRows()), canonicalByGroupKey: new Map(), lastApplied: preserved };
    renderGenreGroups();
    setStatus(genreUiState.groups.length ? `${genreUiState.groups.length}件のGenre表記ゆれ候補が見つかりました。内容を確認して適用してください。` : "Genre表記ゆれは見つかりませんでした。");
  } catch (err) {
    if (isAuthFailure(err)) auth.clearToken();
    setStatus(err instanceof Error ? `Genre表記ゆれのチェックに失敗しました: ${err.message}` : "Genre表記ゆれのチェックに失敗しました", true);
  } finally { release(); }
}

async function handleApplyGenreNormalization(): Promise<void> {
  const spreadsheetId = el<HTMLInputElement>("spreadsheet-id").value.trim();
  if (!spreadsheetId || !genreUiState.groups.length) return;
  if (spreadsheetId !== genreUiState.spreadsheetId) return setStatus("チェック時と異なるスプレッドシートIDが入力されています。もう一度「Genre表記ゆれをチェック」を実行してください。", true);
  if (!tryAcquire()) return setStatus("他の操作が進行中です。完了してからもう一度お試しください。", true);
  try {
    const writes = planGenreNormalization(genreUiState.groups, genreUiState.canonicalByGroupKey);
    if (!writes.length) return setStatus("適用対象の変更はありません（選択済みの表記が既にすべての曲に反映されています）。");
    const io = createSheetsIndexIO(spreadsheetId, () => auth.ensureAccessToken());
    genreUiState.groups = [];
    genreUiState.canonicalByGroupKey = new Map();
    const newlyApplied: AppliedGenreWrite[] = [];
    let switched = false;
    let skipped = 0;
    await applyGenreWritesInChunks(io, writes, ({ chunkApplied, chunkSkippedStaleCount }) => {
      skipped += chunkSkippedStaleCount;
      if (!chunkApplied.length) return;
      newlyApplied.push(...chunkApplied);
      if (!switched) { genreUiState.lastApplied = newlyApplied; switched = true; }
      renderGenreGroups();
    });
    renderGenreGroups();
    setStatus(`${newlyApplied.length}曲のGenre表記ゆれを統一しました${skipped ? `（${skipped}曲は他の変更と競合したためスキップ）` : ""}。`);
  } catch (err) {
    if (isAuthFailure(err)) auth.clearToken();
    setStatus(err instanceof Error ? `Genre表記ゆれの統一に失敗しました（一部は既に書き込まれている可能性があります。「直前のGenre統一を元に戻す」で確認できます）: ${err.message}` : "Genre表記ゆれの統一に失敗しました", true);
    renderGenreGroups();
  } finally { release(); }
}

async function handleRevertGenreNormalization(): Promise<void> {
  const spreadsheetId = el<HTMLInputElement>("spreadsheet-id").value.trim();
  if (!spreadsheetId || !genreUiState.lastApplied.length) return;
  if (spreadsheetId !== genreUiState.spreadsheetId) return setStatus("チェック時と異なるスプレッドシートIDが入力されています。もう一度「Genre表記ゆれをチェック」を実行してください。", true);
  if (!tryAcquire()) return setStatus("他の操作が進行中です。完了してからもう一度お試しください。", true);
  try {
    const io = createSheetsIndexIO(spreadsheetId, () => auth.ensureAccessToken());
    let reverted = 0;
    let stale = 0;
    await revertGenreWritesInChunks(io, genreUiState.lastApplied, ({ chunkReverted, chunkStale }) => {
      reverted += chunkReverted.length;
      stale += chunkStale.length;
      const handled = new Set([...chunkReverted, ...chunkStale]);
      genreUiState.lastApplied = genreUiState.lastApplied.filter((entry) => !handled.has(entry));
      renderGenreGroups();
    });
    renderGenreGroups();
    setStatus(`${reverted}曲のGenre表記ゆれ統一を元に戻しました${stale ? `（${stale}曲は既に他の変更があったためスキップ）` : ""}。`);
  } catch (err) {
    if (isAuthFailure(err)) auth.clearToken();
    setStatus(err instanceof Error ? `元に戻す処理に失敗しました（一部は既に元に戻っている可能性があります）: ${err.message}` : "元に戻す処理に失敗しました", true);
    renderGenreGroups();
  } finally { release(); }
}

// ===== 文字化け修復 =====

interface GarbledUiState {
  spreadsheetId: string | null;
  candidates: GarbledCandidate[];
  acceptedKeys: Set<string>;
  lastApplied: AppliedGarbledWrite[];
}
let garbledUiState: GarbledUiState = { spreadsheetId: null, candidates: [], acceptedKeys: new Set(), lastApplied: [] };
const GARBLED_FIELD_LABELS: Record<string, string> = {
  title: "タイトル",
  artist: "アーティスト",
  albumArtist: "アルバムアーティスト",
  album: "アルバム",
  composer: "作曲者",
};

function renderGarbledCandidates(): void {
  const container = el<HTMLUListElement>("garbled-results");
  container.innerHTML = "";
  for (const candidate of garbledUiState.candidates) {
    const key = garbledCandidateKey(candidate);
    const item = document.createElement("li");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = garbledUiState.acceptedKeys.has(key);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) garbledUiState.acceptedKeys.add(key);
      else garbledUiState.acceptedKeys.delete(key);
    });
    item.append(checkbox);
    item.append(
      ` ${GARBLED_FIELD_LABELS[candidate.field] ?? candidate.field}: 「${candidate.currentValue}」→「${candidate.repairedValue}」`
    );
    container.append(item);
  }
  el<HTMLButtonElement>("apply-garbled-btn").disabled = garbledUiState.candidates.length === 0;
  el<HTMLButtonElement>("revert-garbled-btn").disabled = garbledUiState.lastApplied.length === 0;
}

async function handleCheckGarbled(): Promise<void> {
  const spreadsheetId = el<HTMLInputElement>("spreadsheet-id").value.trim();
  if (!spreadsheetId) {
    setStatus("索引スプレッドシートIDを入力してください", true);
    return;
  }
  if (!tryAcquire()) {
    setStatus("他の操作が進行中です。完了してからもう一度お試しください。", true);
    return;
  }
  try {
    const sheetsIO = createSheetsIndexIO(spreadsheetId, () => auth.ensureAccessToken());
    if (!isReadableIndexHeader(await sheetsIO.readHeaderRow())) {
      throw new Error("索引スプレッドシートの「index」タブのヘッダー行が想定と一致しません。");
    }
    const rows = await sheetsIO.listExistingRows();
    const preservedLastApplied = garbledUiState.spreadsheetId === spreadsheetId ? garbledUiState.lastApplied : [];
    const candidates = findGarbledCandidates(rows);
    garbledUiState = {
      spreadsheetId,
      candidates,
      acceptedKeys: new Set(candidates.map((c) => garbledCandidateKey(c))),
      lastApplied: preservedLastApplied,
    };
    renderGarbledCandidates();
    setStatus(
      candidates.length > 0
        ? `${candidates.length}件の修復候補が見つかりました。内容を確認して適用してください。`
        : "修復できる文字化けは見つかりませんでした。"
    );
  } catch (err) {
    if (isAuthFailure(err)) auth.clearToken();
    setStatus(err instanceof Error ? `文字化けのチェックに失敗しました: ${err.message}` : "文字化けのチェックに失敗しました", true);
  } finally {
    release();
  }
}

async function handleApplyGarbledRepair(): Promise<void> {
  const spreadsheetId = el<HTMLInputElement>("spreadsheet-id").value.trim();
  if (!spreadsheetId || garbledUiState.candidates.length === 0) return;
  if (spreadsheetId !== garbledUiState.spreadsheetId) {
    setStatus("チェック時と異なるスプレッドシートIDが入力されています。もう一度「文字化けをチェック」を実行してください。", true);
    return;
  }
  if (!tryAcquire()) {
    setStatus("他の操作が進行中です。完了してからもう一度お試しください。", true);
    return;
  }
  try {
    const writes = planGarbledRepair(garbledUiState.candidates, garbledUiState.acceptedKeys);
    if (writes.length === 0) {
      setStatus("適用対象がありません（すべての候補のチェックが外されています）。");
      return;
    }
    const sheetsIO = createSheetsIndexIO(spreadsheetId, () => auth.ensureAccessToken());
    garbledUiState.candidates = [];
    garbledUiState.acceptedKeys = new Set();
    const newlyApplied: AppliedGarbledWrite[] = [];
    let hasSwitchedToNewApplied = false;
    let totalSkippedStaleCount = 0;
    await applyGarbledWritesInChunks(sheetsIO, writes, ({ chunkApplied, chunkSkippedStaleCount }) => {
      totalSkippedStaleCount += chunkSkippedStaleCount;
      if (chunkApplied.length === 0) return;
      newlyApplied.push(...chunkApplied);
      if (!hasSwitchedToNewApplied) {
        garbledUiState.lastApplied = newlyApplied;
        hasSwitchedToNewApplied = true;
      }
      renderGarbledCandidates();
    });
    renderGarbledCandidates();
    setStatus(
      `${newlyApplied.length}件の文字化けを修復しました${totalSkippedStaleCount > 0 ? `（${totalSkippedStaleCount}件は他の変更と競合したためスキップ）` : ""}。`
    );
  } catch (err) {
    if (isAuthFailure(err)) auth.clearToken();
    setStatus(
      err instanceof Error
        ? `文字化けの修復に失敗しました（一部は既に書き込まれている可能性があります。「直前の修復を元に戻す」で確認できます）: ${err.message}`
        : "文字化けの修復に失敗しました",
      true
    );
    renderGarbledCandidates();
  } finally {
    release();
  }
}

async function handleRevertGarbledRepair(): Promise<void> {
  const spreadsheetId = el<HTMLInputElement>("spreadsheet-id").value.trim();
  if (!spreadsheetId || garbledUiState.lastApplied.length === 0) return;
  if (spreadsheetId !== garbledUiState.spreadsheetId) {
    setStatus("チェック時と異なるスプレッドシートIDが入力されています。もう一度「文字化けをチェック」を実行してください。", true);
    return;
  }
  if (!tryAcquire()) {
    setStatus("他の操作が進行中です。完了してからもう一度お試しください。", true);
    return;
  }
  try {
    const sheetsIO = createSheetsIndexIO(spreadsheetId, () => auth.ensureAccessToken());
    let totalRevertedCount = 0;
    let totalStaleCount = 0;
    await revertGarbledWritesInChunks(sheetsIO, garbledUiState.lastApplied, ({ chunkReverted, chunkStale }) => {
      totalRevertedCount += chunkReverted.length;
      totalStaleCount += chunkStale.length;
      const handled = new Set([...chunkReverted, ...chunkStale]);
      garbledUiState.lastApplied = garbledUiState.lastApplied.filter((entry) => !handled.has(entry));
      renderGarbledCandidates();
    });
    renderGarbledCandidates();
    setStatus(
      `${totalRevertedCount}件の文字化け修復を元に戻しました${totalStaleCount > 0 ? `（${totalStaleCount}件は既に他の変更があったためスキップ）` : ""}。`
    );
  } catch (err) {
    if (isAuthFailure(err)) auth.clearToken();
    setStatus(
      err instanceof Error ? `元に戻す処理に失敗しました（一部は既に元に戻っている可能性があります）: ${err.message}` : "元に戻す処理に失敗しました",
      true
    );
    renderGarbledCandidates();
  } finally {
    release();
  }
}

// ===== ライブラリ健全性チェック =====

function renderHealthCheckReport(report: HealthCheckReport): void {
  const container = el<HTMLDivElement>("healthcheck-results");
  container.innerHTML = "";

  const addSection = (title: string, lines: string[]): void => {
    const h3 = document.createElement("h3");
    h3.textContent = `${title}（${lines.length}件）`;
    container.append(h3);
    if (lines.length === 0) return;
    const ul = document.createElement("ul");
    ul.className = "result-list";
    for (const line of lines) {
      const li = document.createElement("li");
      li.textContent = line;
      ul.append(li);
    }
    container.append(ul);
  };

  addSection(
    "① 文字化けの疑い",
    report.garbledSuspects.map((s) => `${s.fileId.slice(0, 10)}... ${s.field}: 「${s.value}」`)
  );
  addSection(
    "② 欠落フィールド",
    report.missingFields.map((m) => `${m.fileId.slice(0, 10)}... ${m.field}が空欄`)
  );
  addSection(
    "③ 同一フォルダ内でのタイトル重複",
    report.duplicateTitles.map(
      (g) => `フォルダ${g.parentId.slice(0, 10)}... 「${g.title}」が${g.fileIds.length}件（${g.fileIds.map((id) => id.slice(0, 10) + "...").join(", ")}）`
    )
  );
  addSection(
    "④ 同一アルバム内でのリリース年の外れ値",
    report.yearOutliers.map((y) => `${y.fileId.slice(0, 10)}... 「${y.album}」: ${y.year}（他の曲は${y.majorityYear}）`)
  );
}

async function handleHealthCheck(): Promise<void> {
  const spreadsheetId = el<HTMLInputElement>("spreadsheet-id").value.trim();
  if (!spreadsheetId) {
    setStatus("索引スプレッドシートIDを入力してください", true);
    return;
  }
  if (!tryAcquire()) {
    setStatus("他の操作が進行中です。完了してからもう一度お試しください。", true);
    return;
  }
  try {
    const sheetsIO = createSheetsIndexIO(spreadsheetId, () => auth.ensureAccessToken());
    if (!isReadableIndexHeader(await sheetsIO.readHeaderRow())) {
      throw new Error("索引スプレッドシートの「index」タブのヘッダー行が想定と一致しません。");
    }
    const rows = await sheetsIO.listExistingRows();
    const report = runHealthCheck(rows);
    renderHealthCheckReport(report);
    const total =
      report.garbledSuspects.length + report.missingFields.length + report.duplicateTitles.length + report.yearOutliers.length;
    setStatus(total > 0 ? `${total}件の要確認項目が見つかりました。書き込みは行っていません。` : "要確認項目は見つかりませんでした。");
  } catch (err) {
    if (isAuthFailure(err)) auth.clearToken();
    setStatus(err instanceof Error ? `健全性チェックに失敗しました: ${err.message}` : "健全性チェックに失敗しました", true);
  } finally {
    release();
  }
}

// ===== 欠落フィールドの一括見直し =====

const MISSING_FIELD_LABELS: Record<MissingFieldEntry["field"], string> = {
  title: "タイトル",
  artist: "アーティスト",
  album: "アルバム",
};

interface MissingFieldUiState {
  spreadsheetId: string | null;
  entries: MissingFieldEntry[];
  // key: `${field}:${fileId}`
  inputValues: Map<string, string>;
  lastApplied: AppliedMissingFieldWrite[];
}
let missingFieldUiState: MissingFieldUiState = { spreadsheetId: null, entries: [], inputValues: new Map(), lastApplied: [] };
const missingFieldEntryKey = (e: Pick<MissingFieldEntry, "field" | "fileId">) => `${e.field}:${e.fileId}`;

function renderMissingFieldEntries(): void {
  const container = el<HTMLDivElement>("missing-field-results");
  container.innerHTML = "";
  for (const entry of missingFieldUiState.entries) {
    const key = missingFieldEntryKey(entry);
    const item = document.createElement("p");
    // 誤入力防止のため、対象曲の他のフィールド（title/artist/album）を併記する
    // （ChatGPTレビュー指摘：fileIdの先頭10文字とフィールド名だけでは1万曲規模の手入力時に対象を判別しづらい）。
    const context = `title:「${entry.context.title || "(空欄)"}」 artist:「${entry.context.artist || "(空欄)"}」 album:「${entry.context.album || "(空欄)"}」`;
    item.append(`${entry.fileId.slice(0, 10)}... ${context} → ${MISSING_FIELD_LABELS[entry.field]}: `);
    const input = document.createElement("input");
    input.type = "text";
    input.value = missingFieldUiState.inputValues.get(key) ?? "";
    input.addEventListener("input", () => missingFieldUiState.inputValues.set(key, input.value));
    item.append(input);
    container.append(item);
  }
  el<HTMLButtonElement>("apply-missing-btn").disabled = missingFieldUiState.entries.length === 0;
  el<HTMLButtonElement>("revert-missing-btn").disabled = missingFieldUiState.lastApplied.length === 0;
}

async function handleCheckMissingFields(): Promise<void> {
  const spreadsheetId = el<HTMLInputElement>("spreadsheet-id").value.trim();
  if (!spreadsheetId) {
    setStatus("索引スプレッドシートIDを入力してください", true);
    return;
  }
  if (!tryAcquire()) {
    setStatus("他の操作が進行中です。完了してからもう一度お試しください。", true);
    return;
  }
  try {
    const sheetsIO = createSheetsIndexIO(spreadsheetId, () => auth.ensureAccessToken());
    if (!isReadableIndexHeader(await sheetsIO.readHeaderRow())) {
      throw new Error("索引スプレッドシートの「index」タブのヘッダー行が想定と一致しません。");
    }
    const rows = await sheetsIO.listExistingRows();
    const preservedLastApplied = missingFieldUiState.spreadsheetId === spreadsheetId ? missingFieldUiState.lastApplied : [];
    const entries = findMissingFieldEntries(rows);
    missingFieldUiState = { spreadsheetId, entries, inputValues: new Map(), lastApplied: preservedLastApplied };
    renderMissingFieldEntries();
    setStatus(
      entries.length > 0
        ? `${entries.length}件の欠落フィールドが見つかりました。値を入力して保存してください（空欄のままの項目は保存対象外です）。`
        : "欠落しているタイトル・アーティスト・アルバムは見つかりませんでした。"
    );
  } catch (err) {
    if (isAuthFailure(err)) auth.clearToken();
    setStatus(err instanceof Error ? `欠落フィールドのチェックに失敗しました: ${err.message}` : "欠落フィールドのチェックに失敗しました", true);
  } finally {
    release();
  }
}

async function handleApplyMissingFields(): Promise<void> {
  const spreadsheetId = el<HTMLInputElement>("spreadsheet-id").value.trim();
  if (!spreadsheetId || missingFieldUiState.entries.length === 0) return;
  if (spreadsheetId !== missingFieldUiState.spreadsheetId) {
    setStatus("チェック時と異なるスプレッドシートIDが入力されています。もう一度「欠落フィールドをチェック」を実行してください。", true);
    return;
  }
  if (!tryAcquire()) {
    setStatus("他の操作が進行中です。完了してからもう一度お試しください。", true);
    return;
  }
  try {
    const writes: MissingFieldWrite[] = [];
    for (const entry of missingFieldUiState.entries) {
      const value = (missingFieldUiState.inputValues.get(missingFieldEntryKey(entry)) ?? "").trim();
      if (value !== "") writes.push({ field: entry.field, fileId: entry.fileId, value, expectedOverrideValue: entry.originalOverrideValue });
    }
    if (writes.length === 0) {
      setStatus("保存対象がありません（すべての項目が空欄のままです）。");
      return;
    }
    const sheetsIO = createSheetsIndexIO(spreadsheetId, () => auth.ensureAccessToken());
    // entries/inputValuesはチャンクの成功が確定するたびに個別に取り除く（下記onChunkWritten）。
    // ここで一括クリアしない：チャンクの途中でSheets APIの書き込みが失敗すると、まだ書き込めて
    // いない項目のユーザー入力（再現不能な手入力値）が失われてしまうため（ChatGPTレビュー指摘）。
    const newlyApplied: AppliedMissingFieldWrite[] = [];
    let hasSwitchedToNewApplied = false;
    let totalSkippedStaleCount = 0;
    await applyMissingFieldWritesInChunks(sheetsIO, writes, ({ chunkApplied, chunkSkippedStaleCount }) => {
      totalSkippedStaleCount += chunkSkippedStaleCount;
      if (chunkApplied.length === 0) return;
      newlyApplied.push(...chunkApplied);
      if (!hasSwitchedToNewApplied) {
        missingFieldUiState.lastApplied = newlyApplied;
        hasSwitchedToNewApplied = true;
      }
      const appliedKeys = new Set(chunkApplied.map((w) => missingFieldEntryKey(w)));
      missingFieldUiState.entries = missingFieldUiState.entries.filter((e) => !appliedKeys.has(missingFieldEntryKey(e)));
      for (const key of appliedKeys) missingFieldUiState.inputValues.delete(key);
      renderMissingFieldEntries();
    });
    renderMissingFieldEntries();
    setStatus(
      `${newlyApplied.length}件を保存しました${totalSkippedStaleCount > 0 ? `（${totalSkippedStaleCount}件は他の変更と競合したためスキップ）` : ""}。`
    );
  } catch (err) {
    if (isAuthFailure(err)) auth.clearToken();
    setStatus(
      err instanceof Error
        ? `保存に失敗しました（一部は既に書き込まれている可能性があります。「直前の保存を元に戻す」で確認できます）: ${err.message}`
        : "保存に失敗しました",
      true
    );
    renderMissingFieldEntries();
  } finally {
    release();
  }
}

async function handleRevertMissingFields(): Promise<void> {
  const spreadsheetId = el<HTMLInputElement>("spreadsheet-id").value.trim();
  if (!spreadsheetId || missingFieldUiState.lastApplied.length === 0) return;
  if (spreadsheetId !== missingFieldUiState.spreadsheetId) {
    setStatus("チェック時と異なるスプレッドシートIDが入力されています。もう一度「欠落フィールドをチェック」を実行してください。", true);
    return;
  }
  if (!tryAcquire()) {
    setStatus("他の操作が進行中です。完了してからもう一度お試しください。", true);
    return;
  }
  try {
    const sheetsIO = createSheetsIndexIO(spreadsheetId, () => auth.ensureAccessToken());
    let totalRevertedCount = 0;
    let totalStaleCount = 0;
    await revertMissingFieldWritesInChunks(sheetsIO, missingFieldUiState.lastApplied, ({ chunkReverted, chunkStale }) => {
      totalRevertedCount += chunkReverted.length;
      totalStaleCount += chunkStale.length;
      const handled = new Set([...chunkReverted, ...chunkStale]);
      missingFieldUiState.lastApplied = missingFieldUiState.lastApplied.filter((entry) => !handled.has(entry));
      renderMissingFieldEntries();
    });
    renderMissingFieldEntries();
    setStatus(
      `${totalRevertedCount}件の保存を元に戻しました${totalStaleCount > 0 ? `（${totalStaleCount}件は既に他の変更があったためスキップ）` : ""}。`
    );
  } catch (err) {
    if (isAuthFailure(err)) auth.clearToken();
    setStatus(
      err instanceof Error ? `元に戻す処理に失敗しました（一部は既に元に戻っている可能性があります）: ${err.message}` : "元に戻す処理に失敗しました",
      true
    );
    renderMissingFieldEntries();
  } finally {
    release();
  }
}

// ===== アルバムアート =====

let stopArtRequested = false;

function artSummaryText(summary: AlbumArtSummary): string {
  const rejected = summary.rejected > 0 ? `・外した ${summary.rejected}` : "";
  const deezer = (summary.deezer > 0 ? `・Deezer ${summary.deezer}` : "") + (summary.web > 0 ? `・Web ${summary.web}` : "") + (summary.file > 0 ? `・画像ファイル ${summary.file}` : "");
  return `埋め込み ${summary.embedded}・MusicBrainz ${summary.musicbrainz}・iTunes ${summary.itunes}${deezer}・見つからない ${summary.notfound}・読めなかった ${summary.error}${rejected}`;
}

function renderArtResults(records: AlbumArtRecord[]): void {
  const container = el<HTMLDivElement>("art-results");
  container.innerHTML = "";
  const summary = document.createElement("p");
  summary.textContent = `全${records.length}枚：${artSummaryText(summarize(records))}`;
  container.append(summary);
  const addList = (title: string, items: AlbumArtRecord[]) => {
    if (items.length === 0) return;
    const details = document.createElement("details");
    const label = document.createElement("summary");
    label.textContent = `${title}（${items.length}枚）`;
    const list = document.createElement("ul");
    for (const r of items) {
      const li = document.createElement("li");
      li.textContent = r.artist ? `${r.album} — ${r.artist}` : r.album;
      list.append(li);
    }
    details.append(label, list);
    container.append(details);
  };
  addList("見つからなかったアルバム", records.filter((r) => r.source === "notfound"));
  addList("読めなかった・取れなかったアルバム（次回もう一度試します）", records.filter((r) => r.source === "error"));
}

/** 表紙を集める。[retryNotFound]なら、前回Webで見つからなかったアルバムも探し直す（曲のファイルは読み直さない）。 */
async function handleCollectArt(retryNotFound = false): Promise<void> {
  const spreadsheetId = el<HTMLInputElement>("spreadsheet-id").value.trim();
  if (!spreadsheetId) {
    setStatus("索引スプレッドシートIDを入力してください", true);
    return;
  }
  if (!tryAcquire()) {
    setStatus("他の操作が進行中です。完了してからもう一度お試しください。", true);
    return;
  }
  const collectBtn = el<HTMLButtonElement>("collect-art-btn");
  const retryBtn = el<HTMLButtonElement>("retry-art-btn");
  const stopBtn = el<HTMLButtonElement>("stop-art-btn");
  const progress = el<HTMLParagraphElement>("art-progress");
  const importBtn = el<HTMLButtonElement>("import-art-btn");
  collectBtn.disabled = true;
  retryBtn.disabled = true;
  importBtn.disabled = true;
  stopArtRequested = false;
  try {
    const getToken = () => auth.ensureAccessToken();
    const sheetsIO = createSheetsIndexIO(spreadsheetId, getToken);
    if (!isReadableIndexHeader(await sheetsIO.readHeaderRow())) {
      throw new Error("索引スプレッドシートの「index」タブのヘッダー行が想定と一致しません。");
    }
    const indexRows = await sheetsIO.listExistingRows();
    const artIO = createAlbumArtSheetIO(spreadsheetId, getToken);
    await artIO.ensureTab();
    const existing = parseAlbumArtRows(await artIO.readRows());
    const albums = buildArtAlbums(indexRows, parseFolderRows(await artIO.readFolderRows()));
    const todo = albumsToCollect(albums, existing, { retryNotFound });
    const records = new Map([...existing].map(([key, v]) => [key, v.record]));
    if (todo.length === 0) {
      renderArtResults([...records.values()]);
      setStatus(retryNotFound ? "見つからなかったアルバムはありません。" : `全${albums.length}枚のアルバムは集め終わっています。`);
      return;
    }
    const folderId = await ensureArtFolder(getToken);
    stopBtn.disabled = false;
    const current: AlbumArtSummary = summarize([]);
    let skippedCount = 0;
    progress.textContent = `0 / ${todo.length} 枚`;
    const result = await runCollection({
      albums: todo,
      deps: {
        extractEmbedded: createEmbeddedExtractor(getToken),
        search: createWebArtSearch(),
        fetchImage: fetchWebImage,
        makeThumbnail: makeJpegThumbnail,
        upload: createArtUploader(getToken, folderId),
        now: () => new Date().toISOString(),
      },
      flush: async (batch) => {
        // 書く直前に読み直し、今の行番号で書く。別の画面で変わっていた記録は上書きしない
        const current = parseAlbumArtRows(await artIO.readRows());
        const { appends, updates, written, skipped } = planAlbumArtWrites(batch, existing, current);
        await artIO.updateRows(updates);
        await artIO.appendRows(appends);
        for (const r of written) records.set(albumArtKey(r.albumFolderId, r.album), r);
        for (const r of skipped) {
          skippedCount += 1;
          const key = albumArtKey(r.albumFolderId, r.album);
          const now = current.get(key)?.record;
          if (now) records.set(key, now);
          // どこにも記録されなかった画像は残さない
          if (r.artFileId) void trashDriveFile(getToken, r.artFileId).catch(() => {});
        }
      },
      knownNoEmbedded: knownNoEmbeddedOf(existing),
      shouldStop: () => stopArtRequested,
      onProgress: (done, total, last) => {
        current[last.source] += 1;
        progress.textContent = `${done} / ${total} 枚（${artSummaryText(current)}）`;
      },
    });
    renderArtResults([...records.values()]);
    const again = retryNotFound ? "見つからなかったアルバムをもう一度探す" : "表紙を集める";
    const skippedNote = skippedCount > 0 ? `（${skippedCount}枚は別の画面で変更されていたため、書き込みませんでした）` : "";
    setStatus(
      (result.stopped
        ? `止めました（${result.done}枚まで記録しました）。もう一度「${again}」で続きから進めます。`
        : retryNotFound
          ? `見つからなかった${result.done}枚を探し直し、${result.done - current.notfound - current.error}枚の表紙が見つかりました。`
          : `${result.done}枚の表紙を調べました。`) + skippedNote
    );
  } catch (err) {
    if (isAuthFailure(err)) auth.clearToken();
    setStatus(err instanceof Error ? `表紙を集められませんでした: ${err.message}` : "表紙を集められませんでした", true);
  } finally {
    stopBtn.disabled = true;
    collectBtn.disabled = false;
    retryBtn.disabled = false;
    importBtn.disabled = false;
    release();
  }
}

/** AIが探した候補（albumArtCandidatesタブ）を取り込む。いまも見つからないままのアルバムの分だけ。 */
async function handleImportArtCandidates(): Promise<void> {
  const spreadsheetId = el<HTMLInputElement>("spreadsheet-id").value.trim();
  if (!spreadsheetId) {
    setStatus("索引スプレッドシートIDを入力してください", true);
    return;
  }
  if (!tryAcquire()) {
    setStatus("他の操作が進行中です。完了してからもう一度お試しください。", true);
    return;
  }
  const buttons = ["collect-art-btn", "retry-art-btn", "import-art-btn"].map((id) => el<HTMLButtonElement>(id));
  const stopBtn = el<HTMLButtonElement>("stop-art-btn");
  const progress = el<HTMLParagraphElement>("art-progress");
  for (const b of buttons) b.disabled = true;
  stopArtRequested = false;
  try {
    const getToken = () => auth.ensureAccessToken();
    const artIO = createAlbumArtSheetIO(spreadsheetId, getToken);
    await artIO.ensureTab();
    const candidateRows = await artIO.readCandidateRows();
    if (!candidateRows) {
      setStatus(`索引に「${CANDIDATES_SHEET_NAME}」タブがありません。`, true);
      return;
    }
    const { candidates, skipped: invalid } = parseCandidateRows(candidateRows);
    const existing = parseAlbumArtRows(await artIO.readRows());
    const todo = candidatesToImport(candidates, existing);
    const records = new Map([...existing].map(([key, v]) => [key, v.record]));
    if (todo.length === 0) {
      renderArtResults([...records.values()]);
      setStatus(`取り込む候補はありません（候補${candidates.length}件は、どれも見つからないままのアルバムではありません）。`);
      return;
    }
    const folderId = await ensureArtFolder(getToken);
    const deps = {
      fetchImage: fetchWebImage,
      makeThumbnail: makeJpegThumbnail,
      upload: createArtUploader(getToken, folderId),
      now: () => new Date().toISOString(),
    };
    stopBtn.disabled = false;
    let imported = 0;
    let failed = 0;
    let skippedCount = 0;
    progress.textContent = `0 / ${todo.length} 枚`;
    const result = await runInBatches({
      items: todo,
      collect: (item) => importCandidate(item, deps),
      flush: async (batch) => {
        // 書く直前に読み直し、今の行番号で書く。取り込みを始めてから変わった記録（手で入れた・外した等）は上書きしない
        const current = parseAlbumArtRows(await artIO.readRows());
        const { appends, updates, written, skipped } = planAlbumArtWrites(batch, existing, current);
        await artIO.updateRows(updates);
        await artIO.appendRows(appends);
        for (const r of written) records.set(albumArtKey(r.albumFolderId, r.album), r);
        for (const r of skipped) {
          skippedCount += 1;
          const key = albumArtKey(r.albumFolderId, r.album);
          const now = current.get(key)?.record;
          if (now) records.set(key, now);
          if (r.artFileId) void trashDriveFile(getToken, r.artFileId).catch(() => {});
        }
      },
      shouldStop: () => stopArtRequested,
      onProgress: (done, total, last) => {
        if (last) imported += 1;
        else failed += 1;
        progress.textContent = `${done} / ${total} 枚（取り込んだ ${imported}・画像を取れなかった ${failed}）`;
      },
    });
    renderArtResults([...records.values()]);
    const notes = [
      failed > 0 ? `${failed}枚は画像を取れなかったため、見つからないままです` : "",
      skippedCount > 0 ? `${skippedCount}枚は別の画面で変更されていたため、書き込みませんでした` : "",
      invalid > 0 ? `候補のタブの${invalid}行は形が合わないため読み飛ばしました` : "",
    ].filter(Boolean);
    setStatus(
      (result.stopped ? `止めました（${result.done}枚まで処理しました）。もう一度押すと続きから取り込みます。` : `${imported - skippedCount}枚の表紙を取り込みました。`) +
        (notes.length > 0 ? `（${notes.join("。")}）` : "")
    );
  } catch (err) {
    if (isAuthFailure(err)) auth.clearToken();
    setStatus(err instanceof Error ? `候補を取り込めませんでした: ${err.message}` : "候補を取り込めませんでした", true);
  } finally {
    stopBtn.disabled = true;
    for (const b of buttons) b.disabled = false;
    release();
  }
}

// ===== アルバムアートの確認（一覧・外す・別の候補） =====

interface ArtReviewState {
  spreadsheetId: string;
  records: Map<string, AlbumArtRecord>;
}
let artReview: ArtReviewState | null = null;
// Driveの表紙 → 表示用のURL（一度読んだ画像は読み直さない）
const artImageUrls = new Map<string, string>();
let artImageObserver: IntersectionObserver | null = null;
const reviewSearch = createReviewSearch();

function getArtToken(): Promise<string> {
  return auth.ensureAccessToken();
}

function reviewSpreadsheetIdOrWarn(): string | null {
  const spreadsheetId = el<HTMLInputElement>("spreadsheet-id").value.trim();
  if (!artReview || spreadsheetId !== artReview.spreadsheetId) {
    setStatus("スプレッドシートIDが変わりました。もう一度「確認する」を押してください。", true);
    return null;
  }
  return spreadsheetId;
}

function loadArtImage(fileId: string, img: HTMLImageElement): void {
  const cached = artImageUrls.get(fileId);
  if (cached) {
    img.src = cached;
    return;
  }
  void fetchDriveImage(getArtToken, fileId).then(
    (blob) => {
      const url = URL.createObjectURL(blob);
      artImageUrls.set(fileId, url);
      img.src = url;
    },
    () => {
      img.alt = "画像を読めませんでした";
    }
  );
}

function currentReviewView(): ReviewView {
  const value = el<HTMLSelectElement>("art-view").value;
  return isReviewView(value) ? value : "web";
}

function renderArtReview(): void {
  const container = el<HTMLDivElement>("art-review");
  container.innerHTML = "";
  artImageObserver?.disconnect();
  if (!artReview) return;
  // 画面に入ったタイルの画像だけを読む（数百枚あっても、一度に全部は取りに行かない）
  artImageObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const img = entry.target as HTMLImageElement;
      artImageObserver?.unobserve(img);
      loadArtImage(img.dataset.fileId ?? "", img);
    }
  });
  const view = currentReviewView();
  const unreviewedOnly = el<HTMLInputElement>("art-unreviewed").checked;
  const records = recordsForView(artReview.records.values(), view, { unreviewedOnly });
  const unreviewedCount = records.filter((r) => r.artFileId && !r.reviewedAt).length;
  el<HTMLButtonElement>("art-mark-all-btn").disabled = unreviewedCount === 0;
  const heading = document.createElement("p");
  heading.className = "art-review-count";
  // 表紙の無いアルバムの表示（見つからなかった・外した・読めなかった）には、確かめる表紙が無いので「未確認」と付けない
  const imageView = view !== "notfound" && view !== "rejected" && view !== "error";
  heading.textContent = `${REVIEW_VIEW_LABELS[view]}${unreviewedOnly && imageView ? "（未確認）" : ""}：${records.length}枚`;
  container.append(heading);
  for (const record of records) {
    const key = albumArtKey(record.albumFolderId, record.album);
    const tile = document.createElement("div");
    tile.className = "art-tile";
    if (record.artFileId) {
      const img = document.createElement("img");
      img.alt = `${record.album}の表紙`;
      img.dataset.fileId = record.artFileId;
      tile.append(img);
      artImageObserver.observe(img);
    } else {
      const empty = document.createElement("div");
      empty.className = "art-empty";
      empty.textContent = "表紙なし";
      tile.append(empty);
    }
    const name = document.createElement("p");
    name.className = "art-name";
    name.textContent = record.album;
    const artist = document.createElement("p");
    artist.className = "art-artist";
    artist.textContent = record.artist || "（アーティスト不明・オムニバス）";
    const source = document.createElement("p");
    source.className = "art-source";
    const page = sourcePageUrl(record);
    if (page) {
      const link = document.createElement("a");
      link.href = page;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = SOURCE_LABELS[record.source];
      source.append(link);
    } else {
      source.textContent = SOURCE_LABELS[record.source];
    }
    if (MATCH_LABELS[record.match]) source.append(`・${MATCH_LABELS[record.match]}`);
    if (record.artFileId && record.reviewedAt) source.append("・確認済み");
    const actions = document.createElement("div");
    actions.className = "art-actions";
    if (record.artFileId && !record.reviewedAt) {
      const ok = document.createElement("button");
      ok.type = "button";
      ok.textContent = "OK";
      ok.setAttribute("aria-label", `「${record.album}」の表紙をOKにする`);
      ok.addEventListener("click", () => void handleMarkArtReviewed(key));
      actions.append(ok);
    }
    if (record.artFileId) {
      const reject = document.createElement("button");
      reject.type = "button";
      reject.className = "secondary";
      reject.textContent = "外す";
      reject.setAttribute("aria-label", `「${record.album}」の表紙を外す`);
      reject.addEventListener("click", () => void handleRejectArt(key));
      actions.append(reject);
    }
    const other = document.createElement("button");
    other.type = "button";
    other.className = "secondary";
    other.textContent = "別の候補";
    other.setAttribute("aria-label", `「${record.album}」の別の候補`);
    other.addEventListener("click", () => openArtCandidates(key));
    actions.append(other);
    tile.append(name, artist, source, actions);
    container.append(tile);
  }
}

async function handleReviewArt(): Promise<void> {
  const spreadsheetId = el<HTMLInputElement>("spreadsheet-id").value.trim();
  if (!spreadsheetId) {
    setStatus("索引スプレッドシートIDを入力してください", true);
    return;
  }
  if (!tryAcquire()) {
    setStatus("他の操作が進行中です。完了してからもう一度お試しください。", true);
    return;
  }
  try {
    const artIO = createAlbumArtSheetIO(spreadsheetId, getArtToken);
    await artIO.ensureTab();
    const parsed = parseAlbumArtRows(await artIO.readRows());
    artReview = { spreadsheetId, records: new Map([...parsed].map(([key, v]) => [key, v.record])) };
    closeArtCandidates();
    renderArtReview();
    setStatus(parsed.size > 0 ? `${parsed.size}枚の記録を読み込みました。` : "まだ表紙の記録がありません。先に「表紙を集める」を押してください。");
  } catch (err) {
    if (isAuthFailure(err)) auth.clearToken();
    setStatus(err instanceof Error ? `表紙の記録を読めませんでした: ${err.message}` : "表紙の記録を読めませんでした", true);
  } finally {
    release();
  }
}

class StaleArtRecordError extends Error {}

/**
 * 記録を書き換える。通信の要る準備（画像の送信など）は呼ぶ前に済ませておき、ここでは
 * 書く直前にタブを読み直して今の行番号で書く（スプレッドシートで行を並べ替えていても取り違えないため）。
 * 画面に出している記録（[shown]）から変わっていたら（別の画面・端末で直した等）、見ていない記録を書き換えないよう止める。
 */
async function writeArtRecord(spreadsheetId: string, key: string, shown: AlbumArtRecord, build: (current: AlbumArtRecord) => AlbumArtRecord): Promise<AlbumArtRecord> {
  const artIO = createAlbumArtSheetIO(spreadsheetId, getArtToken);
  const found = parseAlbumArtRows(await artIO.readRows()).get(key);
  if (!found) throw new StaleArtRecordError("このアルバムの記録が見つかりません。もう一度「確認する」を押してください。");
  if (!isSameArtRecord(found.record, shown)) {
    throw new StaleArtRecordError("この表紙は別の画面で変更されています。もう一度「確認する」を押して、今の表紙を見てから選んでください。");
  }
  const next = build(found.record);
  await artIO.updateRows([{ rowNumber: found.rowNumber, row: albumArtRow(next) }]);
  // 古い表紙はゴミ箱へ（失敗しても記録は書けているので止めない）
  if (found.record.artFileId && found.record.artFileId !== next.artFileId) {
    void trashDriveFile(getArtToken, found.record.artFileId).catch(() => {});
  }
  artReview?.records.set(key, next);
  return next;
}

async function handleRejectArt(key: string): Promise<void> {
  const spreadsheetId = reviewSpreadsheetIdOrWarn();
  if (!spreadsheetId) return;
  if (!tryAcquire()) {
    setStatus("他の操作が進行中です。完了してからもう一度お試しください。", true);
    return;
  }
  try {
    const shown = artReview?.records.get(key);
    if (!shown) return;
    const next = await writeArtRecord(spreadsheetId, key, shown, (current) => rejectedRecord(current, new Date().toISOString()));
    renderArtReview();
    setStatus(`「${next.album}」の表紙を外しました。次に集めるときも入れ直しません。`);
  } catch (err) {
    if (isAuthFailure(err)) auth.clearToken();
    setStatus(err instanceof Error ? `外せませんでした: ${err.message}` : "外せませんでした", true);
  } finally {
    release();
  }
}

// 「OK」：この表紙を確かめた印を付ける（未確認だけを表示していれば、一覧から消える）
async function handleMarkArtReviewed(key: string): Promise<void> {
  const spreadsheetId = reviewSpreadsheetIdOrWarn();
  if (!spreadsheetId) return;
  if (!tryAcquire()) {
    setStatus("他の操作が進行中です。完了してからもう一度お試しください。", true);
    return;
  }
  try {
    const shown = artReview?.records.get(key);
    if (!shown) return;
    const next = await writeArtRecord(spreadsheetId, key, shown, (current) => reviewedRecord(current, new Date().toISOString()));
    renderArtReview();
    setStatus(`「${next.album}」の表紙をOKにしました。`);
  } catch (err) {
    if (isAuthFailure(err)) auth.clearToken();
    setStatus(err instanceof Error ? `OKにできませんでした: ${err.message}` : "OKにできませんでした", true);
  } finally {
    release();
  }
}

// 表示中のまだ確かめていない表紙を、まとめてOKにする。書く直前に読み直し、別の画面で変わった表紙には印を付けない
async function handleMarkAllArtReviewed(): Promise<void> {
  const spreadsheetId = reviewSpreadsheetIdOrWarn();
  if (!spreadsheetId || !artReview) return;
  if (!tryAcquire()) {
    setStatus("他の操作が進行中です。完了してからもう一度お試しください。", true);
    return;
  }
  try {
    const shown = recordsForView(artReview.records.values(), currentReviewView(), { unreviewedOnly: el<HTMLInputElement>("art-unreviewed").checked });
    const artIO = createAlbumArtSheetIO(spreadsheetId, getArtToken);
    const current = parseAlbumArtRows(await artIO.readRows());
    const { updates, skipped } = planReviewedWrites(shown, current, new Date().toISOString());
    await artIO.updateRows(updates.map(({ rowNumber, record }) => ({ rowNumber, row: albumArtRow(record) })));
    for (const { record } of updates) artReview.records.set(albumArtKey(record.albumFolderId, record.album), record);
    renderArtReview();
    setStatus(
      `${updates.length}枚の表紙をOKにしました。` +
        (skipped > 0 ? `（${skipped}枚は別の画面で変更されていたため、OKにしませんでした。もう一度「確認する」を押して見直してください）` : "")
    );
  } catch (err) {
    if (isAuthFailure(err)) auth.clearToken();
    setStatus(err instanceof Error ? `OKにできませんでした: ${err.message}` : "OKにできませんでした", true);
  } finally {
    release();
  }
}

function closeArtCandidates(): void {
  const panel = el<HTMLDivElement>("art-candidates");
  panel.hidden = true;
  panel.innerHTML = "";
}

function openArtCandidates(key: string): void {
  const record = artReview?.records.get(key);
  if (!record) return;
  const panel = el<HTMLDivElement>("art-candidates");
  panel.innerHTML = "";
  panel.hidden = false;
  const title = document.createElement("p");
  title.className = "art-name";
  title.textContent = `「${record.album}」の別の候補`;
  const form = document.createElement("div");
  form.className = "art-search";
  const albumInput = document.createElement("input");
  albumInput.value = record.album;
  albumInput.setAttribute("aria-label", "探すアルバム名");
  const artistInput = document.createElement("input");
  artistInput.value = record.artist;
  artistInput.placeholder = "アーティスト（空でもよい）";
  artistInput.setAttribute("aria-label", "探すアーティスト");
  const search = document.createElement("button");
  search.type = "button";
  search.textContent = "探す";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "secondary";
  close.textContent = "閉じる";
  close.addEventListener("click", closeArtCandidates);
  form.append(albumInput, artistInput, search, close);
  const results = document.createElement("div");
  results.className = "art-grid";
  const runSearch = async () => {
    search.disabled = true;
    results.innerHTML = "";
    setStatus("候補を探しています…");
    try {
      const candidates = await reviewSearch(albumInput.value.trim(), artistInput.value.trim());
      renderArtCandidates(results, key, candidates);
      setStatus(candidates.length > 0 ? `${candidates.length}件の候補が見つかりました（画像の無い候補は表示しません）。` : "候補が見つかりませんでした。名前を変えて探してみてください。");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "候補を探せませんでした", true);
    } finally {
      search.disabled = false;
    }
  };
  search.addEventListener("click", () => void runSearch());
  // 候補に無ければ、手元の画像ファイルを選んで入れる
  const fileRow = document.createElement("div");
  fileRow.className = "art-file";
  const fileLabel = document.createElement("label");
  fileLabel.textContent = "画像ファイルから入れる：";
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/*";
  fileInput.setAttribute("aria-label", `「${record.album}」の表紙にする画像ファイル`);
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (file) void handleUploadArt(key, file);
  });
  fileLabel.append(fileInput);
  fileRow.append(fileLabel);
  panel.append(title, form, fileRow, results);
  panel.scrollIntoView({ block: "nearest" });
  void runSearch();
}

function renderArtCandidates(container: HTMLElement, key: string, candidates: ReviewCandidate[]): void {
  for (const candidate of candidates) {
    const tile = document.createElement("div");
    tile.className = "art-tile";
    const img = document.createElement("img");
    img.src = candidate.previewUrl;
    img.alt = `${candidate.title}の表紙の候補`;
    img.loading = "lazy";
    // 表紙が登録されていない候補（MusicBrainzで多い）は出さない
    img.addEventListener("error", () => tile.remove());
    const name = document.createElement("p");
    name.className = "art-name";
    name.textContent = candidate.title;
    const artist = document.createElement("p");
    artist.className = "art-artist";
    artist.textContent = candidate.artist;
    const source = document.createElement("p");
    source.className = "art-source";
    source.textContent = SOURCE_LABELS[candidate.source];
    const choose = document.createElement("button");
    choose.type = "button";
    choose.textContent = "これにする";
    choose.setAttribute("aria-label", `「${candidate.title}」（${SOURCE_LABELS[candidate.source]}）の表紙にする`);
    choose.addEventListener("click", () => void handleChooseArt(key, candidate));
    tile.append(img, name, artist, source, choose);
    container.append(tile);
  }
}

/**
 * 表紙を差し替える（別の候補・画像ファイルで共通）。[makeImage]で縮めた画像を作り、先にDriveへ置いてから、
 * 記録を書く直前に行を探し直す（送信中に行が並べ替えられても取り違えない）。
 */
async function replaceArt(
  key: string,
  makeImage: () => Promise<Blob>,
  build: (current: AlbumArtRecord, artFileId: string, now: string) => AlbumArtRecord
): Promise<void> {
  const spreadsheetId = reviewSpreadsheetIdOrWarn();
  if (!spreadsheetId) return;
  if (!tryAcquire()) {
    setStatus("他の操作が進行中です。完了してからもう一度お試しください。", true);
    return;
  }
  try {
    setStatus("表紙を差し替えています…");
    const thumb = await makeImage();
    const shown = artReview?.records.get(key);
    if (!shown) return;
    const folderId = await ensureArtFolder(getArtToken);
    const upload = createArtUploader(getArtToken, folderId);
    const artFileId = await upload({ albumFolderId: shown.albumFolderId, album: shown.album, artist: shown.artist, shelf: "artist", tracks: [] }, thumb);
    let next: AlbumArtRecord;
    try {
      next = await writeArtRecord(spreadsheetId, key, shown, (current) => build(current, artFileId, new Date().toISOString()));
    } catch (err) {
      // 記録に使われていないと確かな場合（書く前に止めた）だけ、送った画像を消す。
      // 書き込みの応答が届かなかった等で、記録されたか分からない場合は消さない（記録済みの画像を消してしまわないため）
      if (err instanceof StaleArtRecordError) void trashDriveFile(getArtToken, artFileId).catch(() => {});
      throw err;
    }
    closeArtCandidates();
    renderArtReview();
    setStatus(`「${next.album}」の表紙を差し替えました。`);
  } catch (err) {
    if (isAuthFailure(err)) auth.clearToken();
    setStatus(err instanceof Error ? `差し替えられませんでした: ${err.message}` : "差し替えられませんでした", true);
  } finally {
    release();
  }
}

function handleChooseArt(key: string, candidate: ReviewCandidate): Promise<void> {
  return replaceArt(
    key,
    async () => {
      const image = await fetchWebImage(candidate.imageUrl);
      if (!image) throw new Error("この候補の画像は取れませんでした。別の候補を選んでください。");
      const thumb = await makeJpegThumbnail(image.data, image.format);
      if (!thumb) throw new Error("この候補の画像は読めませんでした。別の候補を選んでください。");
      return thumb;
    },
    (current, artFileId, now) => chosenRecord(current, candidate, artFileId, now)
  );
}

// 手元の画像ファイル（検索で見つからない表紙を、自分で保存した画像から入れる）
function handleUploadArt(key: string, file: File): Promise<void> {
  return replaceArt(
    key,
    async () => {
      const thumb = await makeJpegThumbnail(new Uint8Array(await file.arrayBuffer()), file.type);
      if (!thumb) throw new Error("この画像ファイルは読めませんでした。JPEG・PNG・WebPなどの画像を選んでください。");
      return thumb;
    },
    (current, artFileId, now) => uploadedRecord(current, artFileId, file.name, now)
  );
}

// ===== ログイン・初期化 =====

async function handleLogin(): Promise<void> {
  const loginBtn = el<HTMLButtonElement>("login-btn");
  loginBtn.disabled = true;
  try {
    setStatus("ログイン中...");
    await auth.requestAccessToken({ prompt: "consent" });
    setStatus("ログイン済み。スプレッドシートIDを入力してチェックできます。");
    el<HTMLButtonElement>("check-casing-btn").disabled = false;
    el<HTMLButtonElement>("check-genre-btn").disabled = false;
    el<HTMLButtonElement>("check-garbled-btn").disabled = false;
    el<HTMLButtonElement>("check-health-btn").disabled = false;
    el<HTMLButtonElement>("check-missing-btn").disabled = false;
    el<HTMLButtonElement>("collect-art-btn").disabled = false;
    el<HTMLButtonElement>("retry-art-btn").disabled = false;
    el<HTMLButtonElement>("import-art-btn").disabled = false;
    el<HTMLButtonElement>("review-art-btn").disabled = false;
  } catch (err) {
    setStatus(err instanceof AuthError ? err.message : String(err), true);
  } finally {
    loginBtn.disabled = false;
  }
}

function whenPageLoaded(cb: () => void): void {
  if (document.readyState === "complete") cb();
  else window.addEventListener("load", cb, { once: true });
}

function init(): void {
  render();
  if (!CLIENT_ID) return;
  whenPageLoaded(() => {
    auth.init(CLIENT_ID);
  });
  el<HTMLButtonElement>("login-btn").addEventListener("click", () => void handleLogin());
  el<HTMLButtonElement>("check-casing-btn").addEventListener("click", () => void handleCheckCasing());
  el<HTMLButtonElement>("apply-casing-btn").addEventListener("click", () => void handleApplyCasingNormalization());
  el<HTMLButtonElement>("revert-casing-btn").addEventListener("click", () => void handleRevertCasingNormalization());
  el<HTMLButtonElement>("check-genre-btn").addEventListener("click", () => void handleCheckGenre());
  el<HTMLButtonElement>("apply-genre-btn").addEventListener("click", () => void handleApplyGenreNormalization());
  el<HTMLButtonElement>("revert-genre-btn").addEventListener("click", () => void handleRevertGenreNormalization());
  el<HTMLButtonElement>("check-garbled-btn").addEventListener("click", () => void handleCheckGarbled());
  el<HTMLButtonElement>("apply-garbled-btn").addEventListener("click", () => void handleApplyGarbledRepair());
  el<HTMLButtonElement>("revert-garbled-btn").addEventListener("click", () => void handleRevertGarbledRepair());
  el<HTMLButtonElement>("check-health-btn").addEventListener("click", () => void handleHealthCheck());
  el<HTMLButtonElement>("check-missing-btn").addEventListener("click", () => void handleCheckMissingFields());
  el<HTMLButtonElement>("apply-missing-btn").addEventListener("click", () => void handleApplyMissingFields());
  el<HTMLButtonElement>("revert-missing-btn").addEventListener("click", () => void handleRevertMissingFields());
  el<HTMLButtonElement>("collect-art-btn").addEventListener("click", () => void handleCollectArt());
  el<HTMLButtonElement>("retry-art-btn").addEventListener("click", () => void handleCollectArt(true));
  el<HTMLButtonElement>("import-art-btn").addEventListener("click", () => void handleImportArtCandidates());
  const artView = el<HTMLSelectElement>("art-view");
  for (const view of REVIEW_VIEWS) artView.append(new Option(REVIEW_VIEW_LABELS[view], view));
  artView.addEventListener("change", renderArtReview);
  el<HTMLInputElement>("art-unreviewed").addEventListener("change", renderArtReview);
  el<HTMLButtonElement>("art-mark-all-btn").addEventListener("click", () => void handleMarkAllArtReviewed());
  el<HTMLButtonElement>("review-art-btn").addEventListener("click", () => void handleReviewArt());
  el<HTMLButtonElement>("stop-art-btn").addEventListener("click", () => {
    stopArtRequested = true;
    el<HTMLButtonElement>("stop-art-btn").disabled = true;
    el<HTMLParagraphElement>("art-progress").textContent += "（いま調べている分が終わったら止めます）";
  });
}

init();
