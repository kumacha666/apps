(function () {
  "use strict";

  let cols = 7;
  let rows = 8;
  const PIECE_COLORS = ["#e94560", "#4ecdc4", "#ffe66d", "#7b68ee", "#ff8a5c", "#3a86ff", "#ff6bb3", "#88cc44"];
  const PIECE_SHAPES = ["circle", "diamond", "square", "triangle", "star", "hex", "cross", "octagon"];
  const PIECE_NAMES_JA = ["太陽", "月", "火星", "水星", "木星", "金星", "土星", "地球"];
  const PIECE_SYMBOLS = ["●", "◆", "■", "▲", "★", "⬢", "✚", "◉"];
  const MATCH_MIN = 3;

  const ANIM = {
    CLEAR_FRAMES: 14,
    CLEAR_FRAME_MS: 35,
    DROP_SPEED: 0.22,
    DROP_FRAME_MS: 16,
    CHAIN_PAUSE_MS: 180,
    SWAP_FRAMES: 8,
    SWAP_FRAME_MS: 20,
  };

  const STAR_GATES = [
    { stage: 25, stars: 30 },
    { stage: 50, stars: 80 },
    { stage: 75, stars: 140 },
    { stage: 100, stars: 190 },
    { stage: 150, stars: 290 },
    { stage: 200, stars: 390 },
    { stage: 250, stars: 490 },
    { stage: 300, stars: 590 },
    { stage: 350, stars: 690 },
  ];

  const STAGES = buildStages();

  // --- Tracking ---
  const GA_MEASUREMENT_ID = "G-CT956V6Y2V";
  const GAS_ENDPOINT = "https://script.google.com/macros/s/AKfycbw6_EH0cRSKYnKVefYMRUnIZSnCm-Xcz8iPlOed-5zou54a_Yf09FJedIYNtY5qZCyX/exec";
  const FEEDBACK_URL = "https://forms.gle/emCFWfyXtkpmL7zL9";

  function getAnonId() {
    let id = localStorage.getItem("7metch_uid");
    if (!id) {
      id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem("7metch_uid", id);
    }
    return id;
  }

  function trackGA(event, params) {
    if (!GA_MEASUREMENT_ID || typeof gtag !== "function") return;
    gtag("event", event, params);
  }

  function trackGAS(data) {
    if (!GAS_ENDPOINT) return;
    data.user_id = getAnonId();
    fetch(GAS_ENDPOINT, {
      method: "POST",
      body: JSON.stringify(data),
    }).catch(() => {});
  }

  function track(event, params) {
    if (debugMode) return;
    trackGA(event, params || {});
    trackGAS({ event, ...params });
  }

  // --- Sound ---
  let audioCtx = null;
  let soundEnabled = true;

  function initAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
  }

  function playTone(freq, duration, type, vol, delay) {
    if (!soundEnabled || !audioCtx) return;
    const t = audioCtx.currentTime + (delay || 0);
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type || "sine";
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(vol || 0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + duration);
  }

  function playSweep(startFreq, endFreq, duration, type, vol, delay) {
    if (!soundEnabled || !audioCtx) return;
    const t = audioCtx.currentTime + (delay || 0);
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type || "sine";
    osc.frequency.setValueAtTime(startFreq, t);
    osc.frequency.linearRampToValueAtTime(endFreq, t + duration);
    gain.gain.setValueAtTime(vol || 0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + duration);
  }

  function playNoise(duration, vol, filterFreq, filterType, delay) {
    if (!soundEnabled || !audioCtx) return;
    const t = audioCtx.currentTime + (delay || 0);
    const bufSize = Math.ceil(audioCtx.sampleRate * duration);
    const buf = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(vol || 0.05, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    if (filterFreq) {
      const filter = audioCtx.createBiquadFilter();
      filter.type = filterType || "lowpass";
      filter.frequency.setValueAtTime(filterFreq, t);
      src.connect(filter);
      filter.connect(gain);
    } else {
      src.connect(gain);
    }
    gain.connect(audioCtx.destination);
    src.start(t);
    src.stop(t + duration);
  }

  const SFX = {
    swap() {
      playSweep(250, 800, 0.12, "sine", 0.10);
      playSweep(300, 900, 0.10, "triangle", 0.06, 0.02);
      playNoise(0.08, 0.03, 2500, "bandpass", 0.02);
    },
    invalidSwap() {
      playTone(150, 0.12, "square", 0.07);
      playTone(140, 0.12, "square", 0.06, 0.03);
      playTone(130, 0.15, "square", 0.05, 0.08);
    },
    clear(chain) {
      const base = 523 + Math.min(chain - 1, 5) * 80;
      playTone(base, 0.15, "sine", 0.11);
      playTone(base + 3, 0.15, "sine", 0.08);
      playTone(base - 3, 0.15, "sine", 0.08);
      playTone(base * 1.5, 0.05, "sine", 0.06, 0.05);
      playTone(3000 + chain * 200, 0.03, "sine", 0.04, 0.02);
      playTone(3500 + chain * 200, 0.03, "sine", 0.03, 0.05);
      playTone(base * 0.5, 0.08, "sine", 0.04, 0.04);
    },
    bomb() {
      playNoise(0.6, 0.12, 6000, "lowpass");
      playSweep(200, 40, 0.5, "sawtooth", 0.15, 0.02);
      playTone(60, 0.6, "sine", 0.18, 0.05);
      playTone(55, 0.5, "sine", 0.12, 0.08);
      playSweep(80, 30, 0.4, "sawtooth", 0.08, 0.1);
      playTone(200, 0.1, "sine", 0.06, 0.15);
      playTone(150, 0.15, "sine", 0.04, 0.25);
    },
    line() {
      playSweep(1500, 400, 0.2, "sawtooth", 0.08);
      playSweep(500, 1200, 0.2, "sawtooth", 0.07, 0.15);
      playNoise(0.35, 0.05, 2000, "bandpass");
      playTone(300, 0.05, "sine", 0.04, 0.1);
    },
    rainbow() {
      playTone(80, 0.6, "sine", 0.12);
      playSweep(1500, 60, 0.5, "sine", 0.10, 0.05);
      playSweep(1200, 80, 0.4, "triangle", 0.06, 0.08);
      playTone(120, 0.3, "triangle", 0.08, 0.1);
      playNoise(0.4, 0.04, 800, "lowpass", 0.1);
    },
    combo() {
      playSweep(200, 1000, 0.15, "sine", 0.10);
      playSweep(2000, 1000, 0.15, "sawtooth", 0.06);
      playNoise(0.1, 0.06, 3000, "bandpass", 0.12);
      playTone(80, 0.15, "sine", 0.10, 0.12);
      playTone(1200, 0.08, "sine", 0.05, 0.15);
    },
    stageClear() {
      const notes = [523, 659, 784, 1047];
      notes.forEach((f, i) => {
        playTone(f, 0.3, "triangle", 0.10, i * 0.1);
        playTone(f, 0.3, "sine", 0.08, i * 0.1);
        playTone(f * 0.5, 0.25, "sine", 0.04, i * 0.1);
      });
      playTone(1047, 0.5, "sine", 0.06, 0.4);
      playTone(1047, 0.5, "triangle", 0.04, 0.42);
    },
    stageFail() {
      playTone(400, 0.25, "sine", 0.08);
      playTone(350, 0.25, "sine", 0.08, 0.18);
      playTone(280, 0.4, "sine", 0.07, 0.36);
      playTone(280, 0.3, "triangle", 0.04, 0.38);
    },
    drop() {
      playSweep(400, 220, 0.1, "sine", 0.04);
      playTone(220, 0.05, "sine", 0.02, 0.06);
    },
    countdown() {
      playTone(440, 0.08, "square", 0.06);
      playTone(880, 0.06, "square", 0.04);
      playTone(440, 0.08, "square", 0.06, 0.12);
      playTone(880, 0.06, "square", 0.04, 0.12);
    },
    iceCrack() {
      playNoise(0.12, 0.06, 4000, "highpass");
      playTone(3000, 0.04, "triangle", 0.05);
      playTone(2500, 0.03, "triangle", 0.03, 0.03);
      playTone(3500, 0.03, "triangle", 0.03, 0.05);
    },
  };

  const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d");

  let cellSize = 48;
  let boardPixelW, boardPixelH;

  // Offscreen canvas cache for planet pieces
  let pieceCache = {};
  let pieceCacheSize = 0;

  // Deep space background state
  let bgStars = [];
  let bgShootingStar = null;
  let bgAnimId = null;
  let bgGradCache = null;
  let bgGradSize = null;
  let board = [];
  let selected = null;
  let animating = false;
  let currentStage = 0;
  let movesLeft = 0;
  let mission = {};
  let missionProgress = {};
  let saveData = loadSave();
  let itemMode = null;
  let coinsEarned = 0;
  let cellState = [];

  const screens = {
    title: document.getElementById("screen-title"),
    stageSelect: document.getElementById("screen-stage-select"),
    help: document.getElementById("screen-help"),
    game: document.getElementById("screen-game"),
    result: document.getElementById("screen-result"),
  };

  function showScreen(name) {
    if (name !== "game") { clearHint(); stopBgAnim(); }
    Object.values(screens).forEach((s) => s.classList.remove("active"));
    screens[name].classList.add("active");
    if (name === "game") startBgAnim();
  }

  // --- Save / Load ---
  function loadSave() {
    try {
      const d = JSON.parse(localStorage.getItem("7metch_save"));
      if (!d) return { cleared: {}, bestStars: {}, coins: 0 };
      if (d.coins === undefined) {
        d.coins = 0;
        for (const stars of Object.values(d.bestStars)) {
          d.coins += stars * 3;
        }
        for (const gate of STAR_GATES) {
          if (d.cleared[gate.stage]) {
            d.coins += 5;
          }
        }
      }
      return d;
    } catch {
      return { cleared: {}, bestStars: {}, coins: 0 };
    }
  }

  function writeSave() {
    localStorage.setItem("7metch_save", JSON.stringify(saveData));
  }

  function getTotalStars() {
    return Object.values(saveData.bestStars).reduce((sum, s) => sum + s, 0);
  }

  function isStageUnlocked(i) {
    if (i === 0) return true;
    if (!saveData.cleared[i - 1]) return false;
    const gate = STAR_GATES.find((g) => g.stage === i);
    if (gate && getTotalStars() < gate.stars) return false;
    return true;
  }

  function getGateFor(i) {
    return STAR_GATES.find((g) => g.stage === i) || null;
  }

  // --- Stages ---
  function boardSizeForStage(i) {
    if (i < 10) return { cols: 6, rows: 7 };
    if (i < 100) return { cols: 7, rows: 8 };
    if (i < 250) return { cols: 8, rows: 9 };
    return { cols: 9, rows: 10 };
  }

  function generateHolePattern(c, r, variant) {
    const holes = [];
    switch (variant) {
      case 0:
        holes.push([0,0],[0,1],[1,0]);
        holes.push([0,c-1],[0,c-2],[1,c-1]);
        holes.push([r-1,0],[r-1,1],[r-2,0]);
        holes.push([r-1,c-1],[r-1,c-2],[r-2,c-1]);
        break;
      case 1:
        for (let rr = 0; rr < r; rr++) {
          for (let cc = 0; cc < c; cc++) {
            const dr = Math.abs(rr - Math.floor(r/2));
            const dc = Math.abs(cc - Math.floor(c/2));
            if (dr + dc <= 1 && !(dr === 0 && dc === 0)) holes.push([rr, cc]);
          }
        }
        break;
      case 2:
        holes.push([0,0],[0,c-1],[r-1,0],[r-1,c-1]);
        holes.push([0, Math.floor(c/2)]);
        holes.push([r-1, Math.floor(c/2)]);
        break;
      case 3:
        for (let rr = 0; rr < 3; rr++) {
          for (let cc = c-3; cc < c; cc++) {
            if (rr === 0 || cc === c-1) continue;
            holes.push([rr, cc]);
          }
        }
        break;
      case 4:
        holes.push([0,0],[0,c-1],[r-1,0],[r-1,c-1]);
        holes.push([0,Math.floor(c/2)],[r-1,Math.floor(c/2)]);
        holes.push([Math.floor(r/2),0],[Math.floor(r/2),c-1]);
        break;
    }
    return holes;
  }

  function buildStages() {
    const stages = [];
    for (let i = 0; i < 350; i++) {
      const size = boardSizeForStage(i);
      const tier = Math.floor(i / 10);
      const baseMoves = Math.max(12, 20 - tier * 2);
      let moves;
      if (i < 10) moves = 20;
      else if (size.cols >= 9) moves = Math.max(16, baseMoves);
      else if (size.cols >= 8) moves = Math.max(14, baseMoves);
      else moves = baseMoves;

      const baseColors = Math.min(7, 5 + Math.floor(i / 10));
      const colors = (i >= 200) ? 8 : baseColors;
      const star2rate = i < 10 ? 0.65 : 0.6;
      const star3rate = i < 10 ? 0.45 : 0.35;

      const features = {};
      if (i >= 10) features.diagonalLine = true;
      if (i >= 100) features.ice = true;
      if (i >= 150) features.rock = true;
      if (i >= 250) features.holes = true;
      if (i >= 300) features.countdown = true;

      let iceCells = 0, rockCells = 0, holePattern = null, countdownBombs = 0;
      if (features.ice) {
        const progress = Math.min(1, (i - 100) / 100);
        iceCells = 2 + Math.floor(progress * 4);
      }
      if (features.rock) {
        const progress = Math.min(1, (i - 150) / 100);
        rockCells = 1 + Math.floor(progress * 2);
      }
      if (features.holes) {
        holePattern = generateHolePattern(size.cols, size.rows, i % 5);
      }
      if (features.countdown) {
        const progress = Math.min(1, (i - 300) / 50);
        countdownBombs = 1 + Math.floor(progress * 2);
      }

      let mission;
      if (i % 5 === 0 && i > 0) {
        const targetColor = i % colors;
        mission = { type: "color", colorIndex: targetColor, count: Math.floor(moves * Math.min(1.0, 0.5 + i * 0.008)) };
      } else if (i % 3 === 0) {
        mission = { type: "score", target: Math.floor(moves * Math.min(100, 50 + i * 1.0)) };
      } else {
        mission = { type: "clear", count: Math.floor(moves * Math.min(8, 3.0 + i * 0.04)) };
      }

      stages.push({
        name: `${i + 1}`,
        moves,
        colors,
        boardCols: size.cols,
        boardRows: size.rows,
        mission,
        star2moves: Math.floor(moves * star2rate),
        star3moves: Math.floor(moves * star3rate),
        features,
        iceCells,
        rockCells,
        holePattern,
        countdownBombs,
      });
    }
    return stages;
  }

  function getMissionText(m, html) {
    switch (m.type) {
      case "score": return `${m.target}点 とろう`;
      case "clear": return `${m.count}個 けそう`;
      case "color":
        if (html) {
          return `<span style="color:${PIECE_COLORS[m.colorIndex]};font-size:1.4em;vertical-align:-0.1em;text-shadow:0 0 4px ${PIECE_COLORS[m.colorIndex]}80">${PIECE_SYMBOLS[m.colorIndex]}</span>を${m.count}個けそう`;
        }
        return `${PIECE_SYMBOLS[m.colorIndex]}を${m.count}個けそう`;
    }
  }

  // --- Board ---
  function hasSquare() {
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const cells = [[r,c],[r,c+1],[r+1,c],[r+1,c+1]];
        if (cells.some(([cr,cc]) => !board[cr][cc] || isHole(cr,cc) || isRock(cr,cc))) continue;
        const color = board[r][c].color;
        if (cells.every(([cr,cc]) => board[cr][cc].color === color)) return true;
      }
    }
    return false;
  }

  function createBoard(numColors) {
    board = [];
    for (let r = 0; r < rows; r++) {
      board[r] = [];
      for (let c = 0; c < cols; c++) {
        if (isHole(r, c) || isRock(r, c)) {
          board[r][c] = null;
        } else {
          board[r][c] = randomPiece(numColors);
        }
      }
    }
    while (findAllMatches().length > 0 || hasSquare()) {
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (isHole(r, c) || isRock(r, c)) continue;
          board[r][c] = randomPiece(numColors);
        }
      }
    }
    const stg = STAGES[currentStage];
    if (stg.countdownBombs > 0) {
      let placed = 0, attempts = 0;
      while (placed < stg.countdownBombs && attempts < 200) {
        const br = Math.floor(Math.random() * rows);
        const bc = Math.floor(Math.random() * cols);
        if (board[br][bc] && !board[br][bc].special) {
          board[br][bc].special = "countdown";
          board[br][bc].countdown = 8 + Math.floor(Math.random() * 5);
          placed++;
        }
        attempts++;
      }
    }
  }

  function randomPiece(numColors) {
    return { color: Math.floor(Math.random() * numColors), special: null };
  }

  function initCellState(stg) {
    cellState = [];
    for (let r = 0; r < rows; r++) {
      cellState[r] = [];
      for (let c = 0; c < cols; c++) {
        cellState[r][c] = null;
      }
    }
    if (stg.holePattern) {
      for (const [hr, hc] of stg.holePattern) {
        if (hr >= 0 && hr < rows && hc >= 0 && hc < cols) {
          cellState[hr][hc] = "hole";
        }
      }
    }
    if (stg.rockCells > 0) {
      let placed = 0, attempts = 0;
      while (placed < stg.rockCells && attempts < 200) {
        const rr = 1 + Math.floor(Math.random() * (rows - 2));
        const rc = 1 + Math.floor(Math.random() * (cols - 2));
        if (cellState[rr][rc] === null) {
          cellState[rr][rc] = "rock";
          placed++;
        }
        attempts++;
      }
    }
    if (stg.iceCells > 0) {
      let placed = 0, attempts = 0;
      while (placed < stg.iceCells && attempts < 200) {
        const ir = Math.floor(Math.random() * rows);
        const ic = Math.floor(Math.random() * cols);
        if (cellState[ir][ic] === null) {
          cellState[ir][ic] = "ice2";
          placed++;
        }
        attempts++;
      }
    }
  }

  function isHole(r, c) { return cellState[r] && cellState[r][c] === "hole"; }
  function isRock(r, c) { return cellState[r] && cellState[r][c] === "rock"; }
  function isIce(r, c) { return cellState[r] && (cellState[r][c] === "ice1" || cellState[r][c] === "ice2"); }
  function isPlayable(r, c) { return !isHole(r, c) && !isRock(r, c); }

  function damageIce(r, c) {
    if (cellState[r][c] === "ice2") { cellState[r][c] = "ice1"; SFX.iceCrack(); return false; }
    if (cellState[r][c] === "ice1") { cellState[r][c] = null; SFX.iceCrack(); return true; }
    return true;
  }

  function damageAdjacentIce(clearList) {
    const iceSet = new Set();
    for (const [r, c] of clearList) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr, nc = c + dc;
          if (inBounds(nr, nc) && isIce(nr, nc)) iceSet.add(nr * cols + nc);
        }
      }
    }
    for (const key of iceSet) {
      damageIce(Math.floor(key / cols), key % cols);
    }
  }

  function tickCountdowns() {
    const exploded = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (board[r][c] && board[r][c].special === "countdown") {
          board[r][c].countdown--;
          if (board[r][c].countdown <= 0) exploded.push([r, c]);
        }
      }
    }
    return exploded;
  }

  async function handleCountdownExplosions(exploded) {
    if (exploded.length === 0) return;
    SFX.bomb();
    const cleared = new Set();
    for (const [r, c] of exploded) {
      const extra = activateSpecial(r, c, cleared, "countdown");
      cleared.add(r * cols + c);
      extra.forEach(([er, ec]) => cleared.add(er * cols + ec));
    }
    const clearList = [...cleared].map((v) => [Math.floor(v / cols), v % cols]);
    clearList.forEach(([r, c]) => {
      if (board[r][c]) {
        const ci = board[r][c].color;
        colorCleared[ci] = (colorCleared[ci] || 0) + 1;
        totalCleared++;
      }
    });
    score += clearList.length * 10;
    await animateClear(clearList);
    clearList.forEach(([r, c]) => { board[r][c] = null; });
    damageAdjacentIce(clearList);
    const fallMap = applyGravityData();
    await animateDrop(fallMap);
    await sleep(ANIM.CHAIN_PAUSE_MS);
  }

  function inBounds(r, c) {
    return r >= 0 && r < rows && c >= 0 && c < cols;
  }

  function isAdjacent(r1, c1, r2, c2) {
    const dr = Math.abs(r1 - r2);
    const dc = Math.abs(c1 - c2);
    return dr <= 1 && dc <= 1 && (dr + dc > 0);
  }

  // --- Match Finding ---
  function findAllMatches() {
    const matched = new Set();
    const directions = [[0, 1], [1, 0]];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!board[r][c]) continue;
        if (isHole(r, c) || isRock(r, c)) continue;
        const color = board[r][c].color;
        for (const [dr, dc] of directions) {
          const line = [[r, c]];
          let nr = r + dr, nc = c + dc;
          while (inBounds(nr, nc) && board[nr][nc] && !isHole(nr, nc) && !isRock(nr, nc) && board[nr][nc].color === color) {
            line.push([nr, nc]);
            nr += dr;
            nc += dc;
          }
          if (line.length >= MATCH_MIN) {
            line.forEach(([lr, lc]) => matched.add(lr * cols + lc));
          }
        }
      }
    }
    const stg = STAGES[currentStage];
    if (stg && stg.features && stg.features.diagonalLine) {
      for (let r = 0; r < rows - 1; r++) {
        for (let c = 0; c < cols - 1; c++) {
          if (!board[r][c] || isHole(r, c) || isRock(r, c)) continue;
          const color = board[r][c].color;
          const cells = [[r,c],[r,c+1],[r+1,c],[r+1,c+1]];
          const allMatch = cells.every(([cr, cc]) =>
            board[cr][cc] && !isHole(cr, cc) && !isRock(cr, cc) && board[cr][cc].color === color
          );
          if (allMatch) cells.forEach(([cr, cc]) => matched.add(cr * cols + cc));
        }
      }
    }
    return [...matched].map((v) => [Math.floor(v / cols), v % cols]);
  }

  function findSpecialCreations(matches) {
    const specials = [];
    const matchSet = new Set(matches.map(([r, c]) => r * cols + c));
    const stg = STAGES[currentStage];

    const hLines = [];
    const vLines = [];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!board[r][c]) continue;
        if (isHole(r, c) || isRock(r, c)) continue;
        const color = board[r][c].color;

        // horizontal
        {
          const line = [[r, c]];
          let nc = c + 1;
          while (inBounds(r, nc) && board[r][nc] && !isHole(r, nc) && !isRock(r, nc) && board[r][nc].color === color) {
            line.push([r, nc]);
            nc++;
          }
          if (line.length >= MATCH_MIN && line.every(([lr, lc]) => matchSet.has(lr * cols + lc))) {
            hLines.push({ line, color });
          }
        }

        // vertical
        {
          const line = [[r, c]];
          let nr = r + 1;
          while (inBounds(nr, c) && board[nr][c] && !isHole(nr, c) && !isRock(nr, c) && board[nr][c].color === color) {
            line.push([nr, c]);
            nr++;
          }
          if (line.length >= MATCH_MIN && line.every(([lr, lc]) => matchSet.has(lr * cols + lc))) {
            vLines.push({ line, color });
          }
        }
      }
    }

    const usedCells = new Set();

    // T/L shape: intersecting horizontal + vertical of same color → bomb
    for (const h of hLines) {
      for (const v of vLines) {
        if (h.color !== v.color) continue;
        for (const [hr, hc] of h.line) {
          for (const [vr, vc] of v.line) {
            if (hr === vr && hc === vc) {
              const key = hr * cols + hc;
              if (!usedCells.has(key)) {
                specials.push({ r: hr, c: hc, type: "bomb", color: h.color });
                usedCells.add(key);
                h.line.forEach(([lr, lc]) => usedCells.add(lr * cols + lc));
                v.line.forEach(([lr, lc]) => usedCells.add(lr * cols + lc));
              }
            }
          }
        }
      }
    }

    // 5+ line → rainbow, 4 line → line clear
    const allLines = [
      ...hLines.map((h) => ({ ...h, dir: "h" })),
      ...vLines.map((v) => ({ ...v, dir: "v" })),
    ];

    for (const { line, color, dir } of allLines) {
      const mid = line[Math.floor(line.length / 2)];
      const midKey = mid[0] * cols + mid[1];
      if (usedCells.has(midKey)) continue;

      if (line.length >= 5) {
        specials.push({ r: mid[0], c: mid[1], type: "rainbow", color });
        usedCells.add(midKey);
      } else if (line.length === 4) {
        const pos = line[1];
        const type = dir === "h" ? "line_v" : "line_h";
        const posKey = pos[0] * cols + pos[1];
        if (!usedCells.has(posKey)) {
          specials.push({ r: pos[0], c: pos[1], type, color });
          usedCells.add(posKey);
        }
      }
    }

    // 2×2 square → diagonal line (at swap target position if within the square)
    if (stg && stg.features && stg.features.diagonalLine) {
      for (let r = 0; r < rows - 1; r++) {
        for (let c = 0; c < cols - 1; c++) {
          const cells = [[r,c],[r,c+1],[r+1,c],[r+1,c+1]];
          if (cells.every(([cr,cc]) => matchSet.has(cr * cols + cc)) &&
              cells.every(([cr,cc]) => !usedCells.has(cr * cols + cc))) {
            const sqColor = board[r][c] ? board[r][c].color : 0;
            let sr = r, sc = c;
            if (lastSwapTarget && cells.some(([cr,cc]) => cr === lastSwapTarget.r && cc === lastSwapTarget.c)) {
              sr = lastSwapTarget.r;
              sc = lastSwapTarget.c;
            }
            specials.push({ r: sr, c: sc, type: "line_d", color: sqColor });
            cells.forEach(([cr,cc]) => usedCells.add(cr * cols + cc));
          }
        }
      }
    }

    return specials;
  }

  function findSpecialHint() {
    const PRIORITY = { rainbow: 3, bomb: 2, line_d: 2, line_h: 1, line_v: 1 };
    let bestList = [];
    let bestPriority = 0;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!board[r][c] || !isPlayable(r, c)) continue;
        const neighbors = [
          [r-1,c-1],[r-1,c],[r-1,c+1],
          [r,c+1],[r+1,c+1],[r+1,c],[r+1,c-1],[r,c-1]
        ];
        for (const [nr, nc] of neighbors) {
          if (!inBounds(nr, nc) || !board[nr][nc] || !isPlayable(nr, nc)) continue;
          if (nr < r || (nr === r && nc < c)) continue;

          swapPieces(r, c, nr, nc);
          const matches = findAllMatches();
          if (matches.length > 0) {
            const specials = findSpecialCreations(matches);
            for (const sp of specials) {
              const p = PRIORITY[sp.type] || 0;
              if (p > 0) {
                const colorMatches = matches.filter(([mr, mc]) =>
                  board[mr][mc] && board[mr][mc].color === sp.color);
                const colorSet = new Set(colorMatches.map(([mr, mc]) => mr * cols + mc));
                const pos1in = colorSet.has(r * cols + c);
                const mover = pos1in ? { r: nr, c: nc } : { r, c };
                const swapDest = pos1in ? { r, c } : { r: nr, c: nc };
                const pattern = colorMatches
                  .filter(([mr, mc]) => !(mr === swapDest.r && mc === swapDest.c))
                  .map(([mr, mc]) => ({ r: mr, c: mc }));
                if (p > bestPriority) {
                  bestPriority = p;
                  bestList = [{ mover, pattern }];
                } else if (p === bestPriority) {
                  bestList.push({ mover, pattern });
                }
              }
            }
          }
          swapPieces(r, c, nr, nc);
        }
      }
    }

    if (bestList.length === 0) return null;
    return bestList[Math.floor(Math.random() * bestList.length)];
  }

  function startHintTimer() {
    clearHint();
    hintTimer = setTimeout(() => {
      if (animating) return;
      const hint = findSpecialHint();
      if (hint) {
        hintData = hint;
        startHintAnim();
      }
    }, HINT_DELAY_MS);
  }

  function clearHint() {
    if (hintTimer) { clearTimeout(hintTimer); hintTimer = null; }
    if (hintAnimId) { cancelAnimationFrame(hintAnimId); hintAnimId = null; }
    if (hintData) { hintData = null; drawBoard(); }
  }

  function startHintAnim() {
    const startTime = performance.now();
    function tick() {
      if (!hintData) return;
      drawBoard(() => {
        const elapsed = performance.now() - startTime;
        const pulse = 0.5 + 0.5 * Math.sin(elapsed / 300);
        ctx.save();
        for (const cell of hintData.pattern) {
          const cx = cell.c * cellSize + cellSize / 2;
          const cy = cell.r * cellSize + cellSize / 2;
          const radius = cellSize * 0.45;
          ctx.globalAlpha = 0.15 + 0.2 * pulse;
          ctx.fillStyle = "#fff";
          ctx.beginPath();
          ctx.arc(cx, cy, radius * (0.9 + 0.1 * pulse), 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#ffe66d";
          ctx.lineWidth = 1.5;
          ctx.globalAlpha = 0.3 + 0.3 * pulse;
          ctx.stroke();
        }
        const m = hintData.mover;
        const mcx = m.c * cellSize + cellSize / 2;
        const mcy = m.r * cellSize + cellSize / 2;
        const mr = cellSize * 0.45;
        ctx.globalAlpha = 0.3 + 0.4 * pulse;
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(mcx, mcy, mr * (0.9 + 0.15 * pulse), 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#ffe66d";
        ctx.lineWidth = 2.5;
        ctx.globalAlpha = 0.6 + 0.4 * pulse;
        ctx.stroke();
        ctx.restore();
      });
      hintAnimId = requestAnimationFrame(tick);
    }
    tick();
  }

  // --- Special Piece Activation ---
  function activateSpecial(r, c, alreadyCleared, triggeredBy) {
    const piece = board[r][c];
    if (!piece || !piece.special) return [];
    let sp = piece.special;
    if (triggeredBy === "line_h" && sp === "line_h") sp = "line_v";
    else if (triggeredBy === "line_v" && sp === "line_v") sp = "line_h";
    const extra = [];
    const key = (r2, c2) => r2 * cols + c2;

    if (sp === "line_h") {
      for (let cc = 0; cc < cols; cc++) {
        if (!alreadyCleared.has(key(r, cc)) && board[r][cc] && isPlayable(r, cc)) {
          extra.push([r, cc]);
        }
      }
    } else if (sp === "line_v") {
      for (let rr = 0; rr < rows; rr++) {
        if (!alreadyCleared.has(key(rr, c)) && board[rr][c] && isPlayable(rr, c)) {
          extra.push([rr, c]);
        }
      }
    } else if (sp === "line_d") {
      for (let d = -Math.max(rows, cols); d <= Math.max(rows, cols); d++) {
        const r1 = r + d, c1 = c + d;
        if (inBounds(r1, c1) && !alreadyCleared.has(key(r1, c1)) && board[r1][c1] && isPlayable(r1, c1)) extra.push([r1, c1]);
        const r2 = r + d, c2 = c - d;
        if (inBounds(r2, c2) && !alreadyCleared.has(key(r2, c2)) && board[r2][c2] && isPlayable(r2, c2)) extra.push([r2, c2]);
      }
    } else if (sp === "bomb") {
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const nr = r + dr;
          const nc = c + dc;
          if (inBounds(nr, nc) && !alreadyCleared.has(key(nr, nc)) && board[nr][nc] && isPlayable(nr, nc)) {
            extra.push([nr, nc]);
          }
        }
      }
    } else if (sp === "rainbow") {
      const targetColor = piece.color;
      for (let rr = 0; rr < rows; rr++) {
        for (let cc = 0; cc < cols; cc++) {
          if (board[rr][cc] && board[rr][cc].color === targetColor && !alreadyCleared.has(key(rr, cc)) && isPlayable(rr, cc)) {
            extra.push([rr, cc]);
          }
        }
      }
    } else if (sp === "countdown") {
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const nr = r + dr, nc = c + dc;
          if (inBounds(nr, nc) && !alreadyCleared.has(key(nr, nc)) && board[nr][nc] && isPlayable(nr, nc)) extra.push([nr, nc]);
        }
      }
    }
    return extra;
  }

  // --- Gravity & Fill (data only, no animation) ---
  function applyGravityData() {
    const numColors = STAGES[currentStage].colors;
    const fallMap = [];
    for (let c = 0; c < cols; c++) {
      let writeRow = rows - 1;
      while (writeRow >= 0 && (isHole(writeRow, c) || isRock(writeRow, c))) writeRow--;
      for (let r = writeRow; r >= 0; r--) {
        if (isHole(r, c) || isRock(r, c)) continue;
        if (board[r][c]) {
          if (r !== writeRow) {
            board[writeRow][c] = board[r][c];
            board[r][c] = null;
            fallMap.push({ c, fromR: r, toR: writeRow, piece: board[writeRow][c] });
          }
          writeRow--;
          while (writeRow >= 0 && (isHole(writeRow, c) || isRock(writeRow, c))) writeRow--;
        }
      }
      let newPieceOffset = 0;
      for (let r = writeRow; r >= 0; r--) {
        if (isHole(r, c) || isRock(r, c)) continue;
        board[r][c] = randomPiece(numColors);
        newPieceOffset++;
        fallMap.push({ c, fromR: -newPieceOffset, toR: r, piece: board[r][c], isNew: true });
      }
    }
    return fallMap;
  }

  // --- Swap ---
  function swapPieces(r1, c1, r2, c2) {
    const tmp = board[r1][c1];
    board[r1][c1] = board[r2][c2];
    board[r2][c2] = tmp;
  }

  // --- Game Loop ---
  let score = 0;
  let totalCleared = 0;
  let colorCleared = [];
  let chainCount = 0;
  let lastSwapTarget = null;
  let debugSpawnType = null;
  let hintTimer = null;
  let hintData = null;
  let hintAnimId = null;
  const HINT_DELAY_MS = 3000;

  function getComboType(s1, s2) {
    const normalize = (s) => s === "countdown" ? "bomb" : s;
    const pair = [normalize(s1), normalize(s2)].sort().join("+");
    const combos = {
      "line_h+line_h": "cross",
      "line_h+line_v": "cross",
      "line_v+line_v": "cross",
      "line_d+line_h": "star_cross",
      "line_d+line_v": "star_cross",
      "line_d+line_d": "star_cross",
      "bomb+line_h": "triple_line",
      "bomb+line_v": "triple_line",
      "bomb+line_d": "triple_line",
      "bomb+bomb": "big_bomb",
      "line_h+rainbow": "rainbow_line",
      "line_v+rainbow": "rainbow_line",
      "line_d+rainbow": "rainbow_line",
      "bomb+rainbow": "rainbow_bomb",
      "rainbow+rainbow": "board_clear",
    };
    return combos[pair] || null;
  }

  function activateCombo(comboType, r, c, p1, p2) {
    const extra = [];
    const key = (r2, c2) => r2 * cols + c2;
    const cleared = new Set();

    switch (comboType) {
      case "cross":
        for (let cc = 0; cc < cols; cc++) {
          if (board[r][cc] && isPlayable(r, cc)) extra.push([r, cc]);
        }
        for (let rr = 0; rr < rows; rr++) {
          if (board[rr][c] && isPlayable(rr, c)) extra.push([rr, c]);
        }
        break;
      case "star_cross":
        for (let cc = 0; cc < cols; cc++) if (board[r][cc] && isPlayable(r, cc)) extra.push([r, cc]);
        for (let rr = 0; rr < rows; rr++) if (board[rr][c] && isPlayable(rr, c)) extra.push([rr, c]);
        for (let d = -Math.max(rows, cols); d <= Math.max(rows, cols); d++) {
          const r1 = r + d, c1 = c + d;
          if (inBounds(r1, c1) && board[r1][c1] && isPlayable(r1, c1)) extra.push([r1, c1]);
          const r2 = r + d, c2 = c - d;
          if (inBounds(r2, c2) && board[r2][c2] && isPlayable(r2, c2)) extra.push([r2, c2]);
        }
        break;
      case "triple_line": {
        for (let d = -1; d <= 1; d++) {
          for (let cc = 0; cc < cols; cc++) {
            if (inBounds(r + d, cc) && board[r + d][cc] && isPlayable(r + d, cc)) extra.push([r + d, cc]);
          }
          for (let rr = 0; rr < rows; rr++) {
            if (inBounds(rr, c + d) && board[rr][c + d] && isPlayable(rr, c + d)) extra.push([rr, c + d]);
          }
        }
        break;
      }
      case "big_bomb":
        for (let dr = -3; dr <= 3; dr++) {
          for (let dc = -3; dc <= 3; dc++) {
            if (inBounds(r + dr, c + dc) && board[r + dr][c + dc] && isPlayable(r + dr, c + dc)) {
              extra.push([r + dr, c + dc]);
            }
          }
        }
        break;
      case "rainbow_line":
      case "rainbow_bomb": {
        const rainbow = p1.special === "rainbow" ? p1 : p2;
        const other = p1.special === "rainbow" ? p2 : p1;
        const targetColor = other.color;
        const spType = comboType === "rainbow_line" ? "line_h" : "bomb";
        for (let rr = 0; rr < rows; rr++) {
          for (let cc = 0; cc < cols; cc++) {
            if (board[rr][cc] && board[rr][cc].color === targetColor && isPlayable(rr, cc)) {
              board[rr][cc].special = spType;
              extra.push([rr, cc]);
            }
          }
        }
        break;
      }
      case "board_clear":
        for (let rr = 0; rr < rows; rr++) {
          for (let cc = 0; cc < cols; cc++) {
            if (board[rr][cc] && isPlayable(rr, cc)) extra.push([rr, cc]);
          }
        }
        break;
    }

    const unique = new Map();
    extra.forEach(([er, ec]) => unique.set(er * cols + ec, [er, ec]));
    return [...unique.values()];
  }

  async function doMove(r1, c1, r2, c2) {
    if (animating) return;
    animating = true;
    clearHint();

    const p1 = board[r1][c1];
    const p2 = board[r2][c2];

    lastSwapTarget = { r: r2, c: c2 };

    SFX.swap();
    await animateSwap(r1, c1, r2, c2);
    swapPieces(r1, c1, r2, c2);

    // Special swap combo
    if (p1 && p2 && p1.special && p2.special) {
      const comboType = getComboType(p1.special, p2.special);
      if (comboType) {
        SFX.combo();
        track("special_combo", { combo_type: comboType, stage: STAGES[currentStage].name });
        movesLeft--;
        chainCount = 1;
        updateHUD();

        const comboCells = activateCombo(comboType, r2, c2, p1, p2);
        comboCells.push([r1, c1], [r2, c2]);

        // Activate specials on combo-cleared cells (chain reaction)
        const cleared = new Set(comboCells.map(([r, c]) => r * cols + c));
        comboCells.forEach(([cr, cc]) => {
          if (board[cr][cc] && board[cr][cc].special && !(cr === r1 && cc === c1) && !(cr === r2 && cc === c2)) {
            const extra = activateSpecial(cr, cc, cleared, board[cr][cc].special);
            extra.forEach(([er, ec]) => {
              if (!cleared.has(er * cols + ec)) {
                cleared.add(er * cols + ec);
                comboCells.push([er, ec]);
              }
            });
          }
        });

        const clearList = [...cleared].map((v) => [Math.floor(v / cols), v % cols]);
        clearList.forEach(([r, c]) => {
          if (board[r][c]) {
            const ci = board[r][c].color;
            colorCleared[ci] = (colorCleared[ci] || 0) + 1;
            totalCleared++;
          }
        });
        score += clearList.length * 10 * chainCount;

        await animateClear(clearList);
        clearList.forEach(([r, c]) => { board[r][c] = null; });
        damageAdjacentIce(clearList);

        const fallMap = applyGravityData();
        await animateDrop(fallMap);
        await sleep(ANIM.CHAIN_PAUSE_MS);

        await resolveBoard();

        updateHUD();
        checkWinLose();
        animating = false;
        startHintTimer();
        return;
      }
    }

    const matches = findAllMatches();
    if (matches.length === 0) {
      SFX.invalidSwap();
      await animateSwap(r2, c2, r1, c1);
      swapPieces(r1, c1, r2, c2);
      animating = false;
      drawBoard();
      startHintTimer();
      return;
    }

    movesLeft--;
    chainCount = 0;
    updateHUD();

    await resolveBoard();
    lastSwapTarget = null;

    updateHUD();
    checkWinLose();
    animating = false;
    startHintTimer();
  }

  async function resolveBoard() {
    let matches = findAllMatches();
    while (matches.length > 0) {
      chainCount++;
      const specials = findSpecialCreations(matches);
      lastSwapTarget = null;

      const cleared = new Set();
      matches.forEach(([r, c]) => cleared.add(r * cols + c));

      let hasSpecialActivation = false;
      matches.forEach(([r, c]) => {
        if (board[r][c] && board[r][c].special) {
          hasSpecialActivation = true;
          const sp = board[r][c].special;
          if (sp === "bomb" || sp === "countdown") SFX.bomb();
          else if (sp === "line_h" || sp === "line_v" || sp === "line_d") SFX.line();
          else if (sp === "rainbow") SFX.rainbow();
          const extra = activateSpecial(r, c, cleared);
          extra.forEach(([er, ec]) => {
            cleared.add(er * cols + ec);
            if (board[er][ec] && board[er][ec].special) {
              const extra2 = activateSpecial(er, ec, cleared, sp);
              extra2.forEach(([er2, ec2]) => cleared.add(er2 * cols + ec2));
            }
          });
        }
      });

      const clearList = [...cleared].map((v) => [Math.floor(v / cols), v % cols]);

      clearList.forEach(([r, c]) => {
        if (board[r][c]) {
          const ci = board[r][c].color;
          colorCleared[ci] = (colorCleared[ci] || 0) + 1;
          totalCleared++;
        }
      });

      const points = clearList.length * 10 * chainCount;
      score += points;

      if (!hasSpecialActivation) SFX.clear(chainCount);

      if (chainCount > 1) {
        await showChainLabel(chainCount);
      }

      await animateClear(clearList);

      clearList.forEach(([r, c]) => {
        board[r][c] = null;
      });

      damageAdjacentIce(clearList);

      specials.forEach((sp) => {
        if (board[sp.r] && board[sp.r][sp.c] === null) {
          board[sp.r][sp.c] = { color: sp.color, special: sp.type };
        } else if (board[sp.r] && board[sp.r][sp.c]) {
          board[sp.r][sp.c].special = sp.type;
        }
      });

      const fallMap = applyGravityData();
      if (fallMap.length > 0) SFX.drop();
      await animateDrop(fallMap);

      updateHUD();

      await sleep(ANIM.CHAIN_PAUSE_MS);

      matches = findAllMatches();
    }
    const exploded = tickCountdowns();
    await handleCountdownExplosions(exploded);
  }

  // --- Items ---
  const ITEM_COSTS = { pinpoint: 3, shuffle: 5, addmoves: 8, colorbomb: 12 };

  function updateItemBar() {
    const coins = saveData.coins || 0;
    const el = document.getElementById("item-coin-count");
    if (debugMode) {
      if (el) el.textContent = "∞";
      document.querySelectorAll(".item-btn").forEach(btn => { btn.disabled = false; });
      return;
    }
    if (el) el.textContent = coins;
    document.querySelectorAll(".item-btn").forEach(btn => {
      const cost = ITEM_COSTS[btn.dataset.item];
      btn.disabled = coins < cost;
    });
  }

  function cancelItemMode() {
    itemMode = null;
    canvas.classList.remove("item-targeting");
  }

  async function usePinpoint(r, c) {
    if (!board[r][c] || (!debugMode && (saveData.coins || 0) < ITEM_COSTS.pinpoint)) {
      cancelItemMode();
      return;
    }
    animating = true;
    if (!debugMode) { saveData.coins -= ITEM_COSTS.pinpoint; writeSave(); }
    updateItemBar();

    const cleared = new Set();
    cleared.add(r * cols + c);
    if (board[r][c].special) {
      const sp = board[r][c].special;
      if (sp === "bomb" || sp === "countdown") SFX.bomb();
      else if (sp === "line_h" || sp === "line_v" || sp === "line_d") SFX.line();
      else if (sp === "rainbow") SFX.rainbow();
      const extra = activateSpecial(r, c, cleared);
      extra.forEach(([er, ec]) => {
        cleared.add(er * cols + ec);
        if (board[er][ec] && board[er][ec].special) {
          const extra2 = activateSpecial(er, ec, cleared, sp);
          extra2.forEach(([er2, ec2]) => cleared.add(er2 * cols + ec2));
        }
      });
    }

    const clearList = [...cleared].map(v => [Math.floor(v / cols), v % cols]);
    clearList.forEach(([cr, cc]) => {
      if (board[cr][cc]) {
        const ci = board[cr][cc].color;
        colorCleared[ci] = (colorCleared[ci] || 0) + 1;
        totalCleared++;
      }
    });
    score += clearList.length * 10;

    if (!board[r][c].special) SFX.bomb();
    await animateClear(clearList);
    clearList.forEach(([cr, cc]) => { board[cr][cc] = null; });
    damageAdjacentIce(clearList);

    const fallMap = applyGravityData();
    if (fallMap.length > 0) SFX.drop();
    await animateDrop(fallMap);
    await sleep(ANIM.CHAIN_PAUSE_MS);
    await resolveBoard();

    updateHUD();
    checkWinLose();
    animating = false;
    startHintTimer();
  }

  async function useShuffle() {
    animating = true;
    if (!debugMode) { saveData.coins -= ITEM_COSTS.shuffle; writeSave(); }
    updateItemBar();

    const pieces = [];
    const positions = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (board[r][c]) {
          pieces.push(board[r][c]);
          positions.push([r, c]);
        }
      }
    }

    for (let i = pieces.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
    }

    positions.forEach(([r, c], idx) => { board[r][c] = pieces[idx]; });

    SFX.swap();
    drawBoard();
    await sleep(300);
    await resolveBoard();

    updateHUD();
    checkWinLose();
    animating = false;
    startHintTimer();
  }

  function useAddMoves() {
    if (!debugMode) { saveData.coins -= ITEM_COSTS.addmoves; writeSave(); }
    movesLeft += 3;
    updateHUD();
    updateItemBar();
    SFX.stageClear();
    startHintTimer();
  }

  async function useColorBomb(colorIndex) {
    animating = true;
    if (!debugMode) { saveData.coins -= ITEM_COSTS.colorbomb; writeSave(); }
    updateItemBar();

    const cleared = new Set();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (board[r][c] && board[r][c].color === colorIndex) {
          cleared.add(r * cols + c);
        }
      }
    }

    if (cleared.size === 0) {
      animating = false;
      return;
    }

    const clearList = [...cleared].map(v => [Math.floor(v / cols), v % cols]);
    clearList.forEach(([cr, cc]) => {
      if (board[cr][cc]) {
        const ci = board[cr][cc].color;
        colorCleared[ci] = (colorCleared[ci] || 0) + 1;
        totalCleared++;
      }
    });
    score += clearList.length * 10;

    SFX.rainbow();
    await animateClear(clearList);
    clearList.forEach(([cr, cc]) => { board[cr][cc] = null; });

    const fallMap = applyGravityData();
    if (fallMap.length > 0) SFX.drop();
    await animateDrop(fallMap);
    await sleep(ANIM.CHAIN_PAUSE_MS);
    await resolveBoard();

    updateHUD();
    checkWinLose();
    animating = false;
    startHintTimer();
  }

  function showColorPicker() {
    const grid = document.getElementById("color-picker-grid");
    grid.innerHTML = "";
    const numColors = STAGES[currentStage].colors;
    for (let i = 0; i < numColors; i++) {
      const btn = document.createElement("button");
      btn.className = "color-pick-btn";
      btn.style.background = PIECE_COLORS[i];
      btn.title = PIECE_NAMES_JA[i];
      btn.addEventListener("click", () => {
        document.getElementById("color-picker-modal").classList.add("hidden");
        useColorBomb(i);
      });
      grid.appendChild(btn);
    }
    document.getElementById("color-picker-modal").classList.remove("hidden");
  }

  function spawnSpecialAt(r, c, type) {
    if (!board[r][c] || !isPlayable(r, c)) return;
    if (type === "countdown") {
      board[r][c].special = "countdown";
      board[r][c].countdown = 5;
    } else {
      board[r][c].special = type;
    }
    drawBoard();
  }

  // --- Animations ---
  async function animateSwap(r1, c1, r2, c2) {
    const frames = ANIM.SWAP_FRAMES;
    const p1 = board[r1][c1];
    const p2 = board[r2][c2];

    for (let f = 1; f <= frames; f++) {
      const t = f / frames;
      const ease = t * t * (3 - 2 * t);

      drawBoardBase();

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if ((r === r1 && c === c1) || (r === r2 && c === c2)) continue;
          if (board[r][c]) {
            drawPieceAt(board[r][c], c * cellSize + cellSize / 2, r * cellSize + cellSize / 2);
          }
          if (isIce(r, c)) drawIceOverlay(r, c);
        }
      }

      if (p1) {
        const x = (c1 + (c2 - c1) * ease) * cellSize + cellSize / 2;
        const y = (r1 + (r2 - r1) * ease) * cellSize + cellSize / 2;
        drawPieceAt(p1, x, y);
      }
      if (p2) {
        const x = (c2 + (c1 - c2) * ease) * cellSize + cellSize / 2;
        const y = (r2 + (r1 - r2) * ease) * cellSize + cellSize / 2;
        drawPieceAt(p2, x, y);
      }

      await sleep(ANIM.SWAP_FRAME_MS);
    }
  }

  async function animateClear(cells) {
    const clearSet = new Set(cells.map(([r, c]) => r * cols + c));
    const pieceSnapshots = cells.map(([r, c]) => ({
      r, c,
      color: board[r][c] ? PIECE_COLORS[board[r][c].color] : "#fff",
      piece: board[r][c],
    }));
    const totalFrames = ANIM.CLEAR_FRAMES;

    for (let frame = 0; frame < totalFrames; frame++) {
      const t = frame / totalFrames;

      drawBoardBase();
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (clearSet.has(r * cols + c)) continue;
          if (board[r][c]) {
            drawPieceAt(board[r][c], c * cellSize + cellSize / 2, r * cellSize + cellSize / 2);
          }
          if (isIce(r, c)) drawIceOverlay(r, c);
        }
      }

      ctx.save();

      pieceSnapshots.forEach((snap, idx) => {
        const x = snap.c * cellSize + cellSize / 2;
        const y = snap.r * cellSize + cellSize / 2;
        const baseR = cellSize / 2 - 2;

        // Phase 1: Glow brightening (planet shines before dying)
        if (t < 0.3) {
          const fadeT = t / 0.3;
          ctx.globalAlpha = 1 - fadeT * 0.2;
          if (snap.piece) drawPieceAt(snap.piece, x, y);
          // Expanding white glow
          ctx.globalAlpha = 0.6 * (1 - fadeT);
          ctx.shadowColor = snap.color;
          ctx.shadowBlur = baseR * fadeT * 0.8;
          ctx.fillStyle = "#fff";
          ctx.beginPath();
          ctx.arc(x, y, baseR * (0.6 + fadeT * 0.3), 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }

        // Phase 2: Shrink + star-shaped particle burst
        if (t >= 0.2) {
          const shrinkT = Math.min((t - 0.2) / 0.8, 1);
          const ease = 1 - (1 - shrinkT) * (1 - shrinkT);
          const scale = 1 - ease;
          const alpha = 1 - ease;

          // Shrinking planet
          ctx.globalAlpha = alpha;
          ctx.fillStyle = snap.color;
          ctx.beginPath();
          ctx.arc(x, y, baseR * scale, 0, Math.PI * 2);
          ctx.fill();

          // White flash ring at moment of death
          if (shrinkT > 0.1 && shrinkT < 0.4) {
            const flashT = (shrinkT - 0.1) / 0.3;
            ctx.globalAlpha = 0.5 * (1 - flashT);
            ctx.strokeStyle = "#fff";
            ctx.lineWidth = 2 * (1 - flashT);
            ctx.beginPath();
            ctx.arc(x, y, baseR * (0.5 + flashT * 0.8), 0, Math.PI * 2);
            ctx.stroke();
          }

          // Star-dust particles bursting outward
          const numParticles = 6;
          for (let p = 0; p < numParticles; p++) {
            const angle = (p / numParticles) * Math.PI * 2 + idx * 0.7;
            const dist = baseR * 0.3 + ease * cellSize * 0.7;
            const px = x + Math.cos(angle) * dist;
            const py = y + Math.sin(angle) * dist;
            const pSize = baseR * 0.15 * (1 - ease);
            ctx.globalAlpha = alpha * 0.7;
            ctx.fillStyle = snap.color;
            // Draw tiny 4-point star shape
            ctx.beginPath();
            ctx.moveTo(px, py - pSize);
            ctx.lineTo(px + pSize * 0.3, py);
            ctx.lineTo(px, py + pSize);
            ctx.lineTo(px - pSize * 0.3, py);
            ctx.closePath();
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(px - pSize, py);
            ctx.lineTo(px, py + pSize * 0.3);
            ctx.lineTo(px + pSize, py);
            ctx.lineTo(px, py - pSize * 0.3);
            ctx.closePath();
            ctx.fill();
          }
        }
      });

      ctx.restore();
      await sleep(ANIM.CLEAR_FRAME_MS);
    }
  }

  async function animateDrop(fallMap) {
    if (fallMap.length === 0) {
      drawBoard();
      return;
    }

    const maxDist = Math.max(...fallMap.map((f) => f.toR - f.fromR));
    const totalFrames = Math.ceil(maxDist / ANIM.DROP_SPEED);

    const frozen = [];
    for (let r = 0; r < rows; r++) {
      frozen[r] = [];
      for (let c = 0; c < cols; c++) {
        frozen[r][c] = board[r][c];
      }
    }

    const fallingCells = new Set(fallMap.map((f) => f.toR * cols + f.c));

    for (let frame = 0; frame <= totalFrames; frame++) {
      const t = Math.min(frame / totalFrames, 1);
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

      drawBoardBase();

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (fallingCells.has(r * cols + c)) continue;
          if (frozen[r][c]) {
            drawPieceAt(frozen[r][c], c * cellSize + cellSize / 2, r * cellSize + cellSize / 2);
          }
          if (isIce(r, c)) drawIceOverlay(r, c);
        }
      }

      for (const fall of fallMap) {
        const currentR = fall.fromR + (fall.toR - fall.fromR) * ease;
        const x = fall.c * cellSize + cellSize / 2;
        const y = currentR * cellSize + cellSize / 2;

        if (y + cellSize / 2 > 0) {
          drawPieceAt(fall.piece, x, y);
        }
      }

      if (frame < totalFrames) {
        await sleep(ANIM.DROP_FRAME_MS);
      }
    }

    drawBoard();
  }

  async function showChainLabel(chain) {
    const label = `${chain} Chain!`;
    const totalFrames = 20;

    for (let f = 0; f < totalFrames; f++) {
      drawBoard();
      ctx.save();

      const t = f / totalFrames;
      const yOffset = -t * cellSize * 0.5;
      const alpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
      const scale = t < 0.2 ? 0.5 + (t / 0.2) * 0.5 : 1;

      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#ffd700";
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 3;
      ctx.font = `bold ${cellSize * 0.7 * scale}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      const x = boardPixelW / 2;
      const y = boardPixelH / 2 + yOffset;

      ctx.strokeText(label, x, y);
      ctx.fillText(label, x, y);

      ctx.restore();
      await sleep(25);
    }
  }

  async function flashInvalid(r1, c1, r2, c2) {
    for (let i = 0; i < 3; i++) {
      drawBoard(() => {
        ctx.save();
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = "#f00";
        ctx.fillRect(c1 * cellSize, r1 * cellSize, cellSize, cellSize);
        ctx.fillRect(c2 * cellSize, r2 * cellSize, cellSize, cellSize);
        ctx.restore();
      });
      await sleep(60);
      drawBoard();
      await sleep(60);
    }
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // --- Drawing ---
  function drawBoardBase() {
    ctx.clearRect(0, 0, boardPixelW, boardPixelH);

    // Animated space background
    drawSpaceBackground();

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * cellSize;
        const y = r * cellSize;
        if (isHole(r, c)) {
          ctx.fillStyle = "rgba(5,5,16,0.85)";
          ctx.fillRect(x, y, cellSize, cellSize);
          continue;
        }
        if (isRock(r, c)) {
          ctx.fillStyle = "rgba(25,25,40,0.9)";
          ctx.fillRect(x, y, cellSize, cellSize);
          ctx.save();
          ctx.fillStyle = "#3a3a4a";
          const rcx = x + cellSize / 2;
          const rcy = y + cellSize / 2;
          const rr = cellSize / 2 - 4;
          ctx.beginPath();
          ctx.arc(rcx, rcy, rr, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#555";
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.strokeStyle = "#666";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(rcx - rr * 0.4, rcy - rr * 0.4);
          ctx.lineTo(rcx + rr * 0.4, rcy + rr * 0.4);
          ctx.moveTo(rcx + rr * 0.4, rcy - rr * 0.4);
          ctx.lineTo(rcx - rr * 0.4, rcy + rr * 0.4);
          ctx.stroke();
          ctx.restore();
          continue;
        }
        // Semi-transparent cell overlay so stars show through subtly
        ctx.fillStyle = (r + c) % 2 === 0 ? "rgba(10,18,40,0.82)" : "rgba(14,24,50,0.82)";
        ctx.fillRect(x, y, cellSize, cellSize);
      }
    }
  }

  function drawPieceAt(piece, cx, cy) {
    if (!piece) return;
    const radius = cellSize / 2 - 4;

    if (pieceCacheSize === cellSize && pieceCache[piece.color]) {
      const cached = pieceCache[piece.color];
      const pad = 1.4;
      const size = Math.ceil(cellSize * pad);
      ctx.drawImage(cached, cx - size / 2, cy - size / 2, size, size);
    } else {
      drawPlanet(ctx, piece.color, cx, cy, radius);
    }

    if (piece.special) {
      drawSpecialIndicator(ctx, piece.special, cx, cy, radius, piece);
    }
  }

  function drawIceOverlay(r, c) {
    const x = c * cellSize, y = r * cellSize;
    ctx.save();
    const iceAlpha = cellState[r][c] === "ice2" ? 0.35 : 0.2;
    ctx.fillStyle = `rgba(100, 200, 255, ${iceAlpha})`;
    ctx.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
    ctx.strokeStyle = `rgba(150, 220, 255, ${iceAlpha + 0.15})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 2, y + 2, cellSize - 4, cellSize - 4);
    ctx.strokeStyle = `rgba(200, 240, 255, ${iceAlpha})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + cellSize * 0.2, y + cellSize * 0.3);
    ctx.lineTo(x + cellSize * 0.5, y + cellSize * 0.15);
    ctx.lineTo(x + cellSize * 0.8, y + cellSize * 0.3);
    ctx.stroke();
    if (cellState[r][c] === "ice2") {
      ctx.beginPath();
      ctx.moveTo(x + cellSize * 0.3, y + cellSize * 0.7);
      ctx.lineTo(x + cellSize * 0.6, y + cellSize * 0.85);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawBoard(overlay) {
    drawBoardBase();

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!board[r][c] || isHole(r, c) || isRock(r, c)) continue;
        const piece = board[r][c];

        const cx = c * cellSize + cellSize / 2;
        const cy = r * cellSize + cellSize / 2;
        const x = c * cellSize;
        const y = r * cellSize;

        drawPieceAt(piece, cx, cy);

        if (isIce(r, c)) {
          drawIceOverlay(r, c);
        }

        if (selected && selected.r === r && selected.c === c) {
          ctx.save();
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 3;
          ctx.strokeRect(c * cellSize + 2, r * cellSize + 2, cellSize - 4, cellSize - 4);
          ctx.restore();
        }
      }
    }

    if (overlay) overlay();
  }

  // --- Color utility functions for planet gradients ---
  function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
  }

  function lightenColor(hex, amount) {
    const rgb = hexToRgb(hex);
    const r = Math.min(255, rgb.r + amount);
    const g = Math.min(255, rgb.g + amount);
    const b = Math.min(255, rgb.b + amount);
    return `rgb(${r},${g},${b})`;
  }

  function darkenColor(hex, amount) {
    const rgb = hexToRgb(hex);
    const r = Math.max(0, rgb.r - amount);
    const g = Math.max(0, rgb.g - amount);
    const b = Math.max(0, rgb.b - amount);
    return `rgb(${r},${g},${b})`;
  }

  // --- Planet drawing functions ---
  function drawPlanet(ctx, colorIdx, cx, cy, r) {
    ctx.save();
    const color = PIECE_COLORS[colorIdx];

    // Outer glow
    ctx.shadowColor = color;
    ctx.shadowBlur = r * 0.4;

    // Base sphere with radial gradient (3D effect)
    const grad = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.25, r * 0.1, cx, cy, r);
    grad.addColorStop(0, lightenColor(color, 60));
    grad.addColorStop(0.5, color);
    grad.addColorStop(1, darkenColor(color, 60));

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // Reset shadow for details
    ctx.shadowBlur = 0;

    // Planet-specific surface details
    switch (colorIdx) {
      case 0: drawSun(ctx, cx, cy, r, color); break;
      case 1: drawMoon(ctx, cx, cy, r, color); break;
      case 2: drawMars(ctx, cx, cy, r, color); break;
      case 3: drawMercury(ctx, cx, cy, r, color); break;
      case 4: drawJupiter(ctx, cx, cy, r, color); break;
      case 5: drawVenus(ctx, cx, cy, r, color); break;
      case 6: drawSaturn(ctx, cx, cy, r, color); break;
      case 7: drawEarth(ctx, cx, cy, r, color); break;
    }

    // Specular highlight (universal for all planets)
    const hlGrad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 0, cx - r * 0.3, cy - r * 0.3, r * 0.6);
    hlGrad.addColorStop(0, "rgba(255,255,255,0.45)");
    hlGrad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = hlGrad;
    ctx.fill();

    ctx.restore();
  }

  // Sun: Corona rays emanating from the sphere
  function drawSun(ctx, cx, cy, r, color) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    // Solar surface texture - lighter patches
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2 + 0.3;
      const dist = r * 0.4;
      const px = cx + Math.cos(angle) * dist;
      const py = cy + Math.sin(angle) * dist;
      const spotGrad = ctx.createRadialGradient(px, py, 0, px, py, r * 0.3);
      spotGrad.addColorStop(0, "rgba(255,255,200,0.3)");
      spotGrad.addColorStop(1, "rgba(255,255,200,0)");
      ctx.fillStyle = spotGrad;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    ctx.restore();
    // Corona rays outside sphere
    ctx.save();
    ctx.globalAlpha = 0.35;
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const innerR = r * 1.0;
      const outerR = r * 1.25;
      const x1 = cx + Math.cos(angle) * innerR;
      const y1 = cy + Math.sin(angle) * innerR;
      const x2 = cx + Math.cos(angle) * outerR;
      const y2 = cy + Math.sin(angle) * outerR;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = "#ffe0a0";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.restore();
  }

  // Moon: Craters on surface
  function drawMoon(ctx, cx, cy, r, color) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    // Craters
    const craters = [
      { x: 0.2, y: -0.15, s: 0.18 },
      { x: -0.3, y: 0.25, s: 0.22 },
      { x: 0.35, y: 0.3, s: 0.15 },
      { x: -0.1, y: -0.35, s: 0.12 },
    ];
    for (const c of craters) {
      const px = cx + c.x * r;
      const py = cy + c.y * r;
      const cr = c.s * r;
      ctx.beginPath();
      ctx.arc(px, py, cr, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0,0,0,0.15)";
      ctx.fill();
      // Crater rim highlight
      ctx.beginPath();
      ctx.arc(px - cr * 0.15, py - cr * 0.15, cr * 0.85, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255,0.1)";
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
    ctx.restore();
  }

  // Mars: Dark surface patches, polar ice cap
  function drawMars(ctx, cx, cy, r, color) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    // Dark patches
    const patches = [
      { x: -0.2, y: 0.1, s: 0.35 },
      { x: 0.25, y: -0.2, s: 0.25 },
    ];
    for (const p of patches) {
      const grad = ctx.createRadialGradient(cx + p.x * r, cy + p.y * r, 0, cx + p.x * r, cy + p.y * r, p.s * r);
      grad.addColorStop(0, "rgba(120,40,20,0.3)");
      grad.addColorStop(1, "rgba(120,40,20,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    // Polar ice cap
    ctx.beginPath();
    ctx.arc(cx, cy - r * 0.75, r * 0.3, 0, Math.PI, false);
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.fill();
    ctx.restore();
  }

  // Mercury: Heavily cratered
  function drawMercury(ctx, cx, cy, r, color) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    const craters = [
      { x: 0.15, y: -0.2, s: 0.15 },
      { x: -0.25, y: 0.1, s: 0.2 },
      { x: 0.3, y: 0.25, s: 0.12 },
      { x: -0.1, y: -0.35, s: 0.1 },
      { x: 0.0, y: 0.3, s: 0.14 },
      { x: -0.35, y: -0.15, s: 0.1 },
    ];
    for (const c of craters) {
      const px = cx + c.x * r;
      const py = cy + c.y * r;
      const cr = c.s * r;
      ctx.beginPath();
      ctx.arc(px, py, cr, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0,0,0,0.2)";
      ctx.fill();
    }
    ctx.restore();
  }

  // Jupiter: Horizontal cloud bands + Great Red Spot
  function drawJupiter(ctx, cx, cy, r, color) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    // Cloud bands
    const bandColors = [
      "rgba(200,160,80,0.2)",
      "rgba(180,140,60,0.15)",
      "rgba(220,180,100,0.2)",
      "rgba(160,120,40,0.15)",
    ];
    for (let i = 0; i < bandColors.length; i++) {
      const by = cy - r * 0.6 + (i * r * 0.35);
      ctx.fillStyle = bandColors[i];
      ctx.fillRect(cx - r, by, r * 2, r * 0.15);
    }
    // Great Red Spot
    ctx.beginPath();
    ctx.ellipse(cx + r * 0.2, cy + r * 0.15, r * 0.18, r * 0.12, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(200,80,30,0.35)";
    ctx.fill();
    ctx.restore();
  }

  // Venus: Cloud swirl patterns
  function drawVenus(ctx, cx, cy, r, color) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    // Swirl cloud patterns
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(angle) * r * 0.2, cy + Math.sin(angle) * r * 0.2, r * 0.6, angle, angle + Math.PI * 0.8, false);
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = r * 0.12;
      ctx.stroke();
    }
    ctx.restore();
  }

  // Saturn: Rings (drawn as ellipses). Note: rings extend outside the sphere
  function drawSaturn(ctx, cx, cy, r, color) {
    // Draw rings behind planet (back half)
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 1.45, r * 0.35, -0.2, Math.PI, Math.PI * 2);
    ctx.strokeStyle = lightenColor(color, 40);
    ctx.lineWidth = r * 0.12;
    ctx.stroke();
    ctx.restore();

    // Redraw planet sphere on top (to cover back ring)
    const grad = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.25, r * 0.1, cx, cy, r);
    grad.addColorStop(0, lightenColor(color, 60));
    grad.addColorStop(0.5, color);
    grad.addColorStop(1, darkenColor(color, 60));
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // Surface bands
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    for (let i = 0; i < 3; i++) {
      const by = cy - r * 0.4 + i * r * 0.35;
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.fillRect(cx - r, by, r * 2, r * 0.12);
    }
    ctx.restore();

    // Front half of rings
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 1.45, r * 0.35, -0.2, 0, Math.PI);
    ctx.strokeStyle = lightenColor(color, 50);
    ctx.lineWidth = r * 0.12;
    ctx.stroke();
    // Inner ring
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 1.2, r * 0.28, -0.2, 0, Math.PI);
    ctx.strokeStyle = lightenColor(color, 30);
    ctx.lineWidth = r * 0.06;
    ctx.stroke();
    ctx.restore();
  }

  // Earth: Continent blobs + ocean
  function drawEarth(ctx, cx, cy, r, color) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    // Continent-like blobs (green-ish on blue-green base)
    const continents = [
      { x: -0.15, y: -0.2, w: 0.35, h: 0.3 },
      { x: 0.15, y: 0.1, w: 0.3, h: 0.35 },
      { x: -0.35, y: 0.2, w: 0.2, h: 0.2 },
    ];
    for (const c of continents) {
      const grad = ctx.createRadialGradient(
        cx + c.x * r, cy + c.y * r, 0,
        cx + c.x * r, cy + c.y * r, c.w * r
      );
      grad.addColorStop(0, "rgba(60,160,60,0.35)");
      grad.addColorStop(1, "rgba(60,160,60,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    // Cloud wisps
    ctx.beginPath();
    ctx.arc(cx - r * 0.2, cy - r * 0.1, r * 0.5, -0.5, 0.5);
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = r * 0.08;
    ctx.stroke();
    ctx.restore();
  }

  // --- Offscreen canvas cache for planet pieces ---
  function buildPieceCache() {
    pieceCache = {};
    pieceCacheSize = cellSize;
    const pad = 1.4;
    const size = Math.ceil(cellSize * pad);
    const dpr = window.devicePixelRatio || 1;

    for (let colorIdx = 0; colorIdx < PIECE_COLORS.length; colorIdx++) {
      const offCanvas = document.createElement("canvas");
      offCanvas.width = size * dpr;
      offCanvas.height = size * dpr;
      const offCtx = offCanvas.getContext("2d");
      offCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const cx = size / 2;
      const cy = size / 2;
      const radius = cellSize / 2 - 4;

      drawPlanet(offCtx, colorIdx, cx, cy, radius);
      pieceCache[colorIdx] = offCanvas;
    }
  }

  function initBgStars() {
    bgStars = [];
    const w = boardPixelW, h = boardPixelH;
    const layers = [
      { count: 60, speed: 0.08, sizeMin: 0.5, sizeMax: 1.2, alpha: 0.4 },
      { count: 35, speed: 0.22, sizeMin: 0.8, sizeMax: 1.8, alpha: 0.6 },
      { count: 15, speed: 0.45, sizeMin: 1.2, sizeMax: 2.5, alpha: 0.8 },
    ];
    for (const layer of layers) {
      for (let i = 0; i < layer.count; i++) {
        bgStars.push({
          x: Math.random() * w,
          y: Math.random() * h,
          size: layer.sizeMin + Math.random() * (layer.sizeMax - layer.sizeMin),
          speed: layer.speed + Math.random() * layer.speed * 0.3,
          alpha: layer.alpha * (0.6 + Math.random() * 0.4),
          twinkle: Math.random() * Math.PI * 2,
        });
      }
    }
  }

  function drawSpaceBackground() {
    const w = boardPixelW, h = boardPixelH;

    // Cached deep space gradient (recreate only on resize)
    const sizeKey = w + "x" + h;
    if (bgGradSize !== sizeKey) {
      bgGradCache = ctx.createLinearGradient(0, 0, w * 0.3, h);
      bgGradCache.addColorStop(0, "#050510");
      bgGradCache.addColorStop(0.5, "#08081a");
      bgGradCache.addColorStop(1, "#0a0518");
      bgGradSize = sizeKey;
    }
    ctx.fillStyle = bgGradCache;
    ctx.fillRect(0, 0, w, h);

    // Stars
    for (const star of bgStars) {
      star.y += star.speed;
      star.x += star.speed * 0.15;
      if (star.y > h) { star.y = -2; star.x = Math.random() * w; }
      if (star.x > w) star.x -= w;

      star.twinkle += 0.03;
      const flicker = 0.7 + 0.3 * Math.sin(star.twinkle);
      ctx.globalAlpha = star.alpha * flicker;
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Shooting star (occasional)
    if (!bgShootingStar && Math.random() < 0.003) {
      bgShootingStar = {
        x: Math.random() * w * 0.6,
        y: Math.random() * h * 0.3,
        vx: 3 + Math.random() * 2,
        vy: 1.5 + Math.random(),
        life: 1,
      };
    }
    if (bgShootingStar) {
      const ss = bgShootingStar;
      ss.x += ss.vx;
      ss.y += ss.vy;
      ss.life -= 0.03;
      if (ss.life <= 0) { bgShootingStar = null; }
      else {
        ctx.save();
        ctx.globalAlpha = ss.life;
        const tailLen = 20;
        const grad = ctx.createLinearGradient(ss.x, ss.y, ss.x - ss.vx * tailLen * 0.3, ss.y - ss.vy * tailLen * 0.3);
        grad.addColorStop(0, "#fff");
        grad.addColorStop(1, "rgba(255,255,255,0)");
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(ss.x, ss.y);
        ctx.lineTo(ss.x - ss.vx * tailLen * 0.3, ss.y - ss.vy * tailLen * 0.3);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  function startBgAnim() {
    stopBgAnim();
    function tick() {
      if (!screens.game.classList.contains("active")) return;
      if (!animating && !hintData) {
        drawBoard();
      }
      bgAnimId = requestAnimationFrame(tick);
    }
    bgAnimId = requestAnimationFrame(tick);
  }

  function stopBgAnim() {
    if (bgAnimId) { cancelAnimationFrame(bgAnimId); bgAnimId = null; }
  }

  function drawSpecialIndicator(ctx, type, cx, cy, r, piece) {
    ctx.save();
    const s = r * 0.55;
    ctx.lineCap = "round";

    ctx.beginPath();
    ctx.arc(cx, cy, s + 2, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fill();

    switch (type) {
      case "line_h": {
        // Comet tail horizontal
        const grad = ctx.createLinearGradient(cx - s, cy, cx + s, cy);
        grad.addColorStop(0, "rgba(255,255,200,0.1)");
        grad.addColorStop(0.4, "rgba(255,255,200,0.8)");
        grad.addColorStop(0.5, "#fff");
        grad.addColorStop(0.6, "rgba(255,255,200,0.8)");
        grad.addColorStop(1, "rgba(255,255,200,0.1)");
        ctx.strokeStyle = grad;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(cx - s, cy);
        ctx.lineTo(cx + s, cy);
        ctx.stroke();
        // Comet heads at both ends
        ctx.fillStyle = "#fff";
        ctx.shadowColor = "#ffe080";
        ctx.shadowBlur = 4;
        ctx.beginPath();
        ctx.arc(cx - s * 0.85, cy, s * 0.15, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx + s * 0.85, cy, s * 0.15, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "line_v": {
        const grad = ctx.createLinearGradient(cx, cy - s, cx, cy + s);
        grad.addColorStop(0, "rgba(255,255,200,0.1)");
        grad.addColorStop(0.4, "rgba(255,255,200,0.8)");
        grad.addColorStop(0.5, "#fff");
        grad.addColorStop(0.6, "rgba(255,255,200,0.8)");
        grad.addColorStop(1, "rgba(255,255,200,0.1)");
        ctx.strokeStyle = grad;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(cx, cy - s);
        ctx.lineTo(cx, cy + s);
        ctx.stroke();
        ctx.fillStyle = "#fff";
        ctx.shadowColor = "#ffe080";
        ctx.shadowBlur = 4;
        ctx.beginPath();
        ctx.arc(cx, cy - s * 0.85, s * 0.15, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx, cy + s * 0.85, s * 0.15, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "line_d": {
        // Meteor shower — X-shaped golden trails
        const ds = s * 0.75;
        ctx.shadowColor = "#ffd700";
        ctx.shadowBlur = 3;
        ctx.lineWidth = 2;
        // Trail 1
        const g1 = ctx.createLinearGradient(cx - ds, cy - ds, cx + ds, cy + ds);
        g1.addColorStop(0, "rgba(255,215,0,0.2)");
        g1.addColorStop(0.5, "#ffd700");
        g1.addColorStop(1, "rgba(255,215,0,0.2)");
        ctx.strokeStyle = g1;
        ctx.beginPath();
        ctx.moveTo(cx - ds, cy - ds);
        ctx.lineTo(cx + ds, cy + ds);
        ctx.stroke();
        // Trail 2
        const g2 = ctx.createLinearGradient(cx + ds, cy - ds, cx - ds, cy + ds);
        g2.addColorStop(0, "rgba(255,215,0,0.2)");
        g2.addColorStop(0.5, "#ffd700");
        g2.addColorStop(1, "rgba(255,215,0,0.2)");
        ctx.strokeStyle = g2;
        ctx.beginPath();
        ctx.moveTo(cx + ds, cy - ds);
        ctx.lineTo(cx - ds, cy + ds);
        ctx.stroke();
        // Meteor heads at corners
        ctx.fillStyle = "#ffe880";
        const mhs = s * 0.1;
        [[cx - ds, cy - ds], [cx + ds, cy + ds], [cx + ds, cy - ds], [cx - ds, cy + ds]].forEach(([mx, my]) => {
          ctx.beginPath();
          ctx.arc(mx, my, mhs, 0, Math.PI * 2);
          ctx.fill();
        });
        break;
      }
      case "bomb": {
        // Supernova — pulsing light rings + radial rays
        ctx.shadowColor = "#fff";
        ctx.shadowBlur = 4;
        // Outer ring
        ctx.strokeStyle = "rgba(255,255,255,0.6)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, s * 0.7, 0, Math.PI * 2);
        ctx.stroke();
        // Inner ring
        ctx.strokeStyle = "rgba(255,200,100,0.8)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, s * 0.4, 0, Math.PI * 2);
        ctx.stroke();
        // Radial rays
        ctx.shadowBlur = 0;
        for (let i = 0; i < 8; i++) {
          const angle = (i / 8) * Math.PI * 2;
          const x1 = cx + Math.cos(angle) * s * 0.25;
          const y1 = cy + Math.sin(angle) * s * 0.25;
          const x2 = cx + Math.cos(angle) * s * 0.75;
          const y2 = cy + Math.sin(angle) * s * 0.75;
          const rg = ctx.createLinearGradient(x1, y1, x2, y2);
          rg.addColorStop(0, "rgba(255,220,150,0.7)");
          rg.addColorStop(1, "rgba(255,220,150,0)");
          ctx.strokeStyle = rg;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }
        // Bright center
        ctx.fillStyle = "#fff";
        ctx.shadowColor = "#ffe080";
        ctx.shadowBlur = 5;
        ctx.beginPath();
        ctx.arc(cx, cy, s * 0.15, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "rainbow": {
        // Black hole — swirling accretion disk with rainbow gravity lens
        const colors = ["#ff4444", "#ffaa00", "#44ff44", "#4488ff", "#ff44ff", "#44ffff"];
        // Accretion disk arcs
        for (let i = 0; i < colors.length; i++) {
          const angle = (i / colors.length) * Math.PI * 2;
          ctx.beginPath();
          ctx.arc(cx, cy, s * 0.6, angle, angle + Math.PI * 0.5);
          ctx.strokeStyle = colors[i];
          ctx.lineWidth = 2;
          ctx.globalAlpha = 0.6;
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        // Dark center vortex
        const vGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, s * 0.3);
        vGrad.addColorStop(0, "#000");
        vGrad.addColorStop(0.7, "rgba(30,0,50,0.9)");
        vGrad.addColorStop(1, "rgba(30,0,50,0)");
        ctx.fillStyle = vGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, s * 0.3, 0, Math.PI * 2);
        ctx.fill();
        // Bright event horizon ring
        ctx.strokeStyle = "rgba(255,255,255,0.5)";
        ctx.lineWidth = 1;
        ctx.shadowColor = "#fff";
        ctx.shadowBlur = 3;
        ctx.beginPath();
        ctx.arc(cx, cy, s * 0.2, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case "countdown": {
        // Meteor — cracked rock with glowing countdown
        const count = piece ? piece.countdown : 0;
        const urgency = count <= 3;
        // Rock texture
        ctx.fillStyle = urgency ? "rgba(120,30,20,0.7)" : "rgba(80,70,60,0.7)";
        ctx.beginPath();
        ctx.arc(cx, cy, s * 0.6, 0, Math.PI * 2);
        ctx.fill();
        // Cracks
        ctx.strokeStyle = urgency ? "rgba(255,80,40,0.7)" : "rgba(255,200,100,0.4)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx - s * 0.2, cy - s * 0.5);
        ctx.lineTo(cx + s * 0.1, cy);
        ctx.lineTo(cx + s * 0.3, cy + s * 0.4);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx + s * 0.1, cy);
        ctx.lineTo(cx - s * 0.3, cy + s * 0.2);
        ctx.stroke();
        // Countdown number
        ctx.fillStyle = urgency ? "#ff4444" : "#ffd700";
        ctx.shadowColor = urgency ? "#ff0000" : "#ffd700";
        ctx.shadowBlur = urgency ? 6 : 3;
        ctx.font = `bold ${s * 1.2}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(count.toString(), cx, cy);
        break;
      }
    }
    ctx.restore();
  }

  // --- HUD ---
  function updateHUD() {
    document.getElementById("hud-stage").textContent = `Stage ${STAGES[currentStage].name}`;
    document.getElementById("hud-moves").textContent = `のこり ${movesLeft} 手`;

    const m = STAGES[currentStage].mission;
    document.getElementById("hud-mission-label").innerHTML = getMissionText(m, true);

    let current = 0;
    let target = 0;
    switch (m.type) {
      case "score":
        current = score;
        target = m.target;
        document.getElementById("hud-mission-progress").textContent = `${current} / ${target} 点`;
        break;
      case "clear":
        current = totalCleared;
        target = m.count;
        document.getElementById("hud-mission-progress").textContent = `${current} / ${target} 個`;
        break;
      case "color":
        current = colorCleared[m.colorIndex] || 0;
        target = m.count;
        document.getElementById("hud-mission-progress").textContent = `${current} / ${target} 個`;
        break;
    }

    const progressEl = document.getElementById("hud-mission-progress");
    if (current >= target) {
      progressEl.style.color = "#4ecdc4";
    } else {
      progressEl.style.color = "";
    }

    const stg = STAGES[currentStage];
    const usedMoves = stg.moves - movesLeft;
    let currentStars = 3;
    if (usedMoves > stg.star3moves) currentStars = 2;
    if (usedMoves > stg.star2moves) currentStars = 1;

    const starsEl = document.getElementById("hud-stars");
    let html = "";
    for (let s = 0; s < 3; s++) {
      html += s < currentStars
        ? '<span class="star-on">★</span>'
        : '<span class="star-off">★</span>';
    }
    starsEl.innerHTML = html;
  }

  // --- Win/Lose ---
  function checkWinLose() {
    const m = STAGES[currentStage].mission;
    let cleared = false;

    switch (m.type) {
      case "score":
        cleared = score >= m.target;
        break;
      case "clear":
        cleared = totalCleared >= m.count;
        break;
      case "color":
        cleared = (colorCleared[m.colorIndex] || 0) >= m.count;
        break;
    }

    if (cleared) {
      const stg = STAGES[currentStage];
      const usedMoves = stg.moves - movesLeft;
      let stars = 1;
      if (usedMoves <= stg.star3moves) stars = 3;
      else if (usedMoves <= stg.star2moves) stars = 2;

      const prev = saveData.bestStars[currentStage] || 0;
      const isFirstClear = !saveData.cleared[currentStage];
      coinsEarned = stars;
      const newStars = Math.max(0, stars - prev);
      coinsEarned += newStars * 2;
      if (isFirstClear && STAR_GATES.some(g => g.stage === currentStage)) {
        coinsEarned += 5;
      }
      saveData.coins = (saveData.coins || 0) + coinsEarned;

      if (stars > prev) saveData.bestStars[currentStage] = stars;
      saveData.cleared[currentStage] = true;
      writeSave();

      SFX.stageClear();
      track("stage_clear", { stage: stg.name, stars, moves_used: usedMoves, moves_total: stg.moves, mission_type: stg.mission.type, coins_earned: coinsEarned });
      showResult(true, stars);
    } else if (movesLeft <= 0) {
      const stg = STAGES[currentStage];
      SFX.stageFail();
      track("stage_fail", { stage: stg.name, moves_total: stg.moves, mission_type: stg.mission.type });
      showResult(false, 0);
    }
  }

  function showResult(win, stars) {
    document.getElementById("result-title").textContent = win ? "クリア！" : "あと少し…";
    document.getElementById("result-stars").textContent = win
      ? "★".repeat(stars) + "☆".repeat(3 - stars)
      : "";
    let details = `スコア: ${score}`;
    if (win && coinsEarned > 0) {
      details += `<br>🪙 +${coinsEarned} コイン（所持: ${saveData.coins || 0}）`;
    }
    document.getElementById("result-details").innerHTML = details;

    const nextBtn = document.getElementById("btn-next");
    nextBtn.style.display = win && currentStage < STAGES.length - 1 ? "" : "none";

    const rescueBtn = document.getElementById("btn-rescue");
    if (!win && (debugMode || (saveData.coins || 0) >= ITEM_COSTS.addmoves)) {
      rescueBtn.style.display = "";
    } else {
      rescueBtn.style.display = "none";
    }

    showScreen("result");
  }

  // --- Input ---
  function getCell(px, py) {
    const rect = canvas.getBoundingClientRect();
    const x = px - rect.left;
    const y = py - rect.top;
    const c = Math.floor(x / cellSize);
    const r = Math.floor(y / cellSize);
    if (inBounds(r, c) && !isHole(r, c) && !isRock(r, c)) return { r, c };
    return null;
  }

  let dragStart = null;
  let dragStartPx = null;
  const DRAG_THRESHOLD = 12;

  function dragDirection(sx, sy, ex, ey) {
    const dx = ex - sx;
    const dy = ey - sy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < DRAG_THRESHOLD) return null;

    const angle = Math.atan2(dy, dx);
    const sector = Math.round(angle / (Math.PI / 4));
    switch (sector) {
      case 0:  return { dr: 0, dc: 1 };
      case 1:  return { dr: 1, dc: 1 };
      case 2:  return { dr: 1, dc: 0 };
      case 3:  return { dr: 1, dc: -1 };
      case 4:
      case -4: return { dr: 0, dc: -1 };
      case -3: return { dr: -1, dc: -1 };
      case -2: return { dr: -1, dc: 0 };
      case -1: return { dr: -1, dc: 1 };
    }
    return null;
  }

  canvas.addEventListener("pointerdown", (e) => {
    if (animating) return;
    e.preventDefault();
    clearHint();
    const cell = getCell(e.clientX, e.clientY);
    if (!cell) return;

    if (debugSpawnType) {
      spawnSpecialAt(cell.r, cell.c, debugSpawnType);
      return;
    }

    if (itemMode === "pinpoint") {
      cancelItemMode();
      usePinpoint(cell.r, cell.c);
      return;
    }

    if (selected) {
      if (isAdjacent(selected.r, selected.c, cell.r, cell.c)) {
        doMove(selected.r, selected.c, cell.r, cell.c);
        selected = null;
        drawBoard();
        return;
      }
    }

    selected = cell;
    dragStart = cell;
    dragStartPx = { x: e.clientX, y: e.clientY };
    drawBoard();
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!dragStart || !dragStartPx || animating) return;
    e.preventDefault();

    const dir = dragDirection(dragStartPx.x, dragStartPx.y, e.clientX, e.clientY);
    if (!dir) return;

    const targetR = dragStart.r + dir.dr;
    const targetC = dragStart.c + dir.dc;
    if (!inBounds(targetR, targetC)) return;
    if (isHole(targetR, targetC) || isRock(targetR, targetC)) return;

    selected = null;
    doMove(dragStart.r, dragStart.c, targetR, targetC);
    dragStart = null;
    dragStartPx = null;
  });

  canvas.addEventListener("pointerup", () => {
    dragStart = null;
    dragStartPx = null;
  });

  canvas.addEventListener("pointerleave", () => {
    dragStart = null;
    dragStartPx = null;
  });

  // --- Screen Transitions ---
  document.getElementById("btn-sound-toggle").addEventListener("click", () => {
    soundEnabled = !soundEnabled;
    document.getElementById("btn-sound-toggle").textContent = soundEnabled ? "🔊" : "🔇";
  });

  document.getElementById("btn-start").addEventListener("click", () => {
    initAudio();
    const lastCleared = Object.keys(saveData.cleared)
      .map(Number)
      .sort((a, b) => a - b);
    let next = lastCleared.length > 0 ? Math.min(lastCleared[lastCleared.length - 1] + 1, STAGES.length - 1) : 0;
    if (!isStageUnlocked(next)) {
      buildStageSelect();
      showScreen("stageSelect");
      return;
    }
    currentStage = next;
    startStage(currentStage);
  });

  document.getElementById("btn-stage-select").addEventListener("click", () => {
    initAudio();
    buildStageSelect();
    showScreen("stageSelect");
  });

  document.getElementById("btn-back-title").addEventListener("click", () => {
    showScreen("title");
  });

  document.getElementById("btn-help").addEventListener("click", () => {
    showScreen("help");
  });

  document.getElementById("btn-back-help").addEventListener("click", () => {
    showScreen("title");
  });

  document.getElementById("btn-backup").addEventListener("click", () => {
    const json = JSON.stringify(saveData, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    a.href = url;
    a.download = `7metch_backup_${date}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  let restoreData = null;

  document.getElementById("btn-restore").addEventListener("click", () => {
    restoreData = null;
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
        restoreData = parsed;
        document.getElementById("btn-restore-exec").disabled = false;
      } catch {
        restoreData = null;
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
    if (!restoreData) return;
    if (restoreData.coins === undefined) {
      restoreData.coins = 0;
      for (const stars of Object.values(restoreData.bestStars)) {
        restoreData.coins += stars * 3;
      }
      for (const gate of STAR_GATES) {
        if (restoreData.cleared[gate.stage]) {
          restoreData.coins += 5;
        }
      }
    }
    saveData = restoreData;
    writeSave();
    document.getElementById("restore-modal").classList.add("hidden");
    alert("データを復元しました！");
  });

  document.getElementById("btn-feedback").addEventListener("click", () => {
    if (FEEDBACK_URL) {
      window.open(FEEDBACK_URL, "_blank");
    }
  });

  document.getElementById("btn-retry").addEventListener("click", () => {
    if (!confirm("リトライしますか？")) return;
    track("stage_retry", { stage: STAGES[currentStage].name });
    startStage(currentStage);
  });

  document.getElementById("btn-quit").addEventListener("click", () => {
    if (!confirm("タイトルに戻りますか？")) return;
    showScreen("title");
  });

  document.getElementById("btn-next").addEventListener("click", () => {
    const next = currentStage + 1;
    if (next >= STAGES.length || !isStageUnlocked(next)) {
      buildStageSelect();
      showScreen("stageSelect");
      return;
    }
    currentStage = next;
    startStage(currentStage);
  });

  document.getElementById("btn-result-retry").addEventListener("click", () => {
    track("stage_retry", { stage: STAGES[currentStage].name });
    startStage(currentStage);
  });

  document.getElementById("btn-result-stages").addEventListener("click", () => {
    buildStageSelect();
    showScreen("stageSelect");
  });

  function buildStageSelect() {
    const grid = document.getElementById("stage-grid");
    grid.innerHTML = "";
    const total = getTotalStars();

    document.getElementById("total-stars-display").innerHTML = `★ ${total}　<span style="color:#4ecdc4">🪙 ${saveData.coins || 0}</span>`;

    const lastClearedIdx = Object.keys(saveData.cleared)
      .map(Number)
      .reduce((max, n) => Math.max(max, n), -1);
    const visibleUpTo = lastClearedIdx + 6;

    let stopped = false;

    for (let i = 0; i < STAGES.length; i++) {
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

      if (i > visibleUpTo && !saveData.cleared[i]) break;

      const stg = STAGES[i];
      const btn = document.createElement("button");
      btn.className = "stage-btn";
      const unlocked = isStageUnlocked(i);
      if (!unlocked) btn.classList.add("locked");

      const stars = saveData.bestStars[i] || 0;
      btn.innerHTML = `<span>${stg.name}</span><span class="stage-stars">${"★".repeat(stars)}</span>`;

      if (unlocked) {
        btn.addEventListener("click", () => {
          currentStage = i;
          startStage(i);
        });
      }

      grid.appendChild(btn);
    }
  }

  function startStage(index) {
    const stg = STAGES[index];
    cols = stg.boardCols;
    rows = stg.boardRows;
    movesLeft = stg.moves;
    score = 0;
    totalCleared = 0;
    colorCleared = [];
    chainCount = 0;
    selected = null;
    animating = false;
    itemMode = null;
    coinsEarned = 0;
    canvas.classList.remove("item-targeting");

    resizeCanvas();
    initCellState(stg);
    createBoard(stg.colors);
    updateHUD();
    updateItemBar();
    drawBoard();
    showScreen("game");
    track("stage_start", { stage: stg.name, mission_type: stg.mission.type });
    startHintTimer();
  }

  function resizeCanvas() {
    const app = document.getElementById("app");
    const maxW = app.clientWidth - 16;
    const maxH = app.clientHeight - 140;

    cellSize = Math.min(Math.floor(maxW / cols), Math.floor(maxH / rows));
    cellSize = Math.max(cellSize, 28);

    boardPixelW = cols * cellSize;
    boardPixelH = rows * cellSize;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = boardPixelW * dpr;
    canvas.height = boardPixelH * dpr;
    canvas.style.width = boardPixelW + "px";
    canvas.style.height = boardPixelH + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildPieceCache();
    initBgStars();
  }

  window.addEventListener("resize", () => {
    if (screens.game.classList.contains("active")) {
      resizeCanvas();
      drawBoard();
    }
  });

  // --- Debug Mode ---
  let debugTapCount = 0;
  let debugTapTimer = null;
  let debugMode = false;

  document.getElementById("version-info").addEventListener("click", () => {
    debugTapCount++;
    clearTimeout(debugTapTimer);
    debugTapTimer = setTimeout(() => { debugTapCount = 0; }, 1500);
    if (debugTapCount >= 7) {
      debugTapCount = 0;
      debugMode = true;
      document.getElementById("debug-badge").classList.remove("hidden");
      document.getElementById("debug-panel").classList.remove("hidden");
      document.getElementById("btn-debug-open").classList.remove("hidden");
      updateItemBar();
    }
  });

  document.getElementById("btn-debug-jump").addEventListener("click", () => {
    const num = parseInt(document.getElementById("debug-stage-num").value, 10);
    if (num >= 1 && num <= STAGES.length) {
      currentStage = num - 1;
      document.getElementById("debug-panel").classList.add("hidden");
      startStage(currentStage);
    }
  });

  document.getElementById("btn-debug-unlock-all").addEventListener("click", () => {
    for (let i = 0; i < STAGES.length; i++) {
      saveData.cleared[i] = true;
      if (!saveData.bestStars[i]) saveData.bestStars[i] = 1;
    }
    writeSave();
    alert("全ステージを解放しました");
  });

  document.getElementById("btn-debug-reset").addEventListener("click", () => {
    if (confirm("セーブデータをリセットしますか？")) {
      saveData = { cleared: {}, bestStars: {}, coins: 0 };
      writeSave();
      alert("リセットしました");
    }
  });

  document.getElementById("btn-debug-close").addEventListener("click", () => {
    document.getElementById("debug-panel").classList.add("hidden");
  });

  // --- Item Buttons ---
  document.querySelectorAll(".item-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      if (animating || !screens.game.classList.contains("active")) return;
      const item = btn.dataset.item;
      const cost = ITEM_COSTS[item];
      if (!debugMode && (saveData.coins || 0) < cost) return;

      if (item !== "pinpoint" && itemMode === "pinpoint") {
        cancelItemMode();
      }

      switch (item) {
        case "pinpoint":
          if (itemMode === "pinpoint") {
            cancelItemMode();
          } else {
            itemMode = "pinpoint";
            canvas.classList.add("item-targeting");
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
    if (!debugMode && (saveData.coins || 0) < ITEM_COSTS.addmoves) return;
    if (!debugMode) { saveData.coins -= ITEM_COSTS.addmoves; writeSave(); }
    movesLeft += 3;
    updateHUD();
    updateItemBar();
    showScreen("game");
    track("item_rescue", { stage: STAGES[currentStage].name, coins_remaining: saveData.coins });
  });

  // --- Special Piece Spawner ---
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
    if (debugSpawnType && SPAWN_LABELS[debugSpawnType]) {
      el.textContent = `スポナーON: ${SPAWN_LABELS[debugSpawnType]}（盤面タップで設置）`;
      el.classList.remove("hidden");
    } else {
      el.classList.add("hidden");
    }
  }

  document.querySelectorAll(".btn-spawn").forEach(btn => {
    btn.addEventListener("click", () => {
      const type = btn.dataset.spawn;
      document.querySelectorAll(".btn-spawn").forEach(b => b.classList.remove("active"));
      if (type === "off" || debugSpawnType === type) {
        debugSpawnType = null;
      } else {
        debugSpawnType = type;
        btn.classList.add("active");
      }
      document.getElementById("debug-panel").classList.add("hidden");
      updateSpawnIndicator();
    });
  });

  document.getElementById("btn-debug-open").addEventListener("click", () => {
    document.getElementById("debug-panel").classList.remove("hidden");
  });

  showScreen("title");
})();
