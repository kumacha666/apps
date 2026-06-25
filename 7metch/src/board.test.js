import { describe, it, expect, beforeEach } from "vitest";
import { G, MATCH_MIN } from "./state.js";
import {
  isMatchable, isIce, isHole, isRock, isPlayable,
  damageIce, damageAdjacentIce,
  findAllMatches, getComboType, tickCountdowns,
  inBounds, isAdjacent, TAP_ACTIVATE_SPECIALS,
} from "./board.js";

function setupBoard(rows, cols) {
  G.rows = rows;
  G.cols = cols;
  G.board = [];
  G.cellState = [];
  G.currentStage = 0;
  G.STAGES = [{ features: { diagonalLine: true }, moves: 20, colors: 5 }];
  G.lastSwapTarget = null;
  for (let r = 0; r < rows; r++) {
    G.board[r] = [];
    G.cellState[r] = [];
    for (let c = 0; c < cols; c++) {
      G.board[r][c] = { color: 0, special: null };
      G.cellState[r][c] = null;
    }
  }
}

function clearBoard() {
  for (let r = 0; r < G.rows; r++)
    for (let c = 0; c < G.cols; c++)
      G.board[r][c] = { color: (r * G.cols + c) % 5, special: null };
}

// ---------------------------------------------------------------------------
// isMatchable
// ---------------------------------------------------------------------------
describe("isMatchable", () => {
  beforeEach(() => setupBoard(7, 7));

  it("通常ピースはマッチ可能", () => {
    expect(isMatchable(0, 0)).toBe(true);
  });

  it("空セルはマッチ不可", () => {
    G.board[0][0] = null;
    expect(isMatchable(0, 0)).toBe(false);
  });

  it("穴セルはマッチ不可", () => {
    G.cellState[0][0] = "hole";
    expect(isMatchable(0, 0)).toBe(false);
  });

  it("岩セルはマッチ不可", () => {
    G.cellState[0][0] = "rock";
    expect(isMatchable(0, 0)).toBe(false);
  });

  it("氷セル (ice2) はマッチ不可", () => {
    G.cellState[0][0] = "ice2";
    expect(isMatchable(0, 0)).toBe(false);
  });

  it("氷セル (ice1) はマッチ不可", () => {
    G.cellState[0][0] = "ice1";
    expect(isMatchable(0, 0)).toBe(false);
  });

  it("氷解除後はマッチ可能", () => {
    G.cellState[0][0] = "ice1";
    expect(isMatchable(0, 0)).toBe(false);
    G.cellState[0][0] = null;
    expect(isMatchable(0, 0)).toBe(true);
  });

  it("カウントダウンボムはマッチ不可", () => {
    G.board[0][0] = { color: 0, special: "countdown", countdown: 5 };
    expect(isMatchable(0, 0)).toBe(false);
  });

  for (const sp of ["line_h", "line_v", "line_d", "bomb"]) {
    it(`タップ起動特殊 (${sp}) はマッチ不可`, () => {
      G.board[0][0] = { color: 0, special: sp };
      expect(isMatchable(0, 0)).toBe(false);
    });
  }

  it("レインボーはマッチ可能", () => {
    G.board[0][0] = { color: 0, special: "rainbow" };
    expect(isMatchable(0, 0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Cell state queries
// ---------------------------------------------------------------------------
describe("セル状態クエリ", () => {
  beforeEach(() => setupBoard(7, 7));

  it("isIce: ice1/ice2を検出", () => {
    expect(isIce(0, 0)).toBe(false);
    G.cellState[0][0] = "ice1";
    expect(isIce(0, 0)).toBe(true);
    G.cellState[0][0] = "ice2";
    expect(isIce(0, 0)).toBe(true);
  });

  it("isHole: holeを検出", () => {
    expect(isHole(0, 0)).toBe(false);
    G.cellState[0][0] = "hole";
    expect(isHole(0, 0)).toBe(true);
  });

  it("isRock: rockを検出", () => {
    expect(isRock(0, 0)).toBe(false);
    G.cellState[0][0] = "rock";
    expect(isRock(0, 0)).toBe(true);
  });

  it("isPlayable: hole/rock以外はplayable", () => {
    expect(isPlayable(0, 0)).toBe(true);
    G.cellState[0][0] = "ice2";
    expect(isPlayable(0, 0)).toBe(true);
    G.cellState[0][0] = "hole";
    expect(isPlayable(0, 0)).toBe(false);
    G.cellState[0][0] = "rock";
    expect(isPlayable(0, 0)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// damageIce
// ---------------------------------------------------------------------------
describe("damageIce", () => {
  beforeEach(() => setupBoard(7, 7));

  it("ice2 → ice1 (完全解除ではない)", () => {
    G.cellState[0][0] = "ice2";
    const removed = damageIce(0, 0);
    expect(removed).toBe(false);
    expect(G.cellState[0][0]).toBe("ice1");
  });

  it("ice1 → null (完全解除)", () => {
    G.cellState[0][0] = "ice1";
    const removed = damageIce(0, 0);
    expect(removed).toBe(true);
    expect(G.cellState[0][0]).toBe(null);
  });

  it("氷なしセルはtrue返却", () => {
    const removed = damageIce(0, 0);
    expect(removed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// damageAdjacentIce
// ---------------------------------------------------------------------------
describe("damageAdjacentIce", () => {
  beforeEach(() => setupBoard(7, 7));

  it("クリアされたセルの隣接氷にダメージ", () => {
    G.cellState[1][1] = "ice2";
    damageAdjacentIce([[0, 0]]);
    expect(G.cellState[1][1]).toBe("ice1");
  });

  it("隣接していない氷にはダメージなし", () => {
    G.cellState[3][3] = "ice2";
    damageAdjacentIce([[0, 0]]);
    expect(G.cellState[3][3]).toBe("ice2");
  });

  it("複数クリアで同じ氷は1回だけダメージ", () => {
    G.cellState[1][1] = "ice2";
    damageAdjacentIce([[0, 0], [0, 1], [1, 0]]);
    expect(G.cellState[1][1]).toBe("ice1");
  });
});

// ---------------------------------------------------------------------------
// findAllMatches
// ---------------------------------------------------------------------------
describe("findAllMatches", () => {
  beforeEach(() => setupBoard(7, 7));

  it("横3つ揃いを検出", () => {
    clearBoard();
    G.board[0][0] = { color: 1, special: null };
    G.board[0][1] = { color: 1, special: null };
    G.board[0][2] = { color: 1, special: null };
    const matches = findAllMatches();
    expect(matches.length).toBe(3);
  });

  it("縦3つ揃いを検出", () => {
    clearBoard();
    G.board[0][0] = { color: 2, special: null };
    G.board[1][0] = { color: 2, special: null };
    G.board[2][0] = { color: 2, special: null };
    const matches = findAllMatches();
    expect(matches.length).toBe(3);
  });

  it("2つだけではマッチしない", () => {
    clearBoard();
    G.board[0][0] = { color: 1, special: null };
    G.board[0][1] = { color: 1, special: null };
    G.board[0][2] = { color: 2, special: null };
    const matches = findAllMatches();
    expect(matches.length).toBe(0);
  });

  it("氷ピースはマッチに含まれない", () => {
    clearBoard();
    G.board[0][0] = { color: 1, special: null };
    G.board[0][1] = { color: 1, special: null };
    G.board[0][2] = { color: 1, special: null };
    G.cellState[0][1] = "ice2";
    const matches = findAllMatches();
    expect(matches.length).toBe(0);
  });

  it("カウントダウンはマッチに含まれない", () => {
    clearBoard();
    G.board[0][0] = { color: 1, special: null };
    G.board[0][1] = { color: 1, special: "countdown", countdown: 5 };
    G.board[0][2] = { color: 1, special: null };
    const matches = findAllMatches();
    expect(matches.length).toBe(0);
  });

  it("2x2正方形マッチを検出 (diagonalLine feature)", () => {
    clearBoard();
    G.board[0][0] = { color: 3, special: null };
    G.board[0][1] = { color: 3, special: null };
    G.board[1][0] = { color: 3, special: null };
    G.board[1][1] = { color: 3, special: null };
    const matches = findAllMatches();
    expect(matches.length).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// getComboType
// ---------------------------------------------------------------------------
describe("getComboType", () => {
  it("ライン+ライン → cross", () => {
    expect(getComboType("line_h", "line_v")).toBe("cross");
  });

  it("ボム+ボム → big_bomb", () => {
    expect(getComboType("bomb", "bomb")).toBe("big_bomb");
  });

  it("レインボー+レインボー → board_clear", () => {
    expect(getComboType("rainbow", "rainbow")).toBe("board_clear");
  });

  it("カウントダウン+任意 → null (コンボ不可)", () => {
    expect(getComboType("countdown", "bomb")).toBe(null);
    expect(getComboType("line_h", "countdown")).toBe(null);
    expect(getComboType("countdown", "countdown")).toBe(null);
  });

  it("通常ピース同士 → null", () => {
    expect(getComboType(null, null)).toBe(null);
    expect(getComboType(null, "bomb")).toBe(null);
  });
});

// ---------------------------------------------------------------------------
// tickCountdowns
// ---------------------------------------------------------------------------
describe("tickCountdowns", () => {
  beforeEach(() => setupBoard(7, 7));

  it("カウントダウンを1減算", () => {
    G.board[0][0] = { color: 0, special: "countdown", countdown: 5 };
    tickCountdowns();
    expect(G.board[0][0].countdown).toBe(4);
  });

  it("カウント0以下で爆発リストに追加", () => {
    G.board[0][0] = { color: 0, special: "countdown", countdown: 1 };
    G.board[1][1] = { color: 0, special: "countdown", countdown: 3 };
    const exploded = tickCountdowns();
    expect(exploded.length).toBe(1);
    expect(exploded[0]).toEqual([0, 0]);
  });

  it("カウントダウンがないボードでは空配列", () => {
    const exploded = tickCountdowns();
    expect(exploded.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// inBounds / isAdjacent
// ---------------------------------------------------------------------------
describe("ユーティリティ", () => {
  beforeEach(() => setupBoard(7, 7));

  it("inBounds: 範囲内外を判定", () => {
    expect(inBounds(0, 0)).toBe(true);
    expect(inBounds(6, 6)).toBe(true);
    expect(inBounds(-1, 0)).toBe(false);
    expect(inBounds(0, 7)).toBe(false);
  });

  it("isAdjacent: 8方向で隣接判定", () => {
    expect(isAdjacent(0, 0, 0, 1)).toBe(true);
    expect(isAdjacent(0, 0, 1, 1)).toBe(true);
    expect(isAdjacent(0, 0, 0, 0)).toBe(false);
    expect(isAdjacent(0, 0, 2, 0)).toBe(false);
  });
});
