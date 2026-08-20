// エントリポイント。Phase 1着手順3の一部: 実DriveでのRangeフェッチ＋タグ抽出をスキャンUIと
// Sheets索引upsertに結線した。sync タブ管理（startPageToken/rootFolderId/initialScanCompletedAt）・
// 初回スキャンのバッチ処理・中断再開・絞り込み/再生UIは未着手（dusty-jukebox/CLAUDE.md参照）。
// このPRのスキャンは「見つかった全ファイルを1回で最後まで処理する」素朴な実装で、途中で
// タブを閉じる／通信が長時間切れる等での中断・再開には対応しない。
import { AuthError, DriveAuth } from "./auth";
import {
  createDriveFetchRange,
  createDriveGetFn,
  createDriveListFn,
  listAudioFilesRecursive,
  validateRootFolder,
  ConcurrencyLimiter,
  DriveHttpError,
  type AudioFileEntry,
} from "./drive";
import { extractTags } from "./tagExtraction";
import { buildIndexRow, createSheetsIndexIO, upsertIndexRows, SheetsHttpError, type UpsertIndexEntry } from "./sheets";

// Drive/Sheets双方が直接401を返したケース・GISのサイレント再取得自体が失敗したケースのどれも、
// 「今キャッシュされているトークンはもう使えない」ことを意味する
function isAuthFailure(err: unknown): boolean {
  return (
    err instanceof AuthError ||
    (err instanceof DriveHttpError && err.status === 401) ||
    (err instanceof SheetsHttpError && err.status === 401)
  );
}

// タグ抽出は1ファイルあたり複数回のRangeリクエスト＋パース処理を伴い、フォルダ一覧取得より
// 重い。drive.tsのフォルダ走査と同じ暫定値（DEFAULT_MAX_CONCURRENT_LISTS=6）よりやや控えめにする。
const MAX_CONCURRENT_EXTRACTIONS = 4;

// 見つかった音楽ファイル全件のタグを抽出し、sheets.tsのupsertIndexRowsへ渡せる形に組み立てる。
// 1ファイルの抽出失敗（タイムアウト等）はextractionFailed=trueとして記録するだけでスキャン全体は
// 止めない（CONCEPT.md 5節）。
async function extractAndBuildEntries(
  entries: AudioFileEntry[],
  getAccessToken: () => Promise<string>,
  onProgress: (done: number, total: number) => void
): Promise<UpsertIndexEntry[]> {
  const limiter = new ConcurrencyLimiter(MAX_CONCURRENT_EXTRACTIONS);
  const lastScannedAtIso = new Date().toISOString();
  let done = 0;
  const results = await Promise.all(
    entries.map(({ file }) =>
      limiter.run(async () => {
        const { tags, extractionFailed } = await extractTags({ id: file.id, name: file.name, size: Number(file.size) || undefined }, (signal) =>
          createDriveFetchRange(file.id, getAccessToken, { signal })
        );
        done += 1;
        onProgress(done, entries.length);
        const row = buildIndexRow({
          fileId: file.id,
          fileName: file.name,
          parentId: file.parents?.[0] ?? "",
          driveModifiedTime: file.modifiedTime ?? "",
          lastScannedAtIso,
          tags,
          extractionFailed,
        });
        return { fileId: file.id, row };
      })
    )
  );
  return results;
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
    // （2026-08-19 Codexレビュー指摘）
    await validateRootFolder(getFn, folderId);

    setStatus("スキャン中...（フォルダ構成によっては時間がかかります）");
    const listFn = createDriveListFn(() => auth.ensureAccessToken());
    const failedFolders: string[] = [];
    const entries = await listAudioFilesRecursive(listFn, folderId, "", failedFolders);
    renderResults(entries, failedFolders);

    setStatus(`タグを抽出中...（0/${entries.length}件）`);
    const upsertEntries = await extractAndBuildEntries(entries, () => auth.ensureAccessToken(), (done, total) =>
      setStatus(`タグを抽出中...（${done}/${total}件）`)
    );

    setStatus("スプレッドシートへ書き込み中...");
    const sheetsIO = createSheetsIndexIO(spreadsheetId, () => auth.ensureAccessToken());
    await upsertIndexRows(sheetsIO, upsertEntries);

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
