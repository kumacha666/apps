// DustyJukebox Tools — dusty-jukebox本体のカタログ補正機能（表記ゆれ統一・文字化け修復）を
// 分離した、必要な時だけ起動する管理ツール。本体とは独立したVite+TSアプリ（apps全体の方針
// 「アプリ間のコード共有はしない」に沿い、auth.ts/sheets.tsは本体から必要な部分だけを移植）。
// スキャン・タグ抽出・再生機能は一切持たない：既存の索引スプレッドシート（indexタブ）を
// 読み書きするだけの単機能ツール。
import { AuthError, DriveAuth } from "./auth";
import { createSheetsIndexIO, isValidIndexHeader, SheetsHttpError } from "./sheets";
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
  return err instanceof AuthError || (err instanceof SheetsHttpError && err.status === 401);
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
      <button id="login-btn" type="button">スプレッドシートへログイン</button>
      <section class="section">
        <h2>表記ゆれ統一</h2>
        <p>アーティスト・アルバムアーティスト・作曲者の大文字小文字の表記ゆれ（例:「AKB48」と「akb48」）を統一します。既に手動補正済みの曲は対象外です。</p>
        <button id="check-casing-btn" type="button" disabled>表記ゆれをチェック</button>
        <div id="casing-results"></div>
        <div><button id="apply-casing-btn" type="button" disabled>統一を適用</button> <button id="revert-casing-btn" type="button" disabled>直前の統一を元に戻す</button></div>
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
    if (!isValidIndexHeader(await sheetsIO.readHeaderRow())) {
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
    if (!isValidIndexHeader(await sheetsIO.readHeaderRow())) {
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
    if (!isValidIndexHeader(await sheetsIO.readHeaderRow())) {
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
    if (!isValidIndexHeader(await sheetsIO.readHeaderRow())) {
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

// ===== ログイン・初期化 =====

async function handleLogin(): Promise<void> {
  const loginBtn = el<HTMLButtonElement>("login-btn");
  loginBtn.disabled = true;
  try {
    setStatus("ログイン中...");
    await auth.requestAccessToken({ prompt: "consent" });
    setStatus("ログイン済み。スプレッドシートIDを入力してチェックできます。");
    el<HTMLButtonElement>("check-casing-btn").disabled = false;
    el<HTMLButtonElement>("check-garbled-btn").disabled = false;
    el<HTMLButtonElement>("check-health-btn").disabled = false;
    el<HTMLButtonElement>("check-missing-btn").disabled = false;
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
  el<HTMLButtonElement>("check-garbled-btn").addEventListener("click", () => void handleCheckGarbled());
  el<HTMLButtonElement>("apply-garbled-btn").addEventListener("click", () => void handleApplyGarbledRepair());
  el<HTMLButtonElement>("revert-garbled-btn").addEventListener("click", () => void handleRevertGarbledRepair());
  el<HTMLButtonElement>("check-health-btn").addEventListener("click", () => void handleHealthCheck());
  el<HTMLButtonElement>("check-missing-btn").addEventListener("click", () => void handleCheckMissingFields());
  el<HTMLButtonElement>("apply-missing-btn").addEventListener("click", () => void handleApplyMissingFields());
  el<HTMLButtonElement>("revert-missing-btn").addEventListener("click", () => void handleRevertMissingFields());
}

init();
