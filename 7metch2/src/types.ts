export interface Piece {
  color: number;
  special: SpecialType | null;
  countdown?: number;
  resonanceBonus?: number;
}

export type SpecialType = "bomb" | "line_h" | "line_v" | "line_d" | "rainbow" | "debris";

export interface CellPos {
  r: number;
  c: number;
}

export type UpgradeId =
  // Basic unlocks
  | "diagonal_move"
  | "match4_bomb"
  | "match_lt_bomb"
  | "match5_rainbow"
  | "match_2x2"
  // Range
  | "bomb_range_5"
  | "bomb_range_7"
  | "line_3"
  | "line_cross"
  | "line_x"
  | "rainbow_bombs"
  // Chain
  | "auto_detonate"
  | "spawn_special"
  | "chain_bombs"
  // Rule-breaking
  | "match2"
  | "infection"
  | "split"
  | "afterimage"
  | "timed_bombs"
  | "resonance"
  // Chaos
  | "blackhole"
  | "mirror"
  | "proliferation"
  | "meltdown";

export type Rarity = "common" | "rare" | "epic" | "legendary";

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  icon: string;
  desc: string;
  rarity: Rarity;
  requires?: UpgradeId[];
}

export interface RunState {
  stage: number;
  score: number;
  totalCleared: number;
  upgrades: UpgradeId[];
  resonanceCounts: number[];
}
