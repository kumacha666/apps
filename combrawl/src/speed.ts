/**
 * エンドレスモードで戦闘が長引きすぎる問題への対策（2026-07-15追加）。
 * 高速/超速モードでは、アニメーション演出の各遅延（HIT_STAGGERやフェーズ間の待ち時間）を
 * この倍率で縮めることで、同じ演出コードのまま体感速度だけを変える。
 */
export type BattleSpeed = "normal" | "fast" | "ultra";

const SPEED_MULTIPLIERS: Record<BattleSpeed, number> = {
  normal: 1,
  fast: 0.35,
  ultra: 0.08,
};

/** どれだけ速度を上げても、setTimeoutが実質フリーズしないよう最小遅延を確保する */
const MIN_DELAY_MS = 4;

export function scaledDelay(baseMs: number, speed: BattleSpeed): number {
  return Math.max(MIN_DELAY_MS, Math.round(baseMs * SPEED_MULTIPLIERS[speed]));
}
