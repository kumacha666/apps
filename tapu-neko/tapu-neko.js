(() => {
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');

  let W, H, centerX, centerY, catRadius;

  function resize() {
    W = canvas.width = window.innerWidth * devicePixelRatio;
    H = canvas.height = window.innerHeight * devicePixelRatio;
    ctx.scale(devicePixelRatio, devicePixelRatio);
    W /= devicePixelRatio;
    H /= devicePixelRatio;
    centerX = W / 2;
    centerY = H * 0.5;
    catRadius = Math.min(W, H) * 0.28;
  }

  window.addEventListener('resize', resize);
  resize();

  // Soft body: ring of spring-connected points
  const NUM_POINTS = 32;
  const STIFFNESS = 0.03;
  const DAMPING = 0.88;
  const PRESSURE = 0.0004;
  const GRAVITY = 0.15;
  const GROUND_FRICTION = 0.7;

  class SoftPoint {
    constructor(angle) {
      this.baseAngle = angle;
      this.x = centerX + Math.cos(angle) * catRadius;
      this.y = centerY + Math.sin(angle) * catRadius;
      this.vx = 0;
      this.vy = 0;
      this.restX = this.x;
      this.restY = this.y;
    }

    updateRest() {
      this.restX = centerX + Math.cos(this.baseAngle) * catRadius;
      this.restY = centerY + Math.sin(this.baseAngle) * catRadius;
    }
  }

  const points = [];
  for (let i = 0; i < NUM_POINTS; i++) {
    points.push(new SoftPoint((i / NUM_POINTS) * Math.PI * 2 - Math.PI / 2));
  }

  // Cat face state
  let eyeSquint = 0;
  let targetSquint = 0;
  let mouthOpen = 0;
  let targetMouth = 0;
  let blushAlpha = 0;
  let targetBlush = 0;

  // Interaction
  let pointerDown = false;
  let pointerX = 0, pointerY = 0;
  let dragIndex = -1;
  let lastTapTime = 0;

  function getPointerPos(e) {
    const t = e.touches ? e.touches[0] : e;
    return { x: t.clientX, y: t.clientY };
  }

  function findClosestPoint(x, y) {
    let minDist = Infinity, idx = -1;
    for (let i = 0; i < points.length; i++) {
      const dx = points[i].x - x, dy = points[i].y - y;
      const d = dx * dx + dy * dy;
      if (d < minDist) { minDist = d; idx = i; }
    }
    return minDist < (catRadius * 1.5) ** 2 ? idx : -1;
  }

  function isInsideCat(x, y) {
    const dx = x - centerX, dy = y - centerY;
    return dx * dx + dy * dy < (catRadius * 1.3) ** 2;
  }

  function tapEffect(x, y) {
    for (const p of points) {
      const dx = p.x - x, dy = p.y - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const force = Math.max(0, 1 - dist / (catRadius * 1.5));
      const angle = Math.atan2(dy, dx);
      p.vx += Math.cos(angle) * force * 8;
      p.vy += Math.sin(angle) * force * 8;
    }
    targetSquint = 1;
    targetMouth = 1;
    targetBlush = 1;
    setTimeout(() => { targetSquint = 0; targetMouth = 0; }, 600);
    setTimeout(() => { targetBlush = 0; }, 1200);
  }

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const pos = { x: e.clientX, y: e.clientY };
    pointerDown = true;
    pointerX = pos.x;
    pointerY = pos.y;

    if (isInsideCat(pos.x, pos.y)) {
      dragIndex = findClosestPoint(pos.x, pos.y);
      tapEffect(pos.x, pos.y);
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    e.preventDefault();
    if (!pointerDown) return;
    pointerX = e.clientX;
    pointerY = e.clientY;

    if (dragIndex >= 0) {
      const spread = 5;
      for (let i = -spread; i <= spread; i++) {
        const idx = (dragIndex + i + NUM_POINTS) % NUM_POINTS;
        const weight = 1 - Math.abs(i) / (spread + 1);
        const p = points[idx];
        p.vx += (pointerX - p.x) * 0.05 * weight;
        p.vy += (pointerY - p.y) * 0.05 * weight;
      }
      targetSquint = 0.5;
    }
  });

  canvas.addEventListener('pointerup', (e) => {
    e.preventDefault();
    pointerDown = false;
    dragIndex = -1;
    targetSquint = 0;
    targetMouth = 0;
  });

  // Physics
  const restLengths = [];
  for (let i = 0; i < NUM_POINTS; i++) {
    const j = (i + 1) % NUM_POINTS;
    const dx = points[j].x - points[i].x;
    const dy = points[j].y - points[i].y;
    restLengths.push(Math.sqrt(dx * dx + dy * dy));
  }

  function computeArea() {
    let area = 0;
    for (let i = 0; i < NUM_POINTS; i++) {
      const j = (i + 1) % NUM_POINTS;
      area += points[i].x * points[j].y;
      area -= points[j].x * points[i].y;
    }
    return Math.abs(area) / 2;
  }

  const restArea = computeArea();
  const groundY = () => centerY + catRadius * 1.15;

  function physics() {
    // Spring forces between neighbors
    for (let i = 0; i < NUM_POINTS; i++) {
      const j = (i + 1) % NUM_POINTS;
      const dx = points[j].x - points[i].x;
      const dy = points[j].y - points[i].y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const diff = (dist - restLengths[i]) / dist;
      const fx = dx * diff * 0.4;
      const fy = dy * diff * 0.4;
      points[i].vx += fx;
      points[i].vy += fy;
      points[j].vx -= fx;
      points[j].vy -= fy;
    }

    // Shape-preserving spring to rest position
    for (const p of points) {
      p.vx += (p.restX - p.x) * STIFFNESS;
      p.vy += (p.restY - p.y) * STIFFNESS;
    }

    // Pressure (volume preservation)
    const area = computeArea();
    const pressureDiff = (restArea - area) * PRESSURE;
    for (let i = 0; i < NUM_POINTS; i++) {
      const prev = (i - 1 + NUM_POINTS) % NUM_POINTS;
      const next = (i + 1) % NUM_POINTS;
      const nx = -(points[next].y - points[prev].y);
      const ny = points[next].x - points[prev].x;
      const len = Math.sqrt(nx * nx + ny * ny) || 1;
      points[i].vx += (nx / len) * pressureDiff;
      points[i].vy += (ny / len) * pressureDiff;
    }

    // Gravity + ground
    const gy = groundY();
    for (const p of points) {
      p.vy += GRAVITY;
      p.vx *= DAMPING;
      p.vy *= DAMPING;
      p.x += p.vx;
      p.y += p.vy;

      if (p.y > gy) {
        p.y = gy;
        p.vy *= -0.3;
        p.vx *= GROUND_FRICTION;
      }
    }

    // Face expressions lerp
    eyeSquint += (targetSquint - eyeSquint) * 0.15;
    mouthOpen += (targetMouth - mouthOpen) * 0.15;
    blushAlpha += (targetBlush - blushAlpha) * 0.08;
  }

  // Compute centroid from soft body points
  function getCentroid() {
    let cx = 0, cy = 0;
    for (const p of points) { cx += p.x; cy += p.y; }
    return { x: cx / NUM_POINTS, y: cy / NUM_POINTS };
  }

  // Drawing
  function drawCat() {
    const c = getCentroid();

    // Body (soft body outline)
    ctx.beginPath();
    ctx.moveTo(
      (points[0].x + points[NUM_POINTS - 1].x) / 2,
      (points[0].y + points[NUM_POINTS - 1].y) / 2
    );
    for (let i = 0; i < NUM_POINTS; i++) {
      const next = (i + 1) % NUM_POINTS;
      const midX = (points[i].x + points[next].x) / 2;
      const midY = (points[i].y + points[next].y) / 2;
      ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
    }
    ctx.closePath();

    // Body gradient
    const grad = ctx.createRadialGradient(
      c.x - catRadius * 0.2, c.y - catRadius * 0.3, catRadius * 0.1,
      c.x, c.y, catRadius * 1.1
    );
    grad.addColorStop(0, '#fff5ee');
    grad.addColorStop(0.7, '#ffd4a8');
    grad.addColorStop(1, '#f5b070');
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.strokeStyle = '#d4915a';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Ears (triangles from top of body)
    const earSize = catRadius * 0.35;
    const earTopIdx = 0; // top of circle
    const earL = points[Math.floor(NUM_POINTS * 0.9)];
    const earR = points[Math.floor(NUM_POINTS * 0.1)];
    const earLBase2 = points[Math.floor(NUM_POINTS * 0.85)];
    const earRBase2 = points[Math.floor(NUM_POINTS * 0.15)];

    // Left ear
    ctx.beginPath();
    ctx.moveTo(earL.x, earL.y);
    ctx.lineTo(earL.x - earSize * 0.4, earL.y - earSize);
    ctx.lineTo(earLBase2.x, earLBase2.y);
    ctx.closePath();
    ctx.fillStyle = '#ffd4a8';
    ctx.fill();
    ctx.strokeStyle = '#d4915a';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Left ear inner
    ctx.beginPath();
    ctx.moveTo(
      earL.x * 0.7 + earLBase2.x * 0.3,
      earL.y * 0.7 + earLBase2.y * 0.3
    );
    ctx.lineTo(earL.x - earSize * 0.3, earL.y - earSize * 0.7);
    ctx.lineTo(
      earL.x * 0.3 + earLBase2.x * 0.7,
      earL.y * 0.3 + earLBase2.y * 0.7
    );
    ctx.closePath();
    ctx.fillStyle = '#ffb0b0';
    ctx.fill();

    // Right ear
    ctx.beginPath();
    ctx.moveTo(earR.x, earR.y);
    ctx.lineTo(earR.x + earSize * 0.4, earR.y - earSize);
    ctx.lineTo(earRBase2.x, earRBase2.y);
    ctx.closePath();
    ctx.fillStyle = '#ffd4a8';
    ctx.fill();
    ctx.strokeStyle = '#d4915a';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Right ear inner
    ctx.beginPath();
    ctx.moveTo(
      earR.x * 0.7 + earRBase2.x * 0.3,
      earR.y * 0.7 + earRBase2.y * 0.3
    );
    ctx.lineTo(earR.x + earSize * 0.3, earR.y - earSize * 0.7);
    ctx.lineTo(
      earR.x * 0.3 + earRBase2.x * 0.7,
      earR.y * 0.3 + earRBase2.y * 0.7
    );
    ctx.closePath();
    ctx.fillStyle = '#ffb0b0';
    ctx.fill();

    // Face features relative to centroid
    const faceY = c.y - catRadius * 0.05;

    // Blush
    if (blushAlpha > 0.01) {
      ctx.globalAlpha = blushAlpha * 0.5;
      ctx.fillStyle = '#ff9999';
      ctx.beginPath();
      ctx.ellipse(c.x - catRadius * 0.4, faceY + catRadius * 0.15, catRadius * 0.15, catRadius * 0.1, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(c.x + catRadius * 0.4, faceY + catRadius * 0.15, catRadius * 0.15, catRadius * 0.1, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Eyes
    const eyeSpacing = catRadius * 0.28;
    const eyeY = faceY - catRadius * 0.05;
    const eyeH = catRadius * 0.13 * (1 - eyeSquint * 0.7);
    const eyeW = catRadius * 0.12;

    ctx.fillStyle = '#3a2a1a';
    // Left eye
    ctx.beginPath();
    ctx.ellipse(c.x - eyeSpacing, eyeY, eyeW, eyeH, 0, 0, Math.PI * 2);
    ctx.fill();

    // Right eye
    ctx.beginPath();
    ctx.ellipse(c.x + eyeSpacing, eyeY, eyeW, eyeH, 0, 0, Math.PI * 2);
    ctx.fill();

    // Eye highlights
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(c.x - eyeSpacing + eyeW * 0.3, eyeY - eyeH * 0.3, eyeW * 0.35, eyeH * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(c.x + eyeSpacing + eyeW * 0.3, eyeY - eyeH * 0.3, eyeW * 0.35, eyeH * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();

    // Nose
    ctx.fillStyle = '#e8907a';
    ctx.beginPath();
    const noseY = faceY + catRadius * 0.08;
    ctx.moveTo(c.x, noseY);
    ctx.lineTo(c.x - catRadius * 0.05, noseY + catRadius * 0.04);
    ctx.lineTo(c.x + catRadius * 0.05, noseY + catRadius * 0.04);
    ctx.closePath();
    ctx.fill();

    // Mouth
    ctx.strokeStyle = '#d4915a';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    const mouthY = noseY + catRadius * 0.05;
    const mouthW = catRadius * 0.12;

    ctx.beginPath();
    ctx.moveTo(c.x, mouthY);
    ctx.quadraticCurveTo(c.x - mouthW * 0.5, mouthY + catRadius * 0.06 + mouthOpen * catRadius * 0.05, c.x - mouthW, mouthY + catRadius * 0.02);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(c.x, mouthY);
    ctx.quadraticCurveTo(c.x + mouthW * 0.5, mouthY + catRadius * 0.06 + mouthOpen * catRadius * 0.05, c.x + mouthW, mouthY + catRadius * 0.02);
    ctx.stroke();

    // Whiskers
    ctx.strokeStyle = '#c8a080';
    ctx.lineWidth = 1.5;
    const whiskerY = faceY + catRadius * 0.12;
    for (let side = -1; side <= 1; side += 2) {
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(c.x + side * catRadius * 0.2, whiskerY + i * catRadius * 0.04);
        ctx.lineTo(c.x + side * catRadius * 0.6, whiskerY + i * catRadius * 0.08 - catRadius * 0.02);
        ctx.stroke();
      }
    }

    // Tail
    const tailBase = points[Math.floor(NUM_POINTS * 0.6)];
    ctx.strokeStyle = '#f5b070';
    ctx.lineWidth = catRadius * 0.1;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(tailBase.x, tailBase.y);
    const tailTime = Date.now() / 1000;
    ctx.bezierCurveTo(
      tailBase.x + catRadius * 0.5, tailBase.y - catRadius * 0.2,
      tailBase.x + catRadius * 0.7, tailBase.y - catRadius * 0.8 + Math.sin(tailTime * 2) * catRadius * 0.15,
      tailBase.x + catRadius * 0.4, tailBase.y - catRadius * 1.0 + Math.sin(tailTime * 2 + 1) * catRadius * 0.2
    );
    ctx.stroke();

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    ctx.beginPath();
    ctx.ellipse(c.x, groundY() + 5, catRadius * 0.9, catRadius * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawTitle() {
    ctx.fillStyle = '#d4915a';
    ctx.font = `bold ${Math.min(W, H) * 0.06}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('たぷネコ', W / 2, H * 0.08);

    ctx.fillStyle = '#c8a080';
    ctx.font = `${Math.min(W, H) * 0.028}px sans-serif`;
    ctx.fillText('タップしてたぷたぷしよう！', W / 2, H * 0.12);
  }

  function loop() {
    ctx.clearRect(0, 0, W, H);
    physics();
    drawCat();
    drawTitle();
    requestAnimationFrame(loop);
  }

  loop();
})();
