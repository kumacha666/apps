import type { Difficulty, SaveData } from "./types";

const STORAGE_KEY = "enblo-save-v1";

function defaultSaveData(): SaveData {
  return {
    totalGold: 0,
    purchasedPermanentUpgrades: [],
    unlockedDifficulties: ["normal"],
    unlockedClasses: [],
  };
}

export function loadSave(): SaveData {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return defaultSaveData();
  try {
    const parsed = JSON.parse(raw);
    return { ...defaultSaveData(), ...parsed };
  } catch {
    return defaultSaveData();
  }
}

export function writeSave(data: SaveData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function addGold(data: SaveData, amount: number): SaveData {
  return { ...data, totalGold: data.totalGold + amount };
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
