import { describe, expect, it } from "vitest";
import { applyComboDecay, applyComboGain, applyTurnStats, initialStats, summarizeTurn } from "./stats";
import type { HitResult } from "./types";
import { makeUnit } from "./units";

describe("applyComboGain", () => {
  it("ヒット数分だけコンボが伸び、最大値も更新される(全ヒットを加算。1発目限定ではない)", () => {
    const { combo, maxCombo } = applyComboGain(1, 3, 0);
    expect(combo).toBeCloseTo(1 + 0.45 * 3);
    expect(maxCombo).toBeCloseTo(combo);
  });

  it("既存の最大値より低ければ更新しない", () => {
    const { maxCombo } = applyComboGain(1, 1, 10);
    expect(maxCombo).toBe(10);
  });
});

describe("applyComboDecay", () => {
  it("下限1を割らない", () => {
    expect(applyComboDecay(1.05)).toBeGreaterThanOrEqual(1);
    expect(applyComboDecay(1.0)).toBe(1);
  });
});

describe("summarizeTurn / applyTurnStats", () => {
  it("1ターンの合計ダメージ・撃破数を集計し、演出用スタッツの最大値を更新する", () => {
    const attacker = makeUnit("player", 10, 5);
    const t1 = makeUnit("enemy", 10, 1);
    const t2 = makeUnit("enemy", 10, 1);
    const hits: HitResult[] = [
      { attacker, target: t1, damage: 10, isCrit: false, wasKilled: true, hitIndex: 0, hpAfter: 0 },
      { attacker, target: t2, damage: 8, isCrit: false, wasKilled: false, hitIndex: 0, hpAfter: 2 },
    ];
    const turn = summarizeTurn(hits);
    expect(turn.totalDamage).toBe(18);
    expect(turn.kills).toBe(1);

    const stats = applyTurnStats(initialStats(), turn);
    expect(stats.maxTurnDamage).toBe(18);
    expect(stats.maxTurnKills).toBe(1);

    // 次のターンが下回っていれば更新されない
    const stats2 = applyTurnStats(stats, { totalDamage: 5, kills: 0 });
    expect(stats2.maxTurnDamage).toBe(18);
    expect(stats2.maxTurnKills).toBe(1);
  });
});
