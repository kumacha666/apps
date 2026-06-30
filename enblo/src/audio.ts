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
