import { describe, it, expect, beforeEach } from "vitest";
import { G, MATCH_MIN } from "./state";
import {
  isMatchable, isIce, isHole, isRock, isPlayable,
  damageIce, damageAdjacentIce,
  findAllMatches, getComboType, tickCountdowns, applyGravityData,
  inBounds, isAdjacent, TAP_ACTIVATE_SPECIALS,
  findHint, isSwapLegalForCurrentStage, isActivatingSwap,
  isRainbowPiece, isComboSpecialSwap, isSwapBlockedByOrbit,
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
