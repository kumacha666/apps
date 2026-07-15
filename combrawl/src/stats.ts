import type { HitResult, RunStats } from "./types";

export const SCORE_PER_DAMAGE = 1;
export const SCORE_PER_KILL = 25;

export function initialStats(): RunStats {
  return { maxTurnDamage: 0, maxTurnKills: 0 };
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

/**
 * SCOREはプレイヤーが与えたダメージ・撃破の累積値（2026-07-16、コンボ演出スタッツを廃止し置き換え）。
 * ダメージ量をそのまま加算し、撃破ボーナスを上乗せする。1ラン中はリセットされない
 * （ラウンドをまたいで加算され続け、「最初から」した時だけ0に戻る）。
 */
export function applyScoreGain(score: number, hits: HitResult[]): number {
  const turn = summarizeTurn(hits);
  return score + turn.totalDamage * SCORE_PER_DAMAGE + turn.kills * SCORE_PER_KILL;
}
