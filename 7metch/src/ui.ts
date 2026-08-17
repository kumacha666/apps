import type { ScreenName, StarGate, SaveData } from "./types";
import { G, PIECE_COLORS, STAR_GATES, DEFAULT_OPTIONS, ITEM_COSTS, loadOptions, saveOptions, applyVisualOptions, loadSave, writeSave } from "./state";
import { initAudio, switchBgm, stopAllBgm, applyAudioOptions, SFX } from "./audio";
import { buildPieceCache, startBgAnim, stopBgAnim, initBgStars, startTitleBgAnim, stopTitleBgAnim, startResultBgAnim, stopResultBgAnim, startSplashBgAnim, stopSplashBgAnim, drawBoard } from "./rendering";
import { updateItemBar, cancelItemMode, updateHUD, doMove, useShuffle, useAddMoves, showColorPicker, finishTurn, ensurePlayableBoard, checkWinLose } from "./game";
import { createBoard, initCellState, countAvailableMoves, startHintTimer, clearHint } from "./board";
import { buildStages, buildOrbitPilotStages, getTotalStars, isStageUnlocked, getGateFor, boardSizeForStage, getMissionText, lastClearedRealStageIdx, nextStageBoundary, isRealCampaignStage, stageConfigAt, totalReachableStageCount, shouldGeneratePreviewStages } from "./stages";
import { track, FEEDBACK_URL, peekAnonId } from "./tracking";
import { initInput, renderHelpPieceIcons } from "./input";
import { sleep } from "./animations";
import { StageStartQueue } from "./stageStartQueue";

// --- Screens ---

// サポートID表示を更新する。初回セッションはinitUI()実行時点では7metch_uidが
// まだ作られておらず「履歴なし」と表示されるが、track()呼び出しでID発行後に
// タイトル画面へ戻ってきたときに正しい値を再表示できるようにする
export function refreshSupportId(): void {
  document.getElementById("support-id-value")!.textContent = peekAnonId() || "履歴なし";
}

// startStage()の詰み回復待機(await ensurePlayableBoard())中に、ステージ選択の
// 「もどる」・ゲーム中の「やめる」等でプレイヤーが別画面へ遷移した場合、待機完了後の
// showScreen("game")がその操作を上書きしてしまう欠落があった(/code-review指摘)。
// showScreen()に"game"以外への遷移が来るたびに増分するカウンタを持たせ、
// startStage()側で「待機前後でこのカウンタが変わっていないか」を見ることで、
// 個々のボタンハンドラを1つずつガードせずに「競合するナビゲーションが起きたか」を
// 一元的に検知できるようにする
let navigationEpoch = 0;
export function getNavigationEpoch(): number {
  return navigationEpoch;
}

export function showScreen(name: ScreenName): void {
  if (name !== "game") navigationEpoch++;
  const fromGame = name === "options" && G.optionsReturnScreen === "game";
  if (name !== "game" && !fromGame) { clearHint(); stopBgAnim(); }
  if (name !== "title" && name !== "splash") stopTitleBgAnim();
  if (name === "splash") stopSplashBgAnim();
  if (name !== "result") stopResultBgAnim();
  Object.values(G.screens!).forEach((s: HTMLElement) => s.classList.remove("active"));
  G.screens![name].classList.add("active");
  if (name === "title") refreshSupportId();
  if (name === "game") startBgAnim();
  if (name === "title") startTitleBgAnim();
  if (name === "splash") startSplashBgAnim();
  if (name === "result") startResultBgAnim();
  if (G.bgmInitialized) {
    switch (name) {
      case "options": if (G.optionsReturnScreen !== "game") switchBgm("title"); break;
      case "title": case "help": switchBgm("title"); break;
      case "stageSelect": switchBgm("select"); break;
      case "game": switchBgm("ingame"); break;
      case "result": case "splash": stopAllBgm(); break;
    }
  }
}

// --- Options UI ---

export function syncOptionsUI(): void {
  (document.getElementById("opt-bgm-vol") as HTMLInputElement).value = String(G.options.bgmVol);
  document.getElementById("opt-bgm-val")!.textContent = String(G.options.bgmVol);
  (document.getElementById("opt-sfx-vol") as HTMLInputElement).value = String(G.options.sfxVol);
  document.getElementById("opt-sfx-val")!.textContent = String(G.options.sfxVol);
  (document.getElementById("opt-saturation") as HTMLInputElement).value = String(G.options.saturation);
  document.getElementById("opt-sat-val")!.textContent = String(G.options.saturation);
  (document.getElementById("opt-brightness") as HTMLInputElement).value = String(G.options.brightness);
  document.getElementById("opt-brt-val")!.textContent = String(G.options.brightness);
  (document.getElementById("opt-bg-anim") as HTMLInputElement).checked = G.options.bgAnim;
  (document.getElementById("opt-screen-shake") as HTMLInputElement).checked = G.options.screenShake;
}

// --- Game Modal ---

export function showGameModal(text: string, confirmLabel?: string, cancelLabel?: string): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = document.getElementById("game-modal-overlay")!;
    const textEl = document.getElementById("game-modal-text")!;
    const buttonsEl = document.getElementById("game-modal-buttons")!;
    textEl.textContent = text;
    buttonsEl.innerHTML = "";
    const btnConfirm = document.createElement("button");
    btnConfirm.className = "modal-btn-confirm";
    btnConfirm.textContent = confirmLabel || "はい";
    const btnCancel = document.createElement("button");
    btnCancel.className = "modal-btn-cancel";
    btnCancel.textContent = cancelLabel || "いいえ";
    btnCancel.addEventListener("click", () => { overlay.classList.add("hidden"); resolve(false); });
    btnConfirm.addEventListener("click", () => { overlay.classList.add("hidden"); resolve(true); });
    buttonsEl.appendChild(btnCancel);
    buttonsEl.appendChild(btnConfirm);
    overlay.classList.remove("hidden");
  });
}

export function showGateBlockMessage(gate: StarGate): void {
  const total = getTotalStars();
  const need = gate.stars - total;
  const toast = document.getElementById("gate-toast")!;
  toast.textContent = `★ あと${need}個で次のエリア解放！`;
  toast.classList.remove("hidden");
  setTimeout(() => { toast.classList.add("hidden"); }, 2500);
  buildStageSelect();
  showScreen("stageSelect");
}

// --- Stage Select ---

export function buildStageSelect(): void {
  const grid = document.getElementById("stage-grid")!;
  grid.innerHTML = "";
  const total = getTotalStars();

  document.getElementById("total-stars-display")!.innerHTML = `★ ${total}　<span style="color:#4ecdc4"><span class="coin-icon"></span> ${G.saveData.coins || 0}</span>`;

  const lastClearedIdx = lastClearedRealStageIdx();
  const visibleUpTo = lastClearedIdx + 6;

  let stopped = false;

  // Stage 501〜524(デバッグプレビュー)はG.STAGESに含まれないため、この
  // ループは自然に本編分だけを対象にする(G.debugPreviewStagesは別管理)
  for (let i = 0; i < G.STAGES!.length; i++) {
    if (stopped) break;

    const gate = getGateFor(i);
    if (gate && gate.stars > total && i > lastClearedIdx) {
      const gateEl = document.createElement("div");
      gateEl.className = "stage-gate";
      gateEl.innerHTML = `★${gate.stars} で次のエリア解放（あと${gate.stars - total}）`;
      grid.appendChild(gateEl);
      stopped = true;
      break;
    }

    if (i > visibleUpTo && !G.saveData.cleared[i]) break;

    const stg = stageConfigAt(i);
    const btn = document.createElement("button");
    btn.className = "stage-btn";
    const unlocked = isStageUnlocked(i);
    if (!unlocked) btn.classList.add("locked");

    const stars = G.saveData.bestStars[i] || 0;
    btn.classList.add(`star${stars}`);
    const filled = "★".repeat(stars);
    const empty = "☆".repeat(3 - stars);
    btn.innerHTML = `<span class="stage-num">${stg.name}</span><span class="stage-stars">${filled}${empty}</span>`;

    if (unlocked) {
      btn.addEventListener("click", async () => {
        await startStage(i);
      });
    }

    if (i === lastClearedIdx + 1 && unlocked) {
      btn.classList.add("stage-current");
      requestAnimationFrame(() => btn.scrollIntoView({ behavior: "smooth", block: "center" }));
    } else if (i === lastClearedIdx && lastClearedIdx === visibleUpTo - 6 + 5) {
      requestAnimationFrame(() => btn.scrollIntoView({ behavior: "smooth", block: "center" }));
    }

    grid.appendChild(btn);
  }
}

// --- Start Stage ---

interface TutorialEntry {
  icon: string;
  html: string;
}

// Stage 1・2向けは連番インデックス(0, 1)、第1章「軌道系」初出のStage 501は
// 内部インデックス500。間の499個を埋める必要が無いよう配列ではなくRecordで持つ
const TUTORIALS: Record<number, TutorialEntry> = {
  0: { icon: "👆", html: 'ピースをスワイプして<br>入れ替えよう！<br><strong>8方向</strong>に動かせるよ' },
  1: { icon: "🎯", html: '上の<strong>ミッション欄</strong>をチェック！<br>手数以内に達成して<br>★を集めよう' },
  500: { icon: "🌀", html: '<strong>オービットセル</strong>が登場！<br>周囲3x3マスの外から入るピースは<strong>矢印と同じ方向</strong>に動く時だけ入れる<br>外周のマスを全部消して<strong>パターン消し</strong>を達成しよう' },
};

function showTutorial(stageIndex: number): void {
  const t = TUTORIALS[stageIndex];
  if (!t) return;
  if (G.saveData.tutorialDone && G.saveData.tutorialDone[stageIndex]) return;
  const overlay = document.getElementById("tutorial-overlay")!;
  document.getElementById("tutorial-icon")!.textContent = t.icon;
  document.getElementById("tutorial-text")!.innerHTML = t.html;
  overlay.classList.remove("hidden");
  const dismiss = (): void => {
    overlay.classList.add("hidden");
    overlay.removeEventListener("click", dismiss);
    if (!G.saveData.tutorialDone) G.saveData.tutorialDone = {};
    G.saveData.tutorialDone[stageIndex] = true;
    writeSave();
  };
  overlay.addEventListener("click", dismiss);
}

// startStage()は非同期（詰み回復待機を含む）で、その間にG.currentStage/G.board/
// G.rows/G.cols等のGを直接書き換える。実行中に別のstartStage()呼び出しが来た
// 場合、単純にreturnで破棄すると「ボタンを押しても何も起きない」に見える無言破棄に
// なり（9巡目・10巡目の/code-review指摘、下記CLAUDE.md参照）、かといって並行実行を
// 許すと古い処理が新しいステージのGを後から上書きしてしまう。StageStartQueueが
// 「実行中は1つだけ・新しい要求は最新のものだけ保留し、実行中の処理が完了してから
// 1回だけ反映する」という直列化を管理する（詳細はstageStartQueue.ts参照）。
// contextにはnavigationEpochを渡す——要求が実際に実行されるのは要求された瞬間より
// 後になりうるため（先行する古い要求の処理待ち）、要求時点のepochを保持しておかないと
// 「要求後・実行開始前に起きたナビゲーション」を実行側が検知できない
// (11巡目、/code-review指摘)
const stageStartQueue = new StageStartQueue<number>();

export async function startStage(index: number): Promise<void> {
  const epoch = getNavigationEpoch();
  if (!stageStartQueue.requestStart(index, epoch)) return;
  try {
    let target = index;
    let epochAtRequest = epoch;
    // 保留要求をループで消化する（再帰にしない——要求が連続してもコールスタックが
    // 積み上がらない）。1回のrunStageStart()が完了するたびに、その間に来た
    // 新しい要求（最後のものだけ）があれば続けて処理する
    for (;;) {
      await runStageStart(target, epochAtRequest);
      const next = stageStartQueue.takeNextOrFinish();
      if (next === null) break;
      target = next.index;
      epochAtRequest = next.context;
    }
  } finally {
    // runStageStart()が例外を投げた場合でも、キューを確実にrunning=falseへ戻す
    // （通常経路ではtakeNextOrFinish()が既にfalseにしているため、この呼び出しは
    // 冪等・無害）
    stageStartQueue.reset();
  }
}

// 1回分のステージ開始処理本体。呼び出し元(startStage())が直列化を保証しているため、
// この関数の実行中に他のrunStageStart()呼び出しが並行して動くことは無い。
// epochAtRequestはこの要求が発行された瞬間のnavigationEpoch（呼び出し元から
// そのまま受け取る）——この関数の内部で改めてgetNavigationEpoch()を取り直すと、
// 「要求されてから先行する古い要求の処理待ちで、この試行が実際に始まるまでの間」に
// 起きたナビゲーションを見逃してしまう（実行開始時点を基準にすると「変化なし」に
// 見えてしまうため。11巡目、/code-review指摘）
async function runStageStart(index: number, epochAtRequest: number): Promise<void> {
  const epochBeforeWait = epochAtRequest;
  // 既に実行中の他の操作（doMove/activateByTap/useShuffle/usePinpoint/
  // useColorBomb、いずれもG.animatingを共有ミューテックスとして使う）はここでは
  // 止まらず、そのまま完走しようとする。ここで待たずに盤面を再初期化すると、
  // 例えばシャッフル演出中のawait sleep(300)明けにその古い呼び出しが
  // resolveBoard()/finishTurn()を新しいステージの盤面へ実行してしまう
  // (7巡目の/code-review指摘)。G.animatingがfalseに戻る（＝進行中の操作が
  // finallyまで完走する）のを待ってから自分の初期化を始める。この待機中に
  // 新しい開始要求が来ている、または「やめる」等でナビゲーションが起きた場合、
  // この試行はもう無意味になるので即座に諦める（盤面初期化は一切行っていないので
  // 他に後始末は不要。新しい要求があれば呼び出し元のループが続けて処理する。
  // 9巡目の/code-review指摘）
  while (G.animating) {
    if (stageStartQueue.hasPending() || getNavigationEpoch() !== epochBeforeWait) return;
    await sleep(16);
  }
  G.animating = true;
  try {
    G.currentStage = index;
    const stg = stageConfigAt(index);
    G.cols = stg.boardCols;
    G.rows = stg.boardRows;
    G.movesLeft = stg.moves;
    G.score = 0;
    G.totalCleared = 0;
    G.colorCleared = [];
    G.chainCount = 0;
    G.specialsCreated = 0;
    G.maxChain = 0;
    G.patternProgress = new Set();
    G.selected = null;
    G.vfxParticles = []; G.vfxShockwaves = []; G.vfxFlashes = []; G.vfxComets = []; G.vfxTexts = []; G.shakeX = G.shakeY = G.shakeIntensity = 0;
    G.itemMode = null;
    G.coinsEarned = 0;
    G.canvas!.classList.remove("item-targeting");

    resizeCanvas();
    applyVisualOptions();
    initCellState(stg);
    createBoard(stg.colors);

    // createBoard()は合法手0件の盤面を可能な限り避けるが、20回の生成試行が
    // 全て範囲外に終わった場合の最終フォールバックは確率的にはまだ0件になりうる。
    // ステージ開始直後（まだ1手も打っていない状態）の詰みはfinishTurn()経由の
    // 詰み検知（プレイヤーが1手打った後にしか走らない）では発見できないため、
    // showScreen("game")の前にここでも同じ回復経路を通す（/code-review指摘）。
    // 注意: リトライ・Next・結果画面リトライ経由の場合は前のステージの
    // #screen-gameが既にactiveなままなので、実際に回復（シャッフル演出）が
    // 走った場合はプレイヤーに見える（タイトル・ステージ選択経由の場合のみ
    // 画面が非activeなので見えない）。詰み回復自体が稀なケースであることに加え、
    // 見えたとしても新ステージの盤面が一瞬シャッフルされるだけで実害が無いため、
    // 現時点では許容している
    await ensurePlayableBoard();
    // E2Eテストが「初期詰み回復の待機中」を確率に頼らず決定的に再現するための
    // テスト専用フック。本番ビルドではimport.meta.env.DEVが静的にfalseへ置き換わり
    // デッドコード除去されるため一切含まれない（Viteの標準的なdev-onlyコード分離
    // パターン）。詳細はtestOnlyStageStartDelay()参照（10巡目、/code-review指摘）
    await testOnlyStageStartDelay();

    // 上の待機中に新しい開始要求が来ている、または「もどる」「やめる」等で
    // プレイヤーが別画面へ既に遷移していた場合、ここでshowScreen("game")を
    // 呼ぶとその操作を上書きしてしまう(/code-review指摘)。navigationEpochが
    // 変化していれば競合するナビゲーションが起きたとみなし、画面遷移・HUD更新・
    // チュートリアル表示をスキップする。新しい要求があれば呼び出し元のループが
    // 続けて処理する（G.animatingの解除自体はfinally側で必ず行われるので、
    // 次の開始操作はブロックされない。10巡目の/code-review指摘）
    if (stageStartQueue.hasPending() || getNavigationEpoch() !== epochBeforeWait) return;

    // ensurePlayableBoard()の詰み回復（recoverFromDeadlock()内のresolveMatches
    // ("recovery_shuffle")）が偶然ミッションを達成させてしまう可能性がある。
    // finishTurn()が詰み回復後に勝敗を再判定するのと同じ理由で、ここでも
    // 回復後に判定する（/code-review指摘）。達成済みならcheckWinLose()内部で
    // showResult()へのタイマーが仕込まれるため、通常の開始処理は行わない
    updateHUD();
    if (checkWinLose()) return;

    updateItemBar();
    drawBoard();
    showScreen("game");
    track("stage_start", { stage: stg.name, mission_type: stg.mission.type });
    showTutorial(index);
  } finally {
    G.animating = false;
    startHintTimer();
  }
}

declare global {
  interface Window {
    __test_stageStartDelayMs?: number;
  }
}

// startStage()のensurePlayableBoard()待機を確率的な詰み発生に頼らず引き延ばすための
// テスト専用フック。import.meta.env.DEVはViteが本番ビルド時に静的にfalseへ置き換え、
// 到達不能になったこの関数の中身ごとデッドコード除去する（tree-shaking）ため、
// 本番ビルドの挙動には一切影響しない。E2Eテスト（npx vite --port経由のdevサーバー）
// からのみ`window.__test_stageStartDelayMs`経由で有効化できる（10巡目、/code-review指摘）
async function testOnlyStageStartDelay(): Promise<void> {
  if (!import.meta.env.DEV) return;
  const ms = window.__test_stageStartDelayMs;
  if (!ms) return;
  // 1回使ったら消費する（後続のrunStageStart()呼び出し——特に、この待機中に
  // 割り込んで最終的に表示される側のセッション——まで毎回追加で遅延させたくない。
  // このフラグは「最初の試行を足止めして割り込みの余地を作る」ためだけのもの）
  window.__test_stageStartDelayMs = undefined;
  await sleep(ms);
}

// --- Resize Canvas ---

export function resizeCanvas(): void {
  const app = document.getElementById("app")!;
  const maxW = app.clientWidth - 16;
  const maxH = app.clientHeight - 140;

  G.cellSize = Math.min(Math.floor(maxW / G.cols), Math.floor(maxH / G.rows));
  G.cellSize = Math.max(G.cellSize, 28);

  G.boardPixelW = G.cols * G.cellSize;
  G.boardPixelH = G.rows * G.cellSize;

  const dpr = window.devicePixelRatio || 1;
  G.canvas!.width = G.boardPixelW * dpr;
  G.canvas!.height = G.boardPixelH * dpr;
  G.canvas!.style.width = G.boardPixelW + "px";
  G.canvas!.style.height = G.boardPixelH + "px";
  G.ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
  buildPieceCache();
  initBgStars();
}

// --- Debug Spawn Indicator ---

const SPAWN_LABELS: Record<string, string> = {
  line_h: "← → 横ライン",
  line_v: "↑ ↓ 縦ライン",
  bomb: "◎ ボム",
  rainbow: "✦ レインボー",
  diagonal: "╲╱ ナナメ",
  countdown: "⏱️ カウントダウン",
};

function updateSpawnIndicator(): void {
  const el = document.getElementById("spawn-indicator")!;
  if (G.debugSpawnType && SPAWN_LABELS[G.debugSpawnType]) {
    el.textContent = `スポナーON: ${SPAWN_LABELS[G.debugSpawnType]}（盤面タップで設置）`;
    el.classList.remove("hidden");
  } else {
    el.classList.add("hidden");
  }
}

// --- initUI: All Event Listener Setup ---

export function initUI(): void {
  // --- Screens DOM cache ---
  G.screens = {
    splash: document.getElementById("screen-splash")!,
    title: document.getElementById("screen-title")!,
    options: document.getElementById("screen-options")!,
    stageSelect: document.getElementById("screen-stage-select")!,
    help: document.getElementById("screen-help")!,
    game: document.getElementById("screen-game")!,
    result: document.getElementById("screen-result")!,
  };

  // --- Support ID (お問い合わせ・データ復旧時にユーザーが申告するための匿名ID表示) ---
  refreshSupportId();

  // --- Sound Toggle ---
  document.getElementById("btn-sound-toggle")!.addEventListener("click", () => {
    G.soundEnabled = !G.soundEnabled;
    document.getElementById("btn-sound-toggle")!.textContent = G.soundEnabled ? "🔊" : "🔇";
    if (!G.soundEnabled) {
      stopAllBgm();
    } else if (G.bgmInitialized) {
      const activeScreen = (Object.keys(G.screens!) as ScreenName[]).find(k => G.screens![k].classList.contains("active"));
      if (activeScreen === "title" || activeScreen === "help") switchBgm("title");
      else if (activeScreen === "stageSelect") switchBgm("select");
      else if (activeScreen === "game") switchBgm("ingame");
    }
  });

  // --- Start / Stage Select ---
  document.getElementById("btn-start")!.addEventListener("click", async () => {
    initAudio();
    const next = Math.min(lastClearedRealStageIdx() + 1, G.STAGES!.length - 1);
    const gate = getGateFor(next);
    if (gate && getTotalStars() < gate.stars) {
      showGateBlockMessage(gate);
      return;
    }
    if (!isStageUnlocked(next)) {
      buildStageSelect();
      showScreen("stageSelect");
      return;
    }
    await startStage(next);
  });

  document.getElementById("btn-stage-select")!.addEventListener("click", () => {
    initAudio();
    buildStageSelect();
    showScreen("stageSelect");
  });

  document.getElementById("btn-back-title")!.addEventListener("click", () => {
    showScreen("title");
  });

  // --- Help ---
  document.getElementById("btn-help")!.addEventListener("click", () => {
    showScreen("help");
    renderHelpPieceIcons();
  });

  document.getElementById("btn-back-help")!.addEventListener("click", () => {
    showScreen("title");
  });

  // --- Backup / Restore ---
  document.getElementById("btn-backup")!.addEventListener("click", () => {
    const json = JSON.stringify(G.saveData, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    a.href = url;
    a.download = `7metch_backup_${date}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById("btn-restore")!.addEventListener("click", () => {
    G.restoreData = null;
    (document.getElementById("restore-file") as HTMLInputElement).value = "";
    document.getElementById("restore-file-name")!.textContent = "";
    (document.getElementById("btn-restore-exec") as HTMLButtonElement).disabled = true;
    document.getElementById("restore-modal")!.classList.remove("hidden");
  });

  document.getElementById("restore-file")!.addEventListener("change", (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    document.getElementById("restore-file-name")!.textContent = file.name;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string) as SaveData;
        if (!parsed.cleared || !parsed.bestStars) throw new Error();
        G.restoreData = parsed;
        (document.getElementById("btn-restore-exec") as HTMLButtonElement).disabled = false;
      } catch {
        G.restoreData = null;
        (document.getElementById("btn-restore-exec") as HTMLButtonElement).disabled = true;
        alert("このファイルはバックアップデータではありません。");
      }
    };
    reader.readAsText(file);
  });

  document.getElementById("btn-restore-cancel")!.addEventListener("click", () => {
    document.getElementById("restore-modal")!.classList.add("hidden");
  });

  document.getElementById("btn-restore-exec")!.addEventListener("click", () => {
    if (!G.restoreData) return;
    if (G.restoreData.coins === undefined) {
      G.restoreData.coins = 0;
      for (const stars of Object.values(G.restoreData.bestStars)) {
        G.restoreData.coins += stars * 3;
      }
      for (const gate of STAR_GATES) {
        if (G.restoreData.cleared[gate.stage]) {
          G.restoreData.coins += 5;
        }
      }
    }
    G.saveData = G.restoreData;
    writeSave();
    document.getElementById("restore-modal")!.classList.add("hidden");
    alert("データを復元しました！");
  });

  // --- Feedback ---
  document.getElementById("btn-feedback")!.addEventListener("click", () => {
    if (FEEDBACK_URL) {
      window.open(FEEDBACK_URL, "_blank");
    }
  });

  // --- Options Screen ---
  document.getElementById("btn-options")!.addEventListener("click", () => {
    initAudio();
    G.optionsReturnScreen = "title";
    syncOptionsUI();
    showScreen("options");
  });

  document.getElementById("btn-game-options")!.addEventListener("click", () => {
    G.optionsReturnScreen = "game";
    syncOptionsUI();
    showScreen("options");
  });

  document.getElementById("btn-options-back")!.addEventListener("click", () => {
    showScreen(G.optionsReturnScreen);
  });

  // --- Options Controls ---
  document.getElementById("opt-bgm-vol")!.addEventListener("input", (e: Event) => {
    G.options.bgmVol = Number((e.target as HTMLInputElement).value);
    document.getElementById("opt-bgm-val")!.textContent = String(G.options.bgmVol);
    applyAudioOptions();
    saveOptions();
  });

  document.getElementById("opt-sfx-vol")!.addEventListener("input", (e: Event) => {
    G.options.sfxVol = Number((e.target as HTMLInputElement).value);
    document.getElementById("opt-sfx-val")!.textContent = String(G.options.sfxVol);
    applyAudioOptions();
    saveOptions();
  });

  document.getElementById("opt-saturation")!.addEventListener("input", (e: Event) => {
    G.options.saturation = Number((e.target as HTMLInputElement).value);
    document.getElementById("opt-sat-val")!.textContent = String(G.options.saturation);
    applyVisualOptions();
    saveOptions();
  });

  document.getElementById("opt-brightness")!.addEventListener("input", (e: Event) => {
    G.options.brightness = Number((e.target as HTMLInputElement).value);
    document.getElementById("opt-brt-val")!.textContent = String(G.options.brightness);
    applyVisualOptions();
    saveOptions();
  });

  document.getElementById("opt-bg-anim")!.addEventListener("change", (e: Event) => {
    G.options.bgAnim = (e.target as HTMLInputElement).checked;
    saveOptions();
  });

  document.getElementById("opt-screen-shake")!.addEventListener("change", (e: Event) => {
    G.options.screenShake = (e.target as HTMLInputElement).checked;
    saveOptions();
  });

  document.getElementById("btn-options-reset")!.addEventListener("click", () => {
    G.options = { ...DEFAULT_OPTIONS };
    saveOptions();
    syncOptionsUI();
    applyAudioOptions();
    applyVisualOptions();
  });

  // --- Game Buttons (Retry, Quit, Next, Result) ---
  document.getElementById("btn-retry")!.addEventListener("click", async () => {
    const ok = await showGameModal("リトライしますか？");
    if (!ok) return;
    track("stage_retry", { stage: stageConfigAt(G.currentStage).name });
    await startStage(G.currentStage);
  });

  document.getElementById("btn-quit")!.addEventListener("click", async () => {
    const ok = await showGameModal("タイトルに戻りますか？");
    if (!ok) return;
    showScreen("title");
  });

  document.getElementById("btn-next")!.addEventListener("click", async () => {
    const next = G.currentStage + 1;
    if (next >= nextStageBoundary()) {
      buildStageSelect();
      showScreen("stageSelect");
      return;
    }
    // プレビュー範囲(next >= G.STAGES!.length)ではゲート/アンロック判定を行わない。
    // プレビュー面のクリアはcleared/bestStarsへ永続保存しないため(前回の修正)、
    // isStageUnlocked()がclearedを前提とする通常判定をそのまま適用すると常にfalseに
    // なり、Nextでの連続進行が止まってしまう(Codexレビュー指摘)
    if (isRealCampaignStage(next)) {
      const gate = getGateFor(next);
      if (gate && getTotalStars() < gate.stars) {
        showGateBlockMessage(gate);
        return;
      }
      if (!isStageUnlocked(next)) {
        buildStageSelect();
        showScreen("stageSelect");
        return;
      }
    }
    await startStage(next);
  });

  document.getElementById("btn-result-retry")!.addEventListener("click", async () => {
    track("stage_retry", { stage: stageConfigAt(G.currentStage).name });
    await startStage(G.currentStage);
  });

  document.getElementById("btn-result-stages")!.addEventListener("click", () => {
    buildStageSelect();
    showScreen("stageSelect");
  });

  // --- Resize ---
  window.addEventListener("resize", () => {
    if (G.screens!.game.classList.contains("active")) {
      resizeCanvas();
      drawBoard();
    }
  });

  // --- Debug Mode ---
  document.getElementById("version-info")!.addEventListener("click", () => {
    G.debugTapCount++;
    clearTimeout(G.debugTapTimer!);
    G.debugTapTimer = setTimeout(() => { G.debugTapCount = 0; }, 1500);
    if (G.debugTapCount >= 7) {
      G.debugTapCount = 0;
      G.debugMode = true;
      document.getElementById("debug-badge")!.classList.remove("hidden");
      document.getElementById("debug-panel")!.classList.remove("hidden");
      document.getElementById("btn-debug-open")!.classList.remove("hidden");
      updateItemBar();
    }
  });

  document.getElementById("btn-debug-jump")!.addEventListener("click", async () => {
    const num = parseInt((document.getElementById("debug-stage-num") as HTMLInputElement).value, 10);
    // 第1章「軌道系」パイロット(Stage 501〜524)のデバッグプレビュー。buildStages()
    // (Stage 1〜500)にはまだ追加されていないため、デバッグジャンプでのみ遅延生成する。
    // G.STAGES自体には追記しない(G.debugPreviewStagesへ分離、初回のみ生成。生成後は
    // num<=totalReachableStageCount()となり再実行されない)。Stage 501〜524が正式に
    // buildStages()へ追加されたらこの分岐は自然に使われなくなる
    if (shouldGeneratePreviewStages(num, G.STAGES!.length, !!G.debugPreviewStages)) {
      G.debugPreviewStages = buildOrbitPilotStages();
    }
    if (num >= 1 && num <= totalReachableStageCount()) {
      document.getElementById("debug-panel")!.classList.add("hidden");
      await startStage(num - 1);
    }
  });

  document.getElementById("btn-debug-unlock-all")!.addEventListener("click", () => {
    // プレビュー範囲(G.STAGES!.length以上)は永続保存しない(checkWinLose()と同じ理由、
    // Codexレビュー指摘)。デバッグジャンプ自体がisStageUnlocked()判定を経由せず
    // 直接ステージへ飛ぶため、そもそも「全解放」がプレビュー面のアクセスに必要ない
    for (let i = 0; i < G.STAGES!.length; i++) {
      G.saveData.cleared[i] = true;
      if (!G.saveData.bestStars[i]) G.saveData.bestStars[i] = 1;
    }
    writeSave();
    alert("全ステージを解放しました");
  });

  document.getElementById("btn-debug-reset")!.addEventListener("click", async () => {
    const ok = await showGameModal("セーブデータをリセットしますか？", "リセット", "キャンセル");
    if (ok) {
      G.saveData = { cleared: {}, bestStars: {}, coins: 0 };
      writeSave();
      const toast = document.getElementById("gate-toast")!;
      toast.textContent = "リセットしました";
      toast.classList.remove("hidden");
      setTimeout(() => { toast.classList.add("hidden"); }, 2000);
    }
  });

  document.getElementById("btn-debug-close")!.addEventListener("click", () => {
    document.getElementById("debug-panel")!.classList.add("hidden");
  });

  // --- Item Buttons ---
  document.querySelectorAll<HTMLButtonElement>(".item-btn").forEach((btn: HTMLButtonElement) => {
    btn.addEventListener("click", () => {
      if (G.animating || !G.screens!.game.classList.contains("active")) return;
      const item = btn.dataset.item!;
      const cost = ITEM_COSTS[item];
      if (!G.debugMode && (G.saveData.coins || 0) < cost) return;

      if (item !== "pinpoint" && G.itemMode === "pinpoint") {
        cancelItemMode();
      }

      switch (item) {
        case "pinpoint":
          if (G.itemMode === "pinpoint") {
            cancelItemMode();
          } else {
            G.itemMode = "pinpoint";
            G.canvas!.classList.add("item-targeting");
          }
          break;
        case "shuffle":
          useShuffle();
          break;
        case "addmoves":
          useAddMoves();
          break;
        case "colorbomb":
          showColorPicker();
          break;
      }
    });
  });

  document.getElementById("btn-color-cancel")!.addEventListener("click", () => {
    document.getElementById("color-picker-modal")!.classList.add("hidden");
  });

  document.getElementById("btn-rescue")!.addEventListener("click", async () => {
    if (G.animating) return;
    if (!G.debugMode && (G.saveData.coins || 0) < ITEM_COSTS.addmoves) return;
    if (!G.debugMode) { G.saveData.coins -= ITEM_COSTS.addmoves; writeSave(); SFX.coinSpend(); }
    G.movesLeft += 3;
    updateItemBar();
    showScreen("game");
    track("item_rescue", { stage: stageConfigAt(G.currentStage).name, coins_remaining: G.saveData.coins });
    // 手数切れの失敗時はfinishTurn()の詰み回復チェックを経由せずに終了するため、
    // オービットステージで詰み盤面のままレスキュー(手数+3)された場合、そのままでは
    // 操作可能な手が無いまま復帰してしまう。finishTurn()を呼び直しHUD更新・勝敗再判定・
    // 詰み回復を行う(/code-review指摘、2026-08-12。PR #353)。
    // finishTurn()は詰み回復時にawait sleep()を挟む非同期処理になりうるため、他の
    // 呼び出し箇所(doMove/useShuffle等)と同様にG.animatingで待機中の多重操作を防ぐ
    // （/code-review指摘、2026-08-12。PR #353フォローアップ）
    G.animating = true;
    try {
      await finishTurn();
    } finally {
      G.animating = false;
      startHintTimer();
    }
  });

  // --- Special Piece Spawner (Debug) ---
  document.querySelectorAll<HTMLButtonElement>(".btn-spawn").forEach((btn: HTMLButtonElement) => {
    btn.addEventListener("click", () => {
      const type = btn.dataset.spawn!;
      document.querySelectorAll<HTMLButtonElement>(".btn-spawn").forEach((b: HTMLButtonElement) => b.classList.remove("active"));
      if (type === "off" || G.debugSpawnType === type) {
        G.debugSpawnType = null;
      } else {
        G.debugSpawnType = type;
        btn.classList.add("active");
      }
      document.getElementById("debug-panel")!.classList.add("hidden");
      updateSpawnIndicator();
    });
  });

  document.getElementById("btn-debug-open")!.addEventListener("click", () => {
    document.getElementById("debug-panel")!.classList.remove("hidden");
  });

  // --- Visibility Change (Audio suspend/resume) ---
  document.addEventListener("visibilitychange", () => {
    if (!G.audioCtx || !G.bgmInitialized) return;
    if (document.hidden) {
      G.audioCtx.suspend();
    } else {
      if (G.soundEnabled) G.audioCtx.resume();
    }
  });

  // --- Splash Screen ---
  const splashHandler = (): void => {
    initAudio();
    showScreen("title");
  };
  document.getElementById("screen-splash")!.addEventListener("click", splashHandler);
  document.addEventListener("keydown", function onSplashKey(e: KeyboardEvent) {
    if ((e.key === "Enter" || e.key === " ") && G.screens!.splash.classList.contains("active")) {
      e.preventDefault();
      document.removeEventListener("keydown", onSplashKey);
      splashHandler();
    }
  });

  // --- Canvas Input ---
  initInput();

  // --- Initial screen ---
  showScreen("splash");
}
