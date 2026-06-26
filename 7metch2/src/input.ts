import { G } from "./state";
import { pixelToCell } from "./rendering";
import { doMove } from "./game";
import { has } from "./upgrades";

const DRAG_THRESHOLD_RATIO = 0.15;

function dragDirection(
  sx: number, sy: number, ex: number, ey: number,
  allowDiagonal: boolean,
): { dr: number; dc: number } | null {
  const dx = ex - sx;
  const dy = ey - sy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < G.cellSize * DRAG_THRESHOLD_RATIO) return null;

  const angle = Math.atan2(dy, dx);
  const sector = Math.round(angle / (Math.PI / 4));

  if (allowDiagonal) {
    // 8-directional
    switch (sector) {
      case 0:  return { dr: 0, dc: 1 };
      case 1:  return { dr: 1, dc: 1 };
      case 2:  return { dr: 1, dc: 0 };
      case 3:  return { dr: 1, dc: -1 };
      case 4:
      case -4: return { dr: 0, dc: -1 };
      case -3: return { dr: -1, dc: -1 };
      case -2: return { dr: -1, dc: 0 };
      case -1: return { dr: -1, dc: 1 };
    }
  } else {
    // 4-directional
    if (Math.abs(dx) > Math.abs(dy)) {
      return { dr: 0, dc: dx > 0 ? 1 : -1 };
    } else {
      return { dr: dy > 0 ? 1 : -1, dc: 0 };
    }
  }
  return null;
}

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

    const allowDiagonal = has(G.run.upgrades, "diagonal_move");
    const dir = dragDirection(G.dragStartPx.x, G.dragStartPx.y, e.clientX, e.clientY, allowDiagonal);
    if (!dir) return;

    const r2 = G.dragStart.r + dir.dr;
    const c2 = G.dragStart.c + dir.dc;
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
