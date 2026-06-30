import { describe, it, expect } from "vitest";
import { applyPermanentUpgrades, getPermanentUpgradeById } from "./permanentUpgrades";

describe("applyPermanentUpgrades", () => {
  it("applies all purchased upgrades cumulatively", () => {
    const base = { hp: 20, atk: 5, def: 5, spd: 5, hit: 70, crit: 5 };
    const result = applyPermanentUpgrades(base, ["perm_hp_1", "perm_atk_1"]);
    expect(result.hp).toBe(24);
    expect(result.atk).toBe(6);
  });

  it("ignores unknown ids without throwing", () => {
    const base = { hp: 20, atk: 5, def: 5, spd: 5, hit: 70, crit: 5 };
    const result = applyPermanentUpgrades(base, ["does_not_exist"]);
    expect(result).toEqual(base);
  });
});

describe("getPermanentUpgradeById", () => {
  it("throws for unknown id", () => {
    expect(() => getPermanentUpgradeById("nope")).toThrow();
  });
});
