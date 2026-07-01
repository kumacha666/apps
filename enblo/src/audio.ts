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
  const audioCtx = getContext();
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gainNode.gain.value = gain;
  osc.connect(gainNode).connect(audioCtx.destination);
  const now = audioCtx.currentTime;
  gainNode.gain.setValueAtTime(gain, now);
  gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);
  osc.start(now);
  osc.stop(now + duration);
}

export const SFX = {
  hit: () => beep(220, 0.08, "square", 0.18),
  crit: () => {
    beep(440, 0.05, "sawtooth", 0.2);
    setTimeout(() => beep(660, 0.08, "sawtooth", 0.2), 50);
  },
  miss: () => beep(120, 0.12, "triangle", 0.08),
  win: () => {
    [523, 659, 784].forEach((f, i) => setTimeout(() => beep(f, 0.15, "square", 0.15), i * 90));
  },
  lose: () => {
    [392, 330, 261].forEach((f, i) => setTimeout(() => beep(f, 0.2, "sawtooth", 0.15), i * 120));
  },
  select: () => beep(880, 0.05, "square", 0.1),
};

// ─── BGM ───────────────────────────────────────────────────────────────────
// 音符: [Hz, 8分音符の個数]  0Hz = 休符

const N: Record<string, number> = {
  R:  0,
  D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.00, A3: 220.00, B3: 246.94,
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.00,
  B4: 493.88, C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99,
  A5: 880.00, B5: 987.77, C6: 1046.50,
};

// ──────────────────────────────────────────────
// タイトルBGM（Dマイナー、BPM=76、荘厳・重厚）
// ──────────────────────────────────────────────
const TITLE_BPM = 76;
const TITLE_Q = 60 / TITLE_BPM;       // 4分音符
const TITLE_E = TITLE_Q / 2;          // 8分音符

// メロディ（quarter単位で表記、[Hz, 4分音符数]）
const TITLE_MELODY: [number, number][] = [
  // intro / A部: D → F → A → D（Dm和音感）
  [N.D5,2],[N.C5,1],[N.D5,1],
  [N.F5,2],[N.E5,2],
  [N.D5,2],[N.A4,1],[N.B4,1],
  [N.C5,4],

  [N.A4,2],[N.G4,1],[N.A4,1],
  [N.C5,2],[N.B4,2],
  [N.A4,2],[N.F4,1],[N.G4,1],
  [N.A4,4],

  // B部: 緊張感を上げる
  [N.F5,1],[N.G5,1],[N.A5,2],[N.G5,1],[N.F5,1],[N.E5,2],
  [N.D5,2],[N.E5,1],[N.F5,1],[N.G5,2],[N.F5,2],
  [N.E5,1],[N.F5,1],[N.G5,2],[N.F5,1],[N.E5,1],[N.D5,2],
  [N.C5,2],[N.B4,2],[N.A4,4],
];

const TITLE_BASS: [number, number][] = [
  [N.D3,2],[N.A3,2],[N.D3,2],[N.A3,2],
  [N.F3,2],[N.C4,2],[N.F3,2],[N.C4,2],
  [N.G3,2],[N.D4,2],[N.G3,2],[N.D4,2],
  [N.A3,4],[N.A3,4],

  [N.D3,2],[N.A3,2],[N.D3,2],[N.A3,2],
  [N.F3,2],[N.C4,2],[N.F3,2],[N.C4,2],
  [N.G3,2],[N.D4,2],[N.G3,2],[N.E3,2],
  [N.A3,8],

  [N.D4,2],[N.A3,2],[N.D4,2],[N.A3,2],
  [N.G3,2],[N.D4,2],[N.G3,2],[N.D4,2],
  [N.A3,2],[N.E3,2],[N.A3,2],[N.E3,2],
  [N.F3,2],[N.G3,2],[N.A3,4],
];

const TITLE_PULSE: [number, number][] = [
  [N.F4,2],[N.E4,1],[N.F4,1],[N.A4,2],[N.G4,2],
  [N.F4,2],[N.G4,2],[N.A4,4],
  [N.E4,2],[N.D4,1],[N.E4,1],[N.G4,2],[N.F4,2],
  [N.E4,2],[N.D4,2],[N.C4,4],

  [N.D4,2],[N.A4,2],[N.D4,2],[N.A4,2],
  [N.C4,2],[N.G4,2],[N.C4,2],[N.G4,2],
  [N.D4,2],[N.A4,2],[N.D4,2],[N.A4,2],
  [N.E4,4],[N.A4,4],

  [N.A4,1],[N.B4,1],[N.C5,2],[N.B4,1],[N.A4,1],[N.G4,2],
  [N.F4,2],[N.G4,1],[N.A4,1],[N.B4,2],[N.A4,2],
  [N.G4,1],[N.A4,1],[N.B4,2],[N.A4,1],[N.G4,1],[N.F4,2],
  [N.E4,2],[N.F4,2],[N.E4,4],
];

// ──────────────────────────────────────────────
// 戦闘BGM（Aマイナー、BPM=168、疾走感のあるマーチ）
// ──────────────────────────────────────────────
const BATTLE_BPM = 168;
const BATTLE_E = (60 / BATTLE_BPM) / 2; // 8分音符

const BATTLE_MELODY: [number, number][] = [
  // A部
  [N.A4,1],[N.C5,1],[N.E5,1],[N.A5,1],[N.G5,1],[N.F5,1],[N.E5,2],
  [N.D5,1],[N.E5,1],[N.F5,1],[N.E5,1],[N.D5,1],[N.C5,1],[N.B4,2],
  [N.C5,1],[N.E5,1],[N.G5,1],[N.C6,1],[N.B5,1],[N.A5,1],[N.G5,2],
  [N.F5,1],[N.G5,1],[N.A5,1],[N.G5,1],[N.E5,4],
  [N.A4,1],[N.C5,1],[N.E5,1],[N.A5,1],[N.G5,1],[N.F5,1],[N.E5,2],
  [N.D5,1],[N.F5,1],[N.A5,1],[N.G5,1],[N.F5,1],[N.E5,1],[N.D5,2],
  [N.E5,1],[N.D5,1],[N.C5,1],[N.B4,1],[N.C5,1],[N.D5,1],[N.E5,1],[N.F5,1],
  [N.E5,1],[N.D5,1],[N.C5,1],[N.B4,1],[N.A4,4],
  // B部
  [N.E5,2],[N.E5,1],[N.F5,1],[N.G5,2],[N.G5,2],
  [N.F5,1],[N.E5,1],[N.D5,1],[N.C5,1],[N.B4,2],[N.A4,2],
  [N.B4,2],[N.D5,2],[N.G5,2],[N.F5,2],
  [N.E5,1],[N.D5,1],[N.C5,1],[N.B4,1],[N.A4,4],
];

const BATTLE_BASS: [number, number][] = [
  [N.A3,2],[N.E3,2],[N.A3,2],[N.E3,2],
  [N.G3,2],[N.D4,2],[N.G3,2],[N.D4,2],
  [N.C4,2],[N.G3,2],[N.C4,2],[N.G3,2],
  [N.E3,2],[N.A3,2],[N.E3,4],
  [N.A3,2],[N.E3,2],[N.A3,2],[N.E3,2],
  [N.D4,2],[N.A3,2],[N.D4,2],[N.A3,2],
  [N.C4,2],[N.G3,2],[N.C4,2],[N.G3,2],
  [N.E3,4],[N.A3,4],
  [N.C4,2],[N.G3,2],[N.C4,2],[N.G3,2],
  [N.D4,2],[N.A3,2],[N.D4,2],[N.A3,2],
  [N.G3,2],[N.D4,2],[N.B3,2],[N.F3,2],
  [N.E3,4],[N.A3,4],
];

const BATTLE_PULSE: [number, number][] = [
  [N.E4,1],[N.G4,1],[N.A4,1],[N.E5,1],[N.D5,1],[N.C5,1],[N.B4,2],
  [N.A4,1],[N.B4,1],[N.C5,1],[N.B4,1],[N.A4,1],[N.G4,1],[N.F4,2],
  [N.G4,1],[N.B4,1],[N.D5,1],[N.G5,1],[N.F5,1],[N.E5,1],[N.D5,2],
  [N.C5,1],[N.D5,1],[N.E5,1],[N.D5,1],[N.B4,4],
  [N.E4,1],[N.G4,1],[N.A4,1],[N.E5,1],[N.D5,1],[N.C5,1],[N.B4,2],
  [N.A4,1],[N.C5,1],[N.E5,1],[N.D5,1],[N.C5,1],[N.B4,1],[N.A4,2],
  [N.B4,1],[N.A4,1],[N.G4,1],[N.F4,1],[N.G4,1],[N.A4,1],[N.B4,1],[N.C5,1],
  [N.B4,1],[N.A4,1],[N.G4,1],[N.F4,1],[N.E4,4],
  [N.G4,2],[N.G4,1],[N.A4,1],[N.B4,2],[N.B4,2],
  [N.C5,1],[N.B4,1],[N.A4,1],[N.G4,1],[N.F4,2],[N.E4,2],
  [N.F4,2],[N.A4,2],[N.D5,2],[N.C5,2],
  [N.B4,1],[N.A4,1],[N.G4,1],[N.F4,1],[N.E4,4],
];

const BATTLE_KICK =  [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0];
const BATTLE_SNARE = [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0];

// ──────────────────────────────────────────────
// スケジューラ共通関数
// ──────────────────────────────────────────────

function scheduleNote(
  audioCtx: AudioContext,
  freq: number,
  startTime: number,
  duration: number,
  type: OscillatorType,
  gainVal: number,
): void {
  if (freq === 0) return;
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(gainVal, startTime);
  g.gain.setValueAtTime(gainVal, startTime + duration * 0.85);
  g.gain.exponentialRampToValueAtTime(0.001, startTime + duration * 0.99);
  osc.connect(g).connect(audioCtx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

function scheduleNoise(audioCtx: AudioContext, startTime: number, type: "kick" | "snare"): void {
  const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.05, audioCtx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  const g = audioCtx.createGain();
  const filt = audioCtx.createBiquadFilter();
  filt.type = type === "kick" ? "lowpass" : "bandpass";
  filt.frequency.value = type === "kick" ? 120 : 1800;
  g.gain.setValueAtTime(type === "kick" ? 0.25 : 0.12, startTime);
  g.gain.exponentialRampToValueAtTime(0.001, startTime + (type === "kick" ? 0.08 : 0.04));
  src.connect(filt).connect(g).connect(audioCtx.destination);
  src.start(startTime);
  src.stop(startTime + 0.1);
}

function loopDuration(pattern: [number, number][], eighth: number): number {
  return pattern.reduce((s, [, d]) => s + d * eighth, 0);
}

// ──────────────────────────────────────────────
// 敗戦BGM（Cマイナー、BPM=60、静かで悲しげ）
// ──────────────────────────────────────────────
const LOSE_BPM = 60;
const LOSE_Q = 60 / LOSE_BPM;   // 4分音符
const LOSE_E = LOSE_Q / 2;      // 8分音符

// メロディのみ（triangle波で寂しさを出す）
// C → Eb → G → F → Eb → D → C の下降感
const LOSE_MELODY: [number, number][] = [
  // イントロ：静かに始まる
  [N.C5, 3], [N.R, 1],
  [N.A4, 2], [N.G4, 2],
  [N.F4, 3], [N.R, 1],

  // A部：嘆きのフレーズ
  [N.C5, 2], [N.D5, 1], [N.C5, 1],
  [N.A4, 4],
  [N.G4, 2], [N.A4, 1], [N.G4, 1],
  [N.F4, 3], [N.G4, 1],
  [N.A4, 2], [N.G4, 1], [N.F4, 1],
  [N.E4, 4],
  [N.F4, 2], [N.E4, 2],
  [N.C4, 6], [N.R, 2],
];

// 低音の和音補助（triangle、さらに下）
const LOSE_PAD: [number, number][] = [
  [N.C4, 4], [N.A3, 4], [N.F3, 4],
  [N.C4, 4], [N.A3, 4], [N.G3, 4], [N.F3, 4],
  [N.A3, 4], [N.G3, 4], [N.F3, 4],
  [N.E3, 4], [N.F3, 4], [N.C3, 8],
];

// ──────────────────────────────────────────────
// BGMプレーヤー（トラック切り替え対応）
// ──────────────────────────────────────────────

type BgmTrack = "title" | "battle" | "lose";

let currentTrack: BgmTrack | null = null;
let bgmTimer: ReturnType<typeof setTimeout> | null = null;

function stopBgm(): void {
  currentTrack = null;
  if (bgmTimer !== null) {
    clearTimeout(bgmTimer);
    bgmTimer = null;
  }
}

function scheduleTitleLoop(audioCtx: AudioContext, startTime: number): void {
  const E = TITLE_E;
  const Q = TITLE_Q;

  let t = startTime;
  for (const [freq, dur] of TITLE_MELODY) {
    scheduleNote(audioCtx, freq, t, dur * Q * 0.88, "square", 0.11);
    t += dur * Q;
  }
  t = startTime;
  for (const [freq, dur] of TITLE_PULSE) {
    scheduleNote(audioCtx, freq, t, dur * Q * 0.82, "square", 0.065);
    t += dur * Q;
  }
  t = startTime;
  for (const [freq, dur] of TITLE_BASS) {
    scheduleNote(audioCtx, freq, t, dur * Q * 0.78, "triangle", 0.13);
    t += dur * Q;
  }

  void E; // triangle bassはQ単位なのでEは未使用

  const dur = loopDuration(TITLE_MELODY, Q);
  if (currentTrack === "title") {
    bgmTimer = setTimeout(
      () => scheduleTitleLoop(audioCtx, startTime + dur),
      (dur - 0.2) * 1000,
    );
  }
}

function scheduleBattleLoop(audioCtx: AudioContext, startTime: number): void {
  const E = BATTLE_E;

  let t = startTime;
  for (const [freq, dur] of BATTLE_MELODY) {
    scheduleNote(audioCtx, freq, t, dur * E * 0.9, "square", 0.10);
    t += dur * E;
  }
  t = startTime;
  for (const [freq, dur] of BATTLE_PULSE) {
    scheduleNote(audioCtx, freq, t, dur * E * 0.85, "square", 0.06);
    t += dur * E;
  }
  t = startTime;
  for (const [freq, dur] of BATTLE_BASS) {
    scheduleNote(audioCtx, freq, t, dur * E * 0.80, "square", 0.12);
    t += dur * E;
  }

  // ノイズ打楽器（1ループ分）
  const totalEighths = BATTLE_MELODY.reduce((s, [, d]) => s + d, 0);
  const totalBars = Math.floor(totalEighths / 8);
  const beatSec = E * 2;
  const div = BATTLE_KICK.length;
  for (let bar = 0; bar < totalBars; bar++) {
    for (let i = 0; i < div; i++) {
      const bt = startTime + (bar * 4 + i / (div / 4)) * beatSec;
      if (BATTLE_KICK[i])  scheduleNoise(audioCtx, bt, "kick");
      if (BATTLE_SNARE[i]) scheduleNoise(audioCtx, bt, "snare");
    }
  }

  const dur = loopDuration(BATTLE_MELODY, E);
  if (currentTrack === "battle") {
    bgmTimer = setTimeout(
      () => scheduleBattleLoop(audioCtx, startTime + dur),
      (dur - 0.2) * 1000,
    );
  }
}

function scheduleLoseLoop(audioCtx: AudioContext, startTime: number): void {
  const Q = LOSE_Q;

  let t = startTime;
  for (const [freq, dur] of LOSE_MELODY) {
    scheduleNote(audioCtx, freq, t, dur * Q * 0.90, "triangle", 0.10);
    t += dur * Q;
  }
  t = startTime;
  for (const [freq, dur] of LOSE_PAD) {
    scheduleNote(audioCtx, freq, t, dur * Q * 0.95, "triangle", 0.055);
    t += dur * Q;
  }

  const dur = loopDuration(LOSE_MELODY, Q);
  if (currentTrack === "lose") {
    bgmTimer = setTimeout(
      () => scheduleLoseLoop(audioCtx, startTime + dur),
      (dur - 0.2) * 1000,
    );
  }
}

export const BGM = {
  play(track: BgmTrack): void {
    const audioCtx = getContext();
    if (!audioCtx) return;
    if (currentTrack === track) return;
    stopBgm();
    currentTrack = track;
    if (audioCtx.state === "suspended") audioCtx.resume();
    const startTime = audioCtx.currentTime + 0.05;
    if (track === "title")  scheduleTitleLoop(audioCtx, startTime);
    if (track === "battle") scheduleBattleLoop(audioCtx, startTime);
    if (track === "lose")   scheduleLoseLoop(audioCtx, startTime);
  },
  stop: stopBgm,
};
