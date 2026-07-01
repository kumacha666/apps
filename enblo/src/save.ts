import type { Difficulty, SaveData, StatBoosts } from "./types";

const STORAGE_KEY = "enblo-save-v1";

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
  };
}

export function getStatBoosts(data: SaveData, classId: string): StatBoosts {
  return data.statBoosts[classId] ?? defaultStatBoosts();
}

export function loadSave(): SaveData {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return defaultSaveData();
  try {
    const parsed = JSON.parse(raw);
    const base = defaultSaveData();
    // 旧フォーマット（statBoostsがフラットなStatBoosts）からの移行
    const rawBoosts = parsed.statBoosts;
    const isOldFormat = rawBoosts && typeof rawBoosts.hp === "number";
    return {
      ...base,
      ...parsed,
      statBoosts: isOldFormat ? {} : (rawBoosts ?? {}),
    };
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
