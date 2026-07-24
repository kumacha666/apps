import type { StageConfig, Mission, StageFeatures, StarGate, CellStateType } from "./types";
import { G, STAR_GATES, PIECE_COLORS, PIECE_NAMES_JA } from "./state";

export function getTotalStars(): number {
  return Object.values(G.saveData.bestStars).reduce((sum, s) => sum + s, 0);
}

export function isStageUnlocked(i: number): boolean {
  if (i === 0) return true;
  if (!G.saveData.cleared[i - 1]) return false;
  const gate = STAR_GATES.find((g) => g.stage === i);
  if (gate && getTotalStars() < gate.stars) return false;
  return true;
}

export function getGateFor(i: number): StarGate | null {
  return STAR_GATES.find((g) => g.stage === i) || null;
}

// 350面以降、special/chainミッションのcount。4以上にするとhole配置
// (i%5のバリアント)次第でクリア率が5%を割るステージが一定確率で発生する
// ことをシミュレーションで確認済み(2026-07-24)。350面到達直後の最低値
// (旧: 2)からは引き上げつつ、安全な3で固定する(伸び続けない設計は意図的)
const POST_350_SPECIAL_CHAIN_COUNT = 3;

// --- Stages ---
export function boardSizeForStage(i: number): { cols: number; rows: number } {
  if (i < 10) return { cols: 6, rows: 7 };
  if (i < 100) return { cols: 7, rows: 8 };
  if (i < 250) return { cols: 8, rows: 9 };
  return { cols: 9, rows: 10 };
}

export function generateHolePattern(c: number, r: number, variant: number): [number, number][] {
  const holes: [number, number][] = [];
  switch (variant) {
    case 0:
      holes.push([0,0],[0,1],[1,0]);
      holes.push([0,c-1],[0,c-2],[1,c-1]);
      holes.push([r-1,0],[r-1,1],[r-2,0]);
      holes.push([r-1,c-1],[r-1,c-2],[r-2,c-1]);
      break;
    case 1:
      for (let rr = 0; rr < r; rr++) {
        for (let cc = 0; cc < c; cc++) {
          const dr = Math.abs(rr - Math.floor(r/2));
          const dc = Math.abs(cc - Math.floor(c/2));
          if (dr + dc <= 1 && !(dr === 0 && dc === 0)) holes.push([rr, cc]);
        }
      }
      break;
    case 2:
      holes.push([0,0],[0,c-1],[r-1,0],[r-1,c-1]);
      holes.push([0, Math.floor(c/2)]);
      holes.push([r-1, Math.floor(c/2)]);
      break;
    case 3:
      for (let rr = 0; rr < 3; rr++) {
        for (let cc = c-3; cc < c; cc++) {
          if (rr === 0 || cc === c-1) continue;
          holes.push([rr, cc]);
        }
      }
      break;
    case 4:
      holes.push([0,0],[0,c-1],[r-1,0],[r-1,c-1]);
      holes.push([0,Math.floor(c/2)],[r-1,Math.floor(c/2)]);
      holes.push([Math.floor(r/2),0],[Math.floor(r/2),c-1]);
      break;
  }
  return holes;
}

export function buildStages(): StageConfig[] {
  const stages: StageConfig[] = [];
  for (let i = 0; i < 500; i++) {
    const size = boardSizeForStage(i);
    const tier = Math.floor(i / 10);
    const baseMoves = Math.max(14, 22 - tier);
    let moves: number;
    if (i < 10) moves = 20;
    else if (size.cols >= 9) moves = Math.max(16, baseMoves);
    else if (size.cols >= 8) moves = Math.max(14, baseMoves);
    else moves = baseMoves;
    if (i >= 100) moves += 2;
    if (i >= 295) moves += 1;
    const baseColors = Math.min(7, 5 + Math.floor(i / 10));
    const colors = (i >= 200) ? 8 : baseColors;

    const star2rate = i < 10 ? 0.65 : 0.6;
    const star3rate = i < 10 ? 0.45 : 0.35;

    const features: StageFeatures = {};
    features.diagonalLine = true;
    if (i >= 100) features.ice = true;
    if (i >= 150) features.rock = true;
    if (i >= 250) features.holes = true;
    if (i >= 300) features.countdown = true;

    let iceCells = 0, rockCells = 0, holePattern: [number, number][] | null = null, countdownBombs = 0;
    if (features.ice) {
      const progress = Math.min(1, (i - 100) / 100);
      iceCells = 1 + Math.floor(progress * 3);
    }
    if (features.rock) {
      const progress = Math.min(1, (i - 150) / 100);
      rockCells = 1 + Math.floor(progress * 2);
    }
    if (features.holes) {
      holePattern = generateHolePattern(size.cols, size.rows, i % 5);
    }
    if (features.countdown) {
      const progress = Math.min(1, (i - 300) / 50);
      countdownBombs = 1 + Math.floor(progress * 1);
    }

    let mission: Mission;
    if (i >= 350) {
      const slot = i % 7;
      if (slot === 0) {
        const targetColor = i % colors;
        mission = { type: "color", colorIndex: targetColor, count: Math.floor(moves * 0.8) };
      } else if (slot === 1 || slot === 5) {
        mission = { type: "special", count: POST_350_SPECIAL_CHAIN_COUNT };
      } else if (slot === 3) {
        mission = { type: "score", target: Math.floor(moves * Math.min(55, 30 + i * 0.2)) };
      } else if (slot === 4) {
        mission = { type: "clear", count: Math.floor(moves * Math.min(4.5, 2.5 + i * 0.01)) };
      } else {
        // slot === 2 || slot === 6
        mission = { type: "chain", count: POST_350_SPECIAL_CHAIN_COUNT };
      }
    } else if (i % 5 === 0 && i > 0) {
      const targetColor = i % colors;
      mission = { type: "color", colorIndex: targetColor, count: Math.floor(moves * Math.min(0.8, 0.4 + i * 0.005)) };
    } else if (i % 3 === 0) {
      mission = { type: "score", target: Math.floor(moves * Math.min(55, 30 + i * 0.2)) };
    } else {
      mission = { type: "clear", count: Math.floor(moves * Math.min(4.5, 2.5 + i * 0.01)) };
    }

    stages.push({
      name: `${i + 1}`,
      moves,
      colors,
      boardCols: size.cols,
      boardRows: size.rows,
      mission,
      star2moves: Math.floor(moves * star2rate),
      star3moves: Math.floor(moves * star3rate),
      features,
      iceCells,
      rockCells,
      holePattern,
      countdownBombs,
    });
  }
  return stages;
}

export function getMissionText(m: Mission, html?: boolean): string {
  switch (m.type) {
    case "score": return `${m.target}点 とろう`;
    case "clear": return `${m.count}個 けそう`;
    case "color":
      if (html) {
        const c = PIECE_COLORS[m.colorIndex!];
        return `<span style="display:inline-block;width:1.3em;height:1.3em;border-radius:50%;background:${c};vertical-align:middle;margin:-2px 2px 0 0;box-shadow:inset -2px -2px 4px rgba(0,0,0,.3)"></span>を${m.count}個けそう`;
      }
      return `${PIECE_NAMES_JA[m.colorIndex!]}を${m.count}個けそう`;
    case "special": return `特殊ピースを${m.count}個つくろう`;
    case "chain": return `${m.count}チェインしよう`;
    default: return "";
  }
}

export function hasSquare(): boolean {
  const isHole = (r: number, c: number): boolean => G.cellState[r] && G.cellState[r][c] === "hole";
  const isRock = (r: number, c: number): boolean => G.cellState[r] && G.cellState[r][c] === "rock";
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
