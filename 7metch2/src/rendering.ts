import type { Piece, CellPos } from "./types";
import { G, COLS, ROWS, PIECE_COLORS } from "./state";
import { drawVFX } from "./vfx";

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

export function resizeCanvas(): void {
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
  const color = PIECE_COLORS[piece.color];
  const t = performance.now() / 1000;

  if (piece.special === "debris") {
    ctx.save();
    const grad = ctx.createRadialGradient(cx - radius * 0.2, cy - radius * 0.2, radius * 0.1, cx, cy, radius);
    grad.addColorStop(0, "#888");
    grad.addColorStop(0.6, "#555");
    grad.addColorStop(1, "#333");
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = 1.5 * s;
    ctx.stroke();
    // Crack lines
    ctx.strokeStyle = "rgba(0,0,0,0.3)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - radius * 0.3, cy - radius * 0.1);
    ctx.lineTo(cx + radius * 0.1, cy + radius * 0.3);
    ctx.moveTo(cx + radius * 0.2, cy - radius * 0.3);
    ctx.lineTo(cx - radius * 0.1, cy + radius * 0.1);
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (piece.special) {
    ctx.save();

    // Animated outer glow ring
    const pulseAlpha = 0.3 + 0.2 * Math.sin(t * 3);
    const pulseR = radius * (1.3 + 0.1 * Math.sin(t * 4));
    ctx.globalAlpha = pulseAlpha;
    ctx.strokeStyle = piece.special === "rainbow" ? `hsl(${(t * 120) % 360},100%,70%)` : color;
    ctx.lineWidth = 2.5 * s;
    ctx.beginPath();
    ctx.arc(cx, cy, pulseR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Draw the planet
    drawPlanet(ctx, piece.color, cx, cy, radius);

    // Special-specific overlays
    const sp = piece.special;
    if (sp === "bomb") {
      // Rotating spikes
      const spikes = 6;
      const innerR = radius * 0.55;
      const outerR = radius * 0.95;
      ctx.strokeStyle = "rgba(255,200,50,0.7)";
      ctx.lineWidth = 1.5 * s;
      for (let i = 0; i < spikes; i++) {
        const a = t * 2 + (Math.PI * 2 * i) / spikes;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * innerR, cy + Math.sin(a) * innerR);
        ctx.lineTo(cx + Math.cos(a) * outerR, cy + Math.sin(a) * outerR);
        ctx.stroke();
      }
      // Center dot
      ctx.fillStyle = "rgba(255,100,0,0.8)";
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.15, 0, Math.PI * 2);
      ctx.fill();
    } else if (sp === "line_h" || sp === "line_v" || sp === "line_d") {
      // Arrow line through center
      ctx.strokeStyle = "rgba(255,255,255,0.8)";
      ctx.lineWidth = 2 * s;
      ctx.lineCap = "round";
      const len = radius * 0.8;
      let dx = len, dy = 0;
      if (sp === "line_v") { dx = 0; dy = len; }
      else if (sp === "line_d") { dx = len * 0.7; dy = -len * 0.7; }
      ctx.beginPath();
      ctx.moveTo(cx - dx, cy - dy);
      ctx.lineTo(cx + dx, cy + dy);
      ctx.stroke();
      // Arrowheads
      const aSize = radius * 0.25;
      for (const dir of [1, -1]) {
        const ax = cx + dx * dir, ay = cy + dy * dir;
        const angle = Math.atan2(dy * dir, dx * dir);
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax - Math.cos(angle - 0.5) * aSize, ay - Math.sin(angle - 0.5) * aSize);
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax - Math.cos(angle + 0.5) * aSize, ay - Math.sin(angle + 0.5) * aSize);
        ctx.stroke();
      }
    } else if (sp === "rainbow") {
      // Rotating rainbow ring
      const ringR = radius * 0.75;
      ctx.lineWidth = 3 * s;
      for (let i = 0; i < 6; i++) {
        const startA = t * 1.5 + (Math.PI * 2 * i) / 6;
        const endA = startA + Math.PI / 4;
        ctx.strokeStyle = `hsl(${i * 60},100%,65%)`;
        ctx.beginPath();
        ctx.arc(cx, cy, ringR, startA, endA);
        ctx.stroke();
      }
      // White star center
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      const starR = radius * 0.2;
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = t * 2 + (Math.PI * 2 * i) / 4;
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * starR, cy + Math.sin(a) * starR);
      }
      ctx.fill();
    }

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
    duration: 1200,
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
