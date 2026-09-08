import { describe, expect, test } from "vitest";
import { fadeOutVolume } from "./fade";

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
    expect(observed).toEqual([0.4, 0.2]);
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
});
