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

// ─── 武器ごとの効果音 ────────────────────────────────────────────────────────

function sfxSword(): void {
  const audioCtx = getContext(); if (!audioCtx) return;
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = "sawtooth"; osc.frequency.value = 660;
  g.gain.setValueAtTime(0.22, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
  osc.connect(g).connect(audioCtx.destination);
  osc.start(now); osc.stop(now + 0.07);
}

function sfxLance(): void {
  const audioCtx = getContext(); if (!audioCtx) return;
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(260, now);
  osc.frequency.exponentialRampToValueAtTime(80, now + 0.14);
  g.gain.setValueAtTime(0.28, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
  osc.connect(g).connect(audioCtx.destination);
  osc.start(now); osc.stop(now + 0.14);
}

function sfxBow(): void {
  const audioCtx = getContext(); if (!audioCtx) return;
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(1400, now);
  osc.frequency.exponentialRampToValueAtTime(350, now + 0.11);
  g.gain.setValueAtTime(0.2, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
  osc.connect(g).connect(audioCtx.destination);
  osc.start(now); osc.stop(now + 0.11);
}

function sfxTome(): void {
  const audioCtx = getContext(); if (!audioCtx) return;
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(380, now);
  osc.frequency.exponentialRampToValueAtTime(1100, now + 0.1);
  g.gain.setValueAtTime(0.18, now);
  g.gain.setValueAtTime(0.18, now + 0.07);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
  osc.connect(g).connect(audioCtx.destination);
  osc.start(now); osc.stop(now + 0.13);
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

export const SFX = {
  hit: (weaponType?: WeaponType) => doHit(weaponType),
  crit: (weaponType?: WeaponType) => {
    doHit(weaponType);
    setTimeout(() => beep(880, 0.07, "square", 0.13), 35);
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
// 戦闘BGM（Aフリジアン、BPM=104、FE闘技場風の重厚な緊張感）
// E→F の半音上行（フリジアン特有の不安感）を軸に構成
// ──────────────────────────────────────────────
const BATTLE_BPM = 104;
const BATTLE_E = (60 / BATTLE_BPM) / 2; // 8分音符

// 8小節ループ（64 eighth notes）
const BATTLE_MELODY: [number, number][] = [
  // A部：フリジアン上行→下降
  [N.E4,2],[N.F4,2],[N.G4,2],[N.A4,2],
  [N.B4,2],[N.A4,2],[N.G4,2],[N.F4,2],
  [N.E4,2],[N.D4,2],[N.E4,2],[N.F4,2],
  [N.E4,6],[N.R,2],
  // B部：Aから下降して解決
  [N.A4,2],[N.G4,1],[N.F4,1],[N.E4,2],[N.D4,2],
  [N.C4,2],[N.D4,2],[N.E4,4],
  [N.F4,2],[N.E4,1],[N.D4,1],[N.C4,2],[N.B3,2],
  [N.A3,8],
];

const BATTLE_BASS: [number, number][] = [
  [N.A3,4],[N.E3,4],
  [N.F3,4],[N.G3,4],
  [N.G3,4],[N.D3,4],
  [N.A3,8],

  [N.F3,4],[N.G3,4],
  [N.D3,4],[N.A3,4],
  [N.E3,4],[N.B3,4],
  [N.A3,8],
];

const BATTLE_PULSE: [number, number][] = [
  [N.C5,4],[N.B4,4],
  [N.D5,4],[N.C5,4],
  [N.B4,4],[N.C5,4],
  [N.B4,6],[N.R,2],

  [N.E5,4],[N.D5,4],
  [N.E5,4],[N.A4,4],
  [N.A4,4],[N.G4,4],
  [N.A4,8],
];

// マーチ風: 1・3拍にキック、2・4拍にスネア
const BATTLE_KICK =  [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0];
const BATTLE_SNARE = [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0];

// ──────────────────────────────────────────────
// スケジューラ共通関数
// ──────────────────────────────────────────────

// スケジュール済みBGMノードを追跡し、トラック切替時に即時停止する
// muteMaster/unmuteMasterを同一currentTimeで呼ぶ方式は
// Web Audio APIが同時刻イベントとして処理しミュートが機能しないため使用しない
const bgmNodes = new Set<AudioScheduledSourceNode>();

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
  bgmNodes.add(osc);
  osc.addEventListener("ended", () => bgmNodes.delete(osc));
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
  bgmNodes.add(src);
  src.addEventListener("ended", () => bgmNodes.delete(src));
  src.start(startTime);
  src.stop(startTime + 0.1);
}

function loopDuration(pattern: [number, number][], unit: number): number {
  return pattern.reduce((s, [, d]) => s + d * unit, 0);
}

// ──────────────────────────────────────────────
// 敗戦BGM（Cマイナー、BPM=60、静かで悲しげ）
// ──────────────────────────────────────────────
const LOSE_BPM = 60;
const LOSE_Q = 60 / LOSE_BPM;   // 4分音符

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
// BGMプレーヤー（ルックアヘッドスケジューラ）
// ──────────────────────────────────────────────
// 一度に全ノートをスケジュールするとHeadless ChromiumのJSイベントループを
// ブロックするため、1.5秒先読み・150ms毎補充のスケジューラを使用する。

type BgmTrack = "title" | "battle" | "lose";

const LOOKAHEAD = 1.5;  // 先読み秒数
const TICK_MS   = 150;  // 補充間隔

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
      { notes: BATTLE_MELODY, unit: BATTLE_E, type: "square", gain: 0.10, gate: 0.9  },
      { notes: BATTLE_PULSE,  unit: BATTLE_E, type: "square", gain: 0.06, gate: 0.85 },
      { notes: BATTLE_BASS,   unit: BATTLE_E, type: "square", gain: 0.12, gate: 0.80 },
    ],
    kick:     BATTLE_KICK,
    snare:    BATTLE_SNARE,
    beatUnit: BATTLE_E * 2,
  },
  lose: {
    channels: [
      { notes: LOSE_MELODY, unit: LOSE_Q, type: "triangle", gain: 0.10,  gate: 0.90 },
      { notes: LOSE_PAD,    unit: LOSE_Q, type: "triangle", gain: 0.055, gate: 0.95 },
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

function tickBgm(audioCtx: AudioContext, track: BgmTrack): void {
  if (currentTrack !== track) return;
  const def = TRACKS[track];
  const horizon = audioCtx.currentTime + LOOKAHEAD;

  // 各チャンネルのノートを補充
  def.channels.forEach((ch, ci) => {
    const st = channelStates[ci];
    const loopDur = loopDuration(ch.notes, ch.unit);
    while (st.nextTime < horizon) {
      const [freq, dur] = ch.notes[st.noteIdx];
      const noteDur = dur * ch.unit;
      scheduleNote(audioCtx, freq, st.nextTime, noteDur * ch.gate, ch.type, ch.gain);
      st.nextTime += noteDur;
      st.noteIdx++;
      if (st.noteIdx >= ch.notes.length) {
        st.noteIdx = 0;
        st.loopStart += loopDur;
        st.nextTime = st.loopStart;
      }
    }
  });

  // ドラム補充（battleのみ）
  if (def.kick && def.snare && def.beatUnit) {
    const kick = def.kick;
    const snare = def.snare;
    const beatUnit = def.beatUnit;
    const div = kick.length;
    while (kickNextTime < horizon) {
      const i = kickIdx % div;
      if (kick[i])  scheduleNoise(audioCtx, kickNextTime, "kick");
      if (snare[i]) scheduleNoise(audioCtx, kickNextTime, "snare");
      kickIdx++;
      kickNextTime += beatUnit / (div / 4);
    }
  }

  bgmTimer = setTimeout(() => tickBgm(audioCtx, track), TICK_MS);
}

export const BGM = {
  play(track: BgmTrack): void {
    const audioCtx = getContext();
    if (!audioCtx) return;
    if (currentTrack === track) return;
    stopBgm();
    currentTrack = track;
    if (audioCtx.state === "suspended") audioCtx.resume();
    const start = audioCtx.currentTime + 0.05;
    const def = TRACKS[track];
    channelStates = def.channels.map(() => ({ noteIdx: 0, nextTime: start, loopStart: start }));
    kickNextTime = start;
    kickIdx      = 0;
    tickBgm(audioCtx, track);
  },
  stop: stopBgm,
};
