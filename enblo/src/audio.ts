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

// ファミコン風 闘技場マーチ（Aマイナー、BPM=168）
// melody: square wave / bass: square wave / pulse: square wave（和音）
//
// 音符: [Hz, 拍数] (0 = 休符)  拍単位 = 8分音符

const BPM = 168;
const EIGHTH = (60 / BPM) / 2; // 8分音符の秒数

// 周波数定義
const N: Record<string, number> = {
  R:  0,
  E3: 164.81, F3: 174.61, G3: 196.00, A3: 220.00, B3: 246.94,
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00,
  A4: 440.00, B4: 493.88, C5: 523.25, D5: 587.33, E5: 659.25,
  F5: 698.46, G5: 783.99, A5: 880.00, B5: 987.77, C6: 1046.50,
};

// メロディ（8分音符単位）
// FE闘技場風: Aマイナー、駆け足のマーチ感
// A部（8小節）
const MELODY_A: [number, number][] = [
  // bar1: 緊張感のある上昇フレーズ
  [N.A4,1],[N.C5,1],[N.E5,1],[N.A5,1],[N.G5,1],[N.F5,1],[N.E5,2],
  // bar2
  [N.D5,1],[N.E5,1],[N.F5,1],[N.E5,1],[N.D5,1],[N.C5,1],[N.B4,2],
  // bar3
  [N.C5,1],[N.E5,1],[N.G5,1],[N.C6,1],[N.B5,1],[N.A5,1],[N.G5,2],
  // bar4: 半終止
  [N.F5,1],[N.G5,1],[N.A5,1],[N.G5,1],[N.E5,4],
  // bar5
  [N.A4,1],[N.C5,1],[N.E5,1],[N.A5,1],[N.G5,1],[N.F5,1],[N.E5,2],
  // bar6
  [N.D5,1],[N.F5,1],[N.A5,1],[N.G5,1],[N.F5,1],[N.E5,1],[N.D5,2],
  // bar7
  [N.E5,1],[N.D5,1],[N.C5,1],[N.B4,1],[N.C5,1],[N.D5,1],[N.E5,1],[N.F5,1],
  // bar8: 完全終止→ループ
  [N.E5,1],[N.D5,1],[N.C5,1],[N.B4,1],[N.A4,4],
];

// B部（4小節、少し動きを変えてメリハリ）
const MELODY_B: [number, number][] = [
  // bar1
  [N.E5,2],[N.E5,1],[N.F5,1],[N.G5,2],[N.G5,2],
  // bar2
  [N.F5,1],[N.E5,1],[N.D5,1],[N.C5,1],[N.B4,2],[N.A4,2],
  // bar3
  [N.B4,2],[N.D5,2],[N.G5,2],[N.F5,2],
  // bar4
  [N.E5,1],[N.D5,1],[N.C5,1],[N.B4,1],[N.A4,4],
];

const MELODY = [...MELODY_A, ...MELODY_B];

// ベース（2分音符単位、ルート＋5度を刻む）
const BASS_PATTERN: [number, number][] = [
  // A部
  [N.A3,2],[N.E3,2],[N.A3,2],[N.E3,2],
  [N.G3,2],[N.D4,2],[N.G3,2],[N.D4,2],
  [N.C4,2],[N.G3,2],[N.C4,2],[N.G3,2],
  [N.E3,2],[N.A3,2],[N.E3,4],
  [N.A3,2],[N.E3,2],[N.A3,2],[N.E3,2],
  [N.D4,2],[N.A3,2],[N.D4,2],[N.A3,2],
  [N.C4,2],[N.G3,2],[N.C4,2],[N.G3,2],
  [N.E3,4],[N.A3,4],
  // B部
  [N.C4,2],[N.G3,2],[N.C4,2],[N.G3,2],
  [N.D4,2],[N.A3,2],[N.D4,2],[N.A3,2],
  [N.G3,2],[N.D4,2],[N.B3,2],[N.F3,2],
  [N.E3,4],[N.A3,4],
];

// パルス（ハーモニー補助、メロディより少し下）
const PULSE_PATTERN: [number, number][] = [
  // A部
  [N.E4,1],[N.G4,1],[N.A4,1],[N.E5,1],[N.D5,1],[N.C5,1],[N.B4,2],
  [N.A4,1],[N.B4,1],[N.C5,1],[N.B4,1],[N.A4,1],[N.G4,1],[N.F4,2],
  [N.G4,1],[N.B4,1],[N.D5,1],[N.G5,1],[N.F5,1],[N.E5,1],[N.D5,2],
  [N.C5,1],[N.D5,1],[N.E5,1],[N.D5,1],[N.B4,4],
  [N.E4,1],[N.G4,1],[N.A4,1],[N.E5,1],[N.D5,1],[N.C5,1],[N.B4,2],
  [N.A4,1],[N.C5,1],[N.E5,1],[N.D5,1],[N.C5,1],[N.B4,1],[N.A4,2],
  [N.B4,1],[N.A4,1],[N.G4,1],[N.F4,1],[N.G4,1],[N.A4,1],[N.B4,1],[N.C5,1],
  [N.B4,1],[N.A4,1],[N.G4,1],[N.F4,1],[N.E4,4],
  // B部
  [N.G4,2],[N.G4,1],[N.A4,1],[N.B4,2],[N.B4,2],
  [N.C5,1],[N.B4,1],[N.A4,1],[N.G4,1],[N.F4,2],[N.E4,2],
  [N.F4,2],[N.A4,2],[N.D5,2],[N.C5,2],
  [N.B4,1],[N.A4,1],[N.G4,1],[N.F4,1],[N.E4,4],
];

// ノイズ打楽器（クォーター毎に刻む）
const KICK_PATTERN = [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0]; // 4分音符
const SNARE_PATTERN= [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0]; // 裏拍

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
  const freq = audioCtx.createBiquadFilter();
  freq.type = type === "kick" ? "lowpass" : "bandpass";
  freq.frequency.value = type === "kick" ? 120 : 1800;
  g.gain.setValueAtTime(type === "kick" ? 0.25 : 0.12, startTime);
  g.gain.exponentialRampToValueAtTime(0.001, startTime + (type === "kick" ? 0.08 : 0.04));
  src.connect(freq).connect(g).connect(audioCtx.destination);
  src.start(startTime);
  src.stop(startTime + 0.1);
}

function calcLoopDuration(pattern: [number, number][]): number {
  return pattern.reduce((s, [, dur]) => s + dur * EIGHTH, 0);
}

let bgmTimer: ReturnType<typeof setTimeout> | null = null;
let bgmPlaying = false;

function scheduleBgmLoop(audioCtx: AudioContext, startTime: number): void {
  let t = startTime;
  for (const [freq, dur] of MELODY) {
    scheduleNote(audioCtx, freq, t, dur * EIGHTH * 0.9, "square", 0.10);
    t += dur * EIGHTH;
  }

  t = startTime;
  for (const [freq, dur] of PULSE_PATTERN) {
    scheduleNote(audioCtx, freq, t, dur * EIGHTH * 0.85, "square", 0.06);
    t += dur * EIGHTH;
  }

  t = startTime;
  for (const [freq, dur] of BASS_PATTERN) {
    scheduleNote(audioCtx, freq, t, dur * EIGHTH * 0.8, "square", 0.12);
    t += dur * EIGHTH;
  }

  // キック＆スネア（1ループ分）
  const loopBars = MELODY.reduce((s, [, d]) => s + d, 0) / 8; // 何小節か
  const beatSec = EIGHTH * 2;
  const totalBeats = Math.round(loopBars * 4);
  const sixteenthCount = KICK_PATTERN.length;
  for (let bar = 0; bar < Math.floor(loopBars); bar++) {
    for (let i = 0; i < sixteenthCount; i++) {
      const beatTime = startTime + (bar * 4 + i / (sixteenthCount / 4)) * beatSec;
      if (KICK_PATTERN[i]) scheduleNoise(audioCtx, beatTime, "kick");
      if (SNARE_PATTERN[i]) scheduleNoise(audioCtx, beatTime, "snare");
    }
  }
  void totalBeats;

  const loopDuration = calcLoopDuration(MELODY);
  if (bgmPlaying) {
    bgmTimer = setTimeout(() => scheduleBgmLoop(audioCtx, startTime + loopDuration), (loopDuration - 0.2) * 1000);
  }
}

export const BGM = {
  play(): void {
    const audioCtx = getContext();
    if (!audioCtx || bgmPlaying) return;
    bgmPlaying = true;
    if (audioCtx.state === "suspended") audioCtx.resume();
    scheduleBgmLoop(audioCtx, audioCtx.currentTime + 0.05);
  },
  stop(): void {
    bgmPlaying = false;
    if (bgmTimer !== null) {
      clearTimeout(bgmTimer);
      bgmTimer = null;
    }
  },
  isPlaying(): boolean {
    return bgmPlaying;
  },
};
