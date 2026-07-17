import type { GameState, HitResult, Unit } from "./types";
import { aliveUnits } from "./units";
import { aoePercentForLevel, computeHitDamage, hitDampen, retaliateMultFor } from "./combat";

export type Rng = () => number;

function pickRandom<T>(arr: T[], rng: Rng): T {
  return arr[Math.floor(rng() * arr.length)];
}

/** 「同じ1回の振り」を識別するID採番（アニメーション演出専用、値そのものに意味は無い） */
let swingCounter = 0;
function nextSwingId(): number {
  return swingCounter++;
}

function resolveHits(
  attacker: Unit,
  targetsPool: Unit[],
  hits: number,
  rng: Rng,
  /** ヒットごとに狙う対象群を絞り込む（例: 挑発ユニット優先）。省略時は生存者全体 */
  selectTargets?: (alive: Unit[]) => Unit[],
  /** 挑発のブロック予算（ユニットidごとの残り回数）。渡された場合、予算が残っている対象への
   * ヒットはダメージを完全無効化し、予算を1消費する */
  tauntBlockBudget?: Map<string, number>
): HitResult[] {
  const results: HitResult[] = [];
  const isAoe = attacker.aoeLevel > 0;
  const aoeMult = aoePercentForLevel(attacker.aoeLevel);
  // 1回のresolveHits呼び出し全体（1ターン分の連撃・全体攻撃）を1つの攻撃アクションとして扱う。
  // hitIndexが攻撃の何発目かを表すのに対し、swingIdは「別々の攻撃アクション」を区別する
  const swingId = nextSwingId();

  for (let hitIndex = 0; hitIndex < hits; hitIndex++) {
    const alive = targetsPool.filter((u) => u.alive);
    if (alive.length === 0) break;
    // 挑発ユニットが途中で倒れた場合など、狙う対象群をヒットごとに再評価する
    const pool = selectTargets ? selectTargets(alive) : alive;
    if (pool.length === 0) break;
    const isCrit = rng() < attacker.critChance;
    const targets = isAoe ? pool.slice() : [pickRandom(pool, rng)];

    for (const target of targets) {
      const remaining = tauntBlockBudget?.get(target.id) ?? 0;
      if (remaining > 0) {
        tauntBlockBudget!.set(target.id, remaining - 1);
        results.push({
          attacker,
          target,
          damage: 0,
          isCrit: false,
          wasKilled: false,
          hitIndex,
          hpAfter: target.hp,
          swingId,
          blocked: true,
        });
        continue;
      }
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
      results.push({ attacker, target, damage, isCrit, wasKilled, hitIndex, hpAfter: target.hp, swingId });
    }
  }
  return results;
}

/** 戦闘開始時（ラウンドが変わり敵編成を生成するタイミング）に挑発のブロック予算をリフィルする。
 * enemyAttackTurn()はbattleTick()のsetTimeoutループの都合で1戦闘中に複数回呼ばれるため、
 * ここ（戦闘開始の1回）以外でリフィルしてはいけない */
export function initTauntBlockBudget(state: GameState): void {
  const budget = new Map<string, number>();
  for (const u of state.playerUnits) {
    if (u.tauntLevel > 0) budget.set(u.id, u.tauntLevel);
  }
  state.tauntBlockBudget = budget;
}

/** プレイヤー側の生存ユニット全員が、敵側に攻撃する1ターン分（連撃・全体攻撃込み） */
export function playerAttackTurn(state: GameState, rng: Rng = Math.random): { hits: HitResult[] } | null {
  const attackers = aliveUnits(state.playerUnits);
  if (attackers.length === 0) return null;
  const hits: HitResult[] = [];
  for (const attacker of attackers) {
    hits.push(...resolveHits(attacker, state.enemyUnits, attacker.attackCount, rng));
  }
  return { hits };
}

/** 敵側の生存ユニット全員が、プレイヤー側に攻撃する1ターン分（挑発ユニットがいれば優先的に狙われる） */
export function enemyAttackTurn(state: GameState, rng: Rng = Math.random): { hits: HitResult[] } | null {
  const attackers = aliveUnits(state.enemyUnits);
  if (attackers.length === 0) return null;

  const alivePlayers = aliveUnits(state.playerUnits);
  if (alivePlayers.length === 0) return { hits: [] };

  const hits: HitResult[] = [];
  for (const attacker of attackers) {
    hits.push(
      ...resolveHits(
        attacker,
        state.playerUnits,
        attacker.attackCount,
        rng,
        (alive) => {
          // ブロック予算が残っているtaunterを優先する。優先しないと予算が余ったまま被弾する
          // （＝挑発スキルが機能していないように見える）バグになる
          const tautersWithBudget = alive.filter(
            (u) => u.tauntLevel > 0 && (state.tauntBlockBudget.get(u.id) ?? 0) > 0
          );
          return tautersWithBudget.length > 0 ? tautersWithBudget : alive;
        },
        state.tauntBlockBudget
      )
    );
  }
  return { hits };
}

/**
 * 「選んだユニットが、味方が攻撃を受けるたびに自動で反撃する」（カード説明文の通り）。
 * 反撃持ちユニット自身が狙われた時だけでなく、他の味方が被弾した時にも反撃が発動する。
 *
 * 反撃可否は「そのヒットが起きた瞬間に反撃持ちユニットが生存していたか」で判定する。
 * `incomingHits`が解決し終えた後の最終的な`u.alive`をそのまま使うと、反撃持ち自身が
 * 連撃の途中で倒れた場合、死ぬ前に発生した味方の被弾に対する反撃まで消えてしまうため、
 * 各反撃持ちについて「どのヒットで力尽きたか（あれば）」を先に求め、それより前のヒット
 * でのみ反撃資格があるとして扱う。
 */
export function retaliatePhase(state: GameState, incomingHits: HitResult[], rng: Rng = Math.random): HitResult[] {
  const results: HitResult[] = [];
  const retaliateCandidates = state.playerUnits.filter((u) => u.retaliateLevel > 0);

  const deathIndexOf = new Map<string, number>();
  incomingHits.forEach((hit, idx) => {
    if (hit.wasKilled) deathIndexOf.set(hit.target.id, idx);
  });

  incomingHits.forEach((hit, idx) => {
    for (const r of retaliateCandidates) {
      const deathIdx = deathIndexOf.get(r.id);
      // このヒットの時点でrが生存していたか（一度も倒れていないならこのフェーズ開始時点の生存状態、
      // 途中で倒れたなら「そのヒットより前か」で判定する）
      const wasAliveAtThisHit = deathIdx !== undefined ? idx < deathIdx : r.alive;
      if (!wasAliveAtThisHit) continue;

      const retMult = retaliateMultFor(r.retaliateLevel);
      const isAoe = r.aoeLevel > 0;
      const aoeMult = aoePercentForLevel(r.aoeLevel);
      // 同じ反撃持ちユニットが、味方の複数回の被弾（別々のincomingHit）に反応して複数回反撃することがある。
      // 各反撃はそれぞれ独立した「1回の振り」なので、hitIndexが0から振り出しに戻っても
      // 前の反撃と同時ヒット扱いにならないよう、反撃1回ごとに新しいswingIdを発行する
      // （2026-07-15、Codexレビュー指摘: hitIndex+attackerだけのグループ化だと、
      //   attackCount===1の反撃が複数回起きた場合に誤って1つの同時スイングに見えてしまう）
      const swingId = nextSwingId();

      for (let hitIndex = 0; hitIndex < r.attackCount; hitIndex++) {
        const aliveEnemies = state.enemyUnits.filter((u) => u.alive);
        if (aliveEnemies.length === 0) break;
        const targets = isAoe ? aliveEnemies.slice() : [pickRandom(aliveEnemies, rng)];
        for (const target of targets) {
          const damage = Math.max(
            1,
            Math.round(r.atk * r.dmgOutMult * target.dmgTakenMult * aoeMult * retMult * hitDampen(hitIndex))
          );
          target.hp -= damage;
          const wasKilled = target.hp <= 0 && target.alive;
          if (wasKilled) target.alive = false;
          results.push({ attacker: r, target, damage, isCrit: false, wasKilled, hitIndex, hpAfter: target.hp, swingId });
        }
      }
    }
  });
  return results;
}

export function isPlayerWiped(state: GameState): boolean {
  return aliveUnits(state.playerUnits).length === 0;
}

export function isEnemyWiped(state: GameState): boolean {
  return aliveUnits(state.enemyUnits).length === 0;
}
