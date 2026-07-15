import type { GameState, HitResult, Unit } from "./types";
import { aliveUnits } from "./units";
import { aoeMultFor, computeHitDamage, hitDampen, retaliateMultFor } from "./combat";

export type Rng = () => number;

function pickRandom<T>(arr: T[], rng: Rng): T {
  return arr[Math.floor(rng() * arr.length)];
}

function resolveHits(
  attacker: Unit,
  targetsPool: Unit[],
  hits: number,
  rng: Rng
): HitResult[] {
  const results: HitResult[] = [];
  const isAoe = attacker.aoeLevel > 0;
  const aoeMult = aoeMultFor(attacker.aoeLevel);

  for (let hitIndex = 0; hitIndex < hits; hitIndex++) {
    const alive = targetsPool.filter((u) => u.alive);
    if (alive.length === 0) break;
    const isCrit = rng() < attacker.critChance;
    const targets = isAoe ? alive.slice() : [pickRandom(alive, rng)];

    for (const target of targets) {
      const damage = computeHitDamage({
        atk: attacker.atk,
        dmgOutMult: attacker.dmgOutMult,
        dmgTakenMult: target.dmgTakenMult,
        hitIndex,
        aoeMult,
        isCrit,
        critMult: attacker.critMult,
      });
      target.hp -= damage;
      const wasKilled = target.hp <= 0 && target.alive;
      if (wasKilled) target.alive = false;
      results.push({ attacker, target, damage, isCrit, wasKilled, hitIndex, hpAfter: target.hp });
    }
  }
  return results;
}

/** プレイヤー側ランダム1体が、敵側に攻撃する1ターン分（連撃・全体攻撃込み） */
export function playerAttackTurn(state: GameState, rng: Rng = Math.random): { attacker: Unit; hits: HitResult[] } | null {
  const attackers = aliveUnits(state.playerUnits);
  if (attackers.length === 0) return null;
  const attacker = pickRandom(attackers, rng);
  const hits = resolveHits(attacker, state.enemyUnits, attacker.attackCount, rng);
  return { attacker, hits };
}

/** 敵側ランダム1体が、プレイヤー側に攻撃する1ターン分（挑発ユニットがいれば優先的に狙われる） */
export function enemyAttackTurn(state: GameState, rng: Rng = Math.random): { attacker: Unit; hits: HitResult[] } | null {
  const attackers = aliveUnits(state.enemyUnits);
  if (attackers.length === 0) return null;
  const attacker = pickRandom(attackers, rng);

  const alivePlayers = aliveUnits(state.playerUnits);
  if (alivePlayers.length === 0) return { attacker, hits: [] };
  const taunters = alivePlayers.filter((u) => u.tauntLevel > 0);
  const pool = taunters.length > 0 ? taunters : alivePlayers;

  const hits = resolveHits(attacker, pool, attacker.attackCount, rng);
  return { attacker, hits };
}

/** 被弾したプレイヤーユニットのうち反撃持ちが、自動で敵側へ反撃する */
export function retaliatePhase(state: GameState, damagedUnits: Unit[], rng: Rng = Math.random): HitResult[] {
  const retaliators = damagedUnits.filter((u) => u.alive && u.retaliateLevel > 0);
  const results: HitResult[] = [];

  for (const r of retaliators) {
    const retMult = retaliateMultFor(r.retaliateLevel);
    const isAoe = r.aoeLevel > 0;
    const aoeMult = aoeMultFor(r.aoeLevel);

    for (let hitIndex = 0; hitIndex < r.attackCount; hitIndex++) {
      const alive = state.enemyUnits.filter((u) => u.alive);
      if (alive.length === 0) break;
      const targets = isAoe ? alive.slice() : [pickRandom(alive, rng)];
      for (const target of targets) {
        const damage = Math.max(
          1,
          Math.round(r.atk * r.dmgOutMult * aoeMult * retMult * hitDampen(hitIndex))
        );
        target.hp -= damage;
        const wasKilled = target.hp <= 0 && target.alive;
        if (wasKilled) target.alive = false;
        results.push({ attacker: r, target, damage, isCrit: false, wasKilled, hitIndex, hpAfter: target.hp });
      }
    }
  }
  return results;
}

export function isPlayerWiped(state: GameState): boolean {
  return aliveUnits(state.playerUnits).length === 0;
}

export function isEnemyWiped(state: GameState): boolean {
  return aliveUnits(state.enemyUnits).length === 0;
}
