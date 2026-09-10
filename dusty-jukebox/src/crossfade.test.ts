import { describe, expect, it, vi } from "vitest";
import { crossfadeVolumes, runCrossfade, shouldStartCrossfade } from "./crossfade";

describe("crossfadeVolumes", () => {
  it("進行度に応じて退場側/入場側の音量を線形に計算する", () => {
    expect(crossfadeVolumes(0)).toEqual({ outgoing: 1, incoming: 0 });
    expect(crossfadeVolumes(0.5)).toEqual({ outgoing: 0.5, incoming: 0.5 });
    expect(crossfadeVolumes(1)).toEqual({ outgoing: 0, incoming: 1 });
  });

  it("範囲外の進行度は0〜1へクランプする", () => {
    expect(crossfadeVolumes(-1)).toEqual({ outgoing: 1, incoming: 0 });
    expect(crossfadeVolumes(2)).toEqual({ outgoing: 0, incoming: 1 });
  });
});

describe("runCrossfade", () => {
  it("段階的に退場側を1→0、入場側を0→1へランプする", async () => {
    const outgoing = { volume: 1 };
    const incoming = { volume: 0 };
    const wait = vi.fn().mockResolvedValue(undefined);
    await runCrossfade(outgoing, incoming, 300, { steps: 3, wait });
    expect(wait).toHaveBeenCalledTimes(3);
    expect(outgoing.volume).toBe(0);
    expect(incoming.volume).toBe(1);
  });

  it("durationMsが0以下なら即座に完了値へ設定する", async () => {
    const outgoing = { volume: 1 };
    const incoming = { volume: 0 };
    await runCrossfade(outgoing, incoming, 0);
    expect(outgoing.volume).toBe(0);
    expect(incoming.volume).toBe(1);
  });

  it("isCancelledがtrueを返すと以後のvolume更新を中断する", async () => {
    const outgoing = { volume: 1 };
    const incoming = { volume: 0 };
    const wait = vi.fn().mockResolvedValue(undefined);
    let cancelled = false;
    await runCrossfade(outgoing, incoming, 400, {
      steps: 4,
      wait,
      isCancelled: () => cancelled,
    });
    // 全ステップ完了しているはず（キャンセルしていないため）。
    expect(outgoing.volume).toBe(0);
    // 途中でキャンセルした場合は、それ以降volumeが更新されないことを別途検証する。
    cancelled = false;
    const outgoing2 = { volume: 1 };
    const incoming2 = { volume: 0 };
    let callCount = 0;
    const cancelAfterTwoSteps = () => {
      callCount += 1;
      return callCount > 2;
    };
    await runCrossfade(outgoing2, incoming2, 400, { steps: 4, wait, isCancelled: cancelAfterTwoSteps });
    // 2ステップ分（0.5進行度）まで反映され、以降は更新されないため0.5のまま。
    expect(outgoing2.volume).toBe(0.5);
    expect(incoming2.volume).toBe(0.5);
  });

  // 2026-09-10、Codexレビュー指摘：P2。次の曲（incoming）自体がクロスフェード長より短く、
  // ランプ完了前に自然終了した場合、isCancelledと違い「完了扱い」として最終値まで進めてから
  // 終了する必要がある（isCancelledは中間値のまま放置するため、入場側が無音のまま残ってしまう）。
  it("shouldFinishEarlyがtrueを返すと直ちに完了値へ設定して終了する", async () => {
    const outgoing = { volume: 1 };
    const incoming = { volume: 0 };
    const wait = vi.fn().mockResolvedValue(undefined);
    let callCount = 0;
    const finishAfterTwoSteps = () => {
      callCount += 1;
      return callCount > 2;
    };
    await runCrossfade(outgoing, incoming, 400, { steps: 4, wait, shouldFinishEarly: finishAfterTwoSteps });
    // isCancelledとは異なり、中間値（0.5）ではなく完了値まで進んでいる。
    expect(outgoing.volume).toBe(0);
    expect(incoming.volume).toBe(1);
    // 3ステップ目でshouldFinishEarlyがtrueになり終了するため、4ステップ目のwaitは呼ばれない。
    expect(wait).toHaveBeenCalledTimes(3);
  });
});

describe("shouldStartCrossfade", () => {
  const baseParams = {
    crossfadeEnabled: true,
    isCrossfading: false,
    hasNextSong: true,
    duration: 180,
    currentTime: 178,
    crossfadeDurationMs: 3000,
    audioPaused: false,
    manualTransitionInFlight: false,
  };

  it("残り時間がクロスフェード長以下ならtrue", () => {
    expect(shouldStartCrossfade(baseParams)).toBe(true);
  });

  it("残り時間がクロスフェード長より長ければfalse", () => {
    expect(shouldStartCrossfade({ ...baseParams, currentTime: 100 })).toBe(false);
  });

  it("クロスフェードが無効ならfalse", () => {
    expect(shouldStartCrossfade({ ...baseParams, crossfadeEnabled: false })).toBe(false);
  });

  it("既にクロスフェード中ならfalse（多重起動防止）", () => {
    expect(shouldStartCrossfade({ ...baseParams, isCrossfading: true })).toBe(false);
  });

  it("次の曲が無ければfalse", () => {
    expect(shouldStartCrossfade({ ...baseParams, hasNextSong: false })).toBe(false);
  });

  it("durationがNaN/Infinity/0以下（メタデータ未確定）ならfalse", () => {
    expect(shouldStartCrossfade({ ...baseParams, duration: NaN })).toBe(false);
    expect(shouldStartCrossfade({ ...baseParams, duration: Infinity })).toBe(false);
    expect(shouldStartCrossfade({ ...baseParams, duration: 0 })).toBe(false);
  });

  it("既に曲の末尾を過ぎている（残り時間が0以下）場合はfalse", () => {
    expect(shouldStartCrossfade({ ...baseParams, currentTime: 181 })).toBe(false);
  });

  it("主audio要素が一時停止中ならfalse（2026-09-10、Codexレビュー指摘：P1）", () => {
    expect(shouldStartCrossfade({ ...baseParams, audioPaused: true })).toBe(false);
  });

  it("明示的な手動遷移（フェード待機中を含む）が進行中ならfalse（2026-09-10、ChatGPTレビュー指摘：P1）", () => {
    expect(shouldStartCrossfade({ ...baseParams, manualTransitionInFlight: true })).toBe(false);
  });
});
