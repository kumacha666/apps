import type { Unit, UnitSide } from "./types";
import { dmgTakenMultForDef } from "./combat";

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `u${idCounter}-${Math.random().toString(36).slice(2, 8)}`;
}

/** defの既定値。実HP24/ATK4という初期ユニットの実測値と釣り合うよう決めた暫定値 */
const DEFAULT_DEF = 5;

export function makeUnit(side: UnitSide, hp: number, atk: number, def: number = DEFAULT_DEF): Unit {
  return {
    id: nextId(),
    side,
    hp,
    maxHp: hp,
    atk,
    def,
    critChance: 0,
    critMult: 2,
    dmgOutMult: 1,
    // defから初期化しないと、生成直後のユニットは硬質化等で後からdefを変更するまでDEFが一切
    // 戦闘に反映されない（2026-07-16、Codexレビュー指摘）
    dmgTakenMult: dmgTakenMultForDef(def),
    attackCount: 1,
    aoeLevel: 0,
    retaliateLevel: 0,
    tauntLevel: 0,
    alive: true,
  };
}

export function avgAtk(units: Unit[]): number {
  return Math.round(units.reduce((s, u) => s + u.atk, 0) / units.length);
}

export function avgHp(units: Unit[]): number {
  return Math.round(units.reduce((s, u) => s + u.maxHp, 0) / units.length);
}

export function avgDef(units: Unit[]): number {
  return Math.round(units.reduce((s, u) => s + u.def, 0) / units.length);
}

export function aliveUnits(units: Unit[]): Unit[] {
  return units.filter((u) => u.alive);
}
