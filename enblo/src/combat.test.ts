import { describe, it, expect } from "vitest";
import { clampHit, clampCrit, computeDamage, simulateCombat } from "./combat";
import type { CombatUnit } from "./types";

describe("clampHit", () => {
  it("clamps below minimum to MIN_HIT", () => {
    expect(clampHit(-10)).toBe(5);
  });
  it("clamps above maximum to 100", () => {
    expect(clampHit(150)).toBe(100);
  });
  it("passes through values within range", () => {
    expect(clampHit(50)).toBe(50);
  });
});

describe("clampCrit", () => {
  it("clamps negative to 0", () => {
    expect(clampCrit(-5)).toBe(0);
  });
  it("clamps above 100 to 100", () => {
    expect(clampCrit(200)).toBe(100);
  });
});

describe("computeDamage", () => {
  it("returns at least 1 even if def exceeds atk", () => {
    expect(computeDamage(3, 10, false)).toBe(1);
  });
  it("returns atk - def for non-crit", () => {
    expect(computeDamage(10, 4, false)).toBe(6);
  });
  it("triples damage on crit", () => {
    expect(computeDamage(10, 4, true)).toBe(18);
  });
});

function makeUnit(name: string, overrides: Partial<CombatUnit["stats"]> = {}): CombatUnit {
  return {
    classId: "test",
    name,
    stats: { hp: 20, atk: 8, def: 4, spd: 5, hit: 100, crit: 0, ...overrides },
  };
}

describe("simulateCombat", () => {
  it("always picks a winner and terminates", () => {
    const player = makeUnit("Player");
    const enemy = makeUnit("Enemy");
    const result = simulateCombat(player, enemy, () => 0.4);
    expect(["player", "enemy"]).toContain(result.winner);
    expect(result.log.length).toBeGreaterThan(0);
  });

  it("an overwhelmingly stronger player always wins deterministically with 100% hit, 0% crit", () => {
    const player = makeUnit("Player", { atk: 100, hp: 100, spd: 10 });
    const enemy = makeUnit("Enemy", { atk: 1, def: 0, hp: 5, spd: 1 });
    const result = simulateCombat(player, enemy, () => 0.5);
    expect(result.winner).toBe("player");
  });

  it("never produces negative HP in the log", () => {
    const player = makeUnit("Player");
    const enemy = makeUnit("Enemy");
    const result = simulateCombat(player, enemy, () => 0.1);
    for (const event of result.log) {
      expect(event.defenderHpAfter).toBeGreaterThanOrEqual(0);
    }
  });

  it("terminates even with 0% hit chance on both sides by hitting the round cap", () => {
    const player = makeUnit("Player", { hit: 0 });
    const enemy = makeUnit("Enemy", { hit: 0 });
    const result = simulateCombat(player, enemy, () => 0.99);
    // MIN_HIT clamp guarantees some chance, but with rng always 0.99 (>=any clamped hit%), no hits land.
    // Timeout (MAX_ROUNDS) with both sides alive counts as draw.
    expect(result.log.length).toBeGreaterThan(0);
    expect(result.winner).toBe("draw");
  });
});
