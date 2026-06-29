import type { Piece } from "./types";
import { G, COLS, ROWS, PIECE_COLORS } from "./state";
import { drawBoard, drawBoardBase, drawPieceAt } from "./rendering";
import { cellCenter, addBurstParticles, addShockwave, addFlash, addScreenShake, updateVFX } from "./vfx";
import { SFX } from "./audio";

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chainSpeedScale(): number {
  const c = G.chainCount;
  if (c <= 1) return 1;
  if (c === 2) return 0.6;
  if (c === 3) return 0.3;
  return 0.1;
}

function animateFrames(totalFrames: number, callback: (frame: number, t: number) => void): Promise<void> {
  return new Promise<void>((resolve) => {
    let frame = 0;
    function step(): void {
      frame++;
      updateVFX();
      callback(frame, frame / totalFrames);
      if (frame < totalFrames) requestAnimationFrame(step);
      else resolve();
    }
    requestAnimationFrame(step);
  });
}

// --- Swap animation ---

export async function animateSwap(r1: number, c1: number, r2: number, c2: number): Promise<void> {
  const frames = 8;
  const p1 = G.board[r1][c1];
  const p2 = G.board[r2][c2];
  const cs = G.cellSize;
  const ox = G.offsetX;
  const oy = G.offsetY;

  for (let f = 1; f <= frames; f++) {
    const t = f / frames;
    const ease = t * t * (3 - 2 * t); // smoothstep

    drawBoardBase();

    // Draw all pieces except the two swapping
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if ((r === r1 && c === c1) || (r === r2 && c === c2)) continue;
        const piece = G.board[r]?.[c];
        if (piece) {
          drawPieceAt(piece, ox + G.shakeX + c * cs + cs / 2, oy + G.shakeY + r * cs + cs / 2);
        }
      }
    }

    // Animate p1 moving toward p2's position
    if (p1) {
      const x = ox + G.shakeX + (c1 + (c2 - c1) * ease) * cs + cs / 2;
      const y = oy + G.shakeY + (r1 + (r2 - r1) * ease) * cs + cs / 2;
      drawPieceAt(p1, x, y);
    }
    // Animate p2 moving toward p1's position
    if (p2) {
      const x = ox + G.shakeX + (c2 + (c1 - c2) * ease) * cs + cs / 2;
      const y = oy + G.shakeY + (r2 + (r1 - r2) * ease) * cs + cs / 2;
      drawPieceAt(p2, x, y);
    }

    await sleep(20);
  }
}

// --- Standard clear animation (glow -> shrink+burst) ---

export async function animateStandardClear(cells: [number, number][]): Promise<void> {
  const totalFrames = Math.max(2, Math.round(24 * chainSpeedScale()));
  const phase1End = Math.floor(totalFrames * 0.25);

  await animateFrames(totalFrames, (frame, _t) => {
    drawBoard((overlayCtx) => {
      if (frame <= phase1End) {
        // Glow phase
        const gp = frame / phase1End;
        for (const [r, c] of cells) {
          const pos = cellCenter(r, c);
          const color = G.board[r]?.[c] ? PIECE_COLORS[G.board[r][c]!.color] : "#ffffff";
          overlayCtx.save();
          overlayCtx.globalAlpha = gp * 0.7;
          overlayCtx.shadowColor = color;
          overlayCtx.shadowBlur = 12 + gp * 20;
          overlayCtx.fillStyle = color;
          overlayCtx.beginPath();
          overlayCtx.arc(pos.x, pos.y, G.cellSize * 0.42 * (1 + gp * 0.4), 0, Math.PI * 2);
          overlayCtx.fill();
          overlayCtx.restore();
        }
      }
      if (frame > phase1End) {
        // Shrink + burst phase
        const sp = (frame - phase1End) / (totalFrames - phase1End);
        const shrink = 1 - sp * sp;
        const expand = 1 + sp * 0.5;
        for (const [r, c] of cells) {
          const pos = cellCenter(r, c);
          const color = G.board[r]?.[c] ? PIECE_COLORS[G.board[r][c]!.color] : "#ffffff";
          overlayCtx.save();
          overlayCtx.globalAlpha = (1 - sp) * 0.5;
          overlayCtx.fillStyle = color;
          overlayCtx.beginPath();
          overlayCtx.arc(pos.x, pos.y, G.cellSize * 0.38 * shrink * expand, 0, Math.PI * 2);
          overlayCtx.fill();
          overlayCtx.restore();
        }
        // Spawn particles on first frame of phase 2
        if (frame === phase1End + 1) {
          for (const [r, c] of cells) {
            const pos = cellCenter(r, c);
            const color = G.board[r]?.[c] ? PIECE_COLORS[G.board[r][c]!.color] : "#ffffff";
            addBurstParticles(pos.x, pos.y, color, 12, { speed: 3.5, size: 4.0, decay: 0.035, sizeDecay: 0.055 });
            addFlash(pos.x, pos.y, G.cellSize * 0.7, color, 8);
            addShockwave(pos.x, pos.y, G.cellSize * 0.8, 12, color);
          }
          addScreenShake(1.5);
        }
      }
    });
  });
}

// --- Drop animation (accelerate + bounce) ---

export interface FallEntry {
  c: number;
  fromR: number;
  toR: number;
  piece: Piece;
}

export async function animateDrop(fallMap: FallEntry[]): Promise<void> {
  if (fallMap.length === 0) {
    drawBoard();
    return;
  }
  SFX.drop();

  const scale = chainSpeedScale();
  const maxDist = Math.max(...fallMap.map((f) => f.toR - f.fromR));
  const dropSpeed = 0.22 / scale;
  const fallFrames = Math.max(1, Math.ceil(maxDist / dropSpeed));
  const bounceFrames = Math.max(1, Math.round(10 * scale));
  const totalFrames = fallFrames + bounceFrames;
  const cs = G.cellSize;
  const ox = G.offsetX;
  const oy = G.offsetY;

  // Snapshot board (pieces at their final positions, but we animate them)
  const fallingCells = new Set<number>(fallMap.map((f) => f.toR * COLS + f.c));

  for (let frame = 0; frame <= totalFrames; frame++) {
    drawBoardBase();

    // Draw non-falling pieces at their positions
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (fallingCells.has(r * COLS + c)) continue;
        const piece = G.board[r]?.[c];
        if (piece) {
          drawPieceAt(piece, ox + G.shakeX + c * cs + cs / 2, oy + G.shakeY + r * cs + cs / 2);
        }
      }
    }

    // Draw falling pieces
    for (const fall of fallMap) {
      const dist = fall.toR - fall.fromR;
      const x = ox + G.shakeX + fall.c * cs + cs / 2;
      let currentR: number;

      if (frame <= fallFrames) {
        const t = Math.min(frame / fallFrames, 1);
        const accel = t * t; // accelerating
        currentR = fall.fromR + dist * accel;
      } else {
        const bt = (frame - fallFrames) / bounceFrames;
        const bounceAmp = Math.min(0.25 + dist * 0.08, 0.5);
        const bounceHeight = bounceAmp * Math.sin(bt * Math.PI) * (1 - bt * 0.6);
        currentR = fall.toR - bounceHeight;
      }

      const y = oy + G.shakeY + currentR * cs + cs / 2;
      if (y + cs / 2 > 0) {
        drawPieceAt(fall.piece, x, y);
      }
    }

    if (frame < totalFrames) {
      await sleep(16);
    }
  }

  drawBoard();
}
