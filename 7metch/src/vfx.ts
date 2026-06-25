import type { GameState } from "./types";
import { G, PIECE_COLORS } from "./state";

// ============================================================
//  Easing Functions
// ============================================================

export function easeOutQuad(t: number): number { return t * (2 - t); }
export function easeInQuad(t: number): number  { return t * t; }

// ============================================================
//  Helper: Cell Pixel Center
// ============================================================

export function cellCenter(r: number, c: number): { x: number; y: number } {
  return {
    x: c * G.cellSize + G.cellSize / 2,
    y: r * G.cellSize + G.cellSize / 2
  };
}

// ============================================================
//  addParticle — Single Star-Shaped Particle
// ============================================================
//  Shape: 4-point star (two overlapping rotated diamonds).
//  Each particle carries its own velocity, color, size, and
//  a life value that drains by `decay` per frame.

export function addParticle(x: number, y: number, color: string, opts: Partial<{vx: number, vy: number, decay: number, size: number, sizeDecay: number}> = {}): void {
  G.vfxParticles.push({
    x,
    y,
    vx:        opts.vx        || 0,
    vy:        opts.vy        || 0,
    color:     color,
    life:      1,
    decay:     opts.decay     || 0.03,
    size:      opts.size      || 4,
    sizeDecay: opts.sizeDecay || 0.05,
    alpha:     1,
    rotation:  Math.random() * Math.PI * 2
  });
}

// ============================================================
//  addBurstParticles — Radial Burst of N Particles
// ============================================================
//  Distributes `count` particles evenly around a circle with
//  some random angular jitter and speed variance.

export function addBurstParticles(x: number, y: number, color: string, count: number, opts: Partial<{speed: number, size: number, decay: number, sizeDecay: number}> = {}): void {
  const speed     = opts.speed     || 3;
  const size      = opts.size      || 4;
  const decay     = opts.decay     || 0.03;
  const sizeDecay = opts.sizeDecay || 0.05;

  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i / count) + (Math.random() - 0.5) * 0.4;
    const spd   = speed * (0.6 + Math.random() * 0.8);
    addParticle(x, y, color, {
      vx: Math.cos(angle) * spd,
      vy: Math.sin(angle) * spd,
      size,
      decay,
      sizeDecay
    });
  }
}

// ============================================================
//  addShockwave — Expanding Ring
// ============================================================

export function addShockwave(x: number, y: number, maxR: number, duration: number, color: string): void {
  G.vfxShockwaves.push({
    x, y,
    r:        0,
    maxR:     maxR     || 60,
    frame:    0,
    duration: duration || 20,
    color:    color    || '#ffffff'
  });
}

// ============================================================
//  addFlash — Expanding Filled Circle
// ============================================================

export function addFlash(x: number, y: number, maxR: number, color: string, duration?: number): void {
  G.vfxFlashes.push({
    x, y,
    r:        0,
    maxR:     maxR     || 50,
    frame:    0,
    duration: duration || 15,
    color:    color    || '#ffffff'
  });
}

// ============================================================
//  addComet — Moving Projectile with Trail
// ============================================================
//  Stores the last `trailLength` positions. Head is drawn as
//  a white circle with a colored glow; trail is a series of
//  shrinking, fading dots. Auto-removed when far out of bounds.

export function addComet(x: number, y: number, dx: number, dy: number, color: string, speed?: number, trailLength?: number): void {
  speed       = speed       || 8;
  trailLength = trailLength || 12;
  G.vfxComets.push({
    x, y,
    dx, dy,          // unit direction
    speed,
    color,
    trail:       [],
    trailLength,
    life:        1,
    active:      true
  });
}

// ============================================================
//  addScreenShake — Trigger Screen Shake
// ============================================================

export function addScreenShake(intensity: number): void {
  if (!G.options.screenShake) return;
  G.shakeIntensity = Math.max(G.shakeIntensity, intensity);
}

// ============================================================
//  addFloatingText — Rising, Fading Text
// ============================================================

export function addFloatingText(text: string, x: number, y: number, color?: string, size?: number): void {
  G.vfxTexts.push({
    text,
    x, y,
    color:    color || '#ffffff',
    size:     size  || 24,
    life:     1,
    decay:    0.02,
    vy:       -1.5        // drifts upward
  });
}

// ============================================================
//  updateVFX — Per-Frame Update for All VFX
// ============================================================

export function updateVFX(): void {
  // --- Particles ---
  for (let i = G.vfxParticles.length - 1; i >= 0; i--) {
    const p = G.vfxParticles[i];
    p.x    += p.vx;
    p.y    += p.vy;
    p.vy   += 0.04;          // slight gravity
    p.life -= p.decay;
    p.size  = Math.max(0, p.size - p.sizeDecay);
    p.alpha = Math.max(0, p.life);
    if (p.life <= 0 || p.size <= 0) G.vfxParticles.splice(i, 1);
  }

  // --- Shockwaves ---
  for (let i = G.vfxShockwaves.length - 1; i >= 0; i--) {
    const s = G.vfxShockwaves[i];
    s.frame++;
    const t = s.frame / s.duration;
    s.r = s.maxR * easeOutQuad(Math.min(t, 1));
    if (s.frame >= s.duration) G.vfxShockwaves.splice(i, 1);
  }

  // --- Flashes ---
  for (let i = G.vfxFlashes.length - 1; i >= 0; i--) {
    const f = G.vfxFlashes[i];
    f.frame++;
    const t = f.frame / f.duration;
    f.r = f.maxR * easeOutQuad(Math.min(t, 1));
    if (f.frame >= f.duration) G.vfxFlashes.splice(i, 1);
  }

  // --- Comets ---
  const margin = G.cellSize * 3;
  const bLeft   = 0 - margin;
  const bRight  = G.cols * G.cellSize + margin;
  const bTop    = 0 - margin;
  const bBottom = G.rows * G.cellSize + margin;

  for (let i = G.vfxComets.length - 1; i >= 0; i--) {
    const c = G.vfxComets[i];
    // store current position in trail
    c.trail.push({ x: c.x, y: c.y });
    if (c.trail.length > c.trailLength) c.trail.shift();
    // advance
    c.x += c.dx * c.speed;
    c.y += c.dy * c.speed;
    // out of bounds?
    if (c.x < bLeft || c.x > bRight || c.y < bTop || c.y > bBottom) {
      G.vfxComets.splice(i, 1);
    }
  }

  // --- Screen Shake ---
  if (G.shakeIntensity > 0.5) {
    G.shakeX = (Math.random() - 0.5) * G.shakeIntensity * 2;
    G.shakeY = (Math.random() - 0.5) * G.shakeIntensity * 2;
    G.shakeIntensity *= 0.85;
  } else {
    G.shakeX = 0;
    G.shakeY = 0;
    G.shakeIntensity = 0;
  }

  // --- Floating Texts ---
  for (let i = G.vfxTexts.length - 1; i >= 0; i--) {
    const t = G.vfxTexts[i];
    t.y    += t.vy;
    t.life -= t.decay;
    if (t.life <= 0) G.vfxTexts.splice(i, 1);
  }
}

// ============================================================
//  drawVFX — Render All Active VFX onto ctx
// ============================================================

export function drawVFX(): void {
  const ctx = G.ctx!;
  ctx.save();
  ctx.translate(G.shakeX, G.shakeY);

  // --- Flashes (drawn first — behind everything else) ---
  for (const f of G.vfxFlashes) {
    const t     = f.frame / f.duration;
    const alpha = 0.6 * (1 - t);
    if (alpha <= 0) continue;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle   = f.color;
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // --- Shockwaves ---
  for (const s of G.vfxShockwaves) {
    const t         = s.frame / s.duration;
    const alpha     = 1 - t;
    const lineWidth = Math.max(1, (1 - t) * 4);
    if (alpha <= 0) continue;
    ctx.save();
    ctx.globalAlpha   = alpha;
    ctx.strokeStyle   = s.color;
    ctx.lineWidth     = lineWidth;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // --- Particles (4-point star) ---
  for (const p of G.vfxParticles) {
    if (p.alpha <= 0 || p.size <= 0) continue;
    ctx.save();
    ctx.globalAlpha = p.alpha;
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rotation);
    ctx.fillStyle = p.color;
    // 4-point star: two overlapping diamonds
    const s  = p.size;
    const sn = s * 0.38;   // narrow half-width
    ctx.beginPath();
    // vertical diamond
    ctx.moveTo(0,  -s);
    ctx.lineTo(sn,  0);
    ctx.moveTo(0,  -s);
    ctx.lineTo(-sn, 0);
    ctx.lineTo(0,   s);
    ctx.lineTo(sn,  0);
    ctx.closePath();
    ctx.fill();
    // horizontal diamond
    ctx.beginPath();
    ctx.moveTo(-s,  0);
    ctx.lineTo(0,  -sn);
    ctx.lineTo(s,   0);
    ctx.lineTo(0,   sn);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // --- Comets ---
  for (const c of G.vfxComets) {
    // trail
    for (let i = 0; i < c.trail.length; i++) {
      const t     = i / c.trail.length;          // 0 = oldest, 1 = newest
      const alpha = t * 0.7;
      const r     = Math.max(1, t * 4);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle   = c.color;
      ctx.beginPath();
      ctx.arc(c.trail[i].x, c.trail[i].y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // head: colored glow
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.shadowColor = c.color;
    ctx.shadowBlur  = 14;
    ctx.fillStyle   = c.color;
    ctx.beginPath();
    ctx.arc(c.x, c.y, 5, 0, Math.PI * 2);
    ctx.fill();
    // white core
    ctx.shadowBlur  = 0;
    ctx.fillStyle   = '#ffffff';
    ctx.beginPath();
    ctx.arc(c.x, c.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // --- Floating Texts ---
  for (const t of G.vfxTexts) {
    if (t.life <= 0) continue;
    ctx.save();
    ctx.globalAlpha    = Math.min(1, t.life * 2);   // fade near end
    ctx.fillStyle      = t.color;
    ctx.font           = `bold ${t.size}px sans-serif`;
    ctx.textAlign      = 'center';
    ctx.textBaseline   = 'middle';
    ctx.shadowColor    = t.color;
    ctx.shadowBlur     = 8;
    ctx.fillText(t.text, t.x, t.y);
    ctx.restore();
  }

  ctx.restore();
}

// ============================================================
//  hasActiveVFX — Are Any VFX Still Alive?
// ============================================================

export function hasActiveVFX(): boolean {
  return G.vfxParticles.length > 0
      || G.vfxShockwaves.length > 0
      || G.vfxFlashes.length > 0
      || G.vfxComets.length > 0
      || G.vfxTexts.length > 0
      || G.shakeIntensity > 0.5;
}
