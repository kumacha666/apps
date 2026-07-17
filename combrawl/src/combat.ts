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

/** 全体攻撃化の威力%（上限なし）。Lv1〜5は旧式と同じ伸び（Lv1:80%→Lv5:140%）、
 * Lv6以降は対数的に減衰しながら伸び続ける。係数はすべて暫定値でシミュレーションで調整予定。
 * 実ダメージ計算（combat.ts）とカード説明文表示（data/cards.ts）の両方から必ずこの関数を
 * 参照すること（別々に定義すると「実ダメージは伸びるのに説明文だけ頭打ち」というズレが起きる） */
export function aoePercentForLevel(level: number): number {
  if (!level || level <= 0) return 1;
  const base = 0.65 + 0.15 * Math.min(level, 5);
  if (level <= 5) return base;
  return base + 0.25 * Math.log2(level - 4);
}

/** 連撃のNヒット目・全体化のLv-1のダメージポップ/バッジのフォントサイズ(px)。
 * hitIndexが大きいほど（≒連撃の後の方ほど）大きく表示し、重ねがけの強さを直感的に伝える。
 * 全体化の常駐バッジは fontSizeForHitIndex(level - 1) として同じ式を流用する（GAME_DESIGN.md §2.3） */
export function fontSizeForHitIndex(hitIndex: number): number {
  const BASE = 16;
  const STEP = 3;
  const CAP_INDEX = 6;
  return BASE + Math.min(Math.max(hitIndex, 0), CAP_INDEX) * STEP;
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
