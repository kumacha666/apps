import type { ClassDef } from "../types";

export const CLASSES: ClassDef[] = [
  {
    id: "warrior",
    name: "戦士",
    tier: "basic",
    weaponType: "sword",
    baseStats: { hp: 22, atk: 7, def: 5, spd: 6, hit: 75, crit: 5 },
  },
  {
    id: "lancer",
    name: "槍兵",
    tier: "basic",
    weaponType: "lance",
    baseStats: { hp: 24, atk: 8, def: 6, spd: 4, hit: 70, crit: 3 },
  },
  {
    id: "archer",
    name: "弓兵",
    tier: "basic",
    weaponType: "bow",
    baseStats: { hp: 18, atk: 6, def: 3, spd: 8, hit: 80, crit: 8 },
  },
  {
    id: "mage",
    name: "魔道士",
    tier: "basic",
    weaponType: "tome",
    baseStats: { hp: 16, atk: 9, def: 2, spd: 7, hit: 70, crit: 10 },
  },
  {
    id: "swordmaster",
    name: "剣聖",
    tier: "advanced",
    weaponType: "sword",
    baseStats: { hp: 24, atk: 9, def: 6, spd: 10, hit: 85, crit: 15 },
  },
  {
    id: "general",
    name: "重騎士",
    tier: "advanced",
    weaponType: "lance",
    baseStats: { hp: 30, atk: 10, def: 10, spd: 4, hit: 70, crit: 3 },
  },
  {
    id: "sniper",
    name: "狙撃手",
    tier: "advanced",
    weaponType: "bow",
    baseStats: { hp: 20, atk: 9, def: 4, spd: 10, hit: 90, crit: 12 },
  },
  {
    id: "sage",
    name: "賢者",
    tier: "advanced",
    weaponType: "tome",
    baseStats: { hp: 20, atk: 12, def: 4, spd: 9, hit: 75, crit: 14 },
  },
];

export function getClassById(id: string): ClassDef {
  const found = CLASSES.find((c) => c.id === id);
  if (!found) throw new Error(`Unknown class id: ${id}`);
  return found;
}

export function basicClasses(): ClassDef[] {
  return CLASSES.filter((c) => c.tier === "basic");
}

export function advancedClasses(): ClassDef[] {
  return CLASSES.filter((c) => c.tier === "advanced");
}
