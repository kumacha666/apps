import { describe, it, expect, beforeEach } from "vitest";
import {
  loadSave,
  writeSave,
  addGold,
  purchasePermanentUpgrade,
  unlockDifficulty,
  unlockClass,
  purchaseStatBoost,
  getStatBoosts,
  defaultStatBoosts,
} from "./save";

class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.store.set(key, value);
  }
  clear() {
    this.store.clear();
  }
}

beforeEach(() => {
  (globalThis as any).localStorage = new MemoryStorage();
});

describe("loadSave", () => {
  it("returns default data when nothing is stored", () => {
    const data = loadSave();
    expect(data.totalGold).toBe(0);
    expect(data.unlockedDifficulties).toEqual(["normal"]);
  });

  it("returns default data when stored JSON is corrupt", () => {
    localStorage.setItem("enblo-save-v1", "{not valid json");
    const data = loadSave();
    expect(data.totalGold).toBe(0);
  });

  it("round-trips data written via writeSave", () => {
    const data = addGold(loadSave(), 50);
    writeSave(data);
    const reloaded = loadSave();
    expect(reloaded.totalGold).toBe(50);
  });
});

describe("purchasePermanentUpgrade", () => {
  it("deducts gold and records the purchase when affordable", () => {
    const data = addGold(loadSave(), 100);
    const result = purchasePermanentUpgrade(data, "perm_hp_1", 20);
    expect(result.totalGold).toBe(80);
    expect(result.purchasedPermanentUpgrades).toContain("perm_hp_1");
  });

  it("does nothing when gold is insufficient", () => {
    const data = loadSave();
    const result = purchasePermanentUpgrade(data, "perm_hp_1", 20);
    expect(result).toEqual(data);
  });

  it("does not double-purchase the same upgrade", () => {
    let data = addGold(loadSave(), 100);
    data = purchasePermanentUpgrade(data, "perm_hp_1", 20);
    const result = purchasePermanentUpgrade(data, "perm_hp_1", 20);
    expect(result.totalGold).toBe(80);
    expect(result.purchasedPermanentUpgrades.length).toBe(1);
  });
});

describe("purchaseStatBoost", () => {
  it("deducts gold and increments the specified stat for the class", () => {
    const data = addGold(loadSave(), 200);
    const result = purchaseStatBoost(data, "warrior", "atk", 100);
    expect(result.totalGold).toBe(100);
    expect(getStatBoosts(result, "warrior").atk).toBe(1);
    expect(getStatBoosts(result, "warrior").hp).toBe(0);
  });

  it("keeps each class's boosts independent", () => {
    let data = addGold(loadSave(), 300);
    data = purchaseStatBoost(data, "warrior", "atk", 100);
    data = purchaseStatBoost(data, "archer", "spd", 100);
    expect(getStatBoosts(data, "warrior").atk).toBe(1);
    expect(getStatBoosts(data, "archer").spd).toBe(1);
    expect(getStatBoosts(data, "lancer")).toEqual(defaultStatBoosts());
  });

  it("does nothing when gold is insufficient", () => {
    const data = loadSave();
    const result = purchaseStatBoost(data, "warrior", "atk", 100);
    expect(result).toEqual(data);
  });

  it("migrates old flat statBoosts format to empty record on load", () => {
    localStorage.setItem("enblo-save-v1", JSON.stringify({
      totalGold: 50,
      statBoosts: { hp: 3, atk: 1, def: 0, spd: 0, hit: 0, crit: 0 },
    }));
    const data = loadSave();
    expect(data.statBoosts).toEqual({});
    expect(data.totalGold).toBe(50);
  });
});

describe("unlockDifficulty / unlockClass", () => {
  it("adds new entries without duplicating existing ones", () => {
    let data = loadSave();
    data = unlockDifficulty(data, "hard");
    data = unlockDifficulty(data, "hard");
    expect(data.unlockedDifficulties).toEqual(["normal", "hard"]);

    data = unlockClass(data, "swordmaster");
    data = unlockClass(data, "swordmaster");
    expect(data.unlockedClasses).toEqual(["swordmaster"]);
  });
});
