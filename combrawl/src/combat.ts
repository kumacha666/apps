/** 硬質化のDEF軽減式の基準値（暫定値、シミュレーションで調整予定） */
export const BASE_DEF = 40;

/** DEFから被ダメ倍率を導出する。defが変わる箇所（硬質化・増援・合体・分裂）は必ずこの式で
 * dmgTakenMultを再計算すること（挑発から完全に切り離された、DEF専属の式） */
export function dmgTakenMultForDef(def: number): number {
  return BASE_DEF / (BASE_DEF + Math.max(0, def));
}

/** ヒット減衰: 連撃の1攻撃アクション内での単発バランス調整。 */
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
