import { describe, expect, test } from "vitest";
import { fadeInGain, fadeInVolume, fadeOutGain, fadeOutVolume } from "./fade";

describe("fadeOutGain", () => {
  test("始点は1、終点は厳密に0で、範囲外はクランプする", () => {
    expect(fadeOutGain(0)).toBe(1);
    expect(fadeOutGain(-1)).toBe(1);
    expect(fadeOutGain(1)).toBe(0);
    expect(fadeOutGain(2)).toBe(0);
  });

  test("単調に減少し、線形より素早く下がって細い余韻を残す（終盤の落ち幅が小さい＝急に消えない）", () => {
    let prev = 1;
    for (let i = 1; i <= 20; i += 1) {
      const g = fadeOutGain(i / 20);
      expect(g).toBeLessThan(prev);
      prev = g;
    }
    expect(fadeOutGain(0.5)).toBeLessThan(0.5);
    // 最後の10%区間の落ち幅は、線形（0.1）よりずっと小さい。
    expect(fadeOutGain(0.9) - fadeOutGain(1)).toBeLessThan(0.03);
  });
});

describe("fadeOutVolume", () => {
  test("段階的にvolumeを0まで下げる", async () => {
    const audio = { volume: 1 };
    const waited: number[] = [];
    await fadeOutVolume(audio, 1000, { steps: 4, wait: async (ms) => { waited.push(ms); } });

    expect(audio.volume).toBe(0);
    expect(waited).toEqual([250, 250, 250, 250]);
  });

  test("開始時のvolumeを基準に比率で下げる（1未満からのフェードも0で終わる）", async () => {
    const audio = { volume: 0.4 };
    const observed: number[] = [];
    await fadeOutVolume(audio, 100, {
      steps: 2,
      wait: async () => { observed.push(audio.volume); },
    });

    // waitが呼ばれた時点ではまだ前のステップのvolumeのまま（呼び出し直後に更新するため）。
    expect(observed).toEqual([0.4, 0.4 * fadeOutGain(0.5)]);
    expect(audio.volume).toBe(0);
  });

  test("durationMsが0以下の場合は待機せず即座に0にする", async () => {
    const audio = { volume: 1 };
    let waitCalled = false;
    await fadeOutVolume(audio, 0, { wait: async () => { waitCalled = true; } });

    expect(audio.volume).toBe(0);
    expect(waitCalled).toBe(false);
  });

  test("既にvolumeが0の場合は待機しない", async () => {
    const audio = { volume: 0 };
    let waitCalled = false;
    await fadeOutVolume(audio, 1000, { wait: async () => { waitCalled = true; } });

    expect(audio.volume).toBe(0);
    expect(waitCalled).toBe(false);
  });

  test("isCancelledがtrueを返した時点でvolumeの更新を止める（2026-09-08、Codexレビュー指摘：P1。フェード中に別のplay()が開始した場合、そちらのvolume制御を上書きしないため）", async () => {
    const audio = { volume: 1 };
    let step = 0;
    await fadeOutVolume(audio, 1000, {
      steps: 4,
      wait: async () => { step += 1; },
      isCancelled: () => step >= 2,
    });

    // 2ステップ目でキャンセルされるため、1ステップ目のvolume更新だけが反映され、
    // 2ステップ目以降のvolume更新は行われない。
    expect(audio.volume).toBe(fadeOutGain(0.25));
  });
});

describe("fadeInGain", () => {
  test("始点は厳密に0、終点は厳密に1で、範囲外はクランプし、単調に増加する", () => {
    expect(fadeInGain(0)).toBe(0);
    expect(fadeInGain(-1)).toBe(0);
    expect(fadeInGain(1)).toBe(1);
    expect(fadeInGain(2)).toBe(1);
    let prev = 0;
    for (let i = 1; i <= 20; i += 1) {
      const g = fadeInGain(i / 20);
      expect(g).toBeGreaterThan(prev);
      prev = g;
    }
  });

  test("両端でなだらか（立ち上がりが唐突でない）", () => {
    expect(fadeInGain(0.05)).toBeLessThan(0.01);
    expect(1 - fadeInGain(0.95)).toBeLessThan(0.01);
  });
});

describe("fadeInVolume", () => {
  test("0から目標のvolumeまで段階的に上げ、最後は目標値ちょうどになる", async () => {
    const audio = { volume: 0 };
    const observed: number[] = [];
    await fadeInVolume(audio, 0.6, 100, {
      steps: 4,
      wait: async () => { observed.push(audio.volume); },
    });

    expect(observed[0]).toBe(0);
    expect(observed.every((v, i) => i === 0 || v > observed[i - 1])).toBe(true);
    expect(audio.volume).toBeCloseTo(0.6, 10);
  });

  test("durationMsが0以下なら待機せず即座に目標値にする", async () => {
    const audio = { volume: 0 };
    let waitCalled = false;
    await fadeInVolume(audio, 0.5, 0, { wait: async () => { waitCalled = true; } });
    expect(audio.volume).toBe(0.5);
    expect(waitCalled).toBe(false);
  });

  test("isCancelledがtrueを返した時点でvolumeの更新を止める", async () => {
    const audio = { volume: 0 };
    let step = 0;
    await fadeInVolume(audio, 1, 1000, {
      steps: 4,
      wait: async () => { step += 1; },
      isCancelled: () => step >= 2,
    });
    expect(audio.volume).toBe(fadeInGain(0.25));
  });
});
