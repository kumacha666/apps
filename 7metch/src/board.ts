import type { Piece, SpecialType, SpecialCreation, CellPos, FallEntry, HintData, ComboType, StageConfig } from "./types";
import { G, PIECE_COLORS, MATCH_MIN } from "./state";
import { cellCenter, addBurstParticles, addShockwave, addFlash, addScreenShake, addFloatingText } from "./vfx";
import { drawBoard } from "./rendering";
import { SFX } from "./audio";
import { isSwapLegal } from "./orbit";

const HINT_DELAY_MS = 4000;
export const TAP_ACTIVATE_SPECIALS: Set<string> = new Set(["line_h", "line_v", "line_d", "bomb"]);

// 第1章「軌道系」の方向拘束の対象外になるスワップ判定の構成要素（実際に起動が発生する
// ケースのみ、GIMMICK_REDESIGN.mdの「特殊ピースとの関係」参照）。doMove()の起動判定分岐
// （コンボ起動・カウントダウン連動起動・レインボー起動）はコメントでの同期ではなく、
// これらの関数を直接呼び出すことで判定を一致させる（SpecialType追加時の食い違いを防ぐ）
export function isRainbowPiece(p: Piece | null): boolean {
  return p?.special === "rainbow";
}

export function isComboSpecialSwap(p1: Piece | null, p2: Piece | null): boolean {
  return !!(p1?.special && p2?.special);
}

export function isActivatingSwap(p1: Piece | null, p2: Piece | null): boolean {
  if (isComboSpecialSwap(p1, p2)) return true; // 特殊ピース同士のスワップ(コンボ起動・カウントダウン連動含む)
  if (isRainbowPiece(p1) || isRainbowPiece(p2)) return true; // レインボー×他ピース
  return false;
}

// ---------------------------------------------------------------------------
// Board helpers
// ---------------------------------------------------------------------------

export function hasSquare(): boolean {
  for (let r = 0; r < G.rows - 1; r++) {
    for (let c = 0; c < G.cols - 1; c++) {
      const cells: [number, number][] = [[r,c],[r,c+1],[r+1,c],[r+1,c+1]];
      if (cells.some(([cr,cc]) => !G.board[cr][cc] || isHole(cr,cc) || isRock(cr,cc))) continue;
      const color = G.board[r][c]!.color;
      if (cells.every(([cr,cc]) => G.board[cr][cc]!.color === color)) return true;
    }
  }
  return false;
}

// 盤面全体をランダムなピースで埋め、即座マッチ・2x2の同色スクエアが1つも
// 無くなるまで埋め直す。初期盤面生成（createBoard）と詰み時の盤面作り直し
// フォールバック（regenerateBoardForDeadlock、Phase 4b-2）が同じロジックを共有する
function fillBoardUntilStable(numColors: number): void {
  G.board = [];
  for (let r = 0; r < G.rows; r++) {
    G.board[r] = [];
    for (let c = 0; c < G.cols; c++) {
      G.board[r][c] = (isHole(r, c) || isRock(r, c)) ? null : randomPiece(numColors);
    }
  }
  while (findAllMatches().length > 0 || hasSquare()) {
    for (let r = 0; r < G.rows; r++) {
      for (let c = 0; c < G.cols; c++) {
        if (isHole(r, c) || isRock(r, c)) continue;
        G.board[r][c] = randomPiece(numColors);
      }
    }
  }
}

// カウントダウンボムは isMatchable() が special: "countdown" を非マッチ対象として
// 除外するため、置いたセルはその後どのマッチにも参加できなくなる。品質チェック
// (countAvailableMoves()での合法手数判定)より後に置くと、判定時には数えられていた
// 合法手をボムが塞いでしまい、最終盤面が実際にはminMoves/maxMoves範囲を満たさなく
// なりうる（/code-review指摘、PR #356。countdownBombsを持つStage 300〜500に元々
// 存在していた欠落で、オービット固有の問題ではない）。品質チェックの対象になる
// 盤面には常にボム配置済みの状態を渡すことで、判定と実際の最終盤面を一致させる
export function placeCountdownBombs(stg: StageConfig): void {
  if (stg.countdownBombs <= 0) return;
  let placed = 0, attempts = 0;
  while (placed < stg.countdownBombs && attempts < 200) {
    const br = Math.floor(Math.random() * G.rows);
    const bc = Math.floor(Math.random() * G.cols);
    const cell = G.board[br][bc];
    if (cell && !cell.special) {
      cell.special = "countdown";
      cell.countdown = 8 + Math.floor(Math.random() * 5);
      placed++;
    }
    attempts++;
  }
}

// minMoves/maxMoves判定はcountAvailableMoves()に委譲しているため、第1章「軌道系」
// (Stage 501〜)のオービット制約はcountAvailableMoves()側の対応だけで自動的に反映される
// (このループ自体には変更不要。パイロットの固定7x8盤面ではmaxMoves=10になり、
// GIMMICK_REDESIGN.mdの「オービット制約適用後の合法手数が2〜10の範囲」と一致する)
export function createBoard(numColors: number): void {
  const maxMoves = Math.max(10, Math.floor(G.rows * G.cols * 0.15));
  const minMoves = 2;
  const target = Math.floor((minMoves + maxMoves) / 2);
  const stg = G.STAGES![G.currentStage];
  let bestBoard: (Piece | null)[][] | null = null;
  let bestDiff = Infinity;

  for (let attempt = 0; attempt < 20; attempt++) {
    fillBoardUntilStable(numColors);
    placeCountdownBombs(stg);

    const moves = countAvailableMoves();
    if (moves >= minMoves && moves <= maxMoves) {
      bestBoard = null;
      break;
    }
    const diff = Math.abs(moves - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestBoard = G.board.map(row => row.map(cell => cell ? {...cell} : null));
    }
  }

  if (bestBoard) G.board = bestBoard;
}

export function randomPiece(numColors: number): Piece {
  return { color: Math.floor(Math.random() * numColors), special: null };
}

// 盤面上の「隣接する操作可能セルのペア」を重複なく1回ずつ列挙する共有イテレータ。
// countAvailableMoves()・findHint()・findActivatingSwapPair()・hasAnyLegalMove()・
// scripts/simulate.mjsのfindValidMoves()が同じペア集合を独立に再実装すると定義が
// ずれるため、列挙そのものをここに一本化する（/code-review指摘、PR #354）。
// コールバックがtrueを返すとその時点で走査を打ち切る（早期終了したい呼び出し側向け）
export function forEachAdjacentPlayablePair(
  cb: (r: number, c: number, nr: number, nc: number) => boolean | void
): void {
  for (let r = 0; r < G.rows; r++) {
    for (let c = 0; c < G.cols; c++) {
      if (!G.board[r][c] || !isPlayable(r, c)) continue;
      const fwd: [number, number][] = [[r, c+1], [r+1, c-1], [r+1, c], [r+1, c+1]];
      for (const [nr, nc] of fwd) {
        if (!inBounds(nr, nc) || !G.board[nr][nc] || !isPlayable(nr, nc)) continue;
        if (cb(r, c, nr, nc) === true) return;
      }
    }
  }
}

// 初期盤面生成(createBoard())の品質チェックで使う「合法手数」。第1章「軌道系」
// (Stage 501〜)のオービット制約を通常スワップの拒否判定として反映する(Stage 1〜500は
// orbits: []のためisSwapBlockedByOrbitが常にfalseを返し、挙動は一切変わらない)。
// createBoard()生成直後の盤面には特殊ピースが存在しないため、isSwapBlockedByOrbitの
// 起動系除外分岐は実質的に無関係で、常にisSwapLegalForCurrentStage相当の判定になる
export function countAvailableMoves(): number {
  let count = 0;
  forEachAdjacentPlayablePair((r, c, nr, nc) => {
    if (isSwapBlockedByOrbit(G.board[r][c], G.board[nr][nc], r, c, nr, nc)) return;
    swapPieces(r, c, nr, nc);
    if (findAllMatches().length > 0) count++;
    swapPieces(r, c, nr, nc);
  });
  return count;
}

export function initCellState(stg: StageConfig): void {
  G.cellState = [];
  for (let r = 0; r < G.rows; r++) {
    G.cellState[r] = [];
    for (let c = 0; c < G.cols; c++) {
      G.cellState[r][c] = null;
    }
  }
  if (stg.holePattern) {
    for (const [hr, hc] of stg.holePattern) {
      if (hr >= 0 && hr < G.rows && hc >= 0 && hc < G.cols) {
        G.cellState[hr][hc] = "hole";
      }
    }
  }
  if (stg.rockCells > 0) {
    let placed = 0, attempts = 0;
    while (placed < stg.rockCells && attempts < 200) {
      const rr = 1 + Math.floor(Math.random() * (G.rows - 2));
      const rc = 1 + Math.floor(Math.random() * (G.cols - 2));
      if (G.cellState[rr][rc] === null) {
        G.cellState[rr][rc] = "rock";
        placed++;
      }
      attempts++;
    }
  }
  if (stg.iceCells > 0) {
    let placed = 0, attempts = 0;
    while (placed < stg.iceCells && attempts < 200) {
      const ir = Math.floor(Math.random() * G.rows);
      const ic = Math.floor(Math.random() * G.cols);
      if (G.cellState[ir][ic] === null) {
        G.cellState[ir][ic] = "ice2";
        placed++;
      }
      attempts++;
    }
  }
}

// ---------------------------------------------------------------------------
// Cell state queries
// ---------------------------------------------------------------------------

export function isHole(r: number, c: number): boolean { return G.cellState[r] && G.cellState[r][c] === "hole"; }
export function isRock(r: number, c: number): boolean { return G.cellState[r] && G.cellState[r][c] === "rock"; }
export function isIce(r: number, c: number): boolean { return G.cellState[r] && (G.cellState[r][c] === "ice1" || G.cellState[r][c] === "ice2"); }
export function isPlayable(r: number, c: number): boolean { return !isHole(r, c) && !isRock(r, c); }

export function damageIce(r: number, c: number): boolean {
  if (G.cellState[r][c] === "ice2") { G.cellState[r][c] = "ice1"; SFX.iceCrack(); return false; }
  if (G.cellState[r][c] === "ice1") { G.cellState[r][c] = null; SFX.iceCrack(); return true; }
  return true;
}

export function damageAdjacentIce(clearList: [number, number][]): void {
  const iceSet = new Set<number>();
  for (const [r, c] of clearList) {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr, nc = c + dc;
        if (inBounds(nr, nc) && isIce(nr, nc)) iceSet.add(nr * G.cols + nc);
      }
    }
  }
  for (const key of iceSet) {
    damageIce(Math.floor(key / G.cols), key % G.cols);
  }
}

// ---------------------------------------------------------------------------
// Countdown
// ---------------------------------------------------------------------------

export function tickCountdowns(): [number, number][] {
  const exploded: [number, number][] = [];
  for (let r = 0; r < G.rows; r++) {
    for (let c = 0; c < G.cols; c++) {
      const cell = G.board[r][c];
      if (cell && cell.special === "countdown") {
        cell.countdown!--;
        if (cell.countdown! <= 0) exploded.push([r, c]);
      }
    }
  }
  return exploded;
}

// ---------------------------------------------------------------------------
// Bounds & adjacency
// ---------------------------------------------------------------------------

export function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < G.rows && c >= 0 && c < G.cols;
}

export function isAdjacent(r1: number, c1: number, r2: number, c2: number): boolean {
  const dr = Math.abs(r1 - r2);
  const dc = Math.abs(c1 - c2);
  return dr <= 1 && dc <= 1 && (dr + dc > 0);
}

// 第1章「軌道系」（Stage 501〜）のオービット進入判定。現在のステージにオービットが無ければ
// (Stage 1〜500は常にこの状態) 常にtrueを返し、既存の挙動に一切影響しない
export function isSwapLegalForCurrentStage(r1: number, c1: number, r2: number, c2: number): boolean {
  return isSwapLegal(r1, c1, r2, c2, G.STAGES![G.currentStage].orbits);
}

// 入力受付(doMove)・ヒント(findHint)で共有するオービットの拒否判定。
// 実際に起動が発生するスワップは対象外、それ以外は進入方向が重力方向と一致しない限り拒否する
export function isSwapBlockedByOrbit(
  p1: Piece | null, p2: Piece | null, r1: number, c1: number, r2: number, c2: number,
): boolean {
  return !isActivatingSwap(p1, p2) && !isSwapLegalForCurrentStage(r1, c1, r2, c2);
}

// ---------------------------------------------------------------------------
// Match finding
// ---------------------------------------------------------------------------

export function isMatchable(r: number, c: number): boolean {
  if (!G.board[r][c]) return false;
  if (isHole(r, c) || isRock(r, c)) return false;
  if (isIce(r, c)) return false;
  const sp = G.board[r][c]!.special;
  if (sp === null) return true;
  switch (sp) {
    case "line_h":
    case "line_v":
    case "line_d":
    case "bomb":
    case "countdown":
      return false;
    case "rainbow":
      return true;
    default: {
      const _exhaustive: never = sp;
      return false;
    }
  }
}

export function findAllMatches(): [number, number][] {
  const matched = new Set<number>();
  const directions: [number, number][] = [[0, 1], [1, 0]];
  for (let r = 0; r < G.rows; r++) {
    for (let c = 0; c < G.cols; c++) {
      if (!isMatchable(r, c)) continue;
      const color = G.board[r][c]!.color;
      for (const [dr, dc] of directions) {
        const line: [number, number][] = [[r, c]];
        let nr = r + dr, nc = c + dc;
        while (inBounds(nr, nc) && isMatchable(nr, nc) && G.board[nr][nc]!.color === color) {
          line.push([nr, nc]);
          nr += dr;
          nc += dc;
        }
        if (line.length >= MATCH_MIN) {
          line.forEach(([lr, lc]) => matched.add(lr * G.cols + lc));
        }
      }
    }
  }
  const stg = G.STAGES![G.currentStage];
  if (stg && stg.features && stg.features.diagonalLine) {
    for (let r = 0; r < G.rows - 1; r++) {
      for (let c = 0; c < G.cols - 1; c++) {
        if (!isMatchable(r, c)) continue;
        const color = G.board[r][c]!.color;
        const cells: [number, number][] = [[r,c],[r,c+1],[r+1,c],[r+1,c+1]];
        const allMatch = cells.every(([cr, cc]) => isMatchable(cr, cc) && G.board[cr][cc]!.color === color);
        if (allMatch) cells.forEach(([cr, cc]) => matched.add(cr * G.cols + cc));
      }
    }
  }
  return [...matched].map((v) => [Math.floor(v / G.cols), v % G.cols] as [number, number]);
}

export function findSpecialCreations(matches: [number, number][]): SpecialCreation[] {
  const specials: SpecialCreation[] = [];
  const matchSet = new Set(matches.map(([r, c]) => r * G.cols + c));
  const stg = G.STAGES![G.currentStage];

  const hLines: { line: [number, number][]; color: number }[] = [];
  const vLines: { line: [number, number][]; color: number }[] = [];

  for (let r = 0; r < G.rows; r++) {
    for (let c = 0; c < G.cols; c++) {
      if (!G.board[r][c]) continue;
      if (isHole(r, c) || isRock(r, c)) continue;
      const color = G.board[r][c]!.color;

      // horizontal
      {
        const line: [number, number][] = [[r, c]];
        let nc = c + 1;
        while (inBounds(r, nc) && G.board[r][nc] && !isHole(r, nc) && !isRock(r, nc) && G.board[r][nc]!.color === color) {
          line.push([r, nc]);
          nc++;
        }
        if (line.length >= MATCH_MIN && line.every(([lr, lc]) => matchSet.has(lr * G.cols + lc))) {
          hLines.push({ line, color });
        }
      }

      // vertical
      {
        const line: [number, number][] = [[r, c]];
        let nr = r + 1;
        while (inBounds(nr, c) && G.board[nr][c] && !isHole(nr, c) && !isRock(nr, c) && G.board[nr][c]!.color === color) {
          line.push([nr, c]);
          nr++;
        }
        if (line.length >= MATCH_MIN && line.every(([lr, lc]) => matchSet.has(lr * G.cols + lc))) {
          vLines.push({ line, color });
        }
      }
    }
  }

  const usedCells = new Set<number>();

  // T/L shape: intersecting horizontal + vertical of same color -> bomb
  for (const h of hLines) {
    for (const v of vLines) {
      if (h.color !== v.color) continue;
      for (const [hr, hc] of h.line) {
        for (const [vr, vc] of v.line) {
          if (hr === vr && hc === vc) {
            const allCells: [number, number][] = [...h.line, ...v.line];
            let sr = hr, sc = hc;
            if (G.lastSwapTarget && allCells.some(([cr, cc]) => cr === G.lastSwapTarget!.r && cc === G.lastSwapTarget!.c)) {
              sr = G.lastSwapTarget.r;
              sc = G.lastSwapTarget.c;
            }
            const key = sr * G.cols + sc;
            if (!usedCells.has(key)) {
              specials.push({ r: sr, c: sc, type: "bomb", color: h.color });
              usedCells.add(key);
              allCells.forEach(([lr, lc]) => usedCells.add(lr * G.cols + lc));
            }
          }
        }
      }
    }
  }

  // 5+ line -> rainbow, 4 line -> line clear
  const allLines = [
    ...hLines.map((h) => ({ ...h, dir: "h" as const })),
    ...vLines.map((v) => ({ ...v, dir: "v" as const })),
  ];

  for (const { line, color, dir } of allLines) {
    const mid = line[Math.floor(line.length / 2)];
    const midKey = mid[0] * G.cols + mid[1];
    if (usedCells.has(midKey)) continue;

    if (line.length >= 5) {
      let sr = mid[0], sc = mid[1], sk = midKey;
      if (G.lastSwapTarget && line.some(([lr, lc]) => lr === G.lastSwapTarget!.r && lc === G.lastSwapTarget!.c)) {
        sr = G.lastSwapTarget.r;
        sc = G.lastSwapTarget.c;
        sk = sr * G.cols + sc;
      }
      if (!usedCells.has(sk)) {
        specials.push({ r: sr, c: sc, type: "rainbow", color });
        usedCells.add(sk);
      }
    } else if (line.length === 4) {
      const type: SpecialType = dir === "h" ? "line_h" : "line_v";
      let sr = line[1][0], sc = line[1][1];
      if (G.lastSwapTarget && line.some(([lr, lc]) => lr === G.lastSwapTarget!.r && lc === G.lastSwapTarget!.c)) {
        sr = G.lastSwapTarget.r;
        sc = G.lastSwapTarget.c;
      }
      const posKey = sr * G.cols + sc;
      if (!usedCells.has(posKey)) {
        specials.push({ r: sr, c: sc, type, color });
        usedCells.add(posKey);
      }
    }
  }

  // 2x2 square -> diagonal line (at swap target position if within the square)
  if (stg && stg.features && stg.features.diagonalLine) {
    for (let r = 0; r < G.rows - 1; r++) {
      for (let c = 0; c < G.cols - 1; c++) {
        if (!G.board[r][c]) continue;
        const sqColor = G.board[r][c]!.color;
        const cells: [number, number][] = [[r,c],[r,c+1],[r+1,c],[r+1,c+1]];
        if (cells.every(([cr,cc]) => G.board[cr][cc] && G.board[cr][cc]!.color === sqColor) &&
            cells.every(([cr,cc]) => matchSet.has(cr * G.cols + cc)) &&
            cells.every(([cr,cc]) => !usedCells.has(cr * G.cols + cc))) {
          let sr = r, sc = c;
          if (G.lastSwapTarget && cells.some(([cr,cc]) => cr === G.lastSwapTarget!.r && cc === G.lastSwapTarget!.c)) {
            sr = G.lastSwapTarget.r;
            sc = G.lastSwapTarget.c;
          }
          specials.push({ r: sr, c: sc, type: "line_d", color: sqColor });
          cells.forEach(([cr,cc]) => usedCells.add(cr * G.cols + cc));
        }
      }
    }
  }

  return specials;
}

// ---------------------------------------------------------------------------
// 「有効な1手」の共有列挙（通常スワップ・タップ起動・スワップ起動系特殊ピース）
// findHint()・（将来のPhaseで配線する）合法手0件判定・手動シャッフルの品質基準・
// シミュレーターが同じ定義を共有すること（GIMMICK_REDESIGN.md「適用範囲」参照）
// ---------------------------------------------------------------------------

// タップ起動可能な特殊ピース（ダブルタップで起動する、スワップを伴わない手）を1つ探す
export function findTapActivatableSpecialCell(): CellPos | null {
  for (let r = 0; r < G.rows; r++) {
    for (let c = 0; c < G.cols; c++) {
      const p = G.board[r][c];
      if (p && p.special && TAP_ACTIVATE_SPECIALS.has(p.special) && isPlayable(r, c)) {
        return { r, c };
      }
    }
  }
  return null;
}

// スワップ起動系特殊ピース（レインボー・特殊ピース同士のコンボ、方向拘束の対象外）による
// 有効な1手を1組探す
export function findActivatingSwapPair(): { a: CellPos; b: CellPos } | null {
  let result: { a: CellPos; b: CellPos } | null = null;
  forEachAdjacentPlayablePair((r, c, nr, nc) => {
    if (isActivatingSwap(G.board[r][c], G.board[nr][nc])) {
      result = { a: { r, c }, b: { r: nr, c: nc } };
      return true;
    }
  });
  return result;
}

// 通常スワップ（オービット制約適用後）・タップ起動・スワップ起動系特殊ピースのいずれかが
// 1つでも存在すれば true。タップ起動・スワップ起動系は判定コストが軽いため先に調べ、
// 最後にコストの高い通常スワップの当たり判定（スワップ→マッチ判定→スワップ復元）を行う
export function hasAnyLegalMove(): boolean {
  if (findTapActivatableSpecialCell()) return true;
  if (findActivatingSwapPair()) return true;
  let found = false;
  forEachAdjacentPlayablePair((r, c, nr, nc) => {
    if (isSwapBlockedByOrbit(G.board[r][c], G.board[nr][nc], r, c, nr, nc)) return;
    swapPieces(r, c, nr, nc);
    const hasMatch = findAllMatches().length > 0;
    swapPieces(r, c, nr, nc);
    if (hasMatch) { found = true; return true; }
  });
  return found;
}

// ---------------------------------------------------------------------------
// 詰み回復・品質基準付きシャッフル（第1章「軌道系」Phase 4b-2）
// 品質基準は「合法手が1つ以上存在し、かつシャッフル直後の盤面自体に即座マッチが
// 成立していないこと」。ステージ生成時の「2〜10の範囲」とは意図的に異なる基準
// （回復・手動シャッフルは詰み解消だけが目的で、範囲まで要求すると成功率を
// 不必要に下げてしまうため。GIMMICK_REDESIGN.md参照）
// ---------------------------------------------------------------------------

export const SHUFFLE_QUALITY_MAX_ATTEMPTS = 10;
export const BOARD_REGEN_MAX_ATTEMPTS = 20;

// 現在の盤面のピース（色・特殊とも）を保ったまま座標だけをランダムに並べ替える。
// 結果が品質基準を満たすかどうかは呼び出し側（shuffleWithQualityGate）が判定する
function shuffleBoardPiecesInPlace(): void {
  const pieces: Piece[] = [];
  const positions: [number, number][] = [];
  for (let r = 0; r < G.rows; r++) {
    for (let c = 0; c < G.cols; c++) {
      if (G.board[r][c]) { pieces.push(G.board[r][c]!); positions.push([r, c]); }
    }
  }
  for (let i = pieces.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
  }
  positions.forEach(([r, c], idx) => { G.board[r][c] = pieces[idx]; });
}

// 品質基準（合法手1つ以上＋即座マッチなし）を満たす並べ替えが見つかるまで
// 上限回数以内で再試行する。見つかればtrueを返し、その並べ替えをG.boardに残す。
// 見つからなければfalseを返す（このときG.boardは最後に試した失敗状態のまま残るため、
// 元の盤面に戻す必要がある場合は呼び出し側が事前にcloneBoard()でスナップショットを
// 取り、失敗時にG.boardへ差し戻すこと。自動デッドロック回復・手動シャッフルアイテム
// 双方で共有する — GIMMICK_REDESIGN.md「シャッフルアイテム」参照）
export function shuffleWithQualityGate(maxAttempts: number): boolean {
  for (let i = 0; i < maxAttempts; i++) {
    shuffleBoardPiecesInPlace();
    if (findAllMatches().length === 0 && hasAnyLegalMove()) return true;
  }
  return false;
}

// 盤面を丸ごと作り直す詰み回復の最終フォールバック（初期盤面生成と同じ
// fillBoardUntilStable()を再利用）。既存の特殊ピースは失われるため、プレイヤー
// 操作を介さない自動デッドロック回復でのみ使用する（有料の手動シャッフルアイテム
// では絶対に使わないこと。既存の特殊ピースが対価もなく消滅してしまうため）
export function regenerateBoardForDeadlock(numColors: number, maxAttempts: number): boolean {
  for (let i = 0; i < maxAttempts; i++) {
    fillBoardUntilStable(numColors);
    if (hasAnyLegalMove()) return true;
  }
  return false;
}

// 盤面のディープコピー（シャッフル失敗時に元の盤面へ差し戻すためのスナップショット）
export function cloneBoard(): (Piece | null)[][] {
  return G.board.map(row => row.map(cell => cell ? { ...cell } : null));
}

// ---------------------------------------------------------------------------
// Hint system
// ---------------------------------------------------------------------------

export function findHint(): HintData | null {
  const PRIORITY: Record<string, number> = { rainbow: 3, bomb: 2, line_d: 2, line_h: 1, line_v: 1 };
  let bestList: HintData[] = [];
  let bestPriority = 0;
  const normalList: HintData[] = [];

  forEachAdjacentPlayablePair((r, c, nr, nc) => {
    if (isSwapBlockedByOrbit(G.board[r][c], G.board[nr][nc], r, c, nr, nc)) return;

    swapPieces(r, c, nr, nc);
    const matches = findAllMatches();
    if (matches.length > 0) {
      const specials = findSpecialCreations(matches);
      let hasSpecial = false;
      for (const sp of specials) {
        const p = PRIORITY[sp.type] || 0;
        if (p > 0) {
          hasSpecial = true;
          const colorMatches = matches.filter(([mr, mc]) =>
            G.board[mr][mc] && G.board[mr][mc]!.color === sp.color);
          const colorSet = new Set(colorMatches.map(([mr, mc]) => mr * G.cols + mc));
          const pos1in = colorSet.has(r * G.cols + c);
          const mover: CellPos = pos1in ? { r: nr, c: nc } : { r, c };
          const swapDest: CellPos = pos1in ? { r, c } : { r: nr, c: nc };
          const pattern: CellPos[] = colorMatches
            .filter(([mr, mc]) => !(mr === swapDest.r && mc === swapDest.c))
            .map(([mr, mc]) => ({ r: mr, c: mc }));
          if (p > bestPriority) {
            bestPriority = p;
            bestList = [{ mover, pattern }];
          } else if (p === bestPriority) {
            bestList.push({ mover, pattern });
          }
        }
      }
      if (!hasSpecial) {
        const matchSet = new Set(matches.map(([mr, mc]) => mr * G.cols + mc));
        let targetColor = -1;
        if (matchSet.has(nr * G.cols + nc) && G.board[nr][nc]) targetColor = G.board[nr][nc]!.color;
        else if (matchSet.has(r * G.cols + c) && G.board[r][c]) targetColor = G.board[r][c]!.color;
        if (targetColor >= 0) {
          const colorMatches = matches.filter(([mr, mc]) =>
            G.board[mr][mc] && G.board[mr][mc]!.color === targetColor);
          const colorSet = new Set(colorMatches.map(([mr, mc]) => mr * G.cols + mc));
          const pos1in = colorSet.has(r * G.cols + c);
          const mover: CellPos = pos1in ? { r: nr, c: nc } : { r, c };
          const swapDest: CellPos = pos1in ? { r, c } : { r: nr, c: nc };
          const pattern: CellPos[] = colorMatches
            .filter(([mr, mc]) => !(mr === swapDest.r && mc === swapDest.c))
            .map(([mr, mc]) => ({ r: mr, c: mc }));
          normalList.push({ mover, pattern });
        }
      }
    }
    swapPieces(r, c, nr, nc);
  });

  if (bestList.length > 0) return bestList[Math.floor(Math.random() * bestList.length)];
  if (normalList.length > 0) return normalList[Math.floor(Math.random() * normalList.length)];

  // 通常マッチ成立スワップの候補が無くても、タップ起動・スワップ起動系特殊ピースが
  // 有効な1手として残っていればそれをヒントにする（4aでは通常スワップのみだった欠落を解消）
  const tapCell = findTapActivatableSpecialCell();
  if (tapCell) return { mover: tapCell, pattern: [] };
  const swapPair = findActivatingSwapPair();
  if (swapPair) return { mover: swapPair.a, pattern: [swapPair.b] };

  return null;
}

export function startHintTimer(): void {
  clearHint();
  G.hintTimer = setTimeout(() => {
    if (G.animating) return;
    const hint = findHint();
    if (hint) {
      G.hintData = hint;
      startHintAnim();
    }
  }, HINT_DELAY_MS);
}

export function clearHint(): void {
  if (G.hintTimer) { clearTimeout(G.hintTimer); G.hintTimer = null; }
  if (G.hintAnimId) { cancelAnimationFrame(G.hintAnimId); G.hintAnimId = null; }
  if (G.hintData) { G.hintData = null; drawBoard(); }
}

export function startHintAnim(): void {
  const startTime = performance.now();
  function tick(): void {
    if (!G.hintData) return;
    drawBoard(() => {
      const elapsed = performance.now() - startTime;
      const pulse = 0.5 + 0.5 * Math.sin(elapsed / 300);
      G.ctx!.save();
      for (const cell of G.hintData!.pattern) {
        const cx = cell.c * G.cellSize + G.cellSize / 2;
        const cy = cell.r * G.cellSize + G.cellSize / 2;
        const radius = G.cellSize * 0.45;
        G.ctx!.globalAlpha = 0.15 + 0.2 * pulse;
        G.ctx!.fillStyle = "#fff";
        G.ctx!.beginPath();
        G.ctx!.arc(cx, cy, radius * (0.9 + 0.1 * pulse), 0, Math.PI * 2);
        G.ctx!.fill();
        G.ctx!.strokeStyle = "#ffe66d";
        G.ctx!.lineWidth = 1.5;
        G.ctx!.globalAlpha = 0.3 + 0.3 * pulse;
        G.ctx!.stroke();
      }
      const m = G.hintData!.mover;
      const mcx = m.c * G.cellSize + G.cellSize / 2;
      const mcy = m.r * G.cellSize + G.cellSize / 2;
      const mr = G.cellSize * 0.45;
      G.ctx!.globalAlpha = 0.3 + 0.4 * pulse;
      G.ctx!.fillStyle = "#fff";
      G.ctx!.beginPath();
      G.ctx!.arc(mcx, mcy, mr * (0.9 + 0.15 * pulse), 0, Math.PI * 2);
      G.ctx!.fill();
      G.ctx!.strokeStyle = "#ffe66d";
      G.ctx!.lineWidth = 2.5;
      G.ctx!.globalAlpha = 0.6 + 0.4 * pulse;
      G.ctx!.stroke();
      G.ctx!.restore();
    });
    G.hintAnimId = requestAnimationFrame(tick);
  }
  tick();
}

// ---------------------------------------------------------------------------
// Special piece activation
// ---------------------------------------------------------------------------

export function activateSpecial(r: number, c: number, alreadyCleared: Set<number>, triggeredBy?: SpecialType | string | null): [number, number][] {
  const piece = G.board[r][c];
  if (!piece || !piece.special) return [];
  let sp: string = piece.special;
  if (triggeredBy === "line_h" && sp === "line_h") sp = "line_v";
  else if (triggeredBy === "line_v" && sp === "line_v") sp = "line_h";
  const extra: [number, number][] = [];
  const key = (r2: number, c2: number): number => r2 * G.cols + c2;

  if (sp === "line_h") {
    for (let cc = 0; cc < G.cols; cc++) {
      if (!alreadyCleared.has(key(r, cc)) && G.board[r][cc] && isPlayable(r, cc)) {
        extra.push([r, cc]);
      }
    }
  } else if (sp === "line_v") {
    for (let rr = 0; rr < G.rows; rr++) {
      if (!alreadyCleared.has(key(rr, c)) && G.board[rr][c] && isPlayable(rr, c)) {
        extra.push([rr, c]);
      }
    }
  } else if (sp === "line_d") {
    for (let d = -Math.max(G.rows, G.cols); d <= Math.max(G.rows, G.cols); d++) {
      const r1 = r + d, c1 = c + d;
      if (inBounds(r1, c1) && !alreadyCleared.has(key(r1, c1)) && G.board[r1][c1] && isPlayable(r1, c1)) extra.push([r1, c1]);
      const r2 = r + d, c2 = c - d;
      if (inBounds(r2, c2) && !alreadyCleared.has(key(r2, c2)) && G.board[r2][c2] && isPlayable(r2, c2)) extra.push([r2, c2]);
    }
  } else if (sp === "bomb") {
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        const nr = r + dr;
        const nc = c + dc;
        if (inBounds(nr, nc) && !alreadyCleared.has(key(nr, nc)) && G.board[nr][nc] && isPlayable(nr, nc)) {
          extra.push([nr, nc]);
        }
      }
    }
  } else if (sp === "rainbow") {
    const targetColor = piece.color;
    for (let rr = 0; rr < G.rows; rr++) {
      for (let cc = 0; cc < G.cols; cc++) {
        if (G.board[rr][cc] && G.board[rr][cc]!.color === targetColor && !alreadyCleared.has(key(rr, cc)) && isPlayable(rr, cc)) {
          extra.push([rr, cc]);
        }
      }
    }
  } else if (sp === "countdown") {
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        const nr = r + dr, nc = c + dc;
        if (inBounds(nr, nc) && !alreadyCleared.has(key(nr, nc)) && G.board[nr][nc] && isPlayable(nr, nc)) extra.push([nr, nc]);
      }
    }
  }
  return extra;
}

// ---------------------------------------------------------------------------
// Gravity & fill (data only, no animation)
// ---------------------------------------------------------------------------

export function applyGravityData(): FallEntry[] {
  const numColors = G.STAGES![G.currentStage].colors;
  const fallMap: FallEntry[] = [];
  for (let c = 0; c < G.cols; c++) {
    let writeRow = G.rows - 1;
    while (writeRow >= 0 && (isHole(writeRow, c) || isRock(writeRow, c))) writeRow--;
    for (let r = writeRow; r >= 0; r--) {
      if (isHole(r, c) || isRock(r, c)) continue;
      if (G.board[r][c]) {
        if (r !== writeRow) {
          G.board[writeRow][c] = G.board[r][c];
          G.board[r][c] = null;
          fallMap.push({ c, fromR: r, toR: writeRow, piece: G.board[writeRow][c]! });
        }
        writeRow--;
        while (writeRow >= 0 && (isHole(writeRow, c) || isRock(writeRow, c))) writeRow--;
      }
    }
    let newPieceOffset = 0;
    for (let r = writeRow; r >= 0; r--) {
      if (isHole(r, c) || isRock(r, c)) continue;
      G.board[r][c] = randomPiece(numColors);
      newPieceOffset++;
      fallMap.push({ c, fromR: -newPieceOffset, toR: r, piece: G.board[r][c]!, isNew: true });
    }
  }
  return fallMap;
}

// ---------------------------------------------------------------------------
// Swap
// ---------------------------------------------------------------------------

export function swapPieces(r1: number, c1: number, r2: number, c2: number): void {
  const tmp = G.board[r1][c1];
  G.board[r1][c1] = G.board[r2][c2];
  G.board[r2][c2] = tmp;
}

// ---------------------------------------------------------------------------
// Combo type lookup
// ---------------------------------------------------------------------------

function assertSpecialExhaustive(_sp: never): void {}

function normalizeSpecial(sp: SpecialType): "line" | "line_d" | "bomb" | "rainbow" | "countdown" {
  switch (sp) {
    case "line_h":
    case "line_v":
      return "line";
    case "line_d":
      return "line_d";
    case "bomb":
      return "bomb";
    case "rainbow":
      return "rainbow";
    case "countdown":
      return "countdown";
    default: {
      assertSpecialExhaustive(sp);
      return "countdown";
    }
  }
}

export function getComboType(s1: SpecialType | null, s2: SpecialType | null): ComboType | null {
  if (!s1 || !s2) return null;
  const n1 = normalizeSpecial(s1);
  const n2 = normalizeSpecial(s2);
  if (n1 === "countdown" || n2 === "countdown") return null;
  const pair = [n1, n2].sort().join("+");
  const combos: Record<string, ComboType> = {
    "line+line": "cross",
    "line+line_d": "star_cross",
    "line_d+line_d": "star_cross",
    "bomb+line": "triple_line",
    "bomb+line_d": "triple_line",
    "bomb+bomb": "big_bomb",
    "line+rainbow": "rainbow_line",
    "line_d+rainbow": "rainbow_line",
    "bomb+rainbow": "rainbow_bomb",
    "rainbow+rainbow": "board_clear",
  };
  return combos[pair] || null;
}
