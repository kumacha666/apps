import { describe, expect, it } from "vitest";
import { enemyAttackTurn, initTauntBlockBudget, isEnemyWiped, isPlayerWiped, playerAttackTurn, retaliatePhase } from "./battle";
import { makeUnit } from "./units";
import type { GameState, HitResult, Unit } from "./types";

/** retaliatePhaseへの入力を組み立てるテスト用ヘルパー（実際の敵ヒットを模す） */
function makeIncomingHit(target: Unit, overrides: Partial<HitResult> = {}): HitResult {
  return {
    attacker: makeUnit("enemy", 20, 3),
    target,
    damage: 5,
    isCrit: false,
    wasKilled: false,
    hitIndex: 0,
    hpAfter: target.hp,
    ...overrides,
  };
}

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    round: 1,
    playerUnits: [makeUnit("player", 24, 4)],
    enemyUnits: [makeUnit("enemy", 20, 3)],
    deck: [],
    score: 0,
    stats: { maxTurnDamage: 0, maxTurnKills: 0 },
    finalRound: 10,
    tauntBlockBudget: new Map(),
    ...overrides,
  };
}

// 常に0を返す(=配列の先頭を選ぶ、会心なし)決定的rng
const zeroRng = () => 0;

describe("playerAttackTurn", () => {
  it("生存する敵にダメージを与える", () => {
    const state = makeState();
    const result = playerAttackTurn(state, zeroRng);
    expect(result).not.toBeNull();
    expect(result!.hits.length).toBe(1);
    expect(state.enemyUnits[0].hp).toBeLessThan(20);
  });

  it("attackCountの回数だけヒットする", () => {
    const state = makeState();
    state.playerUnits[0].attackCount = 5;
    state.enemyUnits[0].hp = 1000;
    state.enemyUnits[0].maxHp = 1000;
    const result = playerAttackTurn(state, zeroRng);
    expect(result!.hits.length).toBe(5);
  });

  it("全体攻撃化していれば1ヒットで敵全員に当たる", () => {
    const state = makeState({
      enemyUnits: [makeUnit("enemy", 20, 3), makeUnit("enemy", 20, 3)],
    });
    state.playerUnits[0].aoeLevel = 1;
    const result = playerAttackTurn(state, zeroRng);
    expect(result!.hits.length).toBe(2);
  });

  it("プレイヤーが全滅していればnullを返す", () => {
    const state = makeState();
    state.playerUnits[0].alive = false;
    expect(playerAttackTurn(state, zeroRng)).toBeNull();
  });

  it("生存する全プレイヤーユニットがそれぞれ攻撃する（1体だけがランダムに選ばれるのではない）", () => {
    const state = makeState({
      playerUnits: [makeUnit("player", 24, 4), makeUnit("player", 24, 4), makeUnit("player", 24, 4)],
      enemyUnits: [makeUnit("enemy", 1000, 3)],
    });
    const result = playerAttackTurn(state, zeroRng);
    expect(result!.hits.length).toBe(3);
    const attackerIds = new Set(result!.hits.map((h) => h.attacker.id));
    expect(attackerIds.size).toBe(3);
  });

  it("戦闘不能なユニットは攻撃しない", () => {
    const dead = makeUnit("player", 24, 4);
    dead.alive = false;
    const alive = makeUnit("player", 24, 4);
    const state = makeState({ playerUnits: [dead, alive], enemyUnits: [makeUnit("enemy", 1000, 3)] });
    const result = playerAttackTurn(state, zeroRng);
    expect(result!.hits.length).toBe(1);
    expect(result!.hits[0].attacker).toBe(alive);
  });
});

describe("enemyAttackTurn", () => {
  it("挑発ユニットがいれば優先的に狙われ、ブロック予算が残っている間はダメージを完全無効化する", () => {
    const taunter = makeUnit("player", 30, 2);
    taunter.tauntLevel = 1;
    const other = makeUnit("player", 30, 2);
    const state = makeState({ playerUnits: [other, taunter] });
    initTauntBlockBudget(state);
    // rngを0.9に固定してもタンク以外を選ばせない(候補がtaunterのみになるため)
    const result = enemyAttackTurn(state, () => 0.9);
    expect(result!.hits.every((h) => h.target === taunter)).toBe(true);
    expect(result!.hits[0].blocked).toBe(true);
    expect(result!.hits[0].damage).toBe(0);
    expect(taunter.alive).toBe(true);
  });

  it("ブロック予算を使い切ったtaunterは、以後の対象選択で優先されなくなる（余った予算が余ったまま被弾するバグの防止）", () => {
    const taunter = makeUnit("player", 30, 2);
    taunter.tauntLevel = 1; // ブロック予算1回分
    const other = makeUnit("player", 30, 2);
    const enemy = makeUnit("enemy", 20, 3);
    enemy.attackCount = 2;
    const state = makeState({ playerUnits: [taunter, other], enemyUnits: [enemy] });
    initTauntBlockBudget(state);

    const result = enemyAttackTurn(state, zeroRng);

    expect(result!.hits.length).toBe(2);
    // 1発目: 予算が残っているtaunterが狙われ、ブロックされる
    expect(result!.hits[0].target).toBe(taunter);
    expect(result!.hits[0].blocked).toBe(true);
    // ちょうどこの1発でブロック予算(1回分)を使い切ったので、blockRemainingAfterは0
    // （盾シャッター演出の発火判定に使う。main.tsのCLAUDE.md参照）
    expect(result!.hits[0].blockRemainingAfter).toBe(0);
    // 2発目: 予算を使い切ったので無効化はされないが、taunterへの引きつけ自体は続く
    expect(result!.hits[1].blocked).toBeFalsy();
  });

  it("ブロック予算を使い切った後も、taunterが他の生存ユニットより優先して狙われ続ける（引きつけ役として機能し続ける）", () => {
    const taunter = makeUnit("player", 30, 2);
    taunter.tauntLevel = 1; // ブロック予算1回分
    const other1 = makeUnit("player", 30, 2);
    const other2 = makeUnit("player", 30, 2);
    const enemy = makeUnit("enemy", 20, 3);
    enemy.attackCount = 4; // 連撃を想定した多段攻撃
    const state = makeState({ playerUnits: [taunter, other1, other2], enemyUnits: [enemy] });
    initTauntBlockBudget(state);

    // rngを0.9に固定：フォールバック先が「生存者全体」（旧バグ）だと3体中の後方(other2)が
    // 選ばれてしまうが、正しい実装（taunter全体へのフォールバック）ならtaunterしか候補にならない
    const result = enemyAttackTurn(state, () => 0.9);

    expect(result!.hits.length).toBe(4);
    expect(result!.hits[0].blocked).toBe(true); // 1発目のみブロック予算で無効化
    expect(result!.hits.slice(1).every((h) => h.target === taunter)).toBe(true);
    expect(result!.hits.slice(1).every((h) => !h.blocked)).toBe(true); // 無効化はされない素の被弾
  });

  it("ブロック予算が複数回分あるtaunterは、blockRemainingAfterが1発ごとにカウントダウンする", () => {
    const taunter = makeUnit("player", 30, 2);
    taunter.tauntLevel = 3; // ブロック予算3回分
    const enemy = makeUnit("enemy", 20, 3);
    enemy.attackCount = 3;
    const state = makeState({ playerUnits: [taunter], enemyUnits: [enemy] });
    initTauntBlockBudget(state);

    const result = enemyAttackTurn(state, zeroRng);

    expect(result!.hits.length).toBe(3);
    expect(result!.hits.every((h) => h.blocked)).toBe(true);
    expect(result!.hits.map((h) => h.blockRemainingAfter)).toEqual([2, 1, 0]);
  });

  it("連撃中に挑発ユニットが倒れたら、残りのヒットは他の生存ユニットに向く", () => {
    const taunter = makeUnit("player", 5, 2); // ブロックを使い切った後の1発で倒れるHP
    taunter.tauntLevel = 1;
    const other = makeUnit("player", 100, 2);
    const enemy = makeUnit("enemy", 20, 50);
    enemy.attackCount = 3;
    const state = makeState({ playerUnits: [taunter, other], enemyUnits: [enemy] });
    initTauntBlockBudget(state);

    const result = enemyAttackTurn(state, zeroRng);

    // 昔のバグでは挑発ユニットが倒れた時点で残りのヒットが失われ、hits.lengthが2で止まっていた
    expect(result!.hits.length).toBe(3);
    expect(result!.hits[0].target).toBe(taunter);
    expect(result!.hits[0].blocked).toBe(true); // 1発目はブロック予算で無効化
    expect(result!.hits[1].target).toBe(taunter); // 予算を使い切った後、2発目で倒れる
    expect(result!.hits[1].wasKilled).toBe(true);
    expect(result!.hits[2].target).toBe(other);
  });

  it("挑発を持たないユニットしかいない場合、ブロックは発生しない", () => {
    const state = makeState({ playerUnits: [makeUnit("player", 30, 2)] });
    initTauntBlockBudget(state);
    const result = enemyAttackTurn(state, zeroRng);
    expect(result!.hits.every((h) => !h.blocked)).toBe(true);
  });

  it("生存する全敵ユニットがそれぞれ攻撃する（1体だけがランダムに選ばれるのではない）", () => {
    const state = makeState({
      playerUnits: [makeUnit("player", 1000, 2)],
      enemyUnits: [makeUnit("enemy", 20, 3), makeUnit("enemy", 20, 3), makeUnit("enemy", 20, 3)],
    });
    const result = enemyAttackTurn(state, zeroRng);
    expect(result!.hits.length).toBe(3);
    const attackerIds = new Set(result!.hits.map((h) => h.attacker.id));
    expect(attackerIds.size).toBe(3);
  });
});

describe("retaliatePhase", () => {
  it("反撃Lvを持つ被弾ユニットのみ反撃する", () => {
    const retaliator = makeUnit("player", 30, 5);
    retaliator.retaliateLevel = 1;
    const state = makeState({ playerUnits: [retaliator] });
    const hits = retaliatePhase(state, [makeIncomingHit(retaliator)], zeroRng);
    expect(hits.length).toBe(1);
    expect(state.enemyUnits[0].hp).toBeLessThan(20);
  });

  it("反撃Lv0のユニットは反撃しない", () => {
    const nonRetaliator = makeUnit("player", 30, 5);
    const state = makeState({ playerUnits: [nonRetaliator] });
    const hits = retaliatePhase(state, [makeIncomingHit(nonRetaliator)], zeroRng);
    expect(hits.length).toBe(0);
  });

  it("同じユニットが複数回被弾していれば、その回数分だけ反撃する（連撃を持つ敵からの複数ヒット対応）", () => {
    const retaliator = makeUnit("player", 30, 5);
    retaliator.retaliateLevel = 1;
    const state = makeState({ playerUnits: [retaliator], enemyUnits: [makeUnit("enemy", 1000, 3)] });
    // 敵の連撃で3回被弾した想定（いずれも致命傷ではない） -> 3ヒット分渡す
    const hits = retaliatePhase(
      state,
      [makeIncomingHit(retaliator), makeIncomingHit(retaliator), makeIncomingHit(retaliator)],
      zeroRng
    );
    expect(hits.length).toBe(3);
  });

  it("同じユニットの複数回の反撃は、それぞれ別のswingId（別の1回の振り）として区別される（アニメーションで誤って同時ヒット扱いされないため）", () => {
    const retaliator = makeUnit("player", 30, 5);
    retaliator.retaliateLevel = 1; // attackCount=1のまま（各反撃は常にhitIndex=0の1発のみ）
    const state = makeState({ playerUnits: [retaliator], enemyUnits: [makeUnit("enemy", 1000, 3)] });
    const hits = retaliatePhase(
      state,
      [makeIncomingHit(retaliator), makeIncomingHit(retaliator), makeIncomingHit(retaliator)],
      zeroRng
    );
    expect(hits.length).toBe(3);
    expect(hits.every((h) => h.hitIndex === 0)).toBe(true);
    // 3回とも同じattacker・同じhitIndex(0)だが、別々の反撃アクションなのでswingIdは3件とも異なるはず
    const swingIds = hits.map((h) => h.swingId);
    expect(new Set(swingIds).size).toBe(3);
  });

  it("撃破された瞬間のヒットでは反撃しないが、それ以前の被弾分の反撃は消えない", () => {
    const retaliator = makeUnit("player", 10, 5);
    retaliator.retaliateLevel = 1;
    const state = makeState({ playerUnits: [retaliator], enemyUnits: [makeUnit("enemy", 1000, 3)] });
    // 1発目は生存、2発目で撃破された想定
    const hits = retaliatePhase(
      state,
      [makeIncomingHit(retaliator, { wasKilled: false }), makeIncomingHit(retaliator, { wasKilled: true })],
      zeroRng
    );
    // 撃破ヒットの分(1回)は反撃しないが、その前の生存していた分(1回)の反撃は残る
    expect(hits.length).toBe(1);
  });

  it("反撃持ち自身ではなく、他の味方が被弾した場合でも反撃する（カード説明文「味方が攻撃を受けるたびに」通り）", () => {
    const retaliator = makeUnit("player", 30, 5);
    retaliator.retaliateLevel = 1;
    const ally = makeUnit("player", 30, 2); // 反撃Lvを持たない味方
    const state = makeState({ playerUnits: [ally, retaliator] });
    // allyだけが被弾した想定（retaliator自身は狙われていない）
    const hits = retaliatePhase(state, [makeIncomingHit(ally)], zeroRng);
    expect(hits.length).toBe(1);
    expect(hits[0].attacker).toBe(retaliator);
  });

  it("反撃持ちが連撃の途中で倒れた後に発生した味方の被弾には反撃しない", () => {
    const retaliator = makeUnit("player", 10, 5);
    retaliator.retaliateLevel = 1;
    const ally = makeUnit("player", 30, 2);
    const state = makeState({ playerUnits: [ally, retaliator], enemyUnits: [makeUnit("enemy", 1000, 3)] });
    const hits = retaliatePhase(
      state,
      [
        makeIncomingHit(retaliator, { wasKilled: true }), // retaliatorがここで倒れる
        makeIncomingHit(ally, { wasKilled: false }), // その後にallyが被弾
      ],
      zeroRng
    );
    expect(hits.length).toBe(0);
  });

  it("敵側のDEF(dmgTakenMult)が反撃ダメージにも適用される（2026-07-16、DEF導入前は反撃だけDEFを無視していた）", () => {
    const retaliator = makeUnit("player", 30, 100);
    retaliator.retaliateLevel = 1;
    const hardEnemy = makeUnit("enemy", 1000, 3, 200); // DEF高め、dmgTakenMultが小さい
    const state = makeState({ playerUnits: [retaliator], enemyUnits: [hardEnemy] });
    const hits = retaliatePhase(state, [makeIncomingHit(retaliator)], zeroRng);
    expect(hits.length).toBe(1);
    // DEFを無視した場合のダメージ(atk*retMult=100)より明確に小さくなるはず
    expect(hits[0].damage).toBeLessThan(100);
    expect(hits[0].damage).toBeGreaterThanOrEqual(1);
  });
});

describe("initTauntBlockBudget", () => {
  it("挑発Lvを持つユニットの分だけ予算を初期化する（挑発を持たないユニットは含めない）", () => {
    const taunter = makeUnit("player", 30, 2);
    taunter.tauntLevel = 3;
    const other = makeUnit("player", 30, 2);
    const state = makeState({ playerUnits: [taunter, other] });
    initTauntBlockBudget(state);
    expect(state.tauntBlockBudget.get(taunter.id)).toBe(3);
    expect(state.tauntBlockBudget.has(other.id)).toBe(false);
  });
});

describe("isPlayerWiped / isEnemyWiped", () => {
  it("全滅判定が正しい", () => {
    const state = makeState();
    expect(isPlayerWiped(state)).toBe(false);
    expect(isEnemyWiped(state)).toBe(false);
    state.enemyUnits[0].alive = false;
    expect(isEnemyWiped(state)).toBe(true);
  });
});
