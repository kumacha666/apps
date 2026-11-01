import { describe, expect, it } from "vitest";
import { MARQUEE_PAUSE_MS, MARQUEE_SPEED_PX_PER_SEC, planMarquee } from "./marquee";

describe("planMarquee", () => {
  it("収まっている（はみ出しが無い・ごくわずか）なら流さない", () => {
    expect(planMarquee(200, 200)).toBeNull();
    expect(planMarquee(150, 200)).toBeNull();
    expect(planMarquee(202, 200)).toBeNull(); // 2px以下の端数は流さない
  });

  it("まだ幅が無い（描かれていない・見えていない）なら流さない", () => {
    expect(planMarquee(300, 0)).toBeNull();
    expect(planMarquee(NaN, 100)).toBeNull();
  });

  it("はみ出した分だけ、止まる→流す→止まるの順に動かす", () => {
    const plan = planMarquee(260, 200)!;
    const travelMs = (60 / MARQUEE_SPEED_PX_PER_SEC) * 1000;
    expect(plan.durationMs).toBeCloseTo(MARQUEE_PAUSE_MS * 2 + travelMs);
    expect(plan.keyframes.map((k) => k.translateX)).toEqual([0, 0, -60, -60]);
    const offsets = plan.keyframes.map((k) => k.offset);
    expect(offsets[0]).toBe(0);
    expect(offsets[1]).toBeCloseTo(MARQUEE_PAUSE_MS / plan.durationMs);
    expect(offsets[2]).toBeCloseTo((MARQUEE_PAUSE_MS + travelMs) / plan.durationMs);
    expect(offsets[3]).toBe(1);
    // 位置は前へ進むだけ（Web Animationsはoffsetが昇順でないと例外を投げる）
    for (let i = 1; i < offsets.length; i += 1) expect(offsets[i]).toBeGreaterThanOrEqual(offsets[i - 1]);
  });

  it("はみ出しの端数は切り上げ、最後まで見えるようにする", () => {
    expect(planMarquee(250.4, 200)!.keyframes[2].translateX).toBe(-51);
  });

  it("長いほど、流す時間も長くなる（速さは一定）", () => {
    expect(planMarquee(500, 200)!.durationMs).toBeGreaterThan(planMarquee(260, 200)!.durationMs);
  });
});
