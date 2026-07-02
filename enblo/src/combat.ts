import type { AttackEvent, CombatResult, CombatUnit } from "./types";

const MIN_HIT = 5;
const MAX_HIT = 100;
const CRIT_MULTIPLIER = 3;
const DOUBLE_ATTACK_SPD_THRESHOLD = 4;
const MAX_ROUNDS = 100;

export function clampHit(hit: number): number {
  return Math.max(MIN_HIT, Math.min(MAX_HIT, hit));
}

export function clampCrit(crit: number): number {
  return Math.max(0, Math.min(100, crit));
}

export function computeDamage(atk: number, def: number, isCrit: boolean): number {
  const base = Math.max(1, atk - def);
  return isCrit ? base * CRIT_MULTIPLIER : base;
}

interface MutableCombatant {
  name: string;
  stats: CombatUnit["stats"];
  currentHp: number;
}

function performAttack(
  attacker: MutableCombatant,
  defender: MutableCombatant,
  rng: () => number,
  log: AttackEvent[]
): void {
  if (defender.currentHp <= 0 || attacker.currentHp <= 0) return;

  const hitChance = clampHit(attacker.stats.hit);
  const hit = rng() * 100 < hitChance;
  let damage = 0;
  let crit = false;

  if (hit) {
    const critChance = clampCrit(attacker.stats.crit);
    crit = rng() * 100 < critChance;
    damage = computeDamage(attacker.stats.atk, defender.stats.def, crit);
    defender.currentHp = Math.max(0, defender.currentHp - damage);
  }

  log.push({
    attackerName: attacker.name,
    hit,
    crit,
    damage,
    defenderHpAfter: defender.currentHp,
  });
}

export function simulateCombat(
  player: CombatUnit,
  enemy: CombatUnit,
  rng: () => number = Math.random
): CombatResult {
  const p: MutableCombatant = { name: player.name, stats: player.stats, currentHp: player.stats.hp };
  const e: MutableCombatant = { name: enemy.name, stats: enemy.stats, currentHp: enemy.stats.hp };
  const log: AttackEvent[] = [];

  const playerFirst = p.stats.spd >= e.stats.spd;
  const [first, second] = playerFirst ? [p, e] : [e, p];
  const spdDiff = Math.abs(p.stats.spd - e.stats.spd);
  const firstDoubles = spdDiff >= DOUBLE_ATTACK_SPD_THRESHOLD;

  let rounds = 0;
  while (p.currentHp > 0 && e.currentHp > 0 && rounds < MAX_ROUNDS) {
    performAttack(first, second, rng, log);
    if (second.currentHp > 0) {
      performAttack(second, first, rng, log);
    }
    if (firstDoubles && first.currentHp > 0 && second.currentHp > 0) {
      performAttack(first, second, rng, log);
    }
    rounds += 1;
  }

  // タイムアウト（MAX_ROUNDS到達）は敵の勝利扱い。敵を倒せなければ撤退できない。
  const winner: CombatResult["winner"] =
    e.currentHp <= 0 ? "player" : "enemy";
  return { winner, log };
}
