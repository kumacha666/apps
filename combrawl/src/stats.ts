import type { HitResult, RunStats } from "./types";

export const COMBO_GAIN_PER_HIT = 0.45;
export const COMBO_DECAY_PER_ENEMY_PHASE = 0.15;

export function initialStats(): RunStats {
  return { maxCombo: 0, maxTurnDamage: 0, maxTurnKills: 0 };
}

/**
 * コンボは2026-07-15の設計転換でダメージ計算から完全に外し、
 * 戦闘の見せ場を数字で見せる演出専用スタッツにした。
 * 1発目限定ではなく、連撃・反撃・全体攻撃を含む全てのヒットで加算する
 * （AoEで複数体に同時ヒットした場合は、命中した対象の数だけ加算する）。
 */
export function applyComboGain(
  combo: number,
  hitCount: number,
  maxCombo: number,
  comboGainBonus = 0
): { combo: number; maxCombo: number } {
  let nextCombo = combo;
  let nextMax = maxCombo;
  for (let i = 0; i < hitCount; i++) {
    nextCombo += COMBO_GAIN_PER_HIT + comboGainBonus;
    nextMax = Math.max(nextMax, nextCombo);
  }
  return { combo: nextCombo, maxCombo: nextMax };
}

export function applyComboDecay(combo: number, comboDecayBonus = 0): number {
  return Math.max(1, combo - (COMBO_DECAY_PER_ENEMY_PHASE - comboDecayBonus));
}

export function summarizeTurn(hits: HitResult[]): { totalDamage: number; kills: number } {
  return {
    totalDamage: hits.reduce((sum, h) => sum + h.damage, 0),
    kills: hits.filter((h) => h.wasKilled).length,
  };
}

export function applyTurnStats(stats: RunStats, turn: { totalDamage: number; kills: number }): RunStats {
  return {
    ...stats,
    maxTurnDamage: Math.max(stats.maxTurnDamage, turn.totalDamage),
    maxTurnKills: Math.max(stats.maxTurnKills, turn.kills),
  };
}
