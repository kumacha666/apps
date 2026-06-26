import { G, COLS, ROWS } from "./state";
import {
  findAllMatches, findSpecialCreations, activateSpecial, applyGravity,
  swapPieces, isAdjacentAllowed, createBoard, autoDetonateCheck, tickCountdowns,
  inBounds,
} from "./board";
import { has } from "./upgrades";
import { drawBoard, startChainLabel } from "./rendering";
import { animateSwap, animateStandardClear, animateDrop, sleep } from "./animations";
import type { FallEntry } from "./animations";
import { addScreenShake } from "./vfx";

function updateHUD(): void {
  document.getElementById("hud-stage")!.textContent = `Stage ${G.run.stage + 1}`;
  document.getElementById("hud-score")!.textContent = `${G.score} / ${G.stageTarget}点`;
  document.getElementById("hud-moves")!.textContent = `のこり ${G.movesLeft} 手`;
}

function updateUpgradeList(): void {
  const el = document.getElementById("upgrade-list")!;
  if (G.run.upgrades.length === 0) {
    el.classList.add("hidden");
    return;
  }
  el.classList.remove("hidden");
  import("./upgrades").then(({ ALL_UPGRADES }) => {
    el.innerHTML = G.run.upgrades.map(id => {
      const def = ALL_UPGRADES.find(u => u.id === id);
      return `<span class="upgrade-badge" title="${def?.name ?? id}">${def?.icon ?? "?"}</span>`;
    }).join("");
  });
}

export function getStageTarget(stage: number): number {
  return 200 + stage * 150 + Math.floor(stage * stage * 10);
}

export function getStageMoves(stage: number): number {
  return Math.max(8, 20 - Math.floor(stage / 3));
}

export function startRun(): void {
  G.run = { stage: 0, score: 0, totalCleared: 0, upgrades: [], resonanceCounts: new Array(7).fill(0) };
  startStage();
}

export function startStage(): void {
  G.score = 0;
  G.totalCleared = 0;
  G.chainCount = 0;
  G.maxChain = 0;
  G.proliferationColor = null;
  G.clearCountThisTurn = 0;
  G.stageTarget = getStageTarget(G.run.stage);
  G.movesLeft = getStageMoves(G.run.stage);
  G.animating = false;

  createBoard();

  showScreen("game");
  updateHUD();
  updateUpgradeList();
  drawBoard();
}

export function showScreen(name: string): void {
  document.querySelectorAll(".screen").forEach(el => el.classList.add("hidden"));
  const hud = document.getElementById("hud")!;
  const upgradeList = document.getElementById("upgrade-list")!;

  if (name === "game") {
    hud.classList.remove("hidden");
    if (G.run.upgrades.length > 0) upgradeList.classList.remove("hidden");
  } else {
    hud.classList.add("hidden");
    upgradeList.classList.add("hidden");
    if (name !== "none") {
      document.getElementById(`${name}-screen`)!.classList.remove("hidden");
    }
  }
}

// --- Capture fall data before gravity for animation ---

function captureAndApplyGravity(): FallEntry[] {
  const fallEntries: FallEntry[] = [];

  // Count empty cells per column before gravity
  const emptyCounts: number[] = [];
  for (let c = 0; c < COLS; c++) {
    let empty = 0;
    for (let r = 0; r < ROWS; r++) {
      if (!G.board[r][c]) empty++;
    }
    emptyCounts.push(empty);

    // Capture existing piece movements
    const pieces: { piece: typeof G.board[0][0]; fromR: number }[] = [];
    for (let r = ROWS - 1; r >= 0; r--) {
      if (G.board[r][c]) {
        pieces.push({ piece: G.board[r][c], fromR: r });
      }
    }
    let writeRow = ROWS - 1;
    for (const entry of pieces) {
      if (entry.fromR !== writeRow) {
        fallEntries.push({
          c,
          fromR: entry.fromR,
          toR: writeRow,
          piece: entry.piece!,
        });
      }
      writeRow--;
    }
  }

  applyGravity();

  // Capture newly spawned pieces (only in columns that had empties)
  for (let c = 0; c < COLS; c++) {
    const newCount = emptyCounts[c];
    if (newCount === 0) continue;
    for (let i = 0; i < newCount; i++) {
      const toR = i;
      if (G.board[toR][c]) {
        fallEntries.push({
          c,
          fromR: toR - newCount,
          toR,
          piece: G.board[toR][c]!,
        });
      }
    }
  }

  return fallEntries;
}

function boardHasHoles(): boolean {
  for (let c = 0; c < COLS; c++) {
    let foundEmpty = false;
    for (let r = 0; r < ROWS; r++) {
      if (!G.board[r][c]) foundEmpty = true;
      else if (foundEmpty) return true;
    }
  }
  return false;
}

export async function doMove(r1: number, c1: number, r2: number, c2: number): Promise<void> {
  if (G.animating) return;
  if (!isAdjacentAllowed(r1, c1, r2, c2)) return;

  G.animating = true;

  try {
    G.lastSwapDir = { dr: r2 - r1, dc: c2 - c1 };

    // Animate swap
    await animateSwap(r1, c1, r2, c2);

    // Actually swap
    swapPieces(r1, c1, r2, c2);
    const matches = findAllMatches();

    if (matches.length === 0) {
      // Invalid move: animate swap back
      await animateSwap(r2, c2, r1, c1);
      swapPieces(r1, c1, r2, c2);
      G.lastSwapDir = null;
      return;
    }

    // Afterimage
    if (has(G.run.upgrades, "afterimage")) {
      const p = G.board[r2][c2];
      if (p) {
        if (G.board[r1][c1]) {
          G.board[r1][c1] = null;
          G.totalCleared++;
          G.score += 10;
        }
      }
    }

    // Mirror
    if (has(G.run.upgrades, "mirror")) {
      const mc1 = COLS - 1 - c1;
      const mc2 = COLS - 1 - c2;
      if (mc1 !== c1 && mc2 !== c2 && inBounds(r1, mc1) && inBounds(r2, mc2) &&
        G.board[r1][mc1] && G.board[r2][mc2]) {
        swapPieces(r1, mc1, r2, mc2);
      }
    }

    G.movesLeft--;
    G.chainCount = 0;
    G.clearCountThisTurn = 0;

    await resolveBoard();

    // Meltdown
    if (has(G.run.upgrades, "meltdown") && G.clearCountThisTurn >= 10) {
      await meltdownEffect();
    }

    G.lastSwapDir = null;
    updateHUD();
    drawBoard();

    checkWinLose();
  } finally {
    G.animating = false;
  }
}

async function resolveBoard(): Promise<void> {
  let matches = findAllMatches();
  while (matches.length > 0) {
    G.chainCount++;
    if (G.chainCount > G.maxChain) G.maxChain = G.chainCount;

    // Show chain label for chains >= 2
    if (G.chainCount >= 2) {
      startChainLabel(G.chainCount);
      if (G.chainCount >= 3) addScreenShake(Math.min(G.chainCount * 0.8, 4));
    }

    const specials = findSpecialCreations(matches);

    const cleared = new Set<number>();
    matches.forEach(([r, c]) => cleared.add(r * COLS + c));

    // Activate specials in matched cells
    for (const [r, c] of matches) {
      if (G.board[r][c]?.special) {
        const extra = activateSpecial(r, c, cleared);
        extra.forEach(([er, ec]) => cleared.add(er * COLS + ec));
      }
    }

    // Chain reaction
    const clearList = [...cleared].map(v => [Math.floor(v / COLS), v % COLS] as [number, number]);
    for (let i = 0; i < clearList.length; i++) {
      const [cr, cc] = clearList[i];
      if (G.board[cr]?.[cc]?.special && !matches.some(([mr, mc]) => mr === cr && mc === cc)) {
        const extra = activateSpecial(cr, cc, cleared);
        extra.forEach(([er, ec]) => {
          if (!cleared.has(er * COLS + ec)) {
            cleared.add(er * COLS + ec);
            clearList.push([er, ec]);
          }
        });
      }
    }

    // Infection (capped to prevent infinite loops)
    if (has(G.run.upgrades, "infection") && G.chainCount <= 8) {
      const infectedCells: [number, number, number][] = [];
      for (const [r, c] of clearList) {
        if (!G.board[r]?.[c]) continue;
        const color = G.board[r][c]!.color;
        const neighbors: [number, number][] = [
          [r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1],
        ];
        for (const [nr, nc] of neighbors) {
          if (inBounds(nr, nc) && G.board[nr][nc] && !cleared.has(nr * COLS + nc)) {
            infectedCells.push([nr, nc, color]);
          }
        }
      }
      for (const [ir, ic, color] of infectedCells) {
        if (G.board[ir][ic]) G.board[ir][ic]!.color = color;
      }
    }

    // Resonance
    if (has(G.run.upgrades, "resonance")) {
      for (const [r, c] of clearList) {
        if (G.board[r]?.[c]) {
          const ci = G.board[r][c]!.color;
          G.run.resonanceCounts[ci] = (G.run.resonanceCounts[ci] || 0) + 1;
        }
      }
    }

    // Proliferation
    if (has(G.run.upgrades, "proliferation") && clearList.length > 0) {
      const colorCounts: Record<number, number> = {};
      for (const [r, c] of clearList) {
        if (G.board[r]?.[c]) {
          const ci = G.board[r][c]!.color;
          colorCounts[ci] = (colorCounts[ci] || 0) + 1;
        }
      }
      let maxC = -1, maxN = 0;
      for (const [ci, n] of Object.entries(colorCounts)) {
        if (n > maxN) { maxN = n; maxC = Number(ci); }
      }
      if (maxC >= 0) G.proliferationColor = maxC;
    }

    // Score
    const scoreMultiplier = G.chainCount;
    const baseScore = clearList.length * 10 * scoreMultiplier;
    G.score += baseScore;
    G.totalCleared += clearList.length;
    G.run.totalCleared += clearList.length;
    G.clearCountThisTurn += clearList.length;

    // Animate clear
    await animateStandardClear(clearList);

    // Clear pieces
    for (const [r, c] of clearList) {
      G.board[r][c] = null;
    }

    // Place specials
    for (const sp of specials) {
      if (G.board[sp.r]?.[sp.c] === null) {
        G.board[sp.r][sp.c] = { color: sp.color, special: sp.type };
      }
    }

    // Spawn special (upgrade)
    if (has(G.run.upgrades, "spawn_special")) {
      for (const sp of specials) {
        let attempts = 0;
        while (attempts < 30) {
          const sr = Math.floor(Math.random() * ROWS);
          const sc = Math.floor(Math.random() * COLS);
          if (G.board[sr][sc] && !G.board[sr][sc]!.special) {
            G.board[sr][sc]!.special = sp.type;
            break;
          }
          attempts++;
        }
      }
    }

    // Chain bombs
    if (has(G.run.upgrades, "chain_bombs") && G.chainCount >= 3) {
      const bombCount = Math.min(3, G.chainCount - 2);
      for (let i = 0; i < bombCount; i++) {
        let attempts = 0;
        while (attempts < 30) {
          const sr = Math.floor(Math.random() * ROWS);
          const sc = Math.floor(Math.random() * COLS);
          if (G.board[sr][sc] && !G.board[sr][sc]!.special) {
            G.board[sr][sc]!.special = "bomb";
            break;
          }
          attempts++;
        }
      }
    }

    // Capture fall data then apply gravity
    const fallEntries = captureAndApplyGravity();

    // Animate drop
    await animateDrop(fallEntries);

    // Blackhole effect
    if (has(G.run.upgrades, "blackhole")) {
      await blackholeEffect(clearList);
    }

    // Auto-detonate
    const detonateTargets = autoDetonateCheck();
    if (detonateTargets.length > 0) {
      const detCleared = new Set<number>();
      for (const [dr, dc] of detonateTargets) {
        detCleared.add(dr * COLS + dc);
        const extra = activateSpecial(dr, dc, detCleared);
        extra.forEach(([er, ec]) => detCleared.add(er * COLS + ec));
      }
      const detList = [...detCleared].map(v => [Math.floor(v / COLS), v % COLS] as [number, number]);
      G.score += detList.length * 10;
      G.totalCleared += detList.length;
      G.clearCountThisTurn += detList.length;

      await animateStandardClear(detList);

      for (const [r, c] of detList) {
        G.board[r][c] = null;
      }
      const detFalls = captureAndApplyGravity();
      await animateDrop(detFalls);
    }

    // Safety: ensure no holes remain before next match check
    if (boardHasHoles()) {
      const safetyFalls = captureAndApplyGravity();
      if (safetyFalls.length > 0) await animateDrop(safetyFalls);
    }

    updateHUD();
    matches = findAllMatches();
  }

  // Tick countdowns
  if (has(G.run.upgrades, "timed_bombs")) {
    const exploded = tickCountdowns();
    if (exploded.length > 0) {
      const cleared = new Set<number>();
      for (const [r, c] of exploded) {
        cleared.add(r * COLS + c);
        const extra = activateSpecial(r, c, cleared);
        extra.forEach(([er, ec]) => cleared.add(er * COLS + ec));
      }
      const clearList = [...cleared].map(v => [Math.floor(v / COLS), v % COLS] as [number, number]);
      G.score += clearList.length * 10;
      G.totalCleared += clearList.length;
      G.clearCountThisTurn += clearList.length;

      await animateStandardClear(clearList);

      for (const [r, c] of clearList) { G.board[r][c] = null; }
      const cdFalls = captureAndApplyGravity();
      await animateDrop(cdFalls);

      await resolveBoard();
    }
  }
}

async function blackholeEffect(clearList: [number, number][]): Promise<void> {
  const absorbCount = Math.min(3, clearList.length);
  const absorbed = new Set<number>();
  for (let i = 0; i < absorbCount; i++) {
    const [r, c] = clearList[Math.floor(Math.random() * clearList.length)];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const nr = r + dr, nc = c + dc;
        if (inBounds(nr, nc) && G.board[nr][nc] && !absorbed.has(nr * COLS + nc)) {
          absorbed.add(nr * COLS + nc);
        }
      }
    }
  }
  if (absorbed.size > 0) {
    const absList = [...absorbed].map(v => [Math.floor(v / COLS), v % COLS] as [number, number]);
    G.score += absList.length * 5;
    G.totalCleared += absList.length;
    G.clearCountThisTurn += absList.length;

    await animateStandardClear(absList);

    for (const [r, c] of absList) { G.board[r][c] = null; }
    const bhFalls = captureAndApplyGravity();
    await animateDrop(bhFalls);
  }
}

async function meltdownEffect(): Promise<void> {
  for (let c = 0; c < COLS; c++) {
    for (let r = ROWS - 1; r > 0; r--) {
      G.board[r][c] = G.board[r - 1][c];
    }
    G.board[0][c] = { color: Math.floor(Math.random() * 5), special: null };
  }
  drawBoard();
  await sleep(150);
}

function checkWinLose(): void {
  if (G.score >= G.stageTarget) {
    setTimeout(() => showStageClear(), 300);
  } else if (G.movesLeft <= 0) {
    setTimeout(() => showGameOver(), 300);
  }
}

function showStageClear(): void {
  const info = document.getElementById("stageclear-info")!;
  info.innerHTML = `スコア: ${G.score}<br>チェイン: ${G.maxChain}<br>消去: ${G.totalCleared}個`;

  showScreen("stageclear");
  setTimeout(() => showUpgradeScreen(), 1500);
}

function showUpgradeScreen(): void {
  import("./upgrades").then(({ pickUpgradeChoices }) => {
    const choices = pickUpgradeChoices(G.run.upgrades, 3);

    if (choices.length === 0) {
      G.run.stage++;
      startStage();
      return;
    }

    const container = document.getElementById("upgrade-cards")!;
    container.innerHTML = "";

    for (const choice of choices) {
      const card = document.createElement("div");
      card.className = `upgrade-card rarity-${choice.rarity}`;
      card.innerHTML = `
        <div class="icon">${choice.icon}</div>
        <div class="name">${choice.name}</div>
        <div class="desc">${choice.desc}</div>
      `;
      card.addEventListener("click", () => {
        G.run.upgrades.push(choice.id);
        G.run.stage++;
        startStage();
      });
      container.appendChild(card);
    }

    showScreen("upgrade");
  });
}

function showGameOver(): void {
  const stats = document.getElementById("gameover-stats")!;
  stats.innerHTML = `
    到達ステージ: ${G.run.stage + 1}<br>
    総スコア: ${G.run.score + G.score}<br>
    総消去: ${G.run.totalCleared}個<br>
    取得アップグレード: ${G.run.upgrades.length}個
  `;
  showScreen("gameover");
}
