(() => {
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');

  let W, H, dpr;

  function resize() {
    dpr = devicePixelRatio;
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  // Jiggle physics - simple spring model
  const jiggle = { x: 0, y: 0, vx: 0, vy: 0 };
  const squash = { v: 0, val: 0 }; // squash & stretch
  const wobbles = []; // multiple wobble harmonics
  for (let i = 0; i < 4; i++) {
    wobbles.push({ phase: 0, amp: 0, freq: 3 + i * 1.5, decay: 0.92 - i * 0.02 });
  }

  let eyeSquint = 0, targetSquint = 0;
  let blushAlpha = 0, targetBlush = 0;
  let tailWag = 0;

  // Interaction
  let pointerDown = false;
  let pointerX = 0, pointerY = 0;
  let prevPointerX = 0, prevPointerY = 0;

  function getCatCenter() {
    const r = Math.min(W, H) * 0.28;
    return { x: W / 2, y: H * 0.52, r };
  }

  function isInsideCat(px, py) {
    const c = getCatCenter();
    const dx = px - c.x, dy = py - c.y;
    return dx * dx + dy * dy < (c.r * 1.3) ** 2;
  }

  function poke(px, py, strength) {
    const c = getCatCenter();
    const dx = px - c.x, dy = py - c.y;

    jiggle.vx += dx * 0.08 * strength;
    jiggle.vy += dy * 0.08 * strength;
    squash.v += strength * 5;

    for (const w of wobbles) {
      w.amp += strength * (2 + Math.random() * 3);
      w.phase = Math.random() * Math.PI * 2;
    }

    targetSquint = 1;
    targetBlush = 1;
    setTimeout(() => { targetSquint = 0; }, 500);
    setTimeout(() => { targetBlush = 0; }, 1000);
  }

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    pointerDown = true;
    pointerX = prevPointerX = e.clientX;
    pointerY = prevPointerY = e.clientY;
    if (isInsideCat(e.clientX, e.clientY)) {
      poke(e.clientX, e.clientY, 1);
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    e.preventDefault();
    if (!pointerDown) return;
    pointerX = e.clientX;
    pointerY = e.clientY;
    if (isInsideCat(e.clientX, e.clientY)) {
      const dx = pointerX - prevPointerX;
      const dy = pointerY - prevPointerY;
      const speed = Math.sqrt(dx * dx + dy * dy);
      if (speed > 2) {
        jiggle.vx += dx * 0.15;
        jiggle.vy += dy * 0.15;
        for (const w of wobbles) {
          w.amp += speed * 0.3;
        }
        targetSquint = 0.5;
      }
    }
    prevPointerX = pointerX;
    prevPointerY = pointerY;
  });

  canvas.addEventListener('pointerup', (e) => {
    e.preventDefault();
    pointerDown = false;
    targetSquint = 0;
  });

  function physics(dt) {
    // Jiggle spring
    jiggle.vx += -jiggle.x * 0.08;
    jiggle.vy += -jiggle.y * 0.08;
    jiggle.vx *= 0.88;
    jiggle.vy *= 0.88;
    jiggle.x += jiggle.vx;
    jiggle.y += jiggle.vy;

    // Squash spring
    squash.v += -squash.val * 0.1;
    squash.v *= 0.85;
    squash.val += squash.v;

    // Wobbles decay
    for (const w of wobbles) {
      w.amp *= w.decay;
      w.phase += w.freq * dt;
    }

    // Face lerp
    eyeSquint += (targetSquint - eyeSquint) * 0.15;
    blushAlpha += (targetBlush - blushAlpha) * 0.08;
    tailWag += dt * 2.5;
  }

  function getDeform(angle) {
    let d = 0;
    for (let i = 0; i < wobbles.length; i++) {
      const w = wobbles[i];
      d += Math.sin(angle * (i + 2) + w.phase) * w.amp;
    }
    return d;
  }

  function drawBody(cx, cy, r) {
    const sx = 1 + squash.val * 0.01;
    const sy = 1 - squash.val * 0.008;
    const ox = jiggle.x;
    const oy = jiggle.y;

    ctx.save();
    ctx.translate(cx + ox, cy + oy);
    ctx.scale(sx, sy);

    // Body path with wobble deformation
    const segments = 64;
    ctx.beginPath();
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const deform = getDeform(angle);
      const rr = r + deform;
      const x = Math.cos(angle) * rr;
      const y = Math.sin(angle) * rr;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();

    // Gradient fill
    const grad = ctx.createRadialGradient(-r * 0.2, -r * 0.3, r * 0.1, 0, 0, r * 1.1);
    grad.addColorStop(0, '#fff5ee');
    grad.addColorStop(0.6, '#ffd4a8');
    grad.addColorStop(1, '#f0a860');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = '#d4915a';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.restore();

    return { cx: cx + ox, cy: cy + oy, sx, sy };
  }

  function drawEar(cx, cy, r, side, sx, sy) {
    const earW = r * 0.28;
    const earH = r * 0.38;
    const earX = cx + side * r * 0.45 * sx;
    const earY = cy - r * 0.75 * sy;
    const tipX = earX + side * earW * 0.3;
    const tipY = earY - earH;

    // Outer ear
    ctx.beginPath();
    ctx.moveTo(earX - earW * 0.5, earY + earH * 0.1);
    ctx.quadraticCurveTo(tipX - side * earW * 0.1, tipY, tipX, tipY);
    ctx.quadraticCurveTo(tipX + side * earW * 0.3, tipY + earH * 0.2, earX + earW * 0.5, earY + earH * 0.1);
    ctx.closePath();
    ctx.fillStyle = '#ffd4a8';
    ctx.fill();
    ctx.strokeStyle = '#d4915a';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Inner ear
    ctx.beginPath();
    const inset = 0.3;
    ctx.moveTo(earX - earW * (0.5 - inset), earY + earH * 0.05);
    ctx.quadraticCurveTo(tipX, tipY + earH * 0.2, earX + earW * (0.5 - inset), earY + earH * 0.05);
    ctx.closePath();
    ctx.fillStyle = '#ffb8b8';
    ctx.fill();
  }

  function drawFace(cx, cy, r) {
    const faceY = cy - r * 0.02;

    // Blush
    if (blushAlpha > 0.01) {
      ctx.globalAlpha = blushAlpha * 0.45;
      ctx.fillStyle = '#ff9999';
      ctx.beginPath();
      ctx.ellipse(cx - r * 0.38, faceY + r * 0.18, r * 0.13, r * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx + r * 0.38, faceY + r * 0.18, r * 0.13, r * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Eyes
    const eyeSpacing = r * 0.25;
    const eyeY = faceY - r * 0.05;
    const eyeRx = r * 0.1;
    const eyeRy = r * 0.12 * (1 - eyeSquint * 0.75);

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
      const hlSize = eyeRx * 0.35;
      ctx.beginPath();
      ctx.ellipse(cx - eyeSpacing + eyeRx * 0.3, eyeY - eyeRy * 0.25, hlSize, hlSize, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx + eyeSpacing + eyeRx * 0.3, eyeY - eyeRy * 0.25, hlSize, hlSize, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Nose
    const noseY = faceY + r * 0.1;
    ctx.fillStyle = '#e8907a';
    ctx.beginPath();
    ctx.moveTo(cx, noseY - r * 0.025);
    ctx.lineTo(cx - r * 0.04, noseY + r * 0.025);
    ctx.lineTo(cx + r * 0.04, noseY + r * 0.025);
    ctx.closePath();
    ctx.fill();

    // Mouth
    const mouthY = noseY + r * 0.035;
    ctx.strokeStyle = '#c8885a';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, mouthY);
    ctx.quadraticCurveTo(cx - r * 0.06, mouthY + r * 0.05, cx - r * 0.1, mouthY + r * 0.02);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, mouthY);
    ctx.quadraticCurveTo(cx + r * 0.06, mouthY + r * 0.05, cx + r * 0.1, mouthY + r * 0.02);
    ctx.stroke();

    // Whiskers
    ctx.strokeStyle = '#c8a080';
    ctx.lineWidth = 1.5;
    for (let side = -1; side <= 1; side += 2) {
      for (let i = -1; i <= 1; i++) {
        const wy = faceY + r * 0.14 + i * r * 0.045;
        ctx.beginPath();
        ctx.moveTo(cx + side * r * 0.15, wy);
        ctx.lineTo(cx + side * r * 0.55, wy + i * r * 0.03 - r * 0.01);
        ctx.stroke();
      }
    }
  }

  function drawTail(cx, cy, r) {
    const baseX = cx + r * 0.85;
    const baseY = cy + r * 0.1;
    ctx.strokeStyle = '#f0a860';
    ctx.lineWidth = r * 0.1;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(baseX, baseY);
    ctx.bezierCurveTo(
      baseX + r * 0.4, baseY - r * 0.3,
      baseX + r * 0.5, baseY - r * 0.8 + Math.sin(tailWag) * r * 0.12,
      baseX + r * 0.3, baseY - r * 0.95 + Math.sin(tailWag + 0.8) * r * 0.18
    );
    ctx.stroke();
  }

  function drawShadow(cx, cy, r) {
    const groundY = cy + r * 1.05;
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    ctx.beginPath();
    ctx.ellipse(cx, groundY, r * 0.8, r * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawTitle() {
    ctx.fillStyle = '#d4915a';
    ctx.font = `bold ${Math.min(W, H) * 0.07}px -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('たぷネコ', W / 2, H * 0.04);

    ctx.fillStyle = '#c8a080';
    ctx.font = `${Math.min(W, H) * 0.03}px -apple-system, sans-serif`;
    ctx.fillText('タップしてたぷたぷしよう！', W / 2, H * 0.04 + Math.min(W, H) * 0.09);
  }

  let lastTime = performance.now();

  function loop(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    ctx.clearRect(0, 0, W, H);

    physics(dt);

    const { x: catX, y: catY, r: catR } = getCatCenter();

    drawShadow(catX + jiggle.x, catY + jiggle.y, catR);
    drawTail(catX + jiggle.x, catY + jiggle.y, catR);

    const sx = 1 + squash.val * 0.01;
    const sy = 1 - squash.val * 0.008;

    drawEar(catX + jiggle.x, catY + jiggle.y, catR, -1, sx, sy);
    drawEar(catX + jiggle.x, catY + jiggle.y, catR, 1, sx, sy);

    drawBody(catX, catY, catR);
    drawFace(catX + jiggle.x, catY + jiggle.y, catR);

    drawTitle();

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
})();
