import { G, PIECE_COLORS, STAR_GATES, DEFAULT_OPTIONS, ITEM_COSTS, loadOptions, saveOptions, applyVisualOptions, loadSave, writeSave } from "./state.js";
import { initAudio, switchBgm, stopAllBgm, applyAudioOptions, SFX } from "./audio.js";
import { buildPieceCache, startBgAnim, stopBgAnim, initBgStars, startTitleBgAnim, stopTitleBgAnim, startResultBgAnim, stopResultBgAnim, startSplashBgAnim, stopSplashBgAnim, drawBoard } from "./rendering.js";
import { updateItemBar, cancelItemMode, updateHUD, doMove, useShuffle, useAddMoves, showColorPicker } from "./game.js";
import { createBoard, initCellState, countAvailableMoves, startHintTimer, clearHint } from "./board.js";
import { buildStages, getTotalStars, isStageUnlocked, getGateFor, boardSizeForStage, getMissionText } from "./stages.js";
import { track, FEEDBACK_URL } from "./tracking.js";
import { initInput, renderHelpPieceIcons } from "./input.js";

// --- Screens ---

export function showScreen(name) {
  const fromGame = name === "options" && G.optionsReturnScreen === "game";
  if (name !== "game" && !fromGame) { clearHint(); stopBgAnim(); }
  if (name !== "title" && name !== "splash") stopTitleBgAnim();
  if (name === "splash") stopSplashBgAnim();
  if (name !== "result") stopResultBgAnim();
  Object.values(G.screens).forEach((s) => s.classList.remove("active"));
  G.screens[name].classList.add("active");
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

export function syncOptionsUI() {
  document.getElementById("opt-bgm-vol").value = G.options.bgmVol;
  document.getElementById("opt-bgm-val").textContent = G.options.bgmVol;
  document.getElementById("opt-sfx-vol").value = G.options.sfxVol;
  document.getElementById("opt-sfx-val").textContent = G.options.sfxVol;
  document.getElementById("opt-saturation").value = G.options.saturation;
  document.getElementById("opt-sat-val").textContent = G.options.saturation;
  document.getElementById("opt-brightness").value = G.options.brightness;
  document.getElementById("opt-brt-val").textContent = G.options.brightness;
  document.getElementById("opt-bg-anim").checked = G.options.bgAnim;
  document.getElementById("opt-screen-shake").checked = G.options.screenShake;
}

// --- Game Modal ---

export function showGameModal(text, confirmLabel, cancelLabel) {
  return new Promise((resolve) => {
    const overlay = document.getElementById("game-modal-overlay");
    const textEl = document.getElementById("game-modal-text");
    const buttonsEl = document.getElementById("game-modal-buttons");
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

export function showGateBlockMessage(gate) {
  const total = getTotalStars();
  const need = gate.stars - total;
  const toast = document.getElementById("gate-toast");
  toast.textContent = `★ あと${need}個で次のエリア解放！`;
  toast.classList.remove("hidden");
  setTimeout(() => { toast.classList.add("hidden"); }, 2500);
  buildStageSelect();
  showScreen("stageSelect");
}

// --- Stage Select ---

export function buildStageSelect() {
  const grid = document.getElementById("stage-grid");
  grid.innerHTML = "";
  const total = getTotalStars();

  document.getElementById("total-stars-display").innerHTML = `★ ${total}　<span style="color:#4ecdc4"><span class="coin-icon"></span> ${G.saveData.coins || 0}</span>`;

  const lastClearedIdx = Object.keys(G.saveData.cleared)
    .map(Number)
    .reduce((max, n) => Math.max(max, n), -1);
  const visibleUpTo = lastClearedIdx + 6;

  let stopped = false;

  for (let i = 0; i < G.STAGES.length; i++) {
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

    const stg = G.STAGES[i];
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
      btn.addEventListener("click", () => {
        G.currentStage = i;
        startStage(i);
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

export function startStage(index) {
  const stg = G.STAGES[index];
  G.cols = stg.boardCols;
  G.rows = stg.boardRows;
  G.movesLeft = stg.moves;
  G.score = 0;
  G.totalCleared = 0;
  G.colorCleared = [];
  G.chainCount = 0;
  G.specialsCreated = 0;
  G.maxChain = 0;
  G.selected = null;
  G.animating = false;
  G.vfxParticles = []; G.vfxShockwaves = []; G.vfxFlashes = []; G.vfxComets = []; G.vfxTexts = []; G.shakeX = G.shakeY = G.shakeIntensity = 0;
  G.itemMode = null;
  G.coinsEarned = 0;
  G.canvas.classList.remove("item-targeting");

  resizeCanvas();
  applyVisualOptions();
  initCellState(stg);
  createBoard(stg.colors);
  updateHUD();
  updateItemBar();
  drawBoard();
  showScreen("game");
  track("stage_start", { stage: stg.name, mission_type: stg.mission.type });
  startHintTimer();
}

// --- Resize Canvas ---

export function resizeCanvas() {
  const app = document.getElementById("app");
  const maxW = app.clientWidth - 16;
  const maxH = app.clientHeight - 140;

  G.cellSize = Math.min(Math.floor(maxW / G.cols), Math.floor(maxH / G.rows));
  G.cellSize = Math.max(G.cellSize, 28);

  G.boardPixelW = G.cols * G.cellSize;
  G.boardPixelH = G.rows * G.cellSize;

  const dpr = window.devicePixelRatio || 1;
  G.canvas.width = G.boardPixelW * dpr;
  G.canvas.height = G.boardPixelH * dpr;
  G.canvas.style.width = G.boardPixelW + "px";
  G.canvas.style.height = G.boardPixelH + "px";
  G.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  buildPieceCache();
  initBgStars();
}

// --- Debug Spawn Indicator ---

const SPAWN_LABELS = {
  line_h: "← → 横ライン",
  line_v: "↑ ↓ 縦ライン",
  bomb: "◎ ボム",
  rainbow: "✦ レインボー",
  diagonal: "╲╱ ナナメ",
  countdown: "⏱️ カウントダウン",
};

function updateSpawnIndicator() {
  const el = document.getElementById("spawn-indicator");
  if (G.debugSpawnType && SPAWN_LABELS[G.debugSpawnType]) {
    el.textContent = `スポナーON: ${SPAWN_LABELS[G.debugSpawnType]}（盤面タップで設置）`;
    el.classList.remove("hidden");
  } else {
    el.classList.add("hidden");
  }
}

// --- initUI: All Event Listener Setup ---

export function initUI() {
  // --- Screens DOM cache ---
  G.screens = {
    splash: document.getElementById("screen-splash"),
    title: document.getElementById("screen-title"),
    options: document.getElementById("screen-options"),
    stageSelect: document.getElementById("screen-stage-select"),
    help: document.getElementById("screen-help"),
    game: document.getElementById("screen-game"),
    result: document.getElementById("screen-result"),
  };

  // --- Sound Toggle ---
  document.getElementById("btn-sound-toggle").addEventListener("click", () => {
    G.soundEnabled = !G.soundEnabled;
    document.getElementById("btn-sound-toggle").textContent = G.soundEnabled ? "🔊" : "🔇";
    if (!G.soundEnabled) {
      stopAllBgm();
    } else if (G.bgmInitialized) {
      const activeScreen = Object.keys(G.screens).find(k => G.screens[k].classList.contains("active"));
      if (activeScreen === "title" || activeScreen === "help") switchBgm("title");
      else if (activeScreen === "stageSelect") switchBgm("select");
      else if (activeScreen === "game") switchBgm("ingame");
    }
  });

  // --- Start / Stage Select ---
  document.getElementById("btn-start").addEventListener("click", () => {
    initAudio();
    const lastCleared = Object.keys(G.saveData.cleared)
      .map(Number)
      .sort((a, b) => a - b);
    let next = lastCleared.length > 0 ? Math.min(lastCleared[lastCleared.length - 1] + 1, G.STAGES.length - 1) : 0;
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
    G.currentStage = next;
    startStage(G.currentStage);
  });

  document.getElementById("btn-stage-select").addEventListener("click", () => {
    initAudio();
    buildStageSelect();
    showScreen("stageSelect");
  });

  document.getElementById("btn-back-title").addEventListener("click", () => {
    showScreen("title");
  });

  // --- Help ---
  document.getElementById("btn-help").addEventListener("click", () => {
    showScreen("help");
    renderHelpPieceIcons();
  });

  document.getElementById("btn-back-help").addEventListener("click", () => {
    showScreen("title");
  });

  // --- Backup / Restore ---
  document.getElementById("btn-backup").addEventListener("click", () => {
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

  document.getElementById("btn-restore").addEventListener("click", () => {
    G.restoreData = null;
    document.getElementById("restore-file").value = "";
    document.getElementById("restore-file-name").textContent = "";
    document.getElementById("btn-restore-exec").disabled = true;
    document.getElementById("restore-modal").classList.remove("hidden");
  });

  document.getElementById("restore-file").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    document.getElementById("restore-file-name").textContent = file.name;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed.cleared || !parsed.bestStars) throw new Error();
        G.restoreData = parsed;
        document.getElementById("btn-restore-exec").disabled = false;
      } catch {
        G.restoreData = null;
        document.getElementById("btn-restore-exec").disabled = true;
        alert("このファイルはバックアップデータではありません。");
      }
    };
    reader.readAsText(file);
  });

  document.getElementById("btn-restore-cancel").addEventListener("click", () => {
    document.getElementById("restore-modal").classList.add("hidden");
  });

  document.getElementById("btn-restore-exec").addEventListener("click", () => {
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
    document.getElementById("restore-modal").classList.add("hidden");
    alert("データを復元しました！");
  });

  // --- Feedback ---
  document.getElementById("btn-feedback").addEventListener("click", () => {
    if (FEEDBACK_URL) {
      window.open(FEEDBACK_URL, "_blank");
    }
  });

  // --- Options Screen ---
  document.getElementById("btn-options").addEventListener("click", () => {
    initAudio();
    G.optionsReturnScreen = "title";
    syncOptionsUI();
    showScreen("options");
  });

  document.getElementById("btn-game-options").addEventListener("click", () => {
    G.optionsReturnScreen = "game";
    syncOptionsUI();
    showScreen("options");
  });

  document.getElementById("btn-options-back").addEventListener("click", () => {
    showScreen(G.optionsReturnScreen);
  });

  // --- Options Controls ---
  document.getElementById("opt-bgm-vol").addEventListener("input", (e) => {
    G.options.bgmVol = Number(e.target.value);
    document.getElementById("opt-bgm-val").textContent = G.options.bgmVol;
    applyAudioOptions();
    saveOptions();
  });

  document.getElementById("opt-sfx-vol").addEventListener("input", (e) => {
    G.options.sfxVol = Number(e.target.value);
    document.getElementById("opt-sfx-val").textContent = G.options.sfxVol;
    applyAudioOptions();
    saveOptions();
  });

  document.getElementById("opt-saturation").addEventListener("input", (e) => {
    G.options.saturation = Number(e.target.value);
    document.getElementById("opt-sat-val").textContent = G.options.saturation;
    applyVisualOptions();
    saveOptions();
  });

  document.getElementById("opt-brightness").addEventListener("input", (e) => {
    G.options.brightness = Number(e.target.value);
    document.getElementById("opt-brt-val").textContent = G.options.brightness;
    applyVisualOptions();
    saveOptions();
  });

  document.getElementById("opt-bg-anim").addEventListener("change", (e) => {
    G.options.bgAnim = e.target.checked;
    saveOptions();
  });

  document.getElementById("opt-screen-shake").addEventListener("change", (e) => {
    G.options.screenShake = e.target.checked;
    saveOptions();
  });

  document.getElementById("btn-options-reset").addEventListener("click", () => {
    G.options = { ...DEFAULT_OPTIONS };
    saveOptions();
    syncOptionsUI();
    applyAudioOptions();
    applyVisualOptions();
  });

  // --- Game Buttons (Retry, Quit, Next, Result) ---
  document.getElementById("btn-retry").addEventListener("click", async () => {
    const ok = await showGameModal("リトライしますか？");
    if (!ok) return;
    track("stage_retry", { stage: G.STAGES[G.currentStage].name });
    startStage(G.currentStage);
  });

  document.getElementById("btn-quit").addEventListener("click", async () => {
    const ok = await showGameModal("タイトルに戻りますか？");
    if (!ok) return;
    showScreen("title");
  });

  document.getElementById("btn-next").addEventListener("click", () => {
    const next = G.currentStage + 1;
    if (next >= G.STAGES.length) {
      buildStageSelect();
      showScreen("stageSelect");
      return;
    }
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
    G.currentStage = next;
    startStage(G.currentStage);
  });

  document.getElementById("btn-result-retry").addEventListener("click", () => {
    track("stage_retry", { stage: G.STAGES[G.currentStage].name });
    startStage(G.currentStage);
  });

  document.getElementById("btn-result-stages").addEventListener("click", () => {
    buildStageSelect();
    showScreen("stageSelect");
  });

  // --- Resize ---
  window.addEventListener("resize", () => {
    if (G.screens.game.classList.contains("active")) {
      resizeCanvas();
      drawBoard();
    }
  });

  // --- Debug Mode ---
  document.getElementById("version-info").addEventListener("click", () => {
    G.debugTapCount++;
    clearTimeout(G.debugTapTimer);
    G.debugTapTimer = setTimeout(() => { G.debugTapCount = 0; }, 1500);
    if (G.debugTapCount >= 7) {
      G.debugTapCount = 0;
      G.debugMode = true;
      document.getElementById("debug-badge").classList.remove("hidden");
      document.getElementById("debug-panel").classList.remove("hidden");
      document.getElementById("btn-debug-open").classList.remove("hidden");
      updateItemBar();
    }
  });

  document.getElementById("btn-debug-jump").addEventListener("click", () => {
    const num = parseInt(document.getElementById("debug-stage-num").value, 10);
    if (num >= 1 && num <= G.STAGES.length) {
      G.currentStage = num - 1;
      document.getElementById("debug-panel").classList.add("hidden");
      startStage(G.currentStage);
    }
  });

  document.getElementById("btn-debug-unlock-all").addEventListener("click", () => {
    for (let i = 0; i < G.STAGES.length; i++) {
      G.saveData.cleared[i] = true;
      if (!G.saveData.bestStars[i]) G.saveData.bestStars[i] = 1;
    }
    writeSave();
    alert("全ステージを解放しました");
  });

  document.getElementById("btn-debug-reset").addEventListener("click", async () => {
    const ok = await showGameModal("セーブデータをリセットしますか？", "リセット", "キャンセル");
    if (ok) {
      G.saveData = { cleared: {}, bestStars: {}, coins: 0 };
      writeSave();
      const toast = document.getElementById("gate-toast");
      toast.textContent = "リセットしました";
      toast.classList.remove("hidden");
      setTimeout(() => { toast.classList.add("hidden"); }, 2000);
    }
  });

  document.getElementById("btn-debug-close").addEventListener("click", () => {
    document.getElementById("debug-panel").classList.add("hidden");
  });

  // --- Item Buttons ---
  document.querySelectorAll(".item-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      if (G.animating || !G.screens.game.classList.contains("active")) return;
      const item = btn.dataset.item;
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
            G.canvas.classList.add("item-targeting");
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

  document.getElementById("btn-color-cancel").addEventListener("click", () => {
    document.getElementById("color-picker-modal").classList.add("hidden");
  });

  document.getElementById("btn-rescue").addEventListener("click", () => {
    if (!G.debugMode && (G.saveData.coins || 0) < ITEM_COSTS.addmoves) return;
    if (!G.debugMode) { G.saveData.coins -= ITEM_COSTS.addmoves; writeSave(); SFX.coinSpend(); }
    G.movesLeft += 3;
    updateHUD();
    updateItemBar();
    showScreen("game");
    track("item_rescue", { stage: G.STAGES[G.currentStage].name, coins_remaining: G.saveData.coins });
  });

  // --- Special Piece Spawner (Debug) ---
  document.querySelectorAll(".btn-spawn").forEach(btn => {
    btn.addEventListener("click", () => {
      const type = btn.dataset.spawn;
      document.querySelectorAll(".btn-spawn").forEach(b => b.classList.remove("active"));
      if (type === "off" || G.debugSpawnType === type) {
        G.debugSpawnType = null;
      } else {
        G.debugSpawnType = type;
        btn.classList.add("active");
      }
      document.getElementById("debug-panel").classList.add("hidden");
      updateSpawnIndicator();
    });
  });

  document.getElementById("btn-debug-open").addEventListener("click", () => {
    document.getElementById("debug-panel").classList.remove("hidden");
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
  const splashHandler = () => {
    initAudio();
    showScreen("title");
  };
  document.getElementById("screen-splash").addEventListener("click", splashHandler);
  document.addEventListener("keydown", function onSplashKey(e) {
    if ((e.key === "Enter" || e.key === " ") && G.screens.splash.classList.contains("active")) {
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
