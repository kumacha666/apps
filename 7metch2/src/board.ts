import type { Piece, SpecialType } from "./types";
import { G, COLS, ROWS, NUM_COLORS } from "./state";
import { has } from "./upgrades";

export function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < ROWS && c >= 0 && c < COLS;
}

export function randomPiece(numColors?: number): Piece {
  return { color: Math.floor(Math.random() * (numColors ?? NUM_COLORS)), special: null };
}

export function createBoard(): void {
  const ups = G.run.upgrades;
  const matchMin = has(ups, "match2") ? 2 : 3;
  for (let attempt = 0; attempt < 30; attempt++) {
    G.board = [];
    for (let r = 0; r < ROWS; r++) {
      G.board[r] = [];
      for (let c = 0; c < COLS; c++) {
        G.board[r][c] = randomPiece();
      }
    }
    if (findAllMatches(matchMin).length === 0) return;
  }
  // fallback: just clear matches by rerolling
  let safety = 0;
  while (findAllMatches(matchMin).length > 0 && safety < 500) {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        G.board[r][c] = randomPiece();
      }
    }
    safety++;
  }
}

export function getMatchMin(): number {
  return has(G.run.upgrades, "match2") ? 2 : 3;
}

export function findAllMatches(matchMin?: number): [number, number][] {
  const min = matchMin ?? getMatchMin();
  const matched = new Set<number>();
  const directions: [number, number][] = [[0, 1], [1, 0]];

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = G.board[r][c];
      if (!p || p.special === "debris") continue;
      const color = p.color;
      for (const [dr, dc] of directions) {
        const line: [number, number][] = [[r, c]];
        let nr = r + dr, nc = c + dc;
        while (inBounds(nr, nc)) {
          const np = G.board[nr][nc];
          if (!np || np.special === "debris" || np.color !== color) break;
          line.push([nr, nc]);
          nr += dr;
          nc += dc;
        }
        if (line.length >= min) {
          line.forEach(([lr, lc]) => matched.add(lr * COLS + lc));
        }
      }
    }
  }

  // 2x2 match
  if (has(G.run.upgrades, "match_2x2")) {
    for (let r = 0; r < ROWS - 1; r++) {
      for (let c = 0; c < COLS - 1; c++) {
        const cells: [number, number][] = [[r, c], [r, c + 1], [r + 1, c], [r + 1, c + 1]];
        if (cells.some(([cr, cc]) => !G.board[cr][cc] || G.board[cr][cc]!.special === "debris")) continue;
        const color = G.board[r][c]!.color;
        if (cells.every(([cr, cc]) => G.board[cr][cc]!.color === color)) {
          cells.forEach(([cr, cc]) => matched.add(cr * COLS + cc));
        }
      }
    }
  }

  return [...matched].map(v => [Math.floor(v / COLS), v % COLS] as [number, number]);
}

export interface SpecialCreation {
  r: number;
  c: number;
  type: SpecialType;
  color: number;
}

export function findSpecialCreations(matches: [number, number][]): SpecialCreation[] {
  const ups = G.run.upgrades;
  const specials: SpecialCreation[] = [];
  if (!has(ups, "match4_bomb") && !has(ups, "match_lt_bomb") && !has(ups, "match5_rainbow") && !has(ups, "match_2x2")) {
    return specials;
  }

  const matchSet = new Set(matches.map(([r, c]) => r * COLS + c));
  const usedCells = new Set<number>();

  // Find lines
  const hLines: { line: [number, number][]; color: number }[] = [];
  const vLines: { line: [number, number][]; color: number }[] = [];

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!G.board[r][c] || G.board[r][c]!.special) continue;
      const color = G.board[r][c]!.color;
      // horizontal
      {
        const line: [number, number][] = [[r, c]];
        let nc = c + 1;
        while (inBounds(r, nc) && G.board[r][nc] && !G.board[r][nc]!.special && G.board[r][nc]!.color === color) {
          line.push([r, nc]);
          nc++;
        }
        if (line.length >= 3 && line.every(([lr, lc]) => matchSet.has(lr * COLS + lc))) {
          hLines.push({ line, color });
        }
      }
      // vertical
      {
        const line: [number, number][] = [[r, c]];
        let nr = r + 1;
        while (inBounds(nr, c) && G.board[nr][c] && !G.board[nr][c]!.special && G.board[nr][c]!.color === color) {
          line.push([nr, c]);
          nr++;
        }
        if (line.length >= 3 && line.every(([lr, lc]) => matchSet.has(lr * COLS + lc))) {
          vLines.push({ line, color });
        }
      }
    }
  }

  // L/T shape -> bomb
  if (has(ups, "match_lt_bomb")) {
    for (const h of hLines) {
      for (const v of vLines) {
        if (h.color !== v.color) continue;
        for (const [hr, hc] of h.line) {
          for (const [vr, vc] of v.line) {
            if (hr === vr && hc === vc) {
              const key = hr * COLS + hc;
              if (!usedCells.has(key)) {
                specials.push({ r: hr, c: hc, type: "bomb", color: h.color });
                usedCells.add(key);
                [...h.line, ...v.line].forEach(([lr, lc]) => usedCells.add(lr * COLS + lc));
              }
            }
          }
        }
      }
    }
  }

  // 5+ -> rainbow, 4 -> bomb/line
  const allLines = [
    ...hLines.map(h => ({ ...h, dir: "h" as const })),
    ...vLines.map(v => ({ ...v, dir: "v" as const })),
  ];

  for (const { line, color, dir } of allLines) {
    const mid = line[Math.floor(line.length / 2)];
    const midKey = mid[0] * COLS + mid[1];
    if (usedCells.has(midKey)) continue;

    if (line.length >= 5 && has(ups, "match5_rainbow")) {
      specials.push({ r: mid[0], c: mid[1], type: "rainbow", color });
      usedCells.add(midKey);
    } else if (line.length >= 4 && has(ups, "match4_bomb")) {
      const type: SpecialType = dir === "h" ? "line_h" : "line_v";
      specials.push({ r: line[1][0], c: line[1][1], type, color });
      usedCells.add(line[1][0] * COLS + line[1][1]);
    }
  }

  // 2x2 -> bomb
  if (has(ups, "match_2x2")) {
    for (let r = 0; r < ROWS - 1; r++) {
      for (let c = 0; c < COLS - 1; c++) {
        if (!G.board[r][c]) continue;
        const sqColor = G.board[r][c]!.color;
        const cells: [number, number][] = [[r, c], [r, c + 1], [r + 1, c], [r + 1, c + 1]];
        if (cells.every(([cr, cc]) => G.board[cr][cc] && !G.board[cr][cc]!.special && G.board[cr][cc]!.color === sqColor) &&
          cells.every(([cr, cc]) => matchSet.has(cr * COLS + cc)) &&
          cells.every(([cr, cc]) => !usedCells.has(cr * COLS + cc))) {
          specials.push({ r, c, type: "bomb", color: sqColor });
          cells.forEach(([cr, cc]) => usedCells.add(cr * COLS + cc));
        }
      }
    }
  }

  return specials;
}

export function getBombRange(): number {
  const ups = G.run.upgrades;
  if (has(ups, "bomb_range_7")) return 3;
  if (has(ups, "bomb_range_5")) return 2;
  return 1;
}

export function activateSpecial(r: number, c: number, alreadyCleared: Set<number>): [number, number][] {
  const piece = G.board[r][c];
  if (!piece || !piece.special) return [];
  const sp = piece.special;
  const extra: [number, number][] = [];
  const ups = G.run.upgrades;
  const key = (r2: number, c2: number) => r2 * COLS + c2;

  if (sp === "line_h" || sp === "line_v") {
    const lineCount = has(ups, "line_cross") ? -1 : has(ups, "line_3") ? 3 : 1;
    const doX = has(ups, "line_x");

    if (lineCount === -1 || doX) {
      // cross or X: do both horizontal and vertical (and diagonals for X)
      for (let cc = 0; cc < COLS; cc++) {
        if (!alreadyCleared.has(key(r, cc)) && G.board[r][cc]) extra.push([r, cc]);
      }
      for (let rr = 0; rr < ROWS; rr++) {
        if (!alreadyCleared.has(key(rr, c)) && G.board[rr][c]) extra.push([rr, c]);
      }
      if (doX) {
        for (let d = -Math.max(ROWS, COLS); d <= Math.max(ROWS, COLS); d++) {
          if (inBounds(r + d, c + d) && !alreadyCleared.has(key(r + d, c + d)) && G.board[r + d][c + d]) extra.push([r + d, c + d]);
          if (inBounds(r + d, c - d) && !alreadyCleared.has(key(r + d, c - d)) && G.board[r + d][c - d]) extra.push([r + d, c - d]);
        }
      }
    } else {
      // single or triple line
      const offsets = lineCount === 3 ? [-1, 0, 1] : [0];
      if (sp === "line_h") {
        for (const off of offsets) {
          const rr = r + off;
          if (!inBounds(rr, 0)) continue;
          for (let cc = 0; cc < COLS; cc++) {
            if (!alreadyCleared.has(key(rr, cc)) && G.board[rr][cc]) extra.push([rr, cc]);
          }
        }
      } else {
        for (const off of offsets) {
          const cc = c + off;
          if (!inBounds(0, cc)) continue;
          for (let rr = 0; rr < ROWS; rr++) {
            if (!alreadyCleared.has(key(rr, cc)) && G.board[rr][cc]) extra.push([rr, cc]);
          }
        }
      }
    }
  } else if (sp === "line_d") {
    for (let d = -Math.max(ROWS, COLS); d <= Math.max(ROWS, COLS); d++) {
      if (inBounds(r + d, c + d) && !alreadyCleared.has(key(r + d, c + d)) && G.board[r + d][c + d]) extra.push([r + d, c + d]);
      if (inBounds(r + d, c - d) && !alreadyCleared.has(key(r + d, c - d)) && G.board[r + d][c - d]) extra.push([r + d, c - d]);
    }
  } else if (sp === "bomb") {
    const range = getBombRange();
    for (let dr = -range; dr <= range; dr++) {
      for (let dc = -range; dc <= range; dc++) {
        const nr = r + dr, nc = c + dc;
        if (inBounds(nr, nc) && !alreadyCleared.has(key(nr, nc)) && G.board[nr][nc]) {
          extra.push([nr, nc]);
        }
      }
    }
  } else if (sp === "rainbow") {
    const targetColor = piece.color;
    const placeBombs = has(ups, "rainbow_bombs");
    for (let rr = 0; rr < ROWS; rr++) {
      for (let cc = 0; cc < COLS; cc++) {
        if (G.board[rr][cc] && G.board[rr][cc]!.color === targetColor && !alreadyCleared.has(key(rr, cc))) {
          extra.push([rr, cc]);
          if (placeBombs && !G.board[rr][cc]!.special) {
            G.board[rr][cc]!.special = "bomb";
          }
        }
      }
    }
  }

  // Split: spawn 2 small specials at random positions
  if (has(ups, "split") && sp !== "rainbow") {
    for (let i = 0; i < 2; i++) {
      let attempts = 0;
      while (attempts < 50) {
        const sr = Math.floor(Math.random() * ROWS);
        const sc = Math.floor(Math.random() * COLS);
        if (G.board[sr][sc] && !G.board[sr][sc]!.special && !alreadyCleared.has(key(sr, sc))) {
          G.board[sr][sc]!.special = "bomb";
          break;
        }
        attempts++;
      }
    }
  }

  return extra;
}

export function applyGravity(): void {
  const ups = G.run.upgrades;
  for (let c = 0; c < COLS; c++) {
    let writeRow = ROWS - 1;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (G.board[r][c]) {
        if (r !== writeRow) {
          G.board[writeRow][c] = G.board[r][c];
          G.board[r][c] = null;
        }
        writeRow--;
      }
    }
    // Fill from top
    for (let r = writeRow; r >= 0; r--) {
      // Debris: chance increases with chain count (starts at chain 1)
      const debrisChance = G.chainCount >= 1 ? Math.min(0.6, G.chainCount * 0.1) : 0;
      if (debrisChance > 0 && Math.random() < debrisChance) {
        G.board[r][c] = { color: Math.floor(Math.random() * NUM_COLORS), special: "debris" };
        continue;
      }
      const p = randomPiece();
      // Proliferation: double the chance of last cleared color
      if (has(ups, "proliferation") && G.proliferationColor !== null && Math.random() < 0.4) {
        p.color = G.proliferationColor;
      }
      // Timed bombs: chance to spawn countdown
      if (has(ups, "timed_bombs") && Math.random() < 0.12) {
        p.special = "bomb";
        p.countdown = 5 + Math.floor(Math.random() * 3);
      }
      G.board[r][c] = p;
    }
  }
}

export function swapPieces(r1: number, c1: number, r2: number, c2: number): void {
  const tmp = G.board[r1][c1];
  G.board[r1][c1] = G.board[r2][c2];
  G.board[r2][c2] = tmp;
}

export function isAdjacentAllowed(r1: number, c1: number, r2: number, c2: number): boolean {
  const dr = Math.abs(r1 - r2);
  const dc = Math.abs(c1 - c2);
  if (dr + dc === 0) return false;
  if (dr <= 1 && dc <= 1) {
    if (dr === 1 && dc === 1) {
      return has(G.run.upgrades, "diagonal_move");
    }
    return true;
  }
  return false;
}

export function countAvailableMoves(): number {
  const matchMin = getMatchMin();
  let count = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!G.board[r][c]) continue;
      const neighbors: [number, number][] = [
        [r, c + 1], [r + 1, c],
      ];
      if (has(G.run.upgrades, "diagonal_move")) {
        neighbors.push([r + 1, c + 1], [r + 1, c - 1]);
      }
      for (const [nr, nc] of neighbors) {
        if (!inBounds(nr, nc) || !G.board[nr][nc]) continue;
        swapPieces(r, c, nr, nc);
        if (findAllMatches(matchMin).length > 0) count++;
        swapPieces(r, c, nr, nc);
      }
    }
  }
  return count;
}

export function autoDetonateCheck(): [number, number][] {
  if (!has(G.run.upgrades, "auto_detonate")) return [];
  const toDetonate: [number, number][] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!G.board[r][c]?.special) continue;
      const neighbors: [number, number][] = [
        [r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1],
        [r - 1, c - 1], [r - 1, c + 1], [r + 1, c - 1], [r + 1, c + 1],
      ];
      for (const [nr, nc] of neighbors) {
        if (inBounds(nr, nc) && G.board[nr][nc]?.special) {
          toDetonate.push([r, c]);
          break;
        }
      }
    }
  }
  return toDetonate;
}

export function tickCountdowns(): [number, number][] {
  const exploded: [number, number][] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = G.board[r][c];
      if (cell && cell.countdown !== undefined) {
        cell.countdown--;
        if (cell.countdown <= 0) exploded.push([r, c]);
      }
    }
  }
  return exploded;
}
