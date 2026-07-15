export type UnitSide = "player" | "enemy";

export interface Unit {
  id: string;
  side: UnitSide;
  hp: number;
  maxHp: number;
  atk: number;
  critChance: number;
  critMult: number;
  dmgOutMult: number;
  dmgTakenMult: number;
  attackCount: number;
  aoeLevel: number;
  retaliateLevel: number;
  tauntLevel: number;
  alive: boolean;
}

export interface RunStats {
  maxCombo: number;
  maxTurnDamage: number;
  maxTurnKills: number;
}

export interface GameState {
  round: number;
  playerUnits: Unit[];
  enemyUnits: Unit[];
  deck: Card[];
  combo: number;
  stats: RunStats;
}

export interface CardApplyResult {
  message: string;
}

export interface Card {
  id: string;
  name: string;
  desc: string;
  singleTarget?: boolean;
  apply: (state: GameState, chosenUnit?: Unit | null) => CardApplyResult;
}

/** 1回の攻撃アクション（連撃・全体攻撃を含む一連のヒット）で発生した1ヒット分の結果 */
export interface HitResult {
  attacker: Unit;
  target: Unit;
  damage: number;
  isCrit: boolean;
  wasKilled: boolean;
  hitIndex: number;
  /** このヒット直後の対象のHP（段階的なアニメーション再生用） */
  hpAfter: number;
}
