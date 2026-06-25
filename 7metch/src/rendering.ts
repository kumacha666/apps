import type { Piece, SpecialType, ChainLabel, BgStar, ShootingStar } from "./types";
import { G, PIECE_COLORS, PIECE_SHAPES, PIECE_SYMBOLS, ANIM } from "./state";
import { drawVFX, updateVFX, hasActiveVFX, addScreenShake } from "./vfx";
import { isHole, isRock, isIce, TAP_ACTIVATE_SPECIALS } from "./board";

// --- Chain Label System ---

export function startChainLabel(chain: number): void {
  G.activeChainLabel = { chain, label: `${chain} Chain!`, startTime: performance.now(), duration: 550 };
  if (chain >= 3) addScreenShake(Math.min(chain * 0.8, 4));
}

export function updateChainLabel(): void {
  if (!G.activeChainLabel) return;
  if (performance.now() - G.activeChainLabel.startTime >= G.activeChainLabel.duration) {
    G.activeChainLabel = null;
  }
}

export function drawChainLabel(): void {
  if (!G.activeChainLabel) return;
  const { chain, label, startTime, duration } = G.activeChainLabel;
  const t = (performance.now() - startTime) / duration;
  const popT = Math.min(t / 0.15, 1);
  const scale = popT < 1 ? 0.3 + popT * 1.0 : 1.3 - (t - 0.15) * 0.35;
  const yOffset = -t * G.cellSize * 0.6;
  const alpha = t < 0.65 ? 1 : 1 - (t - 0.65) / 0.35;
  const chainColor = chain >= 5 ? "#ff4444" : chain >= 3 ? "#ff8800" : "#ffd700";

  G.ctx!.save();
  G.ctx!.globalAlpha = alpha;
  G.ctx!.fillStyle = chainColor;
  G.ctx!.strokeStyle = "#000";
  G.ctx!.lineWidth = 4;
  G.ctx!.shadowColor = chainColor;
  G.ctx!.shadowBlur = 8 + chain * 3;
  G.ctx!.font = `bold ${G.cellSize * (0.7 + chain * 0.05) * scale}px sans-serif`;
  G.ctx!.textAlign = "center";
  G.ctx!.textBaseline = "middle";
  const x = G.boardPixelW / 2;
  const y = G.boardPixelH / 2 + yOffset;
  G.ctx!.strokeText(label, x, y);
  G.ctx!.fillText(label, x, y);
  G.ctx!.restore();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function flashInvalid(r1: number, c1: number, r2: number, c2: number): Promise<void> {
  for (let i = 0; i < 3; i++) {
    drawBoard((ctx: CanvasRenderingContext2D) => {
      ctx.save();
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = "#f00";
      ctx.fillRect(c1 * G.cellSize, r1 * G.cellSize, G.cellSize, G.cellSize);
      ctx.fillRect(c2 * G.cellSize, r2 * G.cellSize, G.cellSize, G.cellSize);
      ctx.restore();
    });
    await sleep(60);
    drawBoard();
    await sleep(60);
  }
}

// --- Drawing ---
export function drawBoardBase(): void {
  G.ctx!.clearRect(0, 0, G.boardPixelW, G.boardPixelH);
  G.ctx!.save();
  G.ctx!.translate(G.shakeX, G.shakeY);

  // Animated space background
  drawSpaceBackground();

  for (let r = 0; r < G.rows; r++) {
    for (let c = 0; c < G.cols; c++) {
      const x = c * G.cellSize;
      const y = r * G.cellSize;
      if (isHole(r, c)) {
        G.ctx!.fillStyle = "rgba(5,5,16,0.85)";
        G.ctx!.fillRect(x, y, G.cellSize, G.cellSize);
        continue;
      }
      if (isRock(r, c)) {
        G.ctx!.fillStyle = "rgba(25,25,40,0.9)";
        G.ctx!.fillRect(x, y, G.cellSize, G.cellSize);
        G.ctx!.save();
        G.ctx!.fillStyle = "#3a3a4a";
        const rcx = x + G.cellSize / 2;
        const rcy = y + G.cellSize / 2;
        const rr = G.cellSize / 2 - 4;
        G.ctx!.beginPath();
        G.ctx!.arc(rcx, rcy, rr, 0, Math.PI * 2);
        G.ctx!.fill();
        G.ctx!.strokeStyle = "#555";
        G.ctx!.lineWidth = 2;
        G.ctx!.stroke();
        G.ctx!.strokeStyle = "#666";
        G.ctx!.lineWidth = 2;
        G.ctx!.beginPath();
        G.ctx!.moveTo(rcx - rr * 0.4, rcy - rr * 0.4);
        G.ctx!.lineTo(rcx + rr * 0.4, rcy + rr * 0.4);
        G.ctx!.moveTo(rcx + rr * 0.4, rcy - rr * 0.4);
        G.ctx!.lineTo(rcx - rr * 0.4, rcy + rr * 0.4);
        G.ctx!.stroke();
        G.ctx!.restore();
        continue;
      }
      // Semi-transparent cell overlay so stars show through subtly
      G.ctx!.fillStyle = (r + c) % 2 === 0 ? "rgba(10,18,40,0.45)" : "rgba(14,24,50,0.45)";
      G.ctx!.fillRect(x, y, G.cellSize, G.cellSize);
    }
  }
}

export function drawPieceAt(piece: Piece | null, cx: number, cy: number): void {
  if (!piece) return;
  const radius = G.cellSize * 0.36;

  if (piece.special) {
    drawSpecialIcon(G.ctx!, piece.special, cx, cy, G.cellSize * 0.44, piece);
  } else {
    if (G.pieceCacheSize === G.cellSize && G.pieceCache[piece.color]) {
      const cached = G.pieceCache[piece.color];
      const pad = 1.4;
      const size = Math.ceil(G.cellSize * pad);
      G.ctx!.drawImage(cached, cx - size / 2, cy - size / 2, size, size);
    } else {
      drawPlanet(G.ctx!, piece.color, cx, cy, radius);
    }
  }
}

export function drawIceOverlay(r: number, c: number): void {
  const x = c * G.cellSize, y = r * G.cellSize;
  G.ctx!.save();
  const iceAlpha = G.cellState[r][c] === "ice2" ? 0.35 : 0.2;
  G.ctx!.fillStyle = `rgba(100, 200, 255, ${iceAlpha})`;
  G.ctx!.fillRect(x + 1, y + 1, G.cellSize - 2, G.cellSize - 2);
  G.ctx!.strokeStyle = `rgba(150, 220, 255, ${iceAlpha + 0.15})`;
  G.ctx!.lineWidth = 2;
  G.ctx!.strokeRect(x + 2, y + 2, G.cellSize - 4, G.cellSize - 4);
  G.ctx!.strokeStyle = `rgba(200, 240, 255, ${iceAlpha})`;
  G.ctx!.lineWidth = 1;
  G.ctx!.beginPath();
  G.ctx!.moveTo(x + G.cellSize * 0.2, y + G.cellSize * 0.3);
  G.ctx!.lineTo(x + G.cellSize * 0.5, y + G.cellSize * 0.15);
  G.ctx!.lineTo(x + G.cellSize * 0.8, y + G.cellSize * 0.3);
  G.ctx!.stroke();
  if (G.cellState[r][c] === "ice2") {
    G.ctx!.beginPath();
    G.ctx!.moveTo(x + G.cellSize * 0.3, y + G.cellSize * 0.7);
    G.ctx!.lineTo(x + G.cellSize * 0.6, y + G.cellSize * 0.85);
    G.ctx!.stroke();
  }
  G.ctx!.restore();
}

export function drawBoard(overlay?: (ctx: CanvasRenderingContext2D) => void): void {
  drawBoardBase();

  for (let r = 0; r < G.rows; r++) {
    for (let c = 0; c < G.cols; c++) {
      if (!G.board[r][c] || isHole(r, c) || isRock(r, c)) continue;
      const piece = G.board[r][c]!;

      const cx = c * G.cellSize + G.cellSize / 2;
      const cy = r * G.cellSize + G.cellSize / 2;
      const x = c * G.cellSize;
      const y = r * G.cellSize;

      drawPieceAt(piece, cx, cy);

      if (isIce(r, c)) {
        drawIceOverlay(r, c);
      }

      if (G.selected && G.selected.r === r && G.selected.c === c) {
        G.ctx!.save();
        const isActivatable = piece.special && TAP_ACTIVATE_SPECIALS.has(piece.special);
        if (isActivatable) {
          const pulse = 0.4 + Math.sin(performance.now() / 200) * 0.2;
          G.ctx!.strokeStyle = "#ffd700";
          G.ctx!.lineWidth = 3;
          G.ctx!.globalAlpha = pulse;
          G.ctx!.shadowColor = "#ffd700";
          G.ctx!.shadowBlur = 10;
          G.ctx!.strokeRect(c * G.cellSize + 1, r * G.cellSize + 1, G.cellSize - 2, G.cellSize - 2);
        } else {
          G.ctx!.strokeStyle = "#fff";
          G.ctx!.lineWidth = 3;
          G.ctx!.strokeRect(c * G.cellSize + 2, r * G.cellSize + 2, G.cellSize - 4, G.cellSize - 4);
        }
        G.ctx!.restore();
      }
    }
  }

  if (overlay) overlay(G.ctx!);
  updateChainLabel();
  drawChainLabel();
  G.ctx!.restore();
}

// --- Color utility functions for planet gradients ---
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 0, g: 0, b: 0 };
}

export function lightenColor(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  const r = Math.min(255, rgb.r + amount);
  const g = Math.min(255, rgb.g + amount);
  const b = Math.min(255, rgb.b + amount);
  return `rgb(${r},${g},${b})`;
}

export function darkenColor(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  const r = Math.max(0, rgb.r - amount);
  const g = Math.max(0, rgb.g - amount);
  const b = Math.max(0, rgb.b - amount);
  return `rgb(${r},${g},${b})`;
}

// --- Planet drawing functions ---
export function drawPlanet(ctx: CanvasRenderingContext2D, colorIdx: number, cx: number, cy: number, r: number): void {
  ctx.save();
  const color = PIECE_COLORS[colorIdx];

  // Outer glow
  ctx.shadowColor = color;
  ctx.shadowBlur = r * 0.6;

  // Base sphere with radial gradient (3D effect)
  const grad = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.25, r * 0.1, cx, cy, r);
  grad.addColorStop(0, lightenColor(color, 60));
  grad.addColorStop(0.5, color);
  grad.addColorStop(1, darkenColor(color, 60));

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  // Reset shadow for details
  ctx.shadowBlur = 0;

  // Planet-specific surface details
  switch (colorIdx) {
    case 0: drawSun(ctx, cx, cy, r, color); break;
    case 1: drawMoon(ctx, cx, cy, r, color); break;
    case 2: drawMars(ctx, cx, cy, r, color); break;
    case 3: drawMercury(ctx, cx, cy, r, color); break;
    case 4: drawJupiter(ctx, cx, cy, r, color); break;
    case 5: drawVenus(ctx, cx, cy, r, color); break;
    case 6: drawSaturn(ctx, cx, cy, r, color); break;
    case 7: drawEarth(ctx, cx, cy, r, color); break;
  }

  // Specular highlight (universal for all planets)
  const hlGrad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 0, cx - r * 0.3, cy - r * 0.3, r * 0.6);
  hlGrad.addColorStop(0, "rgba(255,255,255,0.45)");
  hlGrad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = hlGrad;
  ctx.fill();

  ctx.restore();
}

// Sun: Bold corona rays + surface flares
export function drawSun(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2 + 0.3;
    const dist = r * 0.35;
    const px = cx + Math.cos(angle) * dist;
    const py = cy + Math.sin(angle) * dist;
    const spotGrad = ctx.createRadialGradient(px, py, 0, px, py, r * 0.4);
    spotGrad.addColorStop(0, "rgba(255,255,180,0.5)");
    spotGrad.addColorStop(1, "rgba(255,255,180,0)");
    ctx.fillStyle = spotGrad;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
  ctx.restore();
  // Bold corona rays
  ctx.save();
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    const long = i % 2 === 0;
    const outerR = long ? r * 1.35 : r * 1.2;
    const x1 = cx + Math.cos(angle) * r;
    const y1 = cy + Math.sin(angle) * r;
    const x2 = cx + Math.cos(angle) * outerR;
    const y2 = cy + Math.sin(angle) * outerR;
    const grad = ctx.createLinearGradient(x1, y1, x2, y2);
    grad.addColorStop(0, "rgba(255,224,160,0.7)");
    grad.addColorStop(1, "rgba(255,224,160,0)");
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = grad;
    ctx.lineWidth = long ? 2.5 : 1.5;
    ctx.stroke();
  }
  ctx.restore();
}

export function drawMoon(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string): void {
}

export function drawMars(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string): void {
}

export function drawMercury(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string): void {
}

// Jupiter: Bold cloud bands + prominent Great Red Spot
export function drawJupiter(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  const bands = [
    { y: -0.65, h: 0.22, c: "rgba(200,160,80,0.35)" },
    { y: -0.35, h: 0.18, c: "rgba(140,100,40,0.25)" },
    { y: -0.08, h: 0.22, c: "rgba(220,180,100,0.35)" },
    { y: 0.22, h: 0.18, c: "rgba(160,120,50,0.25)" },
    { y: 0.48, h: 0.22, c: "rgba(200,160,80,0.3)" },
  ];
  for (const b of bands) {
    ctx.fillStyle = b.c;
    ctx.fillRect(cx - r, cy + b.y * r, r * 2, b.h * r);
  }
  ctx.beginPath();
  ctx.ellipse(cx + r * 0.2, cy + r * 0.15, r * 0.22, r * 0.15, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(200,70,20,0.5)";
  ctx.fill();
  ctx.strokeStyle = "rgba(180,60,10,0.3)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

// Venus: Bold cloud swirl patterns
export function drawVenus(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(angle) * r * 0.15, cy + Math.sin(angle) * r * 0.15, r * 0.65, angle, angle + Math.PI * 0.9, false);
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = r * 0.15;
    ctx.stroke();
  }
  const cGrad = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r * 0.7);
  cGrad.addColorStop(0, "rgba(255,255,200,0.15)");
  cGrad.addColorStop(1, "rgba(255,255,200,0)");
  ctx.fillStyle = cGrad;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.restore();
}

// Saturn: Bold prominent rings
export function drawSaturn(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string): void {
  // Back half of rings
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.ellipse(cx, cy, r * 1.45, r * 0.4, -0.15, Math.PI, Math.PI * 2);
  ctx.strokeStyle = lightenColor(color, 60);
  ctx.lineWidth = r * 0.18;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(cx, cy, r * 1.25, r * 0.33, -0.15, Math.PI, Math.PI * 2);
  ctx.strokeStyle = lightenColor(color, 35);
  ctx.lineWidth = r * 0.08;
  ctx.stroke();
  ctx.restore();

  // Redraw planet sphere
  const grad = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.25, r * 0.1, cx, cy, r);
  grad.addColorStop(0, lightenColor(color, 60));
  grad.addColorStop(0.5, color);
  grad.addColorStop(1, darkenColor(color, 60));
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  // Surface bands
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  for (let i = 0; i < 3; i++) {
    const by = cy - r * 0.4 + i * r * 0.35;
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(cx - r, by, r * 2, r * 0.12);
  }
  ctx.restore();

  // Front half of rings - bold
  ctx.save();
  ctx.globalAlpha = 0.7;
  ctx.beginPath();
  ctx.ellipse(cx, cy, r * 1.45, r * 0.4, -0.15, 0, Math.PI);
  ctx.strokeStyle = lightenColor(color, 70);
  ctx.lineWidth = r * 0.18;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(cx, cy, r * 1.25, r * 0.33, -0.15, 0, Math.PI);
  ctx.strokeStyle = lightenColor(color, 40);
  ctx.lineWidth = r * 0.08;
  ctx.stroke();
  ctx.restore();
}

// Earth: Bold continents + clouds
export function drawEarth(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  const continents = [
    { x: -0.15, y: -0.25, w: 0.4, h: 0.35 },
    { x: 0.2, y: 0.1, w: 0.35, h: 0.4 },
    { x: -0.4, y: 0.2, w: 0.25, h: 0.25 },
  ];
  for (const c of continents) {
    const grad = ctx.createRadialGradient(
      cx + c.x * r, cy + c.y * r, 0,
      cx + c.x * r, cy + c.y * r, c.w * r
    );
    grad.addColorStop(0, "rgba(40,180,40,0.55)");
    grad.addColorStop(0.7, "rgba(40,160,40,0.3)");
    grad.addColorStop(1, "rgba(40,160,40,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
  ctx.beginPath();
  ctx.arc(cx - r * 0.2, cy - r * 0.15, r * 0.55, -0.6, 0.6);
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = r * 0.12;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx + r * 0.3, cy + r * 0.3, r * 0.4, -0.8, 0.3);
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = r * 0.08;
  ctx.stroke();
  ctx.restore();
}

// --- Offscreen canvas cache for planet pieces ---
export function buildPieceCache(): void {
  G.pieceCache = {};
  G.pieceCacheSize = G.cellSize;
  const pad = 1.4;
  const size = Math.ceil(G.cellSize * pad);
  const dpr = window.devicePixelRatio || 1;

  for (let colorIdx = 0; colorIdx < PIECE_COLORS.length; colorIdx++) {
    const offCanvas = document.createElement("canvas");
    offCanvas.width = size * dpr;
    offCanvas.height = size * dpr;
    const offCtx = offCanvas.getContext("2d")!;
    offCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cx = size / 2;
    const cy = size / 2;
    const radius = G.cellSize * 0.36;

    drawPlanet(offCtx, colorIdx, cx, cy, radius);
    G.pieceCache[colorIdx] = offCanvas;
  }
}

// --- Background Stars ---

export function initBgStars(): void {
  G.bgStars = [];
  const w = G.boardPixelW, h = G.boardPixelH;
  const layers = [
    { count: 100, speed: 0.08, sizeMin: 0.8, sizeMax: 1.8, alpha: 0.7 },
    { count: 55, speed: 0.22, sizeMin: 1.2, sizeMax: 2.5, alpha: 0.85 },
    { count: 25, speed: 0.45, sizeMin: 1.8, sizeMax: 3.2, alpha: 1.0 },
  ];
  for (const layer of layers) {
    for (let i = 0; i < layer.count; i++) {
      G.bgStars.push({
        x: Math.random() * w,
        y: Math.random() * h,
        size: layer.sizeMin + Math.random() * (layer.sizeMax - layer.sizeMin),
        speed: layer.speed + Math.random() * layer.speed * 0.3,
        alpha: layer.alpha * (0.6 + Math.random() * 0.4),
        twinkle: Math.random() * Math.PI * 2,
      });
    }
  }
}

export function drawSpaceBackground(): void {
  const w = G.boardPixelW, h = G.boardPixelH;

  // Cached deep space gradient (recreate only on resize)
  const sizeKey = w + "x" + h;
  if (G.bgGradSize !== sizeKey) {
    G.bgGradCache = G.ctx!.createLinearGradient(0, 0, w * 0.3, h);
    G.bgGradCache.addColorStop(0, "#0a0a2e");
    G.bgGradCache.addColorStop(0.5, "#0d1030");
    G.bgGradCache.addColorStop(1, "#150a30");
    G.bgGradSize = sizeKey;
  }
  G.ctx!.fillStyle = G.bgGradCache!;
  G.ctx!.fillRect(0, 0, w, h);

  for (const star of G.bgStars) {
    const flicker = 0.7 + 0.3 * Math.sin(star.twinkle);
    G.ctx!.globalAlpha = star.alpha * flicker;
    G.ctx!.fillStyle = "#fff";
    G.ctx!.beginPath();
    G.ctx!.arc(star.x, star.y, star.size, 0, Math.PI * 2);
    G.ctx!.fill();
  }
  G.ctx!.globalAlpha = 1;
}

export function startBgAnim(): void {
  stopBgAnim();
  function tick(): void {
    if (!G.screens!.game.classList.contains("active")) return;
    updateVFX();
    if (!G.animating && !G.hintData) {
      drawBoard();
    }
    if (hasActiveVFX()) {
      drawVFX();
    }
    G.bgAnimId = requestAnimationFrame(tick);
  }
  G.bgAnimId = requestAnimationFrame(tick);
}

export function stopBgAnim(): void {
  if (G.bgAnimId) { cancelAnimationFrame(G.bgAnimId); G.bgAnimId = null; }
}

// --- Title screen background ---

export function initTitleBgStars(w: number, h: number): void {
  G.titleBgStars = [];
  const layers = [
    { count: 100, speed: 0.06, sizeMin: 0.5, sizeMax: 1.5, alpha: 0.5 },
    { count: 55, speed: 0.18, sizeMin: 0.8, sizeMax: 2.0, alpha: 0.7 },
    { count: 25, speed: 0.35, sizeMin: 1.2, sizeMax: 2.8, alpha: 0.9 },
  ];
  for (const layer of layers) {
    for (let i = 0; i < layer.count; i++) {
      G.titleBgStars.push({
        x: Math.random() * w,
        y: Math.random() * h,
        size: layer.sizeMin + Math.random() * (layer.sizeMax - layer.sizeMin),
        speed: layer.speed + Math.random() * layer.speed * 0.3,
        alpha: layer.alpha * (0.6 + Math.random() * 0.4),
        twinkle: Math.random() * Math.PI * 2,
      });
    }
  }
}

export function startTitleBgAnim(): void {
  stopTitleBgAnim();
  const canvas = document.getElementById("title-bg-canvas") as HTMLCanvasElement | null;
  if (!canvas) return;
  const tCtx = canvas.getContext("2d")!;
  const dpr = window.devicePixelRatio || 1;

  function resize(): void {
    const rect = canvas!.parentElement!.getBoundingClientRect();
    canvas!.width = rect.width * dpr;
    canvas!.height = rect.height * dpr;
    tCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (G.titleBgStars.length === 0) initTitleBgStars(rect.width, rect.height);
  }
  resize();

  function tick(): void {
    if (!G.screens!.title.classList.contains("active")) return;
    const w = canvas!.width / dpr;
    const h = canvas!.height / dpr;

    const grad = tCtx.createLinearGradient(0, 0, w * 0.3, h);
    grad.addColorStop(0, "#0a0a2e");
    grad.addColorStop(0.5, "#0d1030");
    grad.addColorStop(1, "#150a30");
    tCtx.fillStyle = grad;
    tCtx.fillRect(0, 0, w, h);

    for (const star of G.titleBgStars) {
      if (G.options.bgAnim) {
        star.y += star.speed;
        star.x += star.speed * 0.12;
        if (star.y > h) { star.y = -2; star.x = Math.random() * w; }
        if (star.x > w) star.x -= w;
        star.twinkle += 0.025;
      }
      const flicker = 0.7 + 0.3 * Math.sin(star.twinkle);
      tCtx.globalAlpha = star.alpha * flicker;
      tCtx.fillStyle = "#fff";
      tCtx.beginPath();
      tCtx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      tCtx.fill();
    }
    tCtx.globalAlpha = 1;

    if (G.options.bgAnim && !G.titleShootingStar && Math.random() < 0.004) {
      G.titleShootingStar = {
        x: Math.random() * w * 0.7,
        y: Math.random() * h * 0.4,
        vx: 3 + Math.random() * 2,
        vy: 1.5 + Math.random(),
        life: 1,
      };
    }
    if (G.titleShootingStar) {
      const ss = G.titleShootingStar;
      ss.x += ss.vx;
      ss.y += ss.vy;
      ss.life -= 0.025;
      if (ss.life <= 0) { G.titleShootingStar = null; }
      else {
        tCtx.save();
        tCtx.globalAlpha = ss.life;
        const tailLen = 25;
        const sg = tCtx.createLinearGradient(ss.x, ss.y, ss.x - ss.vx * tailLen * 0.3, ss.y - ss.vy * tailLen * 0.3);
        sg.addColorStop(0, "#fff");
        sg.addColorStop(1, "rgba(255,255,255,0)");
        tCtx.strokeStyle = sg;
        tCtx.lineWidth = 1.5;
        tCtx.beginPath();
        tCtx.moveTo(ss.x, ss.y);
        tCtx.lineTo(ss.x - ss.vx * tailLen * 0.3, ss.y - ss.vy * tailLen * 0.3);
        tCtx.stroke();
        tCtx.restore();
      }
    }

    G.titleBgAnimId = requestAnimationFrame(tick);
  }
  G.titleBgAnimId = requestAnimationFrame(tick);
}

export function stopTitleBgAnim(): void {
  if (G.titleBgAnimId) { cancelAnimationFrame(G.titleBgAnimId); G.titleBgAnimId = null; }
}

export function initResultBgStars(w: number, h: number): void {
  G.resultBgStars = [];
  const layers = [
    { count: 100, speed: 0.06, sizeMin: 0.5, sizeMax: 1.5, alpha: 0.5 },
    { count: 55, speed: 0.18, sizeMin: 0.8, sizeMax: 2.0, alpha: 0.7 },
    { count: 25, speed: 0.35, sizeMin: 1.2, sizeMax: 2.8, alpha: 0.9 },
  ];
  for (const layer of layers) {
    for (let i = 0; i < layer.count; i++) {
      G.resultBgStars.push({
        x: Math.random() * w, y: Math.random() * h,
        size: layer.sizeMin + Math.random() * (layer.sizeMax - layer.sizeMin),
        speed: layer.speed + Math.random() * layer.speed * 0.3,
        alpha: layer.alpha * (0.6 + Math.random() * 0.4),
        twinkle: Math.random() * Math.PI * 2,
      });
    }
  }
}

export function startResultBgAnim(): void {
  stopResultBgAnim();
  const canvas = document.getElementById("result-bg-canvas") as HTMLCanvasElement | null;
  if (!canvas) return;
  const rCtx = canvas.getContext("2d")!;
  const dpr = window.devicePixelRatio || 1;

  function resize(): void {
    const rect = canvas!.parentElement!.getBoundingClientRect();
    canvas!.width = rect.width * dpr;
    canvas!.height = rect.height * dpr;
    rCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (G.resultBgStars.length === 0) initResultBgStars(rect.width, rect.height);
  }
  resize();

  function tick(): void {
    if (!G.screens!.result.classList.contains("active")) return;
    const w = canvas!.width / dpr;
    const h = canvas!.height / dpr;

    const grad = rCtx.createLinearGradient(0, 0, w * 0.3, h);
    grad.addColorStop(0, "#0a0a2e");
    grad.addColorStop(0.5, "#0d1030");
    grad.addColorStop(1, "#150a30");
    rCtx.fillStyle = grad;
    rCtx.fillRect(0, 0, w, h);

    for (const star of G.resultBgStars) {
      if (G.options.bgAnim) {
        star.y += star.speed;
        star.x += star.speed * 0.12;
        if (star.y > h) { star.y = -2; star.x = Math.random() * w; }
        if (star.x > w) star.x -= w;
        star.twinkle += 0.025;
      }
      const flicker = 0.7 + 0.3 * Math.sin(star.twinkle);
      rCtx.globalAlpha = star.alpha * flicker;
      rCtx.fillStyle = "#fff";
      rCtx.beginPath();
      rCtx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      rCtx.fill();
    }
    rCtx.globalAlpha = 1;

    if (G.options.bgAnim && !G.resultShootingStar && Math.random() < 0.004) {
      G.resultShootingStar = {
        x: Math.random() * w * 0.7, y: Math.random() * h * 0.4,
        vx: 3 + Math.random() * 2, vy: 1.5 + Math.random(), life: 1,
      };
    }
    if (G.resultShootingStar) {
      const ss = G.resultShootingStar;
      ss.x += ss.vx; ss.y += ss.vy; ss.life -= 0.025;
      if (ss.life <= 0) { G.resultShootingStar = null; }
      else {
        rCtx.save();
        rCtx.globalAlpha = ss.life;
        const tailLen = 25;
        const sg = rCtx.createLinearGradient(ss.x, ss.y, ss.x - ss.vx * tailLen * 0.3, ss.y - ss.vy * tailLen * 0.3);
        sg.addColorStop(0, "#fff");
        sg.addColorStop(1, "rgba(255,255,255,0)");
        rCtx.strokeStyle = sg;
        rCtx.lineWidth = 1.5;
        rCtx.beginPath();
        rCtx.moveTo(ss.x, ss.y);
        rCtx.lineTo(ss.x - ss.vx * tailLen * 0.3, ss.y - ss.vy * tailLen * 0.3);
        rCtx.stroke();
        rCtx.restore();
      }
    }

    G.resultBgAnimId = requestAnimationFrame(tick);
  }
  G.resultBgAnimId = requestAnimationFrame(tick);
}

export function stopResultBgAnim(): void {
  if (G.resultBgAnimId) { cancelAnimationFrame(G.resultBgAnimId); G.resultBgAnimId = null; }
}

export function startSplashBgAnim(): void {
  stopSplashBgAnim();
  const canvas = document.getElementById("splash-bg-canvas") as HTMLCanvasElement | null;
  if (!canvas) return;
  const sCtx = canvas.getContext("2d")!;
  const dpr = window.devicePixelRatio || 1;

  function resize(): void {
    const rect = canvas!.parentElement!.getBoundingClientRect();
    canvas!.width = rect.width * dpr;
    canvas!.height = rect.height * dpr;
    sCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (G.splashBgStars.length === 0) {
      G.splashBgStars = [];
      const w = rect.width, h = rect.height;
      for (let i = 0; i < 150; i++) {
        G.splashBgStars.push({
          x: Math.random() * w, y: Math.random() * h,
          size: 0.5 + Math.random() * 2,
          speed: 0.04 + Math.random() * 0.15,
          alpha: 0.4 + Math.random() * 0.5,
          twinkle: Math.random() * Math.PI * 2,
        });
      }
    }
  }
  resize();

  function tick(): void {
    if (!G.screens!.splash.classList.contains("active")) return;
    const w = canvas!.width / dpr;
    const h = canvas!.height / dpr;
    const grad = sCtx.createLinearGradient(0, 0, w * 0.3, h);
    grad.addColorStop(0, "#0a0a2e");
    grad.addColorStop(0.5, "#0d1030");
    grad.addColorStop(1, "#150a30");
    sCtx.fillStyle = grad;
    sCtx.fillRect(0, 0, w, h);
    for (const star of G.splashBgStars) {
      star.y += star.speed;
      star.x += star.speed * 0.1;
      if (star.y > h) { star.y = -2; star.x = Math.random() * w; }
      if (star.x > w) star.x -= w;
      star.twinkle += 0.02;
      sCtx.globalAlpha = star.alpha * (0.7 + 0.3 * Math.sin(star.twinkle));
      sCtx.fillStyle = "#fff";
      sCtx.beginPath();
      sCtx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      sCtx.fill();
    }
    sCtx.globalAlpha = 1;
    G.splashBgAnimId = requestAnimationFrame(tick);
  }
  G.splashBgAnimId = requestAnimationFrame(tick);
}

export function stopSplashBgAnim(): void {
  if (G.splashBgAnimId) { cancelAnimationFrame(G.splashBgAnimId); G.splashBgAnimId = null; }
}

// --- Star & Special Icon Drawing ---

export function drawStar5(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = (i * 2 * Math.PI / 5) - Math.PI / 2;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    const a2 = a + Math.PI / 5;
    ctx.lineTo(cx + Math.cos(a2) * r * 0.4, cy + Math.sin(a2) * r * 0.4);
  }
  ctx.closePath();
  ctx.fill();
}

export function drawShootingStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, angle: number, tint: string | null): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  const s = r;
  const tc = tint || "#ffd700";
  ctx.shadowColor = tc;
  ctx.shadowBlur = r * 0.3;
  const tg = ctx.createLinearGradient(0, s * 0.8, 0, -s * 0.3);
  tg.addColorStop(0, tc + "00");
  tg.addColorStop(0.5, tc + "66");
  tg.addColorStop(1, tc);
  ctx.fillStyle = tg;
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.4);
  ctx.lineTo(-s * 0.15, s * 0.8);
  ctx.lineTo(s * 0.15, s * 0.8);
  ctx.fill();
  ctx.shadowBlur = r * 0.4;
  ctx.fillStyle = "#fff";
  drawStar5(ctx, 0, -s * 0.45, s * 0.25);
  ctx.restore();
}

export function drawSpecialIcon(ctx: CanvasRenderingContext2D, type: SpecialType | string, cx: number, cy: number, r: number, piece: Piece | null): void {
  ctx.save();
  const tint: string | null = (piece && piece.color >= 0) ? PIECE_COLORS[piece.color] : null;
  switch (type) {
    case "line_h": {
      drawShootingStar(ctx, cx, cy, r, Math.PI / 2, tint);
      break;
    }
    case "line_v": {
      drawShootingStar(ctx, cx, cy, r, 0, tint);
      break;
    }
    case "line_d": {
      ctx.save();
      ctx.translate(cx, cy);
      const s = r;
      const tc = tint || "#ffd700";
      [-Math.PI / 4, Math.PI / 4].forEach((a: number) => {
        ctx.save();
        ctx.rotate(a);
        ctx.shadowColor = tc;
        ctx.shadowBlur = r * 0.3;
        const tg = ctx.createLinearGradient(0, s * 0.8, 0, -s * 0.3);
        tg.addColorStop(0, tc + "00");
        tg.addColorStop(0.5, tc + "66");
        tg.addColorStop(1, tc);
        ctx.fillStyle = tg;
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.4);
        ctx.lineTo(-s * 0.15, s * 0.8);
        ctx.lineTo(s * 0.15, s * 0.8);
        ctx.fill();
        ctx.shadowBlur = r * 0.4;
        ctx.fillStyle = "#fff";
        drawStar5(ctx, 0, -s * 0.45, s * 0.25);
        ctx.restore();
      });
      ctx.restore();
      break;
    }
    case "bomb": {
      const s = r;
      const bc = tint || "#ff6600";
      ctx.shadowColor = bc;
      ctx.shadowBlur = r * 0.3;
      const bg = ctx.createRadialGradient(cx - s * 0.15, cy - s * 0.1, s * 0.05, cx, cy + s * 0.05, s * 0.5);
      bg.addColorStop(0, (tint || "#555555") + "aa");
      bg.addColorStop(0.6, (tint || "#333333") + "66");
      bg.addColorStop(1, "#111");
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.arc(cx, cy + s * 0.05, s * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.beginPath();
      ctx.arc(cx - s * 0.15, cy - s * 0.1, s * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#aaa";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(cx, cy - s * 0.45);
      ctx.quadraticCurveTo(cx + s * 0.2, cy - s * 0.65, cx + s * 0.1, cy - s * 0.75);
      ctx.stroke();
      ctx.shadowColor = "#ffd700";
      ctx.shadowBlur = r * 0.5;
      ctx.fillStyle = "#ffd700";
      drawStar5(ctx, cx + s * 0.1, cy - s * 0.78, s * 0.15);
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(cx + s * 0.1, cy - s * 0.78, s * 0.05, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "rainbow": {
      const s = r;
      const cs = ["#ff4444", "#ffaa00", "#44ff44", "#4488ff", "#ff44ff", "#44ffff"];
      for (let i = 5; i >= 0; i--) {
        const rr = s * (0.15 + i * 0.14);
        ctx.strokeStyle = cs[i % cs.length];
        ctx.lineWidth = 3;
        ctx.globalAlpha = 0.5 + (5 - i) * 0.1;
        ctx.shadowColor = cs[i % cs.length];
        ctx.shadowBlur = 4;
        ctx.beginPath();
        ctx.arc(cx, cy, rr, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, s * 0.2);
      cg.addColorStop(0, "#fff");
      cg.addColorStop(0.5, "rgba(255,255,255,0.5)");
      cg.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = cg;
      ctx.shadowColor = "#fff";
      ctx.shadowBlur = r * 0.5;
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.2, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "countdown": {
      const s = r;
      const count = piece ? piece.countdown ?? 0 : 0;
      const urgency = count <= 3;
      ctx.shadowColor = urgency ? "#ff4444" : "#ff6600";
      ctx.shadowBlur = r * 0.3;
      const bg = ctx.createRadialGradient(cx - s * 0.1, cy, s * 0.05, cx, cy + s * 0.05, s * 0.45);
      bg.addColorStop(0, "#555");
      bg.addColorStop(0.8, "#222");
      bg.addColorStop(1, "#111");
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.arc(cx, cy + s * 0.05, s * 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#aaa";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(cx, cy - s * 0.4);
      ctx.quadraticCurveTo(cx + s * 0.15, cy - s * 0.55, cx + s * 0.08, cy - s * 0.65);
      ctx.stroke();
      ctx.fillStyle = urgency ? "#ff4444" : "#ff4444";
      ctx.shadowColor = urgency ? "#ff0000" : "#ff0000";
      ctx.shadowBlur = r * 0.4;
      ctx.beginPath();
      ctx.arc(cx + s * 0.08, cy - s * 0.68, s * 0.08, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      const dw = s * 0.5, dh = s * 0.35;
      ctx.fillRect(cx - dw / 2, cy - dh / 2 + s * 0.05, dw, dh);
      ctx.strokeStyle = "#333";
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - dw / 2, cy - dh / 2 + s * 0.05, dw, dh);
      ctx.fillStyle = urgency ? "#ff4444" : "#ffd700";
      ctx.shadowColor = urgency ? "#ff0000" : "#ffd700";
      ctx.shadowBlur = r * 0.2;
      ctx.font = `bold ${s * 0.55}px monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const countStr = count < 10 ? "0" + count : count.toString();
      ctx.fillText(countStr, cx, cy + s * 0.08);
      break;
    }
  }
  ctx.restore();
}
