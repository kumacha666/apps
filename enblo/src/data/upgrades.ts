import type { Stats, UpgradeOption } from "../types";

function statUp(key: keyof Stats, amount: number) {
  return (stats: Stats): Stats => ({ ...stats, [key]: stats[key] + amount });
}

export const UPGRADE_POOL: UpgradeOption[] = [
  { id: "hp_up_common", name: "体力強化", description: "最大HP+6", rarity: "common", apply: statUp("hp", 6) },
  { id: "atk_up_common", name: "攻撃強化", description: "攻撃力+2", rarity: "common", apply: statUp("atk", 2) },
  { id: "def_up_common", name: "防御強化", description: "防御力+2", rarity: "common", apply: statUp("def", 2) },
  { id: "spd_up_common", name: "速さ強化", description: "速さ+2", rarity: "common", apply: statUp("spd", 2) },
  { id: "hit_up_common", name: "命中強化", description: "命中+10", rarity: "common", apply: statUp("hit", 10) },
  { id: "crit_up_rare", name: "会心強化", description: "必殺+8", rarity: "rare", apply: statUp("crit", 8) },
  { id: "atk_up_rare", name: "猛撃", description: "攻撃力+4", rarity: "rare", apply: statUp("atk", 4) },
  { id: "spd_up_rare", name: "俊足", description: "速さ+4", rarity: "rare", apply: statUp("spd", 4) },
  { id: "hp_up_rare", name: "不屈の体", description: "最大HP+12", rarity: "rare", apply: statUp("hp", 12) },
];

export function getUpgradeById(id: string): UpgradeOption {
  const found = UPGRADE_POOL.find((u) => u.id === id);
  if (!found) throw new Error(`Unknown upgrade id: ${id}`);
  return found;
}

export function rollUpgradeChoices(
  count: number,
  classId: string,
  rng: () => number
): UpgradeOption[] {
  const pool = UPGRADE_POOL.filter(
    (u) => !u.classRestriction || u.classRestriction.includes(classId)
  );
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}
