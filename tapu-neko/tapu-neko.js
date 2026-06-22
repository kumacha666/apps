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
    const r = Math.min(W, H) * 0.22;
    return { cx: W / 2, cy: H * 0.50, r };
  }

  // Cat silhouette: slightly taller than wide, rounded bottom, narrower top
  function catRadius(angle, baseR) {
    // angle: 0=right, PI/2=bottom, PI=left, -PI/2=top
    const s = Math.sin(angle);
    const c = Math.cos(angle);

    // Vertical stretch (taller than wide)
    const vertStretch = 1.15;
    // Bottom is rounder/wider, top narrows
    const pearFactor = 1 + s * 0.12;
    // Slight horizontal width at belly
    const bellyBulge = 1 + Math.max(0, s * 0.05) * Math.abs(c);

    // Compute radius in ellipse terms then apply pear
    const ex = baseR * pearFactor * bellyBulge;
    const ey = baseR * vertStretch * pearFactor;
    // Ellipse radius at angle
    const ellipseR = (ex * ey) / Math.sqrt((ey * c) ** 2 + (ex * s) ** 2);

    return ellipseR;
  }

  // Local deformations
  const dents = [];
  const MAX_DENTS = 20;

  class Dent {
    constructor(angle, depth, width) {
      this.angle = angle;
      this.depth = depth;
      this.vel = 0;
      this.width = width || 0.6;
      this.dead = false;
    }
    update() {
      this.vel -= this.depth * 0.032;
      this.vel *= 0.945;
      this.depth += this.vel;
      if (Math.abs(this.depth) < 0.08 && Math.abs(this.vel) < 0.04) {
        this.dead = true;
      }
    }
  }

  // Tilt deformation (not position sway - shape deformation!)
  let tiltX = 0, tiltY = 0;
  let tiltVX = 0, tiltVY = 0;

  let pinchScale = 1, pinchVel = 0;
  let pinching = false;
  let pinchStartDist = 0, pinchLiveDist = 0;

  let eyeSquint = 0, targetSquint = 0;
  let blushAlpha = 0, targetBlush = 0;
  let tailWag = 0;

  let dragging = false, dragInside = false;
  let dragStartX = 0, dragStartY = 0, dragX = 0, dragY = 0;

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
    const c = getCat();
    const angle = angleTo(px, py);
    return distTo(px, py) < catRadius(angle, c.r) * 1.3;
  }

  function addDent(angle, depth, width) {
    if (dents.length >= MAX_DENTS) dents.shift();
    dents.push(new Dent(angle, depth, width));
  }

  function pokeAt(px, py, strength) {
    const angle = angleTo(px, py);
    const c = getCat();
    addDent(angle, -c.r * 0.28 * strength, 0.55);
    addDent(angle + 0.7, c.r * 0.07 * strength, 0.4);
    addDent(angle - 0.7, c.r * 0.07 * strength, 0.4);

    targetSquint = Math.min(strength, 1);
    targetBlush = Math.min(strength, 1);
    setTimeout(() => { targetSquint = 0; }, 400);
    setTimeout(() => { targetBlush = 0; }, 800);
  }

  const activeTouches = new Map();

  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      activeTouches.set(t.identifier, { x: t.clientX, y: t.clientY });
    }
    if (activeTouches.size >= 2) {
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
      const ex = activeTouches.get(t.identifier);
      if (ex) { ex.x = t.clientX; ex.y = t.clientY; }
    }
    if (pinching && activeTouches.size >= 2) {
      const pts = [...activeTouches.values()];
      const dx = pts[0].x - pts[1].x, dy = pts[0].y - pts[1].y;
      pinchLiveDist = Math.sqrt(dx * dx + dy * dy);
    } else if (dragging) {
      dragX = e.changedTouches[0].clientX;
      dragY = e.changedTouches[0].clientY;
      if (dragInside) targetSquint = 0.4;
    }
  }, { passive: false });

  canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) activeTouches.delete(t.identifier);

    if (pinching && activeTouches.size < 2) {
      const ratio = pinchStartDist > 0 ? pinchLiveDist / pinchStartDist : 1;
      pinchVel += (ratio - 1) * 0.15;
      pinching = false;
      targetSquint = 0;
    }
    if (activeTouches.size === 0) {
      if (dragging && dragInside) {
        const dx = dragX - dragStartX, dy = dragY - dragStartY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 15) {
          const angle = Math.atan2(dy, dx);
          const c = getCat();
          const strength = Math.min(dist / c.r, 2.0);
          addDent(angle, c.r * 0.35 * strength, 0.55);
          addDent(angle + Math.PI, -c.r * 0.12 * strength, 0.7);
          addDent(angle + 0.5, c.r * 0.1 * strength, 0.4);
          addDent(angle - 0.5, c.r * 0.1 * strength, 0.4);
          targetSquint = 1;
          targetBlush = 1;
          setTimeout(() => { targetSquint = 0; }, 500);
          setTimeout(() => { targetBlush = 0; }, 900);
        }
      }
      dragging = false;
      dragInside = false;
      targetSquint = 0;
    }
  }, { passive: false });

  // Mouse fallback
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
      const dx = dragX - dragStartX, dy = dragY - dragStartY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 15) {
        const angle = Math.atan2(dy, dx);
        const c = getCat();
        const strength = Math.min(dist / c.r, 2.0);
        addDent(angle, c.r * 0.35 * strength, 0.55);
        addDent(angle + Math.PI, -c.r * 0.12 * strength, 0.7);
        addDent(angle + 0.5, c.r * 0.1 * strength, 0.4);
        addDent(angle - 0.5, c.r * 0.1 * strength, 0.4);
        targetSquint = 1; targetBlush = 1;
        setTimeout(() => { targetSquint = 0; }, 500);
        setTimeout(() => { targetBlush = 0; }, 900);
      }
    }
    dragging = false; dragInside = false; targetSquint = 0;
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

      // Strong tilt response
      accelX = ax;
      accelY = ay;

      // Shake
      const jerk = Math.abs(ax - prevAx) + Math.abs(ay - prevAy) + Math.abs(az - prevAz);
      if (jerk > 10) {
        const shakeAngle = Math.atan2(ay - prevAy, ax - prevAx);
        const shakeStr = Math.min(jerk / 15, 2.5);
        addDent(shakeAngle, -getCat().r * 0.2 * shakeStr, 0.7);
        addDent(shakeAngle + Math.PI * 0.6, -getCat().r * 0.12 * shakeStr, 0.6);
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

    pinchVel -= (pinchScale - 1) * 0.05;
    pinchVel *= 0.9;
    pinchScale = clamp(pinchScale + pinchVel, 0.7, 1.5);

    // Tilt -> deformation (water balloon feel)
    const tiltTargetX = -accelX * 0.6;
    const tiltTargetY = accelY * 0.6;
    tiltVX += (tiltTargetX - tiltX) * 0.04;
    tiltVY += (tiltTargetY - tiltY) * 0.04;
    tiltVX *= 0.88;
    tiltVY *= 0.88;
    tiltX += tiltVX;
    tiltY += tiltVY;

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

  // Drag: body surface pulled toward finger, with wide rounded spread
  function getDragPoint(angle, cx, cy, baseR) {
    if (!dragging || !dragInside) return null;
    const dx = dragX - dragStartX, dy = dragY - dragStartY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 3) return null;

    const grabAngle = angleTo(dragStartX, dragStartY);
    const dragAngle = Math.atan2(dy, dx);
    let outwardCheck = dragAngle - grabAngle;
    while (outwardCheck > Math.PI) outwardCheck -= Math.PI * 2;
    while (outwardCheck < -Math.PI) outwardCheck += Math.PI * 2;
    const outwardFactor = Math.max(0, Math.cos(outwardCheck));
    if (outwardFactor < 0.05) return null;

    let diff = angle - grabAngle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;

    // Wide spread for round bulge
    const spread = 0.8;
    const rawInfluence = Math.exp(-(diff * diff) / (2 * spread * spread)) * outwardFactor;
    if (rawInfluence < 0.001) return null;

    const bx = cx + Math.cos(angle) * baseR;
    const by = cy + Math.sin(angle) * baseR;

    // Pow 0.4 makes the bulge very round (flat top, steep sides)
    const influence = Math.pow(rawInfluence, 0.4) * rawInfluence;
    const px = bx + (dragX - bx) * influence;
    const py = by + (dragY - by) * influence;

    return { x: px, y: py };
  }

  // Get the deformed body surface point at a given angle
  function getBodySurfacePoint(angle, cx, cy, r) {
    const baseR = catRadius(angle, r) * pinchScale;
    const pinchD = getPinchDeform();
    const deform = getDeformAt(angle) + pinchD + getTiltDeform(angle);
    const rr = Math.max(baseR * 0.4, baseR + deform);
    let x = cx + Math.cos(angle) * rr;
    let y = cy + Math.sin(angle) * rr;
    const dragPt = getDragPoint(angle, cx, cy, rr);
    if (dragPt) { x = dragPt.x; y = dragPt.y; }
    return { x, y };
  }

  function getPinchDeform() {
    if (!pinching || pinchStartDist < 10) return 0;
    const ratio = pinchLiveDist / pinchStartDist;
    return (ratio - 1) * getCat().r * 0.5;
  }

  // Tilt deformation: shifts weight like water in a balloon
  function getTiltDeform(angle) {
    const mag = Math.sqrt(tiltX * tiltX + tiltY * tiltY);
    if (mag < 0.1) return 0;
    const tiltAngle = Math.atan2(tiltY, tiltX);
    let diff = angle - tiltAngle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const c = getCat();
    // Bulge toward tilt direction, compress opposite
    const bulge = Math.cos(diff) * mag * c.r * 0.08;
    return bulge;
  }

  function drawShadow(cx, cy, r) {
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 1.2, r * 0.7, r * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawTail(cx, cy, r) {
    // Attach tail to body surface at ~-0.6 rad (upper right)
    const tailAngle = -0.5;
    const sp = getBodySurfacePoint(tailAngle, cx, cy, r);
    const bx = sp.x;
    const by = sp.y;
    ctx.strokeStyle = '#f0a860';
    ctx.lineWidth = r * 0.08;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.bezierCurveTo(
      bx + r * 0.4, by - r * 0.15,
      bx + r * 0.5, by - r * 0.55 + Math.sin(tailWag) * r * 0.1,
      bx + r * 0.3, by - r * 0.7 + Math.sin(tailWag + 0.8) * r * 0.15
    );
    ctx.stroke();
  }

  function drawEar(cx, cy, r, side) {
    // Attach ears to body surface at top
    const earAngle = -Math.PI / 2 + side * 0.45;
    const sp = getBodySurfacePoint(earAngle, cx, cy, r);

    const earW = r * 0.18;
    const earH = r * 0.28;
    const baseX = sp.x;
    const baseY = sp.y;
    const tipX = baseX + side * earW * 0.3;
    const tipY = baseY - earH;

    ctx.beginPath();
    ctx.moveTo(baseX - side * earW * 0.1, baseY);
    ctx.quadraticCurveTo(baseX - side * earW * 0.15, tipY + earH * 0.3, tipX, tipY);
    ctx.quadraticCurveTo(baseX + side * earW * 0.8, tipY + earH * 0.3, baseX + side * earW * 0.55, baseY);
    ctx.closePath();
    ctx.fillStyle = '#ffd4a8';
    ctx.fill();
    ctx.strokeStyle = '#d4915a';
    ctx.lineWidth = 2;
    ctx.stroke();

    const innerBaseX = baseX + side * earW * 0.22;
    const innerBaseY = baseY - earH * 0.05;
    ctx.beginPath();
    ctx.moveTo(innerBaseX - side * earW * 0.03, innerBaseY);
    ctx.quadraticCurveTo(innerBaseX - side * earW * 0.08, tipY + earH * 0.35, tipX, tipY + earH * 0.22);
    ctx.quadraticCurveTo(innerBaseX + side * earW * 0.35, tipY + earH * 0.35, innerBaseX + side * earW * 0.25, innerBaseY);
    ctx.closePath();
    ctx.fillStyle = '#ffb8b8';
    ctx.fill();
  }

  function drawPaws(cx, cy, r) {
    // Attach paws to body surface at bottom
    const lpaw = getBodySurfacePoint(Math.PI / 2 - 0.3, cx, cy, r);
    const rpaw = getBodySurfacePoint(Math.PI / 2 + 0.3, cx, cy, r);
    const pawR = r * 0.08;
    ctx.fillStyle = '#f0a860';
    ctx.beginPath();
    ctx.ellipse(lpaw.x, lpaw.y, pawR * 1.2, pawR, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(rpaw.x, rpaw.y, pawR * 1.2, pawR, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawBody(cx, cy, r) {
    const liveScale = pinchScale;
    const pinchD = getPinchDeform();
    const segments = 100;
    ctx.beginPath();
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const baseR = catRadius(a, r) * liveScale;
      const deform = getDeformAt(a) + pinchD + getTiltDeform(a);
      const rr = Math.max(baseR * 0.4, baseR + deform);
      let x = cx + Math.cos(a) * rr;
      let y = cy + Math.sin(a) * rr;

      // Apply drag pull (point-based, stretches to finger)
      const dragPt = getDragPoint(a, cx, cy, rr);
      if (dragPt) { x = dragPt.x; y = dragPt.y; }

      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();

    const grad = ctx.createRadialGradient(cx - r * 0.12, cy - r * 0.25, r * 0.1, cx, cy + r * 0.15, r * 1.2);
    grad.addColorStop(0, '#fff5ee');
    grad.addColorStop(0.4, '#ffd4a8');
    grad.addColorStop(1, '#eda555');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = '#d4915a';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  function drawFace(cx, cy, r) {
    const fy = cy - r * 0.12;

    if (blushAlpha > 0.01) {
      ctx.globalAlpha = blushAlpha * 0.4;
      ctx.fillStyle = '#ff9999';
      ctx.beginPath();
      ctx.ellipse(cx - r * 0.33, fy + r * 0.2, r * 0.11, r * 0.065, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx + r * 0.33, fy + r * 0.2, r * 0.11, r * 0.065, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    const eyeSpacing = r * 0.2;
    const eyeY = fy;
    const eyeRx = r * 0.085;
    const eyeRy = r * 0.1 * Math.max(0.25, 1 - eyeSquint * 0.75);

    ctx.fillStyle = '#3a2a1a';
    ctx.beginPath();
    ctx.ellipse(cx - eyeSpacing, eyeY, eyeRx, eyeRy, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + eyeSpacing, eyeY, eyeRx, eyeRy, 0, 0, Math.PI * 2);
    ctx.fill();

    if (eyeSquint < 0.5) {
      ctx.fillStyle = '#fff';
      const hl = eyeRx * 0.38;
      ctx.beginPath();
      ctx.ellipse(cx - eyeSpacing + eyeRx * 0.25, eyeY - eyeRy * 0.22, hl, hl, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx + eyeSpacing + eyeRx * 0.25, eyeY - eyeRy * 0.22, hl, hl, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    const noseY = fy + r * 0.12;
    ctx.fillStyle = '#e8907a';
    ctx.beginPath();
    ctx.ellipse(cx, noseY, r * 0.03, r * 0.02, 0, 0, Math.PI * 2);
    ctx.fill();

    const mouthY = noseY + r * 0.03;
    ctx.strokeStyle = '#c8885a';
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, mouthY);
    ctx.quadraticCurveTo(cx - r * 0.04, mouthY + r * 0.035, cx - r * 0.08, mouthY + r * 0.01);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, mouthY);
    ctx.quadraticCurveTo(cx + r * 0.04, mouthY + r * 0.035, cx + r * 0.08, mouthY + r * 0.01);
    ctx.stroke();

    ctx.strokeStyle = '#c8a080';
    ctx.lineWidth = 1.3;
    for (let side = -1; side <= 1; side += 2) {
      for (let i = -1; i <= 1; i++) {
        const wy = fy + r * 0.16 + i * r * 0.035;
        ctx.beginPath();
        ctx.moveTo(cx + side * r * 0.12, wy);
        ctx.lineTo(cx + side * r * 0.45, wy + i * r * 0.02);
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

    ctx.fillStyle = '#d4c0a0';
    ctx.font = `${Math.min(W, H) * 0.018}px -apple-system, sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillText('v2025.06.22d', W - 10, H - 10);
    ctx.textAlign = 'center';
  }

  function loop() {
    ctx.clearRect(0, 0, W, H);
    physics();

    const cat = getCat();

    drawShadow(cat.cx, cat.cy, cat.r);
    drawTail(cat.cx, cat.cy, cat.r);
    drawPaws(cat.cx, cat.cy, cat.r);
    drawEar(cat.cx, cat.cy, cat.r, -1);
    drawEar(cat.cx, cat.cy, cat.r, 1);
    drawBody(cat.cx, cat.cy, cat.r);
    drawFace(cat.cx, cat.cy, cat.r);
    drawTitle();

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
})();
