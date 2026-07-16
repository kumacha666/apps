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
 * ヒット群をswingId（1回の攻撃アクション）ごとにグループ化してから、それぞれを別々の
 * 「1ターン」としてapplyTurnStatsに反映する。反撃フェーズは、同じ反撃持ちユニットが
 * 複数回に分けて反撃した場合など、複数の別々の攻撃アクションが1つの配列に混在しうるため、
 * hits全体をまとめて1回のsummarizeTurnにかけると、実際には無かった1アクションぶんの
 * 合計ダメージ・撃破数として水増しされてしまう（2026-07-15、Codexレビュー指摘）。
 * damageRecordUpdated/killsRecordUpdatedは、いずれかのswingでmaxTurnDamage/maxTurnKillsが
 * それぞれ更新されたかを表す（2026-07-16、ユーザー報告：どちらが更新されたか分からないバナー演出は
 * 文字がユニットと重なり読めなかったため、HUDの該当数値だけを光らせる演出に変更する際に必要になった）。
 */
export function applyHitsBySwing(
  stats: RunStats,
  hits: HitResult[]
): { stats: RunStats; damageRecordUpdated: boolean; killsRecordUpdated: boolean } {
  const swingGroups = new Map<number | undefined, HitResult[]>();
  for (const hit of hits) {
    const group = swingGroups.get(hit.swingId);
    if (group) group.push(hit);
    else swingGroups.set(hit.swingId, [hit]);
  }

  let nextStats = stats;
  let damageRecordUpdated = false;
  let killsRecordUpdated = false;
  for (const swingHits of swingGroups.values()) {
    const turn = summarizeTurn(swingHits);
    const prevStats = nextStats;
    nextStats = applyTurnStats(nextStats, turn);
    if (nextStats.maxTurnDamage > prevStats.maxTurnDamage) damageRecordUpdated = true;
    if (nextStats.maxTurnKills > prevStats.maxTurnKills) killsRecordUpdated = true;
  }
  return { stats: nextStats, damageRecordUpdated, killsRecordUpdated };
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
