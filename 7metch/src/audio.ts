import { G, ANIM } from "./state";
import type { ComboType } from "./types";

// --- BGM System ---
const BGM_MASTER = 0.70;
const BGM_CROSSFADE_MS = 500;

const BGM_SCALE: Record<string, number> = {
  D2: 73.42, F2: 87.31, G2: 98.00, A2: 110.00, C3: 130.81,
  D3: 146.83, F3: 174.61, G3: 196.00, A3: 220.00, C4: 261.63,
  D4: 293.66, F4: 349.23, G4: 392.00, A4: 440.00, C5: 523.25,
  D5: 587.33, F5: 698.46, G5: 783.99, A5: 880.00, C6: 1046.50,
  D6: 1174.66, F6: 1396.91, G6: 1567.98, A6: 1760.00, C7: 2093.00,
};

const BGM_ARP_MID: number[]  = [BGM_SCALE.D4, BGM_SCALE.F4, BGM_SCALE.G4, BGM_SCALE.A4, BGM_SCALE.C5];
const BGM_ARP_HIGH: number[] = [BGM_SCALE.D5, BGM_SCALE.F5, BGM_SCALE.G5, BGM_SCALE.A5, BGM_SCALE.C6];
const BGM_TWINKLE: number[]  = [BGM_SCALE.D6, BGM_SCALE.F6, BGM_SCALE.G6, BGM_SCALE.A6, BGM_SCALE.C7];

const GAME_BASS_NOTES: number[] = [110.00, 130.81, 146.83, 164.81, 196.00];
const GAME_MID_NOTES: number[]  = [220.00, 261.63, 293.66, 329.63, 392.00];
const GAME_HIGH_NOTES: number[] = [440.00, 523.25, 587.33, 659.25, 783.99];
const GAME_SPARKLE_NOTES: number[] = [880.00, 1046.50, 1174.66, 1318.51, 1567.98];

type BgmTrackName = "title" | "select" | "ingame";

interface BgmTrack {
  gain: GainNode | null;
  volume: number;
  nodes: AudioNode[];
  playing: boolean;
  fadeGain: GainNode | null;
  timers: ReturnType<typeof setTimeout>[];
}

const bgmTracks: Record<BgmTrackName, BgmTrack> = {
  title:  { gain: null, volume: 0.70, nodes: [], playing: false, fadeGain: null, timers: [] },
  select: { gain: null, volume: 0.70, nodes: [], playing: false, fadeGain: null, timers: [] },
  ingame: { gain: null, volume: 0.70, nodes: [], playing: false, fadeGain: null, timers: [] },
};

export function initAudio(): void {
  if (!G.audioCtx) {
    try {
      G.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      G.masterGain = G.audioCtx.createGain();
      G.masterGain.gain.value = 0.3 * (G.options.sfxVol / 100);
      G.masterGain.connect(G.audioCtx.destination);
    } catch (e) {
      G.soundEnabled = false;
      return;
    }
  }
  if (G.audioCtx.state === "suspended") G.audioCtx.resume();
  initBgm();
  applyAudioOptions();
}

export function applyAudioOptions(): void {
  if (G.masterGain) G.masterGain.gain.value = 0.3 * (G.options.sfxVol / 100);
  if (G.bgmGain) G.bgmGain.gain.value = BGM_MASTER * (G.options.bgmVol / 100);
}

function now(): number {
  return G.audioCtx!.currentTime;
}

function createNoiseBuffer(duration: number): AudioBuffer {
  const sampleRate = G.audioCtx!.sampleRate;
  const length = sampleRate * duration;
  const buffer = G.audioCtx!.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

function createNoise(duration: number): AudioBufferSourceNode {
  const source = G.audioCtx!.createBufferSource();
  source.buffer = createNoiseBuffer(duration);
  return source;
}

function createPanner(value: number): StereoPannerNode | GainNode {
  if ('createStereoPanner' in G.audioCtx!) {
    const panner = G.audioCtx!.createStereoPanner();
    panner.pan.value = value;
    return panner;
  }
  // Fallback: use gain node (no panning, but no error)
  const gain = G.audioCtx!.createGain();
  gain.gain.value = 1;
  return gain;
}

function initBgm(): void {
  if (G.bgmInitialized || !G.audioCtx) return;
  G.bgmGain = G.audioCtx.createGain();
  G.bgmGain.gain.value = BGM_MASTER;
  G.bgmGain.connect(G.masterGain!);
  for (const key in bgmTracks) {
    const trackName = key as BgmTrackName;
    const trackGain = G.audioCtx.createGain();
    trackGain.gain.value = bgmTracks[trackName].volume;
    const fadeGain = G.audioCtx.createGain();
    fadeGain.gain.value = 0;
    trackGain.connect(fadeGain).connect(G.bgmGain!);
    bgmTracks[trackName].gain = trackGain;
    bgmTracks[trackName].fadeGain = fadeGain;
  }
  G.bgmInitialized = true;
}

function bgmReg(name: BgmTrackName, node: AudioNode): AudioNode {
  bgmTracks[name].nodes.push(node);
  return node;
}

function bgmRegTimer(name: BgmTrackName, id: ReturnType<typeof setTimeout>): void {
  bgmTracks[name].timers.push(id);
}

function bgmPickNote(arr: number[], avoid?: number | null): number {
  let note: number, attempts = 0;
  do {
    note = arr[Math.floor(Math.random() * arr.length)];
    attempts++;
  } while (note === avoid && attempts < 5);
  return note;
}

function bgmCreateLoopingNoise(name: BgmTrackName, duration: number): AudioBufferSourceNode {
  const source = G.audioCtx!.createBufferSource();
  source.buffer = createNoiseBuffer(duration);
  source.loop = true;
  bgmReg(name, source);
  return source;
}

function stopBgmTrack(name: BgmTrackName): void {
  const track = bgmTracks[name];
  track.nodes.forEach(node => {
    try { if ((node as any).stop) (node as any).stop(); if (node.disconnect) node.disconnect(); } catch (e) {}
  });
  track.nodes = [];
  track.playing = false;
  track.timers.forEach(id => clearTimeout(id));
  track.timers = [];
}

function bgmFadeIn(name: BgmTrackName): void {
  const track = bgmTracks[name];
  const t = G.audioCtx!.currentTime;
  track.fadeGain!.gain.cancelScheduledValues(t);
  track.fadeGain!.gain.setValueAtTime(track.fadeGain!.gain.value, t);
  track.fadeGain!.gain.linearRampToValueAtTime(1.0, t + BGM_CROSSFADE_MS / 1000);
}

function bgmFadeOut(name: BgmTrackName): void {
  const track = bgmTracks[name];
  const t = G.audioCtx!.currentTime;
  track.fadeGain!.gain.cancelScheduledValues(t);
  track.fadeGain!.gain.setValueAtTime(track.fadeGain!.gain.value, t);
  track.fadeGain!.gain.linearRampToValueAtTime(0.0, t + BGM_CROSSFADE_MS / 1000);
  setTimeout(() => {
    if (G.currentBgm !== name) stopBgmTrack(name);
  }, BGM_CROSSFADE_MS + 100);
}

export function switchBgm(name: BgmTrackName | null): void {
  if (!G.soundEnabled || !G.audioCtx || !G.bgmInitialized) return;
  if (G.currentBgm === name) return;
  if (G.currentBgm) bgmFadeOut(G.currentBgm as BgmTrackName);
  if (name === null) { G.currentBgm = null; return; }
  G.currentBgm = name;
  bgmTracks[name].playing = true;
  stopBgmTrack(name);
  bgmTracks[name].playing = true;
  startBgmTrack(name);
  bgmFadeIn(name);
}

export function stopAllBgm(): void {
  if (G.currentBgm) bgmFadeOut(G.currentBgm as BgmTrackName);
  G.currentBgm = null;
}

function startBgmTrack(name: BgmTrackName): void {
  stopBgmTrack(name);
  bgmTracks[name].playing = true;
  switch (name) {
    case 'title': bgmStartTitle(); break;
    case 'select': bgmStartSelect(); break;
    case 'ingame': bgmStartIngame(); break;
  }
}

// --- BGM Track: Title ---
function bgmStartTitle(): void {
  const name: BgmTrackName = 'title';
  const dest = bgmTracks[name].gain!;
  const t = G.audioCtx!.currentTime;

  // --- Sub-bass drone: D2 with slow pitch oscillation ---
  const drone = G.audioCtx!.createOscillator();
  drone.type = 'sine';
  drone.frequency.value = BGM_SCALE.D2;
  const droneLfo = G.audioCtx!.createOscillator();
  droneLfo.type = 'sine';
  droneLfo.frequency.value = 0.08;
  const droneLfoGain = G.audioCtx!.createGain();
  droneLfoGain.gain.value = 2.5;
  droneLfo.connect(droneLfoGain).connect(drone.frequency);
  const droneGain = G.audioCtx!.createGain();
  droneGain.gain.value = 0.35;
  drone.connect(droneGain).connect(dest);
  drone.start(t);
  droneLfo.start(t);
  bgmReg(name, drone);
  bgmReg(name, droneLfo);
  bgmReg(name, droneLfoGain);
  bgmReg(name, droneGain);

  // --- Warm pad: D3 + A3 (perfect 5th) through low-pass filtered sawtooth ---
  [BGM_SCALE.D3, BGM_SCALE.A3].forEach((freq, i) => {
    const osc = G.audioCtx!.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    osc.detune.value = i === 0 ? -5 : 5;

    const lp = G.audioCtx!.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 400;
    lp.Q.value = 1.5;

    const filterLfo = G.audioCtx!.createOscillator();
    filterLfo.type = 'sine';
    filterLfo.frequency.value = 0.06 + i * 0.02;
    const filterLfoGain = G.audioCtx!.createGain();
    filterLfoGain.gain.value = 120;
    filterLfo.connect(filterLfoGain).connect(lp.frequency);
    filterLfo.start(t);

    const padGain = G.audioCtx!.createGain();
    padGain.gain.value = 0.25;

    const ampLfo = G.audioCtx!.createOscillator();
    ampLfo.type = 'sine';
    ampLfo.frequency.value = 0.04 + i * 0.015;
    const ampLfoGain = G.audioCtx!.createGain();
    ampLfoGain.gain.value = 0.07;
    ampLfo.connect(ampLfoGain).connect(padGain.gain);
    ampLfo.start(t);

    osc.connect(lp).connect(padGain).connect(dest);
    osc.start(t);
    bgmReg(name, osc);
    bgmReg(name, lp);
    bgmReg(name, filterLfo);
    bgmReg(name, filterLfoGain);
    bgmReg(name, padGain);
    bgmReg(name, ampLfo);
    bgmReg(name, ampLfoGain);
  });

  // --- Additional pad layer: triangle wave on D3 for body ---
  const triPad = G.audioCtx!.createOscillator();
  triPad.type = 'triangle';
  triPad.frequency.value = BGM_SCALE.D3;
  const triLp = G.audioCtx!.createBiquadFilter();
  triLp.type = 'lowpass';
  triLp.frequency.value = 350;
  triLp.Q.value = 0.7;
  const triGain = G.audioCtx!.createGain();
  triGain.gain.value = 0.15;
  triPad.connect(triLp).connect(triGain).connect(dest);
  triPad.start(t);
  bgmReg(name, triPad);
  bgmReg(name, triLp);
  bgmReg(name, triGain);

  // --- Sparse arpeggio: pentatonic notes, sine/triangle, every ~4-6s ---
  let lastArpNote: number | null = null;
  function scheduleArpTitle(): void {
    if (!bgmTracks[name].playing && G.currentBgm !== name) return;
    const delay = 4000 + Math.random() * 3000;
    const timerId = setTimeout(() => {
      if (!bgmTracks[name].playing && G.currentBgm !== name) return;
      const ct = G.audioCtx!.currentTime;

      const note = bgmPickNote(BGM_ARP_MID, lastArpNote);
      lastArpNote = note;

      const osc = G.audioCtx!.createOscillator();
      osc.type = Math.random() > 0.5 ? 'sine' : 'triangle';
      osc.frequency.value = note;

      const arpGain = G.audioCtx!.createGain();
      arpGain.gain.value = 0;
      arpGain.gain.setValueAtTime(0, ct);
      arpGain.gain.linearRampToValueAtTime(0.12, ct + 0.3);
      arpGain.gain.exponentialRampToValueAtTime(0.001, ct + 3.0);

      const arpLp = G.audioCtx!.createBiquadFilter();
      arpLp.type = 'lowpass';
      arpLp.frequency.value = 1200;
      arpLp.Q.value = 0.5;

      osc.connect(arpLp).connect(arpGain).connect(dest);
      osc.start(ct);
      osc.stop(ct + 3.5);

      if (Math.random() > 0.6) {
        const idx = BGM_ARP_MID.indexOf(note);
        const harmNote = BGM_ARP_MID[(idx + 2) % BGM_ARP_MID.length];
        const osc2 = G.audioCtx!.createOscillator();
        osc2.type = 'sine';
        osc2.frequency.value = harmNote;
        const hGain = G.audioCtx!.createGain();
        hGain.gain.value = 0;
        hGain.gain.setValueAtTime(0, ct + 0.15);
        hGain.gain.linearRampToValueAtTime(0.07, ct + 0.45);
        hGain.gain.exponentialRampToValueAtTime(0.001, ct + 2.5);
        osc2.connect(arpLp).connect(hGain).connect(dest);
        osc2.start(ct + 0.15);
        osc2.stop(ct + 3.0);
      }

      scheduleArpTitle();
    }, delay);
    bgmRegTimer(name, timerId);
  }
  const initTimer = setTimeout(() => scheduleArpTitle(), 2000);
  bgmRegTimer(name, initTimer);

  // --- Twinkle layer: distant star sparkles ---
  function scheduleTwinkle(): void {
    if (!bgmTracks[name].playing && G.currentBgm !== name) return;
    const delay = 3000 + Math.random() * 5000;
    const timerId = setTimeout(() => {
      if (!bgmTracks[name].playing && G.currentBgm !== name) return;
      const ct = G.audioCtx!.currentTime;
      const note = bgmPickNote(BGM_TWINKLE);
      const osc = G.audioCtx!.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = note;
      const tGain = G.audioCtx!.createGain();
      tGain.gain.value = 0;
      tGain.gain.setValueAtTime(0, ct);
      tGain.gain.linearRampToValueAtTime(0.06, ct + 0.05);
      tGain.gain.exponentialRampToValueAtTime(0.001, ct + 1.5);
      osc.connect(tGain).connect(dest);
      osc.start(ct);
      osc.stop(ct + 2.0);

      scheduleTwinkle();
    }, delay);
    bgmRegTimer(name, timerId);
  }
  const twinkleInit = setTimeout(() => scheduleTwinkle(), 1500);
  bgmRegTimer(name, twinkleInit);
}

// --- BGM Track: Select ---
function bgmStartSelect(): void {
  const name: BgmTrackName = 'select';
  const dest = bgmTracks[name].gain!;
  const t = G.audioCtx!.currentTime;

  // --- Brighter pad: D3 + A3, pulled back to make room for motif ---
  [BGM_SCALE.D3, BGM_SCALE.A3].forEach((freq, i) => {
    const osc = G.audioCtx!.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    osc.detune.value = i === 0 ? -6 : 6;

    const lp = G.audioCtx!.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700 + i * 100;
    lp.Q.value = 1.5;

    const fLfo = G.audioCtx!.createOscillator();
    fLfo.type = 'sine';
    fLfo.frequency.value = 0.06 + i * 0.02;
    const fLfoG = G.audioCtx!.createGain();
    fLfoG.gain.value = 150;
    fLfo.connect(fLfoG).connect(lp.frequency);
    fLfo.start(t);

    const g = G.audioCtx!.createGain();
    g.gain.value = 0.12;

    osc.connect(lp).connect(g).connect(dest);
    osc.start(t);
    bgmReg(name, osc); bgmReg(name, lp); bgmReg(name, fLfo); bgmReg(name, fLfoG); bgmReg(name, g);
  });

  // --- Sub drone ---
  const subDrone = G.audioCtx!.createOscillator();
  subDrone.type = 'sine';
  subDrone.frequency.value = BGM_SCALE.D2;
  const subG = G.audioCtx!.createGain();
  subG.gain.value = 0.2;
  subDrone.connect(subG).connect(dest);
  subDrone.start(t);
  bgmReg(name, subDrone); bgmReg(name, subG);

  // --- Strong shimmer: constant, louder ---
  const shimmerNoise = bgmCreateLoopingNoise(name, 2);
  const shimmerHp = G.audioCtx!.createBiquadFilter();
  shimmerHp.type = 'highpass';
  shimmerHp.frequency.value = 5000;
  const shimmerLp = G.audioCtx!.createBiquadFilter();
  shimmerLp.type = 'lowpass';
  shimmerLp.frequency.value = 12000;
  const shimmerLfo = G.audioCtx!.createOscillator();
  shimmerLfo.type = 'sine';
  shimmerLfo.frequency.value = 0.2;
  const shimmerLfoG = G.audioCtx!.createGain();
  shimmerLfoG.gain.value = 0.025;
  shimmerLfo.connect(shimmerLfoG);
  const shimmerGain = G.audioCtx!.createGain();
  shimmerGain.gain.value = 0.04;
  shimmerLfoG.connect(shimmerGain.gain);
  shimmerNoise.connect(shimmerHp).connect(shimmerLp).connect(shimmerGain).connect(dest);
  shimmerNoise.start(t);
  shimmerLfo.start(t);
  bgmReg(name, shimmerHp); bgmReg(name, shimmerLp);
  bgmReg(name, shimmerLfo); bgmReg(name, shimmerLfoG); bgmReg(name, shimmerGain);

  // --- Repeating melodic motif: 4-note loop ---
  const motifNotes: number[] = [BGM_SCALE.D5, BGM_SCALE.A4, BGM_SCALE.G4, BGM_SCALE.F4];
  const motifInterval = 0.8;
  let motifIdx = 0;

  function playMotifNote(freq: number, startTime: number): void {
    const osc = G.audioCtx!.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;

    const g = G.audioCtx!.createGain();
    g.gain.value = 0;
    g.gain.setValueAtTime(0, startTime);
    g.gain.linearRampToValueAtTime(0.38, startTime + 0.04);
    g.gain.linearRampToValueAtTime(0.28, startTime + 0.25);
    g.gain.exponentialRampToValueAtTime(0.001, startTime + motifInterval * 0.9);

    const lp = G.audioCtx!.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3500;
    lp.Q.value = 0.8;

    osc.connect(lp).connect(g).connect(dest);
    osc.start(startTime);
    osc.stop(startTime + motifInterval);
  }

  function scheduleMotif(): void {
    if (!bgmTracks[name].playing && G.currentBgm !== name) return;
    const timerId = setTimeout(() => {
      if (!bgmTracks[name].playing && G.currentBgm !== name) return;
      const ct = G.audioCtx!.currentTime;
      const freq = motifNotes[motifIdx % motifNotes.length];
      motifIdx++;
      playMotifNote(freq, ct);
      scheduleMotif();
    }, motifInterval * 1000);
    bgmRegTimer(name, timerId);
  }
  playMotifNote(motifNotes[0], t);
  motifIdx = 1;
  scheduleMotif();

  // --- Rhythmic pulse: clear heartbeat ---
  const pulseOsc = G.audioCtx!.createOscillator();
  pulseOsc.type = 'sine';
  pulseOsc.frequency.value = BGM_SCALE.D2;
  const pulseLfo = G.audioCtx!.createOscillator();
  pulseLfo.type = 'sine';
  pulseLfo.frequency.value = 1.0;
  const pulseShaper = G.audioCtx!.createWaveShaper();
  const shapeLen = 256;
  const shapeCurve = new Float32Array(shapeLen);
  for (let i = 0; i < shapeLen; i++) {
    const x = (i / (shapeLen - 1)) * 2 - 1;
    shapeCurve[i] = x > 0 ? x * x : 0;
  }
  pulseShaper.curve = shapeCurve;
  const pulseLfoGain = G.audioCtx!.createGain();
  pulseLfoGain.gain.value = 0.28;
  pulseLfo.connect(pulseShaper).connect(pulseLfoGain);
  const pulseAmpGain = G.audioCtx!.createGain();
  pulseAmpGain.gain.value = 0;
  pulseLfoGain.connect(pulseAmpGain.gain);
  const pulseLp = G.audioCtx!.createBiquadFilter();
  pulseLp.type = 'lowpass';
  pulseLp.frequency.value = 250;
  pulseLp.Q.value = 3;
  pulseOsc.connect(pulseLp).connect(pulseAmpGain).connect(dest);
  pulseOsc.start(t);
  pulseLfo.start(t);
  bgmReg(name, pulseOsc); bgmReg(name, pulseLfo); bgmReg(name, pulseShaper);
  bgmReg(name, pulseLfoGain); bgmReg(name, pulseAmpGain); bgmReg(name, pulseLp);

  // --- Additional random arpeggios in high register ---
  let lastArpNote: number | null = null;
  function scheduleArpSelect(): void {
    if (!bgmTracks[name].playing && G.currentBgm !== name) return;
    const delay = 2000 + Math.random() * 2000;
    const timerId = setTimeout(() => {
      if (!bgmTracks[name].playing && G.currentBgm !== name) return;
      const ct = G.audioCtx!.currentTime;
      const note = bgmPickNote(BGM_ARP_HIGH, lastArpNote);
      lastArpNote = note;

      const osc = G.audioCtx!.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = note;
      const g = G.audioCtx!.createGain();
      g.gain.value = 0;
      g.gain.setValueAtTime(0, ct);
      g.gain.linearRampToValueAtTime(0.08, ct + 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, ct + 1.5);
      osc.connect(g).connect(dest);
      osc.start(ct);
      osc.stop(ct + 1.8);

      scheduleArpSelect();
    }, delay);
    bgmRegTimer(name, timerId);
  }
  scheduleArpSelect();

  // --- Twinkle ---
  function scheduleTwinkleSelect(): void {
    if (!bgmTracks[name].playing && G.currentBgm !== name) return;
    const delay = 3000 + Math.random() * 4000;
    const timerId = setTimeout(() => {
      if (!bgmTracks[name].playing && G.currentBgm !== name) return;
      const ct = G.audioCtx!.currentTime;
      const note = bgmPickNote(BGM_TWINKLE);
      const osc = G.audioCtx!.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = note;
      const g = G.audioCtx!.createGain();
      g.gain.value = 0;
      g.gain.setValueAtTime(0, ct);
      g.gain.linearRampToValueAtTime(0.06, ct + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, ct + 1.0);
      osc.connect(g).connect(dest);
      osc.start(ct);
      osc.stop(ct + 1.3);
      scheduleTwinkleSelect();
    }, delay);
    bgmRegTimer(name, timerId);
  }
  scheduleTwinkleSelect();
}

// --- BGM Track: Ingame ---
function bgmStartIngame(): void {
  const name: BgmTrackName = 'ingame';
  const dest = bgmTracks[name].gain!;
  const t = G.audioCtx!.currentTime;
  const BPM = 120;
  const beatSec = 60 / BPM;
  const sixteenth = beatSec / 4;

  // --- Synth pad: A3 + E4 (5th), sawtooth + LP400Hz ---
  [220.00, 329.63].forEach((freq, i) => {
    const osc = G.audioCtx!.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    osc.detune.value = i === 0 ? -6 : 6;

    const lp = G.audioCtx!.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 400;
    lp.Q.value = 1.5;

    const fLfo = G.audioCtx!.createOscillator();
    fLfo.type = 'sine';
    fLfo.frequency.value = 0.08 + i * 0.03;
    const fLfoG = G.audioCtx!.createGain();
    fLfoG.gain.value = 250;
    fLfo.connect(fLfoG).connect(lp.frequency);
    fLfo.start(t);

    const g = G.audioCtx!.createGain();
    g.gain.value = 0.115;

    osc.connect(lp).connect(g).connect(dest);
    osc.start(t);
    bgmReg(name, osc); bgmReg(name, lp); bgmReg(name, fLfo); bgmReg(name, fLfoG); bgmReg(name, g);
  });

  // --- Driving bass pattern: eighth notes, syncopated ---
  let bassIdx = 0;
  const bassPattern: number[] = [0, -1, 4, 0, -1, 3, 0, 2];

  function playBassNote(freq: number, startTime: number): void {
    const osc = G.audioCtx!.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const lp = G.audioCtx!.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 350;
    lp.Q.value = 1.5;
    const g = G.audioCtx!.createGain();
    g.gain.value = 0;
    g.gain.setValueAtTime(0, startTime);
    g.gain.linearRampToValueAtTime(0.05, startTime + 0.015);
    g.gain.exponentialRampToValueAtTime(0.004, startTime + beatSec * 0.4);
    g.gain.linearRampToValueAtTime(0, startTime + beatSec * 0.45);
    osc.connect(lp).connect(g).connect(dest);
    osc.start(startTime);
    osc.stop(startTime + beatSec * 0.5);
  }

  function scheduleBass(): void {
    if (!bgmTracks[name].playing && G.currentBgm !== name) return;
    const delay = beatSec * 500;
    const timerId = setTimeout(() => {
      if (!bgmTracks[name].playing && G.currentBgm !== name) return;
      const ct = G.audioCtx!.currentTime;
      const patIdx = bassPattern[bassIdx % bassPattern.length];
      bassIdx++;
      if (patIdx === -1) { scheduleBass(); return; }
      playBassNote(GAME_BASS_NOTES[patIdx], ct);
      scheduleBass();
    }, delay);
    bgmRegTimer(name, timerId);
  }
  playBassNote(GAME_BASS_NOTES[0], t);
  bassIdx = 1;
  scheduleBass();

  // --- Kick drum: four-on-the-floor ---
  let kickCount = 0;
  function playKick(startTime: number): void {
    const osc = G.audioCtx!.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, startTime);
    osc.frequency.exponentialRampToValueAtTime(50, startTime + 0.08);
    const g = G.audioCtx!.createGain();
    g.gain.value = 0;
    g.gain.setValueAtTime(0.21, startTime);
    g.gain.exponentialRampToValueAtTime(0.001, startTime + 0.18);
    osc.connect(g).connect(dest);
    osc.start(startTime);
    osc.stop(startTime + 0.22);
  }

  function scheduleKick(): void {
    if (!bgmTracks[name].playing && G.currentBgm !== name) return;
    const delay = beatSec * 1000;
    const timerId = setTimeout(() => {
      if (!bgmTracks[name].playing && G.currentBgm !== name) return;
      kickCount++;
      playKick(G.audioCtx!.currentTime);
      scheduleKick();
    }, delay);
    bgmRegTimer(name, timerId);
  }
  playKick(t);
  scheduleKick();

  // --- Delay effect for arpeggios ---
  const delayNode = G.audioCtx!.createDelay(1.0);
  delayNode.delayTime.value = beatSec * 0.75;
  const delayFeedback = G.audioCtx!.createGain();
  delayFeedback.gain.value = 0.35;
  const delayFilter = G.audioCtx!.createBiquadFilter();
  delayFilter.type = 'lowpass';
  delayFilter.frequency.value = 2500;
  delayNode.connect(delayFeedback).connect(delayFilter).connect(delayNode);
  delayNode.connect(dest);
  bgmReg(name, delayNode); bgmReg(name, delayFeedback); bgmReg(name, delayFilter);

  // --- Bright arpeggios: frequent, short, punchy with echo ---
  let arpStep = 0;
  let lastGameArp: number | null = null;

  function scheduleGameArp(): void {
    if (!bgmTracks[name].playing && G.currentBgm !== name) return;
    const delay = beatSec * (0.75 + Math.random() * 1.25) * 1000;
    const timerId = setTimeout(() => {
      if (!bgmTracks[name].playing && G.currentBgm !== name) return;
      const ct = G.audioCtx!.currentTime;
      arpStep++;

      const noteArr = arpStep % 3 === 0 ? GAME_HIGH_NOTES : GAME_MID_NOTES;
      const isHigh = arpStep % 3 === 0;
      const note = bgmPickNote(noteArr, lastGameArp);
      lastGameArp = note;

      const osc = G.audioCtx!.createOscillator();
      const waveType: OscillatorType = arpStep % 5 === 0 ? 'square' : (isHigh ? 'triangle' : 'sine');
      osc.type = waveType;
      osc.frequency.value = note;

      const lp = G.audioCtx!.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = isHigh ? 2500 : 3500;
      lp.Q.value = 1.2;

      const peakGain = isHigh ? 0.07 : (waveType === 'square' ? 0.08 : 0.13);
      const sustainGain = isHigh ? 0.043 : (waveType === 'square' ? 0.05 : 0.085);
      const g = G.audioCtx!.createGain();
      g.gain.value = 0;
      g.gain.setValueAtTime(0, ct);
      g.gain.linearRampToValueAtTime(peakGain, ct + 0.015);
      g.gain.linearRampToValueAtTime(sustainGain, ct + 0.15);
      g.gain.exponentialRampToValueAtTime(0.0005, ct + 0.7);

      osc.connect(lp).connect(g);
      g.connect(dest);
      g.connect(delayNode);
      osc.start(ct);
      osc.stop(ct + 0.8);

      if (arpStep % 2 === 0) {
        const idx = noteArr.indexOf(note);
        const next = noteArr[(idx + 2) % noteArr.length];
        const osc2 = G.audioCtx!.createOscillator();
        osc2.type = 'sine';
        osc2.frequency.value = next;
        const g2 = G.audioCtx!.createGain();
        g2.gain.value = 0;
        const offset = beatSec * 0.25;
        const followGain = isHigh ? 0.05 : 0.10;
        g2.gain.setValueAtTime(0, ct + offset);
        g2.gain.linearRampToValueAtTime(followGain, ct + offset + 0.015);
        g2.gain.exponentialRampToValueAtTime(0.0005, ct + offset + 0.5);
        osc2.connect(lp).connect(g2);
        g2.connect(dest);
        g2.connect(delayNode);
        osc2.start(ct + offset);
        osc2.stop(ct + offset + 0.7);
      }

      scheduleGameArp();
    }, delay);
    bgmRegTimer(name, timerId);
  }
  scheduleGameArp();

  // --- Hi-hat pattern: eighth notes with accent variation ---
  let hatBeat = 0;
  function scheduleHat(): void {
    if (!bgmTracks[name].playing && G.currentBgm !== name) return;
    const delay = beatSec * 500;
    const timerId = setTimeout(() => {
      if (!bgmTracks[name].playing && G.currentBgm !== name) return;
      const ct = G.audioCtx!.currentTime;
      hatBeat++;

      const noise = G.audioCtx!.createBufferSource();
      noise.buffer = createNoiseBuffer(0.08);
      const hp = G.audioCtx!.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 7000;
      const g = G.audioCtx!.createGain();
      g.gain.value = 0;
      const accent = hatBeat % 4 === 0 ? 0.10 : (hatBeat % 2 === 0 ? 0.07 : 0.05);
      const duration = hatBeat % 4 === 0 ? 0.09 : 0.05;
      g.gain.setValueAtTime(accent, ct);
      g.gain.exponentialRampToValueAtTime(0.001, ct + duration);
      noise.connect(hp).connect(g).connect(dest);
      noise.start(ct);

      scheduleHat();
    }, delay);
    bgmRegTimer(name, timerId);
  }
  scheduleHat();

  // --- Sparkle accents ---
  function scheduleSparkle(): void {
    if (!bgmTracks[name].playing && G.currentBgm !== name) return;
    const delay = 3000 + Math.random() * 4000;
    const timerId = setTimeout(() => {
      if (!bgmTracks[name].playing && G.currentBgm !== name) return;
      const ct = G.audioCtx!.currentTime;
      const note = bgmPickNote(GAME_SPARKLE_NOTES);
      const osc = G.audioCtx!.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = note;
      const g = G.audioCtx!.createGain();
      g.gain.value = 0;
      g.gain.setValueAtTime(0, ct);
      g.gain.linearRampToValueAtTime(0.14, ct + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, ct + 0.8);
      osc.connect(g).connect(dest);
      osc.start(ct);
      osc.stop(ct + 0.8);
      scheduleSparkle();
    }, delay);
    bgmRegTimer(name, timerId);
  }
  scheduleSparkle();
}

// --- End BGM System ---

export const SFX = {

  // 1. swap() - Warp sound (~0.2s)
  swap(): void {
    if (!G.soundEnabled || !G.audioCtx) return;
    const t = now();

    // Sine sweep 200→800Hz
    const osc1 = G.audioCtx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(200, t);
    osc1.frequency.exponentialRampToValueAtTime(800, t + 0.18);
    const g1 = G.audioCtx.createGain();
    g1.gain.setValueAtTime(0.15, t);
    g1.gain.linearRampToValueAtTime(0.0, t + 0.2);
    osc1.connect(g1).connect(G.masterGain!);
    osc1.start(t);
    osc1.stop(t + 0.2);

    // Triangle sweep 250→900Hz
    const osc2 = G.audioCtx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(250, t);
    osc2.frequency.exponentialRampToValueAtTime(900, t + 0.18);
    const g2 = G.audioCtx.createGain();
    g2.gain.setValueAtTime(0.1, t);
    g2.gain.linearRampToValueAtTime(0.0, t + 0.2);
    osc2.connect(g2).connect(G.masterGain!);
    osc2.start(t);
    osc2.stop(t + 0.2);

    // Bandpass noise whoosh
    const noise = createNoise(0.2);
    const bp = G.audioCtx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(400, t);
    bp.frequency.exponentialRampToValueAtTime(1200, t + 0.15);
    bp.Q.value = 2;
    const gn = G.audioCtx.createGain();
    gn.gain.setValueAtTime(0.08, t);
    gn.gain.linearRampToValueAtTime(0.0, t + 0.2);
    noise.connect(bp).connect(gn).connect(G.masterGain!);
    noise.start(t);
    noise.stop(t + 0.2);
  },

  // 2. invalidSwap() - Error buzz (~0.25s)
  invalidSwap(): void {
    if (!G.soundEnabled || !G.audioCtx) return;
    const t = now();

    // Two detuned square waves at 150Hz
    for (let i = 0; i < 2; i++) {
      const osc = G.audioCtx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(150, t);
      osc.detune.setValueAtTime(i === 0 ? -15 : 15, t);

      // 8Hz LFO vibrato
      const lfo = G.audioCtx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 8;
      const lfoGain = G.audioCtx.createGain();
      lfoGain.gain.value = 20;
      lfo.connect(lfoGain).connect(osc.frequency);
      lfo.start(t);
      lfo.stop(t + 0.25);

      const g = G.audioCtx.createGain();
      g.gain.setValueAtTime(0.12, t);
      g.gain.setValueAtTime(0.12, t + 0.15);
      g.gain.linearRampToValueAtTime(0.0, t + 0.25);
      osc.connect(g).connect(G.masterGain!);
      osc.start(t);
      osc.stop(t + 0.25);
    }
  },

  // 3. drop() - Floating drop (~0.2s)
  drop(): void {
    if (!G.soundEnabled || !G.audioCtx) return;
    const t = now();

    // Sine sweep 400→200Hz (exponential)
    const osc = G.audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, t);
    osc.frequency.exponentialRampToValueAtTime(200, t + 0.18);
    const g = G.audioCtx.createGain();
    g.gain.setValueAtTime(0.15, t);
    g.gain.linearRampToValueAtTime(0.0, t + 0.2);
    osc.connect(g).connect(G.masterGain!);
    osc.start(t);
    osc.stop(t + 0.2);

    // Delay echo (40ms, -12dB)
    const osc2 = G.audioCtx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(400, t + 0.04);
    osc2.frequency.exponentialRampToValueAtTime(200, t + 0.22);
    const g2 = G.audioCtx.createGain();
    g2.gain.setValueAtTime(0.0, t);
    g2.gain.setValueAtTime(0.15 * 0.25, t + 0.04); // -12dB ≈ 0.25
    g2.gain.linearRampToValueAtTime(0.0, t + 0.24);
    osc2.connect(g2).connect(G.masterGain!);
    osc2.start(t + 0.04);
    osc2.stop(t + 0.24);
  },

  // 4. clear(chain) - Star extinction (~0.35s)
  clear(chain?: number): void {
    if (!G.soundEnabled || !G.audioCtx) return;
    const t = now();
    chain = chain || 1;
    const baseFreq = 523 + (chain - 1) * 80;

    // Three detuned sines
    for (let i = -1; i <= 1; i++) {
      const osc = G.audioCtx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(baseFreq, t);
      osc.detune.setValueAtTime(i * 12, t);
      const g = G.audioCtx.createGain();
      g.gain.setValueAtTime(0.12, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      osc.connect(g).connect(G.masterGain!);
      osc.start(t);
      osc.stop(t + 0.35);
    }

    // Sparkle pings (2+chain count, 2000-4000Hz range)
    const sparkleCount = 2 + chain;
    for (let i = 0; i < sparkleCount; i++) {
      const freq = 2000 + Math.random() * 2000;
      const delay = Math.random() * 0.15;
      const osc = G.audioCtx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t + delay);
      const g = G.audioCtx.createGain();
      g.gain.setValueAtTime(0.0, t);
      g.gain.setValueAtTime(0.08, t + delay);
      g.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.12);
      osc.connect(g).connect(G.masterGain!);
      osc.start(t + delay);
      osc.stop(t + delay + 0.15);
    }

    // Delay echo (50ms)
    const echoOsc = G.audioCtx.createOscillator();
    echoOsc.type = 'sine';
    echoOsc.frequency.setValueAtTime(baseFreq * 1.5, t + 0.05);
    const eg = G.audioCtx.createGain();
    eg.gain.setValueAtTime(0.0, t);
    eg.gain.setValueAtTime(0.06, t + 0.05);
    eg.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    echoOsc.connect(eg).connect(G.masterGain!);
    echoOsc.start(t + 0.05);
    echoOsc.stop(t + 0.35);
  },

  // 5. line() - Comet pass (~0.5s)
  line(): void {
    if (!G.soundEnabled || !G.audioCtx) return;
    const t = now();

    // Sawtooth Doppler sweep 1500→400→1200Hz with synced lowpass
    const osc = G.audioCtx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1500, t);
    osc.frequency.exponentialRampToValueAtTime(400, t + 0.25);
    osc.frequency.exponentialRampToValueAtTime(1200, t + 0.48);
    const lp = G.audioCtx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3000, t);
    lp.frequency.exponentialRampToValueAtTime(600, t + 0.25);
    lp.frequency.exponentialRampToValueAtTime(2500, t + 0.48);
    lp.Q.value = 3;
    const g = G.audioCtx.createGain();
    g.gain.setValueAtTime(0.1, t);
    g.gain.setValueAtTime(0.1, t + 0.35);
    g.gain.linearRampToValueAtTime(0.0, t + 0.5);

    // Stereo pan left→right
    const panner = createPanner(-1);
    if ((panner as StereoPannerNode).pan) {
      (panner as StereoPannerNode).pan.setValueAtTime(-1, t);
      (panner as StereoPannerNode).pan.linearRampToValueAtTime(1, t + 0.5);
    }
    osc.connect(lp).connect(g).connect(panner).connect(G.masterGain!);
    osc.start(t);
    osc.stop(t + 0.5);

    // Bandpass noise whoosh
    const noise = createNoise(0.5);
    const bp = G.audioCtx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(2000, t);
    bp.frequency.exponentialRampToValueAtTime(500, t + 0.25);
    bp.frequency.exponentialRampToValueAtTime(1500, t + 0.5);
    bp.Q.value = 1.5;
    const gn = G.audioCtx.createGain();
    gn.gain.setValueAtTime(0.06, t);
    gn.gain.linearRampToValueAtTime(0.0, t + 0.5);
    const panner2 = createPanner(-1);
    if ((panner2 as StereoPannerNode).pan) {
      (panner2 as StereoPannerNode).pan.setValueAtTime(-1, t);
      (panner2 as StereoPannerNode).pan.linearRampToValueAtTime(1, t + 0.5);
    }
    noise.connect(bp).connect(gn).connect(panner2).connect(G.masterGain!);
    noise.start(t);
    noise.stop(t + 0.5);
  },

  // 6. bomb() - Supernova (~0.8s)
  bomb(): void {
    if (!G.soundEnabled || !G.audioCtx) return;
    const t = now();

    // Noise burst through sweeping lowpass 8k→200Hz
    const noise = createNoise(0.8);
    const lp = G.audioCtx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(8000, t);
    lp.frequency.exponentialRampToValueAtTime(200, t + 0.6);
    lp.Q.value = 2;
    const gn = G.audioCtx.createGain();
    gn.gain.setValueAtTime(0.2, t);
    gn.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
    noise.connect(lp).connect(gn).connect(G.masterGain!);
    noise.start(t);
    noise.stop(t + 0.8);

    // Sub-bass 60Hz
    const sub = G.audioCtx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = 60;
    const gs = G.audioCtx.createGain();
    gs.gain.setValueAtTime(0.2, t);
    gs.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    sub.connect(gs).connect(G.masterGain!);
    sub.start(t);
    sub.stop(t + 0.7);

    // 3 detuned sawtooth rumble 40/55/75Hz through lowpass 150Hz
    [40, 55, 75].forEach(freq => {
      const osc = G.audioCtx!.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      const lp2 = G.audioCtx!.createBiquadFilter();
      lp2.type = 'lowpass';
      lp2.frequency.value = 150;
      lp2.Q.value = 1;
      const g = G.audioCtx!.createGain();
      g.gain.setValueAtTime(0.1, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.75);
      osc.connect(lp2).connect(g).connect(G.masterGain!);
      osc.start(t);
      osc.stop(t + 0.8);
    });

    // Shockwave ping 200Hz with delay echo
    const ping = G.audioCtx.createOscillator();
    ping.type = 'sine';
    ping.frequency.setValueAtTime(200, t);
    ping.frequency.exponentialRampToValueAtTime(80, t + 0.3);
    const gp = G.audioCtx.createGain();
    gp.gain.setValueAtTime(0.15, t);
    gp.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    ping.connect(gp).connect(G.masterGain!);
    ping.start(t);
    ping.stop(t + 0.3);

    // Delay echo of shockwave
    const ping2 = G.audioCtx.createOscillator();
    ping2.type = 'sine';
    ping2.frequency.setValueAtTime(200, t + 0.08);
    ping2.frequency.exponentialRampToValueAtTime(80, t + 0.38);
    const gp2 = G.audioCtx.createGain();
    gp2.gain.setValueAtTime(0.0, t);
    gp2.gain.setValueAtTime(0.07, t + 0.08);
    gp2.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
    ping2.connect(gp2).connect(G.masterGain!);
    ping2.start(t + 0.08);
    ping2.stop(t + 0.4);
  },

  // 7. rainbow() - Black hole (~0.8s)
  rainbow(): void {
    if (!G.soundEnabled || !G.audioCtx) return;
    const t = now();

    // Low sine 80Hz drone with 3Hz LFO vibrato, REVERSED envelope
    const drone = G.audioCtx.createOscillator();
    drone.type = 'sine';
    drone.frequency.value = 80;
    const lfo = G.audioCtx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 3;
    const lfoGain = G.audioCtx.createGain();
    lfoGain.gain.value = 15;
    lfo.connect(lfoGain).connect(drone.frequency);
    lfo.start(t);
    lfo.stop(t + 0.8);
    // Reversed envelope: quiet→swell→peak→cut
    const gd = G.audioCtx.createGain();
    gd.gain.setValueAtTime(0.02, t);
    gd.gain.linearRampToValueAtTime(0.18, t + 0.55);
    gd.gain.setValueAtTime(0.18, t + 0.65);
    gd.gain.linearRampToValueAtTime(0.0, t + 0.72);
    drone.connect(gd).connect(G.masterGain!);
    drone.start(t);
    drone.stop(t + 0.8);

    // 3 sawtooth sweep 1500/1600/1700→60Hz through closing lowpass
    [1500, 1600, 1700].forEach(startFreq => {
      const osc = G.audioCtx!.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(startFreq, t);
      osc.frequency.exponentialRampToValueAtTime(60, t + 0.7);
      const lp = G.audioCtx!.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(4000, t);
      lp.frequency.exponentialRampToValueAtTime(100, t + 0.7);
      lp.Q.value = 4;
      const g = G.audioCtx!.createGain();
      g.gain.setValueAtTime(0.01, t);
      g.gain.linearRampToValueAtTime(0.08, t + 0.5);
      g.gain.linearRampToValueAtTime(0.0, t + 0.75);
      osc.connect(lp).connect(g).connect(G.masterGain!);
      osc.start(t);
      osc.stop(t + 0.8);
    });

    // Eerie triangle harmonics at 120/160Hz
    [120, 160].forEach(freq => {
      const osc = G.audioCtx!.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const g = G.audioCtx!.createGain();
      g.gain.setValueAtTime(0.01, t);
      g.gain.linearRampToValueAtTime(0.1, t + 0.5);
      g.gain.linearRampToValueAtTime(0.0, t + 0.75);
      osc.connect(g).connect(G.masterGain!);
      osc.start(t);
      osc.stop(t + 0.8);
    });
  },

  // 8. diagonal() - Meteor shower (~0.4s)
  diagonal(): void {
    if (!G.soundEnabled || !G.audioCtx) return;
    const t = now();

    // 5 sequential descending sine pings, spaced 60ms
    for (let i = 0; i < 5; i++) {
      const startTime = t + i * 0.06;
      const startFreq = 1200 + (Math.random() * 200 - 100);
      const osc = G.audioCtx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(startFreq, startTime);
      osc.frequency.exponentialRampToValueAtTime(startFreq - 600, startTime + 0.08);
      const g = G.audioCtx.createGain();
      g.gain.setValueAtTime(0.0, t);
      g.gain.setValueAtTime(0.12, startTime);
      g.gain.exponentialRampToValueAtTime(0.001, startTime + 0.1);
      osc.connect(g).connect(G.masterGain!);
      osc.start(startTime);
      osc.stop(startTime + 0.12);

      // Highpass noise sparkle tail
      const noise = createNoise(0.1);
      const hp = G.audioCtx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 4000 + i * 400;
      hp.Q.value = 1;
      const gn = G.audioCtx.createGain();
      gn.gain.setValueAtTime(0.0, t);
      gn.gain.setValueAtTime(0.05, startTime);
      gn.gain.exponentialRampToValueAtTime(0.001, startTime + 0.08);
      noise.connect(hp).connect(gn).connect(G.masterGain!);
      noise.start(startTime);
      noise.stop(startTime + 0.1);
    }
  },

  // 9. cross() - Comet collision (~0.5s)
  cross(): void {
    if (!G.soundEnabled || !G.audioCtx) return;
    const t = now();

    // Ascending sawtooth sweep 200→1000Hz
    const osc1 = G.audioCtx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(200, t);
    osc1.frequency.exponentialRampToValueAtTime(1000, t + 0.25);
    const lp1 = G.audioCtx.createBiquadFilter();
    lp1.type = 'lowpass';
    lp1.frequency.value = 2000;
    lp1.Q.value = 2;
    const g1 = G.audioCtx.createGain();
    g1.gain.setValueAtTime(0.1, t);
    g1.gain.linearRampToValueAtTime(0.15, t + 0.24);
    g1.gain.linearRampToValueAtTime(0.0, t + 0.35);
    osc1.connect(lp1).connect(g1).connect(G.masterGain!);
    osc1.start(t);
    osc1.stop(t + 0.35);

    // Descending sawtooth sweep 2000→1000Hz
    const osc2 = G.audioCtx.createOscillator();
    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(2000, t);
    osc2.frequency.exponentialRampToValueAtTime(1000, t + 0.25);
    const lp2 = G.audioCtx.createBiquadFilter();
    lp2.type = 'lowpass';
    lp2.frequency.value = 3000;
    lp2.Q.value = 2;
    const g2 = G.audioCtx.createGain();
    g2.gain.setValueAtTime(0.1, t);
    g2.gain.linearRampToValueAtTime(0.15, t + 0.24);
    g2.gain.linearRampToValueAtTime(0.0, t + 0.35);
    osc2.connect(lp2).connect(g2).connect(G.masterGain!);
    osc2.start(t);
    osc2.stop(t + 0.35);

    // Impact: noise burst at convergence
    const noise = createNoise(0.3);
    const lp3 = G.audioCtx.createBiquadFilter();
    lp3.type = 'lowpass';
    lp3.frequency.setValueAtTime(6000, t + 0.25);
    lp3.frequency.exponentialRampToValueAtTime(200, t + 0.5);
    lp3.Q.value = 1;
    const gn = G.audioCtx.createGain();
    gn.gain.setValueAtTime(0.0, t);
    gn.gain.setValueAtTime(0.18, t + 0.25);
    gn.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    noise.connect(lp3).connect(gn).connect(G.masterGain!);
    noise.start(t + 0.2);
    noise.stop(t + 0.5);

    // Sub-bass 80Hz thump at impact
    const sub = G.audioCtx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = 80;
    const gs = G.audioCtx.createGain();
    gs.gain.setValueAtTime(0.0, t);
    gs.gain.setValueAtTime(0.2, t + 0.25);
    gs.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    sub.connect(gs).connect(G.masterGain!);
    sub.start(t + 0.25);
    sub.stop(t + 0.5);
  },

  // 10. starCross() - Meteor storm (~0.6s)
  starCross(): void {
    if (!G.soundEnabled || !G.audioCtx) return;
    const t = now();

    // 4 directional sweeps converging to 800Hz
    const starts = [200, 2000, 400, 1600];
    starts.forEach((startFreq, i) => {
      const osc = G.audioCtx!.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(startFreq, t);
      osc.frequency.exponentialRampToValueAtTime(800, t + 0.3);
      const lp = G.audioCtx!.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2500;
      lp.Q.value = 2;
      const g = G.audioCtx!.createGain();
      g.gain.setValueAtTime(0.08, t);
      g.gain.linearRampToValueAtTime(0.12, t + 0.28);
      g.gain.linearRampToValueAtTime(0.0, t + 0.4);
      // Pan each sweep to a different position
      const panVal = [-0.8, 0.8, -0.4, 0.4][i];
      const panner = createPanner(panVal);
      if ((panner as StereoPannerNode).pan) {
        (panner as StereoPannerNode).pan.setValueAtTime(panVal, t);
        (panner as StereoPannerNode).pan.linearRampToValueAtTime(0, t + 0.3);
      }
      osc.connect(lp).connect(g).connect(panner).connect(G.masterGain!);
      osc.start(t);
      osc.stop(t + 0.4);
    });

    // Impact noise burst
    const noise = createNoise(0.3);
    const lp = G.audioCtx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(8000, t + 0.3);
    lp.frequency.exponentialRampToValueAtTime(300, t + 0.6);
    lp.Q.value = 1;
    const gn = G.audioCtx.createGain();
    gn.gain.setValueAtTime(0.0, t);
    gn.gain.setValueAtTime(0.15, t + 0.3);
    gn.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    noise.connect(lp).connect(gn).connect(G.masterGain!);
    noise.start(t + 0.25);
    noise.stop(t + 0.6);

    // 3 shimmer pings
    for (let i = 0; i < 3; i++) {
      const freq = 1800 + i * 600;
      const delay = 0.3 + i * 0.04;
      const osc = G.audioCtx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t + delay);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.7, t + delay + 0.15);
      const g = G.audioCtx.createGain();
      g.gain.setValueAtTime(0.0, t);
      g.gain.setValueAtTime(0.1, t + delay);
      g.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.15);
      osc.connect(g).connect(G.masterGain!);
      osc.start(t + delay);
      osc.stop(t + delay + 0.18);
    }
  },

  // 11. tripleLine() - Comet swarm (~0.6s)
  tripleLine(): void {
    if (!G.soundEnabled || !G.audioCtx) return;
    const t = now();

    // 3 detuned sawtooth sweeps with V-shaped Doppler curves
    [-100, 0, 100].forEach((detuneCents, i) => {
      const osc = G.audioCtx!.createOscillator();
      osc.type = 'sawtooth';
      osc.detune.setValueAtTime(detuneCents, t);
      // V-shaped Doppler: high → low → high
      osc.frequency.setValueAtTime(1400 + i * 50, t);
      osc.frequency.exponentialRampToValueAtTime(350, t + 0.3);
      osc.frequency.exponentialRampToValueAtTime(1200 + i * 50, t + 0.58);
      const lp = G.audioCtx!.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(3000, t);
      lp.frequency.exponentialRampToValueAtTime(600, t + 0.3);
      lp.frequency.exponentialRampToValueAtTime(2500, t + 0.58);
      lp.Q.value = 3;
      const g = G.audioCtx!.createGain();
      g.gain.setValueAtTime(0.08, t);
      g.gain.setValueAtTime(0.08, t + 0.45);
      g.gain.linearRampToValueAtTime(0.0, t + 0.6);
      const panVal = (i - 1) * 0.6;
      const panner = createPanner(panVal);
      osc.connect(lp).connect(g).connect(panner).connect(G.masterGain!);
      osc.start(t);
      osc.stop(t + 0.6);
    });

    // Heavy bandpass noise
    const noise = createNoise(0.6);
    const bp = G.audioCtx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1800, t);
    bp.frequency.exponentialRampToValueAtTime(400, t + 0.3);
    bp.frequency.exponentialRampToValueAtTime(1500, t + 0.6);
    bp.Q.value = 2;
    const gn = G.audioCtx.createGain();
    gn.gain.setValueAtTime(0.1, t);
    gn.gain.linearRampToValueAtTime(0.0, t + 0.6);
    noise.connect(bp).connect(gn).connect(G.masterGain!);
    noise.start(t);
    noise.stop(t + 0.6);
  },

  // 12. bigBomb() - Big bang (~1.2s)
  bigBomb(): void {
    if (!G.soundEnabled || !G.audioCtx) return;
    const t = now();
    const onset = t + 0.02; // 20ms silence

    // Massive noise burst (lowpass 12k→100Hz)
    const noise = createNoise(1.2);
    const lp = G.audioCtx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(12000, onset);
    lp.frequency.exponentialRampToValueAtTime(100, onset + 0.9);
    lp.Q.value = 2;
    const gn = G.audioCtx.createGain();
    gn.gain.setValueAtTime(0.0, t);
    gn.gain.setValueAtTime(0.5, onset);
    gn.gain.exponentialRampToValueAtTime(0.001, onset + 1.1);
    noise.connect(lp).connect(gn).connect(G.masterGain!);
    noise.start(onset);
    noise.stop(onset + 1.18);

    // Deep sub-bass 45Hz
    const sub = G.audioCtx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = 45;
    const gs = G.audioCtx.createGain();
    gs.gain.setValueAtTime(0.0, t);
    gs.gain.setValueAtTime(0.25, onset);
    gs.gain.exponentialRampToValueAtTime(0.001, onset + 1.0);
    sub.connect(gs).connect(G.masterGain!);
    sub.start(onset);
    sub.stop(onset + 1.0);

    // 4 detuned rumble 35/50/65/80Hz
    [35, 50, 65, 80].forEach(freq => {
      const osc = G.audioCtx!.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      const lpR = G.audioCtx!.createBiquadFilter();
      lpR.type = 'lowpass';
      lpR.frequency.value = 180;
      lpR.Q.value = 1;
      const g = G.audioCtx!.createGain();
      g.gain.setValueAtTime(0.0, t);
      g.gain.setValueAtTime(0.08, onset);
      g.gain.exponentialRampToValueAtTime(0.001, onset + 1.0);
      osc.connect(lpR).connect(g).connect(G.masterGain!);
      osc.start(onset);
      osc.stop(onset + 1.0);
    });

    // 3 shockwave pings with delays
    for (let i = 0; i < 3; i++) {
      const delay = i * 0.12;
      const ping = G.audioCtx.createOscillator();
      ping.type = 'sine';
      ping.frequency.setValueAtTime(250 - i * 40, onset + delay);
      ping.frequency.exponentialRampToValueAtTime(60, onset + delay + 0.3);
      const gp = G.audioCtx.createGain();
      gp.gain.setValueAtTime(0.0, t);
      gp.gain.setValueAtTime(0.12 - i * 0.03, onset + delay);
      gp.gain.exponentialRampToValueAtTime(0.001, onset + delay + 0.3);
      ping.connect(gp).connect(G.masterGain!);
      ping.start(onset + delay);
      ping.stop(onset + delay + 0.35);
    }

    // Wide sawtooth sweep 3k→50Hz
    const sweep = G.audioCtx.createOscillator();
    sweep.type = 'sawtooth';
    sweep.frequency.setValueAtTime(3000, onset);
    sweep.frequency.exponentialRampToValueAtTime(50, onset + 0.8);
    const lpS = G.audioCtx.createBiquadFilter();
    lpS.type = 'lowpass';
    lpS.frequency.setValueAtTime(5000, onset);
    lpS.frequency.exponentialRampToValueAtTime(100, onset + 0.8);
    lpS.Q.value = 3;
    const gSweep = G.audioCtx.createGain();
    gSweep.gain.setValueAtTime(0.0, t);
    gSweep.gain.setValueAtTime(0.12, onset);
    gSweep.gain.exponentialRampToValueAtTime(0.001, onset + 0.9);
    sweep.connect(lpS).connect(gSweep).connect(G.masterGain!);
    sweep.start(onset);
    sweep.stop(onset + 0.9);
  },

  // 13. rainbowLine() - Gravitational catapult (~0.77s)
  rainbowLine(): void {
    if (!G.soundEnabled || !G.audioCtx) return;
    const t = now();

    // Phase 1: Short black hole drone + descending vortex sweep (~0.22s)
    const drone = G.audioCtx.createOscillator();
    drone.type = 'sine';
    drone.frequency.value = 80;
    const lfo = G.audioCtx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 5;
    const lfoG = G.audioCtx.createGain();
    lfoG.gain.value = 20;
    lfo.connect(lfoG).connect(drone.frequency);
    lfo.start(t);
    lfo.stop(t + 0.22);
    const gd = G.audioCtx.createGain();
    gd.gain.setValueAtTime(0.12, t);
    gd.gain.linearRampToValueAtTime(0.0, t + 0.22);
    drone.connect(gd).connect(G.masterGain!);
    drone.start(t);
    drone.stop(t + 0.22);

    // Descending vortex sweep
    const vortex = G.audioCtx.createOscillator();
    vortex.type = 'sawtooth';
    vortex.frequency.setValueAtTime(2000, t);
    vortex.frequency.exponentialRampToValueAtTime(100, t + 0.22);
    const lpV = G.audioCtx.createBiquadFilter();
    lpV.type = 'lowpass';
    lpV.frequency.setValueAtTime(4000, t);
    lpV.frequency.exponentialRampToValueAtTime(200, t + 0.22);
    lpV.Q.value = 5;
    const gv = G.audioCtx.createGain();
    gv.gain.setValueAtTime(0.1, t);
    gv.gain.linearRampToValueAtTime(0.0, t + 0.22);
    vortex.connect(lpV).connect(gv).connect(G.masterGain!);
    vortex.start(t);
    vortex.stop(t + 0.22);

    // Phase 2: 5 rapid comet whooshes 110ms apart with increasing pitch
    for (let i = 0; i < 5; i++) {
      const st = t + 0.22 + i * 0.11;
      const baseFreq = 400 + i * 150;
      const osc = G.audioCtx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(baseFreq, st);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 2.5, st + 0.08);
      const lp = G.audioCtx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(baseFreq * 3, st);
      lp.frequency.exponentialRampToValueAtTime(baseFreq, st + 0.09);
      lp.Q.value = 2;
      const g = G.audioCtx.createGain();
      g.gain.setValueAtTime(0.0, t);
      g.gain.setValueAtTime(0.1, st);
      g.gain.exponentialRampToValueAtTime(0.001, st + 0.1);

      const panVal = -0.6 + i * 0.3;
      const panner = createPanner(panVal);
      osc.connect(lp).connect(g).connect(panner).connect(G.masterGain!);
      osc.start(st);
      osc.stop(st + 0.11);

      // Noise tail per whoosh
      const n = createNoise(0.08);
      const bp = G.audioCtx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = baseFreq * 2;
      bp.Q.value = 1;
      const gn = G.audioCtx.createGain();
      gn.gain.setValueAtTime(0.0, t);
      gn.gain.setValueAtTime(0.05, st);
      gn.gain.exponentialRampToValueAtTime(0.001, st + 0.08);
      n.connect(bp).connect(gn).connect(panner).connect(G.masterGain!);
      n.start(st);
      n.stop(st + 0.08);
    }
  },

  // 14. rainbowBomb() - Quasar (~1.0s)
  rainbowBomb(): void {
    if (!G.soundEnabled || !G.audioCtx) return;
    const t = now();

    // Sustained energy beam: bandpass noise Q=10, sweeping 500→4k→1kHz
    const beam = createNoise(0.7);
    const bp = G.audioCtx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(500, t);
    bp.frequency.exponentialRampToValueAtTime(4000, t + 0.35);
    bp.frequency.exponentialRampToValueAtTime(1000, t + 0.65);
    bp.Q.value = 10;
    const gb = G.audioCtx.createGain();
    gb.gain.setValueAtTime(0.15, t);
    gb.gain.setValueAtTime(0.15, t + 0.5);
    gb.gain.linearRampToValueAtTime(0.0, t + 0.7);
    beam.connect(bp).connect(gb).connect(G.masterGain!);
    beam.start(t);
    beam.stop(t + 0.7);

    // Sub-bass 50Hz
    const sub = G.audioCtx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = 50;
    const gs = G.audioCtx.createGain();
    gs.gain.setValueAtTime(0.18, t);
    gs.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
    sub.connect(gs).connect(G.masterGain!);
    sub.start(t);
    sub.stop(t + 0.8);

    // 3 explosion aftershocks (noise + lowpass + bass thump)
    for (let i = 0; i < 3; i++) {
      const st = t + 0.3 + i * 0.22;

      // Noise
      const n = createNoise(0.2);
      const lp = G.audioCtx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(6000 - i * 1500, st);
      lp.frequency.exponentialRampToValueAtTime(200, st + 0.18);
      lp.Q.value = 1;
      const gn = G.audioCtx.createGain();
      gn.gain.setValueAtTime(0.0, t);
      gn.gain.setValueAtTime(0.15 - i * 0.04, st);
      gn.gain.exponentialRampToValueAtTime(0.001, st + 0.18);
      n.connect(lp).connect(gn).connect(G.masterGain!);
      n.start(st);
      n.stop(st + 0.2);

      // Bass thump
      const bass = G.audioCtx.createOscillator();
      bass.type = 'sine';
      bass.frequency.setValueAtTime(80 - i * 10, st);
      bass.frequency.exponentialRampToValueAtTime(30, st + 0.15);
      const gBass = G.audioCtx.createGain();
      gBass.gain.setValueAtTime(0.0, t);
      gBass.gain.setValueAtTime(0.15 - i * 0.04, st);
      gBass.gain.exponentialRampToValueAtTime(0.001, st + 0.15);
      bass.connect(gBass).connect(G.masterGain!);
      bass.start(st);
      bass.stop(st + 0.18);
    }
  },

  // 15. boardClear() - Galaxy collision (~1.5s)
  boardClear(): void {
    if (!G.soundEnabled || !G.audioCtx) return;
    const t = now();

    // 4-oscillator harmonic build-up (root/3rd/5th/octave) sweeping 200→2000Hz through opening lowpass
    const intervals = [1, 1.25, 1.5, 2]; // root, major 3rd, 5th, octave
    intervals.forEach((ratio, i) => {
      const osc = G.audioCtx!.createOscillator();
      osc.type = i % 2 === 0 ? 'sawtooth' : 'triangle';
      osc.frequency.setValueAtTime(200 * ratio, t);
      osc.frequency.exponentialRampToValueAtTime(2000 * ratio, t + 0.7);
      const lp = G.audioCtx!.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(400, t);
      lp.frequency.exponentialRampToValueAtTime(6000, t + 0.7);
      lp.Q.value = 3;
      const g = G.audioCtx!.createGain();
      g.gain.setValueAtTime(0.03, t);
      g.gain.linearRampToValueAtTime(0.1, t + 0.65);
      g.gain.linearRampToValueAtTime(0.0, t + 0.8);
      osc.connect(lp).connect(g).connect(G.masterGain!);
      osc.start(t);
      osc.stop(t + 0.8);
    });

    // Climax: massive noise explosion
    const noise = createNoise(0.8);
    const lp = G.audioCtx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(12000, t + 0.7);
    lp.frequency.exponentialRampToValueAtTime(150, t + 1.4);
    lp.Q.value = 1;
    const gn = G.audioCtx.createGain();
    gn.gain.setValueAtTime(0.0, t);
    gn.gain.setValueAtTime(0.35, t + 0.7);
    gn.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
    noise.connect(lp).connect(gn).connect(G.masterGain!);
    noise.start(t + 0.65);
    noise.stop(t + 1.45);

    // Bass drop 200→30Hz
    const bass = G.audioCtx.createOscillator();
    bass.type = 'sine';
    bass.frequency.setValueAtTime(200, t + 0.7);
    bass.frequency.exponentialRampToValueAtTime(30, t + 1.4);
    const gBass = G.audioCtx.createGain();
    gBass.gain.setValueAtTime(0.0, t);
    gBass.gain.setValueAtTime(0.25, t + 0.7);
    gBass.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
    bass.connect(gBass).connect(G.masterGain!);
    bass.start(t + 0.7);
    bass.stop(t + 1.45);

    // 5 shimmer harmonics
    for (let i = 0; i < 5; i++) {
      const freq = 1200 + i * 400;
      const delay = 0.7 + i * 0.05;
      const osc = G.audioCtx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t + delay);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.5, t + delay + 0.4);
      const g = G.audioCtx.createGain();
      g.gain.setValueAtTime(0.0, t);
      g.gain.setValueAtTime(0.08, t + delay);
      g.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.4);
      osc.connect(g).connect(G.masterGain!);
      osc.start(t + delay);
      osc.stop(t + delay + 0.45);
    }

    // Sub-rumble
    const rumble = G.audioCtx.createOscillator();
    rumble.type = 'sawtooth';
    rumble.frequency.value = 35;
    const lpR = G.audioCtx.createBiquadFilter();
    lpR.type = 'lowpass';
    lpR.frequency.value = 100;
    const gR = G.audioCtx.createGain();
    gR.gain.setValueAtTime(0.0, t);
    gR.gain.setValueAtTime(0.1, t + 0.7);
    gR.gain.exponentialRampToValueAtTime(0.001, t + 1.5);
    rumble.connect(lpR).connect(gR).connect(G.masterGain!);
    rumble.start(t + 0.7);
    rumble.stop(t + 1.5);
  },

  // 16. stageClear() - Mission complete (~1.1s)
  stageClear(): void {
    if (!G.soundEnabled || !G.audioCtx) return;
    const t = now();

    // 4-note ascending major chord C5/E5/G5/C6
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((freq, i) => {
      const startTime = t + i * 0.08;

      // Triangle + sine blend
      const tri = G.audioCtx!.createOscillator();
      tri.type = 'triangle';
      tri.frequency.value = freq;
      const sine = G.audioCtx!.createOscillator();
      sine.type = 'sine';
      sine.frequency.value = freq;

      const gTri = G.audioCtx!.createGain();
      gTri.gain.setValueAtTime(0.0, t);
      gTri.gain.setValueAtTime(0.12, startTime);
      if (i < 3) {
        gTri.gain.exponentialRampToValueAtTime(0.001, startTime + 0.5);
      } else {
        // Last note sustained
        gTri.gain.setValueAtTime(0.12, startTime + 0.4);
        gTri.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
      }
      const gSine = G.audioCtx!.createGain();
      gSine.gain.setValueAtTime(0.0, t);
      gSine.gain.setValueAtTime(0.08, startTime);
      if (i < 3) {
        gSine.gain.exponentialRampToValueAtTime(0.001, startTime + 0.5);
      } else {
        gSine.gain.setValueAtTime(0.08, startTime + 0.4);
        gSine.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
      }

      tri.connect(gTri).connect(G.masterGain!);
      sine.connect(gSine).connect(G.masterGain!);
      tri.start(startTime);
      sine.start(startTime);
      const endTime = i < 3 ? startTime + 0.55 : t + 1.1;
      tri.stop(endTime);
      sine.stop(endTime);

      // Delay reverb echo per note
      const echoTri = G.audioCtx!.createOscillator();
      echoTri.type = 'triangle';
      echoTri.frequency.value = freq;
      const echoG = G.audioCtx!.createGain();
      echoG.gain.setValueAtTime(0.0, t);
      echoG.gain.setValueAtTime(0.05, startTime + 0.06);
      echoG.gain.exponentialRampToValueAtTime(0.001, startTime + 0.4);
      echoTri.connect(echoG).connect(G.masterGain!);
      echoTri.start(startTime + 0.06);
      echoTri.stop(startTime + 0.45);

      // Second echo, quieter
      const echo2 = G.audioCtx!.createOscillator();
      echo2.type = 'sine';
      echo2.frequency.value = freq;
      const echoG2 = G.audioCtx!.createGain();
      echoG2.gain.setValueAtTime(0.0, t);
      echoG2.gain.setValueAtTime(0.025, startTime + 0.12);
      echoG2.gain.exponentialRampToValueAtTime(0.001, startTime + 0.35);
      echo2.connect(echoG2).connect(G.masterGain!);
      echo2.start(startTime + 0.12);
      echo2.stop(startTime + 0.4);
    });
  },

  // 17. stageFail() - Mission failed (~1.0s)
  stageFail(): void {
    if (!G.soundEnabled || !G.audioCtx) return;
    const t = now();

    // 3 descending notes E4/C4/A3, staggered 200ms
    const notes = [329.63, 261.63, 220.0]; // E4, C4, A3
    const closingLP = G.audioCtx.createBiquadFilter();
    closingLP.type = 'lowpass';
    closingLP.frequency.setValueAtTime(2000, t);
    closingLP.frequency.exponentialRampToValueAtTime(200, t + 1.0);
    closingLP.Q.value = 1;
    closingLP.connect(G.masterGain!);

    notes.forEach((freq, i) => {
      const startTime = t + i * 0.2;

      const osc = G.audioCtx!.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;

      // Slow 2Hz LFO vibrato
      const lfo = G.audioCtx!.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 2;
      const lfoG = G.audioCtx!.createGain();
      lfoG.gain.value = 8;
      lfo.connect(lfoG).connect(osc.frequency);
      lfo.start(startTime);
      lfo.stop(startTime + 0.6);

      const g = G.audioCtx!.createGain();
      g.gain.setValueAtTime(0.0, t);
      g.gain.setValueAtTime(0.15, startTime);
      g.gain.exponentialRampToValueAtTime(0.001, startTime + 0.6);
      osc.connect(g).connect(closingLP);
      osc.start(startTime);
      osc.stop(startTime + 0.65);

      // Sine layer
      const sine = G.audioCtx!.createOscillator();
      sine.type = 'sine';
      sine.frequency.value = freq;
      const lfo2 = G.audioCtx!.createOscillator();
      lfo2.type = 'sine';
      lfo2.frequency.value = 2;
      const lfoG2 = G.audioCtx!.createGain();
      lfoG2.gain.value = 6;
      lfo2.connect(lfoG2).connect(sine.frequency);
      lfo2.start(startTime);
      lfo2.stop(startTime + 0.6);
      const gS = G.audioCtx!.createGain();
      gS.gain.setValueAtTime(0.0, t);
      gS.gain.setValueAtTime(0.1, startTime);
      gS.gain.exponentialRampToValueAtTime(0.001, startTime + 0.55);
      sine.connect(gS).connect(closingLP);
      sine.start(startTime);
      sine.stop(startTime + 0.6);
    });
  },

  // 18b. addMovesChime() - Power-up chime for +3 moves (~0.4s)
  addMovesChime(): void {
    if (!G.soundEnabled || !G.audioCtx) return;
    const t = now();
    const notes = [523.25, 659.25, 783.99];
    notes.forEach((freq, i) => {
      const osc = G.audioCtx!.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const g = G.audioCtx!.createGain();
      g.gain.setValueAtTime(0.0, t);
      g.gain.setValueAtTime(0.1, t + i * 0.08);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.2);
      osc.connect(g).connect(G.masterGain!);
      osc.start(t + i * 0.08);
      osc.stop(t + i * 0.08 + 0.25);
    });
  },

  // 19. coinSpend() - Coin spend sound (~0.25s)
  coinSpend(): void {
    if (!G.soundEnabled || !G.audioCtx) return;
    const t = now();
    const osc1 = G.audioCtx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(1400, t);
    osc1.frequency.exponentialRampToValueAtTime(700, t + 0.18);
    const g1 = G.audioCtx.createGain();
    g1.gain.setValueAtTime(0.22, t);
    g1.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    osc1.connect(g1).connect(G.masterGain!);
    osc1.start(t); osc1.stop(t + 0.3);
    const osc2 = G.audioCtx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(900, t);
    osc2.frequency.exponentialRampToValueAtTime(450, t + 0.15);
    const g2 = G.audioCtx.createGain();
    g2.gain.setValueAtTime(0.15, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc2.connect(g2).connect(G.masterGain!);
    osc2.start(t); osc2.stop(t + 0.25);
  },

  // 18. countdown() - Meteor alert (~0.4s)
  countdown(): void {
    if (!G.soundEnabled || !G.audioCtx) return;
    const t = now();

    // Square 440Hz with 4Hz AM modulation
    const osc1 = G.audioCtx.createOscillator();
    osc1.type = 'square';
    osc1.frequency.value = 440;
    const g1 = G.audioCtx.createGain();
    g1.gain.setValueAtTime(0.12, t);
    g1.gain.linearRampToValueAtTime(0.0, t + 0.4);
    // 4Hz AM modulation
    const am1 = G.audioCtx.createOscillator();
    am1.type = 'sine';
    am1.frequency.value = 4;
    const amG1 = G.audioCtx.createGain();
    amG1.gain.value = 0.06;
    am1.connect(amG1).connect(g1.gain);
    am1.start(t);
    am1.stop(t + 0.4);
    osc1.connect(g1).connect(G.masterGain!);
    osc1.start(t);
    osc1.stop(t + 0.4);

    // Higher harmonic 880Hz also AM-modulated
    const osc2 = G.audioCtx.createOscillator();
    osc2.type = 'square';
    osc2.frequency.value = 880;
    const g2 = G.audioCtx.createGain();
    g2.gain.setValueAtTime(0.08, t);
    g2.gain.linearRampToValueAtTime(0.0, t + 0.4);
    const am2 = G.audioCtx.createOscillator();
    am2.type = 'sine';
    am2.frequency.value = 4;
    const amG2 = G.audioCtx.createGain();
    amG2.gain.value = 0.04;
    am2.connect(amG2).connect(g2.gain);
    am2.start(t);
    am2.stop(t + 0.4);
    osc2.connect(g2).connect(G.masterGain!);
    osc2.start(t);
    osc2.stop(t + 0.4);
  },

  // 19. iceCrack() - Ice shatter (~0.3s)
  iceCrack(): void {
    if (!G.soundEnabled || !G.audioCtx) return;
    const t = now();

    // Highpass noise 3kHz
    const noise = createNoise(0.25);
    const hp = G.audioCtx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 3000;
    hp.Q.value = 1;
    const gn = G.audioCtx.createGain();
    gn.gain.setValueAtTime(0.15, t);
    gn.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    noise.connect(hp).connect(gn).connect(G.masterGain!);
    noise.start(t);
    noise.stop(t + 0.25);

    // Glass triangle ping 3kHz
    const glass = G.audioCtx.createOscillator();
    glass.type = 'triangle';
    glass.frequency.setValueAtTime(3000, t);
    glass.frequency.exponentialRampToValueAtTime(2000, t + 0.2);
    const gg = G.audioCtx.createGain();
    gg.gain.setValueAtTime(0.12, t);
    gg.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    glass.connect(gg).connect(G.masterGain!);
    glass.start(t);
    glass.stop(t + 0.3);

    // 4 random tinkle pings 3500-6500Hz
    for (let i = 0; i < 4; i++) {
      const freq = 3500 + Math.random() * 3000;
      const delay = 0.02 + Math.random() * 0.1;
      const ping = G.audioCtx.createOscillator();
      ping.type = 'sine';
      ping.frequency.setValueAtTime(freq, t + delay);
      ping.frequency.exponentialRampToValueAtTime(freq * 0.6, t + delay + 0.1);
      const gp = G.audioCtx.createGain();
      gp.gain.setValueAtTime(0.0, t);
      gp.gain.setValueAtTime(0.08, t + delay);
      gp.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.1);
      ping.connect(gp).connect(G.masterGain!);
      ping.start(t + delay);
      ping.stop(t + delay + 0.12);
    }
  },

  // Combo dispatcher
  combo(type: ComboType): void {
    switch (type) {
      case "cross": this.cross(); break;
      case "star_cross": this.starCross(); break;
      case "triple_line": this.tripleLine(); break;
      case "big_bomb": this.bigBomb(); break;
      case "rainbow_line": this.rainbowLine(); break;
      case "rainbow_bomb": this.rainbowBomb(); break;
      case "board_clear": this.boardClear(); break;
    }
  }
};
