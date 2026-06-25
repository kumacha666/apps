import { G, PIECE_COLORS } from "./state.js";

// ============================================================
//  Easing Functions
// ============================================================

export function easeOutQuad(t) { return t * (2 - t); }
export function easeInQuad(t)  { return t * t; }

// ============================================================
//  Helper: Cell Pixel Center
// ============================================================

export function cellCenter(r, c) {
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

export function addParticle(x, y, color, opts = {}) {
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

export function addBurstParticles(x, y, color, count, opts = {}) {
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

export function addShockwave(x, y, maxR, duration, color) {
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

export function addFlash(x, y, maxR, color, duration) {
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

export function addComet(x, y, dx, dy, color, speed, trailLength) {
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

export function addScreenShake(intensity) {
  if (!G.options.screenShake) return;
  G.shakeIntensity = Math.max(G.shakeIntensity, intensity);
}

// ============================================================
//  addFloatingText — Rising, Fading Text
// ============================================================

export function addFloatingText(text, x, y, color, size) {
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

export function updateVFX() {
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

export function drawVFX() {
  G.ctx.save();
  G.ctx.translate(G.shakeX, G.shakeY);

  // --- Flashes (drawn first — behind everything else) ---
  for (const f of G.vfxFlashes) {
    const t     = f.frame / f.duration;
    const alpha = 0.6 * (1 - t);
    if (alpha <= 0) continue;
    G.ctx.save();
    G.ctx.globalAlpha = alpha;
    G.ctx.fillStyle   = f.color;
    G.ctx.beginPath();
    G.ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
    G.ctx.fill();
    G.ctx.restore();
  }

  // --- Shockwaves ---
  for (const s of G.vfxShockwaves) {
    const t         = s.frame / s.duration;
    const alpha     = 1 - t;
    const lineWidth = Math.max(1, (1 - t) * 4);
    if (alpha <= 0) continue;
    G.ctx.save();
    G.ctx.globalAlpha   = alpha;
    G.ctx.strokeStyle   = s.color;
    G.ctx.lineWidth     = lineWidth;
    G.ctx.beginPath();
    G.ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    G.ctx.stroke();
    G.ctx.restore();
  }

  // --- Particles (4-point star) ---
  for (const p of G.vfxParticles) {
    if (p.alpha <= 0 || p.size <= 0) continue;
    G.ctx.save();
    G.ctx.globalAlpha = p.alpha;
    G.ctx.translate(p.x, p.y);
    G.ctx.rotate(p.rotation);
    G.ctx.fillStyle = p.color;
    // 4-point star: two overlapping diamonds
    const s  = p.size;
    const sn = s * 0.38;   // narrow half-width
    G.ctx.beginPath();
    // vertical diamond
    G.ctx.moveTo(0,  -s);
    G.ctx.lineTo(sn,  0);
    G.ctx.moveTo(0,  -s);
    G.ctx.lineTo(-sn, 0);
    G.ctx.lineTo(0,   s);
    G.ctx.lineTo(sn,  0);
    G.ctx.closePath();
    G.ctx.fill();
    // horizontal diamond
    G.ctx.beginPath();
    G.ctx.moveTo(-s,  0);
    G.ctx.lineTo(0,  -sn);
    G.ctx.lineTo(s,   0);
    G.ctx.lineTo(0,   sn);
    G.ctx.closePath();
    G.ctx.fill();
    G.ctx.restore();
  }

  // --- Comets ---
  for (const c of G.vfxComets) {
    // trail
    for (let i = 0; i < c.trail.length; i++) {
      const t     = i / c.trail.length;          // 0 = oldest, 1 = newest
      const alpha = t * 0.7;
      const r     = Math.max(1, t * 4);
      G.ctx.save();
      G.ctx.globalAlpha = alpha;
      G.ctx.fillStyle   = c.color;
      G.ctx.beginPath();
      G.ctx.arc(c.trail[i].x, c.trail[i].y, r, 0, Math.PI * 2);
      G.ctx.fill();
      G.ctx.restore();
    }
    // head: colored glow
    G.ctx.save();
    G.ctx.globalAlpha = 0.9;
    G.ctx.shadowColor = c.color;
    G.ctx.shadowBlur  = 14;
    G.ctx.fillStyle   = c.color;
    G.ctx.beginPath();
    G.ctx.arc(c.x, c.y, 5, 0, Math.PI * 2);
    G.ctx.fill();
    // white core
    G.ctx.shadowBlur  = 0;
    G.ctx.fillStyle   = '#ffffff';
    G.ctx.beginPath();
    G.ctx.arc(c.x, c.y, 2.5, 0, Math.PI * 2);
    G.ctx.fill();
    G.ctx.restore();
  }

  // --- Floating Texts ---
  for (const t of G.vfxTexts) {
    if (t.life <= 0) continue;
    G.ctx.save();
    G.ctx.globalAlpha    = Math.min(1, t.life * 2);   // fade near end
    G.ctx.fillStyle      = t.color;
    G.ctx.font           = `bold ${t.size}px sans-serif`;
    G.ctx.textAlign      = 'center';
    G.ctx.textBaseline   = 'middle';
    G.ctx.shadowColor    = t.color;
    G.ctx.shadowBlur     = 8;
    G.ctx.fillText(t.text, t.x, t.y);
    G.ctx.restore();
  }

  G.ctx.restore();
}

// ============================================================
//  hasActiveVFX — Are Any VFX Still Alive?
// ============================================================

export function hasActiveVFX() {
  return G.vfxParticles.length > 0
      || G.vfxShockwaves.length > 0
      || G.vfxFlashes.length > 0
      || G.vfxComets.length > 0
      || G.vfxTexts.length > 0
      || G.shakeIntensity > 0.5;
}
