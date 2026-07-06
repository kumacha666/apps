import { describe, it, expect } from "vitest";
import { UPGRADE_POOL, getUpgradeById, rollUpgradeChoices } from "./upgrades";

describe("getUpgradeById", () => {
  it("returns the matching upgrade", () => {
    const upgrade = getUpgradeById("hp_up_common");
    expect(upgrade.id).toBe("hp_up_common");
  });
  it("throws for unknown id", () => {
    expect(() => getUpgradeById("nonexistent")).toThrow();
  });
});

describe("rollUpgradeChoices", () => {
  it("returns the requested count from the pool", () => {
    const choices = rollUpgradeChoices(3, "warrior", () => 0.5);
    expect(choices.length).toBe(3);
  });
  it("returns unique upgrades", () => {
    const choices = rollUpgradeChoices(UPGRADE_POOL.length, "warrior", Math.random);
    const ids = new Set(choices.map((c) => c.id));
    expect(ids.size).toBe(UPGRADE_POOL.length);
  });
});

describe("upgrade apply functions", () => {
  it("increases the targeted stat without mutating the original", () => {
    const base = { hp: 20, atk: 5, def: 5, spd: 5, hit: 70, crit: 5 };
    const upgrade = getUpgradeById("atk_up_common");
    const result = upgrade.apply(base);
    expect(result.atk).toBe(7);
    expect(base.atk).toBe(5);
  });
});
