import type { Piece, CellPos, RunState } from "./types";

export const COLS = 7;
export const ROWS = 8;
export const NUM_COLORS = 5;
export const PIECE_COLORS = ["#e94560", "#4ecdc4", "#ffd700", "#c0c8d8", "#ff8a5c", "#1e4fff", "#ff6bb3"];

export interface GameState {
  board: (Piece | null)[][];
  animating: boolean;
  movesLeft: number;
  score: number;
  totalCleared: number;
  chainCount: number;
  maxChain: number;
  run: RunState;
  canvas: HTMLCanvasElement | null;
  ctx: CanvasRenderingContext2D | null;
  cellSize: number;
  boardPixelW: number;
  boardPixelH: number;
  offsetX: number;
  offsetY: number;
  dragStart: CellPos | null;
  dragStartPx: { x: number; y: number } | null;
  lastSwapDir: { dr: number; dc: number } | null;
  stageTarget: number;
  proliferationColor: number | null;
  clearCountThisTurn: number;
}

export const G: GameState = {
  board: [],
  animating: false,
  movesLeft: 0,
  score: 0,
  totalCleared: 0,
  chainCount: 0,
  maxChain: 0,
  run: { stage: 0, score: 0, totalCleared: 0, upgrades: [], resonanceCounts: new Array(7).fill(0) },
  canvas: null,
  ctx: null,
  cellSize: 48,
  boardPixelW: 0,
  boardPixelH: 0,
  offsetX: 0,
  offsetY: 0,
  dragStart: null,
  dragStartPx: null,
  lastSwapDir: null,
  stageTarget: 0,
  proliferationColor: null,
  clearCountThisTurn: 0,
};
