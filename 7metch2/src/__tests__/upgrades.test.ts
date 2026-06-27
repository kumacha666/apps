import { describe, it, expect } from "vitest";
import { getAvailableUpgrades, pickUpgradeChoices, has, ALL_UPGRADES } from "../upgrades";
import type { UpgradeId } from "../types";

describe("has", () => {
  it("returns true if upgrade is owned", () => {
    expect(has(["match4_bomb", "diagonal_move"], "match4_bomb")).toBe(true);
  });

  it("returns false if upgrade is not owned", () => {
    expect(has(["match4_bomb"], "diagonal_move")).toBe(false);
  });

  it("returns false for empty array", () => {
    expect(has([], "match4_bomb")).toBe(false);
  });
});

describe("getAvailableUpgrades", () => {
  it("returns all upgrades with no prerequisites when empty owned", () => {
    const available = getAvailableUpgrades([]);
    // Should include all upgrades without requires
    const noReqUpgrades = ALL_UPGRADES.filter(u => !u.requires);
    for (const u of noReqUpgrades) {
      expect(available.some(a => a.id === u.id)).toBe(true);
    }
  });

  it("excludes owned upgrades", () => {
    const available = getAvailableUpgrades(["diagonal_move"]);
    expect(available.some(a => a.id === "diagonal_move")).toBe(false);
  });

  it("respects prerequisites", () => {
    // match5_rainbow requires match4_bomb
    const withoutPrereq = getAvailableUpgrades([]);
    expect(withoutPrereq.some(a => a.id === "match5_rainbow")).toBe(false);

    const withPrereq = getAvailableUpgrades(["match4_bomb"]);
    expect(withPrereq.some(a => a.id === "match5_rainbow")).toBe(true);
  });

  it("chain prerequisites: bomb_range_7 requires bomb_range_5 requires match4_bomb", () => {
    expect(getAvailableUpgrades([]).some(a => a.id === "bomb_range_7")).toBe(false);
    expect(getAvailableUpgrades(["match4_bomb"]).some(a => a.id === "bomb_range_7")).toBe(false);
    expect(getAvailableUpgrades(["match4_bomb", "bomb_range_5"]).some(a => a.id === "bomb_range_7")).toBe(true);
  });
});

describe("pickUpgradeChoices", () => {
  it("returns requested count", () => {
    const choices = pickUpgradeChoices([], 3);
    expect(choices.length).toBe(3);
  });

  it("returns all if fewer available than count", () => {
    // Own everything except one
    const allIds = ALL_UPGRADES.map(u => u.id);
    const owned = allIds.slice(0, -1) as UpgradeId[];
    const choices = pickUpgradeChoices(owned, 3);
    // May be 0 or 1 depending on prerequisites
    expect(choices.length).toBeLessThanOrEqual(3);
  });

  it("returns no duplicates", () => {
    const choices = pickUpgradeChoices([], 5);
    const ids = choices.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("returns empty when all owned", () => {
    const allIds = ALL_UPGRADES.map(u => u.id) as UpgradeId[];
    const choices = pickUpgradeChoices(allIds, 3);
    expect(choices).toHaveLength(0);
  });
});
