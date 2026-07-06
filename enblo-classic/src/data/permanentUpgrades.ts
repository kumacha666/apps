import type { PermanentUpgrade, StatBoosts, Stats } from "../types";

function statUp(key: keyof Stats, amount: number) {
  return (stats: Stats): Stats => ({ ...stats, [key]: stats[key] + amount });
}

export const PERMANENT_UPGRADE_POOL: PermanentUpgrade[] = [
  { id: "perm_hp_1", name: "強靭な血統 I", description: "初期HP+4", cost: 20, apply: statUp("hp", 4) },
  { id: "perm_atk_1", name: "鋭き血統 I", description: "初期攻撃力+1", cost: 25, apply: statUp("atk", 1) },
  { id: "perm_def_1", name: "頑健な血統 I", description: "初期防御力+1", cost: 25, apply: statUp("def", 1) },
  { id: "perm_spd_1", name: "迅速な血統 I", description: "初期速さ+1", cost: 25, apply: statUp("spd", 1) },
  { id: "perm_hit_1", name: "確かな血統 I", description: "初期命中+5", cost: 20, apply: statUp("hit", 5) },
  { id: "perm_crit_1", name: "凶星の血統 I", description: "初期必殺+3", cost: 30, apply: statUp("crit", 3) },
  { id: "perm_hp_2", name: "強靭な血統 II", description: "初期HP+8", cost: 60, apply: statUp("hp", 8) },
  { id: "perm_atk_2", name: "鋭き血統 II", description: "初期攻撃力+2", cost: 70, apply: statUp("atk", 2) },
];

export function getPermanentUpgradeById(id: string): PermanentUpgrade {
  const found = PERMANENT_UPGRADE_POOL.find((u) => u.id === id);
  if (!found) throw new Error(`Unknown permanent upgrade id: ${id}`);
  return found;
}

export function applyPermanentUpgrades(stats: Stats, purchasedIds: string[]): Stats {
  return purchasedIds.reduce((acc, id) => {
    const upgrade = PERMANENT_UPGRADE_POOL.find((u) => u.id === id);
    return upgrade ? upgrade.apply(acc) : acc;
  }, stats);
}

export const STAT_BOOST_COST = 100;

export const STAT_BOOST_LABELS: Record<keyof StatBoosts, string> = {
  hp: "HP",
  atk: "攻撃力",
  def: "防御力",
  spd: "速さ",
  hit: "命中",
  crit: "必殺",
};

export function applyStatBoosts(stats: Stats, boosts: StatBoosts): Stats {
  return {
    hp: stats.hp + boosts.hp,
    atk: stats.atk + boosts.atk,
    def: stats.def + boosts.def,
    spd: stats.spd + boosts.spd,
    hit: stats.hit + boosts.hit,
    crit: stats.crit + boosts.crit,
  };
}
