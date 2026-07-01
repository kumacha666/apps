import type { WeaponType } from "./types";

let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AudioCtor = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtor) return null;
    ctx = new AudioCtor();
  }
  return ctx;
}

function beep(freq: number, duration: number, type: OscillatorType = "square", gain = 0.15): void {
  const ac = getContext();
  if (!ac) return;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const now = ac.currentTime;
  g.gain.setValueAtTime(gain, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + duration);
  osc.connect(g).connect(ac.destination);
  osc.start(now);
  osc.stop(now + duration);
}

// ─── 武器ごとの効果音 ────────────────────────────────────────────────────────

function sfxSword(): void {
  const ac = getContext(); if (!ac) return;
  const now = ac.currentTime;

  // Phase 1: 振り被り〜振り下ろし（重い剣が加速する風切り）
  const buf1 = ac.createBuffer(1, ac.sampleRate * 0.2, ac.sampleRate);
  const d1 = buf1.getChannelData(0);
  for (let i = 0; i < d1.length; i++) d1[i] = Math.random() * 2 - 1;
  const sw = ac.createBufferSource(); sw.buffer = buf1;
  const sf = ac.createBiquadFilter(); sf.type = "bandpass";
  sf.frequency.setValueAtTime(1500, now);
  sf.frequency.exponentialRampToValueAtTime(280, now + 0.2);
  sf.Q.value = 1.3;
  const sg = ac.createGain();
  sg.gain.setValueAtTime(0.0, now);
  sg.gain.linearRampToValueAtTime(0.85, now + 0.12);
  sg.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
  sw.connect(sf).connect(sg).connect(ac.destination);
  sw.start(now); sw.stop(now + 0.2);

  // Phase 2: 切り裂き瞬間（中高域バースト）
  const buf2 = ac.createBuffer(1, ac.sampleRate * 0.07, ac.sampleRate);
  const d2 = buf2.getChannelData(0);
  for (let i = 0; i < d2.length; i++) d2[i] = Math.random() * 2 - 1;
  const sl = ac.createBufferSource(); sl.buffer = buf2;
  const lf = ac.createBiquadFilter(); lf.type = "bandpass";
  lf.frequency.setValueAtTime(3000, now + 0.13);
  lf.frequency.exponentialRampToValueAtTime(650, now + 0.20);
  lf.Q.value = 2.5;
  const lg = ac.createGain();
  lg.gain.setValueAtTime(1.2, now + 0.13);
  lg.gain.exponentialRampToValueAtTime(0.001, now + 0.20);
  sl.connect(lf).connect(lg).connect(ac.destination);
  sl.start(now + 0.13); sl.stop(now + 0.20);

  // Phase 2b: 高域の切り裂き感
  const buf3 = ac.createBuffer(1, ac.sampleRate * 0.045, ac.sampleRate);
  const d3 = buf3.getChannelData(0);
  for (let i = 0; i < d3.length; i++) d3[i] = Math.random() * 2 - 1;
  const sh = ac.createBufferSource(); sh.buffer = buf3;
  const hf = ac.createBiquadFilter(); hf.type = "highpass"; hf.frequency.value = 4500;
  const hg = ac.createGain();
  hg.gain.setValueAtTime(0.65, now + 0.13);
  hg.gain.exponentialRampToValueAtTime(0.001, now + 0.175);
  sh.connect(hf).connect(hg).connect(ac.destination);
  sh.start(now + 0.13); sh.stop(now + 0.175);

  // Phase 3: ブレードの重量感（低音ズシン）
  const osc = ac.createOscillator(), og = ac.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(95, now + 0.13);
  osc.frequency.exponentialRampToValueAtTime(32, now + 0.27);
  og.gain.setValueAtTime(0, now);
  og.gain.setValueAtTime(0.5, now + 0.13);
  og.gain.exponentialRampToValueAtTime(0.001, now + 0.27);
  osc.connect(og).connect(ac.destination);
  osc.start(now); osc.stop(now + 0.28);
}

function sfxLance(): void {
  const ac = getContext(); if (!ac) return;
  const now = ac.currentTime;
  // 風切り音（ハイパスノイズ）
  const buf = ac.createBuffer(1, ac.sampleRate * 0.13, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource(); src.buffer = buf;
  const filt = ac.createBiquadFilter(); filt.type = "highpass"; filt.frequency.value = 2500;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.35, now);
  g.gain.setValueAtTime(0.35, now + 0.05);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
  src.connect(filt).connect(g).connect(ac.destination);
  src.start(now); src.stop(now + 0.13);
  // 突き音（低音の衝撃）
  const osc = ac.createOscillator(), g2 = ac.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(130, now + 0.05);
  osc.frequency.exponentialRampToValueAtTime(40, now + 0.16);
  g2.gain.setValueAtTime(0, now);
  g2.gain.setValueAtTime(0.4, now + 0.05);
  g2.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
  osc.connect(g2).connect(ac.destination);
  osc.start(now); osc.stop(now + 0.17);
}

function sfxBow(): void {
  const ac = getContext(); if (!ac) return;
  const now = ac.currentTime;
  const osc = ac.createOscillator(), g = ac.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(1400, now);
  osc.frequency.exponentialRampToValueAtTime(350, now + 0.11);
  g.gain.setValueAtTime(0.2, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
  osc.connect(g).connect(ac.destination);
  osc.start(now); osc.stop(now + 0.11);
}

function sfxTome(): void {
  const ac = getContext(); if (!ac) return;
  const now = ac.currentTime;
  // 低音ドーン
  const osc0 = ac.createOscillator(), g0 = ac.createGain();
  osc0.type = "sine";
  osc0.frequency.setValueAtTime(90, now);
  osc0.frequency.exponentialRampToValueAtTime(30, now + 0.18);
  g0.gain.setValueAtTime(0.6, now);
  g0.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
  osc0.connect(g0).connect(ac.destination);
  osc0.start(now); osc0.stop(now + 0.18);
  // 全域ノイズ爆発
  const buf = ac.createBuffer(1, ac.sampleRate * 0.28, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource(); src.buffer = buf;
  const filt = ac.createBiquadFilter(); filt.type = "bandpass";
  filt.frequency.setValueAtTime(300, now);
  filt.frequency.exponentialRampToValueAtTime(6000, now + 0.04);
  filt.frequency.exponentialRampToValueAtTime(900, now + 0.25);
  filt.Q.value = 2;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.9, now);
  g.gain.setValueAtTime(0.7, now + 0.04);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
  src.connect(filt).connect(g).connect(ac.destination);
  src.start(now); src.stop(now + 0.28);
  // 高周波電撃バズ
  const osc2 = ac.createOscillator(), g2 = ac.createGain();
  osc2.type = "sawtooth";
  osc2.frequency.setValueAtTime(2000, now);
  osc2.frequency.setValueAtTime(1100, now + 0.03);
  osc2.frequency.setValueAtTime(3000, now + 0.07);
  osc2.frequency.setValueAtTime(800, now + 0.12);
  osc2.frequency.setValueAtTime(2200, now + 0.17);
  g2.gain.setValueAtTime(0.2, now);
  g2.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
  osc2.connect(g2).connect(ac.destination);
  osc2.start(now); osc2.stop(now + 0.24);
}

function doHit(weaponType?: WeaponType): void {
  switch (weaponType) {
    case "sword": sfxSword(); break;
    case "lance": sfxLance(); break;
    case "bow":   sfxBow();   break;
    case "tome":  sfxTome();  break;
    default:      beep(220, 0.08, "square", 0.18); break;
  }
}

// 武器ごとのヒット瞬間（衝撃コア）を指定時刻・音量で1発鳴らす
function fireHitCore(wt: WeaponType | undefined, t: number, vol: number): void {
  const ac = getContext(); if (!ac) return;
  if (wt === "sword") {
    const buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * 0.07), ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource(); src.buffer = buf;
    const f = ac.createBiquadFilter(); f.type = "bandpass";
    f.frequency.setValueAtTime(3000, t); f.frequency.exponentialRampToValueAtTime(650, t + 0.07); f.Q.value = 2.5;
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    src.connect(f).connect(g).connect(ac.destination);
    src.start(t); src.stop(t + 0.07);
    const o = ac.createOscillator(), og = ac.createGain(); o.type = "sine";
    o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(30, t + 0.08);
    og.gain.setValueAtTime(vol * 0.6, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    o.connect(og).connect(ac.destination); o.start(t); o.stop(t + 0.08);
  } else if (wt === "lance") {
    const o = ac.createOscillator(), og = ac.createGain(); o.type = "sine";
    o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.08);
    og.gain.setValueAtTime(vol, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    o.connect(og).connect(ac.destination); o.start(t); o.stop(t + 0.09);
    const buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * 0.04), ac.sampleRate);
    const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource(); src.buffer = buf;
    const f = ac.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 2500;
    const g = ac.createGain(); g.gain.setValueAtTime(vol * 0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    src.connect(f).connect(g).connect(ac.destination); src.start(t); src.stop(t + 0.04);
  } else if (wt === "bow") {
    const o = ac.createOscillator(), og = ac.createGain(); o.type = "triangle";
    o.frequency.setValueAtTime(1400, t); o.frequency.exponentialRampToValueAtTime(350, t + 0.06);
    og.gain.setValueAtTime(vol, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    o.connect(og).connect(ac.destination); o.start(t); o.stop(t + 0.06);
  } else if (wt === "tome") {
    const buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * 0.07), ac.sampleRate);
    const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource(); src.buffer = buf;
    const f = ac.createBiquadFilter(); f.type = "bandpass";
    f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(4000, t + 0.03); f.frequency.exponentialRampToValueAtTime(600, t + 0.07); f.Q.value = 2;
    const g = ac.createGain(); g.gain.setValueAtTime(vol * 0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    src.connect(f).connect(g).connect(ac.destination); src.start(t); src.stop(t + 0.07);
    const o = ac.createOscillator(), og = ac.createGain(); o.type = "sine";
    o.frequency.setValueAtTime(80, t); o.frequency.exponentialRampToValueAtTime(25, t + 0.09);
    og.gain.setValueAtTime(vol * 0.7, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    o.connect(og).connect(ac.destination); o.start(t); o.stop(t + 0.09);
  } else {
    beep(220, 0.06, "square", vol * 0.18);
  }
}

// 会心A: ヒット瞬間を10連射（ヒュッズズズズサササ）
function sfxCritExtra(wt: WeaponType | undefined): void {
  const ac = getContext(); if (!ac) return;
  const now = ac.currentTime;
  const intervals = [0, 0.055, 0.048, 0.042, 0.037, 0.033, 0.030, 0.028, 0.026, 0.024];
  let t = now;
  for (let i = 0; i < 10; i++) {
    t += intervals[i];
    const vol = Math.max(0.06, 0.75 * Math.pow(0.80, i));
    fireHitCore(wt, t, vol);
  }
}

export const SFX = {
  hit: (weaponType?: WeaponType) => doHit(weaponType),
  // 会心C: 2連撃 + 3撃目でAフィニッシュ
  crit: (weaponType?: WeaponType) => {
    doHit(weaponType);
    setTimeout(() => doHit(weaponType), 160);
    setTimeout(() => {
      doHit(weaponType);
      setTimeout(() => sfxCritExtra(weaponType), 45);
    }, 300);
  },
  miss: () => {
    const ac = getContext(); if (!ac) return;
    const now = ac.currentTime;
    const buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * 0.18), ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource(); src.buffer = buf;
    const filt = ac.createBiquadFilter(); filt.type = "bandpass";
    filt.frequency.setValueAtTime(2800, now);
    filt.frequency.exponentialRampToValueAtTime(700, now + 0.18);
    filt.Q.value = 1.8;
    const g = ac.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.75, now + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    src.connect(filt).connect(g).connect(ac.destination);
    src.start(now); src.stop(now + 0.18);
    const osc = ac.createOscillator(), og = ac.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.exponentialRampToValueAtTime(75, now + 0.16);
    og.gain.setValueAtTime(0.38, now);
    og.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(og).connect(ac.destination);
    osc.start(now); osc.stop(now + 0.17);
  },
  win: () => {
    [523, 659, 784].forEach((f, i) => setTimeout(() => beep(f, 0.15, "square", 0.15), i * 90));
  },
  lose: () => {
    [392, 330, 261].forEach((f, i) => setTimeout(() => beep(f, 0.18, "sawtooth", 0.15), i * 75));
  },
  select: () => beep(880, 0.05, "square", 0.1),
};

// ─── BGM ───────────────────────────────────────────────────────────────────

const N: Record<string, number> = {
  R: 0,
  D3: 146.83, Eb3: 155.56, E3: 164.81, F3: 174.61, G3: 196.00, Ab3: 207.65,
  A3: 220.00, Bb3: 233.08, B3: 246.94,
  C4: 261.63, D4: 293.66, Eb4: 311.13, E4: 329.63, F4: 349.23, G4: 392.00,
  Ab4: 415.30, A4: 440.00, Bb4: 466.16, B4: 493.88,
  C5: 523.25, Db5: 554.37, D5: 587.33, Eb5: 622.25, E5: 659.25, F5: 698.46,
  Gb5: 739.99, G5: 783.99, Ab5: 830.61, A5: 880.00, Bb5: 932.33, B5: 987.77,
  C6: 1046.50,
};

const TITLE_Q  = 60 / 76;
const BATTLE_E = (60 / 176) / 2;
const BOSS_E   = (60 / 196) / 2;
const LOSE_Q   = 60 / 50;

// ── タイトルBGM（Dマイナー BPM76）
const TITLE_MELODY: [number, number][] = [[N.D5,2],[N.C5,1],[N.D5,1],[N.F5,2],[N.E5,2],[N.D5,2],[N.A4,1],[N.B4,1],[N.C5,4],[N.A4,2],[N.G4,1],[N.A4,1],[N.C5,2],[N.B4,2],[N.A4,2],[N.F4,1],[N.G4,1],[N.A4,4],[N.F5,1],[N.G5,1],[N.A5,2],[N.G5,1],[N.F5,1],[N.E5,2],[N.D5,2],[N.E5,1],[N.F5,1],[N.G5,2],[N.F5,2],[N.E5,1],[N.F5,1],[N.G5,2],[N.F5,1],[N.E5,1],[N.D5,2],[N.C5,2],[N.B4,2],[N.A4,4]];
const TITLE_BASS: [number, number][]   = [[N.D3,2],[N.A3,2],[N.D3,2],[N.A3,2],[N.F3,2],[N.C4,2],[N.F3,2],[N.C4,2],[N.G3,2],[N.D4,2],[N.G3,2],[N.D4,2],[N.A3,4],[N.A3,4],[N.D3,2],[N.A3,2],[N.D3,2],[N.A3,2],[N.F3,2],[N.C4,2],[N.F3,2],[N.C4,2],[N.G3,2],[N.D4,2],[N.G3,2],[N.E3,2],[N.A3,8],[N.D4,2],[N.A3,2],[N.D4,2],[N.A3,2],[N.G3,2],[N.D4,2],[N.G3,2],[N.D4,2],[N.A3,2],[N.E3,2],[N.A3,2],[N.E3,2],[N.F3,2],[N.G3,2],[N.A3,4]];
const TITLE_PULSE: [number, number][]  = [[N.F4,2],[N.E4,1],[N.F4,1],[N.A4,2],[N.G4,2],[N.F4,2],[N.G4,2],[N.A4,4],[N.E4,2],[N.D4,1],[N.E4,1],[N.G4,2],[N.F4,2],[N.E4,2],[N.D4,2],[N.C4,4],[N.D4,2],[N.A4,2],[N.D4,2],[N.A4,2],[N.C4,2],[N.G4,2],[N.C4,2],[N.G4,2],[N.D4,2],[N.A4,2],[N.D4,2],[N.A4,2],[N.E4,4],[N.A4,4],[N.A4,1],[N.B4,1],[N.C5,2],[N.B4,1],[N.A4,1],[N.G4,2],[N.F4,2],[N.G4,1],[N.A4,1],[N.B4,2],[N.A4,2],[N.G4,1],[N.A4,1],[N.B4,2],[N.A4,1],[N.G4,1],[N.F4,2],[N.E4,2],[N.F4,2],[N.E4,4]];

// ── 戦闘BGM（Aマイナー BPM176）
const BATTLE_MELODY: [number, number][] = [
  [N.A5,1],[N.R,1],[N.E4,1],[N.R,1],[N.A5,1],[N.R,1],[N.F5,2],[N.E5,1],
  [N.D5,1],[N.E5,1],[N.F5,1],[N.E5,1],[N.D5,1],[N.C5,1],[N.B4,2],
  [N.A4,1],[N.R,1],[N.E5,1],[N.R,1],[N.A4,1],[N.R,1],[N.G5,2],
  [N.F5,1],[N.E5,1],[N.D5,1],[N.C5,1],[N.B4,2],[N.R,2],
  [N.A3,1],[N.C4,1],[N.E4,1],[N.G4,1],[N.A4,1],[N.C5,1],[N.E5,1],[N.G5,1],
  [N.A5,2],[N.G5,1],[N.F5,1],[N.E5,2],[N.D5,2],
  [N.C5,1],[N.B4,1],[N.A4,1],[N.B4,1],[N.C5,1],[N.D5,1],[N.E5,2],
  [N.A4,6],[N.R,2],
];
const BATTLE_BASS: [number, number][] = [
  [N.A3,1],[N.A3,1],[N.E3,1],[N.E3,1],[N.A3,1],[N.A3,1],[N.E3,2],
  [N.F3,1],[N.F3,1],[N.C4,1],[N.C4,1],[N.F3,1],[N.F3,1],[N.C4,2],
  [N.G3,1],[N.G3,1],[N.D4,1],[N.D4,1],[N.G3,1],[N.G3,1],[N.D4,2],
  [N.A3,2],[N.G3,2],[N.F3,2],[N.E3,2],
  [N.A3,1],[N.A3,1],[N.A3,1],[N.A3,1],[N.A3,1],[N.A3,1],[N.A3,2],
  [N.D3,2],[N.A3,2],[N.D3,2],[N.A3,2],
  [N.E3,2],[N.B3,2],[N.E3,2],[N.B3,2],
  [N.A3,8],
];
const BATTLE_PULSE: [number, number][] = [
  [N.C5,2],[N.B4,2],[N.A5,2],[N.G5,2],
  [N.F5,2],[N.E5,2],[N.D5,2],[N.C5,2],
  [N.E5,2],[N.D5,2],[N.C5,2],[N.B4,2],
  [N.A4,2],[N.B4,2],[N.C5,2],[N.B4,2],
  [N.A5,1],[N.G5,1],[N.F5,1],[N.E5,1],[N.D5,1],[N.C5,1],[N.B4,2],
  [N.C5,2],[N.E5,2],[N.G5,2],[N.A5,2],
  [N.G5,2],[N.F5,2],[N.E5,2],[N.D5,2],
  [N.A4,8],
];
const BATTLE_KICK  = [1,0,1,0, 1,0,0,0, 1,0,1,0, 0,0,0,0];
const BATTLE_SNARE = [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0];

// ── ボス戦BGM（BPM196 16小節ループ、トリトーン・半音階多用）
const BOSS_MELODY: [number, number][] = [
  [N.A3,2],[N.R,2],[N.A5,2],[N.R,2],
  [N.Eb5,1],[N.D5,1],[N.C5,1],[N.B4,1],[N.Bb4,1],[N.A4,1],[N.G4,1],[N.F4,1],
  [N.E4,1],[N.R,1],[N.Bb4,1],[N.R,1],[N.E5,2],[N.Eb5,2],
  [N.A4,4],[N.R,4],
  [N.A4,1],[N.Bb4,1],[N.B4,1],[N.C5,1],[N.Db5,1],[N.D5,1],[N.Eb5,1],[N.E5,1],
  [N.F5,1],[N.G5,1],[N.Ab5,1],[N.A5,1],[N.Bb5,1],[N.R,1],[N.A5,1],[N.R,1],
  [N.R,2],[N.Eb5,1],[N.R,1],[N.A4,1],[N.R,1],[N.Eb5,2],
  [N.A4,6],[N.R,2],
  [N.A5,1],[N.R,1],[N.Eb5,1],[N.R,1],[N.A5,1],[N.R,1],[N.Eb5,1],[N.R,1],
  [N.G5,1],[N.F5,1],[N.Eb5,1],[N.D5,1],[N.Eb5,1],[N.D5,1],[N.C5,1],[N.B4,1],
  [N.Bb4,1],[N.A4,1],[N.Bb4,1],[N.A4,1],[N.G4,1],[N.F4,1],[N.E4,1],[N.Eb4,1],
  [N.A4,4],[N.R,4],
  [N.E4,1],[N.F4,1],[N.G4,1],[N.Ab4,1],[N.A4,1],[N.Bb4,1],[N.B4,1],[N.C5,1],
  [N.Db5,1],[N.D5,1],[N.Eb5,1],[N.E5,1],[N.F5,1],[N.Gb5,1],[N.G5,1],[N.Ab5,1],
  [N.A5,2],[N.R,2],[N.Eb5,2],[N.R,2],
  [N.A4,6],[N.R,2],
];
const BOSS_BASS: [number, number][] = [
  [N.A3,1],[N.A3,1],[N.R,2],[N.A3,1],[N.A3,1],[N.R,2],
  [N.F3,2],[N.Eb3,2],[N.F3,2],[N.Eb3,2],
  [N.E3,2],[N.Bb3,2],[N.E3,2],[N.Bb3,2],
  [N.A3,8],
  [N.A3,1],[N.A3,1],[N.A3,1],[N.A3,1],[N.A3,1],[N.A3,1],[N.A3,2],
  [N.D3,2],[N.Ab3,2],[N.D3,2],[N.Ab3,2],
  [N.E3,2],[N.Bb3,2],[N.Eb3,2],[N.A3,2],
  [N.A3,8],
  [N.A3,2],[N.Eb3,2],[N.A3,2],[N.Eb3,2],
  [N.A3,2],[N.Eb3,2],[N.A3,2],[N.Eb3,2],
  [N.D3,2],[N.Ab3,2],[N.D3,2],[N.Ab3,2],
  [N.A3,8],
  [N.E3,1],[N.E3,1],[N.E3,1],[N.E3,1],[N.E3,1],[N.E3,1],[N.E3,2],
  [N.F3,2],[N.Bb3,2],[N.F3,2],[N.Bb3,2],
  [N.E3,2],[N.Bb3,2],[N.A3,2],[N.Eb3,2],
  [N.A3,8],
];
const BOSS_PULSE: [number, number][] = [
  [N.Eb5,2],[N.D5,2],[N.Eb5,2],[N.D5,2],
  [N.C5,2],[N.Bb4,2],[N.Ab4,2],[N.G4,2],
  [N.Bb4,2],[N.Eb5,2],[N.Bb4,2],[N.Eb5,2],
  [N.A4,4],[N.R,4],
  [N.A5,2],[N.Ab5,2],[N.G5,2],[N.F5,2],
  [N.Eb5,2],[N.D5,2],[N.Eb5,2],[N.F5,2],
  [N.Eb5,2],[N.Bb4,2],[N.Eb5,2],[N.A4,2],
  [N.A4,8],
  [N.Eb5,1],[N.A5,1],[N.Eb5,1],[N.A5,1],[N.Eb5,1],[N.A5,1],[N.Eb5,2],
  [N.D5,2],[N.Eb5,2],[N.D5,2],[N.Eb5,2],
  [N.C5,2],[N.B4,2],[N.Bb4,2],[N.A4,2],
  [N.Ab4,4],[N.A4,4],
  [N.C5,2],[N.Eb5,2],[N.G5,2],[N.Bb5,2],
  [N.A5,2],[N.Ab5,2],[N.G5,2],[N.F5,2],
  [N.Eb5,2],[N.D5,2],[N.Eb5,2],[N.A4,2],
  [N.A4,8],
];
const BOSS_KICK  = [1,0,1,0, 0,0,1,0, 1,0,1,0, 0,0,0,0];
const BOSS_SNARE = [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,1,0];

// ── 敗戦BGM（Dマイナー BPM50 葬送風）
const LOSE_MELODY: [number, number][] = [
  [N.A4,2],[N.G4,2],
  [N.F4,3],[N.R,1],
  [N.E4,2],[N.D4,2],
  [N.C4,4],[N.R,4],
  [N.Bb3,2],[N.A3,2],
  [N.G3,2],[N.F3,2],
  [N.E3,3],[N.R,1],
  [N.D3,4],
];
const LOSE_BASS: [number, number][] = [
  [N.D3,4],[N.A3,4],[N.F3,4],[N.E3,4],
  [N.D3,4],[N.A3,4],[N.F3,4],[N.E3,4],
];
const LOSE_PAD: [number, number][] = [
  [N.D3,8],[N.A3,8],[N.Bb3,8],[N.A3,8],
];

// ─── スケジューラ ──────────────────────────────────────────────────────────

const bgmNodes = new Set<AudioScheduledSourceNode>();

function scheduleNote(
  ac: AudioContext,
  freq: number,
  startTime: number,
  duration: number,
  type: OscillatorType,
  gainVal: number,
  gate: number,
): void {
  if (freq === 0) return;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(gainVal, startTime);
  g.gain.setValueAtTime(gainVal, startTime + duration * gate);
  g.gain.exponentialRampToValueAtTime(0.001, startTime + duration * 0.99);
  osc.connect(g).connect(ac.destination);
  bgmNodes.add(osc);
  osc.addEventListener("ended", () => bgmNodes.delete(osc));
  osc.start(startTime);
  osc.stop(startTime + duration);
}

function scheduleNoise(ac: AudioContext, startTime: number, type: "kick" | "snare"): void {
  const buf = ac.createBuffer(1, ac.sampleRate * 0.05, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const g = ac.createGain();
  const filt = ac.createBiquadFilter();
  filt.type = type === "kick" ? "lowpass" : "bandpass";
  filt.frequency.value = type === "kick" ? 120 : 1800;
  g.gain.setValueAtTime(type === "kick" ? 0.25 : 0.12, startTime);
  g.gain.exponentialRampToValueAtTime(0.001, startTime + (type === "kick" ? 0.08 : 0.04));
  src.connect(filt).connect(g).connect(ac.destination);
  bgmNodes.add(src);
  src.addEventListener("ended", () => bgmNodes.delete(src));
  src.start(startTime);
  src.stop(startTime + 0.1);
}

function loopDuration(pattern: [number, number][], unit: number): number {
  return pattern.reduce((s, [, d]) => s + d * unit, 0);
}

type BgmTrack = "title" | "battle" | "boss" | "lose";

const LOOKAHEAD = 1.5;
const TICK_MS   = 150;

interface ChannelDef {
  notes: [number, number][];
  unit: number;
  type: OscillatorType;
  gain: number;
  gate: number;
}

interface TrackDef {
  channels: ChannelDef[];
  kick?: number[];
  snare?: number[];
  beatUnit?: number;
}

const TRACKS: Record<BgmTrack, TrackDef> = {
  title: {
    channels: [
      { notes: TITLE_MELODY, unit: TITLE_Q, type: "square",   gain: 0.11,  gate: 0.88 },
      { notes: TITLE_PULSE,  unit: TITLE_Q, type: "square",   gain: 0.065, gate: 0.82 },
      { notes: TITLE_BASS,   unit: TITLE_Q, type: "triangle", gain: 0.13,  gate: 0.78 },
    ],
  },
  battle: {
    channels: [
      { notes: BATTLE_MELODY, unit: BATTLE_E, type: "square", gain: 0.11, gate: 0.88 },
      { notes: BATTLE_PULSE,  unit: BATTLE_E, type: "square", gain: 0.07, gate: 0.83 },
      { notes: BATTLE_BASS,   unit: BATTLE_E, type: "square", gain: 0.13, gate: 0.80 },
    ],
    kick: BATTLE_KICK, snare: BATTLE_SNARE, beatUnit: BATTLE_E * 2,
  },
  boss: {
    channels: [
      { notes: BOSS_MELODY, unit: BOSS_E, type: "square",   gain: 0.12, gate: 0.85 },
      { notes: BOSS_PULSE,  unit: BOSS_E, type: "square",   gain: 0.08, gate: 0.80 },
      { notes: BOSS_BASS,   unit: BOSS_E, type: "triangle", gain: 0.16, gate: 0.78 },
    ],
    kick: BOSS_KICK, snare: BOSS_SNARE, beatUnit: BOSS_E * 2,
  },
  lose: {
    channels: [
      { notes: LOSE_MELODY, unit: LOSE_Q, type: "sine",     gain: 0.13,  gate: 0.82 },
      { notes: LOSE_BASS,   unit: LOSE_Q, type: "sawtooth", gain: 0.07,  gate: 0.75 },
      { notes: LOSE_PAD,    unit: LOSE_Q, type: "triangle", gain: 0.055, gate: 0.98 },
    ],
  },
};

interface ChannelState {
  noteIdx: number;
  nextTime: number;
  loopStart: number;
}

let currentTrack: BgmTrack | null = null;
let bgmTimer: ReturnType<typeof setTimeout> | null = null;
let channelStates: ChannelState[][] = [];
let kickNextTime = 0;
let kickIdx      = 0;

function stopBgm(): void {
  currentTrack = null;
  if (bgmTimer !== null) { clearTimeout(bgmTimer); bgmTimer = null; }
  const now = ctx?.currentTime ?? 0;
  bgmNodes.forEach(node => { try { node.stop(now); } catch {} });
  bgmNodes.clear();
}

function tickBgm(ac: AudioContext, track: BgmTrack): void {
  if (currentTrack !== track) return;
  const def = TRACKS[track];
  const horizon = ac.currentTime + LOOKAHEAD;

  def.channels.forEach((ch, ci) => {
    const st = channelStates[ci];
    const loopDur = loopDuration(ch.notes, ch.unit);
    while (st.nextTime < horizon) {
      const [freq, dur] = ch.notes[st.noteIdx];
      const noteDur = dur * ch.unit;
      scheduleNote(ac, freq, st.nextTime, noteDur, ch.type, ch.gain, ch.gate);
      st.nextTime += noteDur;
      st.noteIdx++;
      if (st.noteIdx >= ch.notes.length) {
        st.noteIdx = 0;
        st.loopStart += loopDur;
        st.nextTime = st.loopStart;
      }
    }
  });

  if (def.kick && def.snare && def.beatUnit) {
    const { kick, snare, beatUnit } = def;
    const div = kick.length;
    while (kickNextTime < horizon) {
      const i = kickIdx % div;
      if (kick[i])  scheduleNoise(ac, kickNextTime, "kick");
      if (snare[i]) scheduleNoise(ac, kickNextTime, "snare");
      kickIdx++;
      kickNextTime += beatUnit / (div / 4);
    }
  }

  bgmTimer = setTimeout(() => tickBgm(ac, track), TICK_MS);
}

export const BGM = {
  play(track: BgmTrack): void {
    const ac = getContext();
    if (!ac) return;
    if (currentTrack === track) return;
    stopBgm();
    currentTrack = track;
    if (ac.state === "suspended") ac.resume();
    const start = ac.currentTime + 0.05;
    const def = TRACKS[track];
    channelStates = def.channels.map(() => ({ noteIdx: 0, nextTime: start, loopStart: start }));
    kickNextTime = start;
    kickIdx      = 0;
    tickBgm(ac, track);
  },
  stop: stopBgm,
};
