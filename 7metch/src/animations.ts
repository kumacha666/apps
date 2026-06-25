import type { Piece, CellPos, FallEntry, SpecialInfo } from "./types";
import { G, PIECE_COLORS, ANIM } from "./state";
import { cellCenter, addBurstParticles, addShockwave, addFlash, addComet, addScreenShake, addParticle, addFloatingText, updateVFX, drawVFX } from "./vfx";
import { drawBoard, drawPieceAt, drawBoardBase, drawIceOverlay } from "./rendering";
import { SFX } from "./audio";
import { isIce } from "./board";

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function animateSwap(r1: number, c1: number, r2: number, c2: number): Promise<void> {
  const frames: number = ANIM.SWAP_FRAMES;
  const p1: Piece | null = G.board[r1][c1];
  const p2: Piece | null = G.board[r2][c2];

  for (let f = 1; f <= frames; f++) {
    const t: number = f / frames;
    const ease: number = t * t * (3 - 2 * t);

    drawBoardBase();

    for (let r = 0; r < G.rows; r++) {
      for (let c = 0; c < G.cols; c++) {
        if ((r === r1 && c === c1) || (r === r2 && c === c2)) continue;
        if (G.board[r][c]) {
          drawPieceAt(G.board[r][c]!, c * G.cellSize + G.cellSize / 2, r * G.cellSize + G.cellSize / 2);
        }
        if (isIce(r, c)) drawIceOverlay(r, c);
      }
    }

    if (p1) {
      const x: number = (c1 + (c2 - c1) * ease) * G.cellSize + G.cellSize / 2;
      const y: number = (r1 + (r2 - r1) * ease) * G.cellSize + G.cellSize / 2;
      drawPieceAt(p1, x, y);
    }
    if (p2) {
      const x: number = (c2 + (c1 - c2) * ease) * G.cellSize + G.cellSize / 2;
      const y: number = (r2 + (r1 - r2) * ease) * G.cellSize + G.cellSize / 2;
      drawPieceAt(p2, x, y);
    }

    G.ctx!.restore();
    await sleep(ANIM.SWAP_FRAME_MS);
  }
}

export async function animateClear(cells: CellPos[] | [number, number][], specialInfos?: SpecialInfo[]): Promise<void> {
  const normalizedCells: CellPos[] = cells.map(cell => Array.isArray(cell) ? { r: cell[0], c: cell[1] } : cell);
  const infos: SpecialInfo[] = specialInfos || [];

  if (infos.length > 0) {
    const types: string[] = infos.map(s => s.type);
    if (types.includes("galaxy")) { await animateGalaxyCollision(normalizedCells, infos); return; }
    if (types.includes("big_bomb")) { await animateBigBomb(normalizedCells, infos); return; }
    if (types.includes("cross") || types.includes("star_cross")) { await animateCrossCombo(normalizedCells, infos); return; }
    if (types.includes("triple_line")) { await animateTripleLine(normalizedCells, infos); return; }
    if (types.includes("rainbow_line")) { await animateRainbowLine(normalizedCells, infos); return; }
    if (types.includes("rainbow_bomb")) { await animateRainbowBombCombo(normalizedCells, infos); return; }
    for (const info of infos) {
      switch (info.type) {
        case "line_h": case "line_v": case "line_d":
          await animateLineSpecial(normalizedCells, info); break;
        case "bomb":
          await animateBombSpecial(normalizedCells, info); break;
        case "rainbow":
          await animateRainbow(normalizedCells, info); break;
      }
    }
    return;
  }

  await animateStandardClear(normalizedCells);
}

async function animateStandardClear(cells: CellPos[]): Promise<void> {
  const totalFrames: number = 24;
  const phase1End: number = Math.floor(totalFrames * 0.25);
  let frame: number = 0;

  await new Promise<void>(resolve => {
    function step(): void {
      frame++;
      updateVFX();

      drawBoard((overlayCtx: CanvasRenderingContext2D) => {
        if (frame <= phase1End) {
          const gp: number = frame / phase1End;
          for (const { r, c } of cells) {
            const pos = cellCenter(r, c);
            const color: string = (G.board[r] && G.board[r][c]) ? (PIECE_COLORS[G.board[r][c]!.color] || "#ffffff") : "#ffffff";
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
          const sp: number = (frame - phase1End) / (totalFrames - phase1End);
          const shrink: number = 1 - sp * sp;
          const expand: number = 1 + sp * 0.5;
          for (const { r, c } of cells) {
            const pos = cellCenter(r, c);
            const color: string = (G.board[r] && G.board[r][c]) ? (PIECE_COLORS[G.board[r][c]!.color] || "#ffffff") : "#ffffff";
            overlayCtx.save();
            overlayCtx.globalAlpha = (1 - sp) * 0.5;
            overlayCtx.fillStyle = color;
            overlayCtx.beginPath();
            overlayCtx.arc(pos.x, pos.y, G.cellSize * 0.38 * shrink * expand, 0, Math.PI * 2);
            overlayCtx.fill();
            overlayCtx.restore();
          }
          if (frame === phase1End + 1) {
            for (const { r, c } of cells) {
              const pos = cellCenter(r, c);
              const color: string = (G.board[r] && G.board[r][c]) ? (PIECE_COLORS[G.board[r][c]!.color] || "#ffffff") : "#ffffff";
              addBurstParticles(pos.x, pos.y, color, 12, { speed: 3.5, size: 4.0, decay: 0.035, sizeDecay: 0.055 });
              addFlash(pos.x, pos.y, G.cellSize * 0.7, color, 8);
              addShockwave(pos.x, pos.y, G.cellSize * 0.8, 12, color);
            }
            addScreenShake(1.5);
          }
        }
      });
      drawVFX();

      if (frame < totalFrames) requestAnimationFrame(step);
      else resolve();
    }
    requestAnimationFrame(step);
  });
}

async function animateLineSpecial(cells: CellPos[], info: SpecialInfo): Promise<void> {
  const origin = cellCenter(info.r, info.c);
  const color: string = PIECE_COLORS[info.color] || "#ffffff";
  const dissolved = new Set<string>();

  const beamDirs: { dx: number; dy: number }[] = [];
  if (info.type === "line_h") {
    beamDirs.push({ dx: 1, dy: 0 }, { dx: -1, dy: 0 });
  } else if (info.type === "line_v") {
    beamDirs.push({ dx: 0, dy: 1 }, { dx: 0, dy: -1 });
  } else if (info.type === "line_d") {
    const inv: number = Math.SQRT1_2;
    beamDirs.push({ dx: inv, dy: inv }, { dx: -inv, dy: -inv }, { dx: inv, dy: -inv }, { dx: -inv, dy: inv });
  }
  const beamLen: number = Math.max(G.rows, G.cols) * G.cellSize;

  await animateFrames(12, (frame: number, t: number) => {
    drawBoard((oc: CanvasRenderingContext2D) => {
      oc.save();
      oc.shadowColor = color;
      oc.shadowBlur = 12 + t * 30;
      oc.fillStyle = color;
      oc.globalAlpha = 0.4 + t * 0.5;
      oc.beginPath();
      oc.arc(origin.x, origin.y, G.cellSize * (0.3 + t * 0.3), 0, Math.PI * 2);
      oc.fill();
      oc.restore();
    });
    drawVFX();
  });

  addShockwave(origin.x, origin.y, G.cellSize * 2, 18, color);
  addScreenShake(3);

  for (const d of beamDirs) {
    addComet(origin.x, origin.y, d.dx, d.dy, color, G.cellSize * 0.45, 18);
  }

  await animateFrames(35, (frame: number, t: number) => {
    for (const { r, c } of cells) {
      const key: string = r + "," + c;
      if (dissolved.has(key)) continue;
      const cc = cellCenter(r, c);
      for (const comet of G.vfxComets) {
        if (Math.hypot(comet.x - cc.x, comet.y - cc.y) < G.cellSize * 0.8) {
          dissolved.add(key);
          addBurstParticles(cc.x, cc.y, color, 8, { speed: 3, size: 4, decay: 0.04, sizeDecay: 0.05 });
          addFlash(cc.x, cc.y, G.cellSize * 0.5, color, 6);
          break;
        }
      }
    }
    drawBoard((oc: CanvasRenderingContext2D) => {
      oc.save();
      const beamAlpha: number = (1 - t * 0.7) * 0.7;
      if (beamAlpha > 0.01) {
        const reach: number = Math.min(t * 2.5, 1);
        const fade: number = 1 - Math.max(0, (t - 0.6) / 0.4);
        const width: number = G.cellSize * 0.7 * fade;
        oc.lineCap = "round";
        oc.globalAlpha = beamAlpha * 0.5;
        oc.strokeStyle = color;
        oc.shadowColor = color;
        oc.shadowBlur = 25;
        oc.lineWidth = width + G.cellSize * 0.3;
        for (const d of beamDirs) {
          oc.beginPath();
          oc.moveTo(origin.x, origin.y);
          oc.lineTo(origin.x + d.dx * beamLen * reach, origin.y + d.dy * beamLen * reach);
          oc.stroke();
        }
        oc.globalAlpha = beamAlpha;
        oc.shadowBlur = 10;
        oc.lineWidth = width;
        for (const d of beamDirs) {
          oc.beginPath();
          oc.moveTo(origin.x, origin.y);
          oc.lineTo(origin.x + d.dx * beamLen * reach, origin.y + d.dy * beamLen * reach);
          oc.stroke();
        }
        oc.globalAlpha = beamAlpha * 0.9;
        oc.strokeStyle = "#ffffff";
        oc.shadowBlur = 0;
        oc.lineWidth = width * 0.3;
        for (const d of beamDirs) {
          oc.beginPath();
          oc.moveTo(origin.x, origin.y);
          oc.lineTo(origin.x + d.dx * beamLen * reach, origin.y + d.dy * beamLen * reach);
          oc.stroke();
        }
      }
      oc.restore();
    });
    drawVFX();
  });

  for (const { r, c } of cells) {
    if (!dissolved.has(r + "," + c)) {
      const cc = cellCenter(r, c);
      addBurstParticles(cc.x, cc.y, color, 6, { speed: 2, size: 3, decay: 0.04, sizeDecay: 0.05 });
    }
  }
}

async function animateBombSpecial(cells: CellPos[], info: SpecialInfo): Promise<void> {
  const origin = cellCenter(info.r, info.c);
  const color: string = PIECE_COLORS[info.color] || "#ff8800";
  const blastRadius: number = G.cellSize * 3.5;
  const rayCount: number = 12;

  await animateFrames(22, (frame: number, t: number) => {
    drawBoard((oc: CanvasRenderingContext2D) => {
      oc.save();
      oc.translate(origin.x, origin.y);
      const pulse: number = 1 + Math.sin(frame * 1.2) * 0.15;
      const coreR: number = G.cellSize * (0.25 + t * 0.35) * pulse;
      const grad: CanvasGradient = oc.createRadialGradient(0, 0, 0, 0, 0, coreR * 2);
      grad.addColorStop(0, color);
      grad.addColorStop(0.5, color + "88");
      grad.addColorStop(1, color + "00");
      oc.globalAlpha = 0.5 + t * 0.4;
      oc.fillStyle = grad;
      oc.beginPath();
      oc.arc(0, 0, coreR * 2, 0, Math.PI * 2);
      oc.fill();
      oc.globalAlpha = 0.6 + t * 0.4;
      oc.shadowColor = "#ffffff";
      oc.shadowBlur = 15 + t * 30;
      oc.fillStyle = "#ffffff";
      oc.beginPath();
      oc.arc(0, 0, coreR * 0.5, 0, Math.PI * 2);
      oc.fill();
      if (t > 0.3) {
        const rayT: number = (t - 0.3) / 0.7;
        oc.globalAlpha = rayT * 0.4;
        oc.strokeStyle = color;
        oc.shadowColor = color;
        oc.shadowBlur = 10;
        oc.lineWidth = 2 + rayT * 3;
        oc.lineCap = "round";
        for (let i = 0; i < rayCount; i++) {
          const a: number = (Math.PI * 2 * i / rayCount) + frame * 0.15;
          const rLen: number = G.cellSize * (0.5 + rayT * 1.5);
          oc.beginPath();
          oc.moveTo(Math.cos(a) * coreR, Math.sin(a) * coreR);
          oc.lineTo(Math.cos(a) * rLen, Math.sin(a) * rLen);
          oc.stroke();
        }
      }
      oc.restore();
    });
    drawVFX();
  });

  addScreenShake(10);
  addFlash(origin.x, origin.y, G.cellSize * 5, "#ffffff", 20);
  addShockwave(origin.x, origin.y, G.cellSize * 6, 28, "#ffffff");
  addShockwave(origin.x, origin.y, G.cellSize * 4.5, 22, color);
  addShockwave(origin.x, origin.y, G.cellSize * 3, 16, color);
  addBurstParticles(origin.x, origin.y, "#ffffff", 35, { speed: 7, size: 7, decay: 0.02, sizeDecay: 0.06 });
  addBurstParticles(origin.x, origin.y, color, 30, { speed: 5, size: 6, decay: 0.02, sizeDecay: 0.05 });
  for (let i = 0; i < rayCount; i++) {
    const a: number = Math.PI * 2 * i / rayCount;
    addComet(origin.x, origin.y, Math.cos(a), Math.sin(a), color, G.cellSize * 0.35, 12);
  }

  const cellDistances: { r: number; c: number; dist: number }[] = cells.map(({ r, c }) => ({
    r, c, dist: Math.abs(r - info.r) + Math.abs(c - info.c)
  }));

  await animateFrames(42, (frame: number, t: number) => {
    for (const { r, c, dist } of cellDistances) {
      if (frame === dist * 3 + 1) {
        const cc = cellCenter(r, c);
        const pColor: string = (G.board[r] && G.board[r][c]) ? (PIECE_COLORS[G.board[r][c]!.color] || color) : color;
        addBurstParticles(cc.x, cc.y, pColor, 12, { speed: 3.5, size: 4.5, decay: 0.035, sizeDecay: 0.05 });
        addFlash(cc.x, cc.y, G.cellSize * 0.6, pColor, 7);
        addFlash(cc.x, cc.y, G.cellSize * 0.3, "#ffffff", 4);
      }
    }
    drawBoard((oc: CanvasRenderingContext2D) => {
      oc.save();
      for (let ring = 0; ring < 3; ring++) {
        const delay: number = ring * 0.12;
        const rt: number = Math.max(0, t - delay);
        if (rt <= 0 || rt > 0.8) continue;
        const ringT: number = rt / 0.8;
        const ringR: number = blastRadius * ringT * (1 - ring * 0.15);
        const ringAlpha: number = (1 - ringT) * 0.5;
        oc.globalAlpha = ringAlpha;
        oc.strokeStyle = ring === 0 ? "#ffffff" : color;
        oc.shadowColor = ring === 0 ? "#ffffff" : color;
        oc.shadowBlur = 25 - ring * 5;
        oc.lineWidth = G.cellSize * (0.5 - ring * 0.12) * (1 - ringT * 0.6);
        oc.beginPath();
        oc.arc(origin.x, origin.y, ringR, 0, Math.PI * 2);
        oc.stroke();
      }
      if (t < 0.4) {
        const rayFade: number = 1 - t / 0.4;
        oc.globalAlpha = rayFade * 0.5;
        oc.strokeStyle = "#ffffff";
        oc.shadowColor = "#ffffff";
        oc.shadowBlur = 15;
        oc.lineWidth = G.cellSize * 0.15 * rayFade;
        oc.lineCap = "round";
        for (let i = 0; i < rayCount; i++) {
          const a: number = Math.PI * 2 * i / rayCount;
          const rLen: number = blastRadius * (0.5 + t * 2);
          oc.beginPath();
          oc.moveTo(origin.x, origin.y);
          oc.lineTo(origin.x + Math.cos(a) * rLen, origin.y + Math.sin(a) * rLen);
          oc.stroke();
        }
      }
      oc.restore();
    });
    drawVFX();
  });
}

async function animateRainbow(cells: CellPos[], info: SpecialInfo): Promise<void> {
  const origin = cellCenter(info.r, info.c);
  const color: string = PIECE_COLORS[info.color] || "#aa44ff";
  const arcColors: string[] = PIECE_COLORS.slice(0, 6) as string[];
  const arcCount: number = 6;

  await animateFrames(25, (frame: number, t: number) => {
    drawBoard((oc: CanvasRenderingContext2D) => {
      oc.save();
      oc.translate(origin.x, origin.y);
      const vortexR: number = G.cellSize * (0.6 + t * 1.8);
      const grad: CanvasGradient = oc.createRadialGradient(0, 0, 0, 0, 0, vortexR);
      grad.addColorStop(0, "rgba(60, 0, 120, 0.95)");
      grad.addColorStop(0.4, "rgba(40, 0, 80, 0.5)");
      grad.addColorStop(0.8, "rgba(20, 0, 40, 0.2)");
      grad.addColorStop(1, "rgba(0, 0, 0, 0)");
      oc.globalAlpha = 0.4 + t * 0.5;
      oc.fillStyle = grad;
      oc.beginPath();
      oc.arc(0, 0, vortexR, 0, Math.PI * 2);
      oc.fill();
      const baseAngle: number = frame * 0.4;
      for (let layer = 0; layer < 2; layer++) {
        const layerR: number = G.cellSize * (0.4 + t * 0.6 + layer * 0.3);
        oc.lineWidth = (5 + t * 5) * (1 - layer * 0.3);
        oc.globalAlpha = (0.5 + t * 0.4) * (1 - layer * 0.25);
        oc.lineCap = "round";
        for (let i = 0; i < arcCount; i++) {
          const a: number = baseAngle + (Math.PI * 2 * i / arcCount) + layer * 0.3;
          const arcC: string = arcColors[i % arcColors.length];
          oc.strokeStyle = arcC;
          oc.shadowColor = arcC;
          oc.shadowBlur = 12 + t * 15;
          oc.beginPath();
          oc.arc(0, 0, layerR, a, a + Math.PI * 0.45);
          oc.stroke();
        }
      }
      oc.globalAlpha = 0.5 + t * 0.5;
      oc.shadowColor = "#ffffff";
      oc.shadowBlur = 20 + t * 20;
      oc.fillStyle = "#ffffff";
      oc.beginPath();
      oc.arc(0, 0, G.cellSize * (0.15 + t * 0.1), 0, Math.PI * 2);
      oc.fill();
      oc.restore();
    });
    if (frame % 3 === 0) {
      const sc: string = arcColors[frame % arcColors.length];
      const a: number = Math.random() * Math.PI * 2;
      const r: number = G.cellSize * 0.5;
      addParticle(origin.x + Math.cos(a) * r, origin.y + Math.sin(a) * r, sc,
        { vx: Math.cos(a) * 2, vy: Math.sin(a) * 2, size: 4, decay: 0.04, sizeDecay: 0.05 });
    }
    drawVFX();
  });

  addScreenShake(5);
  addShockwave(origin.x, origin.y, G.cellSize * 3, 18, color);

  interface CellSnap {
    r: number;
    c: number;
    startX: number;
    startY: number;
    dx: number;
    dy: number;
    dist: number;
    color: string;
  }

  const cellSnaps: CellSnap[] = cells.map(({ r, c }) => {
    const cc = cellCenter(r, c);
    const dx: number = cc.x - origin.x, dy: number = cc.y - origin.y;
    const dist: number = Math.hypot(dx, dy) || 1;
    return { r, c, startX: cc.x, startY: cc.y, dx: dx / dist, dy: dy / dist, dist,
      color: (G.board[r] && G.board[r][c]) ? (PIECE_COLORS[G.board[r][c]!.color] || color) : color };
  });

  await animateFrames(48, (frame: number, t: number) => {
    drawBoard((oc: CanvasRenderingContext2D) => {
      oc.save();
      oc.lineCap = "round";
      for (let si = 0; si < cellSnaps.length; si++) {
        const snap: CellSnap = cellSnaps[si];
        const beamT: number = Math.min(t * 2.5, 1);
        const fadeT: number = Math.max(0, (t - 0.5) / 0.5);
        const beamAlpha: number = (1 - fadeT) * 0.7;
        if (beamAlpha <= 0.01) continue;
        const beamEndX: number = origin.x + (snap.startX - origin.x) * beamT;
        const beamEndY: number = origin.y + (snap.startY - origin.y) * beamT;
        const bColor: string = arcColors[si % arcColors.length];
        oc.globalAlpha = beamAlpha * 0.4;
        oc.strokeStyle = bColor;
        oc.shadowColor = bColor;
        oc.shadowBlur = 15;
        oc.lineWidth = G.cellSize * 0.25;
        oc.beginPath();
        oc.moveTo(origin.x, origin.y);
        oc.lineTo(beamEndX, beamEndY);
        oc.stroke();
        oc.globalAlpha = beamAlpha * 0.8;
        oc.shadowBlur = 5;
        oc.lineWidth = G.cellSize * 0.1;
        oc.beginPath();
        oc.moveTo(origin.x, origin.y);
        oc.lineTo(beamEndX, beamEndY);
        oc.stroke();
        oc.globalAlpha = beamAlpha;
        oc.strokeStyle = "#ffffff";
        oc.shadowBlur = 0;
        oc.lineWidth = G.cellSize * 0.04;
        oc.beginPath();
        oc.moveTo(origin.x, origin.y);
        oc.lineTo(beamEndX, beamEndY);
        oc.stroke();
        if (beamT >= 0.95 && fadeT < 0.3 && frame === Math.floor(snap.dist / (G.cellSize * 0.5)) + 11) {
          addBurstParticles(snap.startX, snap.startY, bColor, 10, { speed: 3, size: 4, decay: 0.035, sizeDecay: 0.05 });
          addFlash(snap.startX, snap.startY, G.cellSize * 0.5, bColor, 6);
        }
      }
      oc.restore();
    });
    if (frame % 2 === 0) {
      const sc: string = arcColors[Math.floor(Math.random() * arcColors.length)];
      addParticle(
        origin.x + (Math.random() - 0.5) * G.cellSize,
        origin.y + (Math.random() - 0.5) * G.cellSize,
        sc, { vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 4, size: 5, decay: 0.04, sizeDecay: 0.05 });
    }
    drawVFX();
  });

  addScreenShake(8);
  addFlash(origin.x, origin.y, G.cellSize * 5, "#ffffff", 20);
  for (let i = 0; i < arcColors.length; i++) {
    addBurstParticles(origin.x, origin.y, arcColors[i], 10, { speed: 6 + i * 0.5, size: 6, decay: 0.02, sizeDecay: 0.05 });
  }
  addBurstParticles(origin.x, origin.y, "#ffffff", 25, { speed: 7, size: 5, decay: 0.02, sizeDecay: 0.05 });
  addShockwave(origin.x, origin.y, G.cellSize * 5, 25, "#ffffff");
  addShockwave(origin.x, origin.y, G.cellSize * 4, 20, color);
}

async function animateCrossCombo(cells: CellPos[], specialInfos: SpecialInfo[]): Promise<void> {
  const info: SpecialInfo = specialInfos.find(s => s.type === "cross" || s.type === "star_cross") || specialInfos[0];
  const origin = cellCenter(info.r, info.c);
  const color: string = PIECE_COLORS[info.color] || "#ffffff";
  const isStar: boolean = info.type === "star_cross";
  const dissolved = new Set<string>();

  interface BeamDir {
    dx: number;
    dy: number;
    color: string;
  }

  const beamDirs: BeamDir[] = [
    { dx: 1, dy: 0, color: "#ff4444" }, { dx: -1, dy: 0, color: "#ff4444" },
    { dx: 0, dy: 1, color: "#4488ff" }, { dx: 0, dy: -1, color: "#4488ff" },
  ];
  if (isStar) {
    const inv: number = Math.SQRT1_2;
    beamDirs.push(
      { dx: inv, dy: inv, color: "#44ff88" }, { dx: -inv, dy: -inv, color: "#44ff88" },
      { dx: inv, dy: -inv, color: "#ff44ff" }, { dx: -inv, dy: inv, color: "#ff44ff" }
    );
  }
  const beamLen: number = Math.max(G.rows, G.cols) * G.cellSize;

  await animateFrames(12, (frame: number, t: number) => {
    drawBoard((oc: CanvasRenderingContext2D) => {
      oc.save();
      oc.shadowColor = "#ffff00";
      oc.shadowBlur = 15 + t * 35;
      oc.fillStyle = "#ffff00";
      oc.globalAlpha = 0.4 + t * 0.5;
      oc.beginPath();
      oc.arc(origin.x, origin.y, G.cellSize * (0.3 + t * 0.4), 0, Math.PI * 2);
      oc.fill();
      oc.restore();
    });
    drawVFX();
  });

  addShockwave(origin.x, origin.y, G.cellSize * 2.5, 20, "#ffff00");
  addScreenShake(4);
  for (const d of beamDirs) {
    addComet(origin.x, origin.y, d.dx, d.dy, d.color, G.cellSize * 0.5, 20);
  }

  await animateFrames(38, (frame: number, t: number) => {
    if (frame === 15) {
      addShockwave(origin.x, origin.y, G.cellSize * 5, 22, "#ffff44");
      addBurstParticles(origin.x, origin.y, "#ffff00", 20, { speed: 5, size: 5, decay: 0.03, sizeDecay: 0.06 });
      addScreenShake(5);
    }
    for (const { r, c } of cells) {
      const key: string = r + "," + c;
      if (dissolved.has(key)) continue;
      const cc = cellCenter(r, c);
      for (const comet of G.vfxComets) {
        if (Math.hypot(comet.x - cc.x, comet.y - cc.y) < G.cellSize * 0.8) {
          dissolved.add(key);
          const pColor: string = (G.board[r] && G.board[r][c]) ? (PIECE_COLORS[G.board[r][c]!.color] || "#ffffff") : "#ffffff";
          addBurstParticles(cc.x, cc.y, pColor, 8, { speed: 3, size: 4, decay: 0.04, sizeDecay: 0.05 });
          addFlash(cc.x, cc.y, G.cellSize * 0.5, pColor, 6);
          break;
        }
      }
    }
    drawBoard((oc: CanvasRenderingContext2D) => {
      oc.save();
      const beamAlpha: number = (1 - t * 0.7) * 0.7;
      if (beamAlpha > 0.01) {
        const reach: number = Math.min(t * 2.5, 1);
        const fade: number = 1 - Math.max(0, (t - 0.6) / 0.4);
        const width: number = G.cellSize * 0.7 * fade;
        oc.lineCap = "round";
        for (const d of beamDirs) {
          oc.globalAlpha = beamAlpha * 0.5;
          oc.strokeStyle = d.color;
          oc.shadowColor = d.color;
          oc.shadowBlur = 25;
          oc.lineWidth = width + G.cellSize * 0.3;
          oc.beginPath();
          oc.moveTo(origin.x, origin.y);
          oc.lineTo(origin.x + d.dx * beamLen * reach, origin.y + d.dy * beamLen * reach);
          oc.stroke();
          oc.globalAlpha = beamAlpha;
          oc.shadowBlur = 10;
          oc.lineWidth = width;
          oc.beginPath();
          oc.moveTo(origin.x, origin.y);
          oc.lineTo(origin.x + d.dx * beamLen * reach, origin.y + d.dy * beamLen * reach);
          oc.stroke();
        }
        oc.strokeStyle = "#ffffff";
        oc.shadowBlur = 0;
        oc.lineWidth = width * 0.3;
        oc.globalAlpha = beamAlpha * 0.9;
        for (const d of beamDirs) {
          oc.beginPath();
          oc.moveTo(origin.x, origin.y);
          oc.lineTo(origin.x + d.dx * beamLen * reach, origin.y + d.dy * beamLen * reach);
          oc.stroke();
        }
      }
      oc.restore();
    });
    drawVFX();
  });

  for (const { r, c } of cells) {
    if (!dissolved.has(r + "," + c)) {
      const cc = cellCenter(r, c);
      addBurstParticles(cc.x, cc.y, color, 6, { speed: 2, size: 3, decay: 0.04, sizeDecay: 0.05 });
    }
  }
}

async function animateTripleLine(cells: CellPos[], specialInfos: SpecialInfo[]): Promise<void> {
  const info: SpecialInfo = specialInfos.find(s => s.type === "triple_line") || specialInfos[0];
  const origin = cellCenter(info.r, info.c);
  const color: string = PIECE_COLORS[info.color] || "#ffffff";
  const dissolved = new Set<string>();
  const beamLen: number = Math.max(G.rows, G.cols) * G.cellSize;
  const beamDirs: { dx: number; dy: number; color: string }[] = [
    { dx: 1, dy: 0, color: "#ff4444" }, { dx: -1, dy: 0, color: "#ff4444" },
    { dx: 0, dy: 1, color: "#4488ff" }, { dx: 0, dy: -1, color: "#4488ff" },
  ];
  const offsets: number[] = [-G.cellSize, 0, G.cellSize];

  await animateFrames(16, (frame: number, t: number) => {
    drawBoard((oc: CanvasRenderingContext2D) => {
      oc.save();
      const pulse: number = 1 + Math.sin(frame * 1.5) * 0.1;
      oc.shadowColor = color;
      oc.shadowBlur = 15 + t * 35;
      oc.fillStyle = color;
      oc.globalAlpha = 0.5 + t * 0.4;
      oc.beginPath();
      oc.arc(origin.x, origin.y, G.cellSize * (0.4 + t * 0.4) * pulse, 0, Math.PI * 2);
      oc.fill();
      oc.fillStyle = "#ffffff";
      oc.globalAlpha = 0.7 + t * 0.3;
      oc.beginPath();
      oc.arc(origin.x, origin.y, G.cellSize * 0.2 * pulse, 0, Math.PI * 2);
      oc.fill();
      oc.restore();
    });
    drawVFX();
  });

  addScreenShake(8);
  addShockwave(origin.x, origin.y, G.cellSize * 3, 20, color);
  addFlash(origin.x, origin.y, G.cellSize * 3, "#ffffff", 15);
  for (const d of beamDirs) {
    for (const off of offsets) {
      const ox: number = d.dx === 0 ? off : 0;
      const oy: number = d.dy === 0 ? off : 0;
      addComet(origin.x + ox, origin.y + oy, d.dx, d.dy, d.color, G.cellSize * 0.4, 14);
    }
  }
  addBurstParticles(origin.x, origin.y, "#ffffff", 30, { speed: 6, size: 6, decay: 0.02, sizeDecay: 0.06 });

  await animateFrames(55, (frame: number, t: number) => {
    for (const { r, c } of cells) {
      const key: string = r + "," + c;
      if (dissolved.has(key)) continue;
      const cc = cellCenter(r, c);
      for (const comet of G.vfxComets) {
        if (Math.hypot(comet.x - cc.x, comet.y - cc.y) < G.cellSize * 1.0) {
          dissolved.add(key);
          const pColor: string = (G.board[r] && G.board[r][c]) ? (PIECE_COLORS[G.board[r][c]!.color] || color) : color;
          addBurstParticles(cc.x, cc.y, pColor, 8, { speed: 3, size: 4, decay: 0.04, sizeDecay: 0.05 });
          addFlash(cc.x, cc.y, G.cellSize * 0.5, pColor, 5);
          break;
        }
      }
    }
    drawBoard((oc: CanvasRenderingContext2D) => {
      oc.save();
      const beamAlpha: number = (1 - t * 0.7) * 0.6;
      if (beamAlpha > 0.01) {
        const reach: number = Math.min(t * 2.5, 1);
        const fade: number = 1 - Math.max(0, (t - 0.6) / 0.4);
        const width: number = G.cellSize * 0.5 * fade;
        oc.lineCap = "round";
        for (const d of beamDirs) {
          for (const off of offsets) {
            const ox: number = d.dx === 0 ? off : 0;
            const oy: number = d.dy === 0 ? off : 0;
            const sx: number = origin.x + ox, sy: number = origin.y + oy;
            oc.globalAlpha = beamAlpha * 0.4;
            oc.strokeStyle = d.color;
            oc.shadowColor = d.color;
            oc.shadowBlur = 20;
            oc.lineWidth = width + G.cellSize * 0.2;
            oc.beginPath(); oc.moveTo(sx, sy);
            oc.lineTo(sx + d.dx * beamLen * reach, sy + d.dy * beamLen * reach);
            oc.stroke();
            oc.globalAlpha = beamAlpha * 0.8;
            oc.shadowBlur = 8;
            oc.lineWidth = width;
            oc.beginPath(); oc.moveTo(sx, sy);
            oc.lineTo(sx + d.dx * beamLen * reach, sy + d.dy * beamLen * reach);
            oc.stroke();
            oc.globalAlpha = beamAlpha;
            oc.strokeStyle = "#ffffff";
            oc.shadowBlur = 0;
            oc.lineWidth = width * 0.25;
            oc.beginPath(); oc.moveTo(sx, sy);
            oc.lineTo(sx + d.dx * beamLen * reach, sy + d.dy * beamLen * reach);
            oc.stroke();
          }
        }
      }
      oc.restore();
    });
    drawVFX();
  });

  for (const { r, c } of cells) {
    if (!dissolved.has(r + "," + c)) {
      const cc = cellCenter(r, c);
      addBurstParticles(cc.x, cc.y, color, 6, { speed: 2, size: 3, decay: 0.04, sizeDecay: 0.05 });
    }
  }
}

async function animateRainbowLine(cells: CellPos[], specialInfos: SpecialInfo[]): Promise<void> {
  const info: SpecialInfo = specialInfos.find(s => s.type === "rainbow_line") || specialInfos[0];
  const origin = cellCenter(info.r, info.c);
  const arcColors: string[] = PIECE_COLORS.slice(0, 6) as string[];
  const targetCells: [number, number][] = info.primaryCells || cells.map(({ r, c }): [number, number] => [r, c]);

  await animateFrames(22, (frame: number, t: number) => {
    drawBoard((oc: CanvasRenderingContext2D) => {
      oc.save();
      oc.translate(origin.x, origin.y);
      const vortexR: number = G.cellSize * (0.5 + t * 2.0);
      const grad: CanvasGradient = oc.createRadialGradient(0, 0, 0, 0, 0, vortexR);
      grad.addColorStop(0, "rgba(60, 0, 120, 0.9)");
      grad.addColorStop(0.5, "rgba(40, 0, 80, 0.4)");
      grad.addColorStop(1, "rgba(0, 0, 0, 0)");
      oc.globalAlpha = 0.5 + t * 0.4;
      oc.fillStyle = grad;
      oc.beginPath(); oc.arc(0, 0, vortexR, 0, Math.PI * 2); oc.fill();
      const baseAngle: number = frame * 0.5;
      for (let i = 0; i < 6; i++) {
        const a: number = baseAngle + (Math.PI * 2 * i / 6);
        oc.strokeStyle = arcColors[i];
        oc.shadowColor = arcColors[i];
        oc.shadowBlur = 15 + t * 15;
        oc.lineWidth = 4 + t * 6;
        oc.lineCap = "round";
        oc.globalAlpha = 0.6 + t * 0.3;
        oc.beginPath(); oc.arc(0, 0, G.cellSize * (0.4 + t * 0.8), a, a + Math.PI * 0.4); oc.stroke();
      }
      oc.restore();
    });
    drawVFX();
  });

  addScreenShake(6);
  addShockwave(origin.x, origin.y, G.cellSize * 3, 18, "#ffffff");
  addFlash(origin.x, origin.y, G.cellSize * 4, "#ffffff", 15);

  interface TargetSnap {
    r: number;
    c: number;
    x: number;
    y: number;
    color: string;
  }

  const cellSnaps: TargetSnap[] = targetCells.map(([r, c], i): TargetSnap => {
    const cc = cellCenter(r, c);
    return { r, c, x: cc.x, y: cc.y, color: arcColors[i % arcColors.length] };
  });

  await animateFrames(48, (frame: number, t: number) => {
    drawBoard((oc: CanvasRenderingContext2D) => {
      oc.save();
      oc.lineCap = "round";
      for (const snap of cellSnaps) {
        const beamT: number = Math.min(t * 3.0, 1);
        const fadeT: number = Math.max(0, (t - 0.45) / 0.55);
        const alpha: number = (1 - fadeT) * 0.7;
        if (alpha <= 0.01) continue;
        const ex: number = origin.x + (snap.x - origin.x) * beamT;
        const ey: number = origin.y + (snap.y - origin.y) * beamT;
        oc.globalAlpha = alpha * 0.4;
        oc.strokeStyle = snap.color;
        oc.shadowColor = snap.color;
        oc.shadowBlur = 12;
        oc.lineWidth = G.cellSize * 0.2;
        oc.beginPath(); oc.moveTo(origin.x, origin.y); oc.lineTo(ex, ey); oc.stroke();
        oc.globalAlpha = alpha;
        oc.shadowBlur = 4;
        oc.lineWidth = G.cellSize * 0.08;
        oc.beginPath(); oc.moveTo(origin.x, origin.y); oc.lineTo(ex, ey); oc.stroke();
        oc.strokeStyle = "#ffffff";
        oc.shadowBlur = 0;
        oc.lineWidth = G.cellSize * 0.03;
        oc.globalAlpha = alpha * 0.8;
        oc.beginPath(); oc.moveTo(origin.x, origin.y); oc.lineTo(ex, ey); oc.stroke();
      }
      oc.restore();
    });
    if (frame % 2 === 0) {
      for (let i = 0; i < 3; i++) {
        const sc: string = arcColors[Math.floor(Math.random() * arcColors.length)];
        addParticle(origin.x + (Math.random() - 0.5) * G.cellSize * 2,
          origin.y + (Math.random() - 0.5) * G.cellSize * 2,
          sc, { vx: (Math.random() - 0.5) * 5, vy: (Math.random() - 0.5) * 5, size: 5, decay: 0.04, sizeDecay: 0.05 });
      }
    }
    if (frame === 16) {
      for (const snap of cellSnaps) {
        addBurstParticles(snap.x, snap.y, snap.color, 8, { speed: 3, size: 4, decay: 0.035, sizeDecay: 0.05 });
        addFlash(snap.x, snap.y, G.cellSize * 0.5, snap.color, 5);
      }
      addScreenShake(5);
    }
    drawVFX();
  });

  addScreenShake(8);
  addFlash(origin.x, origin.y, G.cellSize * 6, "#ffffff", 20);
  for (const ac of arcColors) {
    addBurstParticles(origin.x, origin.y, ac, 8, { speed: 6, size: 6, decay: 0.02, sizeDecay: 0.05 });
  }
  addShockwave(origin.x, origin.y, G.cellSize * 6, 28, "#ffffff");
  addShockwave(origin.x, origin.y, G.cellSize * 4, 22, "#aa44ff");
}

async function animateRainbowBombCombo(cells: CellPos[], specialInfos: SpecialInfo[]): Promise<void> {
  const info: SpecialInfo = specialInfos.find(s => s.type === "rainbow_bomb") || specialInfos[0];
  const origin = cellCenter(info.r, info.c);
  const color: string = PIECE_COLORS[info.color] || "#ff8800";
  const arcColors: string[] = PIECE_COLORS.slice(0, 6) as string[];
  const targetCells: [number, number][] = info.primaryCells || cells.map(({ r, c }): [number, number] => [r, c]);

  await animateFrames(22, (frame: number, t: number) => {
    drawBoard((oc: CanvasRenderingContext2D) => {
      oc.save();
      oc.translate(origin.x, origin.y);
      const vortexR: number = G.cellSize * (0.5 + t * 1.8);
      const grad: CanvasGradient = oc.createRadialGradient(0, 0, 0, 0, 0, vortexR);
      grad.addColorStop(0, "rgba(60, 0, 120, 0.9)");
      grad.addColorStop(0.5, "rgba(80, 30, 0, 0.5)");
      grad.addColorStop(1, "rgba(0, 0, 0, 0)");
      oc.globalAlpha = 0.5 + t * 0.4;
      oc.fillStyle = grad;
      oc.beginPath(); oc.arc(0, 0, vortexR, 0, Math.PI * 2); oc.fill();
      const baseAngle: number = frame * 0.45;
      for (let i = 0; i < 6; i++) {
        const a: number = baseAngle + (Math.PI * 2 * i / 6);
        oc.strokeStyle = arcColors[i];
        oc.shadowColor = arcColors[i];
        oc.shadowBlur = 12 + t * 15;
        oc.lineWidth = 4 + t * 5;
        oc.lineCap = "round";
        oc.globalAlpha = 0.5 + t * 0.4;
        oc.beginPath(); oc.arc(0, 0, G.cellSize * (0.35 + t * 0.6), a, a + Math.PI * 0.4); oc.stroke();
      }
      oc.fillStyle = "#ffffff";
      oc.shadowColor = "#ffffff";
      oc.shadowBlur = 20 + t * 25;
      oc.globalAlpha = 0.6 + t * 0.4;
      oc.beginPath(); oc.arc(0, 0, G.cellSize * (0.15 + t * 0.1), 0, Math.PI * 2); oc.fill();
      oc.restore();
    });
    drawVFX();
  });

  addScreenShake(7);
  addShockwave(origin.x, origin.y, G.cellSize * 4, 22, "#ffffff");
  addFlash(origin.x, origin.y, G.cellSize * 5, "#ffffff", 18);

  interface TargetSnap {
    r: number;
    c: number;
    x: number;
    y: number;
    color: string;
  }

  const cellSnaps: TargetSnap[] = targetCells.map(([r, c], i): TargetSnap => {
    const cc = cellCenter(r, c);
    return { r, c, x: cc.x, y: cc.y, color: arcColors[i % arcColors.length] };
  });

  await animateFrames(48, (frame: number, t: number) => {
    drawBoard((oc: CanvasRenderingContext2D) => {
      oc.save();
      oc.lineCap = "round";
      for (const snap of cellSnaps) {
        const beamT: number = Math.min(t * 2.8, 1);
        const fadeT: number = Math.max(0, (t - 0.5) / 0.5);
        const alpha: number = (1 - fadeT) * 0.65;
        if (alpha <= 0.01) continue;
        const ex: number = origin.x + (snap.x - origin.x) * beamT;
        const ey: number = origin.y + (snap.y - origin.y) * beamT;
        oc.globalAlpha = alpha * 0.35;
        oc.strokeStyle = snap.color;
        oc.shadowColor = snap.color;
        oc.shadowBlur = 12;
        oc.lineWidth = G.cellSize * 0.18;
        oc.beginPath(); oc.moveTo(origin.x, origin.y); oc.lineTo(ex, ey); oc.stroke();
        oc.globalAlpha = alpha;
        oc.shadowBlur = 4;
        oc.lineWidth = G.cellSize * 0.07;
        oc.beginPath(); oc.moveTo(origin.x, origin.y); oc.lineTo(ex, ey); oc.stroke();
      }
      oc.restore();
    });
    if (frame === 14) {
      for (const snap of cellSnaps) {
        addBurstParticles(snap.x, snap.y, snap.color, 10, { speed: 3.5, size: 4.5, decay: 0.03, sizeDecay: 0.05 });
        addFlash(snap.x, snap.y, G.cellSize * 0.6, snap.color, 6);
        addShockwave(snap.x, snap.y, G.cellSize * 1.5, 12, snap.color);
      }
      addScreenShake(6);
    }
    if (frame % 3 === 0) {
      const sc: string = arcColors[Math.floor(Math.random() * arcColors.length)];
      addParticle(origin.x + (Math.random() - 0.5) * G.cellSize * 2,
        origin.y + (Math.random() - 0.5) * G.cellSize * 2,
        sc, { vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 4, size: 5, decay: 0.04, sizeDecay: 0.05 });
    }
    drawVFX();
  });

  addScreenShake(10);
  addFlash(origin.x, origin.y, G.cellSize * 6, "#ffffff", 22);
  for (const ac of arcColors) {
    addBurstParticles(origin.x, origin.y, ac, 10, { speed: 7, size: 6, decay: 0.02, sizeDecay: 0.05 });
  }
  addBurstParticles(origin.x, origin.y, "#ffffff", 30, { speed: 8, size: 5, decay: 0.02, sizeDecay: 0.05 });
  addShockwave(origin.x, origin.y, G.cellSize * 6, 28, "#ffffff");
  addShockwave(origin.x, origin.y, G.cellSize * 5, 22, color);
}

async function animateBigBomb(cells: CellPos[], specialInfos: SpecialInfo[]): Promise<void> {
  const info: SpecialInfo = specialInfos.find(s => s.type === "big_bomb") || specialInfos[0];
  const origin = cellCenter(info.r, info.c);
  const color: string = PIECE_COLORS[info.color] || "#ff6600";

  const cellSnaps: { r: number; c: number; sx: number; sy: number }[] = cells.map(({ r, c }) => {
    const cc = cellCenter(r, c);
    return { r, c, sx: cc.x, sy: cc.y };
  });

  await animateFrames(12, (frame: number, t: number) => {
    drawBoard((oc: CanvasRenderingContext2D) => {
      for (const snap of cellSnaps) {
        const pullX: number = snap.sx + (origin.x - snap.sx) * t * 0.15;
        const pullY: number = snap.sy + (origin.y - snap.sy) * t * 0.15;
        const scale: number = 1 - t * 0.1;
        oc.save();
        oc.globalAlpha = 0.3;
        oc.fillStyle = "#ffffff";
        oc.beginPath();
        oc.arc(pullX, pullY, G.cellSize * 0.35 * scale, 0, Math.PI * 2);
        oc.fill();
        oc.restore();
      }
    });
    drawVFX();
  });

  addScreenShake(8);
  addShockwave(origin.x, origin.y, G.cellSize * 7, 30, "#ffffff");
  addFlash(origin.x, origin.y, G.cellSize * 5, "#ffffff", 18);
  addBurstParticles(origin.x, origin.y, "#ffffff", 30, { speed: 6, size: 6, decay: 0.025, sizeDecay: 0.08 });
  addBurstParticles(origin.x, origin.y, color, 20, { speed: 4, size: 5, decay: 0.02, sizeDecay: 0.06 });

  const cellDists: { r: number; c: number; dist: number }[] = cells.map(({ r, c }) => ({
    r, c, dist: Math.abs(r - info.r) + Math.abs(c - info.c)
  }));

  await animateFrames(40, (frame: number, t: number) => {
    if (frame === 12) addShockwave(origin.x, origin.y, G.cellSize * 5, 20, color);
    if (frame === 20) addShockwave(origin.x, origin.y, G.cellSize * 4, 18, "#ffaa00");
    for (const { r, c, dist } of cellDists) {
      if (frame === dist * 4 + 1) {
        const cc = cellCenter(r, c);
        const pColor: string = (G.board[r] && G.board[r][c]) ? (PIECE_COLORS[G.board[r][c]!.color] || color) : color;
        addBurstParticles(cc.x, cc.y, pColor, 8, { speed: 2.5, size: 3.5, decay: 0.04, sizeDecay: 0.05 });
        addScreenShake(1.5);
      }
    }
    drawBoard(() => {});
    drawVFX();
  });
}

async function animateGalaxyCollision(cells: CellPos[], specialInfos: SpecialInfo[]): Promise<void> {
  const info: SpecialInfo = specialInfos.find(s => s.type === "galaxy") || specialInfos[0];
  const boardCX: number = (G.cols * G.cellSize) / 2;
  const boardCY: number = (G.rows * G.cellSize) / 2;

  addScreenShake(8);
  addFlash(boardCX, boardCY, G.cellSize * 8, "#ffffff", 20);
  addShockwave(boardCX, boardCY, G.cellSize * 10, 30, "#ffffff");
  addBurstParticles(boardCX, boardCY, "#ffffff", 40, { speed: 7, size: 6, decay: 0.02, sizeDecay: 0.07 });

  const cellDists: { r: number; c: number; dist: number }[] = cells.map(({ r, c }) => {
    const cc = cellCenter(r, c);
    const dist: number = Math.hypot(cc.x - boardCX, cc.y - boardCY) / G.cellSize;
    return { r, c, dist };
  });

  await animateFrames(48, (frame: number, t: number) => {
    if (frame === 14) {
      addShockwave(boardCX, boardCY, G.cellSize * 6, 22, "#ffff44");
      addScreenShake(4);
    }
    for (const { r, c, dist } of cellDists) {
      if (frame === Math.floor(dist * 2.7) + 1) {
        const cc = cellCenter(r, c);
        const pColor: string = (G.board[r] && G.board[r][c]) ? (PIECE_COLORS[G.board[r][c]!.color] || "#ffffff") : "#ffffff";
        addBurstParticles(cc.x, cc.y, pColor, 6, { speed: 3, size: 3.5, decay: 0.035, sizeDecay: 0.05 });
      }
    }
    drawBoard((oc: CanvasRenderingContext2D) => {
      if (t < 0.6) {
        const overlayAlpha: number = (1 - t / 0.6) * 0.25;
        oc.save();
        oc.globalAlpha = overlayAlpha;
        oc.fillStyle = "#ffffff";
        oc.fillRect(0, 0, G.cols * G.cellSize, G.rows * G.cellSize);
        oc.restore();
      }
    });
    drawVFX();
  });
}

export function animateFrames(totalFrames: number, callback: (frame: number, t: number) => void): Promise<void> {
  return new Promise<void>(resolve => {
    let frame: number = 0;
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

export async function animateDrop(fallMap: FallEntry[]): Promise<void> {
  if (fallMap.length === 0) {
    drawBoard();
    return;
  }

  const maxDist: number = Math.max(...fallMap.map((f) => f.toR - f.fromR));
  const fallFrames: number = Math.ceil(maxDist / ANIM.DROP_SPEED);
  const bounceFrames: number = 10;
  const totalFrames: number = fallFrames + bounceFrames;

  const frozen: (Piece | null)[][] = [];
  for (let r = 0; r < G.rows; r++) {
    frozen[r] = [];
    for (let c = 0; c < G.cols; c++) {
      frozen[r][c] = G.board[r][c];
    }
  }

  const fallingCells = new Set<number>(fallMap.map((f) => f.toR * G.cols + f.c));

  for (let frame = 0; frame <= totalFrames; frame++) {
    drawBoardBase();

    for (let r = 0; r < G.rows; r++) {
      for (let c = 0; c < G.cols; c++) {
        if (fallingCells.has(r * G.cols + c)) continue;
        if (frozen[r][c]) {
          drawPieceAt(frozen[r][c]!, c * G.cellSize + G.cellSize / 2, r * G.cellSize + G.cellSize / 2);
        }
        if (isIce(r, c)) drawIceOverlay(r, c);
      }
    }

    for (const fall of fallMap) {
      const dist: number = fall.toR - fall.fromR;
      const x: number = fall.c * G.cellSize + G.cellSize / 2;
      let currentR: number;

      if (frame <= fallFrames) {
        const t: number = Math.min(frame / fallFrames, 1);
        const accel: number = t * t;
        currentR = fall.fromR + dist * accel;
      } else {
        const bt: number = (frame - fallFrames) / bounceFrames;
        const bounceAmp: number = Math.min(0.25 + dist * 0.08, 0.5);
        const bounceHeight: number = bounceAmp * Math.sin(bt * Math.PI) * (1 - bt * 0.6);
        currentR = fall.toR - bounceHeight;
      }

      const y: number = currentR * G.cellSize + G.cellSize / 2;
      if (y + G.cellSize / 2 > 0) {
        drawPieceAt(fall.piece, x, y);
      }
    }

    G.ctx!.restore();

    if (frame < totalFrames) {
      await sleep(ANIM.DROP_FRAME_MS);
    }
  }

  drawBoard();
}
