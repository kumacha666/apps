import { G } from "./state";

// --- Helpers ---

export function cellCenter(r: number, c: number): { x: number; y: number } {
  return {
    x: G.offsetX + c * G.cellSize + G.cellSize / 2,
    y: G.offsetY + r * G.cellSize + G.cellSize / 2,
  };
}

function easeOutQuad(t: number): number {
  return t * (2 - t);
}

// --- Particle ---

export function addParticle(
  x: number, y: number, color: string,
  opts: Partial<{ vx: number; vy: number; decay: number; size: number; sizeDecay: number }> = {},
): void {
  G.vfxParticles.push({
    x, y,
    vx: opts.vx || 0,
    vy: opts.vy || 0,
    color,
    life: 1,
    decay: opts.decay || 0.03,
    size: opts.size || 4,
    sizeDecay: opts.sizeDecay || 0.05,
    alpha: 1,
    rotation: Math.random() * Math.PI * 2,
  });
}

export function addBurstParticles(
  x: number, y: number, color: string, count: number,
  opts: Partial<{ speed: number; size: number; decay: number; sizeDecay: number }> = {},
): void {
  const speed = opts.speed || 3;
  const size = opts.size || 4;
  const decay = opts.decay || 0.03;
  const sizeDecay = opts.sizeDecay || 0.05;

  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i / count) + (Math.random() - 0.5) * 0.4;
    const spd = speed * (0.6 + Math.random() * 0.8);
    addParticle(x, y, color, {
      vx: Math.cos(angle) * spd,
      vy: Math.sin(angle) * spd,
      size, decay, sizeDecay,
    });
  }
}

// --- Shockwave ---

export function addShockwave(x: number, y: number, maxR: number, duration: number, color: string): void {
  G.vfxShockwaves.push({ x, y, r: 0, maxR, frame: 0, duration, color });
}

// --- Flash ---

export function addFlash(x: number, y: number, maxR: number, color: string, duration?: number): void {
  G.vfxFlashes.push({ x, y, r: 0, maxR, frame: 0, duration: duration || 15, color });
}

// --- Screen Shake ---

export function addScreenShake(intensity: number): void {
  G.shakeIntensity = Math.max(G.shakeIntensity, intensity);
}

// --- Update ---

export function updateVFX(): void {
  // Particles
  for (let i = G.vfxParticles.length - 1; i >= 0; i--) {
    const p = G.vfxParticles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.04;
    p.life -= p.decay;
    p.size = Math.max(0, p.size - p.sizeDecay);
    p.alpha = Math.max(0, p.life);
    if (p.life <= 0 || p.size <= 0) G.vfxParticles.splice(i, 1);
  }

  // Shockwaves
  for (let i = G.vfxShockwaves.length - 1; i >= 0; i--) {
    const s = G.vfxShockwaves[i];
    s.frame++;
    const t = s.frame / s.duration;
    s.r = s.maxR * easeOutQuad(Math.min(t, 1));
    if (s.frame >= s.duration) G.vfxShockwaves.splice(i, 1);
  }

  // Flashes
  for (let i = G.vfxFlashes.length - 1; i >= 0; i--) {
    const f = G.vfxFlashes[i];
    f.frame++;
    const t = f.frame / f.duration;
    f.r = f.maxR * easeOutQuad(Math.min(t, 1));
    if (f.frame >= f.duration) G.vfxFlashes.splice(i, 1);
  }

  // Screen shake
  if (G.shakeIntensity > 0.5) {
    G.shakeX = (Math.random() - 0.5) * G.shakeIntensity * 2;
    G.shakeY = (Math.random() - 0.5) * G.shakeIntensity * 2;
    G.shakeIntensity *= 0.85;
  } else {
    G.shakeX = 0;
    G.shakeY = 0;
    G.shakeIntensity = 0;
  }
}

export function hasActiveVFX(): boolean {
  return G.vfxParticles.length > 0 || G.vfxShockwaves.length > 0 || G.vfxFlashes.length > 0 || G.shakeIntensity > 0;
}

// --- Draw ---

export function drawVFX(): void {
  const ctx = G.ctx!;

  // Flashes
  for (const f of G.vfxFlashes) {
    const t = f.frame / f.duration;
    const alpha = 0.6 * (1 - t);
    if (alpha <= 0) continue;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = f.color;
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Shockwaves
  for (const s of G.vfxShockwaves) {
    const t = s.frame / s.duration;
    const alpha = 1 - t;
    const lineWidth = Math.max(1, (1 - t) * 4);
    if (alpha <= 0) continue;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Particles (4-point star)
  for (const p of G.vfxParticles) {
    if (p.alpha <= 0 || p.size <= 0) continue;
    ctx.save();
    ctx.globalAlpha = p.alpha;
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rotation);
    ctx.fillStyle = p.color;
    const s = p.size;
    const sn = s * 0.38;
    // vertical diamond
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.lineTo(sn, 0);
    ctx.lineTo(0, s);
    ctx.lineTo(-sn, 0);
    ctx.closePath();
    ctx.fill();
    // horizontal diamond
    ctx.beginPath();
    ctx.moveTo(-s, 0);
    ctx.lineTo(0, -sn);
    ctx.lineTo(s, 0);
    ctx.lineTo(0, sn);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
