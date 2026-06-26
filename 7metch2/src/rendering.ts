import type { Piece, CellPos } from "./types";
import { G, COLS, ROWS, PIECE_COLORS } from "./state";
import { drawVFX } from "./vfx";

const SPECIAL_SYMBOLS: Record<string, string> = {
  bomb: "\u{1f4a3}",
  line_h: "↔",
  line_v: "↕",
  line_d: "↗",
  rainbow: "\u{1f308}",
};

// --- Color utilities ---

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
    : { r: 0, g: 0, b: 0 };
}

function lightenColor(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  return `rgb(${Math.min(255, rgb.r + amount)},${Math.min(255, rgb.g + amount)},${Math.min(255, rgb.b + amount)})`;
}

function darkenColor(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  return `rgb(${Math.max(0, rgb.r - amount)},${Math.max(0, rgb.g - amount)},${Math.max(0, rgb.b - amount)})`;
}

// --- Canvas init ---

export function initCanvas(): void {
  const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
  G.canvas = canvas;
  G.ctx = canvas.getContext("2d")!;
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);
}

function resizeCanvas(): void {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const hudH = 50;
  const bottomH = 40;
  const availH = vh - hudH - bottomH;
  const availW = vw - 16;

  G.cellSize = Math.floor(Math.min(availW / COLS, availH / ROWS));
  G.boardPixelW = G.cellSize * COLS;
  G.boardPixelH = G.cellSize * ROWS;
  G.offsetX = Math.floor((vw - G.boardPixelW) / 2);
  G.offsetY = hudH + Math.floor((availH - G.boardPixelH) / 2);

  const dpr = window.devicePixelRatio || 1;
  G.canvas!.width = vw * dpr;
  G.canvas!.height = vh * dpr;
  G.canvas!.style.width = vw + "px";
  G.canvas!.style.height = vh + "px";
  G.ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// --- Draw planet-style piece ---

function drawPlanet(ctx: CanvasRenderingContext2D, colorIdx: number, cx: number, cy: number, r: number): void {
  const color = PIECE_COLORS[colorIdx];
  ctx.save();

  // Outer glow
  ctx.shadowColor = color;
  ctx.shadowBlur = r * 0.6;

  // 3D sphere gradient
  const grad = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.25, r * 0.1, cx, cy, r);
  grad.addColorStop(0, lightenColor(color, 60));
  grad.addColorStop(0.5, color);
  grad.addColorStop(1, darkenColor(color, 60));

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.shadowBlur = 0;

  // Specular highlight
  const hlGrad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 0, cx - r * 0.3, cy - r * 0.3, r * 0.6);
  hlGrad.addColorStop(0, "rgba(255,255,255,0.45)");
  hlGrad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = hlGrad;
  ctx.fill();

  ctx.restore();
}

// --- Public: draw a single piece at pixel coords ---

export function drawPieceAt(piece: Piece, cx: number, cy: number, scale?: number): void {
  const s = scale ?? 1;
  const radius = G.cellSize * 0.36 * s;
  const ctx = G.ctx!;

  if (piece.special) {
    // Draw special with glow
    ctx.save();
    drawPlanet(ctx, piece.color, cx, cy, radius);
    ctx.font = `${G.cellSize * 0.35 * s}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(SPECIAL_SYMBOLS[piece.special] || "?", cx, cy);
    ctx.restore();
  } else {
    drawPlanet(ctx, piece.color, cx, cy, radius);
  }

  // Countdown
  if (piece.countdown !== undefined) {
    ctx.save();
    ctx.font = `bold ${G.cellSize * 0.3 * s}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = piece.countdown <= 2 ? "#e94560" : "#fff";
    ctx.fillText(String(piece.countdown), cx, cy + radius * 0.6);
    ctx.restore();
  }
}

// --- Draw board background only ---

export function drawBoardBase(): void {
  const ctx = G.ctx!;
  const cs = G.cellSize;
  const ox = G.offsetX + G.shakeX;
  const oy = G.offsetY + G.shakeY;

  // Clear entire canvas
  ctx.fillStyle = "#0a0a2e";
  ctx.fillRect(0, 0, G.canvas!.width, G.canvas!.height);

  // Board background
  ctx.fillStyle = "rgba(255,255,255,0.03)";
  ctx.fillRect(ox, oy, G.boardPixelW, G.boardPixelH);

  // Grid lines
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  for (let r = 0; r <= ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(ox, oy + r * cs);
    ctx.lineTo(ox + G.boardPixelW, oy + r * cs);
    ctx.stroke();
  }
  for (let c = 0; c <= COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(ox + c * cs, oy);
    ctx.lineTo(ox + c * cs, oy + G.boardPixelH);
    ctx.stroke();
  }
}

// --- Chain label ---

export function startChainLabel(chain: number): void {
  G.activeChainLabel = {
    chain,
    label: `${chain} Chain!`,
    startTime: performance.now(),
    duration: 550,
  };
}

function drawChainLabel(): void {
  if (!G.activeChainLabel) return;
  const { chain, label, startTime, duration } = G.activeChainLabel;
  const t = (performance.now() - startTime) / duration;
  if (t >= 1) { G.activeChainLabel = null; return; }

  const popT = Math.min(t / 0.15, 1);
  const scale = popT < 1 ? 0.3 + popT * 1.0 : 1.3 - (t - 0.15) * 0.35;
  const yOffset = -t * G.cellSize * 0.6;
  const alpha = t < 0.65 ? 1 : 1 - (t - 0.65) / 0.35;
  const chainColor = chain >= 5 ? "#ff4444" : chain >= 3 ? "#ff8800" : "#ffd700";

  const ctx = G.ctx!;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = chainColor;
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 4;
  ctx.shadowColor = chainColor;
  ctx.shadowBlur = 8 + chain * 3;
  ctx.font = `bold ${G.cellSize * (0.7 + chain * 0.05) * scale}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const x = G.offsetX + G.boardPixelW / 2;
  const y = G.offsetY + G.boardPixelH / 2 + yOffset;
  ctx.strokeText(label, x, y);
  ctx.fillText(label, x, y);
  ctx.restore();
}

// --- Main draw ---

export function drawBoard(overlay?: (ctx: CanvasRenderingContext2D) => void): void {
  drawBoardBase();

  const ctx = G.ctx!;
  const cs = G.cellSize;
  const ox = G.offsetX + G.shakeX;
  const oy = G.offsetY + G.shakeY;

  // Pieces
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const piece = G.board[r]?.[c];
      if (!piece) continue;
      const cx = ox + c * cs + cs / 2;
      const cy = oy + r * cs + cs / 2;
      drawPieceAt(piece, cx, cy);
    }
  }

  if (overlay) overlay(ctx);

  drawChainLabel();
  drawVFX();
}

export function pixelToCell(px: number, py: number): CellPos | null {
  const r = Math.floor((py - G.offsetY) / G.cellSize);
  const c = Math.floor((px - G.offsetX) / G.cellSize);
  if (r >= 0 && r < ROWS && c >= 0 && c < COLS) return { r, c };
  return null;
}
