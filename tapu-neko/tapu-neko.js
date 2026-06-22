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

  // Physics: position offset + squash/stretch
  let ox = 0, oy = 0, vx = 0, vy = 0;
  let scaleX = 1, scaleY = 1, svx = 0, svy = 0;
  let rotation = 0, rv = 0;

  let eyeSquint = 0, targetSquint = 0;
  let blushAlpha = 0, targetBlush = 0;
  let tailWag = 0;

  function getCat() {
    const r = Math.min(W, H) * 0.25;
    return { cx: W / 2, cy: H * 0.52, r };
  }

  function isInside(px, py) {
    const c = getCat();
    const dx = px - c.cx, dy = py - c.cy;
    return dx * dx + dy * dy < (c.r * 1.3) ** 2;
  }

  function poke(px, py) {
    const c = getCat();
    const dx = (px - c.cx) / c.r;
    const dy = (py - c.cy) / c.r;

    vx += dx * 2.5;
    vy += dy * 2.5;

    // Squash in the direction of the poke
    svx += Math.abs(dx) * 0.04 + 0.02;
    svy += Math.abs(dy) * 0.04 + 0.02;

    rv += dx * 0.02;

    targetSquint = 1;
    targetBlush = 1;
    setTimeout(() => { targetSquint = 0; }, 500);
    setTimeout(() => { targetBlush = 0; }, 1000);
  }

  let dragging = false, lastPX = 0, lastPY = 0;

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    dragging = true;
    lastPX = e.clientX;
    lastPY = e.clientY;
    if (isInside(e.clientX, e.clientY)) poke(e.clientX, e.clientY);
  });

  canvas.addEventListener('pointermove', (e) => {
    e.preventDefault();
    if (!dragging) return;
    if (isInside(e.clientX, e.clientY)) {
      const dx = e.clientX - lastPX;
      const dy = e.clientY - lastPY;
      const speed = Math.sqrt(dx * dx + dy * dy);
      if (speed > 2) {
        vx += dx * 0.06;
        vy += dy * 0.06;
        svx += speed * 0.001;
        svy += speed * 0.001;
        targetSquint = 0.5;
      }
    }
    lastPX = e.clientX;
    lastPY = e.clientY;
  });

  canvas.addEventListener('pointerup', () => {
    dragging = false;
    targetSquint = 0;
  });

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function physics() {
    // Position spring (bouncy return to center)
    vx -= ox * 0.05;
    vy -= oy * 0.05;
    vx *= 0.9;
    vy *= 0.9;
    ox = clamp(ox + vx, -50, 50);
    oy = clamp(oy + vy, -50, 50);

    // Scale spring (squash & stretch)
    svx -= (scaleX - 1) * 0.06;
    svy -= (scaleY - 1) * 0.06;
    // Coupling: when X stretches, Y squashes (volume preservation)
    const coupling = 0.3;
    svx -= (scaleY - 1) * 0.02 * coupling;
    svy -= (scaleX - 1) * 0.02 * coupling;
    svx *= 0.88;
    svy *= 0.88;
    scaleX = clamp(scaleX + svx, 0.8, 1.2);
    scaleY = clamp(scaleY + svy, 0.8, 1.2);

    // Rotation spring
    rv -= rotation * 0.06;
    rv *= 0.9;
    rotation = clamp(rotation + rv, -0.15, 0.15);

    eyeSquint += (targetSquint - eyeSquint) * 0.15;
    blushAlpha += (targetBlush - blushAlpha) * 0.08;
    tailWag += 0.05;
  }

  function drawShadow(cx, cy, r) {
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 1.05, r * 0.75 * scaleX, r * 0.06, 0, 0, Math.PI * 2);
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
    // Simple ellipse with squash/stretch - no wobble harmonics
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * scaleX, r * scaleY, rotation, 0, Math.PI * 2);
    ctx.closePath();

    const grad = ctx.createRadialGradient(
      cx - r * 0.15, cy - r * 0.25, r * 0.1,
      cx, cy, r
    );
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
