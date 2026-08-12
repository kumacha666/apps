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
const { G, MATCH_MIN, SCORE_PER_PIECE } = await import("../src/state.ts");

// audio.ts の SFX を差し替え
// board.ts は import { SFX } from "./audio" しているので、
// audio.ts をモック化するため直接書き換える
import {
  createBoard, initCellState, findAllMatches, findSpecialCreations,
  activateSpecial, applyGravityData, swapPieces, countAvailableMoves,
  damageAdjacentIce, tickCountdowns, isPlayable, inBounds, isIce,
  randomPiece, isHole, isRock, isMatchable,
  isSwapBlockedByOrbit, isActivatingSwap, isComboSpecialSwap, isRainbowPiece,
  getComboType, TAP_ACTIVATE_SPECIALS,
  shuffleWithQualityGate, regenerateBoardForDeadlock,
  SHUFFLE_QUALITY_MAX_ATTEMPTS, BOARD_REGEN_MAX_ATTEMPTS,
} from "../src/board.ts";
import { buildStages } from "../src/stages.ts";

// --- Game simulation ---
export function initGameState(stageIndex) {
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

export function trackClears(clearList) {
  clearList.forEach(([r, c]) => {
    if (G.board[r][c]) {
      const ci = G.board[r][c].color;
      G.colorCleared[ci] = (G.colorCleared[ci] || 0) + 1;
      G.totalCleared++;
    }
  });
}

export function resolveMatchesSync() {
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

export function resolveBoardSync() {
  resolveMatchesSync();
  const exploded = tickCountdowns();
  if (exploded.length > 0) {
    handleCountdownExplosionsSync(exploded);
    resolveMatchesSync();
  }
}

// 「有効な1手」の共有定義（board.tsのhasAnyLegalMove()と同じ3種）をシミュレーターにも適用する。
// タップ起動可能な特殊ピース・スワップ起動系特殊ピース（レインボー・特殊ピース同士の
// コンボ、方向拘束の対象外）・オービット制約適用後にマッチが成立する通常スワップ、を
// すべて候補として集める（4b-2b、GIMMICK_REDESIGN.md「適用範囲」参照）
export function findValidMoves() {
  const moves = [];

  for (let r = 0; r < G.rows; r++) {
    for (let c = 0; c < G.cols; c++) {
      const p = G.board[r][c];
      if (p && p.special && TAP_ACTIVATE_SPECIALS.has(p.special) && isPlayable(r, c)) {
        moves.push({ type: "tap", r, c });
      }
    }
  }

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
        const p1 = G.board[r][c];
        const p2 = G.board[nr][nc];
        if (isActivatingSwap(p1, p2)) {
          moves.push({ type: "swap", r1: r, c1: c, r2: nr, c2: nc });
          continue;
        }
        if (isSwapBlockedByOrbit(p1, p2, r, c, nr, nc)) continue;
        swapPieces(r, c, nr, nc);
        const matches = findAllMatches();
        swapPieces(r, c, nr, nc);
        if (matches.length > 0) {
          moves.push({ type: "swap", r1: r, c1: c, r2: nr, c2: nc });
        }
      }
    }
  }
  return moves;
}

// game.tsのactivateCombo()の同期移植（アニメーション・SFX無し）。純粋にG.boardと
// 隣接セル列挙だけに依存するロジックのため、実装は元と同一に保つ（挙動を分岐させない）
function activateComboSync(comboType, r, c, p1, p2) {
  const extra = [];

  switch (comboType) {
    case "cross":
      for (let cc = 0; cc < G.cols; cc++) if (G.board[r][cc] && isPlayable(r, cc)) extra.push([r, cc]);
      for (let rr = 0; rr < G.rows; rr++) if (G.board[rr][c] && isPlayable(rr, c)) extra.push([rr, c]);
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

// game.tsのactivateByTap()の同期移植（アニメーション・SFX・track無し）
export function tapActivateSync(r, c) {
  const piece = G.board[r][c];
  if (!piece || !piece.special || !TAP_ACTIVATE_SPECIALS.has(piece.special)) return;
  G.movesLeft--;
  G.chainCount = 1;

  const cleared = new Set([r * G.cols + c]);
  const clearList = [[r, c]];
  const extra = activateSpecial(r, c, cleared, null);
  extra.forEach(([er, ec]) => {
    if (!cleared.has(er * G.cols + ec)) { cleared.add(er * G.cols + ec); clearList.push([er, ec]); }
  });

  for (let i = 0; i < clearList.length; i++) {
    const [cr, cc] = clearList[i];
    if (G.board[cr][cc] && G.board[cr][cc].special && !(cr === r && cc === c)) {
      const ex2 = activateSpecial(cr, cc, cleared, piece.special);
      ex2.forEach(([er, ec]) => {
        if (!cleared.has(er * G.cols + ec)) { cleared.add(er * G.cols + ec); clearList.push([er, ec]); }
      });
    }
  }

  trackClears(clearList);
  G.score += clearList.length * SCORE_PER_PIECE * G.chainCount;
  clearList.forEach(([cr, cc]) => { G.board[cr][cc] = null; });
  damageAdjacentIce(clearList);
  applyGravityData();
  resolveBoardSync();
}

// game.tsのdoMove()の同期移植（アニメーション・SFX・track無し）。findValidMoves()が
// 既に「有効な1手」であることを検証した上で呼ばれる前提だが、doMove()と同じ分岐構造
// （特殊ピース同士のコンボ→カウントダウン連動→レインボー×通常→通常マッチ）を保つことで
// 判定のズレを避ける
export function doMoveSync(r1, c1, r2, c2) {
  const p1 = G.board[r1][c1];
  const p2 = G.board[r2][c2];

  if (isSwapBlockedByOrbit(p1, p2, r1, c1, r2, c2)) return;

  G.lastSwapTarget = { r: r2, c: c2 };
  swapPieces(r1, c1, r2, c2);

  if (p1 && p2 && isComboSpecialSwap(p1, p2)) {
    const comboType = getComboType(p1.special, p2.special);
    if (comboType) {
      G.movesLeft--;
      G.chainCount = 1;

      const comboCells = activateComboSync(comboType, r2, c2, p1, p2);
      comboCells.push([r1, c1], [r2, c2]);

      const cleared = new Set(comboCells.map(([cr, cc]) => cr * G.cols + cc));
      comboCells.forEach(([cr, cc]) => {
        if (G.board[cr][cc] && G.board[cr][cc].special && !(cr === r1 && cc === c1) && !(cr === r2 && cc === c2)) {
          const extra = activateSpecial(cr, cc, cleared, null);
          extra.forEach(([er, ec]) => {
            if (!cleared.has(er * G.cols + ec)) { cleared.add(er * G.cols + ec); comboCells.push([er, ec]); }
          });
        }
      });

      const clearList = [...cleared].map((v) => [Math.floor(v / G.cols), v % G.cols]);
      trackClears(clearList);
      G.score += clearList.length * SCORE_PER_PIECE * G.chainCount;
      clearList.forEach(([cr, cc]) => { G.board[cr][cc] = null; });
      damageAdjacentIce(clearList);
      applyGravityData();
      resolveBoardSync();
      return;
    }

    if (p1.special === "countdown" || p2.special === "countdown") {
      G.movesLeft--;
      G.chainCount = 1;

      const cleared = new Set([r1 * G.cols + c1, r2 * G.cols + c2]);
      const extra1 = activateSpecial(r1, c1, cleared, null);
      extra1.forEach(([cr, cc]) => cleared.add(cr * G.cols + cc));
      const extra2 = activateSpecial(r2, c2, cleared, null);
      extra2.forEach(([cr, cc]) => cleared.add(cr * G.cols + cc));

      const allCells = [...cleared].map((v) => [Math.floor(v / G.cols), v % G.cols]);
      allCells.forEach(([cr, cc]) => {
        if (G.board[cr][cc] && G.board[cr][cc].special && !(cr === r1 && cc === c1) && !(cr === r2 && cc === c2)) {
          const extra = activateSpecial(cr, cc, cleared, null);
          extra.forEach(([er, ec]) => {
            if (!cleared.has(er * G.cols + ec)) { cleared.add(er * G.cols + ec); allCells.push([er, ec]); }
          });
        }
      });

      const clearList = [...cleared].map((v) => [Math.floor(v / G.cols), v % G.cols]);
      trackClears(clearList);
      G.score += clearList.length * SCORE_PER_PIECE * G.chainCount;
      clearList.forEach(([cr, cc]) => { G.board[cr][cc] = null; });
      damageAdjacentIce(clearList);
      applyGravityData();
      resolveBoardSync();
      return;
    }
  }

  const rb1 = isRainbowPiece(p1);
  const rb2 = isRainbowPiece(p2);
  if ((rb1 || rb2) && !(rb1 && rb2)) {
    const other = rb1 ? p2 : p1;
    const rainbowR = rb1 ? r2 : r1;
    const rainbowC = rb1 ? c2 : c1;
    if (!other.special) {
      const targetColor = other.color;
      G.movesLeft--;
      G.chainCount = 1;

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
            if (!cleared.has(er * G.cols + ec)) { cleared.add(er * G.cols + ec); clearList.push([er, ec]); }
          });
        }
      });

      trackClears(clearList);
      G.score += clearList.length * SCORE_PER_PIECE * G.chainCount;
      clearList.forEach(([cr, cc]) => { G.board[cr][cc] = null; });
      damageAdjacentIce(clearList);
      applyGravityData();
      resolveBoardSync();
      return;
    }
  }

  const matches = findAllMatches();
  if (matches.length === 0) {
    // findValidMoves()が検証済みの手のみを渡す前提のため通常は到達しない防御的分岐
    swapPieces(r1, c1, r2, c2);
    return;
  }

  G.movesLeft--;
  G.chainCount = 0;
  resolveBoardSync();
  G.lastSwapTarget = null;
}

// game.tsのrecoverFromDeadlock()の同期移植。品質基準付きシャッフル→ダメなら盤面再生成→
// それでもダメならもう一度だけシャッフルを試す、という同じフォールバック順序を踏む
// （手動シャッフルアイテムのような「コストを払って盤面変更をキャンセル」という概念が
// シミュレーターには無いため、useShuffle()側のキャンセル分岐は移植しない）
export function recoverFromDeadlockSync() {
  const numColors = G.STAGES[G.currentStage].colors;
  let recovered = shuffleWithQualityGate(SHUFFLE_QUALITY_MAX_ATTEMPTS);
  if (!recovered) {
    const regenerated = regenerateBoardForDeadlock(numColors, BOARD_REGEN_MAX_ATTEMPTS);
    recovered = regenerated || shuffleWithQualityGate(SHUFFLE_QUALITY_MAX_ATTEMPTS);
  }
  resolveMatchesSync();
  return recovered;
}

export function checkMissionComplete() {
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

// 1ステージ分のプレイループ本体。initGameState()でG初期化済みの状態から呼ぶ前提
// （テストからはbuildStages()を経由せず直接Gを組み立てて呼び出せるよう分離した）。
// 合法手0件でも、オービットのあるステージ（orbits.length > 0）では即座に詰み扱いにせず、
// finishTurn()と同じ回復フロー（recoverFromDeadlockSync）を試す。回復できればそのまま
// 続行し、回復し切れなかった場合のみ本当の詰みとして終了する
export function playGame() {
  let turnsPlayed = 0;
  let deadlockOccurred = false;

  while (G.movesLeft > 0) {
    const moves = findValidMoves();
    if (moves.length === 0) {
      if (G.STAGES[G.currentStage].orbits.length > 0) {
        if (!recoverFromDeadlockSync()) { deadlockOccurred = true; break; }
        if (checkMissionComplete()) break;
        continue;
      }
      deadlockOccurred = true;
      break;
    }
    const move = moves[Math.floor(Math.random() * moves.length)];
    if (move.type === "tap") {
      tapActivateSync(move.r, move.c);
    } else {
      doMoveSync(move.r1, move.c1, move.r2, move.c2);
    }
    turnsPlayed++;

    if (checkMissionComplete()) break;
  }

  return { turnsPlayed, deadlockOccurred };
}

function runOneGame(stageIndex) {
  initGameState(stageIndex);
  const initialIce = countIceCells();
  const { turnsPlayed, deadlockOccurred } = playGame();
  const remainingIce = countIceCells();
  return {
    cleared: checkMissionComplete(),
    movesLeft: G.movesLeft,
    score: G.score,
    totalCleared: G.totalCleared,
    specialsCreated: G.specialsCreated,
    maxChain: G.maxChain,
    deadlock: deadlockOccurred,
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

// テスト（scripts/simulate.test.mjs）からこのモジュールをimportした際にCLI実行が
// 走らないようにするガード。vitestはprocess.env.VITESTを自動設定する
if (!process.env.VITEST) {
  runSimulation();
}
