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

// ステージ開始直後の詰み回復チェック(下記)が非同期のため、この関数は完了まで
// 最低でも1マイクロタスク、詰み回復が実際に走る場合は300ms以上かかる。その間に
// ステージ選択・つづきから・リトライ等から2重にstartStage()が呼ばれると、
// G.currentStage/G.board/G.rows/G.cols/G.animatingを2つの呼び出しが同時に
// 書き換えてしまう(/code-review指摘)。再入ガードには専用の`G.stageStarting`を使う
// （`G.animating`ではない）——直前の手のマッチ演出がまだ解決中の間にリトライ・
// やめる等を押した場合、`G.animating`をそのままstartStage()の再入ガードに流用すると
// 演出とは無関係のこの呼び出しまで黙って無視されてしまう回帰があった
// (5巡目の/code-reviewで独立に2箇所から指摘)。`G.animating`自体はこの関数の
// 実行中も引き続きtrueにする（詰み回復中の入力を防ぐ、既存の用途のまま）
// (状態リセット・盤面生成・詰み回復・画面表示のすべてをガード区間に含める)。
// G.currentStageの代入もこのガードの内側で行う——呼び出し元(ui.ts内の各イベント
// リスナー)がガードより前に`G.currentStage = index`していると、再入で拒否された
// 側の代入だけが素通りして「実際に開始したステージ」と食い違ってしまうため
// (2回目の/code-review指摘)
export async function startStage(index: number): Promise<void> {
  if (G.stageStarting) return;
  G.stageStarting = true;
  // navigationEpochのスナップショットは、これから始まる全ての待機区間
  // （下のG.animating待機・ensurePlayableBoard()の詰み回復待機）より前に取る。
  // G.animating待機ループの後で取ると、その待機中に「やめる」等でナビゲーションが
  // 起きた場合、遷移後の値をスナップショットしてしまい後続の比較で検知できず、
  // ゲーム画面へ引き戻されてしまう(/code-review指摘)
  const epochBeforeWait = getNavigationEpoch();
  // stageStartingは自分自身の再入だけを防ぐため、既に実行中の他の操作
  // （doMove/activateByTap/useShuffle/usePinpoint/useColorBomb、いずれも
  // G.animatingを共有ミューテックスとして使う）はここでは止まらず、そのまま
  // 完走しようとする。ここで待たずに盤面を再初期化すると、例えばシャッフル演出中の
  // await sleep(300)明けにその古い呼び出しがresolveBoard()/finishTurn()を
  // 新しいステージの盤面へ実行してしまう(/code-review指摘)。G.animatingが falseに
  // 戻る（＝進行中の操作がfinallyまで完走する）のを待ってから自分の初期化を始める
  while (G.animating) { await sleep(16); }
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

    // 上の待機中に「もどる」「やめる」等でプレイヤーが別画面へ既に遷移していた場合、
    // ここでshowScreen("game")を呼ぶとその操作を上書きしてしまう(/code-review指摘)。
    // navigationEpochが変化していれば競合するナビゲーションが起きたとみなし、
    // 画面遷移・HUD更新・チュートリアル表示をスキップする(G.animating/G.stageStarting
    // の解除自体はfinally側で必ず行われるので、次のステージ開始操作はブロックされない)
    if (getNavigationEpoch() !== epochBeforeWait) return;

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
    G.stageStarting = false;
    G.animating = false;
    startHintTimer();
  }
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
