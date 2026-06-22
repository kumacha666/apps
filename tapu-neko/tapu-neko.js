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

  // Physics state
  let jx = 0, jy = 0, jvx = 0, jvy = 0;
  let sq = 0, sqv = 0;
  let wobbleAmp = 0, wobblePhase = 0;

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
    return dx * dx + dy * dy < (c.r * 1.2) ** 2;
  }

  function poke(px, py) {
    const c = getCat();
    const dx = (px - c.cx) / c.r;
    const dy = (py - c.cy) / c.r;
    jvx += dx * 3;
    jvy += dy * 3;
    sqv += 3;
    wobbleAmp = Math.min(wobbleAmp + 8, 20);

    targetSquint = 1;
    targetBlush = 1;
    setTimeout(() => { targetSquint = 0; }, 500);
    setTimeout(() => { targetBlush = 0; }, 1000);
  }

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (isInside(e.clientX, e.clientY)) poke(e.clientX, e.clientY);
  });

  let lastPX = 0, lastPY = 0, dragging = false;
  canvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    lastPX = e.clientX;
    lastPY = e.clientY;
  }, { capture: true });

  canvas.addEventListener('pointermove', (e) => {
    e.preventDefault();
    if (!dragging) return;
    if (isInside(e.clientX, e.clientY)) {
      const dx = e.clientX - lastPX;
      const dy = e.clientY - lastPY;
      const speed = Math.sqrt(dx * dx + dy * dy);
      if (speed > 2) {
        jvx += dx * 0.08;
        jvy += dy * 0.08;
        wobbleAmp = Math.min(wobbleAmp + speed * 0.15, 20);
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

  function clamp(v, min, max) { return v < min ? min : v > max ? max : v; }

  function physics() {
    jvx -= jx * 0.06;
    jvy -= jy * 0.06;
    jvx *= 0.9;
    jvy *= 0.9;
    jx += jvx;
    jy += jvy;
    jx = clamp(jx, -40, 40);
    jy = clamp(jy, -40, 40);

    sqv -= sq * 0.08;
    sqv *= 0.87;
    sq += sqv;
    sq = clamp(sq, -15, 15);

    wobbleAmp *= 0.92;
    wobblePhase += 0.15;

    eyeSquint += (targetSquint - eyeSquint) * 0.15;
    blushAlpha += (targetBlush - blushAlpha) * 0.08;
    tailWag += 0.05;
  }

  function drawShadow(cx, cy, r) {
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 1.05, r * 0.75, r * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawTail(cx, cy, r) {
    const bx = cx + r * 0.8;
    const by = cy + r * 0.15;
    ctx.strokeStyle = '#f0a860';
    ctx.lineWidth = r * 0.09;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.bezierCurveTo(
      bx + r * 0.35, by - r * 0.25,
      bx + r * 0.45, by - r * 0.7 + Math.sin(tailWag) * r * 0.1,
      bx + r * 0.25, by - r * 0.85 + Math.sin(tailWag + 0.8) * r * 0.15
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

    // Inner ear
    ctx.beginPath();
    ctx.moveTo(earCx - earW * 0.55, earCy - earH * 0.05);
    ctx.quadraticCurveTo(tipX, tipY + earH * 0.25, earCx + earW * 0.55, earCy - earH * 0.05);
    ctx.closePath();
    ctx.fillStyle = '#ffb8b8';
    ctx.fill();
  }

  function drawBody(cx, cy, r) {
    const scaleX = 1 + sq * 0.006;
    const scaleY = 1 - sq * 0.005;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scaleX, scaleY);

    const segments = 64;
    ctx.beginPath();
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const wobble = Math.sin(a * 3 + wobblePhase) * wobbleAmp
                   + Math.sin(a * 5 + wobblePhase * 1.3) * wobbleAmp * 0.5;
      const rr = r + wobble * 0.15;
      const x = Math.cos(a) * rr;
      const y = Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
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
    // Blush
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

    // Eyes
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

    // Eye highlights
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

    // Nose
    const noseY = cy + r * 0.07;
    ctx.fillStyle = '#e8907a';
    ctx.beginPath();
    ctx.moveTo(cx, noseY - r * 0.02);
    ctx.lineTo(cx - r * 0.035, noseY + r * 0.02);
    ctx.lineTo(cx + r * 0.035, noseY + r * 0.02);
    ctx.closePath();
    ctx.fill();

    // Mouth
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

    // Whiskers
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
    const bx = cat.cx + jx;
    const by = cat.cy + jy;

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
