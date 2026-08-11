import { describe, it, expect } from "vitest";
import {
  mulberry32, generateOrbitLayout, getFallbackOrbitLayout,
  orbitCountForStage, patternShapeForStage,
} from "./orbitStageGen";
import { hasEntrySource, orbitsHaveRequiredGap } from "./orbit";
import type { OrbitCell } from "./types";

const PILOT_ROWS = 8, PILOT_COLS = 7; // パイロットの盤面サイズ(7x8)固定

function assertLayoutValid(orbits: readonly OrbitCell[], rows: number, cols: number): void {
  for (const o of orbits) {
    expect(o.r).toBeGreaterThanOrEqual(0);
    expect(o.r).toBeLessThan(rows);
    expect(o.c).toBeGreaterThanOrEqual(0);
    expect(o.c).toBeLessThan(cols);
    expect(hasEntrySource(o.r, o.c, o.dir, rows, cols)).toBe(true);
  }
  for (let i = 0; i < orbits.length; i++) {
    for (let j = i + 1; j < orbits.length; j++) {
      expect(orbitsHaveRequiredGap(orbits[i], orbits[j])).toBe(true);
    }
  }
}

// ---------------------------------------------------------------------------
// mulberry32（シード付き擬似乱数）
// ---------------------------------------------------------------------------
describe("mulberry32", () => {
  it("同じシードなら常に同じ数列を返す（決定的）", () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    const seqA = [a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it("異なるシードなら異なる数列を返す", () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect(a()).not.toBe(b());
  });

  it("戻り値は常に[0,1)の範囲", () => {
    const rng = mulberry32(999);
    for (let i = 0; i < 100; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

// ---------------------------------------------------------------------------
// generateOrbitLayout（一括生成→一括検証、フォールバック）
// ---------------------------------------------------------------------------
describe("generateOrbitLayout", () => {
  it("同じステージ(同じseed)なら常に同じレイアウトになる（リトライガチャ防止）", () => {
    const a = generateOrbitLayout(2, PILOT_ROWS, PILOT_COLS, 42);
    const b = generateOrbitLayout(2, PILOT_ROWS, PILOT_COLS, 42);
    expect(a).toEqual(b);
  });

  it("count=1〜3・パイロット盤面(8x7)で、seed 0〜299の全てで有効なレイアウトが生成され、フォールバックに陥らない", () => {
    for (const count of [1, 2, 3]) {
      for (let seed = 0; seed < 300; seed++) {
        const result = generateOrbitLayout(count, PILOT_ROWS, PILOT_COLS, seed);
        expect(result.usedFallback).toBe(false);
        expect(result.orbits.length).toBe(count);
        assertLayoutValid(result.orbits, PILOT_ROWS, PILOT_COLS);
      }
    }
  });

  it("生成に常に失敗する盤面（1x1、影響範囲の外側が存在しない）では上限回数到達後フォールバックを試みる", () => {
    // 1x1の盤面にはフォールバックデータが無いため、フォールバック自体が例外を投げることを確認する
    // （個数を勝手に減らして誤魔化さない、という設計要件の裏付け）
    expect(() => generateOrbitLayout(1, 1, 1, 0)).toThrow(/フォールバックが未整備/);
  });
});

// ---------------------------------------------------------------------------
// getFallbackOrbitLayout（事前検証済みの固定レイアウト）
// ---------------------------------------------------------------------------
describe("getFallbackOrbitLayout", () => {
  it("パイロット盤面(8x7)のcount=1〜3は、いずれも有効な(進入元セル・間隔条件を満たす)固定レイアウトを持つ", () => {
    for (const count of [1, 2, 3]) {
      const layout = getFallbackOrbitLayout(count, PILOT_ROWS, PILOT_COLS);
      expect(layout.length).toBe(count);
      assertLayoutValid(layout, PILOT_ROWS, PILOT_COLS);
    }
  });

  it("未整備の組み合わせは、個数を減らして誤魔化さずエラーを投げる", () => {
    expect(() => getFallbackOrbitLayout(4, PILOT_ROWS, PILOT_COLS)).toThrow(/フォールバックが未整備/);
    expect(() => getFallbackOrbitLayout(1, 99, 99)).toThrow(/フォールバックが未整備/);
  });

  it("返り値を呼び出し側が変更しても、内部の固定データは汚染されない（r/c、およびdirタプルの中身も含む）", () => {
    const layout = getFallbackOrbitLayout(1, PILOT_ROWS, PILOT_COLS);
    layout[0].r = 999;
    layout[0].dir[0] = 999 as never; // dirタプルの要素を直接書き換える(シャロ―コピー漏れを検出する)
    const layoutAgain = getFallbackOrbitLayout(1, PILOT_ROWS, PILOT_COLS);
    expect(layoutAgain[0].r).not.toBe(999);
    expect(layoutAgain[0].dir[0]).not.toBe(999);
  });
});

// ---------------------------------------------------------------------------
// パイロットのステージパラメータ導出（章内相対インデックス、相対Stage1=実Stage501）
// ---------------------------------------------------------------------------
describe("orbitCountForStage", () => {
  it("相対Stage1-8(index 0-7)は1個", () => {
    for (let i = 0; i < 8; i++) expect(orbitCountForStage(i)).toBe(1);
  });
  it("相対Stage9-16(index 8-15)は2個", () => {
    for (let i = 8; i < 16; i++) expect(orbitCountForStage(i)).toBe(2);
  });
  it("相対Stage17-24(index 16-23)は3個", () => {
    for (let i = 16; i < 24; i++) expect(orbitCountForStage(i)).toBe(3);
  });
});

describe("patternShapeForStage", () => {
  it("4パターンを index%4 でローテーションする", () => {
    expect(patternShapeForStage(0)).toBe("perimeter");
    expect(patternShapeForStage(1)).toBe("cross");
    expect(patternShapeForStage(2)).toBe("diagonal");
    expect(patternShapeForStage(3)).toBe("corners");
    expect(patternShapeForStage(4)).toBe("perimeter");
    expect(patternShapeForStage(23)).toBe("corners"); // 23%4=3
  });
});
