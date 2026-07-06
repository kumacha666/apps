import { describe, it, expect } from "vitest";
import { generateEnemyStats, isBossStage } from "./enemies";

describe("isBossStage", () => {
  it("flags every 5th stage as a boss", () => {
    expect(isBossStage(5)).toBe(true);
    expect(isBossStage(10)).toBe(true);
    expect(isBossStage(1)).toBe(false);
    expect(isBossStage(4)).toBe(false);
  });
});

describe("generateEnemyStats", () => {
  it("scales stats upward with stage number", () => {
    const early = generateEnemyStats(1);
    const later = generateEnemyStats(20);
    expect(later.hp).toBeGreaterThan(early.hp);
    expect(later.atk).toBeGreaterThan(early.atk);
  });

  it("boosts boss stages above the non-boss baseline", () => {
    const normalStage = generateEnemyStats(4);
    const bossStage = generateEnemyStats(5);
    expect(bossStage.hp).toBeGreaterThan(normalStage.hp);
  });

  it("clamps hit and crit within sane bounds", () => {
    const farStage = generateEnemyStats(500);
    expect(farStage.hit).toBeLessThanOrEqual(95);
    expect(farStage.crit).toBeLessThanOrEqual(40);
  });
});
