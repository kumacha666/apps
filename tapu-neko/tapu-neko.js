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

  // Local deformations - each is a dent/bulge at a specific angle
  const dents = [];
  const MAX_DENTS = 12;

  class Dent {
    constructor(angle, depth) {
      this.angle = angle;
      this.depth = depth;
      this.vel = 0;
      this.width = 0.8; // gaussian spread in radians
      this.dead = false;
    }
    update() {
      // Spring back to 0 - soft and wobbly
      this.vel -= this.depth * 0.045;
      this.vel *= 0.93;
      this.depth += this.vel;
      if (Math.abs(this.depth) < 0.1 && Math.abs(this.vel) < 0.1) {
        this.dead = true;
      }
    }
  }

  // Overall body sway (subtle)
  let swayX = 0, swayY = 0, swayVX = 0, swayVY = 0;

  // Face
  let eyeSquint = 0, targetSquint = 0;
  let blushAlpha = 0, targetBlush = 0;
  let tailWag = 0;

  // Drag state
  let dragging = false, dragInside = false;
  let dragStartX = 0, dragStartY = 0, dragX = 0, dragY = 0;
  let dragAngle = 0;

  // Device motion
  let motionInited = false;
  let accelX = 0, accelY = 0;

  function angleTo(px, py) {
    const c = getCat();
    return Math.atan2(py - (c.cy + swayY), px - (c.cx + swayX));
  }

  function distTo(px, py) {
    const c = getCat();
    const dx = px - (c.cx + swayX), dy = py - (c.cy + swayY);
    return Math.sqrt(dx * dx + dy * dy);
  }

  function isInside(px, py) {
    return distTo(px, py) < getCat().r * 1.3;
  }

  function addDent(angle, depth) {
    if (dents.length >= MAX_DENTS) {
      dents.shift();
    }
    dents.push(new Dent(angle, depth));
  }

  function pokeAt(px, py, strength) {
    const angle = angleTo(px, py);
    const dist = distTo(px, py);
    const c = getCat();
    const normalizedDist = Math.min(dist / c.r, 1.2);
    const depthScale = strength * (0.5 + normalizedDist * 0.5);
    addDent(angle, -c.r * 0.18 * depthScale);

    // Subtle sway away from poke
    swayVX += Math.cos(angle) * 0.8 * strength;
    swayVY += Math.sin(angle) * 0.8 * strength;

    targetSquint = Math.min(strength, 1);
    targetBlush = Math.min(strength, 1);
    setTimeout(() => { targetSquint = 0; }, 400);
    setTimeout(() => { targetBlush = 0; }, 800);
  }

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    dragging = true;
    dragStartX = dragX = e.clientX;
    dragStartY = dragY = e.clientY;
    dragInside = isInside(e.clientX, e.clientY);
    if (dragInside) {
      dragAngle = angleTo(e.clientX, e.clientY);
      pokeAt(e.clientX, e.clientY, 1);
    }
    initMotion();
  });

  canvas.addEventListener('pointermove', (e) => {
    e.preventDefault();
    if (!dragging) return;
    dragX = e.clientX;
    dragY = e.clientY;
    if (dragInside) {
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;
      const speed = Math.sqrt(dx * dx + dy * dy);
      if (speed > 5) {
        targetSquint = 0.5;
      }
    }
  });

  canvas.addEventListener('pointerup', (e) => {
    e.preventDefault();
    if (dragging && dragInside) {
      const dx = dragX - dragStartX;
      const dy = dragY - dragStartY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 15) {
        // Release stretch -> bounce back creates ripple dents
        const angle = Math.atan2(dy, dx);
        const c = getCat();
        const strength = Math.min(dist / c.r, 1.5);
        addDent(angle, c.r * 0.2 * strength);
        addDent(angle + Math.PI, -c.r * 0.12 * strength);
        swayVX += dx * 0.06;
        swayVY += dy * 0.06;
        pokeAt(dragX, dragY, strength);
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

      // Tilt -> gentle sway force
      accelX = ax;
      accelY = ay;

      // Shake detection
      const jerk = Math.abs(ax - prevAx) + Math.abs(ay - prevAy) + Math.abs(az - prevAz);
      if (jerk > 12) {
        const shakeAngle = Math.atan2(ay - prevAy, ax - prevAx);
        const shakeStrength = Math.min(jerk / 20, 2);
        addDent(shakeAngle, -getCat().r * 0.12 * shakeStrength);
        addDent(shakeAngle + Math.PI * 0.7, -getCat().r * 0.08 * shakeStrength);
        swayVX += (ax - prevAx) * 0.4;
        swayVY -= (ay - prevAy) * 0.4;
        targetSquint = Math.min(shakeStrength * 0.5, 1);
        targetBlush = Math.min(shakeStrength * 0.3, 1);
        setTimeout(() => { targetSquint = 0; targetBlush = 0; }, 300);
      }
      prevAx = ax; prevAy = ay; prevAz = az;
    }, { passive: true });
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function physics() {
    // Update dents
    for (let i = dents.length - 1; i >= 0; i--) {
      dents[i].update();
      if (dents[i].dead) dents.splice(i, 1);
    }

    // Tilt force
    swayVX += accelX * 0.06;
    swayVY -= accelY * 0.06;

    // Sway spring
    swayVX -= swayX * 0.03;
    swayVY -= swayY * 0.03;
    swayVX *= 0.93;
    swayVY *= 0.93;
    swayX = clamp(swayX + swayVX, -50, 50);
    swayY = clamp(swayY + swayVY, -50, 50);

    eyeSquint += (targetSquint - eyeSquint) * 0.15;
    blushAlpha += (targetBlush - blushAlpha) * 0.08;
    tailWag += 0.05;
  }

  // Get deformation at a given angle
  function getDeformAt(angle) {
    let d = 0;
    for (const dent of dents) {
      let diff = angle - dent.angle;
      // Wrap to [-PI, PI]
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const gaussian = Math.exp(-(diff * diff) / (2 * dent.width * dent.width));
      d += dent.depth * gaussian;
    }
    return d;
  }

  // Live drag stretch
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
    const strength = Math.min(dist / c.r, 0.8);
    const gaussian = Math.exp(-(diff * diff) / (2 * 0.5 * 0.5));
    // Stretch in pull direction, compress opposite
    const stretch = gaussian * strength * c.r * 0.4;

    let oppDiff = angle - (pullAngle + Math.PI);
    while (oppDiff > Math.PI) oppDiff -= Math.PI * 2;
    while (oppDiff < -Math.PI) oppDiff += Math.PI * 2;
    const compress = Math.exp(-(oppDiff * oppDiff) / (2 * 0.7 * 0.7)) * strength * c.r * -0.1;

    return stretch + compress;
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
    const earW = r * 0.22;
    const earH = r * 0.32;
    const earCx = cx + side * r * 0.42;
    const earCy = cy - r * 0.78;
    const tipX = earCx + side * earW * 0.25;
    const tipY = earCy - earH;

    ctx.beginPath();
    ctx.moveTo(earCx - earW, earCy);
    ctx.quadraticCurveTo(tipX - side * earW * 0.1, tipY, tipX, tipY);
    ctx.quadraticCurveTo(tipX + side * earW * 0.4, tipY + earH * 0.3, earCx + earW, earCy);
    ctx.closePath();
    ctx.fillStyle = '#ffd4a8';
    ctx.fill();
    ctx.strokeStyle = '#d4915a';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(earCx - earW * 0.55, earCy - earH * 0.05);
    ctx.quadraticCurveTo(tipX, tipY + earH * 0.25, earCx + earW * 0.55, earCy - earH * 0.05);
    ctx.closePath();
    ctx.fillStyle = '#ffb8b8';
    ctx.fill();
  }

  function drawBody(cx, cy, r) {
    const segments = 80;
    ctx.beginPath();
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const deform = getDeformAt(a) + getDragDeform(a);
      const rr = r + clamp(deform, -r * 0.35, r * 0.5);
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
