(function () {
  "use strict";

  let cols = 7;
  let rows = 8;
  const PIECE_COLORS = ["#e94560", "#4ecdc4", "#ffd700", "#c0c8d8", "#ff8a5c", "#1e4fff", "#ff6bb3", "#88cc44"];
  const PIECE_SHAPES = ["circle", "diamond", "square", "triangle", "star", "hex", "cross", "octagon"];
  const PIECE_NAMES_JA = ["太陽", "月", "火星", "水星", "木星", "金星", "土星", "地球"];
  const PIECE_SYMBOLS = ["☀️", "🌙", "🔴", "💎", "🟠", "💙", "🪐", "🌍"];
  const MATCH_MIN = 3;

  const ANIM = {
    CLEAR_FRAMES: 14,
    CLEAR_FRAME_MS: 35,
    DROP_SPEED: 0.22,
    DROP_FRAME_MS: 16,
    CHAIN_PAUSE_MS: 180,
    SWAP_FRAMES: 8,
    SWAP_FRAME_MS: 20,
  };

  const STAR_GATES = [
    { stage: 25, stars: 30 },
    { stage: 50, stars: 80 },
    { stage: 75, stars: 140 },
    { stage: 100, stars: 190 },
    { stage: 150, stars: 290 },
    { stage: 200, stars: 390 },
    { stage: 250, stars: 490 },
    { stage: 300, stars: 590 },
    { stage: 350, stars: 690 },
  ];

  const STAGES = buildStages();

  // --- Tracking ---
  const GA_MEASUREMENT_ID = "G-CT956V6Y2V";
  const GAS_ENDPOINT = "https://script.google.com/macros/s/AKfycbw6_EH0cRSKYnKVefYMRUnIZSnCm-Xcz8iPlOed-5zou54a_Yf09FJedIYNtY5qZCyX/exec";
  const FEEDBACK_URL = "https://forms.gle/emCFWfyXtkpmL7zL9";

  function getAnonId() {
    let id = localStorage.getItem("7metch_uid");
    if (!id) {
      id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem("7metch_uid", id);
    }
    return id;
  }

  function trackGA(event, params) {
    if (!GA_MEASUREMENT_ID || typeof gtag !== "function") return;
    gtag("event", event, params);
  }

  function trackGAS(data) {
    if (!GAS_ENDPOINT) return;
    data.user_id = getAnonId();
    fetch(GAS_ENDPOINT, {
      method: "POST",
      body: JSON.stringify(data),
    }).catch(() => {});
  }

  function track(event, params) {
    if (debugMode) return;
    trackGA(event, params || {});
    trackGAS({ event, ...params });
  }

  // --- Sound ---
  // --- Sound System ---
  let audioCtx = null;
  let soundEnabled = true;
  let masterGain = null;

  function initAudio() {
    if (!audioCtx) {
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        masterGain = audioCtx.createGain();
        masterGain.gain.value = 0.3;
        masterGain.connect(audioCtx.destination);
      } catch (e) {
        soundEnabled = false;
        return;
      }
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
    initBgm();
  }

  function now() {
    return audioCtx.currentTime;
  }

  function createNoiseBuffer(duration) {
    const sampleRate = audioCtx.sampleRate;
    const length = sampleRate * duration;
    const buffer = audioCtx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  function createNoise(duration) {
    const source = audioCtx.createBufferSource();
    source.buffer = createNoiseBuffer(duration);
    return source;
  }

  function createPanner(value) {
    if (audioCtx.createStereoPanner) {
      const panner = audioCtx.createStereoPanner();
      panner.pan.value = value;
      return panner;
    }
    // Fallback: use gain node (no panning, but no error)
    const gain = audioCtx.createGain();
    gain.gain.value = 1;
    return gain;
  }

  // --- BGM System ---
  const BGM_MASTER = 0.70;
  const BGM_CROSSFADE_MS = 500;

  const BGM_SCALE = {
    D2: 73.42, F2: 87.31, G2: 98.00, A2: 110.00, C3: 130.81,
    D3: 146.83, F3: 174.61, G3: 196.00, A3: 220.00, C4: 261.63,
    D4: 293.66, F4: 349.23, G4: 392.00, A4: 440.00, C5: 523.25,
    D5: 587.33, F5: 698.46, G5: 783.99, A5: 880.00, C6: 1046.50,
    D6: 1174.66, F6: 1396.91, G6: 1567.98, A6: 1760.00, C7: 2093.00,
  };

  const BGM_ARP_MID  = [BGM_SCALE.D4, BGM_SCALE.F4, BGM_SCALE.G4, BGM_SCALE.A4, BGM_SCALE.C5];
  const BGM_ARP_HIGH = [BGM_SCALE.D5, BGM_SCALE.F5, BGM_SCALE.G5, BGM_SCALE.A5, BGM_SCALE.C6];
  const BGM_TWINKLE  = [BGM_SCALE.D6, BGM_SCALE.F6, BGM_SCALE.G6, BGM_SCALE.A6, BGM_SCALE.C7];

  const GAME_BASS_NOTES = [110.00, 130.81, 146.83, 164.81, 196.00];
  const GAME_MID_NOTES  = [220.00, 261.63, 293.66, 329.63, 392.00];
  const GAME_HIGH_NOTES = [440.00, 523.25, 587.33, 659.25, 783.99];
  const GAME_SPARKLE_NOTES = [880.00, 1046.50, 1174.66, 1318.51, 1567.98];

  const bgmTracks = {
    title:  { gain: null, volume: 0.70, nodes: [], playing: false, fadeGain: null, timers: [] },
    select: { gain: null, volume: 0.70, nodes: [], playing: false, fadeGain: null, timers: [] },
    ingame: { gain: null, volume: 0.70, nodes: [], playing: false, fadeGain: null, timers: [] },
  };

  let bgmGain = null;
  let currentBgm = null;
  let bgmInitialized = false;

  function initBgm() {
    if (bgmInitialized || !audioCtx) return;
    bgmGain = audioCtx.createGain();
    bgmGain.gain.value = BGM_MASTER;
    bgmGain.connect(masterGain);
    for (const key in bgmTracks) {
      const trackGain = audioCtx.createGain();
      trackGain.gain.value = bgmTracks[key].volume;
      const fadeGain = audioCtx.createGain();
      fadeGain.gain.value = 0;
      trackGain.connect(fadeGain).connect(bgmGain);
      bgmTracks[key].gain = trackGain;
      bgmTracks[key].fadeGain = fadeGain;
    }
    bgmInitialized = true;
  }

  function bgmReg(name, node) {
    bgmTracks[name].nodes.push(node);
    return node;
  }

  function bgmRegTimer(name, id) {
    bgmTracks[name].timers.push(id);
  }

  function bgmPickNote(arr, avoid) {
    let note, attempts = 0;
    do {
      note = arr[Math.floor(Math.random() * arr.length)];
      attempts++;
    } while (note === avoid && attempts < 5);
    return note;
  }

  function bgmCreateLoopingNoise(name, duration) {
    const source = audioCtx.createBufferSource();
    source.buffer = createNoiseBuffer(duration);
    source.loop = true;
    bgmReg(name, source);
    return source;
  }

  function stopBgmTrack(name) {
    const track = bgmTracks[name];
    track.nodes.forEach(node => {
      try { if (node.stop) node.stop(); if (node.disconnect) node.disconnect(); } catch (e) {}
    });
    track.nodes = [];
    track.playing = false;
    track.timers.forEach(id => clearTimeout(id));
    track.timers = [];
  }

  function bgmFadeIn(name) {
    const track = bgmTracks[name];
    const t = audioCtx.currentTime;
    track.fadeGain.gain.cancelScheduledValues(t);
    track.fadeGain.gain.setValueAtTime(track.fadeGain.gain.value, t);
    track.fadeGain.gain.linearRampToValueAtTime(1.0, t + BGM_CROSSFADE_MS / 1000);
  }

  function bgmFadeOut(name) {
    const track = bgmTracks[name];
    const t = audioCtx.currentTime;
    track.fadeGain.gain.cancelScheduledValues(t);
    track.fadeGain.gain.setValueAtTime(track.fadeGain.gain.value, t);
    track.fadeGain.gain.linearRampToValueAtTime(0.0, t + BGM_CROSSFADE_MS / 1000);
    setTimeout(() => {
      if (currentBgm !== name) stopBgmTrack(name);
    }, BGM_CROSSFADE_MS + 100);
  }

  function switchBgm(name) {
    if (!soundEnabled || !audioCtx || !bgmInitialized) return;
    if (currentBgm === name) return;
    if (currentBgm) bgmFadeOut(currentBgm);
    if (name === null) { currentBgm = null; return; }
    currentBgm = name;
    bgmTracks[name].playing = true;
    stopBgmTrack(name);
    bgmTracks[name].playing = true;
    startBgmTrack(name);
    bgmFadeIn(name);
  }

  function stopAllBgm() {
    if (currentBgm) bgmFadeOut(currentBgm);
    currentBgm = null;
  }

  function startBgmTrack(name) {
    stopBgmTrack(name);
    bgmTracks[name].playing = true;
    switch (name) {
      case 'title': bgmStartTitle(); break;
      case 'select': bgmStartSelect(); break;
      case 'ingame': bgmStartIngame(); break;
    }
  }

  // --- BGM Track: Title ---
  function bgmStartTitle() {
    const name = 'title';
    const dest = bgmTracks[name].gain;
    const t = audioCtx.currentTime;

    // --- Sub-bass drone: D2 with slow pitch oscillation ---
    const drone = audioCtx.createOscillator();
    drone.type = 'sine';
    drone.frequency.value = BGM_SCALE.D2;
    const droneLfo = audioCtx.createOscillator();
    droneLfo.type = 'sine';
    droneLfo.frequency.value = 0.08;
    const droneLfoGain = audioCtx.createGain();
    droneLfoGain.gain.value = 2.5;
    droneLfo.connect(droneLfoGain).connect(drone.frequency);
    const droneGain = audioCtx.createGain();
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
      const osc = audioCtx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      osc.detune.value = i === 0 ? -5 : 5;

      const lp = audioCtx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 400;
      lp.Q.value = 1.5;

      const filterLfo = audioCtx.createOscillator();
      filterLfo.type = 'sine';
      filterLfo.frequency.value = 0.06 + i * 0.02;
      const filterLfoGain = audioCtx.createGain();
      filterLfoGain.gain.value = 120;
      filterLfo.connect(filterLfoGain).connect(lp.frequency);
      filterLfo.start(t);

      const padGain = audioCtx.createGain();
      padGain.gain.value = 0.25;

      const ampLfo = audioCtx.createOscillator();
      ampLfo.type = 'sine';
      ampLfo.frequency.value = 0.04 + i * 0.015;
      const ampLfoGain = audioCtx.createGain();
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
    const triPad = audioCtx.createOscillator();
    triPad.type = 'triangle';
    triPad.frequency.value = BGM_SCALE.D3;
    const triLp = audioCtx.createBiquadFilter();
    triLp.type = 'lowpass';
    triLp.frequency.value = 350;
    triLp.Q.value = 0.7;
    const triGain = audioCtx.createGain();
    triGain.gain.value = 0.15;
    triPad.connect(triLp).connect(triGain).connect(dest);
    triPad.start(t);
    bgmReg(name, triPad);
    bgmReg(name, triLp);
    bgmReg(name, triGain);

    // --- Sparse arpeggio: pentatonic notes, sine/triangle, every ~4-6s ---
    let lastArpNote = null;
    function scheduleArpTitle() {
      if (!bgmTracks[name].playing && currentBgm !== name) return;
      const delay = 4000 + Math.random() * 3000;
      const timerId = setTimeout(() => {
        if (!bgmTracks[name].playing && currentBgm !== name) return;
        const ct = audioCtx.currentTime;

        const note = bgmPickNote(BGM_ARP_MID, lastArpNote);
        lastArpNote = note;

        const osc = audioCtx.createOscillator();
        osc.type = Math.random() > 0.5 ? 'sine' : 'triangle';
        osc.frequency.value = note;

        const arpGain = audioCtx.createGain();
        arpGain.gain.value = 0;
        arpGain.gain.setValueAtTime(0, ct);
        arpGain.gain.linearRampToValueAtTime(0.12, ct + 0.3);
        arpGain.gain.exponentialRampToValueAtTime(0.001, ct + 3.0);

        const arpLp = audioCtx.createBiquadFilter();
        arpLp.type = 'lowpass';
        arpLp.frequency.value = 1200;
        arpLp.Q.value = 0.5;

        osc.connect(arpLp).connect(arpGain).connect(dest);
        osc.start(ct);
        osc.stop(ct + 3.5);

        if (Math.random() > 0.6) {
          const idx = BGM_ARP_MID.indexOf(note);
          const harmNote = BGM_ARP_MID[(idx + 2) % BGM_ARP_MID.length];
          const osc2 = audioCtx.createOscillator();
          osc2.type = 'sine';
          osc2.frequency.value = harmNote;
          const hGain = audioCtx.createGain();
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
    function scheduleTwinkle() {
      if (!bgmTracks[name].playing && currentBgm !== name) return;
      const delay = 3000 + Math.random() * 5000;
      const timerId = setTimeout(() => {
        if (!bgmTracks[name].playing && currentBgm !== name) return;
        const ct = audioCtx.currentTime;
        const note = bgmPickNote(BGM_TWINKLE);
        const osc = audioCtx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = note;
        const tGain = audioCtx.createGain();
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
  function bgmStartSelect() {
    const name = 'select';
    const dest = bgmTracks[name].gain;
    const t = audioCtx.currentTime;

    // --- Brighter pad: D3 + A3, pulled back to make room for motif ---
    [BGM_SCALE.D3, BGM_SCALE.A3].forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      osc.detune.value = i === 0 ? -6 : 6;

      const lp = audioCtx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 700 + i * 100;
      lp.Q.value = 1.5;

      const fLfo = audioCtx.createOscillator();
      fLfo.type = 'sine';
      fLfo.frequency.value = 0.06 + i * 0.02;
      const fLfoG = audioCtx.createGain();
      fLfoG.gain.value = 150;
      fLfo.connect(fLfoG).connect(lp.frequency);
      fLfo.start(t);

      const g = audioCtx.createGain();
      g.gain.value = 0.12;

      osc.connect(lp).connect(g).connect(dest);
      osc.start(t);
      bgmReg(name, osc); bgmReg(name, lp); bgmReg(name, fLfo); bgmReg(name, fLfoG); bgmReg(name, g);
    });

    // --- Sub drone ---
    const subDrone = audioCtx.createOscillator();
    subDrone.type = 'sine';
    subDrone.frequency.value = BGM_SCALE.D2;
    const subG = audioCtx.createGain();
    subG.gain.value = 0.2;
    subDrone.connect(subG).connect(dest);
    subDrone.start(t);
    bgmReg(name, subDrone); bgmReg(name, subG);

    // --- Strong shimmer: constant, louder ---
    const shimmerNoise = bgmCreateLoopingNoise(name, 2);
    const shimmerHp = audioCtx.createBiquadFilter();
    shimmerHp.type = 'highpass';
    shimmerHp.frequency.value = 5000;
    const shimmerLp = audioCtx.createBiquadFilter();
    shimmerLp.type = 'lowpass';
    shimmerLp.frequency.value = 12000;
    const shimmerLfo = audioCtx.createOscillator();
    shimmerLfo.type = 'sine';
    shimmerLfo.frequency.value = 0.2;
    const shimmerLfoG = audioCtx.createGain();
    shimmerLfoG.gain.value = 0.025;
    shimmerLfo.connect(shimmerLfoG);
    const shimmerGain = audioCtx.createGain();
    shimmerGain.gain.value = 0.04;
    shimmerLfoG.connect(shimmerGain.gain);
    shimmerNoise.connect(shimmerHp).connect(shimmerLp).connect(shimmerGain).connect(dest);
    shimmerNoise.start(t);
    shimmerLfo.start(t);
    bgmReg(name, shimmerHp); bgmReg(name, shimmerLp);
    bgmReg(name, shimmerLfo); bgmReg(name, shimmerLfoG); bgmReg(name, shimmerGain);

    // --- Repeating melodic motif: 4-note loop ---
    const motifNotes = [BGM_SCALE.D5, BGM_SCALE.A4, BGM_SCALE.G4, BGM_SCALE.F4];
    const motifInterval = 0.8;
    let motifIdx = 0;

    function playMotifNote(freq, startTime) {
      const osc = audioCtx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;

      const g = audioCtx.createGain();
      g.gain.value = 0;
      g.gain.setValueAtTime(0, startTime);
      g.gain.linearRampToValueAtTime(0.38, startTime + 0.04);
      g.gain.linearRampToValueAtTime(0.28, startTime + 0.25);
      g.gain.exponentialRampToValueAtTime(0.001, startTime + motifInterval * 0.9);

      const lp = audioCtx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 3500;
      lp.Q.value = 0.8;

      osc.connect(lp).connect(g).connect(dest);
      osc.start(startTime);
      osc.stop(startTime + motifInterval);
    }

    function scheduleMotif() {
      if (!bgmTracks[name].playing && currentBgm !== name) return;
      const timerId = setTimeout(() => {
        if (!bgmTracks[name].playing && currentBgm !== name) return;
        const ct = audioCtx.currentTime;
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
    const pulseOsc = audioCtx.createOscillator();
    pulseOsc.type = 'sine';
    pulseOsc.frequency.value = BGM_SCALE.D2;
    const pulseLfo = audioCtx.createOscillator();
    pulseLfo.type = 'sine';
    pulseLfo.frequency.value = 1.0;
    const pulseShaper = audioCtx.createWaveShaper();
    const shapeLen = 256;
    const shapeCurve = new Float32Array(shapeLen);
    for (let i = 0; i < shapeLen; i++) {
      const x = (i / (shapeLen - 1)) * 2 - 1;
      shapeCurve[i] = x > 0 ? x * x : 0;
    }
    pulseShaper.curve = shapeCurve;
    const pulseLfoGain = audioCtx.createGain();
    pulseLfoGain.gain.value = 0.28;
    pulseLfo.connect(pulseShaper).connect(pulseLfoGain);
    const pulseAmpGain = audioCtx.createGain();
    pulseAmpGain.gain.value = 0;
    pulseLfoGain.connect(pulseAmpGain.gain);
    const pulseLp = audioCtx.createBiquadFilter();
    pulseLp.type = 'lowpass';
    pulseLp.frequency.value = 250;
    pulseLp.Q.value = 3;
    pulseOsc.connect(pulseLp).connect(pulseAmpGain).connect(dest);
    pulseOsc.start(t);
    pulseLfo.start(t);
    bgmReg(name, pulseOsc); bgmReg(name, pulseLfo); bgmReg(name, pulseShaper);
    bgmReg(name, pulseLfoGain); bgmReg(name, pulseAmpGain); bgmReg(name, pulseLp);

    // --- Additional random arpeggios in high register ---
    let lastArpNote = null;
    function scheduleArpSelect() {
      if (!bgmTracks[name].playing && currentBgm !== name) return;
      const delay = 2000 + Math.random() * 2000;
      const timerId = setTimeout(() => {
        if (!bgmTracks[name].playing && currentBgm !== name) return;
        const ct = audioCtx.currentTime;
        const note = bgmPickNote(BGM_ARP_HIGH, lastArpNote);
        lastArpNote = note;

        const osc = audioCtx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = note;
        const g = audioCtx.createGain();
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
    function scheduleTwinkleSelect() {
      if (!bgmTracks[name].playing && currentBgm !== name) return;
      const delay = 3000 + Math.random() * 4000;
      const timerId = setTimeout(() => {
        if (!bgmTracks[name].playing && currentBgm !== name) return;
        const ct = audioCtx.currentTime;
        const note = bgmPickNote(BGM_TWINKLE);
        const osc = audioCtx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = note;
        const g = audioCtx.createGain();
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
  function bgmStartIngame() {
    const name = 'ingame';
    const dest = bgmTracks[name].gain;
    const t = audioCtx.currentTime;
    const BPM = 120;
    const beatSec = 60 / BPM;
    const sixteenth = beatSec / 4;

    // --- Synth pad: A3 + E4 (5th), sawtooth + LP400Hz ---
    [220.00, 329.63].forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      osc.detune.value = i === 0 ? -6 : 6;

      const lp = audioCtx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 400;
      lp.Q.value = 1.5;

      const fLfo = audioCtx.createOscillator();
      fLfo.type = 'sine';
      fLfo.frequency.value = 0.08 + i * 0.03;
      const fLfoG = audioCtx.createGain();
      fLfoG.gain.value = 250;
      fLfo.connect(fLfoG).connect(lp.frequency);
      fLfo.start(t);

      const g = audioCtx.createGain();
      g.gain.value = 0.115;

      osc.connect(lp).connect(g).connect(dest);
      osc.start(t);
      bgmReg(name, osc); bgmReg(name, lp); bgmReg(name, fLfo); bgmReg(name, fLfoG); bgmReg(name, g);
    });

    // --- Driving bass pattern: eighth notes, syncopated ---
    let bassIdx = 0;
    const bassPattern = [0, -1, 4, 0, -1, 3, 0, 2];

    function playBassNote(freq, startTime) {
      const osc = audioCtx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const lp = audioCtx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 350;
      lp.Q.value = 1.5;
      const g = audioCtx.createGain();
      g.gain.value = 0;
      g.gain.setValueAtTime(0, startTime);
      g.gain.linearRampToValueAtTime(0.05, startTime + 0.015);
      g.gain.exponentialRampToValueAtTime(0.004, startTime + beatSec * 0.4);
      g.gain.linearRampToValueAtTime(0, startTime + beatSec * 0.45);
      osc.connect(lp).connect(g).connect(dest);
      osc.start(startTime);
      osc.stop(startTime + beatSec * 0.5);
    }

    function scheduleBass() {
      if (!bgmTracks[name].playing && currentBgm !== name) return;
      const delay = beatSec * 500;
      const timerId = setTimeout(() => {
        if (!bgmTracks[name].playing && currentBgm !== name) return;
        const ct = audioCtx.currentTime;
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
    function playKick(startTime) {
      const osc = audioCtx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(150, startTime);
      osc.frequency.exponentialRampToValueAtTime(50, startTime + 0.08);
      const g = audioCtx.createGain();
      g.gain.value = 0;
      g.gain.setValueAtTime(0.21, startTime);
      g.gain.exponentialRampToValueAtTime(0.001, startTime + 0.18);
      osc.connect(g).connect(dest);
      osc.start(startTime);
      osc.stop(startTime + 0.22);
    }

    function scheduleKick() {
      if (!bgmTracks[name].playing && currentBgm !== name) return;
      const delay = beatSec * 1000;
      const timerId = setTimeout(() => {
        if (!bgmTracks[name].playing && currentBgm !== name) return;
        kickCount++;
        playKick(audioCtx.currentTime);
        scheduleKick();
      }, delay);
      bgmRegTimer(name, timerId);
    }
    playKick(t);
    scheduleKick();

    // --- Delay effect for arpeggios ---
    const delayNode = audioCtx.createDelay(1.0);
    delayNode.delayTime.value = beatSec * 0.75;
    const delayFeedback = audioCtx.createGain();
    delayFeedback.gain.value = 0.35;
    const delayFilter = audioCtx.createBiquadFilter();
    delayFilter.type = 'lowpass';
    delayFilter.frequency.value = 2500;
    delayNode.connect(delayFeedback).connect(delayFilter).connect(delayNode);
    delayNode.connect(dest);
    bgmReg(name, delayNode); bgmReg(name, delayFeedback); bgmReg(name, delayFilter);

    // --- Bright arpeggios: frequent, short, punchy with echo ---
    let arpStep = 0;
    let lastGameArp = null;

    function scheduleGameArp() {
      if (!bgmTracks[name].playing && currentBgm !== name) return;
      const delay = beatSec * (0.75 + Math.random() * 1.25) * 1000;
      const timerId = setTimeout(() => {
        if (!bgmTracks[name].playing && currentBgm !== name) return;
        const ct = audioCtx.currentTime;
        arpStep++;

        const noteArr = arpStep % 3 === 0 ? GAME_HIGH_NOTES : GAME_MID_NOTES;
        const isHigh = arpStep % 3 === 0;
        const note = bgmPickNote(noteArr, lastGameArp);
        lastGameArp = note;

        const osc = audioCtx.createOscillator();
        const waveType = arpStep % 5 === 0 ? 'square' : (isHigh ? 'triangle' : 'sine');
        osc.type = waveType;
        osc.frequency.value = note;

        const lp = audioCtx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = isHigh ? 2500 : 3500;
        lp.Q.value = 1.2;

        const peakGain = isHigh ? 0.07 : (waveType === 'square' ? 0.08 : 0.13);
        const sustainGain = isHigh ? 0.043 : (waveType === 'square' ? 0.05 : 0.085);
        const g = audioCtx.createGain();
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
          const osc2 = audioCtx.createOscillator();
          osc2.type = 'sine';
          osc2.frequency.value = next;
          const g2 = audioCtx.createGain();
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
    function scheduleHat() {
      if (!bgmTracks[name].playing && currentBgm !== name) return;
      const delay = beatSec * 500;
      const timerId = setTimeout(() => {
        if (!bgmTracks[name].playing && currentBgm !== name) return;
        const ct = audioCtx.currentTime;
        hatBeat++;

        const noise = audioCtx.createBufferSource();
        noise.buffer = createNoiseBuffer(0.08);
        const hp = audioCtx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 7000;
        const g = audioCtx.createGain();
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
    function scheduleSparkle() {
      if (!bgmTracks[name].playing && currentBgm !== name) return;
      const delay = 3000 + Math.random() * 4000;
      const timerId = setTimeout(() => {
        if (!bgmTracks[name].playing && currentBgm !== name) return;
        const ct = audioCtx.currentTime;
        const note = bgmPickNote(GAME_SPARKLE_NOTES);
        const osc = audioCtx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = note;
        const g = audioCtx.createGain();
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

  const SFX = {

    // 1. swap() - Warp sound (~0.2s)
    swap() {
      if (!soundEnabled || !audioCtx) return;
      const t = now();

      // Sine sweep 200→800Hz
      const osc1 = audioCtx.createOscillator();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(200, t);
      osc1.frequency.exponentialRampToValueAtTime(800, t + 0.18);
      const g1 = audioCtx.createGain();
      g1.gain.setValueAtTime(0.15, t);
      g1.gain.linearRampToValueAtTime(0.0, t + 0.2);
      osc1.connect(g1).connect(masterGain);
      osc1.start(t);
      osc1.stop(t + 0.2);

      // Triangle sweep 250→900Hz
      const osc2 = audioCtx.createOscillator();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(250, t);
      osc2.frequency.exponentialRampToValueAtTime(900, t + 0.18);
      const g2 = audioCtx.createGain();
      g2.gain.setValueAtTime(0.1, t);
      g2.gain.linearRampToValueAtTime(0.0, t + 0.2);
      osc2.connect(g2).connect(masterGain);
      osc2.start(t);
      osc2.stop(t + 0.2);

      // Bandpass noise whoosh
      const noise = createNoise(0.2);
      const bp = audioCtx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(400, t);
      bp.frequency.exponentialRampToValueAtTime(1200, t + 0.15);
      bp.Q.value = 2;
      const gn = audioCtx.createGain();
      gn.gain.setValueAtTime(0.08, t);
      gn.gain.linearRampToValueAtTime(0.0, t + 0.2);
      noise.connect(bp).connect(gn).connect(masterGain);
      noise.start(t);
      noise.stop(t + 0.2);
    },

    // 2. invalidSwap() - Error buzz (~0.25s)
    invalidSwap() {
      if (!soundEnabled || !audioCtx) return;
      const t = now();

      // Two detuned square waves at 150Hz
      for (let i = 0; i < 2; i++) {
        const osc = audioCtx.createOscillator();
        osc.type = 'square';
        osc.frequency.setValueAtTime(150, t);
        osc.detune.setValueAtTime(i === 0 ? -15 : 15, t);

        // 8Hz LFO vibrato
        const lfo = audioCtx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 8;
        const lfoGain = audioCtx.createGain();
        lfoGain.gain.value = 20;
        lfo.connect(lfoGain).connect(osc.frequency);
        lfo.start(t);
        lfo.stop(t + 0.25);

        const g = audioCtx.createGain();
        g.gain.setValueAtTime(0.12, t);
        g.gain.setValueAtTime(0.12, t + 0.15);
        g.gain.linearRampToValueAtTime(0.0, t + 0.25);
        osc.connect(g).connect(masterGain);
        osc.start(t);
        osc.stop(t + 0.25);
      }
    },

    // 3. drop() - Floating drop (~0.2s)
    drop() {
      if (!soundEnabled || !audioCtx) return;
      const t = now();

      // Sine sweep 400→200Hz (exponential)
      const osc = audioCtx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, t);
      osc.frequency.exponentialRampToValueAtTime(200, t + 0.18);
      const g = audioCtx.createGain();
      g.gain.setValueAtTime(0.15, t);
      g.gain.linearRampToValueAtTime(0.0, t + 0.2);
      osc.connect(g).connect(masterGain);
      osc.start(t);
      osc.stop(t + 0.2);

      // Delay echo (40ms, -12dB)
      const osc2 = audioCtx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(400, t + 0.04);
      osc2.frequency.exponentialRampToValueAtTime(200, t + 0.22);
      const g2 = audioCtx.createGain();
      g2.gain.setValueAtTime(0.0, t);
      g2.gain.setValueAtTime(0.15 * 0.25, t + 0.04); // -12dB ≈ 0.25
      g2.gain.linearRampToValueAtTime(0.0, t + 0.24);
      osc2.connect(g2).connect(masterGain);
      osc2.start(t + 0.04);
      osc2.stop(t + 0.24);
    },

    // 4. clear(chain) - Star extinction (~0.35s)
    clear(chain) {
      if (!soundEnabled || !audioCtx) return;
      const t = now();
      chain = chain || 1;
      const baseFreq = 523 + (chain - 1) * 80;

      // Three detuned sines
      for (let i = -1; i <= 1; i++) {
        const osc = audioCtx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(baseFreq, t);
        osc.detune.setValueAtTime(i * 12, t);
        const g = audioCtx.createGain();
        g.gain.setValueAtTime(0.12, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        osc.connect(g).connect(masterGain);
        osc.start(t);
        osc.stop(t + 0.35);
      }

      // Sparkle pings (2+chain count, 2000-4000Hz range)
      const sparkleCount = 2 + chain;
      for (let i = 0; i < sparkleCount; i++) {
        const freq = 2000 + Math.random() * 2000;
        const delay = Math.random() * 0.15;
        const osc = audioCtx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t + delay);
        const g = audioCtx.createGain();
        g.gain.setValueAtTime(0.0, t);
        g.gain.setValueAtTime(0.08, t + delay);
        g.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.12);
        osc.connect(g).connect(masterGain);
        osc.start(t + delay);
        osc.stop(t + delay + 0.15);
      }

      // Delay echo (50ms)
      const echoOsc = audioCtx.createOscillator();
      echoOsc.type = 'sine';
      echoOsc.frequency.setValueAtTime(baseFreq * 1.5, t + 0.05);
      const eg = audioCtx.createGain();
      eg.gain.setValueAtTime(0.0, t);
      eg.gain.setValueAtTime(0.06, t + 0.05);
      eg.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      echoOsc.connect(eg).connect(masterGain);
      echoOsc.start(t + 0.05);
      echoOsc.stop(t + 0.35);
    },

    // 5. line() - Comet pass (~0.5s)
    line() {
      if (!soundEnabled || !audioCtx) return;
      const t = now();

      // Sawtooth Doppler sweep 1500→400→1200Hz with synced lowpass
      const osc = audioCtx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(1500, t);
      osc.frequency.exponentialRampToValueAtTime(400, t + 0.25);
      osc.frequency.exponentialRampToValueAtTime(1200, t + 0.48);
      const lp = audioCtx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(3000, t);
      lp.frequency.exponentialRampToValueAtTime(600, t + 0.25);
      lp.frequency.exponentialRampToValueAtTime(2500, t + 0.48);
      lp.Q.value = 3;
      const g = audioCtx.createGain();
      g.gain.setValueAtTime(0.1, t);
      g.gain.setValueAtTime(0.1, t + 0.35);
      g.gain.linearRampToValueAtTime(0.0, t + 0.5);

      // Stereo pan left→right
      const panner = createPanner(-1);
      if (panner.pan) {
        panner.pan.setValueAtTime(-1, t);
        panner.pan.linearRampToValueAtTime(1, t + 0.5);
      }
      osc.connect(lp).connect(g).connect(panner).connect(masterGain);
      osc.start(t);
      osc.stop(t + 0.5);

      // Bandpass noise whoosh
      const noise = createNoise(0.5);
      const bp = audioCtx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(2000, t);
      bp.frequency.exponentialRampToValueAtTime(500, t + 0.25);
      bp.frequency.exponentialRampToValueAtTime(1500, t + 0.5);
      bp.Q.value = 1.5;
      const gn = audioCtx.createGain();
      gn.gain.setValueAtTime(0.06, t);
      gn.gain.linearRampToValueAtTime(0.0, t + 0.5);
      const panner2 = createPanner(-1);
      if (panner2.pan) {
        panner2.pan.setValueAtTime(-1, t);
        panner2.pan.linearRampToValueAtTime(1, t + 0.5);
      }
      noise.connect(bp).connect(gn).connect(panner2).connect(masterGain);
      noise.start(t);
      noise.stop(t + 0.5);
    },

    // 6. bomb() - Supernova (~0.8s)
    bomb() {
      if (!soundEnabled || !audioCtx) return;
      const t = now();

      // Noise burst through sweeping lowpass 8k→200Hz
      const noise = createNoise(0.8);
      const lp = audioCtx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(8000, t);
      lp.frequency.exponentialRampToValueAtTime(200, t + 0.6);
      lp.Q.value = 2;
      const gn = audioCtx.createGain();
      gn.gain.setValueAtTime(0.2, t);
      gn.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
      noise.connect(lp).connect(gn).connect(masterGain);
      noise.start(t);
      noise.stop(t + 0.8);

      // Sub-bass 60Hz
      const sub = audioCtx.createOscillator();
      sub.type = 'sine';
      sub.frequency.value = 60;
      const gs = audioCtx.createGain();
      gs.gain.setValueAtTime(0.2, t);
      gs.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
      sub.connect(gs).connect(masterGain);
      sub.start(t);
      sub.stop(t + 0.7);

      // 3 detuned sawtooth rumble 40/55/75Hz through lowpass 150Hz
      [40, 55, 75].forEach(freq => {
        const osc = audioCtx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = freq;
        const lp2 = audioCtx.createBiquadFilter();
        lp2.type = 'lowpass';
        lp2.frequency.value = 150;
        lp2.Q.value = 1;
        const g = audioCtx.createGain();
        g.gain.setValueAtTime(0.1, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.75);
        osc.connect(lp2).connect(g).connect(masterGain);
        osc.start(t);
        osc.stop(t + 0.8);
      });

      // Shockwave ping 200Hz with delay echo
      const ping = audioCtx.createOscillator();
      ping.type = 'sine';
      ping.frequency.setValueAtTime(200, t);
      ping.frequency.exponentialRampToValueAtTime(80, t + 0.3);
      const gp = audioCtx.createGain();
      gp.gain.setValueAtTime(0.15, t);
      gp.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      ping.connect(gp).connect(masterGain);
      ping.start(t);
      ping.stop(t + 0.3);

      // Delay echo of shockwave
      const ping2 = audioCtx.createOscillator();
      ping2.type = 'sine';
      ping2.frequency.setValueAtTime(200, t + 0.08);
      ping2.frequency.exponentialRampToValueAtTime(80, t + 0.38);
      const gp2 = audioCtx.createGain();
      gp2.gain.setValueAtTime(0.0, t);
      gp2.gain.setValueAtTime(0.07, t + 0.08);
      gp2.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
      ping2.connect(gp2).connect(masterGain);
      ping2.start(t + 0.08);
      ping2.stop(t + 0.4);
    },

    // 7. rainbow() - Black hole (~0.8s)
    rainbow() {
      if (!soundEnabled || !audioCtx) return;
      const t = now();

      // Low sine 80Hz drone with 3Hz LFO vibrato, REVERSED envelope
      const drone = audioCtx.createOscillator();
      drone.type = 'sine';
      drone.frequency.value = 80;
      const lfo = audioCtx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 3;
      const lfoGain = audioCtx.createGain();
      lfoGain.gain.value = 15;
      lfo.connect(lfoGain).connect(drone.frequency);
      lfo.start(t);
      lfo.stop(t + 0.8);
      // Reversed envelope: quiet→swell→peak→cut
      const gd = audioCtx.createGain();
      gd.gain.setValueAtTime(0.02, t);
      gd.gain.linearRampToValueAtTime(0.18, t + 0.55);
      gd.gain.setValueAtTime(0.18, t + 0.65);
      gd.gain.linearRampToValueAtTime(0.0, t + 0.72);
      drone.connect(gd).connect(masterGain);
      drone.start(t);
      drone.stop(t + 0.8);

      // 3 sawtooth sweep 1500/1600/1700→60Hz through closing lowpass
      [1500, 1600, 1700].forEach(startFreq => {
        const osc = audioCtx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(startFreq, t);
        osc.frequency.exponentialRampToValueAtTime(60, t + 0.7);
        const lp = audioCtx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(4000, t);
        lp.frequency.exponentialRampToValueAtTime(100, t + 0.7);
        lp.Q.value = 4;
        const g = audioCtx.createGain();
        g.gain.setValueAtTime(0.01, t);
        g.gain.linearRampToValueAtTime(0.08, t + 0.5);
        g.gain.linearRampToValueAtTime(0.0, t + 0.75);
        osc.connect(lp).connect(g).connect(masterGain);
        osc.start(t);
        osc.stop(t + 0.8);
      });

      // Eerie triangle harmonics at 120/160Hz
      [120, 160].forEach(freq => {
        const osc = audioCtx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        const g = audioCtx.createGain();
        g.gain.setValueAtTime(0.01, t);
        g.gain.linearRampToValueAtTime(0.1, t + 0.5);
        g.gain.linearRampToValueAtTime(0.0, t + 0.75);
        osc.connect(g).connect(masterGain);
        osc.start(t);
        osc.stop(t + 0.8);
      });
    },

    // 8. diagonal() - Meteor shower (~0.4s)
    diagonal() {
      if (!soundEnabled || !audioCtx) return;
      const t = now();

      // 5 sequential descending sine pings, spaced 60ms
      for (let i = 0; i < 5; i++) {
        const startTime = t + i * 0.06;
        const startFreq = 1200 + (Math.random() * 200 - 100);
        const osc = audioCtx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(startFreq, startTime);
        osc.frequency.exponentialRampToValueAtTime(startFreq - 600, startTime + 0.08);
        const g = audioCtx.createGain();
        g.gain.setValueAtTime(0.0, t);
        g.gain.setValueAtTime(0.12, startTime);
        g.gain.exponentialRampToValueAtTime(0.001, startTime + 0.1);
        osc.connect(g).connect(masterGain);
        osc.start(startTime);
        osc.stop(startTime + 0.12);

        // Highpass noise sparkle tail
        const noise = createNoise(0.1);
        const hp = audioCtx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 4000 + i * 400;
        hp.Q.value = 1;
        const gn = audioCtx.createGain();
        gn.gain.setValueAtTime(0.0, t);
        gn.gain.setValueAtTime(0.05, startTime);
        gn.gain.exponentialRampToValueAtTime(0.001, startTime + 0.08);
        noise.connect(hp).connect(gn).connect(masterGain);
        noise.start(startTime);
        noise.stop(startTime + 0.1);
      }
    },

    // 9. cross() - Comet collision (~0.5s)
    cross() {
      if (!soundEnabled || !audioCtx) return;
      const t = now();

      // Ascending sawtooth sweep 200→1000Hz
      const osc1 = audioCtx.createOscillator();
      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(200, t);
      osc1.frequency.exponentialRampToValueAtTime(1000, t + 0.25);
      const lp1 = audioCtx.createBiquadFilter();
      lp1.type = 'lowpass';
      lp1.frequency.value = 2000;
      lp1.Q.value = 2;
      const g1 = audioCtx.createGain();
      g1.gain.setValueAtTime(0.1, t);
      g1.gain.linearRampToValueAtTime(0.15, t + 0.24);
      g1.gain.linearRampToValueAtTime(0.0, t + 0.35);
      osc1.connect(lp1).connect(g1).connect(masterGain);
      osc1.start(t);
      osc1.stop(t + 0.35);

      // Descending sawtooth sweep 2000→1000Hz
      const osc2 = audioCtx.createOscillator();
      osc2.type = 'sawtooth';
      osc2.frequency.setValueAtTime(2000, t);
      osc2.frequency.exponentialRampToValueAtTime(1000, t + 0.25);
      const lp2 = audioCtx.createBiquadFilter();
      lp2.type = 'lowpass';
      lp2.frequency.value = 3000;
      lp2.Q.value = 2;
      const g2 = audioCtx.createGain();
      g2.gain.setValueAtTime(0.1, t);
      g2.gain.linearRampToValueAtTime(0.15, t + 0.24);
      g2.gain.linearRampToValueAtTime(0.0, t + 0.35);
      osc2.connect(lp2).connect(g2).connect(masterGain);
      osc2.start(t);
      osc2.stop(t + 0.35);

      // Impact: noise burst at convergence
      const noise = createNoise(0.3);
      const lp3 = audioCtx.createBiquadFilter();
      lp3.type = 'lowpass';
      lp3.frequency.setValueAtTime(6000, t + 0.25);
      lp3.frequency.exponentialRampToValueAtTime(200, t + 0.5);
      lp3.Q.value = 1;
      const gn = audioCtx.createGain();
      gn.gain.setValueAtTime(0.0, t);
      gn.gain.setValueAtTime(0.18, t + 0.25);
      gn.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      noise.connect(lp3).connect(gn).connect(masterGain);
      noise.start(t + 0.2);
      noise.stop(t + 0.5);

      // Sub-bass 80Hz thump at impact
      const sub = audioCtx.createOscillator();
      sub.type = 'sine';
      sub.frequency.value = 80;
      const gs = audioCtx.createGain();
      gs.gain.setValueAtTime(0.0, t);
      gs.gain.setValueAtTime(0.2, t + 0.25);
      gs.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      sub.connect(gs).connect(masterGain);
      sub.start(t + 0.25);
      sub.stop(t + 0.5);
    },

    // 10. starCross() - Meteor storm (~0.6s)
    starCross() {
      if (!soundEnabled || !audioCtx) return;
      const t = now();

      // 4 directional sweeps converging to 800Hz
      const starts = [200, 2000, 400, 1600];
      starts.forEach((startFreq, i) => {
        const osc = audioCtx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(startFreq, t);
        osc.frequency.exponentialRampToValueAtTime(800, t + 0.3);
        const lp = audioCtx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 2500;
        lp.Q.value = 2;
        const g = audioCtx.createGain();
        g.gain.setValueAtTime(0.08, t);
        g.gain.linearRampToValueAtTime(0.12, t + 0.28);
        g.gain.linearRampToValueAtTime(0.0, t + 0.4);
        // Pan each sweep to a different position
        const panVal = [-0.8, 0.8, -0.4, 0.4][i];
        const panner = createPanner(panVal);
        if (panner.pan) {
          panner.pan.setValueAtTime(panVal, t);
          panner.pan.linearRampToValueAtTime(0, t + 0.3);
        }
        osc.connect(lp).connect(g).connect(panner).connect(masterGain);
        osc.start(t);
        osc.stop(t + 0.4);
      });

      // Impact noise burst
      const noise = createNoise(0.3);
      const lp = audioCtx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(8000, t + 0.3);
      lp.frequency.exponentialRampToValueAtTime(300, t + 0.6);
      lp.Q.value = 1;
      const gn = audioCtx.createGain();
      gn.gain.setValueAtTime(0.0, t);
      gn.gain.setValueAtTime(0.15, t + 0.3);
      gn.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      noise.connect(lp).connect(gn).connect(masterGain);
      noise.start(t + 0.25);
      noise.stop(t + 0.6);

      // 3 shimmer pings
      for (let i = 0; i < 3; i++) {
        const freq = 1800 + i * 600;
        const delay = 0.3 + i * 0.04;
        const osc = audioCtx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t + delay);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.7, t + delay + 0.15);
        const g = audioCtx.createGain();
        g.gain.setValueAtTime(0.0, t);
        g.gain.setValueAtTime(0.1, t + delay);
        g.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.15);
        osc.connect(g).connect(masterGain);
        osc.start(t + delay);
        osc.stop(t + delay + 0.18);
      }
    },

    // 11. tripleLine() - Comet swarm (~0.6s)
    tripleLine() {
      if (!soundEnabled || !audioCtx) return;
      const t = now();

      // 3 detuned sawtooth sweeps with V-shaped Doppler curves
      [-100, 0, 100].forEach((detuneCents, i) => {
        const osc = audioCtx.createOscillator();
        osc.type = 'sawtooth';
        osc.detune.setValueAtTime(detuneCents, t);
        // V-shaped Doppler: high → low → high
        osc.frequency.setValueAtTime(1400 + i * 50, t);
        osc.frequency.exponentialRampToValueAtTime(350, t + 0.3);
        osc.frequency.exponentialRampToValueAtTime(1200 + i * 50, t + 0.58);
        const lp = audioCtx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(3000, t);
        lp.frequency.exponentialRampToValueAtTime(600, t + 0.3);
        lp.frequency.exponentialRampToValueAtTime(2500, t + 0.58);
        lp.Q.value = 3;
        const g = audioCtx.createGain();
        g.gain.setValueAtTime(0.08, t);
        g.gain.setValueAtTime(0.08, t + 0.45);
        g.gain.linearRampToValueAtTime(0.0, t + 0.6);
        const panVal = (i - 1) * 0.6;
        const panner = createPanner(panVal);
        osc.connect(lp).connect(g).connect(panner).connect(masterGain);
        osc.start(t);
        osc.stop(t + 0.6);
      });

      // Heavy bandpass noise
      const noise = createNoise(0.6);
      const bp = audioCtx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(1800, t);
      bp.frequency.exponentialRampToValueAtTime(400, t + 0.3);
      bp.frequency.exponentialRampToValueAtTime(1500, t + 0.6);
      bp.Q.value = 2;
      const gn = audioCtx.createGain();
      gn.gain.setValueAtTime(0.1, t);
      gn.gain.linearRampToValueAtTime(0.0, t + 0.6);
      noise.connect(bp).connect(gn).connect(masterGain);
      noise.start(t);
      noise.stop(t + 0.6);
    },

    // 12. bigBomb() - Big bang (~1.2s)
    bigBomb() {
      if (!soundEnabled || !audioCtx) return;
      const t = now();
      const onset = t + 0.02; // 20ms silence

      // Massive noise burst (lowpass 12k→100Hz)
      const noise = createNoise(1.2);
      const lp = audioCtx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(12000, onset);
      lp.frequency.exponentialRampToValueAtTime(100, onset + 0.9);
      lp.Q.value = 2;
      const gn = audioCtx.createGain();
      gn.gain.setValueAtTime(0.0, t);
      gn.gain.setValueAtTime(0.5, onset);
      gn.gain.exponentialRampToValueAtTime(0.001, onset + 1.1);
      noise.connect(lp).connect(gn).connect(masterGain);
      noise.start(onset);
      noise.stop(onset + 1.18);

      // Deep sub-bass 45Hz
      const sub = audioCtx.createOscillator();
      sub.type = 'sine';
      sub.frequency.value = 45;
      const gs = audioCtx.createGain();
      gs.gain.setValueAtTime(0.0, t);
      gs.gain.setValueAtTime(0.25, onset);
      gs.gain.exponentialRampToValueAtTime(0.001, onset + 1.0);
      sub.connect(gs).connect(masterGain);
      sub.start(onset);
      sub.stop(onset + 1.0);

      // 4 detuned rumble 35/50/65/80Hz
      [35, 50, 65, 80].forEach(freq => {
        const osc = audioCtx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = freq;
        const lpR = audioCtx.createBiquadFilter();
        lpR.type = 'lowpass';
        lpR.frequency.value = 180;
        lpR.Q.value = 1;
        const g = audioCtx.createGain();
        g.gain.setValueAtTime(0.0, t);
        g.gain.setValueAtTime(0.08, onset);
        g.gain.exponentialRampToValueAtTime(0.001, onset + 1.0);
        osc.connect(lpR).connect(g).connect(masterGain);
        osc.start(onset);
        osc.stop(onset + 1.0);
      });

      // 3 shockwave pings with delays
      for (let i = 0; i < 3; i++) {
        const delay = i * 0.12;
        const ping = audioCtx.createOscillator();
        ping.type = 'sine';
        ping.frequency.setValueAtTime(250 - i * 40, onset + delay);
        ping.frequency.exponentialRampToValueAtTime(60, onset + delay + 0.3);
        const gp = audioCtx.createGain();
        gp.gain.setValueAtTime(0.0, t);
        gp.gain.setValueAtTime(0.12 - i * 0.03, onset + delay);
        gp.gain.exponentialRampToValueAtTime(0.001, onset + delay + 0.3);
        ping.connect(gp).connect(masterGain);
        ping.start(onset + delay);
        ping.stop(onset + delay + 0.35);
      }

      // Wide sawtooth sweep 3k→50Hz
      const sweep = audioCtx.createOscillator();
      sweep.type = 'sawtooth';
      sweep.frequency.setValueAtTime(3000, onset);
      sweep.frequency.exponentialRampToValueAtTime(50, onset + 0.8);
      const lpS = audioCtx.createBiquadFilter();
      lpS.type = 'lowpass';
      lpS.frequency.setValueAtTime(5000, onset);
      lpS.frequency.exponentialRampToValueAtTime(100, onset + 0.8);
      lpS.Q.value = 3;
      const gSweep = audioCtx.createGain();
      gSweep.gain.setValueAtTime(0.0, t);
      gSweep.gain.setValueAtTime(0.12, onset);
      gSweep.gain.exponentialRampToValueAtTime(0.001, onset + 0.9);
      sweep.connect(lpS).connect(gSweep).connect(masterGain);
      sweep.start(onset);
      sweep.stop(onset + 0.9);
    },

    // 13. rainbowLine() - Gravitational catapult (~0.77s)
    rainbowLine() {
      if (!soundEnabled || !audioCtx) return;
      const t = now();

      // Phase 1: Short black hole drone + descending vortex sweep (~0.22s)
      const drone = audioCtx.createOscillator();
      drone.type = 'sine';
      drone.frequency.value = 80;
      const lfo = audioCtx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 5;
      const lfoG = audioCtx.createGain();
      lfoG.gain.value = 20;
      lfo.connect(lfoG).connect(drone.frequency);
      lfo.start(t);
      lfo.stop(t + 0.22);
      const gd = audioCtx.createGain();
      gd.gain.setValueAtTime(0.12, t);
      gd.gain.linearRampToValueAtTime(0.0, t + 0.22);
      drone.connect(gd).connect(masterGain);
      drone.start(t);
      drone.stop(t + 0.22);

      // Descending vortex sweep
      const vortex = audioCtx.createOscillator();
      vortex.type = 'sawtooth';
      vortex.frequency.setValueAtTime(2000, t);
      vortex.frequency.exponentialRampToValueAtTime(100, t + 0.22);
      const lpV = audioCtx.createBiquadFilter();
      lpV.type = 'lowpass';
      lpV.frequency.setValueAtTime(4000, t);
      lpV.frequency.exponentialRampToValueAtTime(200, t + 0.22);
      lpV.Q.value = 5;
      const gv = audioCtx.createGain();
      gv.gain.setValueAtTime(0.1, t);
      gv.gain.linearRampToValueAtTime(0.0, t + 0.22);
      vortex.connect(lpV).connect(gv).connect(masterGain);
      vortex.start(t);
      vortex.stop(t + 0.22);

      // Phase 2: 5 rapid comet whooshes 110ms apart with increasing pitch
      for (let i = 0; i < 5; i++) {
        const st = t + 0.22 + i * 0.11;
        const baseFreq = 400 + i * 150;
        const osc = audioCtx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(baseFreq, st);
        osc.frequency.exponentialRampToValueAtTime(baseFreq * 2.5, st + 0.08);
        const lp = audioCtx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(baseFreq * 3, st);
        lp.frequency.exponentialRampToValueAtTime(baseFreq, st + 0.09);
        lp.Q.value = 2;
        const g = audioCtx.createGain();
        g.gain.setValueAtTime(0.0, t);
        g.gain.setValueAtTime(0.1, st);
        g.gain.exponentialRampToValueAtTime(0.001, st + 0.1);

        const panVal = -0.6 + i * 0.3;
        const panner = createPanner(panVal);
        osc.connect(lp).connect(g).connect(panner).connect(masterGain);
        osc.start(st);
        osc.stop(st + 0.11);

        // Noise tail per whoosh
        const n = createNoise(0.08);
        const bp = audioCtx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = baseFreq * 2;
        bp.Q.value = 1;
        const gn = audioCtx.createGain();
        gn.gain.setValueAtTime(0.0, t);
        gn.gain.setValueAtTime(0.05, st);
        gn.gain.exponentialRampToValueAtTime(0.001, st + 0.08);
        n.connect(bp).connect(gn).connect(panner).connect(masterGain);
        n.start(st);
        n.stop(st + 0.08);
      }
    },

    // 14. rainbowBomb() - Quasar (~1.0s)
    rainbowBomb() {
      if (!soundEnabled || !audioCtx) return;
      const t = now();

      // Sustained energy beam: bandpass noise Q=10, sweeping 500→4k→1kHz
      const beam = createNoise(0.7);
      const bp = audioCtx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(500, t);
      bp.frequency.exponentialRampToValueAtTime(4000, t + 0.35);
      bp.frequency.exponentialRampToValueAtTime(1000, t + 0.65);
      bp.Q.value = 10;
      const gb = audioCtx.createGain();
      gb.gain.setValueAtTime(0.15, t);
      gb.gain.setValueAtTime(0.15, t + 0.5);
      gb.gain.linearRampToValueAtTime(0.0, t + 0.7);
      beam.connect(bp).connect(gb).connect(masterGain);
      beam.start(t);
      beam.stop(t + 0.7);

      // Sub-bass 50Hz
      const sub = audioCtx.createOscillator();
      sub.type = 'sine';
      sub.frequency.value = 50;
      const gs = audioCtx.createGain();
      gs.gain.setValueAtTime(0.18, t);
      gs.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
      sub.connect(gs).connect(masterGain);
      sub.start(t);
      sub.stop(t + 0.8);

      // 3 explosion aftershocks (noise + lowpass + bass thump)
      for (let i = 0; i < 3; i++) {
        const st = t + 0.3 + i * 0.22;

        // Noise
        const n = createNoise(0.2);
        const lp = audioCtx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(6000 - i * 1500, st);
        lp.frequency.exponentialRampToValueAtTime(200, st + 0.18);
        lp.Q.value = 1;
        const gn = audioCtx.createGain();
        gn.gain.setValueAtTime(0.0, t);
        gn.gain.setValueAtTime(0.15 - i * 0.04, st);
        gn.gain.exponentialRampToValueAtTime(0.001, st + 0.18);
        n.connect(lp).connect(gn).connect(masterGain);
        n.start(st);
        n.stop(st + 0.2);

        // Bass thump
        const bass = audioCtx.createOscillator();
        bass.type = 'sine';
        bass.frequency.setValueAtTime(80 - i * 10, st);
        bass.frequency.exponentialRampToValueAtTime(30, st + 0.15);
        const gBass = audioCtx.createGain();
        gBass.gain.setValueAtTime(0.0, t);
        gBass.gain.setValueAtTime(0.15 - i * 0.04, st);
        gBass.gain.exponentialRampToValueAtTime(0.001, st + 0.15);
        bass.connect(gBass).connect(masterGain);
        bass.start(st);
        bass.stop(st + 0.18);
      }
    },

    // 15. boardClear() - Galaxy collision (~1.5s)
    boardClear() {
      if (!soundEnabled || !audioCtx) return;
      const t = now();

      // 4-oscillator harmonic build-up (root/3rd/5th/octave) sweeping 200→2000Hz through opening lowpass
      const intervals = [1, 1.25, 1.5, 2]; // root, major 3rd, 5th, octave
      intervals.forEach((ratio, i) => {
        const osc = audioCtx.createOscillator();
        osc.type = i % 2 === 0 ? 'sawtooth' : 'triangle';
        osc.frequency.setValueAtTime(200 * ratio, t);
        osc.frequency.exponentialRampToValueAtTime(2000 * ratio, t + 0.7);
        const lp = audioCtx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(400, t);
        lp.frequency.exponentialRampToValueAtTime(6000, t + 0.7);
        lp.Q.value = 3;
        const g = audioCtx.createGain();
        g.gain.setValueAtTime(0.03, t);
        g.gain.linearRampToValueAtTime(0.1, t + 0.65);
        g.gain.linearRampToValueAtTime(0.0, t + 0.8);
        osc.connect(lp).connect(g).connect(masterGain);
        osc.start(t);
        osc.stop(t + 0.8);
      });

      // Climax: massive noise explosion
      const noise = createNoise(0.8);
      const lp = audioCtx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(12000, t + 0.7);
      lp.frequency.exponentialRampToValueAtTime(150, t + 1.4);
      lp.Q.value = 1;
      const gn = audioCtx.createGain();
      gn.gain.setValueAtTime(0.0, t);
      gn.gain.setValueAtTime(0.35, t + 0.7);
      gn.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
      noise.connect(lp).connect(gn).connect(masterGain);
      noise.start(t + 0.65);
      noise.stop(t + 1.45);

      // Bass drop 200→30Hz
      const bass = audioCtx.createOscillator();
      bass.type = 'sine';
      bass.frequency.setValueAtTime(200, t + 0.7);
      bass.frequency.exponentialRampToValueAtTime(30, t + 1.4);
      const gBass = audioCtx.createGain();
      gBass.gain.setValueAtTime(0.0, t);
      gBass.gain.setValueAtTime(0.25, t + 0.7);
      gBass.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
      bass.connect(gBass).connect(masterGain);
      bass.start(t + 0.7);
      bass.stop(t + 1.45);

      // 5 shimmer harmonics
      for (let i = 0; i < 5; i++) {
        const freq = 1200 + i * 400;
        const delay = 0.7 + i * 0.05;
        const osc = audioCtx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t + delay);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.5, t + delay + 0.4);
        const g = audioCtx.createGain();
        g.gain.setValueAtTime(0.0, t);
        g.gain.setValueAtTime(0.08, t + delay);
        g.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.4);
        osc.connect(g).connect(masterGain);
        osc.start(t + delay);
        osc.stop(t + delay + 0.45);
      }

      // Sub-rumble
      const rumble = audioCtx.createOscillator();
      rumble.type = 'sawtooth';
      rumble.frequency.value = 35;
      const lpR = audioCtx.createBiquadFilter();
      lpR.type = 'lowpass';
      lpR.frequency.value = 100;
      const gR = audioCtx.createGain();
      gR.gain.setValueAtTime(0.0, t);
      gR.gain.setValueAtTime(0.1, t + 0.7);
      gR.gain.exponentialRampToValueAtTime(0.001, t + 1.5);
      rumble.connect(lpR).connect(gR).connect(masterGain);
      rumble.start(t + 0.7);
      rumble.stop(t + 1.5);
    },

    // 16. stageClear() - Mission complete (~1.1s)
    stageClear() {
      if (!soundEnabled || !audioCtx) return;
      const t = now();

      // 4-note ascending major chord C5/E5/G5/C6
      const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
      notes.forEach((freq, i) => {
        const startTime = t + i * 0.08;

        // Triangle + sine blend
        const tri = audioCtx.createOscillator();
        tri.type = 'triangle';
        tri.frequency.value = freq;
        const sine = audioCtx.createOscillator();
        sine.type = 'sine';
        sine.frequency.value = freq;

        const gTri = audioCtx.createGain();
        gTri.gain.setValueAtTime(0.0, t);
        gTri.gain.setValueAtTime(0.12, startTime);
        if (i < 3) {
          gTri.gain.exponentialRampToValueAtTime(0.001, startTime + 0.5);
        } else {
          // Last note sustained
          gTri.gain.setValueAtTime(0.12, startTime + 0.4);
          gTri.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
        }
        const gSine = audioCtx.createGain();
        gSine.gain.setValueAtTime(0.0, t);
        gSine.gain.setValueAtTime(0.08, startTime);
        if (i < 3) {
          gSine.gain.exponentialRampToValueAtTime(0.001, startTime + 0.5);
        } else {
          gSine.gain.setValueAtTime(0.08, startTime + 0.4);
          gSine.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
        }

        tri.connect(gTri).connect(masterGain);
        sine.connect(gSine).connect(masterGain);
        tri.start(startTime);
        sine.start(startTime);
        const endTime = i < 3 ? startTime + 0.55 : t + 1.1;
        tri.stop(endTime);
        sine.stop(endTime);

        // Delay reverb echo per note
        const echoTri = audioCtx.createOscillator();
        echoTri.type = 'triangle';
        echoTri.frequency.value = freq;
        const echoG = audioCtx.createGain();
        echoG.gain.setValueAtTime(0.0, t);
        echoG.gain.setValueAtTime(0.05, startTime + 0.06);
        echoG.gain.exponentialRampToValueAtTime(0.001, startTime + 0.4);
        echoTri.connect(echoG).connect(masterGain);
        echoTri.start(startTime + 0.06);
        echoTri.stop(startTime + 0.45);

        // Second echo, quieter
        const echo2 = audioCtx.createOscillator();
        echo2.type = 'sine';
        echo2.frequency.value = freq;
        const echoG2 = audioCtx.createGain();
        echoG2.gain.setValueAtTime(0.0, t);
        echoG2.gain.setValueAtTime(0.025, startTime + 0.12);
        echoG2.gain.exponentialRampToValueAtTime(0.001, startTime + 0.35);
        echo2.connect(echoG2).connect(masterGain);
        echo2.start(startTime + 0.12);
        echo2.stop(startTime + 0.4);
      });
    },

    // 17. stageFail() - Mission failed (~1.0s)
    stageFail() {
      if (!soundEnabled || !audioCtx) return;
      const t = now();

      // 3 descending notes E4/C4/A3, staggered 200ms
      const notes = [329.63, 261.63, 220.0]; // E4, C4, A3
      const closingLP = audioCtx.createBiquadFilter();
      closingLP.type = 'lowpass';
      closingLP.frequency.setValueAtTime(2000, t);
      closingLP.frequency.exponentialRampToValueAtTime(200, t + 1.0);
      closingLP.Q.value = 1;
      closingLP.connect(masterGain);

      notes.forEach((freq, i) => {
        const startTime = t + i * 0.2;

        const osc = audioCtx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = freq;

        // Slow 2Hz LFO vibrato
        const lfo = audioCtx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 2;
        const lfoG = audioCtx.createGain();
        lfoG.gain.value = 8;
        lfo.connect(lfoG).connect(osc.frequency);
        lfo.start(startTime);
        lfo.stop(startTime + 0.6);

        const g = audioCtx.createGain();
        g.gain.setValueAtTime(0.0, t);
        g.gain.setValueAtTime(0.15, startTime);
        g.gain.exponentialRampToValueAtTime(0.001, startTime + 0.6);
        osc.connect(g).connect(closingLP);
        osc.start(startTime);
        osc.stop(startTime + 0.65);

        // Sine layer
        const sine = audioCtx.createOscillator();
        sine.type = 'sine';
        sine.frequency.value = freq;
        const lfo2 = audioCtx.createOscillator();
        lfo2.type = 'sine';
        lfo2.frequency.value = 2;
        const lfoG2 = audioCtx.createGain();
        lfoG2.gain.value = 6;
        lfo2.connect(lfoG2).connect(sine.frequency);
        lfo2.start(startTime);
        lfo2.stop(startTime + 0.6);
        const gS = audioCtx.createGain();
        gS.gain.setValueAtTime(0.0, t);
        gS.gain.setValueAtTime(0.1, startTime);
        gS.gain.exponentialRampToValueAtTime(0.001, startTime + 0.55);
        sine.connect(gS).connect(closingLP);
        sine.start(startTime);
        sine.stop(startTime + 0.6);
      });
    },

    // 18. countdown() - Meteor alert (~0.4s)
    countdown() {
      if (!soundEnabled || !audioCtx) return;
      const t = now();

      // Square 440Hz with 4Hz AM modulation
      const osc1 = audioCtx.createOscillator();
      osc1.type = 'square';
      osc1.frequency.value = 440;
      const g1 = audioCtx.createGain();
      g1.gain.setValueAtTime(0.12, t);
      g1.gain.linearRampToValueAtTime(0.0, t + 0.4);
      // 4Hz AM modulation
      const am1 = audioCtx.createOscillator();
      am1.type = 'sine';
      am1.frequency.value = 4;
      const amG1 = audioCtx.createGain();
      amG1.gain.value = 0.06;
      am1.connect(amG1).connect(g1.gain);
      am1.start(t);
      am1.stop(t + 0.4);
      osc1.connect(g1).connect(masterGain);
      osc1.start(t);
      osc1.stop(t + 0.4);

      // Higher harmonic 880Hz also AM-modulated
      const osc2 = audioCtx.createOscillator();
      osc2.type = 'square';
      osc2.frequency.value = 880;
      const g2 = audioCtx.createGain();
      g2.gain.setValueAtTime(0.08, t);
      g2.gain.linearRampToValueAtTime(0.0, t + 0.4);
      const am2 = audioCtx.createOscillator();
      am2.type = 'sine';
      am2.frequency.value = 4;
      const amG2 = audioCtx.createGain();
      amG2.gain.value = 0.04;
      am2.connect(amG2).connect(g2.gain);
      am2.start(t);
      am2.stop(t + 0.4);
      osc2.connect(g2).connect(masterGain);
      osc2.start(t);
      osc2.stop(t + 0.4);
    },

    // 19. iceCrack() - Ice shatter (~0.3s)
    iceCrack() {
      if (!soundEnabled || !audioCtx) return;
      const t = now();

      // Highpass noise 3kHz
      const noise = createNoise(0.25);
      const hp = audioCtx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 3000;
      hp.Q.value = 1;
      const gn = audioCtx.createGain();
      gn.gain.setValueAtTime(0.15, t);
      gn.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      noise.connect(hp).connect(gn).connect(masterGain);
      noise.start(t);
      noise.stop(t + 0.25);

      // Glass triangle ping 3kHz
      const glass = audioCtx.createOscillator();
      glass.type = 'triangle';
      glass.frequency.setValueAtTime(3000, t);
      glass.frequency.exponentialRampToValueAtTime(2000, t + 0.2);
      const gg = audioCtx.createGain();
      gg.gain.setValueAtTime(0.12, t);
      gg.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      glass.connect(gg).connect(masterGain);
      glass.start(t);
      glass.stop(t + 0.3);

      // 4 random tinkle pings 3500-6500Hz
      for (let i = 0; i < 4; i++) {
        const freq = 3500 + Math.random() * 3000;
        const delay = 0.02 + Math.random() * 0.1;
        const ping = audioCtx.createOscillator();
        ping.type = 'sine';
        ping.frequency.setValueAtTime(freq, t + delay);
        ping.frequency.exponentialRampToValueAtTime(freq * 0.6, t + delay + 0.1);
        const gp = audioCtx.createGain();
        gp.gain.setValueAtTime(0.0, t);
        gp.gain.setValueAtTime(0.08, t + delay);
        gp.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.1);
        ping.connect(gp).connect(masterGain);
        ping.start(t + delay);
        ping.stop(t + delay + 0.12);
      }
    },

    // Combo dispatcher
    combo(type) {
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

  // ============================================================
  //  VFX Infrastructure — Variables & State
  // ============================================================

  let vfxParticles = [];
  let vfxShockwaves = [];
  let vfxFlashes = [];
  let vfxComets = [];
  let vfxTexts = [];
  let shakeX = 0, shakeY = 0, shakeIntensity = 0;

  // ============================================================
  //  Easing Functions
  // ============================================================

  function easeOutQuad(t) { return t * (2 - t); }
  function easeInQuad(t)  { return t * t; }

  // ============================================================
  //  Helper: Cell Pixel Center
  // ============================================================

  function cellCenter(r, c) {
    return {
      x: c * cellSize + cellSize / 2,
      y: r * cellSize + cellSize / 2
    };
  }

  // ============================================================
  //  addParticle — Single Star-Shaped Particle
  // ============================================================
  //  Shape: 4-point star (two overlapping rotated diamonds).
  //  Each particle carries its own velocity, color, size, and
  //  a life value that drains by `decay` per frame.

  function addParticle(x, y, color, opts = {}) {
    vfxParticles.push({
      x,
      y,
      vx:        opts.vx        || 0,
      vy:        opts.vy        || 0,
      color:     color,
      life:      1,
      decay:     opts.decay     || 0.03,
      size:      opts.size      || 4,
      sizeDecay: opts.sizeDecay || 0.05,
      alpha:     1,
      rotation:  Math.random() * Math.PI * 2
    });
  }

  // ============================================================
  //  addBurstParticles — Radial Burst of N Particles
  // ============================================================
  //  Distributes `count` particles evenly around a circle with
  //  some random angular jitter and speed variance.

  function addBurstParticles(x, y, color, count, opts = {}) {
    const speed     = opts.speed     || 3;
    const size      = opts.size      || 4;
    const decay     = opts.decay     || 0.03;
    const sizeDecay = opts.sizeDecay || 0.05;

    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i / count) + (Math.random() - 0.5) * 0.4;
      const spd   = speed * (0.6 + Math.random() * 0.8);
      addParticle(x, y, color, {
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        size,
        decay,
        sizeDecay
      });
    }
  }

  // ============================================================
  //  addShockwave — Expanding Ring
  // ============================================================

  function addShockwave(x, y, maxR, duration, color) {
    vfxShockwaves.push({
      x, y,
      r:        0,
      maxR:     maxR     || 60,
      frame:    0,
      duration: duration || 20,
      color:    color    || '#ffffff'
    });
  }

  // ============================================================
  //  addFlash — Expanding Filled Circle
  // ============================================================

  function addFlash(x, y, maxR, color, duration) {
    vfxFlashes.push({
      x, y,
      r:        0,
      maxR:     maxR     || 50,
      frame:    0,
      duration: duration || 15,
      color:    color    || '#ffffff'
    });
  }

  // ============================================================
  //  addComet — Moving Projectile with Trail
  // ============================================================
  //  Stores the last `trailLength` positions. Head is drawn as
  //  a white circle with a colored glow; trail is a series of
  //  shrinking, fading dots. Auto-removed when far out of bounds.

  function addComet(x, y, dx, dy, color, speed, trailLength) {
    speed       = speed       || 8;
    trailLength = trailLength || 12;
    vfxComets.push({
      x, y,
      dx, dy,          // unit direction
      speed,
      color,
      trail:       [],
      trailLength,
      life:        1,
      active:      true
    });
  }

  // ============================================================
  //  addScreenShake — Trigger Screen Shake
  // ============================================================

  function addScreenShake(intensity) {
    shakeIntensity = Math.max(shakeIntensity, intensity);
  }

  // ============================================================
  //  addFloatingText — Rising, Fading Text
  // ============================================================

  function addFloatingText(text, x, y, color, size) {
    vfxTexts.push({
      text,
      x, y,
      color:    color || '#ffffff',
      size:     size  || 24,
      life:     1,
      decay:    0.02,
      vy:       -1.5        // drifts upward
    });
  }

  // ============================================================
  //  updateVFX — Per-Frame Update for All VFX
  // ============================================================

  function updateVFX() {
    // --- Particles ---
    for (let i = vfxParticles.length - 1; i >= 0; i--) {
      const p = vfxParticles[i];
      p.x    += p.vx;
      p.y    += p.vy;
      p.vy   += 0.04;          // slight gravity
      p.life -= p.decay;
      p.size  = Math.max(0, p.size - p.sizeDecay);
      p.alpha = Math.max(0, p.life);
      if (p.life <= 0 || p.size <= 0) vfxParticles.splice(i, 1);
    }

    // --- Shockwaves ---
    for (let i = vfxShockwaves.length - 1; i >= 0; i--) {
      const s = vfxShockwaves[i];
      s.frame++;
      const t = s.frame / s.duration;
      s.r = s.maxR * easeOutQuad(Math.min(t, 1));
      if (s.frame >= s.duration) vfxShockwaves.splice(i, 1);
    }

    // --- Flashes ---
    for (let i = vfxFlashes.length - 1; i >= 0; i--) {
      const f = vfxFlashes[i];
      f.frame++;
      const t = f.frame / f.duration;
      f.r = f.maxR * easeOutQuad(Math.min(t, 1));
      if (f.frame >= f.duration) vfxFlashes.splice(i, 1);
    }

    // --- Comets ---
    const margin = cellSize * 3;
    const bLeft   = 0 - margin;
    const bRight  = cols * cellSize + margin;
    const bTop    = 0 - margin;
    const bBottom = rows * cellSize + margin;

    for (let i = vfxComets.length - 1; i >= 0; i--) {
      const c = vfxComets[i];
      // store current position in trail
      c.trail.push({ x: c.x, y: c.y });
      if (c.trail.length > c.trailLength) c.trail.shift();
      // advance
      c.x += c.dx * c.speed;
      c.y += c.dy * c.speed;
      // out of bounds?
      if (c.x < bLeft || c.x > bRight || c.y < bTop || c.y > bBottom) {
        vfxComets.splice(i, 1);
      }
    }

    // --- Screen Shake ---
    if (shakeIntensity > 0.5) {
      shakeX = (Math.random() - 0.5) * shakeIntensity * 2;
      shakeY = (Math.random() - 0.5) * shakeIntensity * 2;
      shakeIntensity *= 0.85;
    } else {
      shakeX = 0;
      shakeY = 0;
      shakeIntensity = 0;
    }

    // --- Floating Texts ---
    for (let i = vfxTexts.length - 1; i >= 0; i--) {
      const t = vfxTexts[i];
      t.y    += t.vy;
      t.life -= t.decay;
      if (t.life <= 0) vfxTexts.splice(i, 1);
    }
  }

  // ============================================================
  //  drawVFX — Render All Active VFX onto ctx
  // ============================================================

  function drawVFX() {
    ctx.save();
    ctx.translate(shakeX, shakeY);

    // --- Flashes (drawn first — behind everything else) ---
    for (const f of vfxFlashes) {
      const t     = f.frame / f.duration;
      const alpha = 0.6 * (1 - t);
      if (alpha <= 0) continue;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle   = f.color;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // --- Shockwaves ---
    for (const s of vfxShockwaves) {
      const t         = s.frame / s.duration;
      const alpha     = 1 - t;
      const lineWidth = Math.max(1, (1 - t) * 4);
      if (alpha <= 0) continue;
      ctx.save();
      ctx.globalAlpha   = alpha;
      ctx.strokeStyle   = s.color;
      ctx.lineWidth     = lineWidth;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // --- Particles (4-point star) ---
    for (const p of vfxParticles) {
      if (p.alpha <= 0 || p.size <= 0) continue;
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = p.color;
      // 4-point star: two overlapping diamonds
      const s  = p.size;
      const sn = s * 0.38;   // narrow half-width
      ctx.beginPath();
      // vertical diamond
      ctx.moveTo(0,  -s);
      ctx.lineTo(sn,  0);
      ctx.moveTo(0,  -s);
      ctx.lineTo(-sn, 0);
      ctx.lineTo(0,   s);
      ctx.lineTo(sn,  0);
      ctx.closePath();
      ctx.fill();
      // horizontal diamond
      ctx.beginPath();
      ctx.moveTo(-s,  0);
      ctx.lineTo(0,  -sn);
      ctx.lineTo(s,   0);
      ctx.lineTo(0,   sn);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // --- Comets ---
    for (const c of vfxComets) {
      // trail
      for (let i = 0; i < c.trail.length; i++) {
        const t     = i / c.trail.length;          // 0 = oldest, 1 = newest
        const alpha = t * 0.7;
        const r     = Math.max(1, t * 4);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle   = c.color;
        ctx.beginPath();
        ctx.arc(c.trail[i].x, c.trail[i].y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      // head: colored glow
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.shadowColor = c.color;
      ctx.shadowBlur  = 14;
      ctx.fillStyle   = c.color;
      ctx.beginPath();
      ctx.arc(c.x, c.y, 5, 0, Math.PI * 2);
      ctx.fill();
      // white core
      ctx.shadowBlur  = 0;
      ctx.fillStyle   = '#ffffff';
      ctx.beginPath();
      ctx.arc(c.x, c.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // --- Floating Texts ---
    for (const t of vfxTexts) {
      if (t.life <= 0) continue;
      ctx.save();
      ctx.globalAlpha    = Math.min(1, t.life * 2);   // fade near end
      ctx.fillStyle      = t.color;
      ctx.font           = `bold ${t.size}px sans-serif`;
      ctx.textAlign      = 'center';
      ctx.textBaseline   = 'middle';
      ctx.shadowColor    = t.color;
      ctx.shadowBlur     = 8;
      ctx.fillText(t.text, t.x, t.y);
      ctx.restore();
    }

    ctx.restore();
  }

  // ============================================================
  //  hasActiveVFX — Are Any VFX Still Alive?
  // ============================================================

  function hasActiveVFX() {
    return vfxParticles.length > 0
        || vfxShockwaves.length > 0
        || vfxFlashes.length > 0
        || vfxComets.length > 0
        || vfxTexts.length > 0
        || shakeIntensity > 0.5;
  }


    const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d");

  let cellSize = 48;
  let boardPixelW, boardPixelH;

  // Offscreen canvas cache for planet pieces
  let pieceCache = {};
  let pieceCacheSize = 0;

  // Deep space background state
  let bgStars = [];
  let bgShootingStar = null;
  let bgAnimId = null;
  let bgGradCache = null;
  let bgGradSize = null;
  let board = [];
  let selected = null;
  let animating = false;
  let currentStage = 0;
  let movesLeft = 0;
  let mission = {};
  let missionProgress = {};
  let saveData = loadSave();
  let itemMode = null;
  let coinsEarned = 0;
  let cellState = [];

  const screens = {
    splash: document.getElementById("screen-splash"),
    title: document.getElementById("screen-title"),
    stageSelect: document.getElementById("screen-stage-select"),
    help: document.getElementById("screen-help"),
    game: document.getElementById("screen-game"),
    result: document.getElementById("screen-result"),
  };

  function showScreen(name) {
    if (name !== "game") { clearHint(); stopBgAnim(); }
    if (name !== "title" && name !== "splash") stopTitleBgAnim();
    if (name === "splash") stopSplashBgAnim();
    if (name !== "result") stopResultBgAnim();
    Object.values(screens).forEach((s) => s.classList.remove("active"));
    screens[name].classList.add("active");
    if (name === "game") startBgAnim();
    if (name === "title") startTitleBgAnim();
    if (name === "splash") startSplashBgAnim();
    if (name === "result") startResultBgAnim();
    if (bgmInitialized) {
      switch (name) {
        case "title": case "help": switchBgm("title"); break;
        case "stageSelect": switchBgm("select"); break;
        case "game": switchBgm("ingame"); break;
        case "result": case "splash": stopAllBgm(); break;
      }
    }
  }

  // --- Save / Load ---
  function loadSave() {
    try {
      const d = JSON.parse(localStorage.getItem("7metch_save"));
      if (!d) return { cleared: {}, bestStars: {}, coins: 0 };
      if (d.coins === undefined) {
        d.coins = 0;
        for (const stars of Object.values(d.bestStars)) {
          d.coins += stars * 3;
        }
        for (const gate of STAR_GATES) {
          if (d.cleared[gate.stage]) {
            d.coins += 5;
          }
        }
      }
      return d;
    } catch {
      return { cleared: {}, bestStars: {}, coins: 0 };
    }
  }

  function writeSave() {
    localStorage.setItem("7metch_save", JSON.stringify(saveData));
  }

  function getTotalStars() {
    return Object.values(saveData.bestStars).reduce((sum, s) => sum + s, 0);
  }

  function isStageUnlocked(i) {
    if (i === 0) return true;
    if (!saveData.cleared[i - 1]) return false;
    const gate = STAR_GATES.find((g) => g.stage === i);
    if (gate && getTotalStars() < gate.stars) return false;
    return true;
  }

  function getGateFor(i) {
    return STAR_GATES.find((g) => g.stage === i) || null;
  }

  // --- Stages ---
  function boardSizeForStage(i) {
    if (i < 10) return { cols: 6, rows: 7 };
    if (i < 100) return { cols: 7, rows: 8 };
    if (i < 250) return { cols: 8, rows: 9 };
    return { cols: 9, rows: 10 };
  }

  function generateHolePattern(c, r, variant) {
    const holes = [];
    switch (variant) {
      case 0:
        holes.push([0,0],[0,1],[1,0]);
        holes.push([0,c-1],[0,c-2],[1,c-1]);
        holes.push([r-1,0],[r-1,1],[r-2,0]);
        holes.push([r-1,c-1],[r-1,c-2],[r-2,c-1]);
        break;
      case 1:
        for (let rr = 0; rr < r; rr++) {
          for (let cc = 0; cc < c; cc++) {
            const dr = Math.abs(rr - Math.floor(r/2));
            const dc = Math.abs(cc - Math.floor(c/2));
            if (dr + dc <= 1 && !(dr === 0 && dc === 0)) holes.push([rr, cc]);
          }
        }
        break;
      case 2:
        holes.push([0,0],[0,c-1],[r-1,0],[r-1,c-1]);
        holes.push([0, Math.floor(c/2)]);
        holes.push([r-1, Math.floor(c/2)]);
        break;
      case 3:
        for (let rr = 0; rr < 3; rr++) {
          for (let cc = c-3; cc < c; cc++) {
            if (rr === 0 || cc === c-1) continue;
            holes.push([rr, cc]);
          }
        }
        break;
      case 4:
        holes.push([0,0],[0,c-1],[r-1,0],[r-1,c-1]);
        holes.push([0,Math.floor(c/2)],[r-1,Math.floor(c/2)]);
        holes.push([Math.floor(r/2),0],[Math.floor(r/2),c-1]);
        break;
    }
    return holes;
  }

  function buildStages() {
    const stages = [];
    for (let i = 0; i < 350; i++) {
      const size = boardSizeForStage(i);
      const tier = Math.floor(i / 10);
      const baseMoves = Math.max(12, 20 - tier * 2);
      let moves;
      if (i < 10) moves = 20;
      else if (size.cols >= 9) moves = Math.max(16, baseMoves);
      else if (size.cols >= 8) moves = Math.max(14, baseMoves);
      else moves = baseMoves;

      const baseColors = Math.min(7, 5 + Math.floor(i / 10));
      const colors = (i >= 200) ? 8 : baseColors;
      const star2rate = i < 10 ? 0.65 : 0.6;
      const star3rate = i < 10 ? 0.45 : 0.35;

      const features = {};
      if (i >= 10) features.diagonalLine = true;
      if (i >= 100) features.ice = true;
      if (i >= 150) features.rock = true;
      if (i >= 250) features.holes = true;
      if (i >= 300) features.countdown = true;

      let iceCells = 0, rockCells = 0, holePattern = null, countdownBombs = 0;
      if (features.ice) {
        const progress = Math.min(1, (i - 100) / 100);
        iceCells = 2 + Math.floor(progress * 4);
      }
      if (features.rock) {
        const progress = Math.min(1, (i - 150) / 100);
        rockCells = 1 + Math.floor(progress * 2);
      }
      if (features.holes) {
        holePattern = generateHolePattern(size.cols, size.rows, i % 5);
      }
      if (features.countdown) {
        const progress = Math.min(1, (i - 300) / 50);
        countdownBombs = 1 + Math.floor(progress * 2);
      }

      let mission;
      if (i % 5 === 0 && i > 0) {
        const targetColor = i % colors;
        mission = { type: "color", colorIndex: targetColor, count: Math.floor(moves * Math.min(1.0, 0.5 + i * 0.008)) };
      } else if (i % 3 === 0) {
        mission = { type: "score", target: Math.floor(moves * Math.min(100, 50 + i * 1.0)) };
      } else {
        mission = { type: "clear", count: Math.floor(moves * Math.min(8, 3.0 + i * 0.04)) };
      }

      stages.push({
        name: `${i + 1}`,
        moves,
        colors,
        boardCols: size.cols,
        boardRows: size.rows,
        mission,
        star2moves: Math.floor(moves * star2rate),
        star3moves: Math.floor(moves * star3rate),
        features,
        iceCells,
        rockCells,
        holePattern,
        countdownBombs,
      });
    }
    return stages;
  }

  function getMissionText(m, html) {
    switch (m.type) {
      case "score": return `${m.target}点 とろう`;
      case "clear": return `${m.count}個 けそう`;
      case "color":
        if (html) {
          const url = getMissionIconUrl(m.colorIndex);
          return `<img src="${url}" style="width:1.3em;height:1.3em;vertical-align:middle;margin:-2px 2px 0 0" alt="${PIECE_NAMES_JA[m.colorIndex]}">を${m.count}個けそう`;
        }
        return `${PIECE_NAMES_JA[m.colorIndex]}を${m.count}個けそう`;
    }
  }

  // --- Board ---
  function hasSquare() {
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const cells = [[r,c],[r,c+1],[r+1,c],[r+1,c+1]];
        if (cells.some(([cr,cc]) => !board[cr][cc] || isHole(cr,cc) || isRock(cr,cc))) continue;
        const color = board[r][c].color;
        if (cells.every(([cr,cc]) => board[cr][cc].color === color)) return true;
      }
    }
    return false;
  }

  function createBoard(numColors) {
    board = [];
    for (let r = 0; r < rows; r++) {
      board[r] = [];
      for (let c = 0; c < cols; c++) {
        if (isHole(r, c) || isRock(r, c)) {
          board[r][c] = null;
        } else {
          board[r][c] = randomPiece(numColors);
        }
      }
    }
    while (findAllMatches().length > 0 || hasSquare()) {
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (isHole(r, c) || isRock(r, c)) continue;
          board[r][c] = randomPiece(numColors);
        }
      }
    }
    const stg = STAGES[currentStage];
    if (stg.countdownBombs > 0) {
      let placed = 0, attempts = 0;
      while (placed < stg.countdownBombs && attempts < 200) {
        const br = Math.floor(Math.random() * rows);
        const bc = Math.floor(Math.random() * cols);
        if (board[br][bc] && !board[br][bc].special) {
          board[br][bc].special = "countdown";
          board[br][bc].countdown = 8 + Math.floor(Math.random() * 5);
          placed++;
        }
        attempts++;
      }
    }
  }

  function randomPiece(numColors) {
    return { color: Math.floor(Math.random() * numColors), special: null };
  }

  function initCellState(stg) {
    cellState = [];
    for (let r = 0; r < rows; r++) {
      cellState[r] = [];
      for (let c = 0; c < cols; c++) {
        cellState[r][c] = null;
      }
    }
    if (stg.holePattern) {
      for (const [hr, hc] of stg.holePattern) {
        if (hr >= 0 && hr < rows && hc >= 0 && hc < cols) {
          cellState[hr][hc] = "hole";
        }
      }
    }
    if (stg.rockCells > 0) {
      let placed = 0, attempts = 0;
      while (placed < stg.rockCells && attempts < 200) {
        const rr = 1 + Math.floor(Math.random() * (rows - 2));
        const rc = 1 + Math.floor(Math.random() * (cols - 2));
        if (cellState[rr][rc] === null) {
          cellState[rr][rc] = "rock";
          placed++;
        }
        attempts++;
      }
    }
    if (stg.iceCells > 0) {
      let placed = 0, attempts = 0;
      while (placed < stg.iceCells && attempts < 200) {
        const ir = Math.floor(Math.random() * rows);
        const ic = Math.floor(Math.random() * cols);
        if (cellState[ir][ic] === null) {
          cellState[ir][ic] = "ice2";
          placed++;
        }
        attempts++;
      }
    }
  }

  function isHole(r, c) { return cellState[r] && cellState[r][c] === "hole"; }
  function isRock(r, c) { return cellState[r] && cellState[r][c] === "rock"; }
  function isIce(r, c) { return cellState[r] && (cellState[r][c] === "ice1" || cellState[r][c] === "ice2"); }
  function isPlayable(r, c) { return !isHole(r, c) && !isRock(r, c); }

  function damageIce(r, c) {
    if (cellState[r][c] === "ice2") { cellState[r][c] = "ice1"; SFX.iceCrack(); return false; }
    if (cellState[r][c] === "ice1") { cellState[r][c] = null; SFX.iceCrack(); return true; }
    return true;
  }

  function damageAdjacentIce(clearList) {
    const iceSet = new Set();
    for (const [r, c] of clearList) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr, nc = c + dc;
          if (inBounds(nr, nc) && isIce(nr, nc)) iceSet.add(nr * cols + nc);
        }
      }
    }
    for (const key of iceSet) {
      damageIce(Math.floor(key / cols), key % cols);
    }
  }

  function tickCountdowns() {
    const exploded = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (board[r][c] && board[r][c].special === "countdown") {
          board[r][c].countdown--;
          if (board[r][c].countdown <= 0) exploded.push([r, c]);
        }
      }
    }
    return exploded;
  }

  async function handleCountdownExplosions(exploded) {
    if (exploded.length === 0) return;
    SFX.bomb();
    const cleared = new Set();
    for (const [r, c] of exploded) {
      const extra = activateSpecial(r, c, cleared, "countdown");
      cleared.add(r * cols + c);
      extra.forEach(([er, ec]) => cleared.add(er * cols + ec));
    }
    const clearList = [...cleared].map((v) => [Math.floor(v / cols), v % cols]);
    clearList.forEach(([r, c]) => {
      if (board[r][c]) {
        const ci = board[r][c].color;
        colorCleared[ci] = (colorCleared[ci] || 0) + 1;
        totalCleared++;
      }
    });
    score += clearList.length * 10;
    await animateClear(clearList);
    clearList.forEach(([r, c]) => { board[r][c] = null; });
    damageAdjacentIce(clearList);
    const fallMap = applyGravityData();
    await animateDrop(fallMap);
    await sleep(ANIM.CHAIN_PAUSE_MS);
  }

  function inBounds(r, c) {
    return r >= 0 && r < rows && c >= 0 && c < cols;
  }

  function isAdjacent(r1, c1, r2, c2) {
    const dr = Math.abs(r1 - r2);
    const dc = Math.abs(c1 - c2);
    return dr <= 1 && dc <= 1 && (dr + dc > 0);
  }

  // --- Match Finding ---
  const TAP_ACTIVATE_SPECIALS = new Set(["line_h", "line_v", "line_d", "bomb"]);

  function isMatchable(r, c) {
    if (!board[r][c]) return false;
    if (isHole(r, c) || isRock(r, c)) return false;
    if (board[r][c].special && TAP_ACTIVATE_SPECIALS.has(board[r][c].special)) return false;
    return true;
  }

  function findAllMatches() {
    const matched = new Set();
    const directions = [[0, 1], [1, 0]];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!isMatchable(r, c)) continue;
        const color = board[r][c].color;
        for (const [dr, dc] of directions) {
          const line = [[r, c]];
          let nr = r + dr, nc = c + dc;
          while (inBounds(nr, nc) && isMatchable(nr, nc) && board[nr][nc].color === color) {
            line.push([nr, nc]);
            nr += dr;
            nc += dc;
          }
          if (line.length >= MATCH_MIN) {
            line.forEach(([lr, lc]) => matched.add(lr * cols + lc));
          }
        }
      }
    }
    const stg = STAGES[currentStage];
    if (stg && stg.features && stg.features.diagonalLine) {
      for (let r = 0; r < rows - 1; r++) {
        for (let c = 0; c < cols - 1; c++) {
          if (!isMatchable(r, c)) continue;
          const color = board[r][c].color;
          const cells = [[r,c],[r,c+1],[r+1,c],[r+1,c+1]];
          const allMatch = cells.every(([cr, cc]) => isMatchable(cr, cc) && board[cr][cc].color === color);
          if (allMatch) cells.forEach(([cr, cc]) => matched.add(cr * cols + cc));
        }
      }
    }
    return [...matched].map((v) => [Math.floor(v / cols), v % cols]);
  }

  function findSpecialCreations(matches) {
    const specials = [];
    const matchSet = new Set(matches.map(([r, c]) => r * cols + c));
    const stg = STAGES[currentStage];

    const hLines = [];
    const vLines = [];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!board[r][c]) continue;
        if (isHole(r, c) || isRock(r, c)) continue;
        const color = board[r][c].color;

        // horizontal
        {
          const line = [[r, c]];
          let nc = c + 1;
          while (inBounds(r, nc) && board[r][nc] && !isHole(r, nc) && !isRock(r, nc) && board[r][nc].color === color) {
            line.push([r, nc]);
            nc++;
          }
          if (line.length >= MATCH_MIN && line.every(([lr, lc]) => matchSet.has(lr * cols + lc))) {
            hLines.push({ line, color });
          }
        }

        // vertical
        {
          const line = [[r, c]];
          let nr = r + 1;
          while (inBounds(nr, c) && board[nr][c] && !isHole(nr, c) && !isRock(nr, c) && board[nr][c].color === color) {
            line.push([nr, c]);
            nr++;
          }
          if (line.length >= MATCH_MIN && line.every(([lr, lc]) => matchSet.has(lr * cols + lc))) {
            vLines.push({ line, color });
          }
        }
      }
    }

    const usedCells = new Set();

    // T/L shape: intersecting horizontal + vertical of same color → bomb
    for (const h of hLines) {
      for (const v of vLines) {
        if (h.color !== v.color) continue;
        for (const [hr, hc] of h.line) {
          for (const [vr, vc] of v.line) {
            if (hr === vr && hc === vc) {
              const allCells = [...h.line, ...v.line];
              let sr = hr, sc = hc;
              if (lastSwapTarget && allCells.some(([cr, cc]) => cr === lastSwapTarget.r && cc === lastSwapTarget.c)) {
                sr = lastSwapTarget.r;
                sc = lastSwapTarget.c;
              }
              const key = sr * cols + sc;
              if (!usedCells.has(key)) {
                specials.push({ r: sr, c: sc, type: "bomb", color: h.color });
                usedCells.add(key);
                allCells.forEach(([lr, lc]) => usedCells.add(lr * cols + lc));
              }
            }
          }
        }
      }
    }

    // 5+ line → rainbow, 4 line → line clear
    const allLines = [
      ...hLines.map((h) => ({ ...h, dir: "h" })),
      ...vLines.map((v) => ({ ...v, dir: "v" })),
    ];

    for (const { line, color, dir } of allLines) {
      const mid = line[Math.floor(line.length / 2)];
      const midKey = mid[0] * cols + mid[1];
      if (usedCells.has(midKey)) continue;

      if (line.length >= 5) {
        let sr = mid[0], sc = mid[1], sk = midKey;
        if (lastSwapTarget && line.some(([lr, lc]) => lr === lastSwapTarget.r && lc === lastSwapTarget.c)) {
          sr = lastSwapTarget.r;
          sc = lastSwapTarget.c;
          sk = sr * cols + sc;
        }
        if (!usedCells.has(sk)) {
          specials.push({ r: sr, c: sc, type: "rainbow", color });
          usedCells.add(sk);
        }
      } else if (line.length === 4) {
        const type = dir === "h" ? "line_h" : "line_v";
        let sr = line[1][0], sc = line[1][1];
        if (lastSwapTarget && line.some(([lr, lc]) => lr === lastSwapTarget.r && lc === lastSwapTarget.c)) {
          sr = lastSwapTarget.r;
          sc = lastSwapTarget.c;
        }
        const posKey = sr * cols + sc;
        if (!usedCells.has(posKey)) {
          specials.push({ r: sr, c: sc, type, color });
          usedCells.add(posKey);
        }
      }
    }

    // 2×2 square → diagonal line (at swap target position if within the square)
    if (stg && stg.features && stg.features.diagonalLine) {
      for (let r = 0; r < rows - 1; r++) {
        for (let c = 0; c < cols - 1; c++) {
          if (!board[r][c]) continue;
          const sqColor = board[r][c].color;
          const cells = [[r,c],[r,c+1],[r+1,c],[r+1,c+1]];
          if (cells.every(([cr,cc]) => board[cr][cc] && board[cr][cc].color === sqColor) &&
              cells.every(([cr,cc]) => matchSet.has(cr * cols + cc)) &&
              cells.every(([cr,cc]) => !usedCells.has(cr * cols + cc))) {
            let sr = r, sc = c;
            if (lastSwapTarget && cells.some(([cr,cc]) => cr === lastSwapTarget.r && cc === lastSwapTarget.c)) {
              sr = lastSwapTarget.r;
              sc = lastSwapTarget.c;
            }
            specials.push({ r: sr, c: sc, type: "line_d", color: sqColor });
            cells.forEach(([cr,cc]) => usedCells.add(cr * cols + cc));
          }
        }
      }
    }

    return specials;
  }

  function findSpecialHint() {
    const PRIORITY = { rainbow: 3, bomb: 2, line_d: 2, line_h: 1, line_v: 1 };
    let bestList = [];
    let bestPriority = 0;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!board[r][c] || !isPlayable(r, c)) continue;
        const neighbors = [
          [r-1,c-1],[r-1,c],[r-1,c+1],
          [r,c+1],[r+1,c+1],[r+1,c],[r+1,c-1],[r,c-1]
        ];
        for (const [nr, nc] of neighbors) {
          if (!inBounds(nr, nc) || !board[nr][nc] || !isPlayable(nr, nc)) continue;
          if (nr < r || (nr === r && nc < c)) continue;

          swapPieces(r, c, nr, nc);
          const matches = findAllMatches();
          if (matches.length > 0) {
            const specials = findSpecialCreations(matches);
            for (const sp of specials) {
              const p = PRIORITY[sp.type] || 0;
              if (p > 0) {
                const colorMatches = matches.filter(([mr, mc]) =>
                  board[mr][mc] && board[mr][mc].color === sp.color);
                const colorSet = new Set(colorMatches.map(([mr, mc]) => mr * cols + mc));
                const pos1in = colorSet.has(r * cols + c);
                const mover = pos1in ? { r: nr, c: nc } : { r, c };
                const swapDest = pos1in ? { r, c } : { r: nr, c: nc };
                const pattern = colorMatches
                  .filter(([mr, mc]) => !(mr === swapDest.r && mc === swapDest.c))
                  .map(([mr, mc]) => ({ r: mr, c: mc }));
                if (p > bestPriority) {
                  bestPriority = p;
                  bestList = [{ mover, pattern }];
                } else if (p === bestPriority) {
                  bestList.push({ mover, pattern });
                }
              }
            }
          }
          swapPieces(r, c, nr, nc);
        }
      }
    }

    if (bestList.length === 0) return null;
    return bestList[Math.floor(Math.random() * bestList.length)];
  }

  function startHintTimer() {
    clearHint();
    hintTimer = setTimeout(() => {
      if (animating) return;
      const hint = findSpecialHint();
      if (hint) {
        hintData = hint;
        startHintAnim();
      }
    }, HINT_DELAY_MS);
  }

  function clearHint() {
    if (hintTimer) { clearTimeout(hintTimer); hintTimer = null; }
    if (hintAnimId) { cancelAnimationFrame(hintAnimId); hintAnimId = null; }
    if (hintData) { hintData = null; drawBoard(); }
  }

  function startHintAnim() {
    const startTime = performance.now();
    function tick() {
      if (!hintData) return;
      drawBoard(() => {
        const elapsed = performance.now() - startTime;
        const pulse = 0.5 + 0.5 * Math.sin(elapsed / 300);
        ctx.save();
        for (const cell of hintData.pattern) {
          const cx = cell.c * cellSize + cellSize / 2;
          const cy = cell.r * cellSize + cellSize / 2;
          const radius = cellSize * 0.45;
          ctx.globalAlpha = 0.15 + 0.2 * pulse;
          ctx.fillStyle = "#fff";
          ctx.beginPath();
          ctx.arc(cx, cy, radius * (0.9 + 0.1 * pulse), 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#ffe66d";
          ctx.lineWidth = 1.5;
          ctx.globalAlpha = 0.3 + 0.3 * pulse;
          ctx.stroke();
        }
        const m = hintData.mover;
        const mcx = m.c * cellSize + cellSize / 2;
        const mcy = m.r * cellSize + cellSize / 2;
        const mr = cellSize * 0.45;
        ctx.globalAlpha = 0.3 + 0.4 * pulse;
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(mcx, mcy, mr * (0.9 + 0.15 * pulse), 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#ffe66d";
        ctx.lineWidth = 2.5;
        ctx.globalAlpha = 0.6 + 0.4 * pulse;
        ctx.stroke();
        ctx.restore();
      });
      hintAnimId = requestAnimationFrame(tick);
    }
    tick();
  }

  async function activateByTap(r, c) {
    if (animating) return;
    const piece = board[r][c];
    if (!piece || !piece.special || !TAP_ACTIVATE_SPECIALS.has(piece.special)) return;
    animating = true;
    clearHint();

    if (piece.special === "bomb") SFX.bomb();
    else if (piece.special === "line_d") { SFX.line(); SFX.diagonal(); }
    else if (piece.special === "line_h" || piece.special === "line_v") SFX.line();
    track("tap_activate", { type: piece.special, stage: STAGES[currentStage].name });
    movesLeft--;
    chainCount = 1;
    updateHUD();

    const cleared = new Set([r * cols + c]);
    const clearList = [[r, c]];
    const extra = activateSpecial(r, c, cleared, null);
    extra.forEach(([er, ec]) => {
      if (!cleared.has(er * cols + ec)) {
        cleared.add(er * cols + ec);
        clearList.push([er, ec]);
      }
    });

    clearList.forEach(([cr, cc]) => {
      if (board[cr][cc] && board[cr][cc].special && !(cr === r && cc === c)) {
        const ex2 = activateSpecial(cr, cc, cleared, board[cr][cc].special);
        ex2.forEach(([er, ec]) => {
          if (!cleared.has(er * cols + ec)) {
            cleared.add(er * cols + ec);
            clearList.push([er, ec]);
          }
        });
      }
    });

    clearList.forEach(([cr, cc]) => {
      if (board[cr][cc]) {
        const ci = board[cr][cc].color;
        colorCleared[ci] = (colorCleared[ci] || 0) + 1;
        totalCleared++;
      }
    });
    score += clearList.length * 10 * chainCount;

    await animateClear(clearList, [{ r, c, type: piece.special, color: piece.color }]);
    clearList.forEach(([cr, cc]) => { board[cr][cc] = null; });
    damageAdjacentIce(clearList);

    const fallMap = applyGravityData();
    await animateDrop(fallMap);
    await sleep(ANIM.CHAIN_PAUSE_MS);

    await resolveBoard();

    updateHUD();
    checkWinLose();
    animating = false;
    startHintTimer();
  }

  // --- Special Piece Activation ---
  function activateSpecial(r, c, alreadyCleared, triggeredBy) {
    const piece = board[r][c];
    if (!piece || !piece.special) return [];
    let sp = piece.special;
    if (triggeredBy === "line_h" && sp === "line_h") sp = "line_v";
    else if (triggeredBy === "line_v" && sp === "line_v") sp = "line_h";
    const extra = [];
    const key = (r2, c2) => r2 * cols + c2;

    if (sp === "line_h") {
      for (let cc = 0; cc < cols; cc++) {
        if (!alreadyCleared.has(key(r, cc)) && board[r][cc] && isPlayable(r, cc)) {
          extra.push([r, cc]);
        }
      }
    } else if (sp === "line_v") {
      for (let rr = 0; rr < rows; rr++) {
        if (!alreadyCleared.has(key(rr, c)) && board[rr][c] && isPlayable(rr, c)) {
          extra.push([rr, c]);
        }
      }
    } else if (sp === "line_d") {
      for (let d = -Math.max(rows, cols); d <= Math.max(rows, cols); d++) {
        const r1 = r + d, c1 = c + d;
        if (inBounds(r1, c1) && !alreadyCleared.has(key(r1, c1)) && board[r1][c1] && isPlayable(r1, c1)) extra.push([r1, c1]);
        const r2 = r + d, c2 = c - d;
        if (inBounds(r2, c2) && !alreadyCleared.has(key(r2, c2)) && board[r2][c2] && isPlayable(r2, c2)) extra.push([r2, c2]);
      }
    } else if (sp === "bomb") {
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const nr = r + dr;
          const nc = c + dc;
          if (inBounds(nr, nc) && !alreadyCleared.has(key(nr, nc)) && board[nr][nc] && isPlayable(nr, nc)) {
            extra.push([nr, nc]);
          }
        }
      }
    } else if (sp === "rainbow") {
      const targetColor = piece.color;
      for (let rr = 0; rr < rows; rr++) {
        for (let cc = 0; cc < cols; cc++) {
          if (board[rr][cc] && board[rr][cc].color === targetColor && !alreadyCleared.has(key(rr, cc)) && isPlayable(rr, cc)) {
            extra.push([rr, cc]);
          }
        }
      }
    } else if (sp === "countdown") {
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const nr = r + dr, nc = c + dc;
          if (inBounds(nr, nc) && !alreadyCleared.has(key(nr, nc)) && board[nr][nc] && isPlayable(nr, nc)) extra.push([nr, nc]);
        }
      }
    }
    return extra;
  }

  // --- Gravity & Fill (data only, no animation) ---
  function applyGravityData() {
    const numColors = STAGES[currentStage].colors;
    const fallMap = [];
    for (let c = 0; c < cols; c++) {
      let writeRow = rows - 1;
      while (writeRow >= 0 && (isHole(writeRow, c) || isRock(writeRow, c))) writeRow--;
      for (let r = writeRow; r >= 0; r--) {
        if (isHole(r, c) || isRock(r, c)) continue;
        if (board[r][c]) {
          if (r !== writeRow) {
            board[writeRow][c] = board[r][c];
            board[r][c] = null;
            fallMap.push({ c, fromR: r, toR: writeRow, piece: board[writeRow][c] });
          }
          writeRow--;
          while (writeRow >= 0 && (isHole(writeRow, c) || isRock(writeRow, c))) writeRow--;
        }
      }
      let newPieceOffset = 0;
      for (let r = writeRow; r >= 0; r--) {
        if (isHole(r, c) || isRock(r, c)) continue;
        board[r][c] = randomPiece(numColors);
        newPieceOffset++;
        fallMap.push({ c, fromR: -newPieceOffset, toR: r, piece: board[r][c], isNew: true });
      }
    }
    return fallMap;
  }

  // --- Swap ---
  function swapPieces(r1, c1, r2, c2) {
    const tmp = board[r1][c1];
    board[r1][c1] = board[r2][c2];
    board[r2][c2] = tmp;
  }

  // --- Game Loop ---
  let score = 0;
  let totalCleared = 0;
  let colorCleared = [];
  let chainCount = 0;
  let lastSwapTarget = null;
  let debugSpawnType = null;
  let hintTimer = null;
  let hintData = null;
  let hintAnimId = null;
  const HINT_DELAY_MS = 3000;

  function getComboType(s1, s2) {
    const normalize = (s) => s === "countdown" ? "bomb" : s;
    const pair = [normalize(s1), normalize(s2)].sort().join("+");
    const combos = {
      "line_h+line_h": "cross",
      "line_h+line_v": "cross",
      "line_v+line_v": "cross",
      "line_d+line_h": "star_cross",
      "line_d+line_v": "star_cross",
      "line_d+line_d": "star_cross",
      "bomb+line_h": "triple_line",
      "bomb+line_v": "triple_line",
      "bomb+line_d": "triple_line",
      "bomb+bomb": "big_bomb",
      "line_h+rainbow": "rainbow_line",
      "line_v+rainbow": "rainbow_line",
      "line_d+rainbow": "rainbow_line",
      "bomb+rainbow": "rainbow_bomb",
      "rainbow+rainbow": "board_clear",
    };
    return combos[pair] || null;
  }

  function activateCombo(comboType, r, c, p1, p2) {
    const extra = [];
    const key = (r2, c2) => r2 * cols + c2;
    const cleared = new Set();

    switch (comboType) {
      case "cross":
        for (let cc = 0; cc < cols; cc++) {
          if (board[r][cc] && isPlayable(r, cc)) extra.push([r, cc]);
        }
        for (let rr = 0; rr < rows; rr++) {
          if (board[rr][c] && isPlayable(rr, c)) extra.push([rr, c]);
        }
        break;
      case "star_cross":
        for (let cc = 0; cc < cols; cc++) if (board[r][cc] && isPlayable(r, cc)) extra.push([r, cc]);
        for (let rr = 0; rr < rows; rr++) if (board[rr][c] && isPlayable(rr, c)) extra.push([rr, c]);
        for (let d = -Math.max(rows, cols); d <= Math.max(rows, cols); d++) {
          const r1 = r + d, c1 = c + d;
          if (inBounds(r1, c1) && board[r1][c1] && isPlayable(r1, c1)) extra.push([r1, c1]);
          const r2 = r + d, c2 = c - d;
          if (inBounds(r2, c2) && board[r2][c2] && isPlayable(r2, c2)) extra.push([r2, c2]);
        }
        break;
      case "triple_line": {
        for (let d = -1; d <= 1; d++) {
          for (let cc = 0; cc < cols; cc++) {
            if (inBounds(r + d, cc) && board[r + d][cc] && isPlayable(r + d, cc)) extra.push([r + d, cc]);
          }
          for (let rr = 0; rr < rows; rr++) {
            if (inBounds(rr, c + d) && board[rr][c + d] && isPlayable(rr, c + d)) extra.push([rr, c + d]);
          }
        }
        break;
      }
      case "big_bomb":
        for (let dr = -3; dr <= 3; dr++) {
          for (let dc = -3; dc <= 3; dc++) {
            if (inBounds(r + dr, c + dc) && board[r + dr][c + dc] && isPlayable(r + dr, c + dc)) {
              extra.push([r + dr, c + dc]);
            }
          }
        }
        break;
      case "rainbow_line":
      case "rainbow_bomb": {
        const rainbow = p1.special === "rainbow" ? p1 : p2;
        const other = p1.special === "rainbow" ? p2 : p1;
        const targetColor = other.color;
        const spType = comboType === "rainbow_line" ? "line_h" : "bomb";
        for (let rr = 0; rr < rows; rr++) {
          for (let cc = 0; cc < cols; cc++) {
            if (board[rr][cc] && board[rr][cc].color === targetColor && isPlayable(rr, cc)) {
              board[rr][cc].special = spType;
              extra.push([rr, cc]);
            }
          }
        }
        break;
      }
      case "board_clear":
        for (let rr = 0; rr < rows; rr++) {
          for (let cc = 0; cc < cols; cc++) {
            if (board[rr][cc] && isPlayable(rr, cc)) extra.push([rr, cc]);
          }
        }
        break;
    }

    const unique = new Map();
    extra.forEach(([er, ec]) => unique.set(er * cols + ec, [er, ec]));
    return [...unique.values()];
  }

  async function doMove(r1, c1, r2, c2) {
    if (animating) return;
    animating = true;
    clearHint();

    const p1 = board[r1][c1];
    const p2 = board[r2][c2];

    lastSwapTarget = { r: r2, c: c2 };

    SFX.swap();
    await animateSwap(r1, c1, r2, c2);
    swapPieces(r1, c1, r2, c2);

    // Special swap combo
    if (p1 && p2 && p1.special && p2.special) {
      const comboType = getComboType(p1.special, p2.special);
      if (comboType) {
        SFX.combo(comboType);
        track("special_combo", { combo_type: comboType, stage: STAGES[currentStage].name });
        movesLeft--;
        chainCount = 1;
        updateHUD();

        const comboCells = activateCombo(comboType, r2, c2, p1, p2);
        comboCells.push([r1, c1], [r2, c2]);

        // Activate specials on combo-cleared cells (chain reaction)
        const cleared = new Set(comboCells.map(([r, c]) => r * cols + c));
        comboCells.forEach(([cr, cc]) => {
          if (board[cr][cc] && board[cr][cc].special && !(cr === r1 && cc === c1) && !(cr === r2 && cc === c2)) {
            const extra = activateSpecial(cr, cc, cleared, board[cr][cc].special);
            extra.forEach(([er, ec]) => {
              if (!cleared.has(er * cols + ec)) {
                cleared.add(er * cols + ec);
                comboCells.push([er, ec]);
              }
            });
          }
        });

        const clearList = [...cleared].map((v) => [Math.floor(v / cols), v % cols]);
        clearList.forEach(([r, c]) => {
          if (board[r][c]) {
            const ci = board[r][c].color;
            colorCleared[ci] = (colorCleared[ci] || 0) + 1;
            totalCleared++;
          }
        });
        score += clearList.length * 10 * chainCount;

        const comboInfo = [];
        if (comboType === "board_clear") comboInfo.push({ r: r2, c: c2, type: "galaxy", color: (p2 || p1).color });
        else if (comboType === "big_bomb") comboInfo.push({ r: r2, c: c2, type: "big_bomb", color: (p2 || p1).color });
        else if (comboType === "cross" || comboType === "star_cross") comboInfo.push({ r: r2, c: c2, type: comboType, color: (p2 || p1).color });
        else if (comboType === "triple_line") comboInfo.push({ r: r2, c: c2, type: "line_h", color: (p2 || p1).color });
        else if (comboType === "rainbow_line") comboInfo.push({ r: r2, c: c2, type: "rainbow", color: (p2 || p1).color });
        else if (comboType === "rainbow_bomb") comboInfo.push({ r: r2, c: c2, type: "bomb", color: (p2 || p1).color });
        await animateClear(clearList, comboInfo);
        clearList.forEach(([r, c]) => { board[r][c] = null; });
        damageAdjacentIce(clearList);

        const fallMap = applyGravityData();
        await animateDrop(fallMap);
        await sleep(ANIM.CHAIN_PAUSE_MS);

        await resolveBoard();

        updateHUD();
        checkWinLose();
        animating = false;
        startHintTimer();
        return;
      }
    }

    // Rainbow + normal piece swap
    const rb1 = p1 && p1.special === "rainbow";
    const rb2 = p2 && p2.special === "rainbow";
    if ((rb1 || rb2) && !(rb1 && rb2)) {
      const rainbow = rb1 ? p1 : p2;
      const other = rb1 ? p2 : p1;
      const rainbowR = rb1 ? r2 : r1;
      const rainbowC = rb1 ? c2 : c1;
      const otherR = rb1 ? r1 : r2;
      const otherC = rb1 ? c1 : c2;
      if (!other.special) {
        const targetColor = other.color;
        SFX.combo("rainbow_line");
        track("rainbow_swap", { target_color: targetColor, stage: STAGES[currentStage].name });
        movesLeft--;
        chainCount = 1;
        updateHUD();

        const clearList = [[rainbowR, rainbowC]];
        const cleared = new Set([rainbowR * cols + rainbowC]);
        for (let rr = 0; rr < rows; rr++) {
          for (let cc = 0; cc < cols; cc++) {
            if (board[rr][cc] && board[rr][cc].color === targetColor && !cleared.has(rr * cols + cc) && isPlayable(rr, cc)) {
              cleared.add(rr * cols + cc);
              clearList.push([rr, cc]);
            }
          }
        }
        clearList.forEach(([cr, cc]) => {
          if (board[cr][cc] && board[cr][cc].special && !(cr === rainbowR && cc === rainbowC)) {
            const extra = activateSpecial(cr, cc, cleared, board[cr][cc].special);
            extra.forEach(([er, ec]) => {
              if (!cleared.has(er * cols + ec)) {
                cleared.add(er * cols + ec);
                clearList.push([er, ec]);
              }
            });
          }
        });

        clearList.forEach(([cr, cc]) => {
          if (board[cr][cc]) {
            const ci = board[cr][cc].color;
            colorCleared[ci] = (colorCleared[ci] || 0) + 1;
            totalCleared++;
          }
        });
        score += clearList.length * 10 * chainCount;

        await animateClear(clearList, [{ r: rainbowR, c: rainbowC, type: "rainbow", color: targetColor }]);
        clearList.forEach(([cr, cc]) => { board[cr][cc] = null; });
        damageAdjacentIce(clearList);

        const fallMap = applyGravityData();
        await animateDrop(fallMap);
        await sleep(ANIM.CHAIN_PAUSE_MS);

        await resolveBoard();

        updateHUD();
        checkWinLose();
        animating = false;
        startHintTimer();
        return;
      }
    }

    const matches = findAllMatches();
    if (matches.length === 0) {
      SFX.invalidSwap();
      await animateSwap(r2, c2, r1, c1);
      swapPieces(r1, c1, r2, c2);
      animating = false;
      drawBoard();
      startHintTimer();
      return;
    }

    movesLeft--;
    chainCount = 0;
    updateHUD();

    await resolveBoard();
    lastSwapTarget = null;

    updateHUD();
    checkWinLose();
    animating = false;
    startHintTimer();
  }

  async function resolveBoard() {
    let matches = findAllMatches();
    while (matches.length > 0) {
      chainCount++;
      const specials = findSpecialCreations(matches);
      lastSwapTarget = null;

      const cleared = new Set();
      matches.forEach(([r, c]) => cleared.add(r * cols + c));

      let hasSpecialActivation = false;
      const specialInfos = [];
      matches.forEach(([r, c]) => {
        if (board[r][c] && board[r][c].special) {
          hasSpecialActivation = true;
          const sp = board[r][c].special;
          if (sp === "bomb" || sp === "countdown") SFX.bomb();
          else if (sp === "line_h" || sp === "line_v") SFX.line();
          else if (sp === "line_d") { SFX.line(); SFX.diagonal(); }
          else if (sp === "rainbow") SFX.rainbow();
          specialInfos.push({ r, c, type: sp, color: board[r][c].color });
          const extra = activateSpecial(r, c, cleared);
          extra.forEach(([er, ec]) => {
            cleared.add(er * cols + ec);
            if (board[er][ec] && board[er][ec].special) {
              const extra2 = activateSpecial(er, ec, cleared, sp);
              extra2.forEach(([er2, ec2]) => cleared.add(er2 * cols + ec2));
            }
          });
        }
      });

      const clearList = [...cleared].map((v) => [Math.floor(v / cols), v % cols]);

      clearList.forEach(([r, c]) => {
        if (board[r][c]) {
          const ci = board[r][c].color;
          colorCleared[ci] = (colorCleared[ci] || 0) + 1;
          totalCleared++;
        }
      });

      const points = clearList.length * 10 * chainCount;
      score += points;

      if (!hasSpecialActivation) SFX.clear(chainCount);

      if (chainCount > 1) {
        await showChainLabel(chainCount);
      }

      await animateClear(clearList, specialInfos);

      clearList.forEach(([r, c]) => {
        board[r][c] = null;
      });

      damageAdjacentIce(clearList);

      specials.forEach((sp) => {
        if (board[sp.r] && board[sp.r][sp.c] === null) {
          board[sp.r][sp.c] = { color: sp.color, special: sp.type };
        } else if (board[sp.r] && board[sp.r][sp.c]) {
          board[sp.r][sp.c].special = sp.type;
        }
      });

      const fallMap = applyGravityData();
      if (fallMap.length > 0) SFX.drop();
      await animateDrop(fallMap);

      updateHUD();

      await sleep(ANIM.CHAIN_PAUSE_MS);

      matches = findAllMatches();
    }
    const exploded = tickCountdowns();
    await handleCountdownExplosions(exploded);
  }

  // --- Items ---
  const ITEM_COSTS = { pinpoint: 3, shuffle: 5, addmoves: 8, colorbomb: 12 };

  function updateItemBar() {
    const coins = saveData.coins || 0;
    const el = document.getElementById("item-coin-count");
    if (debugMode) {
      if (el) el.textContent = "∞";
      document.querySelectorAll(".item-btn").forEach(btn => { btn.disabled = false; });
      return;
    }
    if (el) el.textContent = coins;
    document.querySelectorAll(".item-btn").forEach(btn => {
      const cost = ITEM_COSTS[btn.dataset.item];
      btn.disabled = coins < cost;
    });
  }

  function cancelItemMode() {
    itemMode = null;
    canvas.classList.remove("item-targeting");
  }

  async function usePinpoint(r, c) {
    if (!board[r][c] || (!debugMode && (saveData.coins || 0) < ITEM_COSTS.pinpoint)) {
      cancelItemMode();
      return;
    }
    animating = true;
    if (!debugMode) { saveData.coins -= ITEM_COSTS.pinpoint; writeSave(); }
    updateItemBar();

    const cleared = new Set();
    cleared.add(r * cols + c);
    if (board[r][c].special) {
      const sp = board[r][c].special;
      if (sp === "bomb" || sp === "countdown") SFX.bomb();
      else if (sp === "line_h" || sp === "line_v" || sp === "line_d") SFX.line();
      else if (sp === "rainbow") SFX.rainbow();
      const extra = activateSpecial(r, c, cleared);
      extra.forEach(([er, ec]) => {
        cleared.add(er * cols + ec);
        if (board[er][ec] && board[er][ec].special) {
          const extra2 = activateSpecial(er, ec, cleared, sp);
          extra2.forEach(([er2, ec2]) => cleared.add(er2 * cols + ec2));
        }
      });
    }

    const clearList = [...cleared].map(v => [Math.floor(v / cols), v % cols]);
    clearList.forEach(([cr, cc]) => {
      if (board[cr][cc]) {
        const ci = board[cr][cc].color;
        colorCleared[ci] = (colorCleared[ci] || 0) + 1;
        totalCleared++;
      }
    });
    score += clearList.length * 10;

    if (!board[r][c].special) SFX.bomb();
    await animateClear(clearList);
    clearList.forEach(([cr, cc]) => { board[cr][cc] = null; });
    damageAdjacentIce(clearList);

    const fallMap = applyGravityData();
    if (fallMap.length > 0) SFX.drop();
    await animateDrop(fallMap);
    await sleep(ANIM.CHAIN_PAUSE_MS);
    await resolveBoard();

    updateHUD();
    checkWinLose();
    animating = false;
    startHintTimer();
  }

  async function useShuffle() {
    animating = true;
    if (!debugMode) { saveData.coins -= ITEM_COSTS.shuffle; writeSave(); }
    updateItemBar();

    const pieces = [];
    const positions = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (board[r][c]) {
          pieces.push(board[r][c]);
          positions.push([r, c]);
        }
      }
    }

    for (let i = pieces.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
    }

    positions.forEach(([r, c], idx) => { board[r][c] = pieces[idx]; });

    SFX.swap();
    drawBoard();
    await sleep(300);
    await resolveBoard();

    updateHUD();
    checkWinLose();
    animating = false;
    startHintTimer();
  }

  function useAddMoves() {
    if (!debugMode) { saveData.coins -= ITEM_COSTS.addmoves; writeSave(); }
    movesLeft += 3;
    updateHUD();
    updateItemBar();
    SFX.stageClear();
    startHintTimer();
  }

  async function useColorBomb(colorIndex) {
    animating = true;
    if (!debugMode) { saveData.coins -= ITEM_COSTS.colorbomb; writeSave(); }
    updateItemBar();

    const cleared = new Set();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (board[r][c] && board[r][c].color === colorIndex) {
          cleared.add(r * cols + c);
        }
      }
    }

    if (cleared.size === 0) {
      animating = false;
      return;
    }

    const clearList = [...cleared].map(v => [Math.floor(v / cols), v % cols]);
    clearList.forEach(([cr, cc]) => {
      if (board[cr][cc]) {
        const ci = board[cr][cc].color;
        colorCleared[ci] = (colorCleared[ci] || 0) + 1;
        totalCleared++;
      }
    });
    score += clearList.length * 10;

    SFX.rainbow();
    await animateClear(clearList);
    clearList.forEach(([cr, cc]) => { board[cr][cc] = null; });

    const fallMap = applyGravityData();
    if (fallMap.length > 0) SFX.drop();
    await animateDrop(fallMap);
    await sleep(ANIM.CHAIN_PAUSE_MS);
    await resolveBoard();

    updateHUD();
    checkWinLose();
    animating = false;
    startHintTimer();
  }

  function showColorPicker() {
    const grid = document.getElementById("color-picker-grid");
    grid.innerHTML = "";
    const numColors = STAGES[currentStage].colors;
    for (let i = 0; i < numColors; i++) {
      const btn = document.createElement("button");
      btn.className = "color-pick-btn";
      btn.style.background = PIECE_COLORS[i];
      btn.title = PIECE_NAMES_JA[i];
      btn.addEventListener("click", () => {
        document.getElementById("color-picker-modal").classList.add("hidden");
        useColorBomb(i);
      });
      grid.appendChild(btn);
    }
    document.getElementById("color-picker-modal").classList.remove("hidden");
  }

  function spawnSpecialAt(r, c, type) {
    if (!board[r][c] || !isPlayable(r, c)) return;
    if (type === "diagonal") type = "line_d";
    if (type === "countdown") {
      board[r][c].special = "countdown";
      board[r][c].countdown = 5;
    } else {
      board[r][c].special = type;
    }
    drawBoard();
  }

  // --- Animations ---
  async function animateSwap(r1, c1, r2, c2) {
    const frames = ANIM.SWAP_FRAMES;
    const p1 = board[r1][c1];
    const p2 = board[r2][c2];

    for (let f = 1; f <= frames; f++) {
      const t = f / frames;
      const ease = t * t * (3 - 2 * t);

      drawBoardBase();

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if ((r === r1 && c === c1) || (r === r2 && c === c2)) continue;
          if (board[r][c]) {
            drawPieceAt(board[r][c], c * cellSize + cellSize / 2, r * cellSize + cellSize / 2);
          }
          if (isIce(r, c)) drawIceOverlay(r, c);
        }
      }

      if (p1) {
        const x = (c1 + (c2 - c1) * ease) * cellSize + cellSize / 2;
        const y = (r1 + (r2 - r1) * ease) * cellSize + cellSize / 2;
        drawPieceAt(p1, x, y);
      }
      if (p2) {
        const x = (c2 + (c1 - c2) * ease) * cellSize + cellSize / 2;
        const y = (r2 + (r1 - r2) * ease) * cellSize + cellSize / 2;
        drawPieceAt(p2, x, y);
      }

      ctx.restore();
      await sleep(ANIM.SWAP_FRAME_MS);
    }
  }

  async function animateClear(cells, specialInfos) {
    cells = cells.map(cell => Array.isArray(cell) ? { r: cell[0], c: cell[1] } : cell);
    specialInfos = specialInfos || [];

    if (specialInfos.length > 0) {
      const types = specialInfos.map(s => s.type);
      if (types.includes("galaxy")) { await animateGalaxyCollision(cells, specialInfos); return; }
      if (types.includes("big_bomb")) { await animateBigBomb(cells, specialInfos); return; }
      if (types.includes("cross") || types.includes("star_cross")) { await animateCrossCombo(cells, specialInfos); return; }
      for (const info of specialInfos) {
        switch (info.type) {
          case "line_h": case "line_v": case "line_d":
            await animateLineSpecial(cells, info); break;
          case "bomb":
            await animateBombSpecial(cells, info); break;
          case "rainbow":
            await animateRainbow(cells, info); break;
        }
      }
      return;
    }

    await animateStandardClear(cells);
  }

  async function animateStandardClear(cells) {
    const totalFrames = 22;
    const phase1End = Math.floor(totalFrames * 0.3);
    let frame = 0;

    await new Promise(resolve => {
      function step() {
        frame++;
        updateVFX();

        drawBoard((overlayCtx) => {
          if (frame <= phase1End) {
            const gp = frame / phase1End;
            for (const { r, c } of cells) {
              const pos = cellCenter(r, c);
              overlayCtx.save();
              overlayCtx.globalAlpha = gp * 0.5;
              overlayCtx.shadowColor = "#ffffff";
              overlayCtx.shadowBlur = 10 + gp * 15;
              overlayCtx.fillStyle = "rgba(255,255,255,0.3)";
              overlayCtx.beginPath();
              overlayCtx.arc(pos.x, pos.y, cellSize * 0.4 * (1 + gp * 0.3), 0, Math.PI * 2);
              overlayCtx.fill();
              overlayCtx.restore();
            }
          }
          if (frame > phase1End) {
            const sp = (frame - phase1End) / (totalFrames - phase1End);
            const shrink = 1 - sp * sp;
            for (const { r, c } of cells) {
              const pos = cellCenter(r, c);
              overlayCtx.save();
              overlayCtx.globalAlpha = (1 - sp) * 0.35;
              overlayCtx.fillStyle = "#ffffff";
              overlayCtx.beginPath();
              overlayCtx.arc(pos.x, pos.y, cellSize * 0.35 * shrink, 0, Math.PI * 2);
              overlayCtx.fill();
              overlayCtx.restore();
            }
            if (frame === phase1End + 1) {
              for (const { r, c } of cells) {
                const pos = cellCenter(r, c);
                const color = (board[r] && board[r][c]) ? (PIECE_COLORS[board[r][c].color] || "#ffffff") : "#ffffff";
                addBurstParticles(pos.x, pos.y, color, 8, { speed: 2.5, size: 3.5, decay: 0.04, sizeDecay: 0.06 });
                addShockwave(pos.x, pos.y, cellSize * 0.6, 10, "#ffffff");
              }
            }
          }
        });
        drawVFX();

        if (frame < totalFrames) requestAnimationFrame(step);
        else resolve();
      }
      requestAnimationFrame(step);
    });
  }

  async function animateLineSpecial(cells, info) {
    const origin = cellCenter(info.r, info.c);
    const color = PIECE_COLORS[info.color] || "#ffffff";
    const dissolved = new Set();

    await animateFrames(8, (frame, t) => {
      drawBoard((oc) => {
        oc.save();
        oc.shadowColor = color;
        oc.shadowBlur = 10 + t * 20;
        oc.fillStyle = color;
        oc.globalAlpha = 0.3 + t * 0.4;
        oc.beginPath();
        oc.arc(origin.x, origin.y, cellSize * 0.4, 0, Math.PI * 2);
        oc.fill();
        oc.restore();
      });
      drawVFX();
    });

    addShockwave(origin.x, origin.y, cellSize * 1.5, 15, color);
    addScreenShake(2);

    const cometDirs = [];
    if (info.type === "line_h") {
      cometDirs.push({ dx: 1, dy: 0 }, { dx: -1, dy: 0 });
    } else if (info.type === "line_v") {
      cometDirs.push({ dx: 0, dy: 1 }, { dx: 0, dy: -1 });
    } else if (info.type === "line_d") {
      const inv = Math.SQRT1_2;
      cometDirs.push({ dx: inv, dy: inv }, { dx: -inv, dy: -inv }, { dx: inv, dy: -inv }, { dx: -inv, dy: inv });
    }
    for (const d of cometDirs) {
      addComet(origin.x, origin.y, d.dx, d.dy, color, cellSize * 0.35, 14);
    }

    await animateFrames(25, (frame, t) => {
      for (const { r, c } of cells) {
        const key = r + "," + c;
        if (dissolved.has(key)) continue;
        const cc = cellCenter(r, c);
        for (const comet of vfxComets) {
          if (Math.hypot(comet.x - cc.x, comet.y - cc.y) < cellSize * 0.7) {
            dissolved.add(key);
            addBurstParticles(cc.x, cc.y, color, 6, { speed: 2, size: 3, decay: 0.05, sizeDecay: 0.06 });
            break;
          }
        }
      }
      drawBoard(() => {});
      drawVFX();
    });

    for (const { r, c } of cells) {
      if (!dissolved.has(r + "," + c)) {
        const cc = cellCenter(r, c);
        addBurstParticles(cc.x, cc.y, color, 5, { speed: 1.5, size: 2.5, decay: 0.05, sizeDecay: 0.05 });
      }
    }
  }

  async function animateBombSpecial(cells, info) {
    const origin = cellCenter(info.r, info.c);
    const color = PIECE_COLORS[info.color] || "#ff8800";

    await animateFrames(6, (frame, t) => {
      drawBoard((oc) => {
        oc.save();
        oc.shadowColor = color;
        oc.shadowBlur = 8 + t * 22;
        oc.fillStyle = color;
        oc.globalAlpha = 0.4 + t * 0.4;
        oc.beginPath();
        oc.arc(origin.x, origin.y, cellSize * 0.4, 0, Math.PI * 2);
        oc.fill();
        oc.restore();
      });
      drawVFX();
    });

    await animateFrames(4, (frame, t) => {
      const scale = 1 - t * 0.8;
      drawBoard((oc) => {
        oc.save();
        oc.globalAlpha = 0.6;
        oc.fillStyle = "#ffffff";
        oc.beginPath();
        oc.arc(origin.x, origin.y, cellSize * 0.35 * scale, 0, Math.PI * 2);
        oc.fill();
        oc.restore();
      });
      drawVFX();
    });

    addScreenShake(6);
    addShockwave(origin.x, origin.y, cellSize * 5, 25, "#ffffff");
    addFlash(origin.x, origin.y, cellSize * 3, "#ffffff", 15);
    addBurstParticles(origin.x, origin.y, "#ffffff", 20, { speed: 5, size: 5, decay: 0.03, sizeDecay: 0.08 });
    addBurstParticles(origin.x, origin.y, color, 20, { speed: 3.5, size: 4, decay: 0.025, sizeDecay: 0.06 });

    const cellDistances = cells.map(({ r, c }) => ({
      r, c, dist: Math.abs(r - info.r) + Math.abs(c - info.c)
    }));

    await animateFrames(20, (frame, t) => {
      for (const { r, c, dist } of cellDistances) {
        if (frame === dist * 2 + 1) {
          const cc = cellCenter(r, c);
          const pColor = (board[r] && board[r][c]) ? (PIECE_COLORS[board[r][c].color] || color) : color;
          addBurstParticles(cc.x, cc.y, pColor, 6, { speed: 2, size: 3, decay: 0.04, sizeDecay: 0.05 });
        }
      }
      drawBoard(() => {});
      drawVFX();
    });
  }

  async function animateRainbow(cells, info) {
    const origin = cellCenter(info.r, info.c);
    const color = PIECE_COLORS[info.color] || "#aa44ff";

    await animateFrames(10, (frame, t) => {
      drawBoard((oc) => {
        oc.save();
        oc.translate(origin.x, origin.y);
        oc.globalAlpha = 0.3 + t * 0.3;
        const grad = oc.createRadialGradient(0, 0, 0, 0, 0, cellSize);
        grad.addColorStop(0, "rgba(20, 0, 40, 0.8)");
        grad.addColorStop(1, "rgba(20, 0, 40, 0)");
        oc.fillStyle = grad;
        oc.beginPath();
        oc.arc(0, 0, cellSize * (0.5 + t * 0.8), 0, Math.PI * 2);
        oc.fill();
        const arcCount = 3;
        const baseAngle = frame * 0.3;
        oc.strokeStyle = color;
        oc.lineWidth = 2;
        oc.globalAlpha = 0.5 + t * 0.3;
        for (let i = 0; i < arcCount; i++) {
          const a = baseAngle + (Math.PI * 2 * i / arcCount);
          oc.beginPath();
          oc.arc(0, 0, cellSize * (0.3 + t * 0.4), a, a + Math.PI * 0.5);
          oc.stroke();
        }
        oc.restore();
      });
      drawVFX();
    });

    const cellSnaps = cells.map(({ r, c }) => {
      const cc = cellCenter(r, c);
      return { r, c, startX: cc.x, startY: cc.y };
    });

    await animateFrames(30, (frame, t) => {
      const pullT = t * t;
      drawBoard((oc) => {
        for (const snap of cellSnaps) {
          const cx = snap.startX + (origin.x - snap.startX) * pullT;
          const cy = snap.startY + (origin.y - snap.startY) * pullT;
          const scale = 1 - pullT * 0.8;
          const alpha = 1 - pullT;
          if (alpha <= 0 || scale <= 0) continue;
          oc.save();
          oc.globalAlpha = alpha * 0.5;
          oc.fillStyle = color;
          oc.beginPath();
          oc.arc(cx, cy, cellSize * 0.3 * scale, 0, Math.PI * 2);
          oc.fill();
          oc.restore();
        }
        if (frame % 3 === 0) {
          const sparkColor = PIECE_COLORS[Math.floor(Math.random() * PIECE_COLORS.length)] || color;
          addParticle(
            origin.x + (Math.random() - 0.5) * cellSize * 0.5,
            origin.y + (Math.random() - 0.5) * cellSize * 0.5,
            sparkColor,
            { vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2, size: 3, decay: 0.06, sizeDecay: 0.05 }
          );
        }
      });
      drawVFX();
    });

    addBurstParticles(origin.x, origin.y, color, 15, { speed: 4, size: 5, decay: 0.03, sizeDecay: 0.07 });
    addShockwave(origin.x, origin.y, cellSize * 3, 18, color);
  }

  async function animateCrossCombo(cells, specialInfos) {
    const info = specialInfos.find(s => s.type === "cross" || s.type === "star_cross") || specialInfos[0];
    const origin = cellCenter(info.r, info.c);
    const color = PIECE_COLORS[info.color] || "#ffffff";

    await animateFrames(6, (frame, t) => {
      drawBoard((oc) => {
        oc.save();
        oc.shadowColor = "#ffff00";
        oc.shadowBlur = 15 + t * 20;
        oc.fillStyle = "#ffff00";
        oc.globalAlpha = 0.3 + t * 0.5;
        oc.beginPath();
        oc.arc(origin.x, origin.y, cellSize * 0.4, 0, Math.PI * 2);
        oc.fill();
        oc.restore();
      });
      drawVFX();
    });

    addComet(origin.x, origin.y, 1, 0, "#ff4444", cellSize * 0.35, 14);
    addComet(origin.x, origin.y, -1, 0, "#ff4444", cellSize * 0.35, 14);
    addComet(origin.x, origin.y, 0, 1, "#4488ff", cellSize * 0.35, 14);
    addComet(origin.x, origin.y, 0, -1, "#4488ff", cellSize * 0.35, 14);
    if (info.type === "star_cross") {
      const inv = Math.SQRT1_2;
      addComet(origin.x, origin.y, inv, inv, "#44ff88", cellSize * 0.35, 14);
      addComet(origin.x, origin.y, -inv, -inv, "#44ff88", cellSize * 0.35, 14);
      addComet(origin.x, origin.y, inv, -inv, "#ff44ff", cellSize * 0.35, 14);
      addComet(origin.x, origin.y, -inv, inv, "#ff44ff", cellSize * 0.35, 14);
    }
    addScreenShake(3);

    await animateFrames(25, (frame, t) => {
      if (frame === 12) {
        addShockwave(origin.x, origin.y, cellSize * 4, 18, "#ffff44");
        addBurstParticles(origin.x, origin.y, "#ffff00", 15, { speed: 4, size: 4.5, decay: 0.03, sizeDecay: 0.06 });
        addScreenShake(4);
      }
      for (const { r, c } of cells) {
        const cc = cellCenter(r, c);
        for (const comet of vfxComets) {
          if (Math.hypot(comet.x - cc.x, comet.y - cc.y) < cellSize * 0.7) {
            const pColor = (board[r] && board[r][c]) ? (PIECE_COLORS[board[r][c].color] || "#ffffff") : "#ffffff";
            addBurstParticles(cc.x, cc.y, pColor, 4, { speed: 1.5, size: 2.5, decay: 0.05, sizeDecay: 0.05 });
            break;
          }
        }
      }
      drawBoard(() => {});
      drawVFX();
    });
  }

  async function animateBigBomb(cells, specialInfos) {
    const info = specialInfos.find(s => s.type === "big_bomb") || specialInfos[0];
    const origin = cellCenter(info.r, info.c);
    const color = PIECE_COLORS[info.color] || "#ff6600";

    const cellSnaps = cells.map(({ r, c }) => {
      const cc = cellCenter(r, c);
      return { r, c, sx: cc.x, sy: cc.y };
    });

    await animateFrames(8, (frame, t) => {
      drawBoard((oc) => {
        for (const snap of cellSnaps) {
          const pullX = snap.sx + (origin.x - snap.sx) * t * 0.15;
          const pullY = snap.sy + (origin.y - snap.sy) * t * 0.15;
          const scale = 1 - t * 0.1;
          oc.save();
          oc.globalAlpha = 0.3;
          oc.fillStyle = "#ffffff";
          oc.beginPath();
          oc.arc(pullX, pullY, cellSize * 0.35 * scale, 0, Math.PI * 2);
          oc.fill();
          oc.restore();
        }
      });
      drawVFX();
    });

    addScreenShake(8);
    addShockwave(origin.x, origin.y, cellSize * 7, 30, "#ffffff");
    addFlash(origin.x, origin.y, cellSize * 5, "#ffffff", 18);
    addBurstParticles(origin.x, origin.y, "#ffffff", 30, { speed: 6, size: 6, decay: 0.025, sizeDecay: 0.08 });
    addBurstParticles(origin.x, origin.y, color, 20, { speed: 4, size: 5, decay: 0.02, sizeDecay: 0.06 });

    const cellDists = cells.map(({ r, c }) => ({
      r, c, dist: Math.abs(r - info.r) + Math.abs(c - info.c)
    }));

    await animateFrames(28, (frame, t) => {
      if (frame === 8) addShockwave(origin.x, origin.y, cellSize * 5, 20, color);
      if (frame === 14) addShockwave(origin.x, origin.y, cellSize * 4, 18, "#ffaa00");
      for (const { r, c, dist } of cellDists) {
        if (frame === dist * 3 + 1) {
          const cc = cellCenter(r, c);
          const pColor = (board[r] && board[r][c]) ? (PIECE_COLORS[board[r][c].color] || color) : color;
          addBurstParticles(cc.x, cc.y, pColor, 8, { speed: 2.5, size: 3.5, decay: 0.04, sizeDecay: 0.05 });
          addScreenShake(1.5);
        }
      }
      drawBoard(() => {});
      drawVFX();
    });
  }

  async function animateGalaxyCollision(cells, specialInfos) {
    const info = specialInfos.find(s => s.type === "galaxy") || specialInfos[0];
    const boardCX = (cols * cellSize) / 2;
    const boardCY = (rows * cellSize) / 2;

    addScreenShake(8);
    addFlash(boardCX, boardCY, cellSize * 8, "#ffffff", 20);
    addShockwave(boardCX, boardCY, cellSize * 10, 30, "#ffffff");
    addBurstParticles(boardCX, boardCY, "#ffffff", 40, { speed: 7, size: 6, decay: 0.02, sizeDecay: 0.07 });

    const cellDists = cells.map(({ r, c }) => {
      const cc = cellCenter(r, c);
      const dist = Math.hypot(cc.x - boardCX, cc.y - boardCY) / cellSize;
      return { r, c, dist };
    });

    await animateFrames(35, (frame, t) => {
      if (frame === 10) {
        addShockwave(boardCX, boardCY, cellSize * 6, 22, "#ffff44");
        addScreenShake(4);
      }
      for (const { r, c, dist } of cellDists) {
        if (frame === Math.floor(dist * 2) + 1) {
          const cc = cellCenter(r, c);
          const pColor = (board[r] && board[r][c]) ? (PIECE_COLORS[board[r][c].color] || "#ffffff") : "#ffffff";
          addBurstParticles(cc.x, cc.y, pColor, 6, { speed: 3, size: 3.5, decay: 0.035, sizeDecay: 0.05 });
        }
      }
      drawBoard((oc) => {
        if (t < 0.6) {
          const overlayAlpha = (1 - t / 0.6) * 0.25;
          oc.save();
          oc.globalAlpha = overlayAlpha;
          oc.fillStyle = "#ffffff";
          oc.fillRect(0, 0, cols * cellSize, rows * cellSize);
          oc.restore();
        }
      });
      drawVFX();
    });
  }

  function animateFrames(totalFrames, callback) {
    return new Promise(resolve => {
      let frame = 0;
      function step() {
        frame++;
        updateVFX();
        callback(frame, frame / totalFrames);
        if (frame < totalFrames) requestAnimationFrame(step);
        else resolve();
      }
      requestAnimationFrame(step);
    });
  }

  async function animateDrop(fallMap) {
    if (fallMap.length === 0) {
      drawBoard();
      return;
    }

    const maxDist = Math.max(...fallMap.map((f) => f.toR - f.fromR));
    const totalFrames = Math.ceil(maxDist / ANIM.DROP_SPEED);

    const frozen = [];
    for (let r = 0; r < rows; r++) {
      frozen[r] = [];
      for (let c = 0; c < cols; c++) {
        frozen[r][c] = board[r][c];
      }
    }

    const fallingCells = new Set(fallMap.map((f) => f.toR * cols + f.c));

    for (let frame = 0; frame <= totalFrames; frame++) {
      const t = Math.min(frame / totalFrames, 1);
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

      drawBoardBase();

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (fallingCells.has(r * cols + c)) continue;
          if (frozen[r][c]) {
            drawPieceAt(frozen[r][c], c * cellSize + cellSize / 2, r * cellSize + cellSize / 2);
          }
          if (isIce(r, c)) drawIceOverlay(r, c);
        }
      }

      for (const fall of fallMap) {
        const currentR = fall.fromR + (fall.toR - fall.fromR) * ease;
        const x = fall.c * cellSize + cellSize / 2;
        const y = currentR * cellSize + cellSize / 2;

        if (y + cellSize / 2 > 0) {
          drawPieceAt(fall.piece, x, y);
        }
      }

      ctx.restore();

      if (frame < totalFrames) {
        await sleep(ANIM.DROP_FRAME_MS);
      }
    }

    drawBoard();
  }

  async function showChainLabel(chain) {
    const label = `${chain} Chain!`;
    const totalFrames = 20;

    for (let f = 0; f < totalFrames; f++) {
      drawBoard();
      ctx.save();

      const t = f / totalFrames;
      const yOffset = -t * cellSize * 0.5;
      const alpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
      const scale = t < 0.2 ? 0.5 + (t / 0.2) * 0.5 : 1;

      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#ffd700";
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 3;
      ctx.font = `bold ${cellSize * 0.7 * scale}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      const x = boardPixelW / 2;
      const y = boardPixelH / 2 + yOffset;

      ctx.strokeText(label, x, y);
      ctx.fillText(label, x, y);

      ctx.restore();
      await sleep(25);
    }
  }

  async function flashInvalid(r1, c1, r2, c2) {
    for (let i = 0; i < 3; i++) {
      drawBoard(() => {
        ctx.save();
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = "#f00";
        ctx.fillRect(c1 * cellSize, r1 * cellSize, cellSize, cellSize);
        ctx.fillRect(c2 * cellSize, r2 * cellSize, cellSize, cellSize);
        ctx.restore();
      });
      await sleep(60);
      drawBoard();
      await sleep(60);
    }
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // --- Drawing ---
  function drawBoardBase() {
    ctx.clearRect(0, 0, boardPixelW, boardPixelH);
    ctx.save();
    ctx.translate(shakeX, shakeY);

    // Animated space background
    drawSpaceBackground();

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * cellSize;
        const y = r * cellSize;
        if (isHole(r, c)) {
          ctx.fillStyle = "rgba(5,5,16,0.85)";
          ctx.fillRect(x, y, cellSize, cellSize);
          continue;
        }
        if (isRock(r, c)) {
          ctx.fillStyle = "rgba(25,25,40,0.9)";
          ctx.fillRect(x, y, cellSize, cellSize);
          ctx.save();
          ctx.fillStyle = "#3a3a4a";
          const rcx = x + cellSize / 2;
          const rcy = y + cellSize / 2;
          const rr = cellSize / 2 - 4;
          ctx.beginPath();
          ctx.arc(rcx, rcy, rr, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#555";
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.strokeStyle = "#666";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(rcx - rr * 0.4, rcy - rr * 0.4);
          ctx.lineTo(rcx + rr * 0.4, rcy + rr * 0.4);
          ctx.moveTo(rcx + rr * 0.4, rcy - rr * 0.4);
          ctx.lineTo(rcx - rr * 0.4, rcy + rr * 0.4);
          ctx.stroke();
          ctx.restore();
          continue;
        }
        // Semi-transparent cell overlay so stars show through subtly
        ctx.fillStyle = (r + c) % 2 === 0 ? "rgba(10,18,40,0.45)" : "rgba(14,24,50,0.45)";
        ctx.fillRect(x, y, cellSize, cellSize);
      }
    }
  }

  function drawPieceAt(piece, cx, cy) {
    if (!piece) return;
    const radius = cellSize * 0.36;

    if (piece.special) {
      drawSpecialIcon(ctx, piece.special, cx, cy, cellSize * 0.44, piece);
    } else {
      if (pieceCacheSize === cellSize && pieceCache[piece.color]) {
        const cached = pieceCache[piece.color];
        const pad = 1.4;
        const size = Math.ceil(cellSize * pad);
        ctx.drawImage(cached, cx - size / 2, cy - size / 2, size, size);
      } else {
        drawPlanet(ctx, piece.color, cx, cy, radius);
      }
    }
  }

  function drawIceOverlay(r, c) {
    const x = c * cellSize, y = r * cellSize;
    ctx.save();
    const iceAlpha = cellState[r][c] === "ice2" ? 0.35 : 0.2;
    ctx.fillStyle = `rgba(100, 200, 255, ${iceAlpha})`;
    ctx.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
    ctx.strokeStyle = `rgba(150, 220, 255, ${iceAlpha + 0.15})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 2, y + 2, cellSize - 4, cellSize - 4);
    ctx.strokeStyle = `rgba(200, 240, 255, ${iceAlpha})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + cellSize * 0.2, y + cellSize * 0.3);
    ctx.lineTo(x + cellSize * 0.5, y + cellSize * 0.15);
    ctx.lineTo(x + cellSize * 0.8, y + cellSize * 0.3);
    ctx.stroke();
    if (cellState[r][c] === "ice2") {
      ctx.beginPath();
      ctx.moveTo(x + cellSize * 0.3, y + cellSize * 0.7);
      ctx.lineTo(x + cellSize * 0.6, y + cellSize * 0.85);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawBoard(overlay) {
    drawBoardBase();

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!board[r][c] || isHole(r, c) || isRock(r, c)) continue;
        const piece = board[r][c];

        const cx = c * cellSize + cellSize / 2;
        const cy = r * cellSize + cellSize / 2;
        const x = c * cellSize;
        const y = r * cellSize;

        drawPieceAt(piece, cx, cy);

        if (isIce(r, c)) {
          drawIceOverlay(r, c);
        }

        if (selected && selected.r === r && selected.c === c) {
          ctx.save();
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 3;
          ctx.strokeRect(c * cellSize + 2, r * cellSize + 2, cellSize - 4, cellSize - 4);
          ctx.restore();
        }
      }
    }

    if (overlay) overlay(ctx);
    ctx.restore();
  }

  // --- Color utility functions for planet gradients ---
  function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
  }

  function lightenColor(hex, amount) {
    const rgb = hexToRgb(hex);
    const r = Math.min(255, rgb.r + amount);
    const g = Math.min(255, rgb.g + amount);
    const b = Math.min(255, rgb.b + amount);
    return `rgb(${r},${g},${b})`;
  }

  function darkenColor(hex, amount) {
    const rgb = hexToRgb(hex);
    const r = Math.max(0, rgb.r - amount);
    const g = Math.max(0, rgb.g - amount);
    const b = Math.max(0, rgb.b - amount);
    return `rgb(${r},${g},${b})`;
  }

  // --- Planet drawing functions ---
  function drawPlanet(ctx, colorIdx, cx, cy, r) {
    ctx.save();
    const color = PIECE_COLORS[colorIdx];

    // Outer glow
    ctx.shadowColor = color;
    ctx.shadowBlur = r * 0.6;

    // Base sphere with radial gradient (3D effect)
    const grad = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.25, r * 0.1, cx, cy, r);
    grad.addColorStop(0, lightenColor(color, 60));
    grad.addColorStop(0.5, color);
    grad.addColorStop(1, darkenColor(color, 60));

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // Reset shadow for details
    ctx.shadowBlur = 0;

    // Planet-specific surface details
    switch (colorIdx) {
      case 0: drawSun(ctx, cx, cy, r, color); break;
      case 1: drawMoon(ctx, cx, cy, r, color); break;
      case 2: drawMars(ctx, cx, cy, r, color); break;
      case 3: drawMercury(ctx, cx, cy, r, color); break;
      case 4: drawJupiter(ctx, cx, cy, r, color); break;
      case 5: drawVenus(ctx, cx, cy, r, color); break;
      case 6: drawSaturn(ctx, cx, cy, r, color); break;
      case 7: drawEarth(ctx, cx, cy, r, color); break;
    }

    // Specular highlight (universal for all planets)
    const hlGrad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 0, cx - r * 0.3, cy - r * 0.3, r * 0.6);
    hlGrad.addColorStop(0, "rgba(255,255,255,0.45)");
    hlGrad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = hlGrad;
    ctx.fill();

    ctx.restore();
  }

  // Sun: Bold corona rays + surface flares
  function drawSun(ctx, cx, cy, r, color) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2 + 0.3;
      const dist = r * 0.35;
      const px = cx + Math.cos(angle) * dist;
      const py = cy + Math.sin(angle) * dist;
      const spotGrad = ctx.createRadialGradient(px, py, 0, px, py, r * 0.4);
      spotGrad.addColorStop(0, "rgba(255,255,180,0.5)");
      spotGrad.addColorStop(1, "rgba(255,255,180,0)");
      ctx.fillStyle = spotGrad;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    ctx.restore();
    // Bold corona rays
    ctx.save();
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const long = i % 2 === 0;
      const outerR = long ? r * 1.35 : r * 1.2;
      const x1 = cx + Math.cos(angle) * r;
      const y1 = cy + Math.sin(angle) * r;
      const x2 = cx + Math.cos(angle) * outerR;
      const y2 = cy + Math.sin(angle) * outerR;
      const grad = ctx.createLinearGradient(x1, y1, x2, y2);
      grad.addColorStop(0, "rgba(255,224,160,0.7)");
      grad.addColorStop(1, "rgba(255,224,160,0)");
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = grad;
      ctx.lineWidth = long ? 2.5 : 1.5;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawMoon(ctx, cx, cy, r, color) {
  }

  function drawMars(ctx, cx, cy, r, color) {
  }

  function drawMercury(ctx, cx, cy, r, color) {
  }

  // Jupiter: Bold cloud bands + prominent Great Red Spot
  function drawJupiter(ctx, cx, cy, r, color) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    const bands = [
      { y: -0.65, h: 0.22, c: "rgba(200,160,80,0.35)" },
      { y: -0.35, h: 0.18, c: "rgba(140,100,40,0.25)" },
      { y: -0.08, h: 0.22, c: "rgba(220,180,100,0.35)" },
      { y: 0.22, h: 0.18, c: "rgba(160,120,50,0.25)" },
      { y: 0.48, h: 0.22, c: "rgba(200,160,80,0.3)" },
    ];
    for (const b of bands) {
      ctx.fillStyle = b.c;
      ctx.fillRect(cx - r, cy + b.y * r, r * 2, b.h * r);
    }
    ctx.beginPath();
    ctx.ellipse(cx + r * 0.2, cy + r * 0.15, r * 0.22, r * 0.15, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(200,70,20,0.5)";
    ctx.fill();
    ctx.strokeStyle = "rgba(180,60,10,0.3)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  // Venus: Bold cloud swirl patterns
  function drawVenus(ctx, cx, cy, r, color) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(angle) * r * 0.15, cy + Math.sin(angle) * r * 0.15, r * 0.65, angle, angle + Math.PI * 0.9, false);
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.lineWidth = r * 0.15;
      ctx.stroke();
    }
    const cGrad = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r * 0.7);
    cGrad.addColorStop(0, "rgba(255,255,200,0.15)");
    cGrad.addColorStop(1, "rgba(255,255,200,0)");
    ctx.fillStyle = cGrad;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
  }

  // Saturn: Bold prominent rings
  function drawSaturn(ctx, cx, cy, r, color) {
    // Back half of rings
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 1.45, r * 0.4, -0.15, Math.PI, Math.PI * 2);
    ctx.strokeStyle = lightenColor(color, 60);
    ctx.lineWidth = r * 0.18;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 1.25, r * 0.33, -0.15, Math.PI, Math.PI * 2);
    ctx.strokeStyle = lightenColor(color, 35);
    ctx.lineWidth = r * 0.08;
    ctx.stroke();
    ctx.restore();

    // Redraw planet sphere
    const grad = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.25, r * 0.1, cx, cy, r);
    grad.addColorStop(0, lightenColor(color, 60));
    grad.addColorStop(0.5, color);
    grad.addColorStop(1, darkenColor(color, 60));
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // Surface bands
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    for (let i = 0; i < 3; i++) {
      const by = cy - r * 0.4 + i * r * 0.35;
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.fillRect(cx - r, by, r * 2, r * 0.12);
    }
    ctx.restore();

    // Front half of rings - bold
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 1.45, r * 0.4, -0.15, 0, Math.PI);
    ctx.strokeStyle = lightenColor(color, 70);
    ctx.lineWidth = r * 0.18;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 1.25, r * 0.33, -0.15, 0, Math.PI);
    ctx.strokeStyle = lightenColor(color, 40);
    ctx.lineWidth = r * 0.08;
    ctx.stroke();
    ctx.restore();
  }

  // Earth: Bold continents + clouds
  function drawEarth(ctx, cx, cy, r, color) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    const continents = [
      { x: -0.15, y: -0.25, w: 0.4, h: 0.35 },
      { x: 0.2, y: 0.1, w: 0.35, h: 0.4 },
      { x: -0.4, y: 0.2, w: 0.25, h: 0.25 },
    ];
    for (const c of continents) {
      const grad = ctx.createRadialGradient(
        cx + c.x * r, cy + c.y * r, 0,
        cx + c.x * r, cy + c.y * r, c.w * r
      );
      grad.addColorStop(0, "rgba(40,180,40,0.55)");
      grad.addColorStop(0.7, "rgba(40,160,40,0.3)");
      grad.addColorStop(1, "rgba(40,160,40,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    ctx.beginPath();
    ctx.arc(cx - r * 0.2, cy - r * 0.15, r * 0.55, -0.6, 0.6);
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = r * 0.12;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx + r * 0.3, cy + r * 0.3, r * 0.4, -0.8, 0.3);
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = r * 0.08;
    ctx.stroke();
    ctx.restore();
  }

  // --- Offscreen canvas cache for planet pieces ---
  function buildPieceCache() {
    pieceCache = {};
    pieceCacheSize = cellSize;
    const pad = 1.4;
    const size = Math.ceil(cellSize * pad);
    const dpr = window.devicePixelRatio || 1;

    for (let colorIdx = 0; colorIdx < PIECE_COLORS.length; colorIdx++) {
      const offCanvas = document.createElement("canvas");
      offCanvas.width = size * dpr;
      offCanvas.height = size * dpr;
      const offCtx = offCanvas.getContext("2d");
      offCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const cx = size / 2;
      const cy = size / 2;
      const radius = cellSize * 0.36;

      drawPlanet(offCtx, colorIdx, cx, cy, radius);
      pieceCache[colorIdx] = offCanvas;
    }
  }

  let missionIconCache = {};
  function getMissionIconUrl(colorIdx) {
    if (missionIconCache[colorIdx]) return missionIconCache[colorIdx];
    const iconSize = 28;
    const dpr = window.devicePixelRatio || 1;
    const c = document.createElement("canvas");
    c.width = iconSize * dpr;
    c.height = iconSize * dpr;
    const cx = c.getContext("2d");
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawPlanet(cx, colorIdx, iconSize / 2, iconSize / 2, iconSize * 0.4);
    missionIconCache[colorIdx] = c.toDataURL();
    return missionIconCache[colorIdx];
  }

  function initBgStars() {
    bgStars = [];
    const w = boardPixelW, h = boardPixelH;
    const layers = [
      { count: 100, speed: 0.08, sizeMin: 0.8, sizeMax: 1.8, alpha: 0.7 },
      { count: 55, speed: 0.22, sizeMin: 1.2, sizeMax: 2.5, alpha: 0.85 },
      { count: 25, speed: 0.45, sizeMin: 1.8, sizeMax: 3.2, alpha: 1.0 },
    ];
    for (const layer of layers) {
      for (let i = 0; i < layer.count; i++) {
        bgStars.push({
          x: Math.random() * w,
          y: Math.random() * h,
          size: layer.sizeMin + Math.random() * (layer.sizeMax - layer.sizeMin),
          speed: layer.speed + Math.random() * layer.speed * 0.3,
          alpha: layer.alpha * (0.6 + Math.random() * 0.4),
          twinkle: Math.random() * Math.PI * 2,
        });
      }
    }
  }

  function drawSpaceBackground() {
    const w = boardPixelW, h = boardPixelH;

    // Cached deep space gradient (recreate only on resize)
    const sizeKey = w + "x" + h;
    if (bgGradSize !== sizeKey) {
      bgGradCache = ctx.createLinearGradient(0, 0, w * 0.3, h);
      bgGradCache.addColorStop(0, "#0a0a2e");
      bgGradCache.addColorStop(0.5, "#0d1030");
      bgGradCache.addColorStop(1, "#150a30");
      bgGradSize = sizeKey;
    }
    ctx.fillStyle = bgGradCache;
    ctx.fillRect(0, 0, w, h);

    for (const star of bgStars) {
      const flicker = 0.7 + 0.3 * Math.sin(star.twinkle);
      ctx.globalAlpha = star.alpha * flicker;
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function startBgAnim() {
    stopBgAnim();
    function tick() {
      if (!screens.game.classList.contains("active")) return;
      updateVFX();
      if (!animating && !hintData) {
        drawBoard();
      }
      if (hasActiveVFX()) {
        drawVFX();
      }
      bgAnimId = requestAnimationFrame(tick);
    }
    bgAnimId = requestAnimationFrame(tick);
  }

  function stopBgAnim() {
    if (bgAnimId) { cancelAnimationFrame(bgAnimId); bgAnimId = null; }
  }

  // --- Title screen background ---
  let titleBgStars = [];
  let titleBgAnimId = null;
  let titleShootingStar = null;

  function initTitleBgStars(w, h) {
    titleBgStars = [];
    const layers = [
      { count: 100, speed: 0.06, sizeMin: 0.5, sizeMax: 1.5, alpha: 0.5 },
      { count: 55, speed: 0.18, sizeMin: 0.8, sizeMax: 2.0, alpha: 0.7 },
      { count: 25, speed: 0.35, sizeMin: 1.2, sizeMax: 2.8, alpha: 0.9 },
    ];
    for (const layer of layers) {
      for (let i = 0; i < layer.count; i++) {
        titleBgStars.push({
          x: Math.random() * w,
          y: Math.random() * h,
          size: layer.sizeMin + Math.random() * (layer.sizeMax - layer.sizeMin),
          speed: layer.speed + Math.random() * layer.speed * 0.3,
          alpha: layer.alpha * (0.6 + Math.random() * 0.4),
          twinkle: Math.random() * Math.PI * 2,
        });
      }
    }
  }

  function startTitleBgAnim() {
    stopTitleBgAnim();
    const canvas = document.getElementById("title-bg-canvas");
    if (!canvas) return;
    const tCtx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;

    function resize() {
      const rect = canvas.parentElement.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      tCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (titleBgStars.length === 0) initTitleBgStars(rect.width, rect.height);
    }
    resize();

    function tick() {
      if (!screens.title.classList.contains("active")) return;
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;

      const grad = tCtx.createLinearGradient(0, 0, w * 0.3, h);
      grad.addColorStop(0, "#0a0a2e");
      grad.addColorStop(0.5, "#0d1030");
      grad.addColorStop(1, "#150a30");
      tCtx.fillStyle = grad;
      tCtx.fillRect(0, 0, w, h);

      for (const star of titleBgStars) {
        star.y += star.speed;
        star.x += star.speed * 0.12;
        if (star.y > h) { star.y = -2; star.x = Math.random() * w; }
        if (star.x > w) star.x -= w;
        star.twinkle += 0.025;
        const flicker = 0.7 + 0.3 * Math.sin(star.twinkle);
        tCtx.globalAlpha = star.alpha * flicker;
        tCtx.fillStyle = "#fff";
        tCtx.beginPath();
        tCtx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        tCtx.fill();
      }
      tCtx.globalAlpha = 1;

      if (!titleShootingStar && Math.random() < 0.004) {
        titleShootingStar = {
          x: Math.random() * w * 0.7,
          y: Math.random() * h * 0.4,
          vx: 3 + Math.random() * 2,
          vy: 1.5 + Math.random(),
          life: 1,
        };
      }
      if (titleShootingStar) {
        const ss = titleShootingStar;
        ss.x += ss.vx;
        ss.y += ss.vy;
        ss.life -= 0.025;
        if (ss.life <= 0) { titleShootingStar = null; }
        else {
          tCtx.save();
          tCtx.globalAlpha = ss.life;
          const tailLen = 25;
          const sg = tCtx.createLinearGradient(ss.x, ss.y, ss.x - ss.vx * tailLen * 0.3, ss.y - ss.vy * tailLen * 0.3);
          sg.addColorStop(0, "#fff");
          sg.addColorStop(1, "rgba(255,255,255,0)");
          tCtx.strokeStyle = sg;
          tCtx.lineWidth = 1.5;
          tCtx.beginPath();
          tCtx.moveTo(ss.x, ss.y);
          tCtx.lineTo(ss.x - ss.vx * tailLen * 0.3, ss.y - ss.vy * tailLen * 0.3);
          tCtx.stroke();
          tCtx.restore();
        }
      }

      titleBgAnimId = requestAnimationFrame(tick);
    }
    titleBgAnimId = requestAnimationFrame(tick);
  }

  function stopTitleBgAnim() {
    if (titleBgAnimId) { cancelAnimationFrame(titleBgAnimId); titleBgAnimId = null; }
  }

  let resultBgStars = [];
  let resultBgAnimId = null;
  let resultShootingStar = null;

  function initResultBgStars(w, h) {
    resultBgStars = [];
    const layers = [
      { count: 100, speed: 0.06, sizeMin: 0.5, sizeMax: 1.5, alpha: 0.5 },
      { count: 55, speed: 0.18, sizeMin: 0.8, sizeMax: 2.0, alpha: 0.7 },
      { count: 25, speed: 0.35, sizeMin: 1.2, sizeMax: 2.8, alpha: 0.9 },
    ];
    for (const layer of layers) {
      for (let i = 0; i < layer.count; i++) {
        resultBgStars.push({
          x: Math.random() * w, y: Math.random() * h,
          size: layer.sizeMin + Math.random() * (layer.sizeMax - layer.sizeMin),
          speed: layer.speed + Math.random() * layer.speed * 0.3,
          alpha: layer.alpha * (0.6 + Math.random() * 0.4),
          twinkle: Math.random() * Math.PI * 2,
        });
      }
    }
  }

  function startResultBgAnim() {
    stopResultBgAnim();
    const canvas = document.getElementById("result-bg-canvas");
    if (!canvas) return;
    const rCtx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;

    function resize() {
      const rect = canvas.parentElement.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      rCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (resultBgStars.length === 0) initResultBgStars(rect.width, rect.height);
    }
    resize();

    function tick() {
      if (!screens.result.classList.contains("active")) return;
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;

      const grad = rCtx.createLinearGradient(0, 0, w * 0.3, h);
      grad.addColorStop(0, "#0a0a2e");
      grad.addColorStop(0.5, "#0d1030");
      grad.addColorStop(1, "#150a30");
      rCtx.fillStyle = grad;
      rCtx.fillRect(0, 0, w, h);

      for (const star of resultBgStars) {
        star.y += star.speed;
        star.x += star.speed * 0.12;
        if (star.y > h) { star.y = -2; star.x = Math.random() * w; }
        if (star.x > w) star.x -= w;
        star.twinkle += 0.025;
        const flicker = 0.7 + 0.3 * Math.sin(star.twinkle);
        rCtx.globalAlpha = star.alpha * flicker;
        rCtx.fillStyle = "#fff";
        rCtx.beginPath();
        rCtx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        rCtx.fill();
      }
      rCtx.globalAlpha = 1;

      if (!resultShootingStar && Math.random() < 0.004) {
        resultShootingStar = {
          x: Math.random() * w * 0.7, y: Math.random() * h * 0.4,
          vx: 3 + Math.random() * 2, vy: 1.5 + Math.random(), life: 1,
        };
      }
      if (resultShootingStar) {
        const ss = resultShootingStar;
        ss.x += ss.vx; ss.y += ss.vy; ss.life -= 0.025;
        if (ss.life <= 0) { resultShootingStar = null; }
        else {
          rCtx.save();
          rCtx.globalAlpha = ss.life;
          const tailLen = 25;
          const sg = rCtx.createLinearGradient(ss.x, ss.y, ss.x - ss.vx * tailLen * 0.3, ss.y - ss.vy * tailLen * 0.3);
          sg.addColorStop(0, "#fff");
          sg.addColorStop(1, "rgba(255,255,255,0)");
          rCtx.strokeStyle = sg;
          rCtx.lineWidth = 1.5;
          rCtx.beginPath();
          rCtx.moveTo(ss.x, ss.y);
          rCtx.lineTo(ss.x - ss.vx * tailLen * 0.3, ss.y - ss.vy * tailLen * 0.3);
          rCtx.stroke();
          rCtx.restore();
        }
      }

      resultBgAnimId = requestAnimationFrame(tick);
    }
    resultBgAnimId = requestAnimationFrame(tick);
  }

  function stopResultBgAnim() {
    if (resultBgAnimId) { cancelAnimationFrame(resultBgAnimId); resultBgAnimId = null; }
  }

  let splashBgStars = [];
  let splashBgAnimId = null;

  function startSplashBgAnim() {
    stopSplashBgAnim();
    const canvas = document.getElementById("splash-bg-canvas");
    if (!canvas) return;
    const sCtx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;

    function resize() {
      const rect = canvas.parentElement.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      sCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (splashBgStars.length === 0) {
        splashBgStars = [];
        const w = rect.width, h = rect.height;
        for (let i = 0; i < 150; i++) {
          splashBgStars.push({
            x: Math.random() * w, y: Math.random() * h,
            size: 0.5 + Math.random() * 2,
            speed: 0.04 + Math.random() * 0.15,
            alpha: 0.4 + Math.random() * 0.5,
            twinkle: Math.random() * Math.PI * 2,
          });
        }
      }
    }
    resize();

    function tick() {
      if (!screens.splash.classList.contains("active")) return;
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      const grad = sCtx.createLinearGradient(0, 0, w * 0.3, h);
      grad.addColorStop(0, "#0a0a2e");
      grad.addColorStop(0.5, "#0d1030");
      grad.addColorStop(1, "#150a30");
      sCtx.fillStyle = grad;
      sCtx.fillRect(0, 0, w, h);
      for (const star of splashBgStars) {
        star.y += star.speed;
        star.x += star.speed * 0.1;
        if (star.y > h) { star.y = -2; star.x = Math.random() * w; }
        if (star.x > w) star.x -= w;
        star.twinkle += 0.02;
        sCtx.globalAlpha = star.alpha * (0.7 + 0.3 * Math.sin(star.twinkle));
        sCtx.fillStyle = "#fff";
        sCtx.beginPath();
        sCtx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        sCtx.fill();
      }
      sCtx.globalAlpha = 1;
      splashBgAnimId = requestAnimationFrame(tick);
    }
    splashBgAnimId = requestAnimationFrame(tick);
  }

  function stopSplashBgAnim() {
    if (splashBgAnimId) { cancelAnimationFrame(splashBgAnimId); splashBgAnimId = null; }
  }

  function drawStar5(ctx, cx, cy, r) {
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = (i * 2 * Math.PI / 5) - Math.PI / 2;
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      const a2 = a + Math.PI / 5;
      ctx.lineTo(cx + Math.cos(a2) * r * 0.4, cy + Math.sin(a2) * r * 0.4);
    }
    ctx.closePath();
    ctx.fill();
  }

  function drawShootingStar(ctx, cx, cy, r, angle) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    const s = r;
    ctx.shadowColor = "#ffd700";
    ctx.shadowBlur = r * 0.3;
    const tg = ctx.createLinearGradient(0, s * 0.8, 0, -s * 0.3);
    tg.addColorStop(0, "rgba(255,215,0,0)");
    tg.addColorStop(0.5, "rgba(255,215,0,0.4)");
    tg.addColorStop(1, "#ffd700");
    ctx.fillStyle = tg;
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.4);
    ctx.lineTo(-s * 0.15, s * 0.8);
    ctx.lineTo(s * 0.15, s * 0.8);
    ctx.fill();
    ctx.shadowBlur = r * 0.4;
    ctx.fillStyle = "#fff";
    drawStar5(ctx, 0, -s * 0.45, s * 0.25);
    ctx.restore();
  }

  function drawSpecialIcon(ctx, type, cx, cy, r, piece) {
    ctx.save();
    switch (type) {
      case "line_h": {
        drawShootingStar(ctx, cx, cy, r, Math.PI / 2);
        break;
      }
      case "line_v": {
        drawShootingStar(ctx, cx, cy, r, 0);
        break;
      }
      case "line_d": {
        ctx.save();
        ctx.translate(cx, cy);
        const s = r;
        [-Math.PI / 4, Math.PI / 4].forEach(a => {
          ctx.save();
          ctx.rotate(a);
          ctx.shadowColor = "#ffd700";
          ctx.shadowBlur = r * 0.3;
          const tg = ctx.createLinearGradient(0, s * 0.8, 0, -s * 0.3);
          tg.addColorStop(0, "rgba(255,215,0,0)");
          tg.addColorStop(0.5, "rgba(255,215,0,0.4)");
          tg.addColorStop(1, "#ffd700");
          ctx.fillStyle = tg;
          ctx.beginPath();
          ctx.moveTo(0, -s * 0.4);
          ctx.lineTo(-s * 0.15, s * 0.8);
          ctx.lineTo(s * 0.15, s * 0.8);
          ctx.fill();
          ctx.shadowBlur = r * 0.4;
          ctx.fillStyle = "#fff";
          drawStar5(ctx, 0, -s * 0.45, s * 0.25);
          ctx.restore();
        });
        ctx.restore();
        break;
      }
      case "bomb": {
        const s = r;
        ctx.shadowColor = "#ff6600";
        ctx.shadowBlur = r * 0.3;
        const bg = ctx.createRadialGradient(cx - s * 0.15, cy - s * 0.1, s * 0.05, cx, cy + s * 0.05, s * 0.5);
        bg.addColorStop(0, "#555");
        bg.addColorStop(0.8, "#222");
        bg.addColorStop(1, "#111");
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.arc(cx, cy + s * 0.05, s * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.15)";
        ctx.beginPath();
        ctx.arc(cx - s * 0.15, cy - s * 0.1, s * 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#aaa";
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(cx, cy - s * 0.45);
        ctx.quadraticCurveTo(cx + s * 0.2, cy - s * 0.65, cx + s * 0.1, cy - s * 0.75);
        ctx.stroke();
        ctx.shadowColor = "#ffd700";
        ctx.shadowBlur = r * 0.5;
        ctx.fillStyle = "#ffd700";
        drawStar5(ctx, cx + s * 0.1, cy - s * 0.78, s * 0.15);
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(cx + s * 0.1, cy - s * 0.78, s * 0.05, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "rainbow": {
        const s = r;
        const cs = ["#ff4444", "#ffaa00", "#44ff44", "#4488ff", "#ff44ff", "#44ffff"];
        for (let i = 5; i >= 0; i--) {
          const rr = s * (0.15 + i * 0.14);
          ctx.strokeStyle = cs[i % cs.length];
          ctx.lineWidth = 3;
          ctx.globalAlpha = 0.5 + (5 - i) * 0.1;
          ctx.shadowColor = cs[i % cs.length];
          ctx.shadowBlur = 4;
          ctx.beginPath();
          ctx.arc(cx, cy, rr, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, s * 0.2);
        cg.addColorStop(0, "#fff");
        cg.addColorStop(0.5, "rgba(255,255,255,0.5)");
        cg.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = cg;
        ctx.shadowColor = "#fff";
        ctx.shadowBlur = r * 0.5;
        ctx.beginPath();
        ctx.arc(cx, cy, s * 0.2, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "countdown": {
        const s = r;
        const count = piece ? piece.countdown : 0;
        const urgency = count <= 3;
        ctx.shadowColor = urgency ? "#ff4444" : "#ff6600";
        ctx.shadowBlur = r * 0.3;
        const bg = ctx.createRadialGradient(cx - s * 0.1, cy, s * 0.05, cx, cy + s * 0.05, s * 0.45);
        bg.addColorStop(0, "#555");
        bg.addColorStop(0.8, "#222");
        bg.addColorStop(1, "#111");
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.arc(cx, cy + s * 0.05, s * 0.45, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#aaa";
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(cx, cy - s * 0.4);
        ctx.quadraticCurveTo(cx + s * 0.15, cy - s * 0.55, cx + s * 0.08, cy - s * 0.65);
        ctx.stroke();
        ctx.fillStyle = urgency ? "#ff4444" : "#ff4444";
        ctx.shadowColor = urgency ? "#ff0000" : "#ff0000";
        ctx.shadowBlur = r * 0.4;
        ctx.beginPath();
        ctx.arc(cx + s * 0.08, cy - s * 0.68, s * 0.08, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        const dw = s * 0.5, dh = s * 0.35;
        ctx.fillRect(cx - dw / 2, cy - dh / 2 + s * 0.05, dw, dh);
        ctx.strokeStyle = "#333";
        ctx.lineWidth = 1;
        ctx.strokeRect(cx - dw / 2, cy - dh / 2 + s * 0.05, dw, dh);
        ctx.fillStyle = urgency ? "#ff4444" : "#ffd700";
        ctx.shadowColor = urgency ? "#ff0000" : "#ffd700";
        ctx.shadowBlur = r * 0.2;
        ctx.font = `bold ${s * 0.55}px monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const countStr = count < 10 ? "0" + count : count.toString();
        ctx.fillText(countStr, cx, cy + s * 0.08);
        break;
      }
    }
    ctx.restore();
  }

  // --- HUD ---
  function updateHUD() {
    document.getElementById("hud-stage").textContent = `Stage ${STAGES[currentStage].name}`;
    document.getElementById("hud-moves").textContent = `のこり ${movesLeft} 手`;

    const m = STAGES[currentStage].mission;
    document.getElementById("hud-mission-label").innerHTML = getMissionText(m, true);

    let current = 0;
    let target = 0;
    switch (m.type) {
      case "score":
        current = score;
        target = m.target;
        document.getElementById("hud-mission-progress").textContent = `${current} / ${target} 点`;
        break;
      case "clear":
        current = totalCleared;
        target = m.count;
        document.getElementById("hud-mission-progress").textContent = `${current} / ${target} 個`;
        break;
      case "color":
        current = colorCleared[m.colorIndex] || 0;
        target = m.count;
        document.getElementById("hud-mission-progress").textContent = `${current} / ${target} 個`;
        break;
    }

    const progressEl = document.getElementById("hud-mission-progress");
    if (current >= target) {
      progressEl.style.color = "#4ecdc4";
    } else {
      progressEl.style.color = "";
    }

    const stg = STAGES[currentStage];
    const usedMoves = stg.moves - movesLeft;
    let currentStars = 3;
    if (usedMoves > stg.star3moves) currentStars = 2;
    if (usedMoves > stg.star2moves) currentStars = 1;

    const starsEl = document.getElementById("hud-stars");
    let html = "";
    for (let s = 0; s < 3; s++) {
      html += s < currentStars
        ? '<span class="star-on">★</span>'
        : '<span class="star-off">★</span>';
    }
    starsEl.innerHTML = html;
  }

  // --- Win/Lose ---
  function checkWinLose() {
    const m = STAGES[currentStage].mission;
    let cleared = false;

    switch (m.type) {
      case "score":
        cleared = score >= m.target;
        break;
      case "clear":
        cleared = totalCleared >= m.count;
        break;
      case "color":
        cleared = (colorCleared[m.colorIndex] || 0) >= m.count;
        break;
    }

    if (cleared) {
      const stg = STAGES[currentStage];
      const usedMoves = stg.moves - movesLeft;
      let stars = 1;
      if (usedMoves <= stg.star3moves) stars = 3;
      else if (usedMoves <= stg.star2moves) stars = 2;

      const prev = saveData.bestStars[currentStage] || 0;
      const isFirstClear = !saveData.cleared[currentStage];
      coinsEarned = stars;
      const newStars = Math.max(0, stars - prev);
      coinsEarned += newStars * 2;
      if (isFirstClear && STAR_GATES.some(g => g.stage === currentStage)) {
        coinsEarned += 5;
      }
      saveData.coins = (saveData.coins || 0) + coinsEarned;

      if (stars > prev) saveData.bestStars[currentStage] = stars;
      saveData.cleared[currentStage] = true;
      writeSave();

      SFX.stageClear();
      track("stage_clear", { stage: stg.name, stars, moves_used: usedMoves, moves_total: stg.moves, mission_type: stg.mission.type, coins_earned: coinsEarned });
      showResult(true, stars);
    } else if (movesLeft <= 0) {
      const stg = STAGES[currentStage];
      SFX.stageFail();
      track("stage_fail", { stage: stg.name, moves_total: stg.moves, mission_type: stg.mission.type });
      showResult(false, 0);
    }
  }

  function showResult(win, stars) {
    document.getElementById("result-title").textContent = win ? "クリア！" : "あと少し…";
    document.getElementById("result-stars").textContent = win
      ? "★".repeat(stars) + "☆".repeat(3 - stars)
      : "";
    let details = `スコア: ${score}`;
    if (win && coinsEarned > 0) {
      details += `<br><span class="coin-icon"></span> +${coinsEarned} コイン（所持: ${saveData.coins || 0}）`;
    }
    document.getElementById("result-details").innerHTML = details;

    const nextBtn = document.getElementById("btn-next");
    nextBtn.style.display = win && currentStage < STAGES.length - 1 ? "" : "none";

    const rescueBtn = document.getElementById("btn-rescue");
    if (!win && (debugMode || (saveData.coins || 0) >= ITEM_COSTS.addmoves)) {
      rescueBtn.style.display = "";
    } else {
      rescueBtn.style.display = "none";
    }

    showScreen("result");
  }

  // --- Input ---
  function getCell(px, py) {
    const rect = canvas.getBoundingClientRect();
    const x = px - rect.left;
    const y = py - rect.top;
    const c = Math.floor(x / cellSize);
    const r = Math.floor(y / cellSize);
    if (inBounds(r, c) && !isHole(r, c) && !isRock(r, c)) return { r, c };
    return null;
  }

  let dragStart = null;
  let dragStartPx = null;
  const DRAG_THRESHOLD = 12;

  function dragDirection(sx, sy, ex, ey) {
    const dx = ex - sx;
    const dy = ey - sy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < DRAG_THRESHOLD) return null;

    const angle = Math.atan2(dy, dx);
    const sector = Math.round(angle / (Math.PI / 4));
    switch (sector) {
      case 0:  return { dr: 0, dc: 1 };
      case 1:  return { dr: 1, dc: 1 };
      case 2:  return { dr: 1, dc: 0 };
      case 3:  return { dr: 1, dc: -1 };
      case 4:
      case -4: return { dr: 0, dc: -1 };
      case -3: return { dr: -1, dc: -1 };
      case -2: return { dr: -1, dc: 0 };
      case -1: return { dr: -1, dc: 1 };
    }
    return null;
  }

  canvas.addEventListener("pointerdown", (e) => {
    if (animating) return;
    e.preventDefault();
    clearHint();
    const cell = getCell(e.clientX, e.clientY);
    if (!cell) return;

    if (debugSpawnType) {
      spawnSpecialAt(cell.r, cell.c, debugSpawnType);
      return;
    }

    if (itemMode === "pinpoint") {
      cancelItemMode();
      usePinpoint(cell.r, cell.c);
      return;
    }

    if (selected) {
      if (selected.r === cell.r && selected.c === cell.c) {
        const p = board[cell.r][cell.c];
        if (p && p.special && TAP_ACTIVATE_SPECIALS.has(p.special)) {
          selected = null;
          activateByTap(cell.r, cell.c);
          return;
        }
      }
      if (isAdjacent(selected.r, selected.c, cell.r, cell.c)) {
        doMove(selected.r, selected.c, cell.r, cell.c);
        selected = null;
        drawBoard();
        return;
      }
    }

    selected = cell;
    dragStart = cell;
    dragStartPx = { x: e.clientX, y: e.clientY };
    drawBoard();
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!dragStart || !dragStartPx || animating) return;
    e.preventDefault();

    const dir = dragDirection(dragStartPx.x, dragStartPx.y, e.clientX, e.clientY);
    if (!dir) return;

    const targetR = dragStart.r + dir.dr;
    const targetC = dragStart.c + dir.dc;
    if (!inBounds(targetR, targetC)) return;
    if (isHole(targetR, targetC) || isRock(targetR, targetC)) return;

    selected = null;
    doMove(dragStart.r, dragStart.c, targetR, targetC);
    dragStart = null;
    dragStartPx = null;
  });

  canvas.addEventListener("pointerup", () => {
    dragStart = null;
    dragStartPx = null;
  });

  canvas.addEventListener("pointerleave", () => {
    dragStart = null;
    dragStartPx = null;
  });

  // --- Screen Transitions ---
  document.getElementById("btn-sound-toggle").addEventListener("click", () => {
    soundEnabled = !soundEnabled;
    document.getElementById("btn-sound-toggle").textContent = soundEnabled ? "🔊" : "🔇";
    if (!soundEnabled) {
      stopAllBgm();
    } else if (bgmInitialized) {
      const activeScreen = Object.keys(screens).find(k => screens[k].classList.contains("active"));
      if (activeScreen === "title" || activeScreen === "help") switchBgm("title");
      else if (activeScreen === "stageSelect") switchBgm("select");
      else if (activeScreen === "game") switchBgm("ingame");
    }
  });

  document.getElementById("btn-start").addEventListener("click", () => {
    initAudio();
    const lastCleared = Object.keys(saveData.cleared)
      .map(Number)
      .sort((a, b) => a - b);
    let next = lastCleared.length > 0 ? Math.min(lastCleared[lastCleared.length - 1] + 1, STAGES.length - 1) : 0;
    if (!isStageUnlocked(next)) {
      buildStageSelect();
      showScreen("stageSelect");
      return;
    }
    currentStage = next;
    startStage(currentStage);
  });

  document.getElementById("btn-stage-select").addEventListener("click", () => {
    initAudio();
    buildStageSelect();
    showScreen("stageSelect");
  });

  document.getElementById("btn-back-title").addEventListener("click", () => {
    showScreen("title");
  });

  function renderHelpPieceIcons() {
    document.querySelectorAll(".help-piece-canvas").forEach(cv => {
      const type = cv.dataset.special;
      const dpr = window.devicePixelRatio || 1;
      const size = 48 * dpr;
      cv.width = size;
      cv.height = size;
      const ctx = cv.getContext("2d");
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, 48, 48);
      drawSpecialIcon(ctx, type, 24, 24, 20, null);
    });
  }

  document.getElementById("btn-help").addEventListener("click", () => {
    showScreen("help");
    renderHelpPieceIcons();
  });

  document.getElementById("btn-back-help").addEventListener("click", () => {
    showScreen("title");
  });

  document.getElementById("btn-backup").addEventListener("click", () => {
    const json = JSON.stringify(saveData, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    a.href = url;
    a.download = `7metch_backup_${date}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  let restoreData = null;

  document.getElementById("btn-restore").addEventListener("click", () => {
    restoreData = null;
    document.getElementById("restore-file").value = "";
    document.getElementById("restore-file-name").textContent = "";
    document.getElementById("btn-restore-exec").disabled = true;
    document.getElementById("restore-modal").classList.remove("hidden");
  });

  document.getElementById("restore-file").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    document.getElementById("restore-file-name").textContent = file.name;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed.cleared || !parsed.bestStars) throw new Error();
        restoreData = parsed;
        document.getElementById("btn-restore-exec").disabled = false;
      } catch {
        restoreData = null;
        document.getElementById("btn-restore-exec").disabled = true;
        alert("このファイルはバックアップデータではありません。");
      }
    };
    reader.readAsText(file);
  });

  document.getElementById("btn-restore-cancel").addEventListener("click", () => {
    document.getElementById("restore-modal").classList.add("hidden");
  });

  document.getElementById("btn-restore-exec").addEventListener("click", () => {
    if (!restoreData) return;
    if (restoreData.coins === undefined) {
      restoreData.coins = 0;
      for (const stars of Object.values(restoreData.bestStars)) {
        restoreData.coins += stars * 3;
      }
      for (const gate of STAR_GATES) {
        if (restoreData.cleared[gate.stage]) {
          restoreData.coins += 5;
        }
      }
    }
    saveData = restoreData;
    writeSave();
    document.getElementById("restore-modal").classList.add("hidden");
    alert("データを復元しました！");
  });

  document.getElementById("btn-feedback").addEventListener("click", () => {
    if (FEEDBACK_URL) {
      window.open(FEEDBACK_URL, "_blank");
    }
  });

  document.getElementById("btn-retry").addEventListener("click", () => {
    if (!confirm("リトライしますか？")) return;
    track("stage_retry", { stage: STAGES[currentStage].name });
    startStage(currentStage);
  });

  document.getElementById("btn-quit").addEventListener("click", () => {
    if (!confirm("タイトルに戻りますか？")) return;
    showScreen("title");
  });

  document.getElementById("btn-next").addEventListener("click", () => {
    const next = currentStage + 1;
    if (next >= STAGES.length || !isStageUnlocked(next)) {
      buildStageSelect();
      showScreen("stageSelect");
      return;
    }
    currentStage = next;
    startStage(currentStage);
  });

  document.getElementById("btn-result-retry").addEventListener("click", () => {
    track("stage_retry", { stage: STAGES[currentStage].name });
    startStage(currentStage);
  });

  document.getElementById("btn-result-stages").addEventListener("click", () => {
    buildStageSelect();
    showScreen("stageSelect");
  });

  function buildStageSelect() {
    const grid = document.getElementById("stage-grid");
    grid.innerHTML = "";
    const total = getTotalStars();

    document.getElementById("total-stars-display").innerHTML = `★ ${total}　<span style="color:#4ecdc4"><span class="coin-icon"></span> ${saveData.coins || 0}</span>`;

    const lastClearedIdx = Object.keys(saveData.cleared)
      .map(Number)
      .reduce((max, n) => Math.max(max, n), -1);
    const visibleUpTo = lastClearedIdx + 6;

    let stopped = false;

    for (let i = 0; i < STAGES.length; i++) {
      if (stopped) break;

      const gate = getGateFor(i);
      if (gate && gate.stars > total && i > lastClearedIdx) {
        const gateEl = document.createElement("div");
        gateEl.className = "stage-gate";
        gateEl.innerHTML = `★${gate.stars} で次のエリア解放（あと${gate.stars - total}）`;
        grid.appendChild(gateEl);
        stopped = true;
        break;
      }

      if (i > visibleUpTo && !saveData.cleared[i]) break;

      const stg = STAGES[i];
      const btn = document.createElement("button");
      btn.className = "stage-btn";
      const unlocked = isStageUnlocked(i);
      if (!unlocked) btn.classList.add("locked");

      const stars = saveData.bestStars[i] || 0;
      btn.innerHTML = `<span>${stg.name}</span><span class="stage-stars">${"★".repeat(stars)}</span>`;

      if (unlocked) {
        btn.addEventListener("click", () => {
          currentStage = i;
          startStage(i);
        });
      }

      grid.appendChild(btn);
    }
  }

  function startStage(index) {
    const stg = STAGES[index];
    cols = stg.boardCols;
    rows = stg.boardRows;
    movesLeft = stg.moves;
    score = 0;
    totalCleared = 0;
    colorCleared = [];
    chainCount = 0;
    selected = null;
    animating = false;
    vfxParticles = []; vfxShockwaves = []; vfxFlashes = []; vfxComets = []; vfxTexts = []; shakeX = shakeY = shakeIntensity = 0;
    itemMode = null;
    coinsEarned = 0;
    canvas.classList.remove("item-targeting");

    resizeCanvas();
    initCellState(stg);
    createBoard(stg.colors);
    updateHUD();
    updateItemBar();
    drawBoard();
    showScreen("game");
    track("stage_start", { stage: stg.name, mission_type: stg.mission.type });
    startHintTimer();
  }

  function resizeCanvas() {
    const app = document.getElementById("app");
    const maxW = app.clientWidth - 16;
    const maxH = app.clientHeight - 140;

    cellSize = Math.min(Math.floor(maxW / cols), Math.floor(maxH / rows));
    cellSize = Math.max(cellSize, 28);

    boardPixelW = cols * cellSize;
    boardPixelH = rows * cellSize;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = boardPixelW * dpr;
    canvas.height = boardPixelH * dpr;
    canvas.style.width = boardPixelW + "px";
    canvas.style.height = boardPixelH + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildPieceCache();
    initBgStars();
  }

  window.addEventListener("resize", () => {
    if (screens.game.classList.contains("active")) {
      resizeCanvas();
      drawBoard();
    }
  });

  // --- Debug Mode ---
  let debugTapCount = 0;
  let debugTapTimer = null;
  let debugMode = false;

  document.getElementById("version-info").addEventListener("click", () => {
    debugTapCount++;
    clearTimeout(debugTapTimer);
    debugTapTimer = setTimeout(() => { debugTapCount = 0; }, 1500);
    if (debugTapCount >= 7) {
      debugTapCount = 0;
      debugMode = true;
      document.getElementById("debug-badge").classList.remove("hidden");
      document.getElementById("debug-panel").classList.remove("hidden");
      document.getElementById("btn-debug-open").classList.remove("hidden");
      updateItemBar();
    }
  });

  document.getElementById("btn-debug-jump").addEventListener("click", () => {
    const num = parseInt(document.getElementById("debug-stage-num").value, 10);
    if (num >= 1 && num <= STAGES.length) {
      currentStage = num - 1;
      document.getElementById("debug-panel").classList.add("hidden");
      startStage(currentStage);
    }
  });

  document.getElementById("btn-debug-unlock-all").addEventListener("click", () => {
    for (let i = 0; i < STAGES.length; i++) {
      saveData.cleared[i] = true;
      if (!saveData.bestStars[i]) saveData.bestStars[i] = 1;
    }
    writeSave();
    alert("全ステージを解放しました");
  });

  document.getElementById("btn-debug-reset").addEventListener("click", () => {
    if (confirm("セーブデータをリセットしますか？")) {
      saveData = { cleared: {}, bestStars: {}, coins: 0 };
      writeSave();
      alert("リセットしました");
    }
  });

  document.getElementById("btn-debug-close").addEventListener("click", () => {
    document.getElementById("debug-panel").classList.add("hidden");
  });

  // --- Item Buttons ---
  document.querySelectorAll(".item-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      if (animating || !screens.game.classList.contains("active")) return;
      const item = btn.dataset.item;
      const cost = ITEM_COSTS[item];
      if (!debugMode && (saveData.coins || 0) < cost) return;

      if (item !== "pinpoint" && itemMode === "pinpoint") {
        cancelItemMode();
      }

      switch (item) {
        case "pinpoint":
          if (itemMode === "pinpoint") {
            cancelItemMode();
          } else {
            itemMode = "pinpoint";
            canvas.classList.add("item-targeting");
          }
          break;
        case "shuffle":
          useShuffle();
          break;
        case "addmoves":
          useAddMoves();
          break;
        case "colorbomb":
          showColorPicker();
          break;
      }
    });
  });

  document.getElementById("btn-color-cancel").addEventListener("click", () => {
    document.getElementById("color-picker-modal").classList.add("hidden");
  });

  document.getElementById("btn-rescue").addEventListener("click", () => {
    if (!debugMode && (saveData.coins || 0) < ITEM_COSTS.addmoves) return;
    if (!debugMode) { saveData.coins -= ITEM_COSTS.addmoves; writeSave(); }
    movesLeft += 3;
    updateHUD();
    updateItemBar();
    showScreen("game");
    track("item_rescue", { stage: STAGES[currentStage].name, coins_remaining: saveData.coins });
  });

  // --- Special Piece Spawner ---
  const SPAWN_LABELS = {
    line_h: "← → 横ライン",
    line_v: "↑ ↓ 縦ライン",
    bomb: "◎ ボム",
    rainbow: "✦ レインボー",
    diagonal: "╲╱ ナナメ",
    countdown: "⏱️ カウントダウン",
  };

  function updateSpawnIndicator() {
    const el = document.getElementById("spawn-indicator");
    if (debugSpawnType && SPAWN_LABELS[debugSpawnType]) {
      el.textContent = `スポナーON: ${SPAWN_LABELS[debugSpawnType]}（盤面タップで設置）`;
      el.classList.remove("hidden");
    } else {
      el.classList.add("hidden");
    }
  }

  document.querySelectorAll(".btn-spawn").forEach(btn => {
    btn.addEventListener("click", () => {
      const type = btn.dataset.spawn;
      document.querySelectorAll(".btn-spawn").forEach(b => b.classList.remove("active"));
      if (type === "off" || debugSpawnType === type) {
        debugSpawnType = null;
      } else {
        debugSpawnType = type;
        btn.classList.add("active");
      }
      document.getElementById("debug-panel").classList.add("hidden");
      updateSpawnIndicator();
    });
  });

  document.getElementById("btn-debug-open").addEventListener("click", () => {
    document.getElementById("debug-panel").classList.remove("hidden");
  });

  document.addEventListener("visibilitychange", () => {
    if (!audioCtx || !bgmInitialized) return;
    if (document.hidden) {
      audioCtx.suspend();
    } else {
      if (soundEnabled) audioCtx.resume();
    }
  });

  document.getElementById("screen-splash").addEventListener("click", () => {
    initAudio();
    showScreen("title");
  });

  showScreen("splash");
})();
