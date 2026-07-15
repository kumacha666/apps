import { describe, expect, it } from "vitest";
import { CARD_POOL } from "./cards";
import { makeUnit } from "../units";
import type { GameState } from "../types";

function findCard(id: string) {
  const card = CARD_POOL.find((c) => c.id === id);
  if (!card) throw new Error(`card not found: ${id}`);
  return card;
}

function makeState(playerUnits = [makeUnit("player", 24, 4), makeUnit("player", 24, 4)]): GameState {
  return {
    round: 1,
    playerUnits,
    enemyUnits: [makeUnit("enemy", 20, 3)],
    deck: [],
    score: 0,
    stats: { maxTurnDamage: 0, maxTurnKills: 0 },
  };
}

describe("増援", () => {
  it("既存ユニットの平均ステータスで新ユニットを追加する", () => {
    const state = makeState();
    findCard("reinforce").apply(state);
    expect(state.playerUnits.length).toBe(3);
    expect(state.playerUnits[2].hp).toBe(24);
    expect(state.playerUnits[2].atk).toBe(4);
  });
});

describe("連撃の型", () => {
  it("attackCountが+4される", () => {
    const state = makeState();
    const target = state.playerUnits[0];
    findCard("rapid_strike").apply(state, target);
    expect(target.attackCount).toBe(5);
  });
});

describe("巨大化", () => {
  it("全ユニットのHPとATKが2倍になる(2026-07-15、ATKも連動するよう変更)", () => {
    const state = makeState();
    findCard("giant_growth").apply(state);
    for (const u of state.playerUnits) {
      expect(u.maxHp).toBe(48);
      expect(u.hp).toBe(48);
      expect(u.atk).toBe(8);
    }
  });
});

describe("特大化", () => {
  it("対象ユニットのみHP・ATKが3倍になり、他は変化しない", () => {
    const state = makeState();
    const [target, other] = state.playerUnits;
    findCard("titan_growth").apply(state, target);
    expect(target.maxHp).toBe(72);
    expect(target.atk).toBe(12);
    expect(other.maxHp).toBe(24);
    expect(other.atk).toBe(4);
  });
});

describe("合体", () => {
  it("HP・ATKは合計の1.2倍になり、特性を合算して引き継ぐ", () => {
    const a = makeUnit("player", 20, 4);
    a.aoeLevel = 1;
    const b = makeUnit("player", 30, 6);
    b.aoeLevel = 1;
    const state = makeState([a, b]);
    findCard("fusion").apply(state);
    expect(state.playerUnits.length).toBe(1);
    const fused = state.playerUnits[0];
    expect(fused.maxHp).toBe(Math.round((20 + 30) * 1.2));
    expect(fused.atk).toBe(Math.round((4 + 6) * 1.2));
    expect(fused.aoeLevel).toBe(2);
  });

  it("挑発Lvを合算した場合、被ダメージ倍率も合算後のLvに整合した値になる（表示Lvと実際の軽減率がズレない）", () => {
    const a = makeUnit("player", 20, 4);
    findCard("taunt").apply({ ...makeState([a]), playerUnits: [a] } as GameState, a); // Lv1(70%)
    const b = makeUnit("player", 20, 4);
    findCard("taunt").apply({ ...makeState([b]), playerUnits: [b] } as GameState, b); // Lv1(70%)

    const state = makeState([a, b]);
    findCard("fusion").apply(state);
    const fused = state.playerUnits[0];

    expect(fused.tauntLevel).toBe(2);
    // 1体でLv2まで積んだ場合(0.7*0.7=0.49)と同じ軽減率になるべき
    expect(fused.dmgTakenMult).toBeCloseTo(0.49);
  });
});

describe("分裂", () => {
  it("対象ユニットが60%ステータスの2体に分裂し、特性は両方に複製される", () => {
    const state = makeState();
    const target = state.playerUnits[0];
    target.retaliateLevel = 2;
    findCard("split").apply(state, target);
    expect(state.playerUnits.length).toBe(3); // 元1体が2体に、もう1体は変化なし
    const [child1, child2] = state.playerUnits;
    expect(child1.retaliateLevel).toBe(2);
    expect(child2.retaliateLevel).toBe(2);
  });

  it("HP・ATKは60%になる", () => {
    const state = makeState([makeUnit("player", 20, 10)]);
    const target = state.playerUnits[0];
    findCard("split").apply(state, target);
    expect(state.playerUnits.length).toBe(2);
    for (const c of state.playerUnits) {
      expect(c.maxHp).toBe(12);
      expect(c.atk).toBe(6);
    }
  });
});

describe("全体攻撃化 / 反撃の型 / 挑発", () => {
  it("重ねがけでレベルが加算される", () => {
    const state = makeState([makeUnit("player", 24, 4)]);
    const u = state.playerUnits[0];
    findCard("aoe_convert").apply(state, u);
    findCard("aoe_convert").apply(state, u);
    expect(u.aoeLevel).toBe(2);

    findCard("retaliate").apply(state, u);
    expect(u.retaliateLevel).toBe(1);

    findCard("taunt").apply(state, u);
    findCard("taunt").apply(state, u);
    expect(u.tauntLevel).toBe(2);
    expect(u.dmgTakenMult).toBeCloseTo(0.49);
  });
});
