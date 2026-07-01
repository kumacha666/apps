export interface Stats {
  hp: number;
  atk: number;
  def: number;
  spd: number;
  hit: number;
  crit: number;
}

export type WeaponType = "sword" | "lance" | "bow" | "tome";

export type ClassTier = "basic" | "advanced";

export interface ClassDef {
  id: string;
  name: string;
  tier: ClassTier;
  weaponType: WeaponType;
  baseStats: Stats;
}

export interface CombatUnit {
  classId: string;
  name: string;
  stats: Stats;
}

export type UpgradeRarity = "common" | "rare";

export interface UpgradeOption {
  id: string;
  name: string;
  description: string;
  rarity: UpgradeRarity;
  classRestriction?: string[];
  apply: (stats: Stats) => Stats;
}

export interface Relic {
  id: string;
  name: string;
  description: string;
  apply: (stats: Stats) => Stats;
}

export interface PermanentUpgrade {
  id: string;
  name: string;
  description: string;
  cost: number;
  apply: (stats: Stats) => Stats;
}

export type Difficulty = "normal" | "hard";

export interface StatBoosts {
  hp: number;
  atk: number;
  def: number;
  spd: number;
  hit: number;
  crit: number;
}

export interface SaveData {
  totalGold: number;
  purchasedPermanentUpgrades: string[];
  unlockedDifficulties: Difficulty[];
  unlockedClasses: string[];
  statBoosts: StatBoosts;
}

export interface AttackEvent {
  attackerName: string;
  hit: boolean;
  crit: boolean;
  damage: number;
  defenderHpAfter: number;
}

export interface CombatResult {
  winner: "player" | "enemy";
  log: AttackEvent[];
}
