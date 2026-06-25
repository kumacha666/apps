/**
 * ナナメッチ シミュレーションテスト
 *
 * ゲームロジックをヘッドレスで実行し、統計を収集する。
 * 使い方:
 *   node scripts/simulate.mjs                    # 主要ステージを各50回
 *   node scripts/simulate.mjs --stages 100-110   # ステージ範囲指定
 *   node scripts/simulate.mjs --stages 100,200   # カンマ区切り
 *   node scripts/simulate.mjs --runs 200         # 試行回数指定
 *   node scripts/simulate.mjs --verbose          # 各ゲームの詳細出力
 */

// --- SFX stub (audio.js は AudioContext 依存なので差し替え) ---
const sfxStub = new Proxy({}, { get: () => () => {} });

// --- Dynamic import with module mock ---
import { register } from "node:module";
import { pathToFileURL } from "node:url";

// SFX を差し替えるため、state.js の localStorage 依存も回避
const origImport = globalThis[Symbol.for("import")] || null;

// state.js の localStorage 参照を回避
if (typeof globalThis.localStorage === "undefined") {
  globalThis.localStorage = {
    getItem: () => null,
    setItem: () => {},
  };
}
if (typeof globalThis.document === "undefined") {
  globalThis.document = {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
  };
}

// --- Imports ---
const { G, MATCH_MIN, SCORE_PER_PIECE } = await import("../src/state.js");

// audio.js の SFX を差し替え
// board.js は import { SFX } from "./audio.js" しているので、
// audio.js をモック化するため直接書き換える
import {
  createBoard, initCellState, findAllMatches, findSpecialCreations,
  activateSpecial, applyGravityData, swapPieces, countAvailableMoves,
  damageAdjacentIce, tickCountdowns, isPlayable, inBounds, isIce,
  randomPiece, isHole, isRock, isMatchable,
} from "../src/board.js";
import { buildStages } from "../src/stages.js";

// --- Game simulation ---
function initGameState(stageIndex) {
  const stages = buildStages();
  G.STAGES = stages;
  G.currentStage = stageIndex;
  const stg = stages[stageIndex];

  G.cols = stg.boardCols;
  G.rows = stg.boardRows;
  G.movesLeft = stg.moves;
  G.mission = stg.mission;
  G.missionProgress = {};
  G.score = 0;
  G.totalCleared = 0;
  G.colorCleared = [];
  G.chainCount = 0;
  G.specialsCreated = 0;
  G.maxChain = 0;
  G.lastSwapTarget = null;
  G.board = [];
  G.cellState = [];

  initCellState(stg);
  createBoard(stg.colors);
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

function resolveMatchesSync() {
  let matches = findAllMatches();
  while (matches.length > 0) {
    G.chainCount++;
    if (G.chainCount > G.maxChain) G.maxChain = G.chainCount;
    const specials = findSpecialCreations(matches);
    G.lastSwapTarget = null;

    const cleared = new Set();
    matches.forEach(([r, c]) => cleared.add(r * G.cols + c));

    matches.forEach(([r, c]) => {
      if (G.board[r][c] && G.board[r][c].special) {
        const queue = activateSpecial(r, c, cleared);
        for (let qi = 0; qi < queue.length; qi++) {
          const [er, ec] = queue[qi];
          cleared.add(er * G.cols + ec);
          if (G.board[er][ec] && G.board[er][ec].special) {
            activateSpecial(er, ec, cleared, G.board[r][c].special).forEach(([er2, ec2]) => {
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

    clearList.forEach(([r, c]) => { G.board[r][c] = null; });
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

    applyGravityData();
    matches = findAllMatches();
  }
}

function handleCountdownExplosionsSync(exploded) {
  if (exploded.length === 0) return;
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
  clearList.forEach(([r, c]) => { G.board[r][c] = null; });
  damageAdjacentIce(clearList);
  applyGravityData();
}

function resolveBoardSync() {
  resolveMatchesSync();
  const exploded = tickCountdowns();
  if (exploded.length > 0) {
    handleCountdownExplosionsSync(exploded);
    resolveMatchesSync();
  }
}

function findValidMoves() {
  const moves = [];
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
        swapPieces(r, c, nr, nc);
        if (matches.length > 0) {
          moves.push({ r1: r, c1: c, r2: nr, c2: nc });
        }
      }
    }
  }
  return moves;
}

function checkMissionComplete() {
  const m = G.mission;
  switch (m.type) {
    case "score": return G.score >= m.target;
    case "clear": return G.totalCleared >= m.count;
    case "color": return (G.colorCleared[m.colorIndex] || 0) >= m.count;
    case "special": return G.specialsCreated >= m.count;
    case "chain": return G.maxChain >= m.count;
  }
  return false;
}

function countIceCells() {
  let count = 0;
  for (let r = 0; r < G.rows; r++)
    for (let c = 0; c < G.cols; c++)
      if (isIce(r, c)) count++;
  return count;
}

function runOneGame(stageIndex) {
  initGameState(stageIndex);
  const initialIce = countIceCells();
  let deadlocks = 0;
  let turnsPlayed = 0;

  while (G.movesLeft > 0) {
    const moves = findValidMoves();
    if (moves.length === 0) {
      deadlocks++;
      break;
    }
    const move = moves[Math.floor(Math.random() * moves.length)];
    swapPieces(move.r1, move.c1, move.r2, move.c2);
    G.lastSwapTarget = { r: move.r2, c: move.c2 };
    G.movesLeft--;
    G.chainCount = 0;
    turnsPlayed++;
    resolveBoardSync();

    if (checkMissionComplete()) break;
  }

  const remainingIce = countIceCells();
  return {
    cleared: checkMissionComplete(),
    movesLeft: G.movesLeft,
    score: G.score,
    totalCleared: G.totalCleared,
    specialsCreated: G.specialsCreated,
    maxChain: G.maxChain,
    deadlock: G.movesLeft > 0 && !checkMissionComplete() && findValidMoves().length === 0,
    turnsPlayed,
    iceCleared: initialIce > 0 ? initialIce - remainingIce : 0,
    iceTotal: initialIce,
  };
}

// --- CLI ---
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { stages: null, runs: 50, verbose: false };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--stages" && args[i + 1]) {
      const val = args[++i];
      if (val.includes("-")) {
        const [a, b] = val.split("-").map(Number);
        opts.stages = [];
        for (let s = a; s <= b; s++) opts.stages.push(s);
      } else {
        opts.stages = val.split(",").map(Number);
      }
    } else if (args[i] === "--runs" && args[i + 1]) {
      opts.runs = parseInt(args[++i]);
    } else if (args[i] === "--verbose") {
      opts.verbose = true;
    }
  }

  if (!opts.stages) {
    opts.stages = [1, 5, 10, 25, 50, 75, 100, 125, 150, 175, 200, 250, 300, 325, 350, 400, 450, 500];
  }

  return opts;
}

function runSimulation() {
  const opts = parseArgs();
  const allResults = [];

  console.log(`\nナナメッチ シミュレーションテスト`);
  console.log(`試行回数: ${opts.runs} / ステージ`);
  console.log(`${"=".repeat(100)}`);
  console.log(
    `${"Stage".padStart(5)} | ${"クリア率".padStart(8)} | ${"平均残手".padStart(8)} | ${"平均Score".padStart(9)} | ${"平均消去".padStart(8)} | ${"詰み率".padStart(7)} | ${"氷解除率".padStart(8)} | ${"最大Chain".padStart(9)} | ${"判定"}`
  );
  console.log(`${"-".repeat(100)}`);

  for (const stageNum of opts.stages) {
    const stageIndex = stageNum - 1;
    if (stageIndex < 0 || stageIndex >= 500) continue;

    const results = [];
    for (let i = 0; i < opts.runs; i++) {
      results.push(runOneGame(stageIndex));
    }

    const clearCount = results.filter(r => r.cleared).length;
    const deadlockCount = results.filter(r => r.deadlock).length;
    const clearRate = clearCount / results.length;
    const avgMovesLeft = results.filter(r => r.cleared).reduce((s, r) => s + r.movesLeft, 0) / (clearCount || 1);
    const avgScore = results.reduce((s, r) => s + r.score, 0) / results.length;
    const avgCleared = results.reduce((s, r) => s + r.totalCleared, 0) / results.length;
    const deadlockRate = deadlockCount / results.length;
    const iceTotal = results.reduce((s, r) => s + r.iceTotal, 0);
    const iceCleared = results.reduce((s, r) => s + r.iceCleared, 0);
    const iceRate = iceTotal > 0 ? iceCleared / iceTotal : -1;
    const maxChainAll = Math.max(...results.map(r => r.maxChain));

    let verdict = "◎";
    if (clearRate < 0.05) verdict = "✗ 極難";
    else if (clearRate < 0.15) verdict = "△ 難";
    else if (clearRate < 0.30) verdict = "○ やや難";
    else if (clearRate > 0.80) verdict = "○ 易";

    if (deadlockRate > 0.10) verdict += " ⚠詰";

    const iceStr = iceRate < 0 ? "   ---  " : `${(iceRate * 100).toFixed(1).padStart(6)}%`;

    console.log(
      `${String(stageNum).padStart(5)} | ${(clearRate * 100).toFixed(1).padStart(6)}%  | ${avgMovesLeft.toFixed(1).padStart(7)} | ${Math.floor(avgScore).toString().padStart(9)} | ${avgCleared.toFixed(0).padStart(7)} | ${(deadlockRate * 100).toFixed(1).padStart(5)}%  | ${iceStr} | ${String(maxChainAll).padStart(9)} | ${verdict}`
    );

    allResults.push({
      stage: stageNum, clearRate, avgMovesLeft, avgScore, avgCleared,
      deadlockRate, iceRate, maxChain: maxChainAll, verdict,
    });

    if (opts.verbose) {
      results.forEach((r, i) => {
        console.log(`    #${i+1}: ${r.cleared ? "CLEAR" : "FAIL"} score=${r.score} cleared=${r.totalCleared} moves=${r.movesLeft} chain=${r.maxChain} specials=${r.specialsCreated}${r.deadlock ? " DEADLOCK" : ""}`);
      });
    }
  }

  console.log(`${"=".repeat(100)}`);

  // Summary warnings
  const issues = allResults.filter(r => r.clearRate < 0.05 || r.deadlockRate > 0.10);
  if (issues.length > 0) {
    console.log(`\n⚠ 要注意ステージ:`);
    for (const r of issues) {
      const reasons = [];
      if (r.clearRate < 0.05) reasons.push(`クリア率${(r.clearRate * 100).toFixed(1)}%`);
      if (r.deadlockRate > 0.10) reasons.push(`詰み率${(r.deadlockRate * 100).toFixed(1)}%`);
      console.log(`  Stage ${r.stage}: ${reasons.join(", ")}`);
    }
  } else {
    console.log(`\n✓ 全ステージ正常範囲内`);
  }
  console.log();
}

runSimulation();
