import type { Unit, UnitSide } from "./types";

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `u${idCounter}-${Math.random().toString(36).slice(2, 8)}`;
}

export function makeUnit(side: UnitSide, hp: number, atk: number): Unit {
  return {
    id: nextId(),
    side,
    hp,
    maxHp: hp,
    atk,
    critChance: 0,
    critMult: 2,
    dmgOutMult: 1,
    dmgTakenMult: 1,
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

export function aliveUnits(units: Unit[]): Unit[] {
  return units.filter((u) => u.alive);
}
