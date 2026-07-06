import type { Relic, Stats } from "../types";

function statUp(key: keyof Stats, amount: number) {
  return (stats: Stats): Stats => ({ ...stats, [key]: stats[key] + amount });
}

export const RELIC_POOL: Relic[] = [
  { id: "relic_hp", name: "古の心臓", description: "最大HP+15", apply: statUp("hp", 15) },
  { id: "relic_atk", name: "血の刃", description: "攻撃力+6", apply: statUp("atk", 6) },
  { id: "relic_def", name: "鋼の盾", description: "防御力+5", apply: statUp("def", 5) },
  { id: "relic_spd", name: "風の足輪", description: "速さ+6", apply: statUp("spd", 6) },
  { id: "relic_crit", name: "死神の鎌", description: "必殺+15", apply: statUp("crit", 15) },
];

export function getRelicById(id: string): Relic {
  const found = RELIC_POOL.find((r) => r.id === id);
  if (!found) throw new Error(`Unknown relic id: ${id}`);
  return found;
}

export function rollRelicChoices(count: number, rng: () => number): Relic[] {
  const shuffled = [...RELIC_POOL];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}
