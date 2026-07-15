import { describe, expect, it } from "vitest";
import { enemyAttackTurn, isEnemyWiped, isPlayerWiped, playerAttackTurn, retaliatePhase } from "./battle";
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
});

describe("enemyAttackTurn", () => {
  it("挑発ユニットがいれば優先的に狙う", () => {
    const taunter = makeUnit("player", 30, 2);
    taunter.tauntLevel = 1;
    const other = makeUnit("player", 30, 2);
    const state = makeState({ playerUnits: [other, taunter] });
    // rngを0.9に固定してもタンク以外を選ばせない(候補がtaunterのみになるため)
    const result = enemyAttackTurn(state, () => 0.9);
    expect(result!.hits.every((h) => h.target === taunter)).toBe(true);
  });

  it("連撃中に挑発ユニットが倒れたら、残りのヒットは他の生存ユニットに向く", () => {
    const taunter = makeUnit("player", 5, 2); // 1発で倒れるHP
    taunter.tauntLevel = 1;
    const other = makeUnit("player", 100, 2);
    const enemy = makeUnit("enemy", 20, 50);
    enemy.attackCount = 3;
    const state = makeState({ playerUnits: [taunter, other], enemyUnits: [enemy] });

    const result = enemyAttackTurn(state, zeroRng);

    // 昔のバグでは挑発ユニットが倒れた時点で残りのヒットが失われ、hits.lengthが1で止まっていた
    expect(result!.hits.length).toBe(3);
    expect(result!.hits[0].target).toBe(taunter);
    expect(result!.hits[1].target).toBe(other);
    expect(result!.hits[2].target).toBe(other);
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
