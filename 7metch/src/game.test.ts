import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Piece, StageConfig, Mission, GameDom, OrbitCell } from "./types";
import { G, SCORE_PER_PIECE, ITEM_COSTS } from "./state";
import { doMove, activateByTap, activateCombo, checkWinLose, updateHUD, resolveMatches, showResult, useShuffle, finishTurn } from "./game";
import { hasAnyLegalMove, findAllMatches } from "./board";

const storage: Record<string, string> = {};
vi.stubGlobal("localStorage", {
  getItem: (k: string) => storage[k] ?? null,
  setItem: (k: string, v: string) => { storage[k] = v; },
  removeItem: (k: string) => { delete storage[k]; },
});

function makeDom(): GameDom {
  const el = (): HTMLElement => {
    const e = { textContent: "", innerHTML: "", style: { color: "", display: "", opacity: "", transform: "", transition: "" }, appendChild: () => {} } as unknown as HTMLElement;
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
    iceCells: 0, rockCells: 0, holePattern: null, countdownBombs: 0, orbits: [],
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

  describe("第1章「軌道系」オービットの方向拘束", () => {
    beforeEach(() => {
      // (0,1)<->(1,1)のマッチ成立スワップを用意。orbitを(2,1)に置くと、
      // (1,1)は影響範囲内(距離1)・(0,1)は影響範囲外(距離2)になり、
      // 進入方向は(0,1)→(1,1)の変位=南(1,0)のスワップとして判定される
      G.board[0][0] = { color: 1, special: null };
      G.board[0][1] = { color: 2, special: null };
      G.board[0][2] = { color: 1, special: null };
      G.board[1][0] = { color: 3, special: null };
      G.board[1][1] = { color: 1, special: null };
      G.board[1][2] = { color: 4, special: null };
    });

    it("進入方向と一致しないオービットがある場合、マッチ成立スワップでも手数が減らない", async () => {
      G.STAGES = [makeStage({ orbits: [{ r: 2, c: 1, dir: [-1, 0] }] })]; // 北方向のみ許可(実際は南方向のスワップ)
      const movesBefore = G.movesLeft;
      const colorBefore = G.board[0][1]!.color;
      await doMove(0, 1, 1, 1);
      expect(G.movesLeft).toBe(movesBefore);
      expect(G.board[0][1]!.color).toBe(colorBefore); // ピースも入れ替わっていない
      expect(G.animating).toBe(false);
    });

    it("進入方向と一致するオービットがある場合は通常通りマッチが成立する", async () => {
      G.STAGES = [makeStage({ orbits: [{ r: 2, c: 1, dir: [1, 0] }] })]; // 南方向を許可(実際のスワップ方向と一致)
      const movesBefore = G.movesLeft;
      await doMove(0, 1, 1, 1);
      expect(G.movesLeft).toBeLessThan(movesBefore);
      expect(G.animating).toBe(false);
    });

    it("特殊ピース起動を伴うスワップ(レインボー)は、オービットの進入方向と不一致でも制約を受けない", async () => {
      G.board[0][1] = { color: 0, special: "rainbow" };
      G.board[1][1] = { color: 2, special: null };
      G.STAGES = [makeStage({ orbits: [{ r: 2, c: 1, dir: [-1, 0] }] })]; // 実際のスワップ方向(南)とは不一致
      const movesBefore = G.movesLeft;
      await doMove(0, 1, 1, 1);
      expect(G.movesLeft).toBeLessThan(movesBefore); // レインボー起動として消費される
      expect(G.animating).toBe(false);
    });

    it("オービットが無いステージ(Stage 1〜500)では従来通り制約が一切かからない", async () => {
      G.STAGES = [makeStage({ orbits: [] })];
      const movesBefore = G.movesLeft;
      await doMove(0, 1, 1, 1);
      expect(G.movesLeft).toBeLessThan(movesBefore);
    });
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
// activateCombo
// ---------------------------------------------------------------------------
// doMove()のコンボ分岐からは"cross"(line+line)・"big_bomb"(bomb+bomb)・
// "board_clear"(rainbow+rainbow)のみが間接的に触れられており、残り4種
// (star_cross/triple_line/rainbow_line/rainbow_bomb)は未カバーだった。
// activateComboは純粋関数なので直接呼び出して7種すべてを検証する
// (/code-review指摘、PR #354)
describe("activateCombo", () => {
  beforeEach(() => setupGame());

  it("cross: 中心の行と列全体を返す(重複無し)", () => {
    const p1: Piece = { color: 0, special: "line_h" };
    const p2: Piece = { color: 1, special: "line_v" };
    const cells = activateCombo("cross", 3, 3, p1, p2);
    expect(cells.length).toBe(7 + 7 - 1); // 行7 + 列7 - 中心の重複1
    expect(cells).toContainEqual([3, 0]);
    expect(cells).toContainEqual([0, 3]);
    expect(cells).toContainEqual([3, 3]);
  });

  it("star_cross: 行・列に加えて両対角線を含む", () => {
    const p1: Piece = { color: 0, special: "line_h" };
    const p2: Piece = { color: 1, special: "line_d" };
    const cells = activateCombo("star_cross", 3, 3, p1, p2);
    expect(cells).toContainEqual([0, 0]); // 主対角線
    expect(cells).toContainEqual([0, 6]); // 反対角線
    expect(cells).toContainEqual([3, 0]); // 行
    expect(cells).toContainEqual([0, 3]); // 列
  });

  it("triple_line: 中心の前後1マスずつ、計3行+3列のみを含む(範囲外は除外)", () => {
    const p1: Piece = { color: 0, special: "bomb" };
    const p2: Piece = { color: 1, special: "line_h" };
    const cells = activateCombo("triple_line", 3, 3, p1, p2);
    expect(cells).toContainEqual([2, 0]); // 行2(中心-1)は全域含む
    expect(cells).toContainEqual([0, 4]); // 列4(中心+1)は全域含む
    expect(cells).not.toContainEqual([0, 0]); // 行0・列0はどちらの帯にも入らない
  });

  it("big_bomb: 中心から半径3の範囲のみ(盤端でクリップされる)", () => {
    const p1: Piece = { color: 0, special: "bomb" };
    const p2: Piece = { color: 1, special: "bomb" };
    const cells = activateCombo("big_bomb", 0, 0, p1, p2);
    expect(cells.length).toBe(4 * 4); // r,c共に0..3の16マス(負側は盤外)
    expect(cells).toContainEqual([3, 3]);
    expect(cells).not.toContainEqual([4, 0]);
  });

  it("rainbow_line: 対象色の全ピースをline_hに変え、対象セルを返す", () => {
    G.board[1][1] = { color: 2, special: null };
    G.board[5][5] = { color: 2, special: null };
    const p1: Piece = { color: 2, special: null };
    const p2: Piece = { color: -1, special: "rainbow" };
    const cells = activateCombo("rainbow_line", 3, 3, p1, p2);
    expect(cells).toContainEqual([1, 1]);
    expect(cells).toContainEqual([5, 5]);
    expect(G.board[1][1]!.special).toBe("line_h");
    expect(G.board[5][5]!.special).toBe("line_h");
  });

  it("rainbow_bomb: 対象色の全ピースをbombに変え、対象セルを返す", () => {
    G.board[1][1] = { color: 4, special: null };
    const p1: Piece = { color: -1, special: "rainbow" };
    const p2: Piece = { color: 4, special: null };
    const cells = activateCombo("rainbow_bomb", 3, 3, p1, p2);
    expect(cells).toContainEqual([1, 1]);
    expect(G.board[1][1]!.special).toBe("bomb");
  });

  it("board_clear: 盤面上の全操作可能セルを返す", () => {
    const p1: Piece = { color: 0, special: "rainbow" };
    const p2: Piece = { color: 1, special: "rainbow" };
    const cells = activateCombo("board_clear", 3, 3, p1, p2);
    expect(cells.length).toBe(7 * 7);
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

  // 戻り値（finishTurn()が詰み回復チェックの要否をこれで判断する。Phase 4b-2）
  it("クリア達成時はtrueを返す", () => {
    G.STAGES = [makeStage({ mission: { type: "score", target: 100 } })];
    G.score = 100;
    G.movesLeft = 5;
    expect(checkWinLose()).toBe(true);
  });

  it("手数切れによる失敗時はtrueを返す", () => {
    G.STAGES = [makeStage({ mission: { type: "score", target: 100 } })];
    G.score = 0;
    G.movesLeft = 0;
    expect(checkWinLose()).toBe(true);
  });

  it("未達成かつ手数残ありではfalseを返す（ステージ継続）", () => {
    G.STAGES = [makeStage({ mission: { type: "score", target: 100 } })];
    G.score = 50;
    G.movesLeft = 5;
    expect(checkWinLose()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// showResult
// ---------------------------------------------------------------------------
describe("showResult", () => {
  beforeEach(() => {
    setupGame();
    vi.stubGlobal("document", {
      createElement: () => ({
        textContent: "",
        style: { color: "", display: "", opacity: "", transform: "", transition: "" },
      }),
    });
  });

  afterEach(() => {
    vi.stubGlobal("document", undefined);
  });

  it("最終ステージ以外のクリアでは通常のタイトルを表示", () => {
    G.STAGES = [makeStage(), makeStage()];
    G.currentStage = 0;
    showResult(true, 3);
    expect(G.dom!.resultTitle.textContent).toBe("クリア！");
    expect(G.dom!.resultDetails.innerHTML).not.toContain("制覇");
  });

  it("最終ステージのクリアでは全ステージ制覇メッセージを表示", () => {
    G.STAGES = [makeStage(), makeStage()];
    G.currentStage = 1;
    showResult(true, 3);
    expect(G.dom!.resultTitle.textContent).toBe("🎉 全ステージ制覇！ 🎉");
    expect(G.dom!.resultDetails.innerHTML).toContain("制覇");
    expect(G.dom!.btnNext.style.display).toBe("none");
  });

  it("最終ステージでも敗北時は制覇メッセージを表示しない", () => {
    G.STAGES = [makeStage(), makeStage()];
    G.currentStage = 1;
    showResult(false, 0, { type: "clear", count: 10 });
    expect(G.dom!.resultTitle.textContent).toBe("あと少し…");
    expect(G.dom!.resultDetails.innerHTML).not.toContain("制覇");
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

// ---------------------------------------------------------------------------
// finishTurn（第1章「軌道系」Phase 4b-2: 自動デッドロック回復のゲーティング）
// setupGame()の既定盤面（mod5パターン）はboard.test.tsのhasAnyLegalMove()テストで
// 「どの隣接スワップもマッチを作らず、特殊ピースも無い＝合法手0件」と検証済みのため、
// そのまま詰み盤面として利用できる
// ---------------------------------------------------------------------------
describe("finishTurn", () => {
  beforeEach(() => setupGame());

  function boardColors(): number[] {
    const out: number[] = [];
    for (let r = 0; r < G.rows; r++)
      for (let c = 0; c < G.cols; c++)
        out.push(G.board[r][c]!.color);
    return out;
  }

  it("ステージが終了した場合(手数切れ)は詰み回復チェックを行わない", async () => {
    G.STAGES = [makeStage({ orbits: [{ r: 3, c: 3, dir: [1, 0] }], mission: { type: "score", target: 9999 } })];
    G.movesLeft = 0;
    const before = boardColors();
    await finishTurn();
    expect(boardColors()).toEqual(before); // 合法手0件の盤面のはずだが、終了済みのため回復は動かない
  });

  it("オービットの無いステージ(orbits: [])では合法手0件でも詰み回復を行わない(Stage1〜500は挙動不変)", async () => {
    G.STAGES = [makeStage({ orbits: [] })];
    G.movesLeft = 20;
    const before = boardColors();
    await finishTurn();
    expect(boardColors()).toEqual(before);
  });

  it("オービットのあるステージで合法手0件なら詰み回復が働き、盤面が合法手ありの状態になる", async () => {
    G.STAGES = [makeStage({ orbits: [{ r: 3, c: 3, dir: [1, 0] }], colors: 5 })];
    G.movesLeft = 20;
    expect(hasAnyLegalMove()).toBe(false); // 前提: 回復前は詰み盤面
    await finishTurn();
    expect(findAllMatches().length).toBe(0);
    expect(hasAnyLegalMove()).toBe(true);
  });

  it("並べ替え・盤面作り直しのいずれでも合法手が作れない盤面でもクラッシュせずに完了する(/code-review指摘、PR #353)", async () => {
    // 操作可能セルが1つしか無く、並べ替え・盤面作り直しのどちらを試しても
    // 原理的に合法手が生まれ得ない(regenerateBoardForDeadlock()が上限回数内に
    // 失敗する現実的なケースをシミュレート)。この場合でも「回復済み」と偽って
    // 処理を続けるのではなく、クラッシュ・無限ループせずに完了することを確認する
    setupGame(1, 1);
    G.STAGES = [makeStage({ orbits: [{ r: 0, c: 0, dir: [1, 0] }] })];
    G.movesLeft = 20;
    await expect(finishTurn()).resolves.toBeUndefined();
    expect(hasAnyLegalMove()).toBe(false); // 既知の残存リスク: 真に回復不能な盤面は詰みのまま
    expect(findAllMatches().length).toBe(0); // 全ての回復試行が失敗しても未解決マッチを残さない
  });
});

// ---------------------------------------------------------------------------
// useShuffle（第1章「軌道系」Phase 4b-2: 品質基準付きシャッフル）
// ---------------------------------------------------------------------------
describe("useShuffle", () => {
  beforeEach(() => {
    setupGame();
    // updateItemBar()がdocument.querySelectorAllを参照するため、item系関数を呼ぶテストでは
    // documentをスタブする必要がある(showResult describe blockと同じ方式)
    vi.stubGlobal("document", { querySelectorAll: () => [] });
  });

  afterEach(() => {
    vi.stubGlobal("document", undefined);
  });

  it("オービットの無いステージ(orbits: [])では品質基準を経由せず常に成功し、コインを消費する(Stage1〜500は挙動不変)", async () => {
    // mission targetを到達不能にしておく(シャッフルは即座マッチの有無を検証しないため、
    // 偶然マッチが成立してステージクリア報酬コインが加算されるとアサーションが不安定になる)
    G.STAGES = [makeStage({ orbits: [], mission: { type: "score", target: 999999 } })];
    const coinsBefore = G.saveData.coins;
    await useShuffle();
    expect(G.saveData.coins).toBe(coinsBefore - ITEM_COSTS.shuffle);
    expect(G.animating).toBe(false);
  });

  it("オービットのあるステージで品質基準を満たす並べ替えが見つかれば、通常通りコインを消費する", async () => {
    // 全マス色が重複しない(=どう並べ替えても即座マッチが原理的に発生しない)+タップ起動可能な
    // 特殊ピース1枚(=どこに移動しても合法手が確保される)にして、1回目の試行で必ず品質基準を
    // 満たすようにする(乱数任せだと、通常のmod5盤面では上限10回の再試行内に基準を満たす
    // 並べ替えが見つからずキャンセルされることが確率的にありうるため決定的に構成する)
    setupGame(3, 3);
    let color = 0;
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 3; c++)
        G.board[r][c] = { color: color++, special: null };
    G.board[1][1]!.special = "bomb";
    G.STAGES = [makeStage({ orbits: [{ r: 1, c: 1, dir: [1, 0] }] })];
    const coinsBefore = G.saveData.coins;
    await useShuffle();
    expect(G.saveData.coins).toBe(coinsBefore - ITEM_COSTS.shuffle);
    expect(findAllMatches().length).toBe(0);
    expect(hasAnyLegalMove()).toBe(true);
  });

  it("オービットのあるステージで品質基準を満たす並べ替えが無ければ、盤面を変更せずコストも消費せずキャンセルする", async () => {
    setupGame(1, 1); // 操作可能セルが1つしか無く、どう並べ替えても合法手が生まれ得ない
    G.STAGES = [makeStage({ orbits: [{ r: 0, c: 0, dir: [1, 0] }] })];
    const coinsBefore = G.saveData.coins;
    const colorBefore = G.board[0][0]!.color;
    await useShuffle();
    expect(G.saveData.coins).toBe(coinsBefore); // コスト不消費
    expect(G.board[0][0]!.color).toBe(colorBefore); // 盤面も変更されない
    expect(G.animating).toBe(false);
  });
});
