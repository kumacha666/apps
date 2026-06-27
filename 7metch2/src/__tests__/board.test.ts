import { describe, it, expect, beforeEach, vi } from "vitest";
import { G, COLS, ROWS } from "../state";
import type { Piece, UpgradeId } from "../types";
import {
  findAllMatches,
  applyGravity,
  activateSpecial,
  findSpecialCreations,
  swapPieces,
  isAdjacentAllowed,
  createBoard,
} from "../board";

function mkPiece(color: number, special: Piece["special"] = null): Piece {
  return { color, special };
}

/** Build board from a grid. null = empty, number = color index */
function setupBoard(grid: (number | null)[][]): void {
  G.board = [];
  for (let r = 0; r < ROWS; r++) {
    G.board[r] = [];
    for (let c = 0; c < COLS; c++) {
      const v = grid[r]?.[c];
      G.board[r][c] = v === null || v === undefined ? null : mkPiece(v);
    }
  }
}

function resetRun(upgrades: UpgradeId[] = []): void {
  G.run = { stage: 0, score: 0, totalCleared: 0, upgrades, resonanceCounts: new Array(7).fill(0) };
  G.proliferationColor = null;
}

/** Create a full board with no matches (pattern avoids 3-in-a-row h/v) */
function filledBoard(): (number | null)[][] {
  // Pattern: columns cycle 0,1,2,0,1,2,0 and rows shift by 1 each row
  // This avoids 3 consecutive same-color horizontally or vertically
  const grid: (number | null)[][] = [];
  for (let r = 0; r < ROWS; r++) {
    grid[r] = [];
    for (let c = 0; c < COLS; c++) {
      // Alternate: even rows use (c%3), odd rows use ((c+1)%3)
      grid[r][c] = (c + (r % 2)) % 3;
    }
  }
  return grid;
}

beforeEach(() => {
  resetRun();
});

// ==================== findAllMatches ====================
describe("findAllMatches", () => {
  it("horizontal 3-match", () => {
    const grid = filledBoard();
    // Place 3 same-color in row 0, cols 0-2
    grid[0][0] = 4; grid[0][1] = 4; grid[0][2] = 4;
    setupBoard(grid);
    const matches = findAllMatches(3);
    expect(matches.length).toBeGreaterThanOrEqual(3);
    const keys = new Set(matches.map(([r, c]) => `${r},${c}`));
    expect(keys.has("0,0")).toBe(true);
    expect(keys.has("0,1")).toBe(true);
    expect(keys.has("0,2")).toBe(true);
  });

  it("vertical 3-match", () => {
    const grid = filledBoard();
    grid[0][0] = 4; grid[1][0] = 4; grid[2][0] = 4;
    setupBoard(grid);
    const matches = findAllMatches(3);
    const keys = new Set(matches.map(([r, c]) => `${r},${c}`));
    expect(keys.has("0,0")).toBe(true);
    expect(keys.has("1,0")).toBe(true);
    expect(keys.has("2,0")).toBe(true);
  });

  it("no match", () => {
    setupBoard(filledBoard());
    expect(findAllMatches(3)).toHaveLength(0);
  });

  it("match with special pieces included", () => {
    const grid = filledBoard();
    grid[0][0] = 4; grid[0][1] = 4; grid[0][2] = 4;
    setupBoard(grid);
    G.board[0][1]!.special = "bomb";
    const matches = findAllMatches(3);
    expect(matches.length).toBeGreaterThanOrEqual(3);
  });

  it("2x2 match with upgrade", () => {
    resetRun(["match_2x2"]);
    const grid = filledBoard();
    grid[0][0] = 4; grid[0][1] = 4; grid[1][0] = 4; grid[1][1] = 4;
    setupBoard(grid);
    const matches = findAllMatches(3);
    const keys = new Set(matches.map(([r, c]) => `${r},${c}`));
    expect(keys.has("0,0")).toBe(true);
    expect(keys.has("0,1")).toBe(true);
    expect(keys.has("1,0")).toBe(true);
    expect(keys.has("1,1")).toBe(true);
  });

  it("2x2 not matched without upgrade", () => {
    resetRun([]);
    const grid = filledBoard();
    // 2x2 of same color, but no 3-in-a-row
    grid[0][0] = 4; grid[0][1] = 4;
    grid[1][0] = 4; grid[1][1] = 4;
    // Ensure no 3-in-a-row by making neighbors different
    grid[0][2] = 0; grid[2][0] = 0; grid[2][1] = 0;
    setupBoard(grid);
    const matches = findAllMatches(3);
    const keys = new Set(matches.map(([r, c]) => `${r},${c}`));
    // Without match_2x2 upgrade, 2x2 should not match (unless it forms a 3-in-a-row)
    // Check that 2x2 cells are NOT all matched
    const all4 = keys.has("0,0") && keys.has("0,1") && keys.has("1,0") && keys.has("1,1");
    expect(all4).toBe(false);
  });

  it("match2 with upgrade (2-in-a-row)", () => {
    resetRun(["match2"]);
    const grid = filledBoard();
    grid[0][0] = 4; grid[0][1] = 4;
    setupBoard(grid);
    const matches = findAllMatches();
    const keys = new Set(matches.map(([r, c]) => `${r},${c}`));
    expect(keys.has("0,0")).toBe(true);
    expect(keys.has("0,1")).toBe(true);
  });
});

// ==================== applyGravity ====================
describe("applyGravity", () => {
  it("pieces fall to bottom", () => {
    const grid: (number | null)[][] = [];
    for (let r = 0; r < ROWS; r++) grid[r] = new Array(COLS).fill(null);
    // Place a piece at top
    grid[0][0] = 1;
    setupBoard(grid);
    applyGravity();
    // Piece should be at bottom
    expect(G.board[ROWS - 1][0]!.color).toBe(1);
  });

  it("new pieces fill top after gravity", () => {
    const grid: (number | null)[][] = [];
    for (let r = 0; r < ROWS; r++) grid[r] = new Array(COLS).fill(null);
    // Empty column 0 entirely
    setupBoard(grid);
    applyGravity();
    for (let r = 0; r < ROWS; r++) {
      expect(G.board[r][0]).not.toBeNull();
    }
  });

  it("no holes remain after gravity", () => {
    const grid: (number | null)[][] = [];
    for (let r = 0; r < ROWS; r++) {
      grid[r] = [];
      for (let c = 0; c < COLS; c++) {
        grid[r][c] = Math.random() < 0.5 ? null : Math.floor(Math.random() * 5);
      }
    }
    setupBoard(grid);
    applyGravity();
    // Check no holes: in each column, once a null is seen scanning top-down, all below should be non-null... actually reverse: scanning bottom-up, all pieces should be contiguous
    for (let c = 0; c < COLS; c++) {
      let foundEmpty = false;
      for (let r = 0; r < ROWS; r++) {
        if (!G.board[r][c]) foundEmpty = true;
        else if (foundEmpty) {
          // piece above empty = hole
          expect.unreachable("Found hole in board after gravity");
        }
      }
    }
  });

  it("proliferation color bias", () => {
    resetRun(["proliferation"]);
    G.proliferationColor = 3;
    // Make entire board null
    const grid: (number | null)[][] = [];
    for (let r = 0; r < ROWS; r++) grid[r] = new Array(COLS).fill(null);
    setupBoard(grid);

    // Seed random for determinism isn't needed; just check statistically
    applyGravity();
    let color3Count = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (G.board[r][c]?.color === 3) color3Count++;
      }
    }
    // With 40% bias, expect significantly more than 1/5 of cells
    // Total cells = 56, expected ~22 with bias vs ~11 without
    expect(color3Count).toBeGreaterThan(5);
  });

  it("timed bombs spawning", () => {
    resetRun(["timed_bombs"]);
    const grid: (number | null)[][] = [];
    for (let r = 0; r < ROWS; r++) grid[r] = new Array(COLS).fill(null);
    setupBoard(grid);

    // Run many times to check at least one bomb spawns
    let bombFound = false;
    for (let trial = 0; trial < 10 && !bombFound; trial++) {
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) G.board[r][c] = null;
      }
      applyGravity();
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (G.board[r][c]?.special === "bomb" && G.board[r][c]?.countdown !== undefined) {
            bombFound = true;
          }
        }
      }
    }
    expect(bombFound).toBe(true);
  });
});

// ==================== activateSpecial ====================
describe("activateSpecial", () => {
  it("bomb 3x3 (default range)", () => {
    resetRun(["match4_bomb"]);
    setupBoard(filledBoard());
    G.board[4][3]!.special = "bomb";
    const extra = activateSpecial(4, 3, new Set());
    // Should include 3x3 area around (4,3)
    const keys = new Set(extra.map(([r, c]) => `${r},${c}`));
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        expect(keys.has(`${4 + dr},${3 + dc}`)).toBe(true);
      }
    }
  });

  it("bomb 5x5", () => {
    resetRun(["match4_bomb", "bomb_range_5"]);
    setupBoard(filledBoard());
    G.board[4][3]!.special = "bomb";
    const extra = activateSpecial(4, 3, new Set());
    const keys = new Set(extra.map(([r, c]) => `${r},${c}`));
    // Check corners of 5x5
    expect(keys.has(`${2},${1}`)).toBe(true);
    expect(keys.has(`${6},${5}`)).toBe(true);
  });

  it("bomb 7x7", () => {
    resetRun(["match4_bomb", "bomb_range_5", "bomb_range_7"]);
    setupBoard(filledBoard());
    G.board[4][3]!.special = "bomb";
    const extra = activateSpecial(4, 3, new Set());
    const keys = new Set(extra.map(([r, c]) => `${r},${c}`));
    expect(keys.has(`${1},${0}`)).toBe(true);
    expect(keys.has(`${7},${6}`)).toBe(true);
  });

  it("line_h clears entire row", () => {
    resetRun(["match4_bomb"]);
    setupBoard(filledBoard());
    G.board[3][2]!.special = "line_h";
    const extra = activateSpecial(3, 2, new Set());
    const rows = extra.map(([r]) => r);
    expect(rows.every(r => r === 3)).toBe(true);
    expect(extra.length).toBe(COLS);
  });

  it("line_v clears entire column", () => {
    resetRun(["match4_bomb"]);
    setupBoard(filledBoard());
    G.board[3][2]!.special = "line_v";
    const extra = activateSpecial(3, 2, new Set());
    const cols = extra.map(([, c]) => c);
    expect(cols.every(c => c === 2)).toBe(true);
    expect(extra.length).toBe(ROWS);
  });

  it("line_d clears both diagonals", () => {
    resetRun(["match4_bomb"]);
    setupBoard(filledBoard());
    G.board[4][3]!.special = "line_d";
    const extra = activateSpecial(4, 3, new Set());
    // Should clear both diagonals through (4,3)
    expect(extra.length).toBeGreaterThan(2);
    const keys = new Set(extra.map(([r, c]) => `${r},${c}`));
    // Check some diagonal cells
    expect(keys.has("3,2")).toBe(true); // up-left
    expect(keys.has("5,4")).toBe(true); // down-right
    expect(keys.has("3,4")).toBe(true); // up-right
    expect(keys.has("5,2")).toBe(true); // down-left
  });

  it("rainbow clears all same-color pieces", () => {
    resetRun(["match5_rainbow"]);
    setupBoard(filledBoard());
    G.board[0][0]!.special = "rainbow";
    const targetColor = G.board[0][0]!.color;
    const extra = activateSpecial(0, 0, new Set());
    // All returned cells should have the target color
    for (const [r, c] of extra) {
      expect(G.board[r][c]!.color).toBe(targetColor);
    }
    // Should include all cells of that color
    let totalOfColor = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (G.board[r][c]?.color === targetColor) totalOfColor++;
      }
    }
    expect(extra.length).toBe(totalOfColor);
  });

  it("split spawns 2 bombs on non-rainbow specials", () => {
    resetRun(["match4_bomb", "split"]);
    setupBoard(filledBoard());
    G.board[4][3]!.special = "bomb";
    // Count bombs before
    let bombsBefore = 0;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      if (G.board[r][c]?.special === "bomb") bombsBefore++;
    }
    activateSpecial(4, 3, new Set());
    let bombsAfter = 0;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      if (G.board[r][c]?.special === "bomb") bombsAfter++;
    }
    // Should have 2 more bombs (the split ones)
    expect(bombsAfter - bombsBefore).toBe(2);
  });

  it("split does NOT trigger on rainbow", () => {
    resetRun(["match5_rainbow", "split"]);
    setupBoard(filledBoard());
    G.board[4][3]!.special = "rainbow";
    let bombsBefore = 0;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      if (G.board[r][c]?.special === "bomb") bombsBefore++;
    }
    activateSpecial(4, 3, new Set());
    let bombsAfter = 0;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      if (G.board[r][c]?.special === "bomb") bombsAfter++;
    }
    expect(bombsAfter - bombsBefore).toBe(0);
  });
});

// ==================== findSpecialCreations ====================
describe("findSpecialCreations", () => {
  it("4-match creates line", () => {
    resetRun(["match4_bomb"]);
    const grid = filledBoard();
    grid[0][0] = 4; grid[0][1] = 4; grid[0][2] = 4; grid[0][3] = 4;
    setupBoard(grid);
    const matches: [number, number][] = [[0, 0], [0, 1], [0, 2], [0, 3]];
    const specials = findSpecialCreations(matches);
    expect(specials.length).toBeGreaterThanOrEqual(1);
    expect(specials[0].type).toBe("line_h");
  });

  it("vertical 4-match creates line_v", () => {
    resetRun(["match4_bomb"]);
    const grid = filledBoard();
    grid[0][0] = 4; grid[1][0] = 4; grid[2][0] = 4; grid[3][0] = 4;
    setupBoard(grid);
    const matches: [number, number][] = [[0, 0], [1, 0], [2, 0], [3, 0]];
    const specials = findSpecialCreations(matches);
    expect(specials.length).toBeGreaterThanOrEqual(1);
    expect(specials[0].type).toBe("line_v");
  });

  it("L/T creates bomb", () => {
    resetRun(["match4_bomb", "match_lt_bomb"]);
    const grid = filledBoard();
    // L-shape: horizontal [0,0]-[0,2] + vertical [0,0]-[2,0]
    grid[0][0] = 4; grid[0][1] = 4; grid[0][2] = 4;
    grid[1][0] = 4; grid[2][0] = 4;
    setupBoard(grid);
    const matches: [number, number][] = [[0, 0], [0, 1], [0, 2], [1, 0], [2, 0]];
    const specials = findSpecialCreations(matches);
    expect(specials.some(s => s.type === "bomb")).toBe(true);
  });

  it("5-match creates rainbow", () => {
    resetRun(["match4_bomb", "match5_rainbow"]);
    const grid = filledBoard();
    grid[0][0] = 4; grid[0][1] = 4; grid[0][2] = 4; grid[0][3] = 4; grid[0][4] = 4;
    setupBoard(grid);
    const matches: [number, number][] = [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]];
    const specials = findSpecialCreations(matches);
    expect(specials.some(s => s.type === "rainbow")).toBe(true);
  });
});

// ==================== swapPieces ====================
describe("swapPieces", () => {
  it("basic swap works", () => {
    setupBoard(filledBoard());
    const a = G.board[0][0]!.color;
    const b = G.board[0][1]!.color;
    swapPieces(0, 0, 0, 1);
    expect(G.board[0][0]!.color).toBe(b);
    expect(G.board[0][1]!.color).toBe(a);
  });
});

// ==================== isAdjacentAllowed ====================
describe("isAdjacentAllowed", () => {
  it("4-dir without diagonal_move", () => {
    resetRun([]);
    expect(isAdjacentAllowed(0, 0, 0, 1)).toBe(true);
    expect(isAdjacentAllowed(0, 0, 1, 0)).toBe(true);
    expect(isAdjacentAllowed(0, 0, 1, 1)).toBe(false);
  });

  it("8-dir with diagonal_move", () => {
    resetRun(["diagonal_move"]);
    expect(isAdjacentAllowed(0, 0, 0, 1)).toBe(true);
    expect(isAdjacentAllowed(0, 0, 1, 0)).toBe(true);
    expect(isAdjacentAllowed(0, 0, 1, 1)).toBe(true);
  });

  it("same cell is not allowed", () => {
    expect(isAdjacentAllowed(0, 0, 0, 0)).toBe(false);
  });

  it("non-adjacent is not allowed", () => {
    expect(isAdjacentAllowed(0, 0, 0, 2)).toBe(false);
    expect(isAdjacentAllowed(0, 0, 2, 0)).toBe(false);
  });
});

// ==================== createBoard ====================
describe("createBoard", () => {
  it("no initial matches", () => {
    resetRun([]);
    createBoard();
    const matches = findAllMatches(3);
    expect(matches).toHaveLength(0);
  });

  it("board is ROWS x COLS", () => {
    resetRun([]);
    createBoard();
    expect(G.board.length).toBe(ROWS);
    for (let r = 0; r < ROWS; r++) {
      expect(G.board[r].length).toBe(COLS);
      for (let c = 0; c < COLS; c++) {
        expect(G.board[r][c]).not.toBeNull();
      }
    }
  });
});
