import type { Piece, CellPos, RunState } from "./types";

export let COLS = 7;
export let ROWS = 8;

export function setBoardSize(cols: number, rows: number): void {
  COLS = cols;
  ROWS = rows;
}
export let NUM_COLORS = 5;

export function setNumColors(n: number): void {
  NUM_COLORS = n;
}
export const PIECE_COLORS = ["#e94560", "#4ecdc4", "#ffd700", "#c0c8d8", "#ff8a5c", "#1e4fff", "#ff6bb3"];

export interface VfxParticle {
  x: number; y: number;
  vx: number; vy: number;
  color: string;
  life: number; decay: number;
  size: number; sizeDecay: number;
  alpha: number;
  rotation: number;
}

export interface VfxShockwave {
  x: number; y: number;
  r: number; maxR: number;
  frame: number; duration: number;
  color: string;
}

export interface VfxFlash {
  x: number; y: number;
  r: number; maxR: number;
  frame: number; duration: number;
  color: string;
}

export interface ChainLabel {
  chain: number;
  label: string;
  startTime: number;
  duration: number;
}

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
  shuffledThisStage: boolean;
  // VFX
  vfxParticles: VfxParticle[];
  vfxShockwaves: VfxShockwave[];
  vfxFlashes: VfxFlash[];
  shakeX: number;
  shakeY: number;
  shakeIntensity: number;
  // Chain label
  activeChainLabel: ChainLabel | null;
  disabledUpgrades: Set<string>;
  // Tuning parameters (settings screen)
  debrisRate: number;
  scoreDiminish: number;
  boardGrowthRate: number;
  baseMoves: number;
  targetMultiplier: number;
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
  shuffledThisStage: false,
  // VFX
  vfxParticles: [],
  vfxShockwaves: [],
  vfxFlashes: [],
  shakeX: 0,
  shakeY: 0,
  shakeIntensity: 0,
  // Chain label
  activeChainLabel: null,
  disabledUpgrades: new Set<string>(),
  debrisRate: 1.0,
  scoreDiminish: 3,
  boardGrowthRate: 3,
  baseMoves: 20,
  targetMultiplier: 1.0,
};
