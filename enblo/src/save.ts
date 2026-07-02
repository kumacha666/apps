import type { Difficulty, SaveData, StatBoosts } from "./types";

const STORAGE_KEY_PREFIX = "enblo-save-v1-slot";
const SLOT_COUNT = 3;

export { SLOT_COUNT };

export function defaultStatBoosts(): StatBoosts {
  return { hp: 0, atk: 0, def: 0, spd: 0, hit: 0, crit: 0 };
}

function defaultSaveData(): SaveData {
  return {
    totalGold: 0,
    purchasedPermanentUpgrades: [],
    unlockedDifficulties: ["normal"],
    unlockedClasses: [],
    statBoosts: {},
    playCount: 0,
    bestFloor: 0,
  };
}

function storageKey(slot: number): string {
  return `${STORAGE_KEY_PREFIX}${slot}`;
}

export function getStatBoosts(data: SaveData, classId: string): StatBoosts {
  return data.statBoosts[classId] ?? defaultStatBoosts();
}

export function totalStatBoostCount(data: SaveData): number {
  return Object.values(data.statBoosts).reduce(
    (sum, boosts) => sum + (Object.values(boosts) as number[]).reduce((s, v) => s + v, 0),
    0
  );
}

export function loadSave(slot: number): SaveData {
  const raw = localStorage.getItem(storageKey(slot));
  if (!raw) return defaultSaveData();
  try {
    const parsed = JSON.parse(raw);
    const base = defaultSaveData();
    const rawBoosts = parsed.statBoosts;
    const isOldFormat = rawBoosts && typeof rawBoosts.hp === "number";
    return {
      ...base,
      ...parsed,
      statBoosts: isOldFormat ? {} : (rawBoosts ?? {}),
      playCount: parsed.playCount ?? 0,
      bestFloor: parsed.bestFloor ?? 0,
    };
  } catch {
    return defaultSaveData();
  }
}

export function writeSave(data: SaveData, slot: number): void {
  localStorage.setItem(storageKey(slot), JSON.stringify(data));
}

export function deleteSave(slot: number): void {
  localStorage.removeItem(storageKey(slot));
}

export function slotExists(slot: number): boolean {
  return localStorage.getItem(storageKey(slot)) !== null;
}

export function addGold(data: SaveData, amount: number): SaveData {
  return { ...data, totalGold: data.totalGold + amount };
}

export function recordRunEnd(data: SaveData, floorsCleared: number): SaveData {
  return {
    ...data,
    playCount: data.playCount + 1,
    bestFloor: Math.max(data.bestFloor, floorsCleared),
  };
}

export function purchasePermanentUpgrade(data: SaveData, upgradeId: string, cost: number): SaveData {
  if (data.totalGold < cost) return data;
  if (data.purchasedPermanentUpgrades.includes(upgradeId)) return data;
  return {
    ...data,
    totalGold: data.totalGold - cost,
    purchasedPermanentUpgrades: [...data.purchasedPermanentUpgrades, upgradeId],
  };
}

export function unlockDifficulty(data: SaveData, difficulty: Difficulty): SaveData {
  if (data.unlockedDifficulties.includes(difficulty)) return data;
  return { ...data, unlockedDifficulties: [...data.unlockedDifficulties, difficulty] };
}

export function unlockClass(data: SaveData, classId: string): SaveData {
  if (data.unlockedClasses.includes(classId)) return data;
  return { ...data, unlockedClasses: [...data.unlockedClasses, classId] };
}

export function purchaseStatBoost(data: SaveData, classId: string, stat: keyof StatBoosts, cost: number): SaveData {
  if (data.totalGold < cost) return data;
  const current = getStatBoosts(data, classId);
  return {
    ...data,
    totalGold: data.totalGold - cost,
    statBoosts: {
      ...data.statBoosts,
      [classId]: { ...current, [stat]: current[stat] + 1 },
    },
  };
}

export function resetStatBoosts(data: SaveData, classId: string, costPerBoost: number): SaveData {
  const boosts = getStatBoosts(data, classId);
  const totalBoosts = (Object.values(boosts) as number[]).reduce((s, v) => s + v, 0);
  if (totalBoosts === 0) return data;
  return {
    ...data,
    totalGold: data.totalGold + totalBoosts * costPerBoost,
    statBoosts: { ...data.statBoosts, [classId]: defaultStatBoosts() },
  };
}
