import type { Unit } from "../types";
import { makeUnit } from "../units";

export const FINAL_ROUND = 10;

/**
 * 敵編成の生成。10層クリア後のエンドレスモードでも同じ式をそのまま延長適用する
 * （ラウンド数に上限を設けていないため、そのまま使い続けられる）。
 */
export function setupEnemies(round: number, rng: () => number = Math.random): Unit[] {
  const count = Math.min(2 + Math.floor(round / 3), 5);
  const baseHp = 12 + round * 5;
  const baseAtk = 2 + Math.floor(round);
  const units: Unit[] = [];
  for (let i = 0; i < count; i++) {
    units.push(makeUnit("enemy", baseHp, baseAtk));
  }
  // 裏で毎ラウンド、敵の1体に連撃を付与（意図的に非公開。§2.7参照）
  if (round >= 2) {
    const rapidOne = units[Math.floor(rng() * units.length)];
    rapidOne.attackCount = Math.min(5, 1 + Math.ceil(round / 2));
  }
  return units;
}
