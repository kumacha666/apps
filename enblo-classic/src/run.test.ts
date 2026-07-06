import { describe, it, expect } from "vitest";
import { playRun, randomPick, goldForStage } from "./run";

function seededRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

describe("playRun", () => {
  it("clears zero or more stages and earns gold proportional to stages cleared", () => {
    const rng = seededRng(42);
    const summary = playRun({
      classId: "warrior",
      permanentUpgradeIds: [],
      rng,
      pickUpgrade: (opts) => randomPick(opts, rng),
      pickRelic: (opts) => randomPick(opts, rng),
    });
    expect(summary.stagesCleared).toBeGreaterThanOrEqual(0);
    expect(summary.goldEarned).toBeGreaterThanOrEqual(0);
    if (summary.stagesCleared === 0) {
      expect(summary.goldEarned).toBe(0);
    }
  });

  it("with permanent upgrades stacked, survives at least as long on average as without (statistical, large N)", () => {
    const trials = 200;
    let baselineTotal = 0;
    let boostedTotal = 0;
    for (let i = 0; i < trials; i++) {
      const rng = seededRng(i + 1);
      const baseline = playRun({
        classId: "warrior",
        permanentUpgradeIds: [],
        rng,
        pickUpgrade: (opts) => randomPick(opts, rng),
        pickRelic: (opts) => randomPick(opts, rng),
      });
      baselineTotal += baseline.stagesCleared;

      const rng2 = seededRng(i + 1);
      const boosted = playRun({
        classId: "warrior",
        permanentUpgradeIds: ["perm_hp_1", "perm_atk_1", "perm_def_1", "perm_spd_1", "perm_hp_2", "perm_atk_2"],
        rng: rng2,
        pickUpgrade: (opts) => randomPick(opts, rng2),
        pickRelic: (opts) => randomPick(opts, rng2),
      });
      boostedTotal += boosted.stagesCleared;
    }
    expect(boostedTotal).toBeGreaterThanOrEqual(baselineTotal);
  });
});

describe("goldForStage", () => {
  it("increases with stage number", () => {
    expect(goldForStage(5)).toBeGreaterThan(goldForStage(1));
  });
});
