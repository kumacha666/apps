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
    finalRound: 10,
    tauntBlockBudget: new Map(),
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

describe("特大化", () => {
  it("対象ユニットのみHPが3倍になり(ATKは変化しない)、他は変化しない(2026-07-16、巨大化廃止・特大化はHP専用に変更)", () => {
    const state = makeState();
    const [target, other] = state.playerUnits;
    findCard("titan_growth").apply(state, target);
    expect(target.maxHp).toBe(72);
    expect(target.hp).toBe(72); // その場で全快する仕様
    expect(target.atk).toBe(4); // ATKは変化しない
    expect(other.maxHp).toBe(24);
    expect(other.atk).toBe(4);
  });
});

describe("先鋭化", () => {
  it("対象ユニットのみATKが3倍になり、HP・DEFは変化しない", () => {
    const state = makeState();
    const [target, other] = state.playerUnits;
    findCard("sharpen").apply(state, target);
    expect(target.atk).toBe(12);
    expect(target.maxHp).toBe(24);
    expect(target.def).toBe(5);
    expect(other.atk).toBe(4);
  });
});

describe("硬質化", () => {
  it("対象ユニットのみDEFが3倍になり、dmgTakenMultも新しいDEFで再計算される", () => {
    const state = makeState();
    const [target, other] = state.playerUnits;
    findCard("harden").apply(state, target);
    expect(target.def).toBe(15);
    // BASE_DEF(40) / (40+15) = 0.7272...
    expect(target.dmgTakenMult).toBeCloseTo(40 / 55);
    expect(other.def).toBe(5);
    expect(other.dmgTakenMult).toBeCloseTo(40 / 45);
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

  it("挑発Lvは合算されるが、被ダメージ倍率(dmgTakenMult)はDEF合算値から導出される（2026-07-16、挑発はブロック回数制に変更され、dmgTakenMultから完全に切り離された）", () => {
    const a = makeUnit("player", 20, 4);
    findCard("taunt").apply({ ...makeState([a]), playerUnits: [a] } as GameState, a); // Lv1
    const b = makeUnit("player", 20, 4);
    findCard("taunt").apply({ ...makeState([b]), playerUnits: [b] } as GameState, b); // Lv1

    const state = makeState([a, b]);
    findCard("fusion").apply(state);
    const fused = state.playerUnits[0];

    expect(fused.tauntLevel).toBe(2);
    // DEFは初期値5同士の合算×1.2=12なので、そこから導出される値になるはず
    expect(fused.def).toBe(Math.round((5 + 5) * 1.2));
    expect(fused.dmgTakenMult).toBeCloseTo(40 / (40 + fused.def));
  });

  it("DEFも合計の1.2倍に合算され、dmgTakenMultも同じ式で再計算される", () => {
    const a = makeUnit("player", 20, 4, 10);
    const b = makeUnit("player", 30, 6, 20);
    const state = makeState([a, b]);
    findCard("fusion").apply(state);
    const fused = state.playerUnits[0];
    expect(fused.def).toBe(Math.round((10 + 20) * 1.2));
    expect(fused.dmgTakenMult).toBeCloseTo(40 / (40 + fused.def));
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

  it("HP・ATK・DEFは60%になり、dmgTakenMultも新しいDEFで再計算される", () => {
    const state = makeState([makeUnit("player", 20, 10, 20)]);
    const target = state.playerUnits[0];
    findCard("split").apply(state, target);
    expect(state.playerUnits.length).toBe(2);
    for (const c of state.playerUnits) {
      expect(c.maxHp).toBe(12);
      expect(c.atk).toBe(6);
      expect(c.def).toBe(12);
      expect(c.dmgTakenMult).toBeCloseTo(40 / (40 + 12));
    }
  });

  it("分裂を繰り返してもHP・ATK・DEFは下限(HP6/ATK1/DEF1)を割らない", () => {
    const state = makeState([makeUnit("player", 6, 1, 1)]);
    findCard("split").apply(state, state.playerUnits[0]);
    for (const c of state.playerUnits) {
      expect(c.maxHp).toBeGreaterThanOrEqual(6);
      expect(c.atk).toBeGreaterThanOrEqual(1);
      expect(c.def).toBeGreaterThanOrEqual(1);
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
  });

  it("挑発はdmgTakenMultを一切変更しない（被ダメ軽減はDEF専属、挑発はブロック回数制のみ）", () => {
    const state = makeState([makeUnit("player", 24, 4)]);
    const u = state.playerUnits[0];
    const before = u.dmgTakenMult;
    findCard("taunt").apply(state, u);
    findCard("taunt").apply(state, u);
    expect(u.dmgTakenMult).toBe(before);
  });
});
