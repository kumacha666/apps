import { G, PIECE_COLORS, MATCH_MIN } from "./state.js";
import { cellCenter, addBurstParticles, addShockwave, addFlash, addScreenShake, addFloatingText } from "./vfx.js";
import { drawBoard } from "./rendering.js";
import { SFX } from "./audio.js";

const HINT_DELAY_MS = 4000;
export const TAP_ACTIVATE_SPECIALS = new Set(["line_h", "line_v", "line_d", "bomb"]);

// ---------------------------------------------------------------------------
// Board helpers
// ---------------------------------------------------------------------------

export function hasSquare() {
  for (let r = 0; r < G.rows - 1; r++) {
    for (let c = 0; c < G.cols - 1; c++) {
      const cells = [[r,c],[r,c+1],[r+1,c],[r+1,c+1]];
      if (cells.some(([cr,cc]) => !G.board[cr][cc] || isHole(cr,cc) || isRock(cr,cc))) continue;
      const color = G.board[r][c].color;
      if (cells.every(([cr,cc]) => G.board[cr][cc].color === color)) return true;
    }
  }
  return false;
}

export function createBoard(numColors) {
  const maxMoves = Math.max(10, Math.floor(G.rows * G.cols * 0.15));
  const minMoves = 2;
  const target = Math.floor((minMoves + maxMoves) / 2);
  let bestBoard = null;
  let bestDiff = Infinity;

  for (let attempt = 0; attempt < 20; attempt++) {
    G.board = [];
    for (let r = 0; r < G.rows; r++) {
      G.board[r] = [];
      for (let c = 0; c < G.cols; c++) {
        if (isHole(r, c) || isRock(r, c)) {
          G.board[r][c] = null;
        } else {
          G.board[r][c] = randomPiece(numColors);
        }
      }
    }
    while (findAllMatches().length > 0 || hasSquare()) {
      for (let r = 0; r < G.rows; r++) {
        for (let c = 0; c < G.cols; c++) {
          if (isHole(r, c) || isRock(r, c)) continue;
          G.board[r][c] = randomPiece(numColors);
        }
      }
    }

    const moves = countAvailableMoves();
    if (moves >= minMoves && moves <= maxMoves) {
      bestBoard = null;
      break;
    }
    const diff = Math.abs(moves - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestBoard = G.board.map(row => row.map(cell => cell ? {...cell} : null));
    }
  }

  if (bestBoard) G.board = bestBoard;

  const stg = G.STAGES[G.currentStage];
  if (stg.countdownBombs > 0) {
    let placed = 0, attempts = 0;
    while (placed < stg.countdownBombs && attempts < 200) {
      const br = Math.floor(Math.random() * G.rows);
      const bc = Math.floor(Math.random() * G.cols);
      if (G.board[br][bc] && !G.board[br][bc].special) {
        G.board[br][bc].special = "countdown";
        G.board[br][bc].countdown = 8 + Math.floor(Math.random() * 5);
        placed++;
      }
      attempts++;
    }
  }
}

export function randomPiece(numColors) {
  return { color: Math.floor(Math.random() * numColors), special: null };
}

export function countAvailableMoves() {
  let count = 0;
  for (let r = 0; r < G.rows; r++) {
    for (let c = 0; c < G.cols; c++) {
      if (!G.board[r][c] || !isPlayable(r, c)) continue;
      const fwd = [[r, c+1], [r+1, c-1], [r+1, c], [r+1, c+1]];
      for (const [nr, nc] of fwd) {
        if (!inBounds(nr, nc) || !G.board[nr][nc] || !isPlayable(nr, nc)) continue;
        swapPieces(r, c, nr, nc);
        if (findAllMatches().length > 0) count++;
        swapPieces(r, c, nr, nc);
      }
    }
  }
  return count;
}

export function initCellState(stg) {
  G.cellState = [];
  for (let r = 0; r < G.rows; r++) {
    G.cellState[r] = [];
    for (let c = 0; c < G.cols; c++) {
      G.cellState[r][c] = null;
    }
  }
  if (stg.holePattern) {
    for (const [hr, hc] of stg.holePattern) {
      if (hr >= 0 && hr < G.rows && hc >= 0 && hc < G.cols) {
        G.cellState[hr][hc] = "hole";
      }
    }
  }
  if (stg.rockCells > 0) {
    let placed = 0, attempts = 0;
    while (placed < stg.rockCells && attempts < 200) {
      const rr = 1 + Math.floor(Math.random() * (G.rows - 2));
      const rc = 1 + Math.floor(Math.random() * (G.cols - 2));
      if (G.cellState[rr][rc] === null) {
        G.cellState[rr][rc] = "rock";
        placed++;
      }
      attempts++;
    }
  }
  if (stg.iceCells > 0) {
    let placed = 0, attempts = 0;
    while (placed < stg.iceCells && attempts < 200) {
      const ir = Math.floor(Math.random() * G.rows);
      const ic = Math.floor(Math.random() * G.cols);
      if (G.cellState[ir][ic] === null) {
        G.cellState[ir][ic] = "ice2";
        placed++;
      }
      attempts++;
    }
  }
}

// ---------------------------------------------------------------------------
// Cell state queries
// ---------------------------------------------------------------------------

export function isHole(r, c) { return G.cellState[r] && G.cellState[r][c] === "hole"; }
export function isRock(r, c) { return G.cellState[r] && G.cellState[r][c] === "rock"; }
export function isIce(r, c) { return G.cellState[r] && (G.cellState[r][c] === "ice1" || G.cellState[r][c] === "ice2"); }
export function isPlayable(r, c) { return !isHole(r, c) && !isRock(r, c); }

export function damageIce(r, c) {
  if (G.cellState[r][c] === "ice2") { G.cellState[r][c] = "ice1"; SFX.iceCrack(); return false; }
  if (G.cellState[r][c] === "ice1") { G.cellState[r][c] = null; SFX.iceCrack(); return true; }
  return true;
}

export function damageAdjacentIce(clearList) {
  const iceSet = new Set();
  for (const [r, c] of clearList) {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr, nc = c + dc;
        if (inBounds(nr, nc) && isIce(nr, nc)) iceSet.add(nr * G.cols + nc);
      }
    }
  }
  for (const key of iceSet) {
    damageIce(Math.floor(key / G.cols), key % G.cols);
  }
}

// ---------------------------------------------------------------------------
// Countdown
// ---------------------------------------------------------------------------

export function tickCountdowns() {
  const exploded = [];
  for (let r = 0; r < G.rows; r++) {
    for (let c = 0; c < G.cols; c++) {
      if (G.board[r][c] && G.board[r][c].special === "countdown") {
        G.board[r][c].countdown--;
        if (G.board[r][c].countdown <= 0) exploded.push([r, c]);
      }
    }
  }
  return exploded;
}

// ---------------------------------------------------------------------------
// Bounds & adjacency
// ---------------------------------------------------------------------------

export function inBounds(r, c) {
  return r >= 0 && r < G.rows && c >= 0 && c < G.cols;
}

export function isAdjacent(r1, c1, r2, c2) {
  const dr = Math.abs(r1 - r2);
  const dc = Math.abs(c1 - c2);
  return dr <= 1 && dc <= 1 && (dr + dc > 0);
}

// ---------------------------------------------------------------------------
// Match finding
// ---------------------------------------------------------------------------

export function isMatchable(r, c) {
  if (!G.board[r][c]) return false;
  if (isHole(r, c) || isRock(r, c)) return false;
  if (G.board[r][c].special && TAP_ACTIVATE_SPECIALS.has(G.board[r][c].special)) return false;
  return true;
}

export function findAllMatches() {
  const matched = new Set();
  const directions = [[0, 1], [1, 0]];
  for (let r = 0; r < G.rows; r++) {
    for (let c = 0; c < G.cols; c++) {
      if (!isMatchable(r, c)) continue;
      const color = G.board[r][c].color;
      for (const [dr, dc] of directions) {
        const line = [[r, c]];
        let nr = r + dr, nc = c + dc;
        while (inBounds(nr, nc) && isMatchable(nr, nc) && G.board[nr][nc].color === color) {
          line.push([nr, nc]);
          nr += dr;
          nc += dc;
        }
        if (line.length >= MATCH_MIN) {
          line.forEach(([lr, lc]) => matched.add(lr * G.cols + lc));
        }
      }
    }
  }
  const stg = G.STAGES[G.currentStage];
  if (stg && stg.features && stg.features.diagonalLine) {
    for (let r = 0; r < G.rows - 1; r++) {
      for (let c = 0; c < G.cols - 1; c++) {
        if (!isMatchable(r, c)) continue;
        const color = G.board[r][c].color;
        const cells = [[r,c],[r,c+1],[r+1,c],[r+1,c+1]];
        const allMatch = cells.every(([cr, cc]) => isMatchable(cr, cc) && G.board[cr][cc].color === color);
        if (allMatch) cells.forEach(([cr, cc]) => matched.add(cr * G.cols + cc));
      }
    }
  }
  return [...matched].map((v) => [Math.floor(v / G.cols), v % G.cols]);
}

export function findSpecialCreations(matches) {
  const specials = [];
  const matchSet = new Set(matches.map(([r, c]) => r * G.cols + c));
  const stg = G.STAGES[G.currentStage];

  const hLines = [];
  const vLines = [];

  for (let r = 0; r < G.rows; r++) {
    for (let c = 0; c < G.cols; c++) {
      if (!G.board[r][c]) continue;
      if (isHole(r, c) || isRock(r, c)) continue;
      const color = G.board[r][c].color;

      // horizontal
      {
        const line = [[r, c]];
        let nc = c + 1;
        while (inBounds(r, nc) && G.board[r][nc] && !isHole(r, nc) && !isRock(r, nc) && G.board[r][nc].color === color) {
          line.push([r, nc]);
          nc++;
        }
        if (line.length >= MATCH_MIN && line.every(([lr, lc]) => matchSet.has(lr * G.cols + lc))) {
          hLines.push({ line, color });
        }
      }

      // vertical
      {
        const line = [[r, c]];
        let nr = r + 1;
        while (inBounds(nr, c) && G.board[nr][c] && !isHole(nr, c) && !isRock(nr, c) && G.board[nr][c].color === color) {
          line.push([nr, c]);
          nr++;
        }
        if (line.length >= MATCH_MIN && line.every(([lr, lc]) => matchSet.has(lr * G.cols + lc))) {
          vLines.push({ line, color });
        }
      }
    }
  }

  const usedCells = new Set();

  // T/L shape: intersecting horizontal + vertical of same color -> bomb
  for (const h of hLines) {
    for (const v of vLines) {
      if (h.color !== v.color) continue;
      for (const [hr, hc] of h.line) {
        for (const [vr, vc] of v.line) {
          if (hr === vr && hc === vc) {
            const allCells = [...h.line, ...v.line];
            let sr = hr, sc = hc;
            if (G.lastSwapTarget && allCells.some(([cr, cc]) => cr === G.lastSwapTarget.r && cc === G.lastSwapTarget.c)) {
              sr = G.lastSwapTarget.r;
              sc = G.lastSwapTarget.c;
            }
            const key = sr * G.cols + sc;
            if (!usedCells.has(key)) {
              specials.push({ r: sr, c: sc, type: "bomb", color: h.color });
              usedCells.add(key);
              allCells.forEach(([lr, lc]) => usedCells.add(lr * G.cols + lc));
            }
          }
        }
      }
    }
  }

  // 5+ line -> rainbow, 4 line -> line clear
  const allLines = [
    ...hLines.map((h) => ({ ...h, dir: "h" })),
    ...vLines.map((v) => ({ ...v, dir: "v" })),
  ];

  for (const { line, color, dir } of allLines) {
    const mid = line[Math.floor(line.length / 2)];
    const midKey = mid[0] * G.cols + mid[1];
    if (usedCells.has(midKey)) continue;

    if (line.length >= 5) {
      let sr = mid[0], sc = mid[1], sk = midKey;
      if (G.lastSwapTarget && line.some(([lr, lc]) => lr === G.lastSwapTarget.r && lc === G.lastSwapTarget.c)) {
        sr = G.lastSwapTarget.r;
        sc = G.lastSwapTarget.c;
        sk = sr * G.cols + sc;
      }
      if (!usedCells.has(sk)) {
        specials.push({ r: sr, c: sc, type: "rainbow", color });
        usedCells.add(sk);
      }
    } else if (line.length === 4) {
      const type = dir === "h" ? "line_h" : "line_v";
      let sr = line[1][0], sc = line[1][1];
      if (G.lastSwapTarget && line.some(([lr, lc]) => lr === G.lastSwapTarget.r && lc === G.lastSwapTarget.c)) {
        sr = G.lastSwapTarget.r;
        sc = G.lastSwapTarget.c;
      }
      const posKey = sr * G.cols + sc;
      if (!usedCells.has(posKey)) {
        specials.push({ r: sr, c: sc, type, color });
        usedCells.add(posKey);
      }
    }
  }

  // 2x2 square -> diagonal line (at swap target position if within the square)
  if (stg && stg.features && stg.features.diagonalLine) {
    for (let r = 0; r < G.rows - 1; r++) {
      for (let c = 0; c < G.cols - 1; c++) {
        if (!G.board[r][c]) continue;
        const sqColor = G.board[r][c].color;
        const cells = [[r,c],[r,c+1],[r+1,c],[r+1,c+1]];
        if (cells.every(([cr,cc]) => G.board[cr][cc] && G.board[cr][cc].color === sqColor) &&
            cells.every(([cr,cc]) => matchSet.has(cr * G.cols + cc)) &&
            cells.every(([cr,cc]) => !usedCells.has(cr * G.cols + cc))) {
          let sr = r, sc = c;
          if (G.lastSwapTarget && cells.some(([cr,cc]) => cr === G.lastSwapTarget.r && cc === G.lastSwapTarget.c)) {
            sr = G.lastSwapTarget.r;
            sc = G.lastSwapTarget.c;
          }
          specials.push({ r: sr, c: sc, type: "line_d", color: sqColor });
          cells.forEach(([cr,cc]) => usedCells.add(cr * G.cols + cc));
        }
      }
    }
  }

  return specials;
}

// ---------------------------------------------------------------------------
// Hint system
// ---------------------------------------------------------------------------

export function findHint() {
  const PRIORITY = { rainbow: 3, bomb: 2, line_d: 2, line_h: 1, line_v: 1 };
  let bestList = [];
  let bestPriority = 0;
  const normalList = [];

  for (let r = 0; r < G.rows; r++) {
    for (let c = 0; c < G.cols; c++) {
      if (!G.board[r][c] || !isPlayable(r, c)) continue;
      const neighbors = [
        [r-1,c-1],[r-1,c],[r-1,c+1],
        [r,c+1],[r+1,c+1],[r+1,c],[r+1,c-1],[r,c-1]
      ];
      for (const [nr, nc] of neighbors) {
        if (!inBounds(nr, nc) || !G.board[nr][nc] || !isPlayable(nr, nc)) continue;
        if (nr < r || (nr === r && nc < c)) continue;

        swapPieces(r, c, nr, nc);
        const matches = findAllMatches();
        if (matches.length > 0) {
          const specials = findSpecialCreations(matches);
          let hasSpecial = false;
          for (const sp of specials) {
            const p = PRIORITY[sp.type] || 0;
            if (p > 0) {
              hasSpecial = true;
              const colorMatches = matches.filter(([mr, mc]) =>
                G.board[mr][mc] && G.board[mr][mc].color === sp.color);
              const colorSet = new Set(colorMatches.map(([mr, mc]) => mr * G.cols + mc));
              const pos1in = colorSet.has(r * G.cols + c);
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
          if (!hasSpecial) {
            const matchSet = new Set(matches.map(([mr, mc]) => mr * G.cols + mc));
            let targetColor = -1;
            if (matchSet.has(nr * G.cols + nc) && G.board[nr][nc]) targetColor = G.board[nr][nc].color;
            else if (matchSet.has(r * G.cols + c) && G.board[r][c]) targetColor = G.board[r][c].color;
            if (targetColor >= 0) {
              const colorMatches = matches.filter(([mr, mc]) =>
                G.board[mr][mc] && G.board[mr][mc].color === targetColor);
              const colorSet = new Set(colorMatches.map(([mr, mc]) => mr * G.cols + mc));
              const pos1in = colorSet.has(r * G.cols + c);
              const mover = pos1in ? { r: nr, c: nc } : { r, c };
              const swapDest = pos1in ? { r, c } : { r: nr, c: nc };
              const pattern = colorMatches
                .filter(([mr, mc]) => !(mr === swapDest.r && mc === swapDest.c))
                .map(([mr, mc]) => ({ r: mr, c: mc }));
              normalList.push({ mover, pattern });
            }
          }
        }
        swapPieces(r, c, nr, nc);
      }
    }
  }

  if (bestList.length > 0) return bestList[Math.floor(Math.random() * bestList.length)];
  if (normalList.length > 0) return normalList[Math.floor(Math.random() * normalList.length)];
  return null;
}

export function startHintTimer() {
  clearHint();
  G.hintTimer = setTimeout(() => {
    if (G.animating) return;
    const hint = findHint();
    if (hint) {
      G.hintData = hint;
      startHintAnim();
    }
  }, HINT_DELAY_MS);
}

export function clearHint() {
  if (G.hintTimer) { clearTimeout(G.hintTimer); G.hintTimer = null; }
  if (G.hintAnimId) { cancelAnimationFrame(G.hintAnimId); G.hintAnimId = null; }
  if (G.hintData) { G.hintData = null; drawBoard(); }
}

export function startHintAnim() {
  const startTime = performance.now();
  function tick() {
    if (!G.hintData) return;
    drawBoard(() => {
      const elapsed = performance.now() - startTime;
      const pulse = 0.5 + 0.5 * Math.sin(elapsed / 300);
      G.ctx.save();
      for (const cell of G.hintData.pattern) {
        const cx = cell.c * G.cellSize + G.cellSize / 2;
        const cy = cell.r * G.cellSize + G.cellSize / 2;
        const radius = G.cellSize * 0.45;
        G.ctx.globalAlpha = 0.15 + 0.2 * pulse;
        G.ctx.fillStyle = "#fff";
        G.ctx.beginPath();
        G.ctx.arc(cx, cy, radius * (0.9 + 0.1 * pulse), 0, Math.PI * 2);
        G.ctx.fill();
        G.ctx.strokeStyle = "#ffe66d";
        G.ctx.lineWidth = 1.5;
        G.ctx.globalAlpha = 0.3 + 0.3 * pulse;
        G.ctx.stroke();
      }
      const m = G.hintData.mover;
      const mcx = m.c * G.cellSize + G.cellSize / 2;
      const mcy = m.r * G.cellSize + G.cellSize / 2;
      const mr = G.cellSize * 0.45;
      G.ctx.globalAlpha = 0.3 + 0.4 * pulse;
      G.ctx.fillStyle = "#fff";
      G.ctx.beginPath();
      G.ctx.arc(mcx, mcy, mr * (0.9 + 0.15 * pulse), 0, Math.PI * 2);
      G.ctx.fill();
      G.ctx.strokeStyle = "#ffe66d";
      G.ctx.lineWidth = 2.5;
      G.ctx.globalAlpha = 0.6 + 0.4 * pulse;
      G.ctx.stroke();
      G.ctx.restore();
    });
    G.hintAnimId = requestAnimationFrame(tick);
  }
  tick();
}

// ---------------------------------------------------------------------------
// Special piece activation
// ---------------------------------------------------------------------------

export function activateSpecial(r, c, alreadyCleared, triggeredBy) {
  const piece = G.board[r][c];
  if (!piece || !piece.special) return [];
  let sp = piece.special;
  if (triggeredBy === "line_h" && sp === "line_h") sp = "line_v";
  else if (triggeredBy === "line_v" && sp === "line_v") sp = "line_h";
  const extra = [];
  const key = (r2, c2) => r2 * G.cols + c2;

  if (sp === "line_h") {
    for (let cc = 0; cc < G.cols; cc++) {
      if (!alreadyCleared.has(key(r, cc)) && G.board[r][cc] && isPlayable(r, cc)) {
        extra.push([r, cc]);
      }
    }
  } else if (sp === "line_v") {
    for (let rr = 0; rr < G.rows; rr++) {
      if (!alreadyCleared.has(key(rr, c)) && G.board[rr][c] && isPlayable(rr, c)) {
        extra.push([rr, c]);
      }
    }
  } else if (sp === "line_d") {
    for (let d = -Math.max(G.rows, G.cols); d <= Math.max(G.rows, G.cols); d++) {
      const r1 = r + d, c1 = c + d;
      if (inBounds(r1, c1) && !alreadyCleared.has(key(r1, c1)) && G.board[r1][c1] && isPlayable(r1, c1)) extra.push([r1, c1]);
      const r2 = r + d, c2 = c - d;
      if (inBounds(r2, c2) && !alreadyCleared.has(key(r2, c2)) && G.board[r2][c2] && isPlayable(r2, c2)) extra.push([r2, c2]);
    }
  } else if (sp === "bomb") {
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        const nr = r + dr;
        const nc = c + dc;
        if (inBounds(nr, nc) && !alreadyCleared.has(key(nr, nc)) && G.board[nr][nc] && isPlayable(nr, nc)) {
          extra.push([nr, nc]);
        }
      }
    }
  } else if (sp === "rainbow") {
    const targetColor = piece.color;
    for (let rr = 0; rr < G.rows; rr++) {
      for (let cc = 0; cc < G.cols; cc++) {
        if (G.board[rr][cc] && G.board[rr][cc].color === targetColor && !alreadyCleared.has(key(rr, cc)) && isPlayable(rr, cc)) {
          extra.push([rr, cc]);
        }
      }
    }
  } else if (sp === "countdown") {
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        const nr = r + dr, nc = c + dc;
        if (inBounds(nr, nc) && !alreadyCleared.has(key(nr, nc)) && G.board[nr][nc] && isPlayable(nr, nc)) extra.push([nr, nc]);
      }
    }
  }
  return extra;
}

// ---------------------------------------------------------------------------
// Gravity & fill (data only, no animation)
// ---------------------------------------------------------------------------

export function applyGravityData() {
  const numColors = G.STAGES[G.currentStage].colors;
  const fallMap = [];
  for (let c = 0; c < G.cols; c++) {
    let writeRow = G.rows - 1;
    while (writeRow >= 0 && (isHole(writeRow, c) || isRock(writeRow, c))) writeRow--;
    for (let r = writeRow; r >= 0; r--) {
      if (isHole(r, c) || isRock(r, c)) continue;
      if (G.board[r][c]) {
        if (r !== writeRow) {
          G.board[writeRow][c] = G.board[r][c];
          G.board[r][c] = null;
          fallMap.push({ c, fromR: r, toR: writeRow, piece: G.board[writeRow][c] });
        }
        writeRow--;
        while (writeRow >= 0 && (isHole(writeRow, c) || isRock(writeRow, c))) writeRow--;
      }
    }
    let newPieceOffset = 0;
    for (let r = writeRow; r >= 0; r--) {
      if (isHole(r, c) || isRock(r, c)) continue;
      G.board[r][c] = randomPiece(numColors);
      newPieceOffset++;
      fallMap.push({ c, fromR: -newPieceOffset, toR: r, piece: G.board[r][c], isNew: true });
    }
  }
  return fallMap;
}

// ---------------------------------------------------------------------------
// Swap
// ---------------------------------------------------------------------------

export function swapPieces(r1, c1, r2, c2) {
  const tmp = G.board[r1][c1];
  G.board[r1][c1] = G.board[r2][c2];
  G.board[r2][c2] = tmp;
}

// ---------------------------------------------------------------------------
// Combo type lookup
// ---------------------------------------------------------------------------

export function getComboType(s1, s2) {
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
