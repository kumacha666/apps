(function () {
  "use strict";

  let cols = 7;
  let rows = 8;
  const PIECE_COLORS = ["#e94560", "#4ecdc4", "#ffe66d", "#7b68ee", "#ff8a5c", "#3a86ff", "#ff6bb3", "#88cc44"];
  const PIECE_SHAPES = ["circle", "diamond", "square", "triangle", "star", "hex", "cross", "octagon"];
  const PIECE_NAMES_JA = ["まる", "ダイヤ", "しかく", "さんかく", "ほし", "ヘキサ", "クロス", "オクタ"];
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
    { stage: 75, stars: 150 },
    { stage: 100, stars: 200 },
    { stage: 150, stars: 300 },
  ];

  // --- Stages ---
  const BOARD_SIZES = [
    { cols: 6,  rows: 7,  label: "6×7" },
    { cols: 7,  rows: 8,  label: "7×8" },
    { cols: 8,  rows: 9,  label: "8×9" },
    { cols: 9,  rows: 10, label: "9×10" },
    { cols: 10, rows: 11, label: "10×11" },
    { cols: 11, rows: 12, label: "11×12" },
  ];

  const STAGES = buildStages();

  // --- Tracking ---
  const GA_MEASUREMENT_ID = "";
  const GAS_ENDPOINT = "";
  const FEEDBACK_URL = "";

  function getAnonId() {
    let id = localStorage.getItem("7metch_dev_uid");
    if (!id) {
      id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem("7metch_dev_uid", id);
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

  const SFX = {
    swap() {
      playTone(520, 0.08, "sine", 0.12);
      playTone(660, 0.08, "sine", 0.10, 0.04);
    },
    invalidSwap() {
      playTone(200, 0.15, "square", 0.08);
      playTone(160, 0.15, "square", 0.08, 0.1);
    },
    clear(chain) {
      const base = 440 + Math.min(chain - 1, 6) * 80;
      playTone(base, 0.12, "sine", 0.13);
      playTone(base * 1.25, 0.1, "sine", 0.10, 0.06);
      playTone(base * 1.5, 0.08, "sine", 0.08, 0.12);
    },
    bomb() {
      playTone(150, 0.15, "sawtooth", 0.12);
      playTone(100, 0.3, "sawtooth", 0.18);
      playTone(60, 0.45, "sine", 0.20, 0.05);
      playTone(40, 0.3, "sine", 0.10, 0.15);
      playTone(200, 0.08, "square", 0.06, 0.02);
    },
    line() {
      playTone(600, 0.06, "sawtooth", 0.10);
      playTone(900, 0.06, "sawtooth", 0.09, 0.03);
      playTone(1200, 0.06, "sawtooth", 0.08, 0.06);
      playTone(1600, 0.06, "sawtooth", 0.07, 0.09);
      playTone(2000, 0.08, "sine", 0.05, 0.12);
    },
    rainbow() {
      const notes = [523, 659, 784, 988, 1175, 1397, 1568];
      notes.forEach((f, i) => {
        playTone(f, 0.18, "sine", 0.12, i * 0.04);
        playTone(f * 0.5, 0.15, "triangle", 0.06, i * 0.04);
      });
      playTone(1568, 0.4, "sine", 0.08, 0.28);
      playTone(2093, 0.3, "sine", 0.06, 0.32);
    },
    combo() {
      playTone(200, 0.12, "sawtooth", 0.10);
      playTone(350, 0.10, "sine", 0.12, 0.05);
      playTone(500, 0.10, "sine", 0.14, 0.10);
      playTone(700, 0.10, "sine", 0.14, 0.15);
      playTone(900, 0.12, "sine", 0.12, 0.20);
      playTone(1200, 0.15, "sine", 0.10, 0.25);
      playTone(300, 0.3, "triangle", 0.06, 0.08);
    },
    stageClear() {
      const notes = [523, 659, 784, 1047];
      notes.forEach((f, i) => {
        playTone(f, 0.25, "sine", 0.12, i * 0.12);
        playTone(f * 0.5, 0.25, "triangle", 0.06, i * 0.12);
      });
    },
    stageFail() {
      playTone(400, 0.2, "sine", 0.10);
      playTone(320, 0.2, "sine", 0.10, 0.15);
      playTone(250, 0.35, "sine", 0.08, 0.30);
    },
    drop() {
      playTone(300, 0.06, "sine", 0.05);
    },
    countdown() {
      playTone(880, 0.05, "square", 0.08);
      playTone(660, 0.08, "square", 0.06, 0.05);
    },
    iceCrack() {
      playTone(1200, 0.04, "square", 0.06);
      playTone(900, 0.06, "square", 0.05, 0.03);
    },
  };

  const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d");

  let cellSize = 48;
  let boardPixelW, boardPixelH;
  let board = [];
  let cellState = [];
  let selected = null;
  let animating = false;
  let currentStage = 0;
  let movesLeft = 0;
  let mission = {};
  let missionProgress = {};
  let saveData = loadSave();

  const screens = {
    title: document.getElementById("screen-title"),
    stageSelect: document.getElementById("screen-stage-select"),
    help: document.getElementById("screen-help"),
    game: document.getElementById("screen-game"),
    result: document.getElementById("screen-result"),
  };

  function showScreen(name) {
    Object.values(screens).forEach((s) => s.classList.remove("active"));
    screens[name].classList.add("active");
  }

  // --- Save / Load ---
  function loadSave() {
    try {
      const d = JSON.parse(localStorage.getItem("7metch_dev_save"));
      return d || { cleared: {}, bestStars: {} };
    } catch {
      return { cleared: {}, bestStars: {} };
    }
  }

  function writeSave() {
    localStorage.setItem("7metch_dev_save", JSON.stringify(saveData));
  }

  function getTotalStars() {
    return Object.values(saveData.bestStars).reduce((sum, s) => sum + s, 0);
  }

  function isStageUnlocked() {
    return true;
  }

  function getGateFor(i) {
    return STAR_GATES.find((g) => g.stage === i) || null;
  }

  function buildStages() {
    const stages = [];
    for (let si = 0; si < BOARD_SIZES.length; si++) {
      const size = BOARD_SIZES[si];
      const baseColors = Math.min(7, 5 + si);
      for (let j = 0; j < 5; j++) {
        const idx = si * 5 + j;
        const moves = 20;
        const area = size.cols * size.rows;
        const areaFactor = area / 56;
        let missionDef;
        if (j === 0) {
          missionDef = { type: "score", target: Math.floor(moves * 60 * areaFactor) };
        } else if (j === 1) {
          missionDef = { type: "clear", count: Math.floor(moves * 4 * areaFactor) };
        } else if (j === 2) {
          missionDef = { type: "color", colorIndex: 0, count: Math.floor(moves * 0.6 * areaFactor) };
        } else if (j === 3) {
          missionDef = { type: "score", target: Math.floor(moves * 100 * areaFactor) };
        } else {
          missionDef = { type: "clear", count: Math.floor(moves * 6 * areaFactor) };
        }

        const features = {};
        let colors = baseColors;

        // Feature assignments per group
        if (si >= 1) features.diagonalLine = true;
        if (si >= 2) features.ice = true;
        if (si >= 3) {
          features.rock = true;
          colors = 8;
        }
        if (si >= 4) features.holes = true;
        if (si >= 5) features.countdownBomb = true;

        // Ice cell count scales with stage
        let iceCells = 0;
        if (features.ice) {
          iceCells = 2 + j;
        }

        // Rock cell count
        let rockCells = 0;
        if (features.rock) {
          rockCells = 1 + Math.floor(j / 2);
        }

        // Hole pattern
        let holePattern = null;
        if (features.holes) {
          holePattern = generateHolePattern(size.cols, size.rows, j);
        }

        // Countdown bomb count
        let countdownBombs = 0;
        if (features.countdownBomb) {
          countdownBombs = 1 + Math.floor(j / 2);
        }

        stages.push({
          name: `${size.label}-${j + 1}`,
          moves,
          colors,
          boardCols: size.cols,
          boardRows: size.rows,
          mission: missionDef,
          star2moves: Math.floor(moves * 0.6),
          star3moves: Math.floor(moves * 0.35),
          features,
          iceCells,
          rockCells,
          holePattern,
          countdownBombs,
        });
      }
    }
    return stages;
  }

  function generateHolePattern(c, r, variant) {
    const holes = [];
    switch (variant) {
      case 0:
        // Corner holes
        holes.push([0,0],[0,1],[1,0]);
        holes.push([0,c-1],[0,c-2],[1,c-1]);
        holes.push([r-1,0],[r-1,1],[r-2,0]);
        holes.push([r-1,c-1],[r-1,c-2],[r-2,c-1]);
        break;
      case 1:
        // Diamond cutout center
        for (let rr = 0; rr < r; rr++) {
          for (let cc = 0; cc < c; cc++) {
            const dr = Math.abs(rr - Math.floor(r/2));
            const dc = Math.abs(cc - Math.floor(c/2));
            if (dr + dc <= 1 && !(dr === 0 && dc === 0)) holes.push([rr, cc]);
          }
        }
        break;
      case 2:
        // Checkerboard corners
        holes.push([0,0],[0,c-1],[r-1,0],[r-1,c-1]);
        holes.push([0, Math.floor(c/2)]);
        holes.push([r-1, Math.floor(c/2)]);
        break;
      case 3:
        // L-shape cutout (top-right)
        for (let rr = 0; rr < 3; rr++) {
          for (let cc = c-3; cc < c; cc++) {
            if (rr === 0 || cc === c-1) continue;
            holes.push([rr, cc]);
          }
        }
        break;
      case 4:
        // Border scatter
        holes.push([0,0],[0,c-1],[r-1,0],[r-1,c-1]);
        holes.push([0,Math.floor(c/2)],[r-1,Math.floor(c/2)]);
        holes.push([Math.floor(r/2),0],[Math.floor(r/2),c-1]);
        break;
    }
    return holes;
  }

  function getMissionText(m, html) {
    switch (m.type) {
      case "score": return `${m.target}点 とろう`;
      case "clear": return `${m.count}個 けそう`;
      case "color":
        if (html) {
          return `<span style="color:${PIECE_COLORS[m.colorIndex]};font-weight:900">${PIECE_NAMES_JA[m.colorIndex]}</span>を${m.count}個けそう`;
        }
        return `${PIECE_NAMES_JA[m.colorIndex]}を${m.count}個けそう`;
    }
  }

  // --- Cell State ---
  // cellState[r][c]: null = normal, "hole" = permanently empty, "rock" = immovable blocker,
  //                  "ice1" = ice (1 hit left), "ice2" = ice (2 hits left)

  function initCellState(stg) {
    cellState = [];
    for (let r = 0; r < rows; r++) {
      cellState[r] = [];
      for (let c = 0; c < cols; c++) {
        cellState[r][c] = null;
      }
    }

    // Place holes
    if (stg.holePattern) {
      for (const [hr, hc] of stg.holePattern) {
        if (hr >= 0 && hr < rows && hc >= 0 && hc < cols) {
          cellState[hr][hc] = "hole";
        }
      }
    }

    // Place rocks (random positions, avoiding holes and edges for playability)
    if (stg.rockCells > 0) {
      let placed = 0;
      let attempts = 0;
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

    // Place ice (random positions on normal cells)
    if (stg.iceCells > 0) {
      let placed = 0;
      let attempts = 0;
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

  function isPlayable(r, c) {
    return cellState[r][c] !== "hole" && cellState[r][c] !== "rock";
  }

  function isHole(r, c) {
    return cellState[r][c] === "hole";
  }

  function isRock(r, c) {
    return cellState[r][c] === "rock";
  }

  function isIce(r, c) {
    return cellState[r][c] === "ice1" || cellState[r][c] === "ice2";
  }

  function damageIce(r, c) {
    if (cellState[r][c] === "ice2") {
      cellState[r][c] = "ice1";
      SFX.iceCrack();
      return false;
    }
    if (cellState[r][c] === "ice1") {
      cellState[r][c] = null;
      SFX.iceCrack();
      return true;
    }
    return true;
  }

  // --- Board ---
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
    while (findAllMatches().length > 0) {
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (isHole(r, c) || isRock(r, c)) continue;
          board[r][c] = randomPiece(numColors);
        }
      }
    }

    // Place countdown bombs after initial board is match-free
    const stg = STAGES[currentStage];
    if (stg.countdownBombs > 0) {
      let placed = 0;
      let attempts = 0;
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
    const directions = [
      [0, 1],
      [1, 0],
    ];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!board[r][c]) continue;
        if (isHole(r, c) || isRock(r, c)) continue;
        const color = board[r][c].color;

        for (const [dr, dc] of directions) {
          const line = [[r, c]];
          let nr = r + dr;
          let nc = c + dc;
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

    // 2×2 square match (diagonal line feature)
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
          if (allMatch) {
            cells.forEach(([cr, cc]) => matched.add(cr * cols + cc));
          }
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

    // 2×2 square match → diagonal line piece
    if (stg.features && stg.features.diagonalLine) {
      for (let r = 0; r < rows - 1; r++) {
        for (let c = 0; c < cols - 1; c++) {
          if (!board[r][c] || isHole(r, c) || isRock(r, c)) continue;
          const color = board[r][c].color;
          const cells = [[r,c],[r,c+1],[r+1,c],[r+1,c+1]];
          const allMatch = cells.every(([cr, cc]) =>
            board[cr][cc] && !isHole(cr, cc) && !isRock(cr, cc) &&
            board[cr][cc].color === color && matchSet.has(cr * cols + cc)
          );
          if (!allMatch) continue;
          const allFree = cells.every(([cr, cc]) => !usedCells.has(cr * cols + cc));
          if (!allFree) continue;
          // Place diagonal line at top-left of the 2×2
          const key = r * cols + c;
          specials.push({ r, c, type: "line_d", color });
          cells.forEach(([cr, cc]) => usedCells.add(cr * cols + cc));
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

    return specials;
  }

  // --- Special Piece Activation ---
  function activateSpecial(r, c, alreadyCleared) {
    const piece = board[r][c];
    if (!piece || !piece.special) return [];
    const extra = [];
    const key = (r2, c2) => r2 * cols + c2;

    if (piece.special === "line_h") {
      for (let cc = 0; cc < cols; cc++) {
        if (!alreadyCleared.has(key(r, cc)) && board[r][cc] && isPlayable(r, cc)) {
          extra.push([r, cc]);
        }
      }
    } else if (piece.special === "line_v") {
      for (let rr = 0; rr < rows; rr++) {
        if (!alreadyCleared.has(key(rr, c)) && board[rr][c] && isPlayable(rr, c)) {
          extra.push([rr, c]);
        }
      }
    } else if (piece.special === "line_d") {
      // Diagonal line: clears both diagonals through this cell
      for (let d = -Math.max(rows, cols); d <= Math.max(rows, cols); d++) {
        // top-left to bottom-right
        const r1 = r + d, c1 = c + d;
        if (inBounds(r1, c1) && !alreadyCleared.has(key(r1, c1)) && board[r1][c1] && isPlayable(r1, c1)) {
          extra.push([r1, c1]);
        }
        // top-right to bottom-left
        const r2 = r + d, c2 = c - d;
        if (inBounds(r2, c2) && !alreadyCleared.has(key(r2, c2)) && board[r2][c2] && isPlayable(r2, c2)) {
          extra.push([r2, c2]);
        }
      }
    } else if (piece.special === "bomb") {
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const nr = r + dr;
          const nc = c + dc;
          if (inBounds(nr, nc) && !alreadyCleared.has(key(nr, nc)) && board[nr][nc] && isPlayable(nr, nc)) {
            extra.push([nr, nc]);
          }
        }
      }
    } else if (piece.special === "rainbow") {
      const targetColor = piece.color;
      for (let rr = 0; rr < rows; rr++) {
        for (let cc = 0; cc < cols; cc++) {
          if (board[rr][cc] && board[rr][cc].color === targetColor && !alreadyCleared.has(key(rr, cc)) && isPlayable(rr, cc)) {
            extra.push([rr, cc]);
          }
        }
      }
    } else if (piece.special === "countdown") {
      // Countdown bomb explodes like a regular bomb
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const nr = r + dr;
          const nc = c + dc;
          if (inBounds(nr, nc) && !alreadyCleared.has(key(nr, nc)) && board[nr][nc] && isPlayable(nr, nc)) {
            extra.push([nr, nc]);
          }
        }
      }
    }
    return extra;
  }

  // --- Countdown Bomb Logic ---
  function tickCountdowns() {
    const exploded = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (board[r][c] && board[r][c].special === "countdown") {
          board[r][c].countdown--;
          if (board[r][c].countdown <= 0) {
            exploded.push([r, c]);
          }
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
      const extra = activateSpecial(r, c, cleared);
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

    const fallMap = applyGravityData();
    await animateDrop(fallMap);
    await sleep(ANIM.CHAIN_PAUSE_MS);

    await resolveBoard();
  }

  // --- Gravity & Fill ---
  function applyGravityData() {
    const numColors = STAGES[currentStage].colors;
    const fallMap = [];

    for (let c = 0; c < cols; c++) {
      let writeRow = rows - 1;
      // Skip holes/rocks from bottom
      while (writeRow >= 0 && (isHole(writeRow, c) || isRock(writeRow, c))) {
        writeRow--;
      }

      for (let r = writeRow; r >= 0; r--) {
        if (isHole(r, c) || isRock(r, c)) continue;
        if (board[r][c]) {
          if (r !== writeRow) {
            board[writeRow][c] = board[r][c];
            board[r][c] = null;
            fallMap.push({ c, fromR: r, toR: writeRow, piece: board[writeRow][c] });
          }
          // Find next writable row
          writeRow--;
          while (writeRow >= 0 && (isHole(writeRow, c) || isRock(writeRow, c))) {
            writeRow--;
          }
        }
      }

      // Fill empty cells from top
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
        // Cross + both diagonals
        for (let cc = 0; cc < cols; cc++) {
          if (board[r][cc] && isPlayable(r, cc)) extra.push([r, cc]);
        }
        for (let rr = 0; rr < rows; rr++) {
          if (board[rr][c] && isPlayable(rr, c)) extra.push([rr, c]);
        }
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
    if (!isPlayable(r1, c1) || !isPlayable(r2, c2)) return;
    if (!board[r1][c1] || !board[r2][c2]) return;
    animating = true;

    const p1 = board[r1][c1];
    const p2 = board[r2][c2];

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

        const cleared = new Set(comboCells.map(([r, c]) => r * cols + c));
        comboCells.forEach(([cr, cc]) => {
          if (board[cr][cc] && board[cr][cc].special && !(cr === r1 && cc === c1) && !(cr === r2 && cc === c2)) {
            const extra = activateSpecial(cr, cc, cleared);
            extra.forEach(([er, ec]) => {
              if (!cleared.has(er * cols + ec)) {
                cleared.add(er * cols + ec);
                comboCells.push([er, ec]);
              }
            });
          }
        });

        const clearList = [...cleared].map((v) => [Math.floor(v / cols), v % cols]);
        // Damage ice on adjacent cells
        damageAdjacentIce(clearList);

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

        const fallMap = applyGravityData();
        await animateDrop(fallMap);
        await sleep(ANIM.CHAIN_PAUSE_MS);

        await resolveBoard();

        // Tick countdowns after move
        const exploded = tickCountdowns();
        if (exploded.length > 0) {
          SFX.countdown();
          await handleCountdownExplosions(exploded);
        }

        updateHUD();
        checkWinLose();
        animating = false;
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
      return;
    }

    movesLeft--;
    chainCount = 0;
    updateHUD();

    await resolveBoard();

    // Tick countdowns after move
    const exploded = tickCountdowns();
    if (exploded.length > 0) {
      SFX.countdown();
      await handleCountdownExplosions(exploded);
    }

    updateHUD();
    checkWinLose();
    animating = false;
  }

  function damageAdjacentIce(clearList) {
    const iceSet = new Set();
    for (const [r, c] of clearList) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr, nc = c + dc;
          if (inBounds(nr, nc) && isIce(nr, nc)) {
            iceSet.add(nr * cols + nc);
          }
        }
      }
    }
    for (const key of iceSet) {
      const ir = Math.floor(key / cols);
      const ic = key % cols;
      damageIce(ir, ic);
    }
  }

  async function resolveBoard() {
    let matches = findAllMatches();
    while (matches.length > 0) {
      chainCount++;
      const specials = findSpecialCreations(matches);

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
              const extra2 = activateSpecial(er, ec, cleared);
              extra2.forEach(([er2, ec2]) => cleared.add(er2 * cols + ec2));
            }
          });
        }
      });

      const clearList = [...cleared].map((v) => [Math.floor(v / cols), v % cols]);

      // Damage ice adjacent to cleared cells
      damageAdjacentIce(clearList);

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
          if (board[r][c] && isPlayable(r, c)) {
            drawPieceAt(board[r][c], c * cellSize + cellSize / 2, r * cellSize + cellSize / 2);
          }
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
          if (board[r][c] && isPlayable(r, c)) {
            drawPieceAt(board[r][c], c * cellSize + cellSize / 2, r * cellSize + cellSize / 2);
          }
        }
      }

      ctx.save();

      pieceSnapshots.forEach((snap, idx) => {
        const x = snap.c * cellSize + cellSize / 2;
        const y = snap.r * cellSize + cellSize / 2;
        const baseR = cellSize / 2 - 2;

        if (t < 0.3) {
          const fadeT = t / 0.3;
          ctx.globalAlpha = 1 - fadeT * 0.3;
          if (snap.piece) drawPieceAt(snap.piece, x, y);
          ctx.globalAlpha = 0.8 * (1 - fadeT);
          ctx.fillStyle = "#fff";
          ctx.beginPath();
          ctx.arc(x, y, baseR * (1 + fadeT * 0.15), 0, Math.PI * 2);
          ctx.fill();
        }

        if (t >= 0.2) {
          const shrinkT = Math.min((t - 0.2) / 0.8, 1);
          const ease = 1 - (1 - shrinkT) * (1 - shrinkT);
          const scale = 1 - ease;
          const alpha = 1 - ease;

          ctx.globalAlpha = alpha;
          ctx.fillStyle = snap.color;
          ctx.beginPath();
          ctx.arc(x, y, baseR * scale, 0, Math.PI * 2);
          ctx.fill();

          const numParticles = 4;
          for (let p = 0; p < numParticles; p++) {
            const angle = (p / numParticles) * Math.PI * 2 + idx * 0.5;
            const dist = baseR * 0.5 + ease * cellSize * 0.6;
            const px = x + Math.cos(angle) * dist;
            const py = y + Math.sin(angle) * dist;
            const pSize = baseR * 0.2 * (1 - ease);
            ctx.globalAlpha = alpha * 0.8;
            ctx.fillStyle = snap.color;
            ctx.beginPath();
            ctx.arc(px, py, pSize, 0, Math.PI * 2);
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
          if (frozen[r][c] && isPlayable(r, c)) {
            drawPieceAt(frozen[r][c], c * cellSize + cellSize / 2, r * cellSize + cellSize / 2);
          }
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
    ctx.fillStyle = "#16213e";
    ctx.fillRect(0, 0, boardPixelW, boardPixelH);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * cellSize;
        const y = r * cellSize;

        if (isHole(r, c)) {
          ctx.fillStyle = "#0d1117";
          ctx.fillRect(x, y, cellSize, cellSize);
          continue;
        }

        if (isRock(r, c)) {
          ctx.fillStyle = "#2a2a3a";
          ctx.fillRect(x, y, cellSize, cellSize);
          // Draw rock texture
          ctx.save();
          ctx.fillStyle = "#3a3a4a";
          const cx = x + cellSize / 2;
          const cy = y + cellSize / 2;
          const rr = cellSize / 2 - 4;
          ctx.beginPath();
          ctx.arc(cx, cy, rr, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#555";
          ctx.lineWidth = 2;
          ctx.stroke();
          // X mark
          ctx.strokeStyle = "#666";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(cx - rr * 0.4, cy - rr * 0.4);
          ctx.lineTo(cx + rr * 0.4, cy + rr * 0.4);
          ctx.moveTo(cx + rr * 0.4, cy - rr * 0.4);
          ctx.lineTo(cx - rr * 0.4, cy + rr * 0.4);
          ctx.stroke();
          ctx.restore();
          continue;
        }

        ctx.fillStyle = (r + c) % 2 === 0 ? "#1a2744" : "#1e2d50";
        ctx.fillRect(x, y, cellSize, cellSize);

        // Ice overlay
        if (isIce(r, c)) {
          ctx.save();
          const iceAlpha = cellState[r][c] === "ice2" ? 0.35 : 0.2;
          ctx.fillStyle = `rgba(100, 200, 255, ${iceAlpha})`;
          ctx.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
          ctx.strokeStyle = `rgba(150, 220, 255, ${iceAlpha + 0.15})`;
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 2, y + 2, cellSize - 4, cellSize - 4);
          // Ice crystal lines
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
      }
    }
  }

  function drawPieceAt(piece, cx, cy) {
    if (!piece) return;
    const radius = cellSize / 2 - 4;

    ctx.fillStyle = PIECE_COLORS[piece.color];
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1;

    drawShape(ctx, PIECE_SHAPES[piece.color], cx, cy, radius);

    if (piece.special) {
      drawSpecialIndicator(ctx, piece.special, cx, cy, radius, piece);
    }
  }

  function drawBoard(overlay) {
    drawBoardBase();

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!isPlayable(r, c)) continue;
        const piece = board[r][c];
        if (!piece) continue;

        const cx = c * cellSize + cellSize / 2;
        const cy = r * cellSize + cellSize / 2;

        drawPieceAt(piece, cx, cy);

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

  function drawShape(ctx, shape, cx, cy, r) {
    ctx.beginPath();
    switch (shape) {
      case "circle":
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        break;
      case "diamond":
        ctx.moveTo(cx, cy - r);
        ctx.lineTo(cx + r, cy);
        ctx.lineTo(cx, cy + r);
        ctx.lineTo(cx - r, cy);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;
      case "square":
        ctx.rect(cx - r * 0.75, cy - r * 0.75, r * 1.5, r * 1.5);
        ctx.fill();
        ctx.stroke();
        break;
      case "triangle":
        ctx.moveTo(cx, cy - r);
        ctx.lineTo(cx + r * 0.87, cy + r * 0.5);
        ctx.lineTo(cx - r * 0.87, cy + r * 0.5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;
      case "star": {
        const spikes = 5;
        const outerR = r;
        const innerR = r * 0.45;
        ctx.moveTo(cx, cy - outerR);
        for (let i = 0; i < spikes; i++) {
          const angle1 = (i * 2 * Math.PI) / spikes - Math.PI / 2;
          const angle2 = angle1 + Math.PI / spikes;
          ctx.lineTo(cx + Math.cos(angle1) * outerR, cy + Math.sin(angle1) * outerR);
          ctx.lineTo(cx + Math.cos(angle2) * innerR, cy + Math.sin(angle2) * innerR);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;
      }
      case "hex": {
        for (let i = 0; i < 6; i++) {
          const angle = (i * Math.PI) / 3 - Math.PI / 6;
          const px = cx + r * Math.cos(angle);
          const py = cy + r * Math.sin(angle);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;
      }
      case "cross": {
        const w = r * 0.38;
        ctx.moveTo(cx - w, cy - r);
        ctx.lineTo(cx + w, cy - r);
        ctx.lineTo(cx + w, cy - w);
        ctx.lineTo(cx + r, cy - w);
        ctx.lineTo(cx + r, cy + w);
        ctx.lineTo(cx + w, cy + w);
        ctx.lineTo(cx + w, cy + r);
        ctx.lineTo(cx - w, cy + r);
        ctx.lineTo(cx - w, cy + w);
        ctx.lineTo(cx - r, cy + w);
        ctx.lineTo(cx - r, cy - w);
        ctx.lineTo(cx - w, cy - w);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;
      }
      case "octagon": {
        const s = r * 0.92;
        const cut = s * 0.38;
        ctx.moveTo(cx - cut, cy - s);
        ctx.lineTo(cx + cut, cy - s);
        ctx.lineTo(cx + s, cy - cut);
        ctx.lineTo(cx + s, cy + cut);
        ctx.lineTo(cx + cut, cy + s);
        ctx.lineTo(cx - cut, cy + s);
        ctx.lineTo(cx - s, cy + cut);
        ctx.lineTo(cx - s, cy - cut);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;
      }
    }
  }

  function drawSpecialIndicator(ctx, type, cx, cy, r, piece) {
    ctx.save();
    const s = r * 0.55;
    ctx.lineCap = "round";

    // dark backdrop for contrast
    ctx.beginPath();
    ctx.arc(cx, cy, s + 2, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fill();

    switch (type) {
      case "line_h": {
        ctx.lineWidth = 3;
        ctx.strokeStyle = "#fff";
        ctx.beginPath();
        ctx.moveTo(cx - s, cy);
        ctx.lineTo(cx + s, cy);
        ctx.stroke();
        const a = s * 0.4;
        ctx.beginPath();
        ctx.moveTo(cx - s + a, cy - a);
        ctx.lineTo(cx - s, cy);
        ctx.lineTo(cx - s + a, cy + a);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx + s - a, cy - a);
        ctx.lineTo(cx + s, cy);
        ctx.lineTo(cx + s - a, cy + a);
        ctx.stroke();
        break;
      }
      case "line_v": {
        ctx.lineWidth = 3;
        ctx.strokeStyle = "#fff";
        ctx.beginPath();
        ctx.moveTo(cx, cy - s);
        ctx.lineTo(cx, cy + s);
        ctx.stroke();
        const a = s * 0.4;
        ctx.beginPath();
        ctx.moveTo(cx - a, cy - s + a);
        ctx.lineTo(cx, cy - s);
        ctx.lineTo(cx + a, cy - s + a);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx - a, cy + s - a);
        ctx.lineTo(cx, cy + s);
        ctx.lineTo(cx + a, cy + s - a);
        ctx.stroke();
        break;
      }
      case "line_d": {
        ctx.lineWidth = 3;
        ctx.strokeStyle = "#ffd700";
        const ds = s * 0.75;
        // Draw X-shaped diagonal lines
        ctx.beginPath();
        ctx.moveTo(cx - ds, cy - ds);
        ctx.lineTo(cx + ds, cy + ds);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx + ds, cy - ds);
        ctx.lineTo(cx - ds, cy + ds);
        ctx.stroke();
        // Small arrows at ends
        const a = s * 0.25;
        ctx.lineWidth = 2;
        // top-left arrow
        ctx.beginPath();
        ctx.moveTo(cx - ds + a, cy - ds);
        ctx.lineTo(cx - ds, cy - ds);
        ctx.lineTo(cx - ds, cy - ds + a);
        ctx.stroke();
        // bottom-right arrow
        ctx.beginPath();
        ctx.moveTo(cx + ds - a, cy + ds);
        ctx.lineTo(cx + ds, cy + ds);
        ctx.lineTo(cx + ds, cy + ds - a);
        ctx.stroke();
        break;
      }
      case "bomb": {
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        [s * 0.65, s * 0.35].forEach((rad) => {
          ctx.beginPath();
          ctx.arc(cx, cy, rad, 0, Math.PI * 2);
          ctx.stroke();
        });
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(cx, cy, s * 0.12, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "rainbow": {
        const colors = ["#ff4444", "#ffaa00", "#44ff44", "#4488ff"];
        const innerR = s * 0.2;
        const outerR = s * 0.75;
        for (let i = 0; i < 4; i++) {
          const angle = (i / 4) * Math.PI * 2 - Math.PI / 4;
          const x1 = cx + Math.cos(angle) * innerR;
          const y1 = cy + Math.sin(angle) * innerR;
          const x2 = cx + Math.cos(angle) * outerR;
          const y2 = cy + Math.sin(angle) * outerR;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.strokeStyle = colors[i];
          ctx.lineWidth = 3;
          ctx.stroke();
        }
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "countdown": {
        // Draw countdown number with warning color
        const count = piece ? piece.countdown : 0;
        const urgency = count <= 3;
        ctx.fillStyle = urgency ? "#ff4444" : "#ffd700";
        ctx.font = `bold ${s * 1.3}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(count.toString(), cx, cy);
        // Pulsing ring for urgency
        if (urgency) {
          ctx.strokeStyle = "#ff4444";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(cx, cy, s * 0.8, 0, Math.PI * 2);
          ctx.stroke();
        }
        break;
      }
    }
    ctx.restore();
  }

  // --- HUD ---
  function updateHUD() {
    const stg = STAGES[currentStage];
    document.getElementById("hud-stage").textContent = `Stage ${stg.name}`;
    document.getElementById("hud-moves").textContent = `のこり ${movesLeft} 手`;

    // Show active features
    const featureTags = [];
    if (stg.features.diagonalLine) featureTags.push("斜");
    if (stg.features.ice) featureTags.push("氷");
    if (stg.features.rock) featureTags.push("岩");
    if (stg.features.holes) featureTags.push("穴");
    if (stg.features.countdownBomb) featureTags.push("💣");
    const featureStr = featureTags.length > 0 ? ` [${featureTags.join("")}]` : "";
    document.getElementById("hud-stage").textContent = `Stage ${stg.name}${featureStr}`;

    const m = stg.mission;
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
      if (stars > prev) saveData.bestStars[currentStage] = stars;
      saveData.cleared[currentStage] = true;
      writeSave();

      SFX.stageClear();
      track("stage_clear", { stage: stg.name, stars, moves_used: usedMoves, moves_total: stg.moves, mission_type: stg.mission.type });
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
    document.getElementById("result-details").textContent = `スコア: ${score}`;

    const nextBtn = document.getElementById("btn-next");
    nextBtn.style.display = win && currentStage < STAGES.length - 1 ? "" : "none";

    showScreen("result");
  }

  // --- Input ---
  function getCell(px, py) {
    const rect = canvas.getBoundingClientRect();
    const x = px - rect.left;
    const y = py - rect.top;
    const c = Math.floor(x / cellSize);
    const r = Math.floor(y / cellSize);
    if (inBounds(r, c) && isPlayable(r, c)) return { r, c };
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
    const cell = getCell(e.clientX, e.clientY);
    if (!cell) return;

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
    if (!inBounds(targetR, targetC) || !isPlayable(targetR, targetC)) return;

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

  document.getElementById("btn-check-update").addEventListener("click", async () => {
    const btn = document.getElementById("btn-check-update");
    const original = btn.textContent;
    btn.textContent = "確認中…";
    btn.disabled = true;
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) { btn.textContent = "SW未登録"; setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 2000); return; }
      await reg.update();
      const waiting = reg.waiting || reg.installing;
      if (waiting) {
        btn.textContent = "更新あり！再読込します…";
        waiting.addEventListener("statechange", () => {
          if (waiting.state === "activated") location.reload();
        });
        if (waiting.state === "activated") location.reload();
        setTimeout(() => location.reload(), 3000);
      } else {
        btn.textContent = "✓ 最新です";
        setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 2000);
      }
    } catch {
      btn.textContent = "確認失敗";
      setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 2000);
    }
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
    saveData = restoreData;
    writeSave();
    document.getElementById("restore-modal").classList.add("hidden");
    alert("データを復元しました！");
  });


  document.getElementById("btn-retry").addEventListener("click", () => {
    track("stage_retry", { stage: STAGES[currentStage].name });
    startStage(currentStage);
  });

  document.getElementById("btn-quit").addEventListener("click", () => {
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

    document.getElementById("total-stars-display").textContent = `★ ${total}`;

    const lastClearedIdx = Object.keys(saveData.cleared)
      .map(Number)
      .reduce((max, n) => Math.max(max, n), -1);
    const visibleUpTo = lastClearedIdx + 6;

    let prevSize = "";

    for (let i = 0; i < STAGES.length; i++) {
      const stg = STAGES[i];
      const sizeLabel = `${stg.boardCols}×${stg.boardRows}`;

      if (sizeLabel !== prevSize) {
        const header = document.createElement("div");
        header.className = "stage-gate";
        // Show features for this group
        const featureLabels = [];
        if (stg.features.diagonalLine) featureLabels.push("ナナメライン");
        if (stg.features.ice) featureLabels.push("氷");
        if (stg.features.rock) featureLabels.push("岩");
        if (stg.features.holes) featureLabels.push("穴あき");
        if (stg.features.countdownBomb) featureLabels.push("カウントダウン💣");
        if (stg.colors >= 8) featureLabels.push("8色");
        const featureStr = featureLabels.length > 0 ? ` — ${featureLabels.join("・")}` : "";
        header.textContent = `${sizeLabel}${featureStr}`;
        grid.appendChild(header);
        prevSize = sizeLabel;
      }

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

    initCellState(stg);
    resizeCanvas();
    createBoard(stg.colors);
    updateHUD();
    drawBoard();
    showScreen("game");
    track("stage_start", { stage: stg.name, mission_type: stg.mission.type });
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
      saveData = { cleared: {}, bestStars: {} };
      writeSave();
      alert("リセットしました");
    }
  });

  document.getElementById("btn-debug-close").addEventListener("click", () => {
    document.getElementById("debug-panel").classList.add("hidden");
  });

  showScreen("title");
})();
