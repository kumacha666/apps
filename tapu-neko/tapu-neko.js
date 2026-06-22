(() => {
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');

  let W, H;

  function resize() {
    const dpr = devicePixelRatio;
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  function getCat() {
    const r = Math.min(W, H) * 0.25;
    return { cx: W / 2, cy: H * 0.50, r };
  }

  // Local deformations
  const dents = [];
  const MAX_DENTS = 16;

  class Dent {
    constructor(angle, depth, width) {
      this.angle = angle;
      this.depth = depth;
      this.vel = 0;
      this.width = width || 0.6;
      this.dead = false;
    }
    update() {
      this.vel -= this.depth * 0.045;
      this.vel *= 0.93;
      this.depth += this.vel;
      if (Math.abs(this.depth) < 0.1 && Math.abs(this.vel) < 0.1) {
        this.dead = true;
      }
    }
  }

  // Minimal sway (almost none for poke, only for tilt/shake)
  let swayX = 0, swayY = 0, swayVX = 0, swayVY = 0;

  // Pinch state
  let pinchScale = 1, pinchVel = 0;
  let pinching = false;
  let pinchStartDist = 0;
  let pinchLiveDist = 0;

  // Face
  let eyeSquint = 0, targetSquint = 0;
  let blushAlpha = 0, targetBlush = 0;
  let tailWag = 0;

  // Single-finger drag
  let dragging = false, dragInside = false;
  let dragStartX = 0, dragStartY = 0, dragX = 0, dragY = 0;

  // Device motion
  let motionInited = false;
  let accelX = 0, accelY = 0;

  function angleTo(px, py) {
    const c = getCat();
    return Math.atan2(py - c.cy, px - c.cx);
  }

  function distTo(px, py) {
    const c = getCat();
    const dx = px - c.cx, dy = py - c.cy;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function isInside(px, py) {
    return distTo(px, py) < getCat().r * 1.3;
  }

  function addDent(angle, depth, width) {
    if (dents.length >= MAX_DENTS) dents.shift();
    dents.push(new Dent(angle, depth, width));
  }

  function pokeAt(px, py, strength) {
    const angle = angleTo(px, py);
    const c = getCat();
    addDent(angle, -c.r * 0.2 * strength, 0.5);

    targetSquint = Math.min(strength, 1);
    targetBlush = Math.min(strength, 1);
    setTimeout(() => { targetSquint = 0; }, 400);
    setTimeout(() => { targetBlush = 0; }, 800);
  }

  // Touch handling - support both single and multi-touch
  const activeTouches = new Map();

  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      activeTouches.set(t.identifier, { x: t.clientX, y: t.clientY, sx: t.clientX, sy: t.clientY });
    }

    if (activeTouches.size >= 2) {
      // Start pinch
      const pts = [...activeTouches.values()];
      const dx = pts[0].x - pts[1].x, dy = pts[0].y - pts[1].y;
      pinchStartDist = Math.sqrt(dx * dx + dy * dy);
      pinchLiveDist = pinchStartDist;
      pinching = true;
      dragging = false;
    } else if (activeTouches.size === 1) {
      const t = e.changedTouches[0];
      dragging = true;
      dragInside = isInside(t.clientX, t.clientY);
      dragStartX = dragX = t.clientX;
      dragStartY = dragY = t.clientY;
      if (dragInside) pokeAt(t.clientX, t.clientY, 1);
    }
    initMotion();
  }, { passive: false });

  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const existing = activeTouches.get(t.identifier);
      if (existing) { existing.x = t.clientX; existing.y = t.clientY; }
    }

    if (pinching && activeTouches.size >= 2) {
      const pts = [...activeTouches.values()];
      const dx = pts[0].x - pts[1].x, dy = pts[0].y - pts[1].y;
      pinchLiveDist = Math.sqrt(dx * dx + dy * dy);
    } else if (dragging) {
      const t = e.changedTouches[0];
      dragX = t.clientX;
      dragY = t.clientY;
      if (dragInside) targetSquint = 0.4;
    }
  }, { passive: false });

  canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      activeTouches.delete(t.identifier);
    }

    if (pinching && activeTouches.size < 2) {
      // Release pinch -> bounce
      const ratio = pinchStartDist > 0 ? pinchLiveDist / pinchStartDist : 1;
      pinchVel += (ratio - 1) * 0.15;
      pinching = false;
      targetSquint = 0;
    }

    if (activeTouches.size === 0) {
      if (dragging && dragInside) {
        const dx = dragX - dragStartX;
        const dy = dragY - dragStartY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 15) {
          const angle = Math.atan2(dy, dx);
          const c = getCat();
          const strength = Math.min(dist / c.r, 1.5);
          addDent(angle, c.r * 0.25 * strength, 0.6);
          addDent(angle + Math.PI, -c.r * 0.1 * strength, 0.7);
          pokeAt(dragX, dragY, strength * 0.5);
        }
      }
      dragging = false;
      dragInside = false;
      targetSquint = 0;
    }
  }, { passive: false });

  // Mouse fallback for desktop
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') return;
    e.preventDefault();
    dragging = true;
    dragStartX = dragX = e.clientX;
    dragStartY = dragY = e.clientY;
    dragInside = isInside(e.clientX, e.clientY);
    if (dragInside) pokeAt(e.clientX, e.clientY, 1);
    initMotion();
  });

  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    e.preventDefault();
    if (!dragging) return;
    dragX = e.clientX;
    dragY = e.clientY;
    if (dragInside) targetSquint = 0.4;
  });

  canvas.addEventListener('pointerup', (e) => {
    if (e.pointerType === 'touch') return;
    e.preventDefault();
    if (dragging && dragInside) {
      const dx = dragX - dragStartX;
      const dy = dragY - dragStartY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 15) {
        const angle = Math.atan2(dy, dx);
        const c = getCat();
        const strength = Math.min(dist / c.r, 1.5);
        addDent(angle, c.r * 0.25 * strength, 0.6);
        addDent(angle + Math.PI, -c.r * 0.1 * strength, 0.7);
        pokeAt(dragX, dragY, strength * 0.5);
      }
    }
    dragging = false;
    dragInside = false;
    targetSquint = 0;
  });

  // Device motion
  function initMotion() {
    if (motionInited) return;
    motionInited = true;
    if (typeof DeviceMotionEvent !== 'undefined' &&
        typeof DeviceMotionEvent.requestPermission === 'function') {
      DeviceMotionEvent.requestPermission().then((state) => {
        if (state === 'granted') listenMotion();
      }).catch(() => {});
    } else if (typeof DeviceMotionEvent !== 'undefined') {
      listenMotion();
    }
  }

  function listenMotion() {
    let prevAx = 0, prevAy = 0, prevAz = 0;
    window.addEventListener('devicemotion', (e) => {
      const a = e.accelerationIncludingGravity;
      if (!a) return;
      const ax = a.x || 0, ay = a.y || 0, az = a.z || 0;

      accelX = ax;
      accelY = ay;

      const jerk = Math.abs(ax - prevAx) + Math.abs(ay - prevAy) + Math.abs(az - prevAz);
      if (jerk > 12) {
        const shakeAngle = Math.atan2(ay - prevAy, ax - prevAx);
        const shakeStr = Math.min(jerk / 20, 2);
        addDent(shakeAngle, -getCat().r * 0.15 * shakeStr, 0.7);
        addDent(shakeAngle + Math.PI * 0.7, -getCat().r * 0.1 * shakeStr, 0.6);
        swayVX += (ax - prevAx) * 0.3;
        swayVY -= (ay - prevAy) * 0.3;
        targetSquint = Math.min(shakeStr * 0.5, 1);
        targetBlush = Math.min(shakeStr * 0.3, 1);
        setTimeout(() => { targetSquint = 0; targetBlush = 0; }, 300);
      }
      prevAx = ax; prevAy = ay; prevAz = az;
    }, { passive: true });
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function physics() {
    for (let i = dents.length - 1; i >= 0; i--) {
      dents[i].update();
      if (dents[i].dead) dents.splice(i, 1);
    }

    // Pinch scale spring
    pinchVel -= (pinchScale - 1) * 0.05;
    pinchVel *= 0.9;
    pinchScale = clamp(pinchScale + pinchVel, 0.7, 1.5);

    // Tilt force (only tilt moves the whole body, not pokes)
    swayVX += accelX * 0.05;
    swayVY -= accelY * 0.05;

    swayVX -= swayX * 0.04;
    swayVY -= swayY * 0.04;
    swayVX *= 0.92;
    swayVY *= 0.92;
    swayX = clamp(swayX + swayVX, -40, 40);
    swayY = clamp(swayY + swayVY, -40, 40);

    eyeSquint += (targetSquint - eyeSquint) * 0.15;
    blushAlpha += (targetBlush - blushAlpha) * 0.08;
    tailWag += 0.05;
  }

  function getDeformAt(angle) {
    let d = 0;
    for (const dent of dents) {
      let diff = angle - dent.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      d += dent.depth * Math.exp(-(diff * diff) / (2 * dent.width * dent.width));
    }
    return d;
  }

  function getDragDeform(angle) {
    if (!dragging || !dragInside) return 0;
    const dx = dragX - dragStartX;
    const dy = dragY - dragStartY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 5) return 0;

    const pullAngle = Math.atan2(dy, dx);
    let diff = angle - pullAngle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;

    const c = getCat();
    const strength = Math.min(dist / c.r, 1.0);
    return Math.exp(-(diff * diff) / (2 * 0.4 * 0.4)) * strength * c.r * 0.45;
  }

  function getPinchDeform() {
    if (!pinching || pinchStartDist < 10) return 0;
    const ratio = pinchLiveDist / pinchStartDist;
    return (ratio - 1) * getCat().r * 0.5;
  }

  function drawShadow(cx, cy, r) {
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 1.05, r * 0.75, r * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawTail(cx, cy, r) {
    const bx = cx + r * 0.75;
    const by = cy + r * 0.1;
    ctx.strokeStyle = '#f0a860';
    ctx.lineWidth = r * 0.09;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.bezierCurveTo(
      bx + r * 0.35, by - r * 0.25,
      bx + r * 0.45, by - r * 0.65 + Math.sin(tailWag) * r * 0.1,
      bx + r * 0.25, by - r * 0.8 + Math.sin(tailWag + 0.8) * r * 0.15
    );
    ctx.stroke();
  }

  function drawEar(cx, cy, r, side) {
    const earW = r * 0.25;
    const earH = r * 0.35;
    const baseX = cx + side * r * 0.38;
    const baseY = cy - r * 0.82;
    const tipX = baseX + side * earW * 0.35;
    const tipY = baseY - earH;

    // Outer ear - symmetric shape
    ctx.beginPath();
    ctx.moveTo(baseX - side * earW * 0.1, baseY);
    ctx.quadraticCurveTo(baseX - side * earW * 0.2, tipY + earH * 0.3, tipX, tipY);
    ctx.quadraticCurveTo(baseX + side * earW * 0.8, tipY + earH * 0.3, baseX + side * earW * 0.6, baseY);
    ctx.closePath();
    ctx.fillStyle = '#ffd4a8';
    ctx.fill();
    ctx.strokeStyle = '#d4915a';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Inner ear
    const innerScale = 0.6;
    const innerBaseX = baseX + side * earW * 0.25;
    const innerBaseY = baseY - earH * 0.05;
    const innerTipX = tipX;
    const innerTipY = tipY + earH * 0.25;
    ctx.beginPath();
    ctx.moveTo(innerBaseX - side * earW * 0.05, innerBaseY);
    ctx.quadraticCurveTo(innerBaseX - side * earW * 0.1, innerTipY + earH * 0.1, innerTipX, innerTipY);
    ctx.quadraticCurveTo(innerBaseX + side * earW * 0.4, innerTipY + earH * 0.1, innerBaseX + side * earW * 0.3, innerBaseY);
    ctx.closePath();
    ctx.fillStyle = '#ffb8b8';
    ctx.fill();
  }

  function drawBody(cx, cy, r) {
    const liveR = r * pinchScale;
    const pinchD = getPinchDeform();
    const segments = 80;
    ctx.beginPath();
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const deform = getDeformAt(a) + getDragDeform(a) + pinchD;
      const rr = liveR + clamp(deform, -r * 0.35, r * 0.5);
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();

    const grad = ctx.createRadialGradient(cx - r * 0.15, cy - r * 0.25, r * 0.1, cx, cy, r);
    grad.addColorStop(0, '#fff5ee');
    grad.addColorStop(0.5, '#ffd4a8');
    grad.addColorStop(1, '#f0a860');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = '#d4915a';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  function drawFace(cx, cy, r) {
    if (blushAlpha > 0.01) {
      ctx.globalAlpha = blushAlpha * 0.4;
      ctx.fillStyle = '#ff9999';
      ctx.beginPath();
      ctx.ellipse(cx - r * 0.35, cy + r * 0.15, r * 0.12, r * 0.07, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx + r * 0.35, cy + r * 0.15, r * 0.12, r * 0.07, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    const eyeSpacing = r * 0.22;
    const eyeY = cy - r * 0.08;
    const eyeRx = r * 0.09;
    const eyeRy = r * 0.11 * Math.max(0.25, 1 - eyeSquint * 0.75);

    ctx.fillStyle = '#3a2a1a';
    ctx.beginPath();
    ctx.ellipse(cx - eyeSpacing, eyeY, eyeRx, eyeRy, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + eyeSpacing, eyeY, eyeRx, eyeRy, 0, 0, Math.PI * 2);
    ctx.fill();

    if (eyeSquint < 0.5) {
      ctx.fillStyle = '#fff';
      const hl = eyeRx * 0.35;
      ctx.beginPath();
      ctx.ellipse(cx - eyeSpacing + eyeRx * 0.25, eyeY - eyeRy * 0.2, hl, hl, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx + eyeSpacing + eyeRx * 0.25, eyeY - eyeRy * 0.2, hl, hl, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    const noseY = cy + r * 0.07;
    ctx.fillStyle = '#e8907a';
    ctx.beginPath();
    ctx.moveTo(cx, noseY - r * 0.02);
    ctx.lineTo(cx - r * 0.035, noseY + r * 0.02);
    ctx.lineTo(cx + r * 0.035, noseY + r * 0.02);
    ctx.closePath();
    ctx.fill();

    const mouthY = noseY + r * 0.035;
    ctx.strokeStyle = '#c8885a';
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, mouthY);
    ctx.quadraticCurveTo(cx - r * 0.05, mouthY + r * 0.04, cx - r * 0.09, mouthY + r * 0.015);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, mouthY);
    ctx.quadraticCurveTo(cx + r * 0.05, mouthY + r * 0.04, cx + r * 0.09, mouthY + r * 0.015);
    ctx.stroke();

    ctx.strokeStyle = '#c8a080';
    ctx.lineWidth = 1.5;
    for (let side = -1; side <= 1; side += 2) {
      for (let i = -1; i <= 1; i++) {
        const wy = cy + r * 0.12 + i * r * 0.04;
        ctx.beginPath();
        ctx.moveTo(cx + side * r * 0.13, wy);
        ctx.lineTo(cx + side * r * 0.5, wy + i * r * 0.025);
        ctx.stroke();
      }
    }
  }

  function drawTitle() {
    ctx.fillStyle = '#d4915a';
    ctx.font = `bold ${Math.min(W, H) * 0.065}px -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('ぷよネコ', W / 2, H * 0.04);

    ctx.fillStyle = '#c8a080';
    ctx.font = `${Math.min(W, H) * 0.028}px -apple-system, sans-serif`;
    ctx.fillText('つついてぷにぷにしよう！', W / 2, H * 0.04 + Math.min(W, H) * 0.085);
  }

  function loop() {
    ctx.clearRect(0, 0, W, H);
    physics();

    const cat = getCat();
    const bx = cat.cx + swayX;
    const by = cat.cy + swayY;

    drawShadow(bx, by, cat.r);
    drawTail(bx, by, cat.r);
    drawEar(bx, by, cat.r, -1);
    drawEar(bx, by, cat.r, 1);
    drawBody(bx, by, cat.r);
    drawFace(bx, by, cat.r);
    drawTitle();

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
})();
