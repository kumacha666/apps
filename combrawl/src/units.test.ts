import { describe, expect, it } from "vitest";
import { aliveUnits, avgAtk, avgDef, avgHp, makeUnit } from "./units";

describe("makeUnit", () => {
  it("既定値を持つユニットを生成し、idは重複しない", () => {
    const a = makeUnit("player", 24, 4);
    const b = makeUnit("player", 24, 4);
    expect(a.hp).toBe(24);
    expect(a.maxHp).toBe(24);
    expect(a.atk).toBe(4);
    expect(a.attackCount).toBe(1);
    expect(a.alive).toBe(true);
    expect(a.id).not.toBe(b.id);
  });

  it("defの既定値は5で、dmgTakenMultはdefから初期化される（2026-07-16、DEF導入時にCodexが指摘: defを追加するだけでは初期DEFが戦闘に反映されない）", () => {
    const a = makeUnit("player", 24, 4);
    expect(a.def).toBe(5);
    expect(a.dmgTakenMult).toBeCloseTo(40 / 45);
  });

  it("defを明示的に渡すと、dmgTakenMultもその値から導出される", () => {
    const a = makeUnit("player", 24, 4, 20);
    expect(a.def).toBe(20);
    expect(a.dmgTakenMult).toBeCloseTo(40 / 60);
  });
});

describe("avgAtk / avgHp / avgDef", () => {
  it("複数ユニットの平均値を返す", () => {
    const units = [makeUnit("player", 20, 4, 10), makeUnit("player", 30, 6, 20)];
    expect(avgHp(units)).toBe(25);
    expect(avgAtk(units)).toBe(5);
    expect(avgDef(units)).toBe(15);
  });
});

describe("aliveUnits", () => {
  it("生存ユニットのみ抽出する", () => {
    const a = makeUnit("player", 10, 1);
    const b = makeUnit("player", 10, 1);
    b.alive = false;
    expect(aliveUnits([a, b])).toEqual([a]);
  });
});
