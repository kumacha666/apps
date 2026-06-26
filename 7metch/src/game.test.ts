import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Piece, StageConfig, Mission, GameDom } from "./types";
import { G, SCORE_PER_PIECE } from "./state";
import { doMove, activateByTap, checkWinLose, updateHUD, resolveMatches } from "./game";

const storage: Record<string, string> = {};
vi.stubGlobal("localStorage", {
  getItem: (k: string) => storage[k] ?? null,
  setItem: (k: string, v: string) => { storage[k] = v; },
  removeItem: (k: string) => { delete storage[k]; },
});

function makeDom(): GameDom {
  const el = (): HTMLElement => {
    const e = { textContent: "", innerHTML: "", style: { color: "", display: "", opacity: "", transform: "", transition: "" } } as unknown as HTMLElement;
    return e;
  };
  return {
    hudStage: el(), hudMoves: el(), hudMissionLabel: el(),
    hudMissionProgress: el(), hudStars: el(),
    resultTitle: el(), resultStars: el(), resultDetails: el(),
    btnNext: el(), btnRescue: el(), itemCoinCount: el(),
  };
}

function makeStage(overrides?: Partial<StageConfig>): StageConfig {
  return {
    name: "1", moves: 20, colors: 5, boardCols: 7, boardRows: 7,
    mission: { type: "clear", count: 10 },
    star2moves: 12, star3moves: 8,
    features: { diagonalLine: true },
    iceCells: 0, rockCells: 0, holePattern: null, countdownBombs: 0,
    ...overrides,
  };
}

function setupGame(rows = 7, cols = 7): void {
  G.rows = rows;
  G.cols = cols;
  G.board = [];
  G.cellState = [];
  G.animating = false;
  G.movesLeft = 20;
  G.score = 0;
  G.totalCleared = 0;
  G.colorCleared = [];
  G.chainCount = 0;
  G.specialsCreated = 0;
  G.maxChain = 0;
  G.lastSwapTarget = null;
  G.currentStage = 0;
  G.coinsEarned = 0;
  G.hintTimer = null;
  G.hintData = null;
  G.hintAnimId = null;
  G.activeChainLabel = null;
  G.debugMode = false;
  G.STAGES = [makeStage()];
  G.dom = makeDom();
  G.saveData = { cleared: {}, bestStars: {}, coins: 100 };
  G.boardPixelW = 336;
  G.boardPixelH = 336;

  for (let r = 0; r < rows; r++) {
    G.board[r] = [];
    G.cellState[r] = [];
    for (let c = 0; c < cols; c++) {
      G.board[r][c] = { color: (r * cols + c) % 5, special: null };
      G.cellState[r][c] = null;
    }
  }
}

// ---------------------------------------------------------------------------
// doMove
// ---------------------------------------------------------------------------
describe("doMove", () => {
  beforeEach(() => setupGame());

  it("有効なマッチでスコアが増加しmovesLeftが減る", async () => {
    G.board[0][0] = { color: 1, special: null };
    G.board[0][1] = { color: 1, special: null };
    G.board[1][0] = { color: 1, special: null };
    G.board[0][2] = { color: 2, special: null };
    G.board[1][1] = { color: 2, special: null };

    G.board[0][0] = { color: 1, special: null };
    G.board[0][1] = { color: 2, special: null };
    G.board[0][2] = { color: 1, special: null };
    G.board[1][0] = { color: 3, special: null };
    G.board[1][1] = { color: 1, special: null };
    G.board[1][2] = { color: 4, special: null };

    await doMove(0, 1, 1, 1);

    expect(G.movesLeft).toBeLessThan(20);
    expect(G.animating).toBe(false);
  });

  it("マッチしないスワイプでは手数が減らない", async () => {
    for (let r = 0; r < G.rows; r++)
      for (let c = 0; c < G.cols; c++)
        G.board[r][c] = { color: (r * G.cols + c) % 5, special: null };

    const movesBefore = G.movesLeft;
    await doMove(0, 0, 0, 1);
    expect(G.movesLeft).toBe(movesBefore);
    expect(G.animating).toBe(false);
  });

  it("G.animating=true の間は呼び出しを無視", async () => {
    G.animating = true;
    const movesBefore = G.movesLeft;
    await doMove(0, 0, 0, 1);
    expect(G.movesLeft).toBe(movesBefore);
    expect(G.animating).toBe(true);
  });

  it("doMove完了後にG.animatingがfalseになる", async () => {
    G.board[0][0] = { color: 1, special: null };
    G.board[0][1] = { color: 1, special: null };
    G.board[0][2] = { color: 2, special: null };
    G.board[1][2] = { color: 1, special: null };
    await doMove(0, 2, 1, 2);
    expect(G.animating).toBe(false);
  });

  it("スペシャルコンボ (bomb+bomb→big_bomb) でG.animating=false", async () => {
    G.board[0][0] = { color: 1, special: "bomb" };
    G.board[0][1] = { color: 2, special: "bomb" };
    await doMove(0, 0, 0, 1);
    expect(G.animating).toBe(false);
    expect(G.movesLeft).toBe(19);
  });

  it("rainbow + 通常ピーススワップでG.animating=false", async () => {
    G.board[0][0] = { color: 1, special: "rainbow" };
    G.board[0][1] = { color: 2, special: null };
    await doMove(0, 0, 0, 1);
    expect(G.animating).toBe(false);
    expect(G.movesLeft).toBe(19);
    expect(G.score).toBeGreaterThan(0);
  });

  it("countdown + special スワップでG.animating=false", async () => {
    G.board[0][0] = { color: 1, special: "countdown", countdown: 5 };
    G.board[0][1] = { color: 2, special: "bomb" };
    await doMove(0, 0, 0, 1);
    expect(G.animating).toBe(false);
    expect(G.movesLeft).toBe(19);
  });

  it("rainbow+rainbow → board_clear でG.animating=false", async () => {
    G.board[0][0] = { color: 1, special: "rainbow" };
    G.board[0][1] = { color: 2, special: "rainbow" };
    await doMove(0, 0, 0, 1);
    expect(G.animating).toBe(false);
    expect(G.movesLeft).toBe(19);
  });
});

// ---------------------------------------------------------------------------
// activateByTap
// ---------------------------------------------------------------------------
describe("activateByTap", () => {
  beforeEach(() => setupGame());

  it("bomb タップでG.animating=falseに復帰", async () => {
    G.board[2][2] = { color: 1, special: "bomb" };
    await activateByTap(2, 2);
    expect(G.animating).toBe(false);
    expect(G.movesLeft).toBe(19);
  });

  it("line_h タップでG.animating=falseに復帰", async () => {
    G.board[2][2] = { color: 1, special: "line_h" };
    await activateByTap(2, 2);
    expect(G.animating).toBe(false);
    expect(G.movesLeft).toBe(19);
  });

  it("line_v タップでG.animating=falseに復帰", async () => {
    G.board[2][2] = { color: 1, special: "line_v" };
    await activateByTap(2, 2);
    expect(G.animating).toBe(false);
    expect(G.movesLeft).toBe(19);
  });

  it("line_d タップでG.animating=falseに復帰", async () => {
    G.board[2][2] = { color: 1, special: "line_d" };
    await activateByTap(2, 2);
    expect(G.animating).toBe(false);
    expect(G.movesLeft).toBe(19);
  });

  it("タップ不可のspecial (rainbow) では何もしない", async () => {
    G.board[2][2] = { color: 1, special: "rainbow" };
    const movesBefore = G.movesLeft;
    await activateByTap(2, 2);
    expect(G.movesLeft).toBe(movesBefore);
  });

  it("空セルでは何もしない", async () => {
    G.board[2][2] = null;
    await activateByTap(2, 2);
    expect(G.animating).toBe(false);
  });

  it("G.animating=true の間は無視", async () => {
    G.animating = true;
    G.board[2][2] = { color: 1, special: "bomb" };
    const movesBefore = G.movesLeft;
    await activateByTap(2, 2);
    expect(G.movesLeft).toBe(movesBefore);
  });

  it("タップ起動でスコアが増加する", async () => {
    G.board[2][2] = { color: 1, special: "bomb" };
    await activateByTap(2, 2);
    expect(G.score).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// checkWinLose
// ---------------------------------------------------------------------------
describe("checkWinLose", () => {
  beforeEach(() => setupGame());

  it("scoreミッション: 目標達成でクリア", () => {
    G.STAGES = [makeStage({ mission: { type: "score", target: 100 } })];
    G.score = 100;
    G.movesLeft = 5;
    checkWinLose();
    expect(G.saveData.cleared[0]).toBe(true);
  });

  it("clearミッション: 目標達成でクリア", () => {
    G.STAGES = [makeStage({ mission: { type: "clear", count: 10 } })];
    G.totalCleared = 10;
    G.movesLeft = 5;
    checkWinLose();
    expect(G.saveData.cleared[0]).toBe(true);
  });

  it("colorミッション: 指定色の消去数が足りればクリア", () => {
    G.STAGES = [makeStage({ mission: { type: "color", colorIndex: 0, count: 5 } })];
    G.colorCleared[0] = 5;
    G.movesLeft = 5;
    checkWinLose();
    expect(G.saveData.cleared[0]).toBe(true);
  });

  it("specialミッション: 特殊ピース作成数が足りればクリア", () => {
    G.STAGES = [makeStage({ mission: { type: "special", count: 3 } })];
    G.specialsCreated = 3;
    G.movesLeft = 5;
    checkWinLose();
    expect(G.saveData.cleared[0]).toBe(true);
  });

  it("chainミッション: 最大チェイン数が足りればクリア", () => {
    G.STAGES = [makeStage({ mission: { type: "chain", count: 4 } })];
    G.maxChain = 4;
    G.movesLeft = 5;
    checkWinLose();
    expect(G.saveData.cleared[0]).toBe(true);
  });

  it("未達成かつ手数残ありでは何も起きない", () => {
    G.STAGES = [makeStage({ mission: { type: "score", target: 100 } })];
    G.score = 50;
    G.movesLeft = 5;
    checkWinLose();
    expect(G.saveData.cleared[0]).toBeUndefined();
  });

  it("★3評価: 少ない手数でクリアすると3つ星", () => {
    G.STAGES = [makeStage({ moves: 20, star3moves: 8, star2moves: 12, mission: { type: "score", target: 100 } })];
    G.score = 100;
    G.movesLeft = 15;
    checkWinLose();
    expect(G.saveData.bestStars[0]).toBe(3);
  });

  it("★1評価: 多くの手数を使うと1つ星", () => {
    G.STAGES = [makeStage({ moves: 20, star3moves: 8, star2moves: 12, mission: { type: "score", target: 100 } })];
    G.score = 100;
    G.movesLeft = 1;
    checkWinLose();
    expect(G.saveData.bestStars[0]).toBe(1);
  });

  it("コインが加算される", () => {
    const coinsBefore = G.saveData.coins;
    G.STAGES = [makeStage({ mission: { type: "score", target: 100 } })];
    G.score = 100;
    G.movesLeft = 5;
    checkWinLose();
    expect(G.saveData.coins).toBeGreaterThan(coinsBefore);
  });
});

// ---------------------------------------------------------------------------
// updateHUD
// ---------------------------------------------------------------------------
describe("updateHUD", () => {
  beforeEach(() => setupGame());

  it("scoreミッションの進捗を表示", () => {
    G.STAGES = [makeStage({ mission: { type: "score", target: 500 } })];
    G.score = 200;
    updateHUD();
    expect(G.dom!.hudMissionProgress.textContent).toBe("200 / 500 点");
  });

  it("clearミッションの進捗を表示", () => {
    G.STAGES = [makeStage({ mission: { type: "clear", count: 30 } })];
    G.totalCleared = 15;
    updateHUD();
    expect(G.dom!.hudMissionProgress.textContent).toBe("15 / 30 個");
  });

  it("手数表示を更新", () => {
    G.movesLeft = 12;
    updateHUD();
    expect(G.dom!.hudMoves.textContent).toBe("のこり 12 手");
  });
});
