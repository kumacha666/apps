/**
 * ヒット減衰: 連撃の1攻撃アクション内での単発バランス調整。
 * §2.1で廃止したコンボ倍率（ラウンド全体にまたがる演出用スタッツ）とは独立した仕組み。
 */
export function hitDampen(hitIndex: number): number {
  const FLOOR = 0.5;
  const STEP = 0.15;
  return Math.max(FLOOR, 1 - hitIndex * STEP);
}

export function aoeMultFor(level: number): number {
  if (!level || level <= 0) return 1;
  return Math.min(1.5, 0.65 + 0.15 * level);
}

export function retaliateMultFor(level: number): number {
  if (!level || level <= 0) return 0;
  return Math.min(3, 1 + 0.35 * (level - 1));
}

/**
 * 単発のダメージ計算（コンボ倍率は乗せない。2026-07-15の設計転換で
 * コンボはダメージ計算から完全に外し、演出専用スタッツに格下げした）。
 */
export function computeHitDamage(params: {
  atk: number;
  dmgOutMult: number;
  dmgTakenMult: number;
  hitIndex: number;
  aoeMult: number;
  isCrit: boolean;
  critMult: number;
}): number {
  let dmg = params.atk * params.dmgOutMult * params.dmgTakenMult * hitDampen(params.hitIndex) * params.aoeMult;
  if (params.isCrit) dmg *= params.critMult;
  return Math.max(0, Math.round(dmg));
}
