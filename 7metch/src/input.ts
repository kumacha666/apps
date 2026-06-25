import type { CellPos, SpecialType } from "./types";
import { G, DRAG_THRESHOLD_RATIO } from "./state";
import { doMove, cancelItemMode, spawnSpecialAt, activateByTap, usePinpoint } from "./game";
import { clearHint, inBounds, isHole, isRock, isAdjacent, TAP_ACTIVATE_SPECIALS } from "./board";
import { drawBoard, drawSpecialIcon } from "./rendering";

export function getCell(px: number, py: number): CellPos | null {
  const rect = G.canvas!.getBoundingClientRect();
  const x = px - rect.left;
  const y = py - rect.top;
  const c = Math.floor(x / G.cellSize);
  const r = Math.floor(y / G.cellSize);
  if (inBounds(r, c) && !isHole(r, c) && !isRock(r, c)) return { r, c };
  return null;
}

function dragDirection(sx: number, sy: number, ex: number, ey: number): { dr: number; dc: number } | null {
  const dx = ex - sx;
  const dy = ey - sy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < G.cellSize * DRAG_THRESHOLD_RATIO) return null;

  const angle = Math.atan2(dy, dx);
  const sector = Math.round(angle / (Math.PI / 4));
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
  return null;
}

export function initInput(): void {
  G.canvas!.addEventListener("pointerdown", (e) => {
    if (G.animating) return;
    e.preventDefault();
    clearHint();
    const cell = getCell(e.clientX, e.clientY);
    if (!cell) return;

    if (G.debugSpawnType) {
      spawnSpecialAt(cell.r, cell.c, G.debugSpawnType);
      return;
    }

    if (G.itemMode === "pinpoint") {
      cancelItemMode();
      usePinpoint(cell.r, cell.c);
      return;
    }

    G.dragStart = cell;
    G.dragStartPx = { x: e.clientX, y: e.clientY };
  });

  G.canvas!.addEventListener("pointermove", (e) => {
    if (!G.dragStart || !G.dragStartPx || G.animating) return;
    e.preventDefault();

    const dir = dragDirection(G.dragStartPx.x, G.dragStartPx.y, e.clientX, e.clientY);
    if (!dir) return;

    const targetR = G.dragStart.r + dir.dr;
    const targetC = G.dragStart.c + dir.dc;
    if (!inBounds(targetR, targetC)) return;
    if (isHole(targetR, targetC) || isRock(targetR, targetC)) return;

    G.selected = null;
    doMove(G.dragStart.r, G.dragStart.c, targetR, targetC);
    G.dragStart = null;
    G.dragStartPx = null;
  });

  G.canvas!.addEventListener("pointerup", (e) => {
    if (!G.dragStart || G.animating) {
      G.dragStart = null;
      G.dragStartPx = null;
      return;
    }

    const cell = G.dragStart;
    const wasDrag = G.dragStartPx && dragDirection(G.dragStartPx.x, G.dragStartPx.y, e.clientX, e.clientY);
    G.dragStart = null;
    G.dragStartPx = null;

    if (wasDrag) return;

    if (G.selected) {
      if (G.selected.r === cell.r && G.selected.c === cell.c) {
        const p = G.board[cell.r][cell.c];
        if (p && p.special && TAP_ACTIVATE_SPECIALS.has(p.special)) {
          G.selected = null;
          activateByTap(cell.r, cell.c);
          return;
        }
        G.selected = null;
        drawBoard();
        return;
      }
      if (isAdjacent(G.selected.r, G.selected.c, cell.r, cell.c)) {
        doMove(G.selected.r, G.selected.c, cell.r, cell.c);
        G.selected = null;
        drawBoard();
        return;
      }
    }

    G.selected = cell;
    drawBoard();
  });

  G.canvas!.addEventListener("pointerleave", () => {
    G.dragStart = null;
    G.dragStartPx = null;
  });
}

export function renderHelpPieceIcons(): void {
  document.querySelectorAll<HTMLCanvasElement>(".help-piece-canvas").forEach(cv => {
    const type = cv.dataset.special!;
    const dpr = window.devicePixelRatio || 1;
    const size = 48 * dpr;
    cv.width = size;
    cv.height = size;
    const ctx = cv.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, 48, 48);
    drawSpecialIcon(ctx, type as SpecialType, 24, 24, 20, null);
  });
}
