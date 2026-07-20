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

/** 反撃の威力倍率（Lv1:100%→Lv2:135%→Lv3:170%…、上限300%）。実ダメージ計算（battle.ts）と
 * カード説明文表示（data/cards.ts）・戦闘中の反撃バッジ表示（main.ts）の全てが必ずこの関数を
 * 参照すること（以前はdata/cards.tsに同一ロジックの重複定義`retaliateMultForDisplay`があったが、
 * aoePercentForLevelと同じ理由で統一した。片方だけ直すと表示と実ダメージがズレるため） */
export function retaliateMultFor(level: number): number {
  if (!level || level <= 0) return 0;
  return Math.min(3, 1 + 0.35 * (level - 1));
}

export interface AttackBadgeInfo {
  aoePercent?: number;
  retaliatePercent?: number;
  /** 全体化・反撃の両方が有効な場合のみ設定。両者の積を基準100%からの増分で表す（例: 238%→138） */
  comboDeltaPercent?: number;
}

/** 攻撃者頭上のバッジに表示すべき情報を、実ダメージ計算と同じ式(aoePercentForLevel/retaliateMultFor)
 * から導出する。全体化%・反撃%が両方有効な振り（反撃ターンに全体化持ちが反撃する場合）は
 * 実際のダメージ倍率が両者の積になるため、内訳と合計(comboDeltaPercent)の両方を返す
 * （2026-07-20、ユーザー報告：以前はどちらか一方しか表示されず、実際の倍率と表示がズレていた） */
export function attackBadgeInfo(params: {
  aoeLevel: number;
  retaliateLevel: number;
  isRetaliateSwing: boolean;
}): AttackBadgeInfo | null {
  const aoeActive = params.aoeLevel > 0;
  const retaliateActive = params.isRetaliateSwing && params.retaliateLevel > 0;
  if (!aoeActive && !retaliateActive) return null;

  const info: AttackBadgeInfo = {};
  if (aoeActive) info.aoePercent = Math.round(aoePercentForLevel(params.aoeLevel) * 100);
  if (retaliateActive) info.retaliatePercent = Math.round(retaliateMultFor(params.retaliateLevel) * 100);
  if (aoeActive && retaliateActive) {
    const comboMult = aoePercentForLevel(params.aoeLevel) * retaliateMultFor(params.retaliateLevel);
    info.comboDeltaPercent = Math.round(comboMult * 100) - 100;
  }
  return info;
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
