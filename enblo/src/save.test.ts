import { describe, it, expect, beforeEach } from "vitest";
import {
  loadSave,
  writeSave,
  addGold,
  purchasePermanentUpgrade,
  unlockDifficulty,
  unlockClass,
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
