import { describe, expect, it } from "vitest";
import { applyScoreGain, applyTurnStats, initialStats, summarizeTurn } from "./stats";
import type { HitResult } from "./types";
import { makeUnit } from "./units";

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

describe("applyScoreGain", () => {
  it("与ダメージの合計をそのまま加算する", () => {
    const attacker = makeUnit("player", 10, 5);
    const t1 = makeUnit("enemy", 10, 1);
    const hits: HitResult[] = [
      { attacker, target: t1, damage: 12, isCrit: false, wasKilled: false, hitIndex: 0, hpAfter: -2 },
    ];
    expect(applyScoreGain(100, hits)).toBe(112);
  });

  it("撃破するとダメージ加算に加えて撃破ボーナスが乗る", () => {
    const attacker = makeUnit("player", 10, 5);
    const t1 = makeUnit("enemy", 10, 1);
    const hits: HitResult[] = [
      { attacker, target: t1, damage: 12, isCrit: false, wasKilled: true, hitIndex: 0, hpAfter: 0 },
    ];
    expect(applyScoreGain(0, hits)).toBe(12 + 25);
  });

  it("1ランの累積なので、複数回に分けて呼んでも積み上がる（リセットされない）", () => {
    const attacker = makeUnit("player", 10, 5);
    const t1 = makeUnit("enemy", 10, 1);
    const hits: HitResult[] = [
      { attacker, target: t1, damage: 10, isCrit: false, wasKilled: false, hitIndex: 0, hpAfter: 0 },
    ];
    let score = 0;
    score = applyScoreGain(score, hits);
    score = applyScoreGain(score, hits);
    expect(score).toBe(20);
  });

  it("ヒットが空でもスコアは変化しない", () => {
    expect(applyScoreGain(50, [])).toBe(50);
  });
});
