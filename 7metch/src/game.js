import { G, PIECE_COLORS, ANIM, ITEM_COSTS, STAR_GATES, PIECE_NAMES_JA, SCORE_PER_PIECE, writeSave } from "./state.js";
import { findAllMatches, findSpecialCreations, activateSpecial, applyGravityData, swapPieces, getComboType, createBoard, countAvailableMoves, damageAdjacentIce, tickCountdowns, startHintTimer, clearHint, isHole, isRock, randomPiece, inBounds, initCellState, TAP_ACTIVATE_SPECIALS } from "./board.js";
import { animateSwap, animateClear, animateDrop, sleep } from "./animations.js";
import { cellCenter, addBurstParticles, addShockwave, addFlash, addScreenShake, addFloatingText, hasActiveVFX, updateVFX } from "./vfx.js";
import { drawBoard, buildPieceCache, startBgAnim, stopBgAnim, initBgStars, startResultBgAnim, stopResultBgAnim, startChainLabel, flashInvalid } from "./rendering.js";
import { SFX } from "./audio.js";
import { track } from "./tracking.js";
import { getMissionText } from "./stages.js";
import { showScreen } from "./ui.js";

// ============================================================
//  Helpers (internal)
// ============================================================

function isPlayable(r, c) {
  return !isHole(r, c) && !isRock(r, c);
}

function trackClears(clearList) {
  clearList.forEach(([r, c]) => {
    if (G.board[r][c]) {
      const ci = G.board[r][c].color;
      G.colorCleared[ci] = (G.colorCleared[ci] || 0) + 1;
      G.totalCleared++;
    }
  });
}


async function handleCountdownExplosions(exploded) {
  if (exploded.length === 0) return;
  SFX.bomb();
  const cleared = new Set();
  for (const [r, c] of exploded) {
    cleared.add(r * G.cols + c);
    const queue = activateSpecial(r, c, cleared, "countdown");
    for (let qi = 0; qi < queue.length; qi++) {
      const [er, ec] = queue[qi];
      cleared.add(er * G.cols + ec);
      if (G.board[er][ec] && G.board[er][ec].special) {
        activateSpecial(er, ec, cleared, "countdown").forEach(([er2, ec2]) => {
          cleared.add(er2 * G.cols + ec2);
          queue.push([er2, ec2]);
        });
      }
    }
  }
  const clearList = [...cleared].map((v) => [Math.floor(v / G.cols), v % G.cols]);
  trackClears(clearList);
  G.score += clearList.length * SCORE_PER_PIECE;
  await animateClear(clearList);
  clearList.forEach(([r, c]) => { G.board[r][c] = null; });
  damageAdjacentIce(clearList);
  const fallMap = applyGravityData();
  await animateDrop(fallMap);
  await sleep(ANIM.CHAIN_PAUSE_MS);
}

// ============================================================
//  Tap Activation (special pieces activated by tap)
// ============================================================

export async function activateByTap(r, c) {
  if (G.animating) return;
  const piece = G.board[r][c];
  if (!piece || !piece.special || !TAP_ACTIVATE_SPECIALS.has(piece.special)) return;
  G.animating = true;
  clearHint();

  if (piece.special === "bomb") SFX.bomb();
  else if (piece.special === "line_d") { SFX.line(); SFX.diagonal(); }
  else if (piece.special === "line_h" || piece.special === "line_v") SFX.line();
  track("tap_activate", { type: piece.special, stage: G.STAGES[G.currentStage].name });
  G.movesLeft--;
  G.chainCount = 1;
  updateHUD();

  const cleared = new Set([r * G.cols + c]);
  const clearList = [[r, c]];
  const extra = activateSpecial(r, c, cleared, null);
  extra.forEach(([er, ec]) => {
    if (!cleared.has(er * G.cols + ec)) {
      cleared.add(er * G.cols + ec);
      clearList.push([er, ec]);
    }
  });

  for (let i = 0; i < clearList.length; i++) {
    const [cr, cc] = clearList[i];
    if (G.board[cr][cc] && G.board[cr][cc].special && !(cr === r && cc === c)) {
      const ex2 = activateSpecial(cr, cc, cleared, piece.special);
      ex2.forEach(([er, ec]) => {
        if (!cleared.has(er * G.cols + ec)) {
          cleared.add(er * G.cols + ec);
          clearList.push([er, ec]);
        }
      });
    }
  }

  trackClears(clearList);
  G.score += clearList.length * SCORE_PER_PIECE * G.chainCount;

  await animateClear(clearList, [{ r, c, type: piece.special, color: piece.color }]);
  clearList.forEach(([cr, cc]) => { G.board[cr][cc] = null; });
  damageAdjacentIce(clearList);

  const fallMap = applyGravityData();
  await animateDrop(fallMap);
  await sleep(ANIM.CHAIN_PAUSE_MS);

  await resolveBoard();

  updateHUD();
  checkWinLose();
  G.animating = false;
  startHintTimer();
}

// ============================================================
//  Combo Activation
// ============================================================

export function activateCombo(comboType, r, c, p1, p2) {
  const extra = [];
  const cleared = new Set();

  switch (comboType) {
    case "cross":
      for (let cc = 0; cc < G.cols; cc++) {
        if (G.board[r][cc] && isPlayable(r, cc)) extra.push([r, cc]);
      }
      for (let rr = 0; rr < G.rows; rr++) {
        if (G.board[rr][c] && isPlayable(rr, c)) extra.push([rr, c]);
      }
      break;
    case "star_cross":
      for (let cc = 0; cc < G.cols; cc++) if (G.board[r][cc] && isPlayable(r, cc)) extra.push([r, cc]);
      for (let rr = 0; rr < G.rows; rr++) if (G.board[rr][c] && isPlayable(rr, c)) extra.push([rr, c]);
      for (let d = -Math.max(G.rows, G.cols); d <= Math.max(G.rows, G.cols); d++) {
        const r1 = r + d, c1 = c + d;
        if (inBounds(r1, c1) && G.board[r1][c1] && isPlayable(r1, c1)) extra.push([r1, c1]);
        const r2 = r + d, c2 = c - d;
        if (inBounds(r2, c2) && G.board[r2][c2] && isPlayable(r2, c2)) extra.push([r2, c2]);
      }
      break;
    case "triple_line": {
      for (let d = -1; d <= 1; d++) {
        for (let cc = 0; cc < G.cols; cc++) {
          if (inBounds(r + d, cc) && G.board[r + d][cc] && isPlayable(r + d, cc)) extra.push([r + d, cc]);
        }
        for (let rr = 0; rr < G.rows; rr++) {
          if (inBounds(rr, c + d) && G.board[rr][c + d] && isPlayable(rr, c + d)) extra.push([rr, c + d]);
        }
      }
      break;
    }
    case "big_bomb":
      for (let dr = -3; dr <= 3; dr++) {
        for (let dc = -3; dc <= 3; dc++) {
          if (inBounds(r + dr, c + dc) && G.board[r + dr][c + dc] && isPlayable(r + dr, c + dc)) {
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
      for (let rr = 0; rr < G.rows; rr++) {
        for (let cc = 0; cc < G.cols; cc++) {
          if (G.board[rr][cc] && G.board[rr][cc].color === targetColor && isPlayable(rr, cc)) {
            G.board[rr][cc].special = spType;
            extra.push([rr, cc]);
          }
        }
      }
      break;
    }
    case "board_clear":
      for (let rr = 0; rr < G.rows; rr++) {
        for (let cc = 0; cc < G.cols; cc++) {
          if (G.board[rr][cc] && isPlayable(rr, cc)) extra.push([rr, cc]);
        }
      }
      break;
  }

  const unique = new Map();
  extra.forEach(([er, ec]) => unique.set(er * G.cols + ec, [er, ec]));
  return [...unique.values()];
}

// ============================================================
//  doMove — Main Move Handler
// ============================================================

export async function doMove(r1, c1, r2, c2) {
  if (G.animating) return;
  G.animating = true;
  clearHint();

  const p1 = G.board[r1][c1];
  const p2 = G.board[r2][c2];

  G.lastSwapTarget = { r: r2, c: c2 };

  SFX.swap();
  await animateSwap(r1, c1, r2, c2);
  swapPieces(r1, c1, r2, c2);

  // Special swap combo
  if (p1 && p2 && p1.special && p2.special) {
    const comboType = getComboType(p1.special, p2.special);
    if (comboType) {
      SFX.combo(comboType);
      track("special_combo", { combo_type: comboType, stage: G.STAGES[G.currentStage].name });
      G.movesLeft--;
      G.chainCount = 1;
      updateHUD();

      const comboCells = activateCombo(comboType, r2, c2, p1, p2);
      const primaryCells = comboCells.map(([r, c]) => [r, c]);
      comboCells.push([r1, c1], [r2, c2]);

      // Activate specials on combo-cleared cells (chain reaction)
      const cleared = new Set(comboCells.map(([r, c]) => r * G.cols + c));
      comboCells.forEach(([cr, cc]) => {
        if (G.board[cr][cc] && G.board[cr][cc].special && !(cr === r1 && cc === c1) && !(cr === r2 && cc === c2)) {
          const extra = activateSpecial(cr, cc, cleared, null);
          extra.forEach(([er, ec]) => {
            if (!cleared.has(er * G.cols + ec)) {
              cleared.add(er * G.cols + ec);
              comboCells.push([er, ec]);
            }
          });
        }
      });

      const clearList = [...cleared].map((v) => [Math.floor(v / G.cols), v % G.cols]);
      trackClears(clearList);
      G.score += clearList.length * SCORE_PER_PIECE * G.chainCount;

      const comboInfo = [];
      if (comboType === "board_clear") comboInfo.push({ r: r2, c: c2, type: "galaxy", color: (p2 || p1).color });
      else if (comboType === "big_bomb") comboInfo.push({ r: r2, c: c2, type: "big_bomb", color: (p2 || p1).color });
      else if (comboType === "cross" || comboType === "star_cross") comboInfo.push({ r: r2, c: c2, type: comboType, color: (p2 || p1).color });
      else if (comboType === "triple_line") comboInfo.push({ r: r2, c: c2, type: "triple_line", color: (p2 || p1).color });
      else if (comboType === "rainbow_line") comboInfo.push({ r: r2, c: c2, type: "rainbow_line", color: (p2 || p1).color, primaryCells });
      else if (comboType === "rainbow_bomb") comboInfo.push({ r: r2, c: c2, type: "rainbow_bomb", color: (p2 || p1).color, primaryCells });
      await animateClear(clearList, comboInfo);
      clearList.forEach(([r, c]) => { G.board[r][c] = null; });
      damageAdjacentIce(clearList);

      const fallMap = applyGravityData();
      await animateDrop(fallMap);
      await sleep(ANIM.CHAIN_PAUSE_MS);

      await resolveBoard();

      updateHUD();
      checkWinLose();
      G.animating = false;
      startHintTimer();
      return;
    }

    // Countdown + special: both activate independently (no combo amplification)
    if (p1.special === "countdown" || p2.special === "countdown") {
      SFX.combo("big_bomb");
      G.movesLeft--;
      G.chainCount = 1;
      updateHUD();

      const cleared = new Set([r1 * G.cols + c1, r2 * G.cols + c2]);
      const extra1 = activateSpecial(r1, c1, cleared, null);
      extra1.forEach(([r, c]) => cleared.add(r * G.cols + c));
      const extra2 = activateSpecial(r2, c2, cleared, null);
      extra2.forEach(([r, c]) => cleared.add(r * G.cols + c));

      const allCells = [...cleared].map((v) => [Math.floor(v / G.cols), v % G.cols]);
      allCells.forEach(([cr, cc]) => {
        if (G.board[cr][cc] && G.board[cr][cc].special && !(cr === r1 && cc === c1) && !(cr === r2 && cc === c2)) {
          const extra = activateSpecial(cr, cc, cleared, null);
          extra.forEach(([er, ec]) => {
            if (!cleared.has(er * G.cols + ec)) {
              cleared.add(er * G.cols + ec);
              allCells.push([er, ec]);
            }
          });
        }
      });

      const clearList = [...cleared].map((v) => [Math.floor(v / G.cols), v % G.cols]);
      trackClears(clearList);
      G.score += clearList.length * SCORE_PER_PIECE * G.chainCount;

      await animateClear(clearList, [{ r: r2, c: c2, type: "big_bomb", color: (p2 || p1).color }]);
      clearList.forEach(([r, c]) => { G.board[r][c] = null; });
      damageAdjacentIce(clearList);

      const fallMap = applyGravityData();
      await animateDrop(fallMap);
      await sleep(ANIM.CHAIN_PAUSE_MS);

      await resolveBoard();

      updateHUD();
      checkWinLose();
      G.animating = false;
      startHintTimer();
      return;
    }
  }

  // Rainbow + normal piece swap
  const rb1 = p1 && p1.special === "rainbow";
  const rb2 = p2 && p2.special === "rainbow";
  if ((rb1 || rb2) && !(rb1 && rb2)) {
    const rainbow = rb1 ? p1 : p2;
    const other = rb1 ? p2 : p1;
    const rainbowR = rb1 ? r2 : r1;
    const rainbowC = rb1 ? c2 : c1;
    const otherR = rb1 ? r1 : r2;
    const otherC = rb1 ? c1 : c2;
    if (!other.special) {
      const targetColor = other.color;
      SFX.combo("rainbow_line");
      track("rainbow_swap", { target_color: targetColor, stage: G.STAGES[G.currentStage].name });
      G.movesLeft--;
      G.chainCount = 1;
      updateHUD();

      const clearList = [[rainbowR, rainbowC]];
      const cleared = new Set([rainbowR * G.cols + rainbowC]);
      for (let rr = 0; rr < G.rows; rr++) {
        for (let cc = 0; cc < G.cols; cc++) {
          if (G.board[rr][cc] && G.board[rr][cc].color === targetColor && !cleared.has(rr * G.cols + cc) && isPlayable(rr, cc)) {
            cleared.add(rr * G.cols + cc);
            clearList.push([rr, cc]);
          }
        }
      }
      clearList.forEach(([cr, cc]) => {
        if (G.board[cr][cc] && G.board[cr][cc].special && !(cr === rainbowR && cc === rainbowC)) {
          const extra = activateSpecial(cr, cc, cleared, null);
          extra.forEach(([er, ec]) => {
            if (!cleared.has(er * G.cols + ec)) {
              cleared.add(er * G.cols + ec);
              clearList.push([er, ec]);
            }
          });
        }
      });

      trackClears(clearList);
      G.score += clearList.length * SCORE_PER_PIECE * G.chainCount;

      await animateClear(clearList, [{ r: rainbowR, c: rainbowC, type: "rainbow", color: targetColor }]);
      clearList.forEach(([cr, cc]) => { G.board[cr][cc] = null; });
      damageAdjacentIce(clearList);

      const fallMap = applyGravityData();
      await animateDrop(fallMap);
      await sleep(ANIM.CHAIN_PAUSE_MS);

      await resolveBoard();

      updateHUD();
      checkWinLose();
      G.animating = false;
      startHintTimer();
      return;
    }
  }

  const matches = findAllMatches();
  if (matches.length === 0) {
    SFX.invalidSwap();
    await animateSwap(r2, c2, r1, c1);
    swapPieces(r1, c1, r2, c2);
    await flashInvalid(r1, c1, r2, c2);
    G.animating = false;
    drawBoard();
    startHintTimer();
    return;
  }

  G.movesLeft--;
  G.chainCount = 0;
  updateHUD();

  await resolveBoard();
  G.lastSwapTarget = null;

  updateHUD();
  checkWinLose();
  G.animating = false;
  startHintTimer();
}

// ============================================================
//  resolveMatches / resolveBoard
// ============================================================

export async function resolveMatches() {
  let matches = findAllMatches();
  while (matches.length > 0) {
    G.chainCount++;
    if (G.chainCount > G.maxChain) G.maxChain = G.chainCount;
    const specials = findSpecialCreations(matches);
    G.lastSwapTarget = null;

    const cleared = new Set();
    matches.forEach(([r, c]) => cleared.add(r * G.cols + c));

    let hasSpecialActivation = false;
    const specialInfos = [];
    matches.forEach(([r, c]) => {
      if (G.board[r][c] && G.board[r][c].special) {
        hasSpecialActivation = true;
        const sp = G.board[r][c].special;
        if (sp === "bomb" || sp === "countdown") SFX.bomb();
        else if (sp === "line_h" || sp === "line_v") SFX.line();
        else if (sp === "line_d") { SFX.line(); SFX.diagonal(); }
        else if (sp === "rainbow") SFX.rainbow();
        specialInfos.push({ r, c, type: sp, color: G.board[r][c].color });
        const queue = activateSpecial(r, c, cleared);
        for (let qi = 0; qi < queue.length; qi++) {
          const [er, ec] = queue[qi];
          cleared.add(er * G.cols + ec);
          if (G.board[er][ec] && G.board[er][ec].special) {
            activateSpecial(er, ec, cleared, sp).forEach(([er2, ec2]) => {
              cleared.add(er2 * G.cols + ec2);
              queue.push([er2, ec2]);
            });
          }
        }
      }
    });

    const clearList = [...cleared].map((v) => [Math.floor(v / G.cols), v % G.cols]);

    trackClears(clearList);
    G.score += clearList.length * SCORE_PER_PIECE * G.chainCount;

    if (!hasSpecialActivation) SFX.clear(G.chainCount);

    if (G.chainCount > 1) {
      startChainLabel(G.chainCount);
    }

    await animateClear(clearList, specialInfos);

    clearList.forEach(([r, c]) => {
      G.board[r][c] = null;
    });

    damageAdjacentIce(clearList);

    specials.forEach((sp) => {
      if (G.board[sp.r] && G.board[sp.r][sp.c] === null) {
        G.board[sp.r][sp.c] = { color: sp.color, special: sp.type };
        G.specialsCreated++;
      } else if (G.board[sp.r] && G.board[sp.r][sp.c]) {
        G.board[sp.r][sp.c].special = sp.type;
        G.specialsCreated++;
      }
    });

    const fallMap = applyGravityData();
    if (fallMap.length > 0) SFX.drop();
    await animateDrop(fallMap);

    updateHUD();

    await sleep(Math.max(60, ANIM.CHAIN_PAUSE_MS - G.chainCount * 25));

    matches = findAllMatches();
  }
}

export async function resolveBoard() {
  await resolveMatches();
  const exploded = tickCountdowns();
  if (exploded.length > 0) {
    await handleCountdownExplosions(exploded);
    await resolveMatches();
  }
}

// ============================================================
//  Item System
// ============================================================

export function updateItemBar() {
  const coins = G.saveData.coins || 0;
  const el = G.dom.itemCoinCount;
  if (G.debugMode) {
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

export function cancelItemMode() {
  G.itemMode = null;
  G.canvas.classList.remove("item-targeting");
}

export async function usePinpoint(r, c) {
  if (!G.board[r][c] || (!G.debugMode && (G.saveData.coins || 0) < ITEM_COSTS.pinpoint)) {
    cancelItemMode();
    return;
  }
  G.animating = true;
  if (!G.debugMode) { G.saveData.coins -= ITEM_COSTS.pinpoint; writeSave(); SFX.coinSpend(); }
  updateItemBar();

  const cleared = new Set();
  cleared.add(r * G.cols + c);
  if (G.board[r][c].special) {
    const sp = G.board[r][c].special;
    if (sp === "bomb" || sp === "countdown") SFX.bomb();
    else if (sp === "line_h" || sp === "line_v" || sp === "line_d") SFX.line();
    else if (sp === "rainbow") SFX.rainbow();
    const queue = activateSpecial(r, c, cleared);
    for (let qi = 0; qi < queue.length; qi++) {
      const [er, ec] = queue[qi];
      cleared.add(er * G.cols + ec);
      if (G.board[er][ec] && G.board[er][ec].special) {
        activateSpecial(er, ec, cleared, sp).forEach(([er2, ec2]) => {
          cleared.add(er2 * G.cols + ec2);
          queue.push([er2, ec2]);
        });
      }
    }
  }

  const clearList = [...cleared].map(v => [Math.floor(v / G.cols), v % G.cols]);
  trackClears(clearList);
  G.score += clearList.length * SCORE_PER_PIECE;

  if (!G.board[r][c].special) SFX.bomb();
  await animateClear(clearList);
  clearList.forEach(([cr, cc]) => { G.board[cr][cc] = null; });
  damageAdjacentIce(clearList);

  const fallMap = applyGravityData();
  if (fallMap.length > 0) SFX.drop();
  await animateDrop(fallMap);
  await sleep(ANIM.CHAIN_PAUSE_MS);
  await resolveBoard();

  updateHUD();
  checkWinLose();
  G.animating = false;
  startHintTimer();
}

export async function useShuffle() {
  G.animating = true;
  if (!G.debugMode) { G.saveData.coins -= ITEM_COSTS.shuffle; writeSave(); SFX.coinSpend(); }
  updateItemBar();

  const pieces = [];
  const positions = [];
  for (let r = 0; r < G.rows; r++) {
    for (let c = 0; c < G.cols; c++) {
      if (G.board[r][c]) {
        pieces.push(G.board[r][c]);
        positions.push([r, c]);
      }
    }
  }

  for (let i = pieces.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
  }

  positions.forEach(([r, c], idx) => { G.board[r][c] = pieces[idx]; });

  SFX.swap();
  drawBoard();
  await sleep(300);
  await resolveBoard();

  updateHUD();
  checkWinLose();
  G.animating = false;
  startHintTimer();
}

export function useAddMoves() {
  if (!G.debugMode) { G.saveData.coins -= ITEM_COSTS.addmoves; writeSave(); }
  SFX.coinSpend();
  G.movesLeft += 3;
  updateHUD();
  updateItemBar();
  SFX.addMovesChime();
  startHintTimer();
}

async function useColorBomb(colorIndex) {
  G.animating = true;
  if (!G.debugMode) { G.saveData.coins -= ITEM_COSTS.colorbomb; writeSave(); SFX.coinSpend(); }
  updateItemBar();

  const cleared = new Set();
  for (let r = 0; r < G.rows; r++) {
    for (let c = 0; c < G.cols; c++) {
      if (G.board[r][c] && G.board[r][c].color === colorIndex) {
        cleared.add(r * G.cols + c);
      }
    }
  }

  if (cleared.size === 0) {
    G.animating = false;
    return;
  }

  const clearList = [...cleared].map(v => [Math.floor(v / G.cols), v % G.cols]);
  trackClears(clearList);
  G.score += clearList.length * SCORE_PER_PIECE;

  SFX.rainbow();
  await animateClear(clearList);
  clearList.forEach(([cr, cc]) => { G.board[cr][cc] = null; });

  const fallMap = applyGravityData();
  if (fallMap.length > 0) SFX.drop();
  await animateDrop(fallMap);
  await sleep(ANIM.CHAIN_PAUSE_MS);
  await resolveBoard();

  updateHUD();
  checkWinLose();
  G.animating = false;
  startHintTimer();
}

export function showColorPicker() {
  const grid = document.getElementById("color-picker-grid");
  grid.innerHTML = "";
  const numColors = G.STAGES[G.currentStage].colors;
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

export function spawnSpecialAt(r, c, type) {
  if (!G.board[r][c] || !isPlayable(r, c)) return;
  if (type === "diagonal") type = "line_d";
  if (type === "countdown") {
    G.board[r][c].special = "countdown";
    G.board[r][c].countdown = 5;
  } else {
    G.board[r][c].special = type;
  }
  drawBoard();
}

// ============================================================
//  HUD
// ============================================================

export function updateHUD() {
  const d = G.dom;
  d.hudStage.textContent = `Stage ${G.STAGES[G.currentStage].name}`;
  d.hudMoves.textContent = `のこり ${G.movesLeft} 手`;

  const m = G.STAGES[G.currentStage].mission;
  d.hudMissionLabel.innerHTML = getMissionText(m, true);

  let current = 0;
  let target = 0;
  switch (m.type) {
    case "score":
      current = G.score;
      target = m.target;
      d.hudMissionProgress.textContent = `${current} / ${target} 点`;
      break;
    case "clear":
      current = G.totalCleared;
      target = m.count;
      d.hudMissionProgress.textContent = `${current} / ${target} 個`;
      break;
    case "color":
      current = G.colorCleared[m.colorIndex] || 0;
      target = m.count;
      d.hudMissionProgress.textContent = `${current} / ${target} 個`;
      break;
    case "special":
      current = G.specialsCreated;
      target = m.count;
      d.hudMissionProgress.textContent = `${current} / ${target} 個`;
      break;
    case "chain":
      current = G.maxChain;
      target = m.count;
      d.hudMissionProgress.textContent = `${current} / ${target} チェイン`;
      break;
  }

  if (current >= target) {
    d.hudMissionProgress.style.color = "#4ecdc4";
  } else {
    d.hudMissionProgress.style.color = "";
  }

  const stg = G.STAGES[G.currentStage];
  const usedMoves = stg.moves - G.movesLeft;
  let currentStars = 3;
  if (usedMoves > stg.star3moves) currentStars = 2;
  if (usedMoves > stg.star2moves) currentStars = 1;

  let html = "";
  for (let s = 0; s < 3; s++) {
    html += s < currentStars
      ? '<span class="star-on">★</span>'
      : '<span class="star-off">★</span>';
  }
  if (currentStars === 3) {
    const margin = stg.star3moves - usedMoves;
    if (margin >= 1) html += `<span class="star-hint">あと${margin}手</span>`;
  } else if (currentStars === 2) {
    const margin = stg.star2moves - usedMoves;
    if (margin >= 1) html += `<span class="star-hint">あと${margin}手</span>`;
  }
  d.hudStars.innerHTML = html;
}

// ============================================================
//  Win / Lose
// ============================================================

export function checkWinLose() {
  const m = G.STAGES[G.currentStage].mission;
  let cleared = false;

  switch (m.type) {
    case "score":
      cleared = G.score >= m.target;
      break;
    case "clear":
      cleared = G.totalCleared >= m.count;
      break;
    case "color":
      cleared = (G.colorCleared[m.colorIndex] || 0) >= m.count;
      break;
    case "special":
      cleared = G.specialsCreated >= m.count;
      break;
    case "chain":
      cleared = G.maxChain >= m.count;
      break;
  }

  if (cleared) {
    const stg = G.STAGES[G.currentStage];
    const usedMoves = stg.moves - G.movesLeft;
    let stars = 1;
    if (usedMoves <= stg.star3moves) stars = 3;
    else if (usedMoves <= stg.star2moves) stars = 2;

    const prev = G.saveData.bestStars[G.currentStage] || 0;
    const isFirstClear = !G.saveData.cleared[G.currentStage];
    G.coinsEarned = stars;
    const newStars = Math.max(0, stars - prev);
    G.coinsEarned += newStars * 2;
    if (isFirstClear && STAR_GATES.some(g => g.stage === G.currentStage)) {
      G.coinsEarned += 5;
    }
    G.saveData.coins = (G.saveData.coins || 0) + G.coinsEarned;

    if (stars > prev) G.saveData.bestStars[G.currentStage] = stars;
    G.saveData.cleared[G.currentStage] = true;
    writeSave();

    SFX.stageClear();
    addScreenShake(3);
    const cx = G.boardPixelW / 2;
    const cy = G.boardPixelH / 2;
    const colors = ["#ffd700", "#e94560", "#4ecdc4", "#ff8a5c", "#fff"];
    colors.forEach(color => {
      addBurstParticles(cx, cy, color, 8, { speed: 5, size: 6, decay: 0.015, sizeDecay: 0.04 });
    });
    addShockwave(cx, cy, G.boardPixelW * 0.6, 20, "#ffd700");
    track("stage_clear", { stage: stg.name, stars, moves_used: usedMoves, moves_total: stg.moves, mission_type: stg.mission.type, coins_earned: G.coinsEarned });
    setTimeout(() => showResult(true, stars), 800);
  } else if (G.movesLeft <= 0) {
    const stg = G.STAGES[G.currentStage];
    SFX.stageFail();
    track("stage_fail", { stage: stg.name, moves_total: stg.moves, mission_type: stg.mission.type });
    showResult(false, 0, m);
  }
}

export function getFailureProgress(mission) {
  switch (mission.type) {
    case "score": return `スコア ${G.score} / ${mission.target}（あと${mission.target - G.score}）`;
    case "clear": return `消去 ${G.totalCleared} / ${mission.count}（あと${mission.count - G.totalCleared}個）`;
    case "color": {
      const done = G.colorCleared[mission.colorIndex] || 0;
      return `${PIECE_NAMES_JA[mission.colorIndex]} ${done} / ${mission.count}（あと${mission.count - done}個）`;
    }
    case "special": return `特殊ピース ${G.specialsCreated} / ${mission.count}（あと${mission.count - G.specialsCreated}個）`;
    case "chain": return `最大チェイン ${G.maxChain} / ${mission.count}`;
  }
  return "";
}

export function showResult(win, stars, failedMission) {
  const d = G.dom;
  d.resultTitle.textContent = win ? "クリア！" : "あと少し…";
  d.resultStars.innerHTML = "";

  if (win) {
    for (let i = 0; i < 3; i++) {
      const span = document.createElement("span");
      span.textContent = i < stars ? "★" : "☆";
      span.style.opacity = "0";
      span.style.display = "inline-block";
      span.style.transition = "opacity 0.3s, transform 0.3s";
      span.style.transform = "scale(0.3)";
      if (i < stars) span.style.color = "#ffd700";
      d.resultStars.appendChild(span);
      setTimeout(() => {
        span.style.opacity = "1";
        span.style.transform = "scale(1.2)";
        setTimeout(() => { span.style.transform = "scale(1)"; }, 200);
      }, 300 + i * 300);
    }
  }

  let details = `スコア: ${G.score}`;
  if (win && G.coinsEarned > 0) {
    details += `<br><span class="coin-icon"></span> +${G.coinsEarned} コイン（所持: ${G.saveData.coins || 0}）`;
  }
  if (!win && failedMission) {
    details += `<br><span style="color:#4ecdc4">${getFailureProgress(failedMission)}</span>`;
  }
  d.resultDetails.innerHTML = details;
  d.btnNext.style.display = win && G.currentStage < G.STAGES.length - 1 ? "" : "none";

  if (!win && (G.debugMode || (G.saveData.coins || 0) >= ITEM_COSTS.addmoves)) {
    d.btnRescue.style.display = "";
  } else {
    d.btnRescue.style.display = "none";
  }

  showScreen("result");
}
