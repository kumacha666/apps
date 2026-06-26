import { G } from "./state";
import { pixelToCell } from "./rendering";
import { doMove } from "./game";
import { has } from "./upgrades";

const DRAG_THRESHOLD = 0.25;

export function initInput(): void {
  const canvas = G.canvas!;

  canvas.addEventListener("pointerdown", (e) => {
    if (G.animating) return;
    const cell = pixelToCell(e.clientX, e.clientY);
    if (!cell) return;
    G.dragStart = cell;
    G.dragStartPx = { x: e.clientX, y: e.clientY };
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!G.dragStart || !G.dragStartPx || G.animating) return;
    const dx = e.clientX - G.dragStartPx.x;
    const dy = e.clientY - G.dragStartPx.y;
    const threshold = G.cellSize * DRAG_THRESHOLD;

    if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return;

    let dr = 0, dc = 0;

    if (has(G.run.upgrades, "diagonal_move")) {
      // 8-directional
      const angle = Math.atan2(dy, dx);
      const sector = Math.round(angle / (Math.PI / 4));
      switch (sector) {
        case 0: dr = 0; dc = 1; break;   // right
        case 1: dr = 1; dc = 1; break;   // down-right
        case 2: case -2: dr = 1; dc = 0; break;  // down
        case -1: dr = 1; dc = -1; break; // down-left (from atan2 perspective, adjusted)
        case 3: case -3: dr = 0; dc = -1; break; // left
        case 4: case -4: dr = -1; dc = 0; break; // up
        default: dr = 0; dc = 0;
      }
      // Re-derive properly
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      const ratio = Math.min(absDx, absDy) / Math.max(absDx, absDy);
      if (ratio > 0.4) {
        // diagonal
        dr = dy > 0 ? 1 : -1;
        dc = dx > 0 ? 1 : -1;
      } else if (absDx > absDy) {
        dr = 0;
        dc = dx > 0 ? 1 : -1;
      } else {
        dr = dy > 0 ? 1 : -1;
        dc = 0;
      }
    } else {
      // 4-directional only
      if (Math.abs(dx) > Math.abs(dy)) {
        dc = dx > 0 ? 1 : -1;
      } else {
        dr = dy > 0 ? 1 : -1;
      }
    }

    const r2 = G.dragStart.r + dr;
    const c2 = G.dragStart.c + dc;
    const startR = G.dragStart.r;
    const startC = G.dragStart.c;

    G.dragStart = null;
    G.dragStartPx = null;

    doMove(startR, startC, r2, c2);
  });

  canvas.addEventListener("pointerup", () => {
    G.dragStart = null;
    G.dragStartPx = null;
  });

  canvas.addEventListener("pointercancel", () => {
    G.dragStart = null;
    G.dragStartPx = null;
  });
}
