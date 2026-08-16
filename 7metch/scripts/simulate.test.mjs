import { describe, it, expect, vi } from "vitest";
import { G } from "../src/state.ts";
import * as boardModule from "../src/board.ts";
import { findAllMatches, hasAnyLegalMove } from "../src/board.ts";
import {
  findValidMoves, tapActivateSync, doMoveSync, recoverFromDeadlockSync, playGame,
} from "./simulate.mjs";

// 4b-2b: シミュレーターの「有効な1手」列挙・実行を、ゲーム本編(board.ts/game.ts)と
// 同じ共有プリミティブ(isSwapBlockedByOrbit/isActivatingSwap/TAP_ACTIVATE_SPECIALS等)
// 経由でテストする。フィクスチャはgame.test.tsの同種のテストと同じ座標・構成を再利用し、
// 判定がズレていないことを担保する

function makeSimStage(overrides = {}) {
  return {
    name: "sim", moves: 20, colors: 5, boardCols: 7, boardRows: 7,
    mission: { type: "clear", count: 999999 },
    star2moves: 12, star3moves: 8,
    features: { diagonalLine: true },
    iceCells: 0, rockCells: 0, holePattern: null, countdownBombs: 0, orbits: [],
    ...overrides,
  };
}

function setupSim(rows = 7, cols = 7) {
  G.rows = rows;
  G.cols = cols;
  G.board = [];
  G.cellState = [];
  G.movesLeft = 20;
  G.score = 0;
  G.totalCleared = 0;
  G.colorCleared = [];
  G.chainCount = 0;
  G.specialsCreated = 0;
  G.maxChain = 0;
  G.lastSwapTarget = null;
  G.currentStage = 0;
  const stage = makeSimStage();
  G.STAGES = [stage];
  G.mission = stage.mission;
  G.missionProgress = {};

  for (let r = 0; r < rows; r++) {
    G.board[r] = [];
    G.cellState[r] = [];
    for (let c = 0; c < cols; c++) {
      G.board[r][c] = { color: (r * cols + c) % 5, special: null };
      G.cellState[r][c] = null;
    }
  }
}

describe("findValidMoves", () => {
  it("タップ起動可能な特殊ピースを候補に含む", () => {
    setupSim(5, 5);
    G.board[2][2] = { color: 0, special: "bomb" };
    const moves = findValidMoves();
    expect(moves.some((m) => m.type === "tap" && m.r === 2 && m.c === 2)).toBe(true);
  });

  it("スワップ起動系(特殊ピース同士)はオービットの方向拘束を無視して候補に含まれる", () => {
    setupSim();
    // doMoveのオービット拒否テスト(src/game.test.ts)と同じ座標。orbitの許可方向(北)は
    // 実際のスワップ方向(南)と不一致なので、通常スワップなら拒否されるはずの配置
    G.board[0][1] = { color: 2, special: "bomb" };
    G.board[1][1] = { color: 1, special: "line_h" };
    G.STAGES = [makeSimStage({ orbits: [{ r: 2, c: 1, dir: [-1, 0] }] })];
    const moves = findValidMoves();
    expect(moves.some((m) => m.type === "swap" && m.r1 === 0 && m.c1 === 1 && m.r2 === 1 && m.c2 === 1)).toBe(true);
  });

  it("通常スワップはオービットの方向拘束を尊重し、不一致なら候補に含まれない", () => {
    setupSim();
    G.board[0][0] = { color: 1, special: null };
    G.board[0][1] = { color: 2, special: null };
    G.board[0][2] = { color: 1, special: null };
    G.board[1][0] = { color: 3, special: null };
    G.board[1][1] = { color: 1, special: null };
    G.board[1][2] = { color: 4, special: null };
    G.STAGES = [makeSimStage({ orbits: [{ r: 2, c: 1, dir: [-1, 0] }] })];
    const moves = findValidMoves();
    expect(moves.some((m) => m.type === "swap" && m.r1 === 0 && m.c1 === 1 && m.r2 === 1 && m.c2 === 1)).toBe(false);
  });

  it("通常スワップは進入方向がオービットの許可方向と一致すれば候補に含まれる", () => {
    setupSim();
    G.board[0][0] = { color: 1, special: null };
    G.board[0][1] = { color: 2, special: null };
    G.board[0][2] = { color: 1, special: null };
    G.board[1][0] = { color: 3, special: null };
    G.board[1][1] = { color: 1, special: null };
    G.board[1][2] = { color: 4, special: null };
    G.STAGES = [makeSimStage({ orbits: [{ r: 2, c: 1, dir: [1, 0] }] })]; // 南方向=実際のスワップ方向と一致
    const moves = findValidMoves();
    expect(moves.some((m) => m.type === "swap" && m.r1 === 0 && m.c1 === 1 && m.r2 === 1 && m.c2 === 1)).toBe(true);
  });
});

describe("tapActivateSync", () => {
  it("タップ起動可能な特殊ピースを消去し、movesLeftを1減らしscoreを増やす", () => {
    setupSim(5, 5);
    G.board[2][2] = { color: 0, special: "bomb" };
    const before = G.movesLeft;
    tapActivateSync(2, 2);
    expect(G.movesLeft).toBe(before - 1);
    expect(G.score).toBeGreaterThan(0);
  });
});

describe("doMoveSync", () => {
  it("特殊ピース同士のコンボスワップでmovesLeftを1減らしscoreを増やす", () => {
    setupSim(5, 5);
    G.board[2][2] = { color: 0, special: "line_h" };
    G.board[2][3] = { color: 1, special: "line_v" };
    const before = G.movesLeft;
    doMoveSync(2, 2, 2, 3);
    expect(G.movesLeft).toBe(before - 1);
    expect(G.score).toBeGreaterThan(0);
  });

  it("カウントダウンボム+他の特殊ピースのスワップは独立起動(コンボ倍加なし)し、movesLeftを1減らしscoreを増やす", () => {
    setupSim(5, 5);
    G.board[2][2] = { color: 0, special: "countdown", countdown: 8 };
    G.board[2][3] = { color: 1, special: "bomb" };
    const before = G.movesLeft;
    doMoveSync(2, 2, 2, 3);
    expect(G.movesLeft).toBe(before - 1);
    expect(G.score).toBeGreaterThan(0);
  });

  it("カウントダウンボム+他の特殊ピースのスワップは両方のセルでactivateSpecialを起動する(片方だけ起動する取り違えを検出)", () => {
    // 重力による補充後のカスケードはMath.random依存で非決定的なため、totalCleared等の
    // 集計値ではなく、activateSpecial()の呼び出し引数そのものを検証する
    setupSim(7, 7);
    G.board[3][1] = { color: 0, special: "countdown", countdown: 8 };
    G.board[3][2] = { color: 1, special: "bomb" };
    const spy = vi.spyOn(boardModule, "activateSpecial");
    try {
      doMoveSync(3, 1, 3, 2);
      const calledCells = spy.mock.calls.map(([r, c]) => `${r},${c}`);
      expect(calledCells).toContain("3,1");
      expect(calledCells).toContain("3,2");
    } finally {
      spy.mockRestore();
    }
  });

  it("レインボー×通常ピースのスワップでmovesLeftを1減らしscoreを増やす", () => {
    setupSim(5, 5);
    G.board[2][2] = { color: 0, special: "rainbow" };
    G.board[2][3] = { color: 3, special: null };
    const before = G.movesLeft;
    doMoveSync(2, 2, 2, 3);
    expect(G.movesLeft).toBe(before - 1);
    expect(G.score).toBeGreaterThan(0);
  });

  it("通常マッチが成立するスワップでmovesLeftを1減らしscoreを増やす", () => {
    setupSim();
    G.board[0][0] = { color: 1, special: null };
    G.board[0][1] = { color: 2, special: null };
    G.board[0][2] = { color: 1, special: null };
    G.board[1][0] = { color: 3, special: null };
    G.board[1][1] = { color: 1, special: null };
    G.board[1][2] = { color: 4, special: null };
    const before = G.movesLeft;
    doMoveSync(0, 1, 1, 1);
    expect(G.movesLeft).toBe(before - 1);
    expect(G.score).toBeGreaterThan(0);
  });

  it("オービットで拒否されるスワップは盤面もmovesLeftも変化させない", () => {
    setupSim();
    G.board[0][1] = { color: 2, special: null };
    G.board[1][1] = { color: 1, special: null };
    G.STAGES = [makeSimStage({ orbits: [{ r: 2, c: 1, dir: [-1, 0] }] })];
    const before = G.movesLeft;
    doMoveSync(0, 1, 1, 1);
    expect(G.movesLeft).toBe(before);
    expect(G.board[0][1].color).toBe(2);
    expect(G.board[1][1].color).toBe(1);
  });
});

describe("recoverFromDeadlockSync", () => {
  it("品質基準を満たす並べ替えが見つかればtrueを返し、未解決マッチを残さない", () => {
    setupSim(3, 3);
    let color = 0;
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 3; c++)
        G.board[r][c] = { color: color++, special: null };
    G.board[1][1].special = "bomb";
    G.STAGES = [makeSimStage({ orbits: [{ r: 1, c: 1, dir: [1, 0] }] })];
    const recovered = recoverFromDeadlockSync();
    expect(recovered).toBe(true);
    expect(findAllMatches().length).toBe(0);
  });

  it("回復不能な盤面ではクラッシュせずfalseを返し、未解決マッチを残さない", () => {
    setupSim(1, 1);
    G.board[0][0] = { color: 0, special: null };
    G.STAGES = [makeSimStage({ orbits: [{ r: 0, c: 0, dir: [1, 0] }] })];
    const recovered = recoverFromDeadlockSync();
    expect(recovered).toBe(false);
    expect(findAllMatches().length).toBe(0);
  });
});

describe("playGame", () => {
  it("オービットで初期詰みでも回復して継続し、詰み扱いにならず全手を消化する", () => {
    setupSim();
    for (let r = 0; r < 7; r++)
      for (let c = 0; c < 7; c++)
        G.board[r][c] = { color: (r * 7 + c) % 5, special: null };
    G.STAGES = [makeSimStage({ orbits: [{ r: 3, c: 3, dir: [1, 0] }] })];
    G.mission = G.STAGES[0].mission;
    G.movesLeft = 5;
    expect(hasAnyLegalMove()).toBe(false); // 前提: 回復前は詰み盤面
    const result = playGame();
    expect(result.deadlockOccurred).toBe(false);
    expect(G.movesLeft).toBe(0);
    expect(findAllMatches().length).toBe(0);
  });

  it("回復不能な盤面では無限ループせずdeadlockOccurred=trueで終了し、手数は消費されない", () => {
    setupSim(1, 1);
    G.board[0][0] = { color: 0, special: null };
    G.STAGES = [makeSimStage({ orbits: [{ r: 0, c: 0, dir: [1, 0] }] })];
    G.mission = G.STAGES[0].mission;
    G.movesLeft = 5;
    const result = playGame();
    expect(result.deadlockOccurred).toBe(true);
    expect(G.movesLeft).toBe(5);
  });

  it("オービット無しステージ(Stage1〜500相当)では合法手0件で回復せず即座に詰み終了する", () => {
    setupSim(1, 1);
    G.board[0][0] = { color: 0, special: null };
    G.STAGES = [makeSimStage({ orbits: [] })];
    G.mission = G.STAGES[0].mission;
    G.movesLeft = 5;
    const result = playGame();
    expect(result.deadlockOccurred).toBe(true);
    expect(G.movesLeft).toBe(5);
  });

  it("呼び出し時点で既にミッション達成済みなら1手も消費せず終了する(初期詰み回復が偶然達成させたケース相当)", () => {
    setupSim();
    G.STAGES = [makeSimStage({ mission: { type: "clear", count: 0 } })];
    G.mission = G.STAGES[0].mission;
    G.movesLeft = 20;
    const result = playGame();
    expect(result.turnsPlayed).toBe(0);
    expect(result.deadlockOccurred).toBe(false);
    expect(G.movesLeft).toBe(20);
  });
});
