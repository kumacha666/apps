let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let soundEnabled = true;

export function initAudio(): void {
  if (audioCtx) {
    if (audioCtx.state === "suspended") audioCtx.resume();
    return;
  }
  try {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.3;
    masterGain.connect(audioCtx.destination);
  } catch {
    soundEnabled = false;
  }
}

function now(): number {
  return audioCtx!.currentTime;
}

function createNoiseBuffer(duration: number): AudioBuffer {
  const sr = audioCtx!.sampleRate;
  const len = sr * duration;
  const buf = audioCtx!.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function createNoise(duration: number): AudioBufferSourceNode {
  const s = audioCtx!.createBufferSource();
  s.buffer = createNoiseBuffer(duration);
  return s;
}

function createPanner(value: number): StereoPannerNode | GainNode {
  if ("createStereoPanner" in audioCtx!) {
    const p = audioCtx!.createStereoPanner();
    p.pan.value = value;
    return p;
  }
  const g = audioCtx!.createGain();
  g.gain.value = 1;
  return g;
}

export const SFX = {
  swap(): void {
    if (!soundEnabled || !audioCtx) return;
    const t = now();
    const osc1 = audioCtx.createOscillator();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(200, t);
    osc1.frequency.exponentialRampToValueAtTime(800, t + 0.18);
    const g1 = audioCtx.createGain();
    g1.gain.setValueAtTime(0.15, t);
    g1.gain.linearRampToValueAtTime(0.0, t + 0.2);
    osc1.connect(g1).connect(masterGain!);
    osc1.start(t); osc1.stop(t + 0.2);

    const osc2 = audioCtx.createOscillator();
    osc2.type = "triangle";
    osc2.frequency.setValueAtTime(250, t);
    osc2.frequency.exponentialRampToValueAtTime(900, t + 0.18);
    const g2 = audioCtx.createGain();
    g2.gain.setValueAtTime(0.1, t);
    g2.gain.linearRampToValueAtTime(0.0, t + 0.2);
    osc2.connect(g2).connect(masterGain!);
    osc2.start(t); osc2.stop(t + 0.2);

    const noise = createNoise(0.2);
    const bp = audioCtx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(400, t);
    bp.frequency.exponentialRampToValueAtTime(1200, t + 0.15);
    bp.Q.value = 2;
    const gn = audioCtx.createGain();
    gn.gain.setValueAtTime(0.08, t);
    gn.gain.linearRampToValueAtTime(0.0, t + 0.2);
    noise.connect(bp).connect(gn).connect(masterGain!);
    noise.start(t); noise.stop(t + 0.2);
  },

  invalidSwap(): void {
    if (!soundEnabled || !audioCtx) return;
    const t = now();
    for (let i = 0; i < 2; i++) {
      const osc = audioCtx.createOscillator();
      osc.type = "square";
      osc.frequency.setValueAtTime(150, t);
      osc.detune.setValueAtTime(i === 0 ? -15 : 15, t);
      const lfo = audioCtx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 8;
      const lfoG = audioCtx.createGain();
      lfoG.gain.value = 20;
      lfo.connect(lfoG).connect(osc.frequency);
      lfo.start(t); lfo.stop(t + 0.25);
      const g = audioCtx.createGain();
      g.gain.setValueAtTime(0.12, t);
      g.gain.setValueAtTime(0.12, t + 0.15);
      g.gain.linearRampToValueAtTime(0.0, t + 0.25);
      osc.connect(g).connect(masterGain!);
      osc.start(t); osc.stop(t + 0.25);
    }
  },

  drop(): void {
    if (!soundEnabled || !audioCtx) return;
    const t = now();
    const osc = audioCtx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(400, t);
    osc.frequency.exponentialRampToValueAtTime(200, t + 0.18);
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.15, t);
    g.gain.linearRampToValueAtTime(0.0, t + 0.2);
    osc.connect(g).connect(masterGain!);
    osc.start(t); osc.stop(t + 0.2);

    const osc2 = audioCtx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(400, t + 0.04);
    osc2.frequency.exponentialRampToValueAtTime(200, t + 0.22);
    const g2 = audioCtx.createGain();
    g2.gain.setValueAtTime(0.0, t);
    g2.gain.setValueAtTime(0.15 * 0.25, t + 0.04);
    g2.gain.linearRampToValueAtTime(0.0, t + 0.24);
    osc2.connect(g2).connect(masterGain!);
    osc2.start(t + 0.04); osc2.stop(t + 0.24);
  },

  clear(chain?: number): void {
    if (!soundEnabled || !audioCtx) return;
    const t = now();
    chain = chain || 1;
    const baseFreq = 523 + (chain - 1) * 80;
    for (let i = -1; i <= 1; i++) {
      const osc = audioCtx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(baseFreq, t);
      osc.detune.setValueAtTime(i * 12, t);
      const g = audioCtx.createGain();
      g.gain.setValueAtTime(0.12, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      osc.connect(g).connect(masterGain!);
      osc.start(t); osc.stop(t + 0.35);
    }
    const sparkleCount = 2 + chain;
    for (let i = 0; i < sparkleCount; i++) {
      const freq = 2000 + Math.random() * 2000;
      const delay = Math.random() * 0.15;
      const osc = audioCtx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, t + delay);
      const g = audioCtx.createGain();
      g.gain.setValueAtTime(0.0, t);
      g.gain.setValueAtTime(0.08, t + delay);
      g.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.12);
      osc.connect(g).connect(masterGain!);
      osc.start(t + delay); osc.stop(t + delay + 0.15);
    }
    const echoOsc = audioCtx.createOscillator();
    echoOsc.type = "sine";
    echoOsc.frequency.setValueAtTime(baseFreq * 1.5, t + 0.05);
    const eg = audioCtx.createGain();
    eg.gain.setValueAtTime(0.0, t);
    eg.gain.setValueAtTime(0.06, t + 0.05);
    eg.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    echoOsc.connect(eg).connect(masterGain!);
    echoOsc.start(t + 0.05); echoOsc.stop(t + 0.35);
  },

  line(): void {
    if (!soundEnabled || !audioCtx) return;
    const t = now();
    const osc = audioCtx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(1500, t);
    osc.frequency.exponentialRampToValueAtTime(400, t + 0.25);
    osc.frequency.exponentialRampToValueAtTime(1200, t + 0.48);
    const lp = audioCtx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(3000, t);
    lp.frequency.exponentialRampToValueAtTime(600, t + 0.25);
    lp.frequency.exponentialRampToValueAtTime(2500, t + 0.48);
    lp.Q.value = 3;
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.1, t);
    g.gain.setValueAtTime(0.1, t + 0.35);
    g.gain.linearRampToValueAtTime(0.0, t + 0.5);
    const panner = createPanner(-1);
    if ((panner as StereoPannerNode).pan) {
      (panner as StereoPannerNode).pan.setValueAtTime(-1, t);
      (panner as StereoPannerNode).pan.linearRampToValueAtTime(1, t + 0.5);
    }
    osc.connect(lp).connect(g).connect(panner).connect(masterGain!);
    osc.start(t); osc.stop(t + 0.5);

    const noise = createNoise(0.5);
    const bp = audioCtx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(2000, t);
    bp.frequency.exponentialRampToValueAtTime(500, t + 0.25);
    bp.frequency.exponentialRampToValueAtTime(1500, t + 0.5);
    bp.Q.value = 1.5;
    const gn = audioCtx.createGain();
    gn.gain.setValueAtTime(0.06, t);
    gn.gain.linearRampToValueAtTime(0.0, t + 0.5);
    const panner2 = createPanner(-1);
    if ((panner2 as StereoPannerNode).pan) {
      (panner2 as StereoPannerNode).pan.setValueAtTime(-1, t);
      (panner2 as StereoPannerNode).pan.linearRampToValueAtTime(1, t + 0.5);
    }
    noise.connect(bp).connect(gn).connect(panner2).connect(masterGain!);
    noise.start(t); noise.stop(t + 0.5);
  },

  bomb(): void {
    if (!soundEnabled || !audioCtx) return;
    const t = now();
    const noise = createNoise(0.8);
    const lp = audioCtx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(8000, t);
    lp.frequency.exponentialRampToValueAtTime(200, t + 0.6);
    lp.Q.value = 2;
    const gn = audioCtx.createGain();
    gn.gain.setValueAtTime(0.2, t);
    gn.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
    noise.connect(lp).connect(gn).connect(masterGain!);
    noise.start(t); noise.stop(t + 0.8);

    const sub = audioCtx.createOscillator();
    sub.type = "sine";
    sub.frequency.value = 60;
    const gs = audioCtx.createGain();
    gs.gain.setValueAtTime(0.2, t);
    gs.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    sub.connect(gs).connect(masterGain!);
    sub.start(t); sub.stop(t + 0.7);

    [40, 55, 75].forEach(freq => {
      const osc = audioCtx!.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = freq;
      const lp2 = audioCtx!.createBiquadFilter();
      lp2.type = "lowpass";
      lp2.frequency.value = 150;
      lp2.Q.value = 1;
      const g = audioCtx!.createGain();
      g.gain.setValueAtTime(0.1, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.75);
      osc.connect(lp2).connect(g).connect(masterGain!);
      osc.start(t); osc.stop(t + 0.8);
    });

    const ping = audioCtx.createOscillator();
    ping.type = "sine";
    ping.frequency.setValueAtTime(200, t);
    ping.frequency.exponentialRampToValueAtTime(80, t + 0.3);
    const gp = audioCtx.createGain();
    gp.gain.setValueAtTime(0.15, t);
    gp.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    ping.connect(gp).connect(masterGain!);
    ping.start(t); ping.stop(t + 0.3);

    const ping2 = audioCtx.createOscillator();
    ping2.type = "sine";
    ping2.frequency.setValueAtTime(200, t + 0.08);
    ping2.frequency.exponentialRampToValueAtTime(80, t + 0.38);
    const gp2 = audioCtx.createGain();
    gp2.gain.setValueAtTime(0.0, t);
    gp2.gain.setValueAtTime(0.07, t + 0.08);
    gp2.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
    ping2.connect(gp2).connect(masterGain!);
    ping2.start(t + 0.08); ping2.stop(t + 0.4);
  },

  rainbow(): void {
    if (!soundEnabled || !audioCtx) return;
    const t = now();
    const drone = audioCtx.createOscillator();
    drone.type = "sine";
    drone.frequency.value = 80;
    const lfo = audioCtx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 3;
    const lfoG = audioCtx.createGain();
    lfoG.gain.value = 15;
    lfo.connect(lfoG).connect(drone.frequency);
    lfo.start(t); lfo.stop(t + 0.8);
    const gd = audioCtx.createGain();
    gd.gain.setValueAtTime(0.02, t);
    gd.gain.linearRampToValueAtTime(0.18, t + 0.55);
    gd.gain.setValueAtTime(0.18, t + 0.65);
    gd.gain.linearRampToValueAtTime(0.0, t + 0.72);
    drone.connect(gd).connect(masterGain!);
    drone.start(t); drone.stop(t + 0.8);

    [1500, 1600, 1700].forEach(startFreq => {
      const osc = audioCtx!.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(startFreq, t);
      osc.frequency.exponentialRampToValueAtTime(60, t + 0.7);
      const lp = audioCtx!.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(4000, t);
      lp.frequency.exponentialRampToValueAtTime(100, t + 0.7);
      lp.Q.value = 4;
      const g = audioCtx!.createGain();
      g.gain.setValueAtTime(0.01, t);
      g.gain.linearRampToValueAtTime(0.08, t + 0.5);
      g.gain.linearRampToValueAtTime(0.0, t + 0.75);
      osc.connect(lp).connect(g).connect(masterGain!);
      osc.start(t); osc.stop(t + 0.8);
    });

    [120, 160].forEach(freq => {
      const osc = audioCtx!.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = freq;
      const g = audioCtx!.createGain();
      g.gain.setValueAtTime(0.01, t);
      g.gain.linearRampToValueAtTime(0.1, t + 0.5);
      g.gain.linearRampToValueAtTime(0.0, t + 0.75);
      osc.connect(g).connect(masterGain!);
      osc.start(t); osc.stop(t + 0.8);
    });
  },

  stageClear(): void {
    if (!soundEnabled || !audioCtx) return;
    const t = now();
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      const st = t + i * 0.08;
      const tri = audioCtx!.createOscillator();
      tri.type = "triangle";
      tri.frequency.value = freq;
      const sine = audioCtx!.createOscillator();
      sine.type = "sine";
      sine.frequency.value = freq;
      const gTri = audioCtx!.createGain();
      gTri.gain.setValueAtTime(0.0, t);
      gTri.gain.setValueAtTime(0.12, st);
      if (i < 3) {
        gTri.gain.exponentialRampToValueAtTime(0.001, st + 0.5);
      } else {
        gTri.gain.setValueAtTime(0.12, st + 0.4);
        gTri.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
      }
      const gSine = audioCtx!.createGain();
      gSine.gain.setValueAtTime(0.0, t);
      gSine.gain.setValueAtTime(0.08, st);
      if (i < 3) {
        gSine.gain.exponentialRampToValueAtTime(0.001, st + 0.5);
      } else {
        gSine.gain.setValueAtTime(0.08, st + 0.4);
        gSine.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
      }
      tri.connect(gTri).connect(masterGain!);
      sine.connect(gSine).connect(masterGain!);
      const end = i < 3 ? st + 0.55 : t + 1.1;
      tri.start(st); tri.stop(end);
      sine.start(st); sine.stop(end);

      const echoTri = audioCtx!.createOscillator();
      echoTri.type = "triangle";
      echoTri.frequency.value = freq;
      const echoG = audioCtx!.createGain();
      echoG.gain.setValueAtTime(0.0, t);
      echoG.gain.setValueAtTime(0.05, st + 0.06);
      echoG.gain.exponentialRampToValueAtTime(0.001, st + 0.4);
      echoTri.connect(echoG).connect(masterGain!);
      echoTri.start(st + 0.06); echoTri.stop(st + 0.45);
    });
  },

  stageFail(): void {
    if (!soundEnabled || !audioCtx) return;
    const t = now();
    const notes = [329.63, 261.63, 220.0];
    const closingLP = audioCtx.createBiquadFilter();
    closingLP.type = "lowpass";
    closingLP.frequency.setValueAtTime(2000, t);
    closingLP.frequency.exponentialRampToValueAtTime(200, t + 1.0);
    closingLP.Q.value = 1;
    closingLP.connect(masterGain!);
    notes.forEach((freq, i) => {
      const st = t + i * 0.2;
      const osc = audioCtx!.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = freq;
      const lfo = audioCtx!.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 2;
      const lfoG = audioCtx!.createGain();
      lfoG.gain.value = 8;
      lfo.connect(lfoG).connect(osc.frequency);
      lfo.start(st); lfo.stop(st + 0.6);
      const g = audioCtx!.createGain();
      g.gain.setValueAtTime(0.0, t);
      g.gain.setValueAtTime(0.15, st);
      g.gain.exponentialRampToValueAtTime(0.001, st + 0.6);
      osc.connect(g).connect(closingLP);
      osc.start(st); osc.stop(st + 0.65);

      const sine = audioCtx!.createOscillator();
      sine.type = "sine";
      sine.frequency.value = freq;
      const lfo2 = audioCtx!.createOscillator();
      lfo2.type = "sine";
      lfo2.frequency.value = 2;
      const lfoG2 = audioCtx!.createGain();
      lfoG2.gain.value = 6;
      lfo2.connect(lfoG2).connect(sine.frequency);
      lfo2.start(st); lfo2.stop(st + 0.6);
      const gS = audioCtx!.createGain();
      gS.gain.setValueAtTime(0.0, t);
      gS.gain.setValueAtTime(0.1, st);
      gS.gain.exponentialRampToValueAtTime(0.001, st + 0.55);
      sine.connect(gS).connect(closingLP);
      sine.start(st); sine.stop(st + 0.6);
    });
  },
};
