import { describe, it, expect, beforeEach, vi } from "vitest";
import { G, MATCH_MIN } from "./state";
import {
  isMatchable, isIce, isHole, isRock, isPlayable,
  damageIce, damageAdjacentIce,
  findAllMatches, getComboType, tickCountdowns, applyGravityData,
  inBounds, isAdjacent, TAP_ACTIVATE_SPECIALS,
  findHint, isSwapLegalForCurrentStage, isActivatingSwap,
  isRainbowPiece, isComboSpecialSwap, isSwapBlockedByOrbit,
  findTapActivatableSpecialCell, findActivatingSwapPair, hasAnyLegalMove,
  shuffleWithQualityGate, regenerateBoardForDeadlock, cloneBoard,
  SHUFFLE_QUALITY_MAX_ATTEMPTS, BOARD_REGEN_MAX_ATTEMPTS,
  countAvailableMoves, createBoard, hasSquare, placeCountdownBombs,
  isBetterFallbackBoard,
} from "./board";
import type { OrbitCell } from "./types";

function setupBoard(rows: number, cols: number): void {
  G.rows = rows;
  G.cols = cols;
  G.board = [];
  G.cellState = [];
  G.currentStage = 0;
  G.STAGES = [{ features: { diagonalLine: true }, moves: 20, colors: 5, orbits: [] } as any];
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

function clearBoard(): void {
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

  for (const sp of ["line_h", "line_v", "line_d", "bomb"] as const) {
    it(`タップ起動特殊 (${sp}) はマッチ不可`, () => {
      G.board[0][0] = { color: 0, special: sp };
      expect(isMatchable(0, 0)).toBe(false);
    });
  }

  it("レインボーはマッチ可能", () => {
    G.board[0][0] = { color: 0, special: "rainbow" };
    expect(isMatchable(0, 0)).toBe(true);
  });

  // 全SpecialType網羅テスト
  const allSpecials: Array<{ type: import("./types").SpecialType; expected: boolean }> = [
    { type: "line_h",    expected: false },
    { type: "line_v",    expected: false },
    { type: "line_d",    expected: false },
    { type: "bomb",      expected: false },
    { type: "rainbow",   expected: true  },
    { type: "countdown", expected: false },
  ];

  for (const { type, expected } of allSpecials) {
    it(`SpecialType "${type}" → isMatchable=${expected}`, () => {
      G.board[0][0] = { color: 0, special: type, ...(type === "countdown" ? { countdown: 5 } : {}) };
      expect(isMatchable(0, 0)).toBe(expected);
    });
  }

  // 全CellStateType網羅テスト
  const allCellStates: Array<{ state: import("./types").CellStateType; expected: boolean }> = [
    { state: null,   expected: true  },
    { state: "hole", expected: false },
    { state: "rock", expected: false },
    { state: "ice1", expected: false },
    { state: "ice2", expected: false },
  ];

  for (const { state, expected } of allCellStates) {
    it(`CellState "${state}" → isMatchable=${expected}`, () => {
      G.cellState[0][0] = state;
      expect(isMatchable(0, 0)).toBe(expected);
    });
  }
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
// applyGravityData — 重力の仕様: 岩・穴はピースが素通りして落下する
// (SPEC「岩セル/穴を避けてピースが落下」。堰き止めに変更しないこと)
// ---------------------------------------------------------------------------
describe("applyGravityData", () => {
  beforeEach(() => setupBoard(5, 1));

  it("岩の上のピースは岩を素通りして下まで落下する（仕様）", () => {
    G.board = [
      [{ color: 1, special: "rainbow" }],
      [null],
      [null],
      [null],
      [null],
    ];
    G.cellState[2][0] = "rock";

    applyGravityData();

    expect(G.board[4][0]?.special).toBe("rainbow"); // 岩を越えて最下段へ
    expect(G.board[2][0]).toBe(null);               // 岩セルにピースは入らない
    expect(G.board[0][0]).not.toBe(null);           // 空いた上部は新ピースで補充
    expect(G.board[1][0]).not.toBe(null);
    expect(G.board[3][0]).not.toBe(null);
  });

  it("穴の上のピースは穴を素通りして下まで落下する（仕様）", () => {
    G.board = [
      [{ color: 1, special: "rainbow" }],
      [null],
      [null],
      [null],
      [null],
    ];
    G.cellState[2][0] = "hole";

    applyGravityData();

    expect(G.board[4][0]?.special).toBe("rainbow");
    expect(G.board[2][0]).toBe(null);
    expect(G.board[0][0]).not.toBe(null);
    expect(G.board[1][0]).not.toBe(null);
    expect(G.board[3][0]).not.toBe(null);
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

// ---------------------------------------------------------------------------
// isActivatingSwap
// ---------------------------------------------------------------------------
describe("isActivatingSwap", () => {
  it("特殊ピース同士のスワップは起動扱い", () => {
    expect(isActivatingSwap({ color: 0, special: "bomb" }, { color: 0, special: "line_h" })).toBe(true);
  });

  it("レインボーと通常ピースのスワップは起動扱い", () => {
    expect(isActivatingSwap({ color: 0, special: "rainbow" }, { color: 0, special: null })).toBe(true);
    expect(isActivatingSwap({ color: 0, special: null }, { color: 0, special: "rainbow" })).toBe(true);
  });

  it("特殊ピース1個と通常ピースのスワップ(非起動)は起動扱いにしない", () => {
    expect(isActivatingSwap({ color: 0, special: "bomb" }, { color: 0, special: null })).toBe(false);
  });

  it("通常ピース同士のスワップは起動扱いにしない", () => {
    expect(isActivatingSwap({ color: 0, special: null }, { color: 0, special: null })).toBe(false);
  });

  it("nullを含むスワップでも例外を投げない", () => {
    expect(isActivatingSwap(null, { color: 0, special: "rainbow" })).toBe(true);
    expect(isActivatingSwap(null, null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isRainbowPiece / isComboSpecialSwap（doMove()の起動判定分岐と共有する構成要素）
// ---------------------------------------------------------------------------
describe("isRainbowPiece", () => {
  it("レインボーはtrue", () => {
    expect(isRainbowPiece({ color: 0, special: "rainbow" })).toBe(true);
  });
  it("レインボー以外・null・空はfalse", () => {
    expect(isRainbowPiece({ color: 0, special: "bomb" })).toBe(false);
    expect(isRainbowPiece({ color: 0, special: null })).toBe(false);
    expect(isRainbowPiece(null)).toBe(false);
  });
});

describe("isComboSpecialSwap", () => {
  it("両方が特殊ピースならtrue(カウントダウン絡みも含む)", () => {
    expect(isComboSpecialSwap({ color: 0, special: "bomb" }, { color: 0, special: "line_h" })).toBe(true);
    expect(isComboSpecialSwap({ color: 0, special: "countdown", countdown: 5 }, { color: 0, special: "bomb" })).toBe(true);
  });
  it("片方だけ特殊、または両方通常ならfalse", () => {
    expect(isComboSpecialSwap({ color: 0, special: "bomb" }, { color: 0, special: null })).toBe(false);
    expect(isComboSpecialSwap({ color: 0, special: null }, { color: 0, special: null })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isSwapBlockedByOrbit（doMove()/findHint()が共有するオービット拒否判定）
// ---------------------------------------------------------------------------
describe("isSwapBlockedByOrbit", () => {
  beforeEach(() => setupBoard(7, 7));

  it("オービットが無ければ常にfalse(遮断しない)", () => {
    G.STAGES![0].orbits = [];
    const p1 = { color: 0, special: null };
    const p2 = { color: 0, special: null };
    expect(isSwapBlockedByOrbit(p1, p2, 0, 0, 0, 1)).toBe(false);
  });

  it("進入方向が不一致で非起動スワップなら遮断する", () => {
    // orbit(3,3)方向は南(1,0)。(2,3)は影響範囲内・(1,3)は範囲外で、
    // 実際の進入方向(1,3)→(2,3)は南(1,0)ではなく逆(南から見て不一致)になるよう
    // 重力方向を北(-1,0)に設定し、不一致を作る(Node上で事前検証済み)
    const orbit: OrbitCell = { r: 3, c: 3, dir: [-1, 0] };
    G.STAGES![0].orbits = [orbit];
    const p1 = { color: 0, special: null };
    const p2 = { color: 0, special: null };
    expect(isSwapBlockedByOrbit(p1, p2, 2, 3, 1, 3)).toBe(true);
  });

  it("進入方向が不一致でも起動スワップなら遮断しない", () => {
    const orbit: OrbitCell = { r: 3, c: 3, dir: [-1, 0] };
    G.STAGES![0].orbits = [orbit];
    const p1 = { color: 0, special: "rainbow" as const };
    const p2 = { color: 0, special: null };
    expect(isSwapBlockedByOrbit(p1, p2, 2, 3, 1, 3)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isSwapLegalForCurrentStage
// ---------------------------------------------------------------------------
describe("isSwapLegalForCurrentStage", () => {
  beforeEach(() => setupBoard(7, 7));

  it("オービットが無いステージ(Stage 1〜500)では常に合法", () => {
    G.STAGES![0].orbits = [];
    expect(isSwapLegalForCurrentStage(0, 0, 0, 1)).toBe(true);
  });

  it("進入方向が重力方向と一致すれば合法", () => {
    const orbit: OrbitCell = { r: 3, c: 3, dir: [1, 0] };
    G.STAGES![0].orbits = [orbit];
    expect(isSwapLegalForCurrentStage(1, 3, 2, 3)).toBe(true); // 外側(1,3)→内側(2,3)、南方向
  });

  it("進入方向が重力方向と不一致なら不可", () => {
    const orbit: OrbitCell = { r: 3, c: 3, dir: [-1, 0] };
    G.STAGES![0].orbits = [orbit];
    expect(isSwapLegalForCurrentStage(1, 3, 2, 3)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// findHint（オービットの進入判定を経由すること）
// ---------------------------------------------------------------------------
describe("findHint とオービット", () => {
  beforeEach(() => {
    setupBoard(7, 7);
    // 盤面全体を偶発マッチが起きないパターンで埋めてから、対象スワップだけを設定する
    // (setupBoardは全マスcolor:0で埋めるため、そのままだと盤面全体が巨大な偶発マッチになってしまう)
    for (let r = 0; r < G.rows; r++)
      for (let c = 0; c < G.cols; c++)
        G.board[r][c] = { color: (r * G.cols + c) % 5, special: null };
    // (0,1)<->(1,1)のスワップでのみマッチが成立する盤面(色は周辺の埋め草パターンと
    // 衝突しない10番台を使い、Node上でこのスワップだけが該当することを事前検証済み)
    G.board[0][0] = { color: 10, special: null };
    G.board[0][1] = { color: 11, special: null };
    G.board[0][2] = { color: 10, special: null };
    G.board[1][0] = { color: 12, special: null };
    G.board[1][1] = { color: 10, special: null };
    G.board[1][2] = { color: 13, special: null };
  });

  it("オービットが無ければ通常通りヒントを返す", () => {
    const hint = findHint();
    expect(hint).not.toBeNull();
  });

  it("唯一のマッチ成立スワップがオービットで禁止されている場合はヒントが無くなる", () => {
    // (2,1)を中心とするオービット: (1,1)は影響範囲内・(0,1)は範囲外、
    // 進入方向は南(1,0)。北(-1,0)しか許可しないため、このスワップは不可
    G.STAGES![0].orbits = [{ r: 2, c: 1, dir: [-1, 0] }];
    const hint = findHint();
    expect(hint).toBeNull();
  });

  it("進入方向が一致すれば引き続きヒントとして提示される", () => {
    G.STAGES![0].orbits = [{ r: 2, c: 1, dir: [1, 0] }];
    const hint = findHint();
    expect(hint).not.toBeNull();
  });

  it("特殊ピース起動を伴うスワップ(レインボー)は、オービットの進入方向と不一致でもヒント対象から除外されない", () => {
    // line_h/bomb等の非レインボー特殊ピースはisMatchable()がfalseを返しマッチに参加できないため、
    // 起動かつマッチ成立を両立できるのはレインボー(isMatchable=true)を使うケースのみ
    G.board[0][1] = { color: 0, special: "rainbow" };
    G.board[1][1] = { color: 10, special: null }; // スワップ後(0,1)が色10になり、行0が10,10,10でマッチ成立
    G.STAGES![0].orbits = [{ r: 2, c: 1, dir: [-1, 0] }]; // 実際の進入方向(南)とは不一致、通常なら不可
    const hint = findHint();
    expect(hint).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// findTapActivatableSpecialCell / findActivatingSwapPair / hasAnyLegalMove
// (「有効な1手」の共有列挙)
// ---------------------------------------------------------------------------
function fillSafe(): void {
  // 偶発マッチが起きない埋め草パターン(既存テストで実績のあるmod5パターン)
  for (let r = 0; r < G.rows; r++)
    for (let c = 0; c < G.cols; c++)
      G.board[r][c] = { color: (r * G.cols + c) % 5, special: null };
}

describe("findTapActivatableSpecialCell", () => {
  beforeEach(() => setupBoard(7, 7));

  it("タップ起動可能な特殊ピースが無ければnull", () => {
    fillSafe();
    expect(findTapActivatableSpecialCell()).toBeNull();
  });

  it("タップ起動可能な特殊ピース(bomb)があればそのセルを返す", () => {
    fillSafe();
    G.board[3][3] = { color: 0, special: "bomb" };
    expect(findTapActivatableSpecialCell()).toEqual({ r: 3, c: 3 });
  });

  it("レインボーはタップ起動対象ではないため検出しない", () => {
    fillSafe();
    G.board[3][3]!.special = "rainbow"; // 色を変えずspecialだけ変更(fillSafeの偶発マッチ回避を維持)
    expect(findTapActivatableSpecialCell()).toBeNull();
  });

  it("穴・岩セル上の特殊ピースは検出しない", () => {
    fillSafe();
    G.board[3][3] = { color: 0, special: "bomb" };
    G.cellState[3][3] = "hole";
    expect(findTapActivatableSpecialCell()).toBeNull();
  });
});

describe("findActivatingSwapPair", () => {
  beforeEach(() => setupBoard(7, 7));

  it("起動スワップの組がなければnull", () => {
    fillSafe();
    expect(findActivatingSwapPair()).toBeNull();
  });

  it("隣接する特殊ピース同士があればその組を返す", () => {
    fillSafe();
    G.board[3][3] = { color: 0, special: "bomb" };
    G.board[3][4] = { color: 0, special: "line_h" };
    const pair = findActivatingSwapPair();
    expect(pair).toEqual({ a: { r: 3, c: 3 }, b: { r: 3, c: 4 } });
  });

  it("隣接するレインボー×通常ピースがあればその組を返す", () => {
    fillSafe();
    G.board[3][3]!.special = "rainbow";
    const pair = findActivatingSwapPair();
    expect(pair).not.toBeNull();
    expect([pair!.a, pair!.b]).toContainEqual({ r: 3, c: 3 });
  });
});

describe("hasAnyLegalMove", () => {
  it("通常マッチ成立スワップがあればtrue", () => {
    setupBoard(7, 7);
    fillSafe();
    G.board[0][0] = { color: 10, special: null };
    G.board[0][1] = { color: 11, special: null };
    G.board[0][2] = { color: 10, special: null };
    G.board[1][1] = { color: 10, special: null };
    expect(hasAnyLegalMove()).toBe(true);
  });

  it("通常マッチ成立スワップが1つも無くても、タップ起動可能な特殊ピースがあればtrue", () => {
    setupBoard(7, 7);
    fillSafe(); // mod5パターンはどの隣接スワップもマッチを作らないことをNode上で事前検証済み
    G.board[3][3] = { color: 0, special: "bomb" };
    expect(hasAnyLegalMove()).toBe(true);
  });

  it("通常マッチ成立スワップが1つも無くても、スワップ起動系特殊ピース(レインボー)があればtrue", () => {
    setupBoard(7, 7);
    fillSafe();
    G.board[3][3]!.special = "rainbow";
    expect(hasAnyLegalMove()).toBe(true);
  });

  it("マッチ成立スワップ・特殊ピースいずれも無ければfalse", () => {
    setupBoard(7, 7);
    fillSafe();
    expect(hasAnyLegalMove()).toBe(false);
  });

  it("有効な1手が何も無ければfalse", () => {
    setupBoard(2, 2);
    G.cellState[0][0] = "hole";
    G.cellState[0][1] = "hole";
    G.cellState[1][0] = "hole";
    // (1,1)だけplayableだが隣接するplayableセルが無いためスワップ不可、特殊ピースも無い
    expect(hasAnyLegalMove()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// findHint の完全性（通常マッチ候補が無い場合のタップ/スワップ起動系フォールバック）
// ---------------------------------------------------------------------------
describe("findHint（タップ/スワップ起動系フォールバック）", () => {
  beforeEach(() => setupBoard(7, 7));

  it("通常マッチ成立スワップが無くても、タップ起動可能な特殊ピースがあればそれをヒントにする", () => {
    fillSafe();
    G.board[3][3] = { color: 0, special: "bomb" };
    const hint = findHint();
    expect(hint).toEqual({ mover: { r: 3, c: 3 }, pattern: [] });
  });

  it("通常マッチ成立スワップが無くても、スワップ起動系特殊ピース(レインボー)があればそれをヒントにする", () => {
    fillSafe();
    G.board[3][3]!.special = "rainbow";
    const hint = findHint();
    expect(hint).not.toBeNull();
    // 走査順によりmover/patternのどちらがレインボー側になるかは変わりうるため、
    // レインボーのセル(3,3)がどちらかに含まれていることだけを確認する
    const cells = [hint!.mover, ...hint!.pattern];
    expect(cells).toContainEqual({ r: 3, c: 3 });
  });

  it("通常マッチ・タップ起動・スワップ起動系のいずれも無ければnull", () => {
    fillSafe();
    expect(findHint()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// cloneBoard / shuffleWithQualityGate / regenerateBoardForDeadlock
// (詰み回復・品質基準付きシャッフル、第1章「軌道系」Phase 4b-2)
// ---------------------------------------------------------------------------
describe("cloneBoard", () => {
  it("盤面のディープコピーを返す(クローン側の変更が元の盤面に影響しない)", () => {
    setupBoard(2, 2);
    G.board[0][0] = { color: 1, special: "bomb" };
    const clone = cloneBoard();
    clone[0][0]!.color = 9;
    clone[0][0]!.special = null;
    expect(G.board[0][0]).toEqual({ color: 1, special: "bomb" });
  });
});

describe("shuffleWithQualityGate", () => {
  it("どの並べ替えでも基準を満たす盤面では1回目の試行で成功する(色が全マス重複なし+タップ起動可能な特殊ピース1枚)", () => {
    setupBoard(3, 3);
    let color = 0;
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 3; c++)
        G.board[r][c] = { color: color++, special: null };
    G.board[1][1]!.special = "bomb"; // どこに移動してもタップ起動可能なため合法手は常に確保される
    // 全マス色が重複しないため、どう並べ替えても3連結マッチは原理的に発生しない
    expect(shuffleWithQualityGate(1)).toBe(true);
    expect(findAllMatches().length).toBe(0);
    expect(hasAnyLegalMove()).toBe(true);
  });

  it("基準を満たす並べ替えが存在しない盤面では、指定した上限回数だけ試行してfalseを返す", () => {
    // 1x1(隣接する操作可能セルが無い)ため、色を何度並べ替えてもマッチもタップ起動も発生し得ない
    setupBoard(1, 1);
    G.board[0][0] = { color: 0, special: null };
    expect(shuffleWithQualityGate(SHUFFLE_QUALITY_MAX_ATTEMPTS)).toBe(false);
  });

  it("1回目の試行が基準を満たさなくても、上限回数内で基準を満たす並べ替えが見つかればtrueで成功する(Math.randomを固定して並べ替え結果を決定的に検証)", () => {
    // Math.random()を常に0に固定すると、Fisher-Yatesの結果は「1つ左ローテーション」になる
    // (n個の配列で iの降順ループ中、常にj=0との入れ替えになるため)。この性質を利用し、
    // 1回目の試行(1回転)は即座マッチが残るため失敗・2回目の試行(2回転)は基準を満たす、
    // という盤面をあらかじめ計算して用意する
    setupBoard(1, 4);
    const original = [1, 0, 0, 0];
    const setColors = (colors: number[]) => {
      colors.forEach((color, c) => { G.board[0][c] = { color, special: null }; });
    };

    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      // 上限1回: 1回転後は[0,0,0,1](即座マッチ成立)のため基準を満たせず失敗する
      setColors(original);
      expect(shuffleWithQualityGate(1)).toBe(false);

      // 上限2回: 2回転後は[0,0,1,0]で即座マッチなし・(2,3)スワップで合法手ありとなり成功する
      setColors(original);
      expect(shuffleWithQualityGate(2)).toBe(true);
      expect(G.board[0].map(p => p!.color)).toEqual([0, 0, 1, 0]);
    } finally {
      randomSpy.mockRestore();
    }
  });
});

describe("regenerateBoardForDeadlock", () => {
  it("十分な色数・マスがあれば盤面を作り直して合法手ありの状態にする(既存のcreateBoard()と同じ生成ロジックを再利用)", () => {
    setupBoard(7, 7);
    expect(regenerateBoardForDeadlock(5, BOARD_REGEN_MAX_ATTEMPTS, G.STAGES![0])).toBe(true);
    expect(findAllMatches().length).toBe(0);
    expect(hasAnyLegalMove()).toBe(true);
  });

  it("操作可能セルが1つしか無い盤面では、何度作り直しても合法手が生まれないためfalseを返す", () => {
    setupBoard(1, 1);
    expect(regenerateBoardForDeadlock(5, 5, G.STAGES![0])).toBe(false);
  });

  it("countdownBombsが設定されたステージでは、作り直した盤面にもボムを再配置する(/code-review指摘: この関数はorbits.length > 0専用の到達不能パスとして書かれボム再配置を省いていたが、ensurePlayableBoard()がオービットの有無を問わず動作するようになった結果countdownBombsを持つステージからも到達しうるようになった)", () => {
    setupBoard(7, 7);
    const stg = { ...G.STAGES![0], countdownBombs: 2 } as any;
    expect(regenerateBoardForDeadlock(5, BOARD_REGEN_MAX_ATTEMPTS, stg)).toBe(true);
    let bombCount = 0;
    for (let r = 0; r < G.rows; r++)
      for (let c = 0; c < G.cols; c++)
        if (G.board[r][c]!.special === "countdown") bombCount++;
    expect(bombCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// countAvailableMoves / createBoard（第1章「軌道系」Phase 4d: 盤面品質チェック統合）
// createBoard()自身はminMoves/maxMovesの判定をcountAvailableMoves()に委譲しているだけ
// なので、オービット対応はcountAvailableMoves()側だけで完結する(createBoard()に変更は無い)
// ---------------------------------------------------------------------------
describe("countAvailableMoves", () => {
  // 3x3盤面で、(0,1)<->(1,1)のスワップだけが唯一マッチを成立させる配置
  // (doMoveのオービット拒否テスト・src/game.test.tsと同じ座標関係を再利用)
  function setupSingleMatchBoard(): void {
    setupBoard(3, 3);
    const colors = [
      [1, 2, 1],
      [3, 1, 4],
      [5, 6, 7],
    ];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        G.board[r][c] = { color: colors[r][c], special: null };
      }
    }
  }

  it("オービットが無ければ、盤面上のマッチ成立スワップ数をそのまま返す(Stage1〜500は挙動不変)", () => {
    setupSingleMatchBoard();
    expect(countAvailableMoves()).toBe(1);
  });

  it("進入方向と不一致のオービットで唯一の合法手が塞がれると0を返す", () => {
    setupSingleMatchBoard();
    G.STAGES = [{ ...G.STAGES![0], orbits: [{ r: 2, c: 1, dir: [-1, 0] }] as OrbitCell[] } as any];
    expect(countAvailableMoves()).toBe(0);
  });

  it("進入方向と一致するオービットなら、引き続きカウントされる", () => {
    setupSingleMatchBoard();
    G.STAGES = [{ ...G.STAGES![0], orbits: [{ r: 2, c: 1, dir: [1, 0] }] as OrbitCell[] } as any];
    expect(countAvailableMoves()).toBe(1);
  });

  it("判定のための一時スワップは必ず元に戻る(オービットで塞がれた手も含めて盤面を変化させない)", () => {
    setupSingleMatchBoard();
    G.STAGES = [{ ...G.STAGES![0], orbits: [{ r: 2, c: 1, dir: [-1, 0] }] as OrbitCell[] } as any];
    const before = G.board.map(row => row.map(p => p!.color));
    countAvailableMoves();
    const after = G.board.map(row => row.map(p => p!.color));
    expect(after).toEqual(before);
  });

  it("隣接する2個のカウントダウンボム同士は、マッチを伴わなくてもスワップ起動系の合法手として数える(/code-review指摘、PR #356。placeCountdownBombs()が品質チェックループの内側に移動したことで、countAvailableMoves()自身がこのペアを見る機会が生じた)", () => {
    // 2x2盤面(MATCH_MIN=3のためどのスワップをしても通常マッチは原理的に成立しない)。
    // 全マス異なる色にし、(0,0)と(0,1)だけを隣接するカウントダウンボムにする
    setupBoard(2, 2);
    G.board[0][0] = { color: 0, special: "countdown", countdown: 8 };
    G.board[0][1] = { color: 1, special: "countdown", countdown: 8 };
    G.board[1][0] = { color: 2, special: null };
    G.board[1][1] = { color: 3, special: null };
    expect(countAvailableMoves()).toBe(1); // ボム同士のペアだけが合法手として数えられる
  });
});

describe("createBoard", () => {
  it("オービットが無ければ、生成直後に即座マッチ・2x2スクエアの無い盤面になる(Stage1〜500は挙動不変)", () => {
    setupBoard(7, 7);
    createBoard(5);
    expect(findAllMatches().length).toBe(0);
    expect(hasSquare()).toBe(false);
  });

  it("オービットがあっても、生成直後に即座マッチ・2x2スクエアの無い盤面になる(品質チェックはcountAvailableMoves()経由でオービット制約を自動的に反映する)", () => {
    setupBoard(7, 8); // パイロット(Stage 501〜524)の固定盤面サイズ
    G.STAGES = [{ ...G.STAGES![0], orbits: [{ r: 3, c: 3, dir: [1, 0] }] as OrbitCell[] } as any];
    createBoard(5);
    expect(findAllMatches().length).toBe(0);
    expect(hasSquare()).toBe(false);
  });

  it("countdownBombsが設定されていれば、指定数のカウントダウンボムが盤面に配置される(/code-review指摘、PR #356で品質チェックのループ内に移動)", () => {
    setupBoard(7, 7);
    G.STAGES = [{ ...G.STAGES![0], countdownBombs: 2 } as any];
    createBoard(5);
    let bombCount = 0;
    for (let r = 0; r < G.rows; r++)
      for (let c = 0; c < G.cols; c++)
        if (G.board[r][c]!.special === "countdown") bombCount++;
    expect(bombCount).toBe(2);
    expect(findAllMatches().length).toBe(0);
    expect(hasSquare()).toBe(false);
  });

  it("1回目の試行がボム配置後に品質基準を割り込んだ場合、その盤面をそのまま採用せずに次の試行へ進む(/code-review指摘、PR #356)", () => {
    // 1x8の1行盤面。左半分[0,1,0,0]と右半分[2,3,2,2]はそれぞれ独立した
    // 「唯一マッチを成立させるスワップ」を1つずつ持つ(pair(0,1)とpair(4,5))ため、
    // ボム設置前の合法手数は2(minMoves=2をちょうど満たす)。countdownBombs=1を
    // 位置0に強制配置すると、pair(0,1)側のマッチだけが失われ、実際の盤面の
    // 合法手数は1に落ちる(pair(4,5)側は影響を受けない)。
    // 品質チェックがボム設置前のまま(旧実装)なら1回目の試行(合法手2)を即座に
    // 採用してしまい、実際の最終盤面はminMoves=2を満たさない状態になる。
    // 品質チェックがボム設置後(新実装)なら1回目の試行を棄却して次の試行に進む
    // ため、Math.random()の消費回数が「1回目の試行分ちょうど」を超える
    setupBoard(1, 8);
    G.STAGES = [{ ...G.STAGES![0], countdownBombs: 1 } as any];

    const fillValues = [0, 1, 0, 0, 2, 3, 2, 2].map(v => (v + 0.5) / 4); // numColors=4
    const bombValues = [0.5, 0.05, 0.5]; // row(常に0, 1行のため無関係) / col=0 / countdown初期値(任意)
    const controlled = [...fillValues, ...bombValues];
    let callCount = 0;
    const realRandom = Math.random.bind(Math);
    const randomSpy = vi.spyOn(Math, "random").mockImplementation(() => {
      const v = callCount < controlled.length ? controlled[callCount] : realRandom();
      callCount++;
      return v;
    });
    try {
      createBoard(4);
    } finally {
      randomSpy.mockRestore();
    }

    // 1回目の試行(盤面生成8回+ボム配置3回=11回、placeCountdownBombsは行/列/
    // カウントダウン初期値の3回Math.random()を呼ぶ)だけで完了していれば、
    // 旧実装同様「ボム設置前に品質基準を満たした盤面をそのまま採用した」ことになり、
    // 実際の合法手数(1)がminMoves(2)を割り込んだ状態を見逃す
    expect(callCount).toBeGreaterThan(controlled.length);
  });
});

// isBetterFallbackBoard: createBoard()が20回とも[minMoves,maxMoves]を外れた場合の
// フォールバック選定基準。合法手0件の盤面を採用してしまうと、詰み回復すら発動できない
// まま(手動シャッフル等のアイテムでしか脱出できない状態で)ステージが始まってしまう
// (/code-review指摘)。盤面生成そのものをMath.randomで決定的に駆動するテストは
// コストが高いため、選定ロジックをここで直接検証する
describe("isBetterFallbackBoard", () => {
  it("合法手1件以上の候補は、targetから遠くても合法手0件の候補より優先される", () => {
    // best: 合法手0件・diff=1(targetに近い) / 新候補: 合法手3件・diff=5(targetから遠い)
    expect(isBetterFallbackBoard(3, 5, 0, 1)).toBe(true);
  });

  it("合法手0件の候補は、既に合法手1件以上ある候補を上書きしない(diffが小さくても)", () => {
    // best: 合法手2件・diff=5 / 新候補: 合法手0件・diff=0(targetにちょうど一致)
    expect(isBetterFallbackBoard(0, 0, 2, 5)).toBe(false);
  });

  it("両方とも合法手0件なら、targetに近い方(diffが小さい方)を優先する", () => {
    expect(isBetterFallbackBoard(0, 1, 0, 2)).toBe(true);
    expect(isBetterFallbackBoard(0, 2, 0, 1)).toBe(false);
  });

  it("両方とも合法手1件以上なら、targetに近い方(diffが小さい方)を優先する", () => {
    expect(isBetterFallbackBoard(3, 1, 5, 3)).toBe(true);
    expect(isBetterFallbackBoard(3, 5, 5, 1)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// placeCountdownBombs（第1章「軌道系」Phase 4d関連の/code-review指摘、PR #356）
// isMatchable()はspecial:"countdown"のセルをマッチ対象から除外するため、ボムを
// 置いたセルはその後どのマッチにも参加できなくなる。createBoard()の品質チェック
// (countAvailableMoves())より後にボムを置くと、判定時に数えられていた合法手を
// ボムが塞いでしまい、最終盤面が実際にはminMoves/maxMoves範囲を満たさなくなり
// うる。この現象自体をここで直接示す(countdownBombsを持つStage 300〜500に元々
// 存在していた欠落で、オービット固有の問題ではない)
// ---------------------------------------------------------------------------
describe("placeCountdownBombs", () => {
  it("唯一の合法手を作っているセルにボムが置かれると、そのセルは以後マッチに参加できず合法手数が0になる", () => {
    setupBoard(3, 3);
    // countAvailableMovesのオービットテストと同じ、(0,1)<->(1,1)だけが唯一
    // マッチを成立させる配置((0,1)と(1,1)をスワップすると行0が[1,1,1]になる)
    const colors = [
      [1, 2, 1],
      [3, 1, 4],
      [5, 6, 7],
    ];
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 3; c++)
        G.board[r][c] = { color: colors[r][c], special: null };
    expect(countAvailableMoves()).toBe(1); // 前提: ボム設置前は合法手1件

    // (1,1)を狙う: スワップ後にマッチ判定の対象となる行0のマス(0,1)へ実際に
    // 移動するのは(1,1)側の中身なので、ボムを置くべきなのは(1,1)。(0,1)側に
    // 置いても、スワップでボムは(1,1)へ移動するだけで行0のマッチには影響しない
    // (placeCountdownBombsはMath.random()を(行, 列)の順に2回呼ぶ。0.5は
    // [1/3, 2/3)の範囲に安全に収まるよう、浮動小数点誤差で境界値ぴったりに
    // ならない値を選んでいる)
    const randomSpy = vi.spyOn(Math, "random")
      .mockReturnValueOnce(0.5) // 行 = floor(0.5*3) = 1
      .mockReturnValueOnce(0.5); // 列 = floor(0.5*3) = 1
    try {
      placeCountdownBombs({ countdownBombs: 1 } as any);
    } finally {
      randomSpy.mockRestore();
    }

    expect(G.board[1][1]!.special).toBe("countdown"); // 狙った通りのセルに配置された
    expect(countAvailableMoves()).toBe(0); // ボムにより唯一の合法手が失われた
  });

  it("countdownBombsが0以下なら何も配置しない", () => {
    setupBoard(3, 3);
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 3; c++)
        G.board[r][c] = { color: 0, special: null };
    placeCountdownBombs({ countdownBombs: 0 } as any);
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 3; c++)
        expect(G.board[r][c]!.special).toBeNull();
  });
});
