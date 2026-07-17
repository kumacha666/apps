/**
 * HP=サイズ／ATK=形（トゲトゲ度）／DEF=素材、という3チャンネルの視覚表現。
 * いずれも「基準値から約2倍ごとに1段階、12段階で頭打ち」という同じ対数しきい値の考え方を使う
 * （GAME_DESIGN.md §2.6）。基準値はいずれも暫定値で、実際の到達分布を見てシミュレーションで調整する。
 */

/** 基準値から見て何段階目か（1〜12にクランプ）。3チャンネル共通のしきい値計算 */
export function tierForValue(value: number, base: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const tier = 1 + Math.floor(Math.log2(value / base));
  return Math.max(1, Math.min(12, tier));
}

/** HPしきい値の基準値。実測の巨大化ビルド（HP約99,360）まで12段階でちょうど覆えるよう校正済み */
const HP_BASE = 8;
/** ATK/DEFのしきい値の基準値。初期値（ATK4/DEF5）が低〜中段階に収まるよう暫定的に置いた値 */
const ATK_BASE = 2;
const DEF_BASE = 2;

export function hpTier(hp: number): number {
  return tierForValue(hp, HP_BASE);
}

export function atkTier(atk: number): number {
  return tierForValue(atk, ATK_BASE);
}

export function defTier(def: number): number {
  return tierForValue(def, DEF_BASE);
}

/** 12段階のユニットサイズ(px)。tier1(22px)〜tier12(140px、サイズ最大) */
const HP_TIER_SIZES = [22, 27, 33, 40, 48, 58, 69, 82, 96, 111, 126, 140];

export function sizeForHpTier(tier: number): number {
  return HP_TIER_SIZES[Math.max(1, Math.min(12, tier)) - 1];
}

/** 12段階目（サイズ最大）を超えてもHPが伸び続けている状態か。サイズはそれ以上変えず、
 * 代わりに.hp-capped（紫の脈動グロー）で「まだ伸びている」ことを示す */
export function isHpCapped(hp: number): boolean {
  return hpTier(hp) >= 12;
}

/** ATKの形状tier1〜3は角の丸みだけを変える四角形、tier4〜12はN芒星（tier=頂点数）にする */
export type AtkShape = { kind: "rounded"; borderRadiusPercent: number } | { kind: "star"; points: number };

export function shapeForAtkTier(tier: number): AtkShape {
  const t = Math.max(1, Math.min(12, tier));
  if (t === 1) return { kind: "rounded", borderRadiusPercent: 50 }; // 円
  if (t === 2) return { kind: "rounded", borderRadiusPercent: 26 }; // 丸みのある四角
  if (t === 3) return { kind: "rounded", borderRadiusPercent: 6 }; // 四角
  return { kind: "star", points: t }; // 4〜12芒星
}

/** clip-path: polygon(...) 文字列を生成する。points=頂点数、innerRatio=内側半径の比率 */
export function starPolygonClipPath(points: number, innerRatio = 0.5, rotationDeg = -90): string {
  const outerR = 48;
  const innerR = outerR * innerRatio;
  const cx = 50;
  const cy = 50;
  const step = Math.PI / points;
  const rot = (rotationDeg * Math.PI) / 180;
  const pts: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = rot + i * step;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    pts.push(`${x.toFixed(2)}% ${y.toFixed(2)}%`);
  }
  return `polygon(${pts.join(", ")})`;
}

/** DEF tier1(なし)〜tier12(漆黒)に対応するCSSクラス名（style.cssの.mat-*と対）*/
const DEF_TIER_MATERIAL_CLASSES = [
  "mat-none",
  "mat-cloth",
  "mat-wood",
  "mat-stone",
  "mat-bronze",
  "mat-iron",
  "mat-silver",
  "mat-gold",
  "mat-platinum",
  "mat-diamond",
  "mat-aurora",
  "mat-void",
];

export function materialClassForDefTier(tier: number): string {
  return DEF_TIER_MATERIAL_CLASSES[Math.max(1, Math.min(12, tier)) - 1];
}
