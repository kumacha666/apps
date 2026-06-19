(function () {
  "use strict";

  const COLS = 7;
  const ROWS = 8;
  const PIECE_COLORS = ["#e94560", "#4ecdc4", "#ffe66d", "#7b68ee", "#ff8a5c", "#3a86ff", "#ff6bb3"];
  const PIECE_SHAPES = ["circle", "diamond", "square", "triangle", "star", "hex", "cross"];
  const PIECE_NAMES_JA = ["まる", "ダイヤ", "しかく", "さんかく", "ほし", "ヘキサ", "クロス"];
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
  ];

  const STAGES = buildStages();

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
      playTone(100, 0.3, "sawtooth", 0.15);
      playTone(60, 0.4, "sine", 0.18, 0.05);
    },
    line() {
      playTone(800, 0.06, "sawtooth", 0.08);
      playTone(1200, 0.06, "sawtooth", 0.07, 0.04);
      playTone(1600, 0.06, "sawtooth", 0.06, 0.08);
    },
    rainbow() {
      for (let i = 0; i < 5; i++) {
        playTone(500 + i * 150, 0.12, "sine", 0.08, i * 0.05);
      }
    },
    combo() {
      playTone(300, 0.15, "sawtooth", 0.10);
      playTone(450, 0.12, "sine", 0.12, 0.08);
      playTone(600, 0.12, "sine", 0.12, 0.14);
      playTone(900, 0.15, "sine", 0.10, 0.20);
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
  };

  const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d");

  let cellSize = 48;
  let boardPixelW, boardPixelH;
  let board = [];
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
      const d = JSON.parse(localStorage.getItem("7metch_save"));
      return d || { cleared: {}, bestStars: {} };
    } catch {
      return { cleared: {}, bestStars: {} };
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
  function buildStages() {
    const stages = [];
    for (let i = 0; i < 100; i++) {
      const tier = Math.floor(i / 10);
      const moves = Math.max(10, 20 - tier * 2);
      const colors = Math.min(7, 5 + Math.floor(i / 10));

      if (i % 5 === 0 && i > 0) {
        const targetColor = i % colors;
        stages.push({
          name: `${i + 1}`,
          moves,
          colors,
          mission: { type: "color", colorIndex: targetColor, count: Math.floor(moves * Math.min(1.0, 0.5 + i * 0.01)) },
          star2moves: Math.floor(moves * 0.6),
          star3moves: Math.floor(moves * 0.35),
        });
      } else if (i % 3 === 0) {
        stages.push({
          name: `${i + 1}`,
          moves,
          colors,
          mission: { type: "score", target: Math.floor(moves * (50 + i * 1.5)) },
          star2moves: Math.floor(moves * 0.6),
          star3moves: Math.floor(moves * 0.35),
        });
      } else {
        stages.push({
          name: `${i + 1}`,
          moves,
          colors,
          mission: { type: "clear", count: Math.floor(moves * (3.5 + i * 0.07)) },
          star2moves: Math.floor(moves * 0.6),
          star3moves: Math.floor(moves * 0.35),
        });
      }
    }
    return stages;
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

  // --- Board ---
  function createBoard(numColors) {
    board = [];
    for (let r = 0; r < ROWS; r++) {
      board[r] = [];
      for (let c = 0; c < COLS; c++) {
        board[r][c] = randomPiece(numColors);
      }
    }
    while (findAllMatches().length > 0) {
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          board[r][c] = randomPiece(numColors);
        }
      }
    }
  }

  function randomPiece(numColors) {
    return { color: Math.floor(Math.random() * numColors), special: null };
  }

  function inBounds(r, c) {
    return r >= 0 && r < ROWS && c >= 0 && c < COLS;
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

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (!board[r][c]) continue;
        const color = board[r][c].color;

        for (const [dr, dc] of directions) {
          const line = [[r, c]];
          let nr = r + dr;
          let nc = c + dc;
          while (inBounds(nr, nc) && board[nr][nc] && board[nr][nc].color === color) {
            line.push([nr, nc]);
            nr += dr;
            nc += dc;
          }
          if (line.length >= MATCH_MIN) {
            line.forEach(([lr, lc]) => matched.add(lr * COLS + lc));
          }
        }
      }
    }

    return [...matched].map((v) => [Math.floor(v / COLS), v % COLS]);
  }

  function findSpecialCreations(matches) {
    const specials = [];
    const matchSet = new Set(matches.map(([r, c]) => r * COLS + c));

    const hLines = [];
    const vLines = [];

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (!board[r][c]) continue;
        const color = board[r][c].color;

        // horizontal
        {
          const line = [[r, c]];
          let nc = c + 1;
          while (inBounds(r, nc) && board[r][nc] && board[r][nc].color === color) {
            line.push([r, nc]);
            nc++;
          }
          if (line.length >= MATCH_MIN && line.every(([lr, lc]) => matchSet.has(lr * COLS + lc))) {
            hLines.push({ line, color });
          }
        }

        // vertical
        {
          const line = [[r, c]];
          let nr = r + 1;
          while (inBounds(nr, c) && board[nr][c] && board[nr][c].color === color) {
            line.push([nr, c]);
            nr++;
          }
          if (line.length >= MATCH_MIN && line.every(([lr, lc]) => matchSet.has(lr * COLS + lc))) {
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
              const key = hr * COLS + hc;
              if (!usedCells.has(key)) {
                specials.push({ r: hr, c: hc, type: "bomb", color: h.color });
                usedCells.add(key);
                h.line.forEach(([lr, lc]) => usedCells.add(lr * COLS + lc));
                v.line.forEach(([lr, lc]) => usedCells.add(lr * COLS + lc));
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
      const midKey = mid[0] * COLS + mid[1];
      if (usedCells.has(midKey)) continue;

      if (line.length >= 5) {
        specials.push({ r: mid[0], c: mid[1], type: "rainbow", color });
        usedCells.add(midKey);
      } else if (line.length === 4) {
        const pos = line[1];
        const type = dir === "h" ? "line_v" : "line_h";
        const posKey = pos[0] * COLS + pos[1];
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
    const key = (r2, c2) => r2 * COLS + c2;

    if (piece.special === "line_h") {
      for (let cc = 0; cc < COLS; cc++) {
        if (!alreadyCleared.has(key(r, cc)) && board[r][cc]) {
          extra.push([r, cc]);
        }
      }
    } else if (piece.special === "line_v") {
      for (let rr = 0; rr < ROWS; rr++) {
        if (!alreadyCleared.has(key(rr, c)) && board[rr][c]) {
          extra.push([rr, c]);
        }
      }
    } else if (piece.special === "bomb") {
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const nr = r + dr;
          const nc = c + dc;
          if (inBounds(nr, nc) && !alreadyCleared.has(key(nr, nc)) && board[nr][nc]) {
            extra.push([nr, nc]);
          }
        }
      }
    } else if (piece.special === "rainbow") {
      const targetColor = piece.color;
      for (let rr = 0; rr < ROWS; rr++) {
        for (let cc = 0; cc < COLS; cc++) {
          if (board[rr][cc] && board[rr][cc].color === targetColor && !alreadyCleared.has(key(rr, cc))) {
            extra.push([rr, cc]);
          }
        }
      }
    }
    return extra;
  }

  // --- Gravity & Fill (data only, no animation) ---
  function applyGravityData() {
    const numColors = STAGES[currentStage].colors;
    const fallMap = [];

    for (let c = 0; c < COLS; c++) {
      let writeRow = ROWS - 1;
      for (let r = ROWS - 1; r >= 0; r--) {
        if (board[r][c]) {
          if (r !== writeRow) {
            board[writeRow][c] = board[r][c];
            board[r][c] = null;
            fallMap.push({ c, fromR: r, toR: writeRow, piece: board[writeRow][c] });
          }
          writeRow--;
        }
      }
      let newPieceOffset = 0;
      for (let r = writeRow; r >= 0; r--) {
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
    const pair = [s1, s2].sort().join("+");
    const combos = {
      "line_h+line_h": "cross",
      "line_h+line_v": "cross",
      "line_v+line_v": "cross",
      "bomb+line_h": "triple_line",
      "bomb+line_v": "triple_line",
      "bomb+bomb": "big_bomb",
      "line_h+rainbow": "rainbow_line",
      "line_v+rainbow": "rainbow_line",
      "bomb+rainbow": "rainbow_bomb",
      "rainbow+rainbow": "board_clear",
    };
    return combos[pair] || null;
  }

  function activateCombo(comboType, r, c, p1, p2) {
    const extra = [];
    const key = (r2, c2) => r2 * COLS + c2;
    const cleared = new Set();

    switch (comboType) {
      case "cross":
        for (let cc = 0; cc < COLS; cc++) {
          if (board[r][cc]) extra.push([r, cc]);
        }
        for (let rr = 0; rr < ROWS; rr++) {
          if (board[rr][c]) extra.push([rr, c]);
        }
        break;
      case "triple_line": {
        for (let d = -1; d <= 1; d++) {
          for (let cc = 0; cc < COLS; cc++) {
            if (inBounds(r + d, cc) && board[r + d][cc]) extra.push([r + d, cc]);
          }
          for (let rr = 0; rr < ROWS; rr++) {
            if (inBounds(rr, c + d) && board[rr][c + d]) extra.push([rr, c + d]);
          }
        }
        break;
      }
      case "big_bomb":
        for (let dr = -3; dr <= 3; dr++) {
          for (let dc = -3; dc <= 3; dc++) {
            if (inBounds(r + dr, c + dc) && board[r + dr][c + dc]) {
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
        for (let rr = 0; rr < ROWS; rr++) {
          for (let cc = 0; cc < COLS; cc++) {
            if (board[rr][cc] && board[rr][cc].color === targetColor) {
              board[rr][cc].special = spType;
              extra.push([rr, cc]);
            }
          }
        }
        break;
      }
      case "board_clear":
        for (let rr = 0; rr < ROWS; rr++) {
          for (let cc = 0; cc < COLS; cc++) {
            if (board[rr][cc]) extra.push([rr, cc]);
          }
        }
        break;
    }

    const unique = new Map();
    extra.forEach(([er, ec]) => unique.set(er * COLS + ec, [er, ec]));
    return [...unique.values()];
  }

  async function doMove(r1, c1, r2, c2) {
    if (animating) return;
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
        movesLeft--;
        chainCount = 1;
        updateHUD();

        const comboCells = activateCombo(comboType, r2, c2, p1, p2);

        // Activate specials on combo-cleared cells (chain reaction)
        const cleared = new Set(comboCells.map(([r, c]) => r * COLS + c));
        comboCells.forEach(([cr, cc]) => {
          if (board[cr][cc] && board[cr][cc].special && !(cr === r1 && cc === c1) && !(cr === r2 && cc === c2)) {
            const extra = activateSpecial(cr, cc, cleared);
            extra.forEach(([er, ec]) => {
              if (!cleared.has(er * COLS + ec)) {
                cleared.add(er * COLS + ec);
                comboCells.push([er, ec]);
              }
            });
          }
        });

        const clearList = [...cleared].map((v) => [Math.floor(v / COLS), v % COLS]);
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

    updateHUD();
    checkWinLose();
    animating = false;
  }

  async function resolveBoard() {
    let matches = findAllMatches();
    while (matches.length > 0) {
      chainCount++;
      const specials = findSpecialCreations(matches);

      const cleared = new Set();
      matches.forEach(([r, c]) => cleared.add(r * COLS + c));

      let hasSpecialActivation = false;
      matches.forEach(([r, c]) => {
        if (board[r][c] && board[r][c].special) {
          hasSpecialActivation = true;
          const sp = board[r][c].special;
          if (sp === "bomb") SFX.bomb();
          else if (sp === "line_h" || sp === "line_v") SFX.line();
          else if (sp === "rainbow") SFX.rainbow();
          const extra = activateSpecial(r, c, cleared);
          extra.forEach(([er, ec]) => {
            cleared.add(er * COLS + ec);
            if (board[er][ec] && board[er][ec].special) {
              const extra2 = activateSpecial(er, ec, cleared);
              extra2.forEach(([er2, ec2]) => cleared.add(er2 * COLS + ec2));
            }
          });
        }
      });

      const clearList = [...cleared].map((v) => [Math.floor(v / COLS), v % COLS]);

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

      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if ((r === r1 && c === c1) || (r === r2 && c === c2)) continue;
          if (board[r][c]) {
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
    const clearSet = new Set(cells.map(([r, c]) => r * COLS + c));
    const pieceSnapshots = cells.map(([r, c]) => ({
      r, c,
      color: board[r][c] ? PIECE_COLORS[board[r][c].color] : "#fff",
      piece: board[r][c],
    }));
    const totalFrames = ANIM.CLEAR_FRAMES;

    for (let frame = 0; frame < totalFrames; frame++) {
      const t = frame / totalFrames;

      drawBoardBase();
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (clearSet.has(r * COLS + c)) continue;
          if (board[r][c]) {
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
    for (let r = 0; r < ROWS; r++) {
      frozen[r] = [];
      for (let c = 0; c < COLS; c++) {
        frozen[r][c] = board[r][c];
      }
    }

    const fallingCells = new Set(fallMap.map((f) => f.toR * COLS + f.c));

    for (let frame = 0; frame <= totalFrames; frame++) {
      const t = Math.min(frame / totalFrames, 1);
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

      drawBoardBase();

      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (fallingCells.has(r * COLS + c)) continue;
          if (frozen[r][c]) {
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

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x = c * cellSize;
        const y = r * cellSize;
        ctx.fillStyle = (r + c) % 2 === 0 ? "#1a2744" : "#1e2d50";
        ctx.fillRect(x, y, cellSize, cellSize);
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
      drawSpecialIndicator(ctx, piece.special, cx, cy, radius);
    }
  }

  function drawBoard(overlay) {
    drawBoardBase();

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
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
    }
  }

  function drawSpecialIndicator(ctx, type, cx, cy, r) {
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "#fff";
    ctx.font = `bold ${r * 0.7}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    switch (type) {
      case "line_h":
        ctx.fillText("―", cx, cy);
        break;
      case "line_v":
        ctx.fillText("｜", cx, cy);
        break;
      case "bomb":
        ctx.font = `bold ${r * 0.6}px sans-serif`;
        ctx.fillText("◆", cx, cy);
        break;
      case "rainbow":
        ctx.fillText("✦", cx, cy);
        break;
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
      if (stars > prev) saveData.bestStars[currentStage] = stars;
      saveData.cleared[currentStage] = true;
      writeSave();

      SFX.stageClear();
      showResult(true, stars);
    } else if (movesLeft <= 0) {
      SFX.stageFail();
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
    if (inBounds(r, c)) return { r, c };
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
    if (!inBounds(targetR, targetC)) return;

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

  document.getElementById("btn-retry").addEventListener("click", () => {
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
    movesLeft = stg.moves;
    score = 0;
    totalCleared = 0;
    colorCleared = [];
    chainCount = 0;
    selected = null;
    animating = false;

    resizeCanvas();
    createBoard(stg.colors);
    updateHUD();
    drawBoard();
    showScreen("game");
  }

  function resizeCanvas() {
    const app = document.getElementById("app");
    const maxW = app.clientWidth - 16;
    const maxH = app.clientHeight - 140;

    cellSize = Math.min(Math.floor(maxW / COLS), Math.floor(maxH / ROWS));
    cellSize = Math.max(cellSize, 28);

    boardPixelW = COLS * cellSize;
    boardPixelH = ROWS * cellSize;

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
