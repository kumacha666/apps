import { describe, expect, it } from "vitest";
import { applyHitsBySwing, applyScoreGain, applyTurnStats, initialStats, summarizeTurn } from "./stats";
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

describe("applyHitsBySwing", () => {
  it("swingIdが同じヒットはまとめて1アクション分として集計する（全体攻撃化の同時ヒット等）", () => {
    const attacker = makeUnit("player", 10, 5);
    const t1 = makeUnit("enemy", 10, 1);
    const t2 = makeUnit("enemy", 10, 1);
    const hits: HitResult[] = [
      { attacker, target: t1, damage: 10, isCrit: false, wasKilled: true, hitIndex: 0, hpAfter: 0, swingId: 1 },
      { attacker, target: t2, damage: 8, isCrit: false, wasKilled: false, hitIndex: 0, hpAfter: 2, swingId: 1 },
    ];
    const { stats, damageRecordUpdated, killsRecordUpdated } = applyHitsBySwing(initialStats(), hits);
    expect(stats.maxTurnDamage).toBe(18);
    expect(stats.maxTurnKills).toBe(1);
    expect(damageRecordUpdated).toBe(true);
    expect(killsRecordUpdated).toBe(true);
  });

  it("swingIdが異なるヒットは別々のアクションとして集計し、合計として水増ししない（反撃が複数回発動した場合）", () => {
    const retaliator = makeUnit("player", 10, 5);
    const e1 = makeUnit("enemy", 100, 1);
    // 同じ反撃持ちユニットが、3回の別々の被弾に反応して3回反撃した想定（各10ダメージ、1キルずつ）
    const hits: HitResult[] = [
      { attacker: retaliator, target: e1, damage: 10, isCrit: false, wasKilled: true, hitIndex: 0, hpAfter: 0, swingId: 1 },
      { attacker: retaliator, target: e1, damage: 10, isCrit: false, wasKilled: true, hitIndex: 0, hpAfter: 0, swingId: 2 },
      { attacker: retaliator, target: e1, damage: 10, isCrit: false, wasKilled: true, hitIndex: 0, hpAfter: 0, swingId: 3 },
    ];
    const { stats } = applyHitsBySwing(initialStats(), hits);
    // 3件合計の30ダメージ・3キルとして水増しされず、1アクションあたりの実際の値（10ダメージ・1キル）になる
    expect(stats.maxTurnDamage).toBe(10);
    expect(stats.maxTurnKills).toBe(1);
  });

  it("既存の記録を上回らなければrecordUpdatedはfalse", () => {
    const attacker = makeUnit("player", 10, 5);
    const t1 = makeUnit("enemy", 10, 1);
    const initial = { maxTurnDamage: 100, maxTurnKills: 5 };
    const hits: HitResult[] = [
      { attacker, target: t1, damage: 10, isCrit: false, wasKilled: false, hitIndex: 0, hpAfter: 0, swingId: 1 },
    ];
    const { stats, damageRecordUpdated, killsRecordUpdated } = applyHitsBySwing(initial, hits);
    expect(stats.maxTurnDamage).toBe(100);
    expect(damageRecordUpdated).toBe(false);
    expect(killsRecordUpdated).toBe(false);
  });

  it("ダメージだけ更新されキル数は更新されない場合、damageRecordUpdatedだけがtrueになる", () => {
    const attacker = makeUnit("player", 10, 5);
    const t1 = makeUnit("enemy", 100, 1);
    const initial = { maxTurnDamage: 5, maxTurnKills: 3 };
    const hits: HitResult[] = [
      { attacker, target: t1, damage: 20, isCrit: false, wasKilled: false, hitIndex: 0, hpAfter: 80, swingId: 1 },
    ];
    const { stats, damageRecordUpdated, killsRecordUpdated } = applyHitsBySwing(initial, hits);
    expect(stats.maxTurnDamage).toBe(20);
    expect(stats.maxTurnKills).toBe(3);
    expect(damageRecordUpdated).toBe(true);
    expect(killsRecordUpdated).toBe(false);
  });

  it("swingIdが無い（undefined）ヒット同士は1つのグループとして集計される", () => {
    const attacker = makeUnit("player", 10, 5);
    const t1 = makeUnit("enemy", 10, 1);
    const t2 = makeUnit("enemy", 10, 1);
    const hits: HitResult[] = [
      { attacker, target: t1, damage: 10, isCrit: false, wasKilled: false, hitIndex: 0, hpAfter: 0 },
      { attacker, target: t2, damage: 8, isCrit: false, wasKilled: false, hitIndex: 1, hpAfter: 0 },
    ];
    const { stats } = applyHitsBySwing(initialStats(), hits);
    expect(stats.maxTurnDamage).toBe(18);
  });
});
