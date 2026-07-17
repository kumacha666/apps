import { describe, expect, it } from "vitest";
import { aoePercentForLevel, computeHitDamage, hitDampen, retaliateMultFor } from "./combat";

describe("hitDampen", () => {
  it("1発目は満威力", () => {
    expect(hitDampen(0)).toBe(1);
  });
  it("撃数が増えるほど減衰し、下限50%で頭打ちになる", () => {
    expect(hitDampen(1)).toBeCloseTo(0.85);
    expect(hitDampen(3)).toBeCloseTo(0.55);
    expect(hitDampen(10)).toBe(0.5);
  });
});

describe("aoePercentForLevel", () => {
  it("Lv0は等倍", () => {
    expect(aoePercentForLevel(0)).toBe(1);
  });
  it("Lv1〜Lv5は旧式と同じ伸び（Lv1:80%→Lv5:140%）", () => {
    expect(aoePercentForLevel(1)).toBeCloseTo(0.8);
    expect(aoePercentForLevel(3)).toBeCloseTo(1.1);
    expect(aoePercentForLevel(5)).toBeCloseTo(1.4);
  });
  it("Lv6以降は上限なく対数的に伸び続ける（2026-07-17、150%キャップを撤廃）", () => {
    expect(aoePercentForLevel(6)).toBeCloseTo(1.65);
    expect(aoePercentForLevel(9)).toBeCloseTo(1.98, 1);
    expect(aoePercentForLevel(12)).toBeCloseTo(2.15);
    // 頭打ちにならず、レベルが上がるほど値も増え続ける
    expect(aoePercentForLevel(20)).toBeGreaterThan(aoePercentForLevel(12));
    expect(aoePercentForLevel(100)).toBeGreaterThan(aoePercentForLevel(20));
  });
});

describe("retaliateMultFor", () => {
  it("Lv0は反撃なし(0倍)", () => {
    expect(retaliateMultFor(0)).toBe(0);
  });
  it("Lv1〜Lv3は仕様通りの値になり上限300%で頭打ちになる", () => {
    expect(retaliateMultFor(1)).toBeCloseTo(1.0);
    expect(retaliateMultFor(2)).toBeCloseTo(1.35);
    expect(retaliateMultFor(20)).toBe(3);
  });
});

describe("computeHitDamage", () => {
  it("コンボ倍率を一切参照せずダメージを計算する", () => {
    const dmg = computeHitDamage({
      atk: 10,
      dmgOutMult: 1,
      dmgTakenMult: 1,
      hitIndex: 0,
      aoeMult: 1,
      isCrit: false,
      critMult: 2,
    });
    expect(dmg).toBe(10);
  });
  it("会心時はcritMultが乗る", () => {
    const dmg = computeHitDamage({
      atk: 10,
      dmgOutMult: 1,
      dmgTakenMult: 1,
      hitIndex: 0,
      aoeMult: 1,
      isCrit: true,
      critMult: 2,
    });
    expect(dmg).toBe(20);
  });
  it("挑発などのdmgTakenMultで軽減できる", () => {
    const dmg = computeHitDamage({
      atk: 10,
      dmgOutMult: 1,
      dmgTakenMult: 0.5,
      hitIndex: 0,
      aoeMult: 1,
      isCrit: false,
      critMult: 2,
    });
    expect(dmg).toBe(5);
  });
});
