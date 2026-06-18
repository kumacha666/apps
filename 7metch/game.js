(function () {
  "use strict";

  const COLS = 7;
  const ROWS = 8;
  const PIECE_COLORS = ["#e94560", "#4ecdc4", "#ffe66d", "#7b68ee", "#ff8a5c", "#a8e6cf"];
  const PIECE_SHAPES = ["circle", "diamond", "square", "triangle", "star", "hex"];
  const MATCH_MIN = 3;

  const DIR8 = [
    [-1, -1], [-1, 0], [-1, 1],
    [0, -1],           [0, 1],
    [1, -1],  [1, 0],  [1, 1],
  ];

  const STAGES = buildStages();

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

  // --- Stages ---
  function buildStages() {
    const stages = [];
    for (let i = 0; i < 50; i++) {
      const tier = Math.floor(i / 10);
      const moves = Math.max(15, 30 - tier * 3);
      const colors = Math.min(6, 4 + Math.floor(i / 15));

      if (i % 5 === 0 && i > 0) {
        const targetColor = i % colors;
        stages.push({
          name: `${i + 1}`,
          moves,
          colors,
          mission: { type: "color", colorIndex: targetColor, count: 20 + tier * 8 },
          star2moves: Math.floor(moves * 0.7),
          star3moves: Math.floor(moves * 0.45),
        });
      } else if (i % 3 === 0) {
        stages.push({
          name: `${i + 1}`,
          moves,
          colors,
          mission: { type: "score", target: 800 + i * 120 },
          star2moves: Math.floor(moves * 0.7),
          star3moves: Math.floor(moves * 0.45),
        });
      } else {
        stages.push({
          name: `${i + 1}`,
          moves,
          colors,
          mission: { type: "clear", count: 30 + i * 3 },
          star2moves: Math.floor(moves * 0.7),
          star3moves: Math.floor(moves * 0.45),
        });
      }
    }
    return stages;
  }

  function getMissionText(m) {
    switch (m.type) {
      case "score": return `${m.target}点 とろう`;
      case "clear": return `${m.count}個 けそう`;
      case "color": return `${PIECE_SHAPES[m.colorIndex]}を${m.count}個けそう`;
    }
  }

  // --- Board ---
  function createBoard(numColors) {
    board = [];
    for (let r = 0; r < ROWS; r++) {
      board[r] = [];
      for (let c = 0; c < COLS; c++) {
        board[r][c] = randomPiece(numColors, r, c);
      }
    }
    while (findAllMatches().length > 0) {
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          board[r][c] = randomPiece(numColors, r, c);
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
      [1, 1],
      [1, -1],
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
    const directions = [
      [0, 1],
      [1, 0],
      [1, 1],
      [1, -1],
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
          if (line.length >= 5) {
            const mid = line[Math.floor(line.length / 2)];
            specials.push({ r: mid[0], c: mid[1], type: "rainbow", color });
          } else if (line.length === 4) {
            const mid = line[1];
            if (dc === 0) {
              specials.push({ r: mid[0], c: mid[1], type: "line_h", color });
            } else if (dr === 0) {
              specials.push({ r: mid[0], c: mid[1], type: "line_v", color });
            } else {
              specials.push({ r: mid[0], c: mid[1], type: "bomb", color });
            }
          }
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

  // --- Gravity & Fill ---
  function applyGravity() {
    const numColors = STAGES[currentStage].colors;
    let fell = false;
    for (let c = 0; c < COLS; c++) {
      let writeRow = ROWS - 1;
      for (let r = ROWS - 1; r >= 0; r--) {
        if (board[r][c]) {
          if (r !== writeRow) {
            board[writeRow][c] = board[r][c];
            board[r][c] = null;
            fell = true;
          }
          writeRow--;
        }
      }
      for (let r = writeRow; r >= 0; r--) {
        board[r][c] = randomPiece(numColors);
        fell = true;
      }
    }
    return fell;
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

  async function doMove(r1, c1, r2, c2) {
    if (animating) return;
    animating = true;

    swapPieces(r1, c1, r2, c2);

    const matches = findAllMatches();
    if (matches.length === 0) {
      swapPieces(r1, c1, r2, c2);
      await flashInvalid(r1, c1, r2, c2);
      animating = false;
      return;
    }

    movesLeft--;
    chainCount = 0;

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

      matches.forEach(([r, c]) => {
        if (board[r][c] && board[r][c].special) {
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

      await animateClear(clearList);

      specials.forEach((sp) => {
        if (board[sp.r] && board[sp.r][sp.c] === null) {
          board[sp.r][sp.c] = { color: sp.color, special: sp.type };
        } else if (board[sp.r] && board[sp.r][sp.c]) {
          board[sp.r][sp.c].special = sp.type;
        }
      });

      applyGravity();
      await animateDrop();

      matches = findAllMatches();
    }
  }

  // --- Animations ---
  async function animateClear(cells) {
    for (let frame = 0; frame < 6; frame++) {
      drawBoard();
      ctx.save();
      const alpha = 1 - frame / 6;
      const scale = 1 + frame * 0.1;
      cells.forEach(([r, c]) => {
        const x = c * cellSize + cellSize / 2;
        const y = r * cellSize + cellSize / 2;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(x, y, (cellSize / 2 - 2) * scale, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
      await sleep(30);
    }
    cells.forEach(([r, c]) => {
      board[r][c] = null;
    });
    drawBoard();
  }

  async function animateDrop() {
    drawBoard();
    await sleep(80);
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
  function drawBoard(overlay) {
    ctx.clearRect(0, 0, boardPixelW, boardPixelH);

    ctx.fillStyle = "#16213e";
    ctx.fillRect(0, 0, boardPixelW, boardPixelH);

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x = c * cellSize;
        const y = r * cellSize;

        ctx.fillStyle = (r + c) % 2 === 0 ? "#1a2744" : "#1e2d50";
        ctx.fillRect(x, y, cellSize, cellSize);

        const piece = board[r][c];
        if (!piece) continue;

        const cx = x + cellSize / 2;
        const cy = y + cellSize / 2;
        const radius = cellSize / 2 - 4;

        ctx.fillStyle = PIECE_COLORS[piece.color];
        ctx.strokeStyle = "rgba(255,255,255,0.15)";
        ctx.lineWidth = 1;

        drawShape(ctx, PIECE_SHAPES[piece.color], cx, cy, radius);

        if (piece.special) {
          drawSpecialIndicator(ctx, piece.special, cx, cy, radius);
        }

        if (selected && selected.r === r && selected.c === c) {
          ctx.save();
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 3;
          ctx.strokeRect(x + 2, y + 2, cellSize - 4, cellSize - 4);
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
        ctx.fillText("💥", cx, cy - 1);
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
    let progress = "";
    switch (m.type) {
      case "score":
        progress = `${score} / ${m.target} 点`;
        break;
      case "clear":
        progress = `${totalCleared} / ${m.count} 個`;
        break;
      case "color":
        progress = `${colorCleared[m.colorIndex] || 0} / ${m.count} 個`;
        break;
    }
    document.getElementById("hud-mission").textContent = `${getMissionText(m)}\n${progress}`;
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

      showResult(true, stars);
    } else if (movesLeft <= 0) {
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
    drawBoard();
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!dragStart || animating) return;
    e.preventDefault();
    const cell = getCell(e.clientX, e.clientY);
    if (!cell) return;
    if (cell.r === dragStart.r && cell.c === dragStart.c) return;

    if (isAdjacent(dragStart.r, dragStart.c, cell.r, cell.c)) {
      selected = null;
      doMove(dragStart.r, dragStart.c, cell.r, cell.c);
      dragStart = null;
    }
  });

  canvas.addEventListener("pointerup", () => {
    dragStart = null;
  });

  canvas.addEventListener("pointerleave", () => {
    dragStart = null;
  });

  // --- Screen Transitions ---
  document.getElementById("btn-start").addEventListener("click", () => {
    const lastCleared = Object.keys(saveData.cleared)
      .map(Number)
      .sort((a, b) => a - b);
    currentStage = lastCleared.length > 0 ? Math.min(lastCleared[lastCleared.length - 1] + 1, STAGES.length - 1) : 0;
    startStage(currentStage);
  });

  document.getElementById("btn-stage-select").addEventListener("click", () => {
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
    currentStage++;
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
    STAGES.forEach((stg, i) => {
      const btn = document.createElement("button");
      btn.className = "stage-btn";
      const unlocked = i === 0 || saveData.cleared[i - 1];
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
    });
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

  showScreen("title");
})();
