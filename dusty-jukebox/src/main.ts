// エントリポイント。Phase 1着手順1: OAuth認証（トークンモデル）＋drive.readonlyでのファイル一覧取得のみ実装。
// 索引Sheets書き込み・実Rangeフェッチ・絞り込み/再生UIは未着手（dusty-jukebox/CLAUDE.md参照）。
import { AuthError, DriveAuth } from "./auth";
import { createDriveListFn, listAudioFilesRecursive, type AudioFileEntry } from "./drive";

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
      <button id="login-btn" type="button">Googleドライブへログイン（読み取り専用）</button>
      <button id="scan-btn" type="button" disabled>フォルダ内の音楽ファイルを数える</button>
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
  try {
    setStatus("ログイン中...");
    await auth.requestAccessToken({ prompt: "consent" });
    setStatus("ログイン済み。フォルダIDを入力してスキャンできます。");
    el<HTMLButtonElement>("scan-btn").disabled = false;
  } catch (err) {
    setStatus(err instanceof AuthError ? err.message : String(err), true);
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
  if (!folderId) {
    setStatus("フォルダIDを入力してください", true);
    return;
  }
  try {
    setStatus("スキャン中...（フォルダ構成によっては時間がかかります）");
    const listFn = createDriveListFn(() => auth.ensureAccessToken());
    const failedFolders: string[] = [];
    const entries = await listAudioFilesRecursive(listFn, folderId, "", failedFolders);
    renderResults(entries, failedFolders);
    setStatus("スキャン完了");
  } catch (err) {
    setStatus(err instanceof Error ? err.message : String(err), true);
  }
}

function init(): void {
  render();
  if (!CLIENT_ID) return;

  auth.init(CLIENT_ID);
  el<HTMLButtonElement>("login-btn").addEventListener("click", () => void handleLogin());
  el<HTMLButtonElement>("scan-btn").addEventListener("click", () => void handleScan());
}

init();
