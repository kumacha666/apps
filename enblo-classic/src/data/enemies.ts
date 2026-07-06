import type { Stats } from "../types";

const ENEMY_BASE: Stats = { hp: 20, atk: 7, def: 5, spd: 6, hit: 75, crit: 7 };

const BOSS_INTERVAL = 5;

export function isBossStage(stageNumber: number): boolean {
  return stageNumber % BOSS_INTERVAL === 0;
}

export function generateEnemyStats(stageNumber: number): Stats {
  const progress = stageNumber - 1;
  const stats: Stats = {
    hp: ENEMY_BASE.hp + Math.floor(progress * 2.2),
    atk: ENEMY_BASE.atk + Math.floor(progress * 0.8),
    def: ENEMY_BASE.def + Math.floor(progress * 0.6),
    spd: ENEMY_BASE.spd + Math.floor(progress * 0.5),
    hit: Math.min(95, ENEMY_BASE.hit + Math.floor(progress * 1.0)),
    crit: Math.min(40, ENEMY_BASE.crit + Math.floor(progress * 0.5)),
  };

  if (isBossStage(stageNumber)) {
    stats.hp = Math.floor(stats.hp * 1.8);
    stats.atk = Math.floor(stats.atk * 1.3);
    stats.def = Math.floor(stats.def * 1.2);
  }

  return stats;
}

export function enemyName(stageNumber: number): string {
  return isBossStage(stageNumber) ? `第${stageNumber}層 ボス` : `第${stageNumber}層の敵`;
}
