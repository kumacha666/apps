import type { CellPos } from "./types";
import { G, COLS, ROWS, PIECE_COLORS } from "./state";

const SHAPE_PATHS: Record<string, (ctx: CanvasRenderingContext2D, x: number, y: number, r: number) => void> = {
  circle: (ctx, x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); },
  diamond: (ctx, x, y, r) => {
    ctx.beginPath();
    ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y);
    ctx.closePath(); ctx.fill();
  },
  square: (ctx, x, y, r) => {
    const s = r * 0.85;
    ctx.beginPath();
    ctx.roundRect(x - s, y - s, s * 2, s * 2, s * 0.3);
    ctx.fill();
  },
  triangle: (ctx, x, y, r) => {
    ctx.beginPath();
    ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.87, y + r * 0.5); ctx.lineTo(x - r * 0.87, y + r * 0.5);
    ctx.closePath(); ctx.fill();
  },
  star: (ctx, x, y, r) => {
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const angle = (i * 72 - 90) * Math.PI / 180;
      const inner = (i * 72 - 90 + 36) * Math.PI / 180;
      ctx.lineTo(x + Math.cos(angle) * r, y + Math.sin(angle) * r);
      ctx.lineTo(x + Math.cos(inner) * r * 0.5, y + Math.sin(inner) * r * 0.5);
    }
    ctx.closePath(); ctx.fill();
  },
};
const SHAPES = ["circle", "diamond", "square", "triangle", "star", "circle", "diamond"];

const SPECIAL_SYMBOLS: Record<string, string> = {
  bomb: "💣",
  line_h: "↔",
  line_v: "↕",
  line_d: "↗",
  rainbow: "🌈",
};

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

export function drawBoard(): void {
  const ctx = G.ctx!;
  const cs = G.cellSize;
  const ox = G.offsetX;
  const oy = G.offsetY;

  // Clear
  ctx.fillStyle = "#0a0a2e";
  ctx.fillRect(0, 0, G.canvas!.width, G.canvas!.height);

  // Board background
  ctx.fillStyle = "rgba(255,255,255,0.03)";
  ctx.fillRect(ox, oy, G.boardPixelW, G.boardPixelH);

  // Grid
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

  // Pieces
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const piece = G.board[r]?.[c];
      if (!piece) continue;
      const cx = ox + c * cs + cs / 2;
      const cy = oy + r * cs + cs / 2;
      const radius = cs * 0.38;

      ctx.fillStyle = PIECE_COLORS[piece.color];

      // Draw shape
      const shape = SHAPES[piece.color] || "circle";
      if (SHAPE_PATHS[shape]) {
        ctx.save();
        // Add glow for special pieces
        if (piece.special) {
          ctx.shadowColor = PIECE_COLORS[piece.color];
          ctx.shadowBlur = 12;
        }
        SHAPE_PATHS[shape](ctx, cx, cy, radius);
        ctx.restore();
      }

      // Special indicator
      if (piece.special) {
        ctx.save();
        ctx.font = `${cs * 0.35}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(SPECIAL_SYMBOLS[piece.special] || "?", cx, cy);
        ctx.restore();
      }

      // Countdown
      if (piece.countdown !== undefined) {
        ctx.save();
        ctx.font = `bold ${cs * 0.3}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = piece.countdown <= 2 ? "#e94560" : "#fff";
        ctx.fillText(String(piece.countdown), cx, cy + radius * 0.6);
        ctx.restore();
      }
    }
  }
}

export function pixelToCell(px: number, py: number): CellPos | null {
  const r = Math.floor((py - G.offsetY) / G.cellSize);
  const c = Math.floor((px - G.offsetX) / G.cellSize);
  if (r >= 0 && r < ROWS && c >= 0 && c < COLS) return { r, c };
  return null;
}

export function drawClearEffect(cells: [number, number][]): void {
  const ctx = G.ctx!;
  const cs = G.cellSize;
  const ox = G.offsetX;
  const oy = G.offsetY;

  ctx.save();
  for (const [r, c] of cells) {
    const cx = ox + c * cs + cs / 2;
    const cy = oy + r * cs + cs / 2;
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(cx, cy, cs * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
