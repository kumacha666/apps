import { describe, expect, it } from "vitest";
import { enemyAttackTurn, isEnemyWiped, isPlayerWiped, playerAttackTurn, retaliatePhase } from "./battle";
import { makeUnit } from "./units";
import type { GameState } from "./types";

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    round: 1,
    playerUnits: [makeUnit("player", 24, 4)],
    enemyUnits: [makeUnit("enemy", 20, 3)],
    deck: [],
    combo: 1,
    stats: { maxCombo: 0, maxTurnDamage: 0, maxTurnKills: 0 },
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
});

describe("retaliatePhase", () => {
  it("反撃Lvを持つ被弾ユニットのみ反撃する", () => {
    const retaliator = makeUnit("player", 30, 5);
    retaliator.retaliateLevel = 1;
    const state = makeState({ playerUnits: [retaliator] });
    const hits = retaliatePhase(state, [retaliator], zeroRng);
    expect(hits.length).toBe(1);
    expect(state.enemyUnits[0].hp).toBeLessThan(20);
  });

  it("反撃Lv0のユニットは反撃しない", () => {
    const nonRetaliator = makeUnit("player", 30, 5);
    const state = makeState({ playerUnits: [nonRetaliator] });
    const hits = retaliatePhase(state, [nonRetaliator], zeroRng);
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
