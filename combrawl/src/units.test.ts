import { describe, expect, it } from "vitest";
import { aliveUnits, avgAtk, avgHp, makeUnit } from "./units";

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
});

describe("avgAtk / avgHp", () => {
  it("複数ユニットの平均値を返す", () => {
    const units = [makeUnit("player", 20, 4), makeUnit("player", 30, 6)];
    expect(avgHp(units)).toBe(25);
    expect(avgAtk(units)).toBe(5);
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
