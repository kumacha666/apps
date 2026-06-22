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

  // Physics
  let ox = 0, oy = 0, vx = 0, vy = 0;
  let scaleX = 1, scaleY = 1, svx = 0, svy = 0;
  let rot = 0, rv = 0;

  // Drag stretch
  let dragging = false, dragInside = false;
  let dragStartX = 0, dragStartY = 0;
  let dragX = 0, dragY = 0;
  let stretchX = 0, stretchY = 0;

  // Face
  let eyeSquint = 0, targetSquint = 0;
  let blushAlpha = 0, targetBlush = 0;
  let tailWag = 0;

  // Device motion
  let accelX = 0, accelY = 0;
  let shakeAccum = 0;
  let motionPermission = false;

  function getCat() {
    const r = Math.min(W, H) * 0.25;
    return { cx: W / 2, cy: H * 0.52, r };
  }

  function isInside(px, py) {
    const c = getCat();
    const dx = px - (c.cx + ox), dy = py - (c.cy + oy);
    return dx * dx + dy * dy < (c.r * 1.3) ** 2;
  }

  function poke(strength) {
    svx += 0.06 * strength;
    svy -= 0.04 * strength;
    rv += (Math.random() - 0.5) * 0.03 * strength;

    targetSquint = 1;
    targetBlush = 1;
    setTimeout(() => { targetSquint = 0; }, 500);
    setTimeout(() => { targetBlush = 0; }, 1000);
  }

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    dragging = true;
    dragStartX = dragX = e.clientX;
    dragStartY = dragY = e.clientY;
    dragInside = isInside(e.clientX, e.clientY);
    if (dragInside) poke(1);
    requestMotionPermission();
  });

  canvas.addEventListener('pointermove', (e) => {
    e.preventDefault();
    if (!dragging) return;
    dragX = e.clientX;
    dragY = e.clientY;
  });

  canvas.addEventListener('pointerup', (e) => {
    e.preventDefault();
    if (dragging && dragInside) {
      const dx = dragX - dragStartX;
      const dy = dragY - dragStartY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 10) {
        vx += dx * 0.12;
        vy += dy * 0.12;
        svx += Math.abs(dx) * 0.002;
        svy += Math.abs(dy) * 0.002;
        rv += dx * 0.0008;
        poke(Math.min(dist / 50, 2));
      }
    }
    dragging = false;
    dragInside = false;
    stretchX = 0;
    stretchY = 0;
  });

  // Device motion
  function requestMotionPermission() {
    if (motionPermission) return;
    if (typeof DeviceMotionEvent !== 'undefined' &&
        typeof DeviceMotionEvent.requestPermission === 'function') {
      DeviceMotionEvent.requestPermission().then((state) => {
        if (state === 'granted') setupMotion();
      }).catch(() => {});
    } else {
      setupMotion();
    }
    motionPermission = true;
  }

  function setupMotion() {
    let lastAx = 0, lastAy = 0, lastAz = 0;
    window.addEventListener('devicemotion', (e) => {
      const a = e.accelerationIncludingGravity;
      if (!a) return;

      // Tilt: use gravity component
      accelX = (a.x || 0) * 0.3;
      accelY = (a.y || 0) * -0.3;

      // Shake detection
      const dx = Math.abs((a.x || 0) - lastAx);
      const dy = Math.abs((a.y || 0) - lastAy);
      const dz = Math.abs((a.z || 0) - lastAz);
      const jerk = dx + dy + dz;
      if (jerk > 15) {
        shakeAccum = Math.min(shakeAccum + jerk * 0.5, 30);
      }
      lastAx = a.x || 0;
      lastAy = a.y || 0;
      lastAz = a.z || 0;
    });
  }

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function physics() {
    // Apply device tilt as gentle force
    vx += accelX * 0.08;
    vy += accelY * 0.08;

    // Apply shake
    if (shakeAccum > 1) {
      svx += shakeAccum * 0.003;
      svy += shakeAccum * 0.002;
      rv += (Math.random() - 0.5) * shakeAccum * 0.003;
      shakeAccum *= 0.85;
    }

    // Compute live stretch from drag
    if (dragging && dragInside) {
      const c = getCat();
      stretchX = (dragX - dragStartX) / c.r;
      stretchY = (dragY - dragStartY) / c.r;
    }

    // Position spring - softer for more wobble
    vx -= ox * 0.035;
    vy -= oy * 0.035;
    vx *= 0.92;
    vy *= 0.92;
    ox = clamp(ox + vx, -80, 80);
    oy = clamp(oy + vy, -80, 80);

    // Scale spring - softer, more oscillation
    svx -= (scaleX - 1) * 0.04;
    svy -= (scaleY - 1) * 0.04;
    // Volume preservation coupling
    svx -= (scaleY - 1) * 0.015;
    svy -= (scaleX - 1) * 0.015;
    svx *= 0.92;
    svy *= 0.92;
    scaleX = clamp(scaleX + svx, 0.7, 1.35);
    scaleY = clamp(scaleY + svy, 0.7, 1.35);

    // Rotation spring
    rv -= rot * 0.04;
    rv *= 0.92;
    rot = clamp(rot + rv, -0.2, 0.2);

    eyeSquint += (targetSquint - eyeSquint) * 0.12;
    blushAlpha += (targetBlush - blushAlpha) * 0.06;
    tailWag += 0.05;
  }

  function drawShadow(cx, cy, r) {
    const sw = r * 0.75 * scaleX;
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 1.05, sw, r * 0.06, 0, 0, Math.PI * 2);
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
    // Live stretch from drag
    const sx = scaleX + Math.abs(stretchX) * 0.15;
    const sy = scaleY + Math.abs(stretchY) * 0.15;
    // Volume compensation: if stretching X, squash Y
    const volSx = sx * (1 / Math.sqrt(1 + Math.abs(stretchY) * 0.15));
    const volSy = sy * (1 / Math.sqrt(1 + Math.abs(stretchX) * 0.15));

    const pullX = stretchX * r * 0.35;
    const pullY = stretchY * r * 0.35;

    ctx.save();
    ctx.translate(cx + pullX * 0.5, cy + pullY * 0.5);
    ctx.rotate(rot);
    ctx.scale(volSx, volSy);

    ctx.beginPath();
    ctx.ellipse(0, 0, r, r, 0, 0, Math.PI * 2);
    ctx.closePath();

    const grad = ctx.createRadialGradient(-r * 0.15, -r * 0.25, r * 0.1, 0, 0, r);
    grad.addColorStop(0, '#fff5ee');
    grad.addColorStop(0.5, '#ffd4a8');
    grad.addColorStop(1, '#f0a860');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = '#d4915a';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.restore();
  }

  function drawFace(cx, cy, r) {
    const pullX = stretchX * r * 0.35 * 0.5;
    const pullY = stretchY * r * 0.35 * 0.5;
    const fx = cx + pullX;
    const fy = cy + pullY;

    if (blushAlpha > 0.01) {
      ctx.globalAlpha = blushAlpha * 0.4;
      ctx.fillStyle = '#ff9999';
      ctx.beginPath();
      ctx.ellipse(fx - r * 0.35, fy + r * 0.15, r * 0.12, r * 0.07, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(fx + r * 0.35, fy + r * 0.15, r * 0.12, r * 0.07, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    const eyeSpacing = r * 0.22;
    const eyeY = fy - r * 0.08;
    const eyeRx = r * 0.09;
    const eyeRy = r * 0.11 * Math.max(0.25, 1 - eyeSquint * 0.75);

    ctx.fillStyle = '#3a2a1a';
    ctx.beginPath();
    ctx.ellipse(fx - eyeSpacing, eyeY, eyeRx, eyeRy, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(fx + eyeSpacing, eyeY, eyeRx, eyeRy, 0, 0, Math.PI * 2);
    ctx.fill();

    if (eyeSquint < 0.5) {
      ctx.fillStyle = '#fff';
      const hl = eyeRx * 0.35;
      ctx.beginPath();
      ctx.ellipse(fx - eyeSpacing + eyeRx * 0.25, eyeY - eyeRy * 0.2, hl, hl, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(fx + eyeSpacing + eyeRx * 0.25, eyeY - eyeRy * 0.2, hl, hl, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    const noseY = fy + r * 0.07;
    ctx.fillStyle = '#e8907a';
    ctx.beginPath();
    ctx.moveTo(fx, noseY - r * 0.02);
    ctx.lineTo(fx - r * 0.035, noseY + r * 0.02);
    ctx.lineTo(fx + r * 0.035, noseY + r * 0.02);
    ctx.closePath();
    ctx.fill();

    const mouthY = noseY + r * 0.035;
    ctx.strokeStyle = '#c8885a';
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(fx, mouthY);
    ctx.quadraticCurveTo(fx - r * 0.05, mouthY + r * 0.04, fx - r * 0.09, mouthY + r * 0.015);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(fx, mouthY);
    ctx.quadraticCurveTo(fx + r * 0.05, mouthY + r * 0.04, fx + r * 0.09, mouthY + r * 0.015);
    ctx.stroke();

    ctx.strokeStyle = '#c8a080';
    ctx.lineWidth = 1.5;
    for (let side = -1; side <= 1; side += 2) {
      for (let i = -1; i <= 1; i++) {
        const wy = fy + r * 0.12 + i * r * 0.04;
        ctx.beginPath();
        ctx.moveTo(fx + side * r * 0.13, wy);
        ctx.lineTo(fx + side * r * 0.5, wy + i * r * 0.025);
        ctx.stroke();
      }
    }
  }

  function drawTitle() {
    ctx.fillStyle = '#d4915a';
    ctx.font = `bold ${Math.min(W, H) * 0.065}px -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('たぷネコ', W / 2, H * 0.04);

    ctx.fillStyle = '#c8a080';
    ctx.font = `${Math.min(W, H) * 0.028}px -apple-system, sans-serif`;
    ctx.fillText('タップしてたぷたぷしよう！', W / 2, H * 0.04 + Math.min(W, H) * 0.085);
  }

  function loop() {
    ctx.clearRect(0, 0, W, H);
    physics();

    const cat = getCat();
    const bx = cat.cx + ox;
    const by = cat.cy + oy;

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
