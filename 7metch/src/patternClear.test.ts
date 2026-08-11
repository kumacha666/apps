import { describe, it, expect } from "vitest";
import {
  getPatternCells, targetCellSet, cellKey,
  recordClear, getProgressCount, isPatternComplete, isCountedCause,
} from "./patternClear";
import type { CellPos } from "./types";

function toKeySet(cells: readonly CellPos[]): Set<string> {
  return new Set(cells.map(({ r, c }) => cellKey(r, c)));
}

// ---------------------------------------------------------------------------
// パターン座標の定義式（7x8盤面、設計書の座標定義と一致することを検証）
// ---------------------------------------------------------------------------
describe("getPatternCells (7x8盤面)", () => {
  const rows = 8, cols = 7;

  it("外周: 26マス、四隅・辺境界を含み内側は含まない", () => {
    const cells = getPatternCells("perimeter", rows, cols);
    expect(cells.length).toBe(26);
    const keys = toKeySet(cells);
    expect(keys.has(cellKey(0, 0))).toBe(true);
    expect(keys.has(cellKey(7, 6))).toBe(true);
    expect(keys.has(cellKey(0, 3))).toBe(true); // 上辺中央
    expect(keys.has(cellKey(3, 3))).toBe(false); // 盤面中央(内側)は含まない
  });

  it("中央十字: 20マス（cols=7奇数→中央列1本、rows=8偶数→中央行2本）", () => {
    const cells = getPatternCells("cross", rows, cols);
    expect(cells.length).toBe(20);
    const keys = toKeySet(cells);
    // 中央列(c=3)は全行
    for (let r = 0; r < rows; r++) expect(keys.has(cellKey(r, 3))).toBe(true);
    // 中央行(r=3,4)は全列
    for (let c = 0; c < cols; c++) {
      expect(keys.has(cellKey(3, c))).toBe(true);
      expect(keys.has(cellKey(4, c))).toBe(true);
    }
    // 中央列・中央行のどちらでもない四隅寄りのセルは含まない
    expect(keys.has(cellKey(0, 0))).toBe(false);
    expect(keys.has(cellKey(1, 5))).toBe(false);
  });

  it("対角線: 8マスの階段状ライン（左上から右下、丸め方向を含めて厳密一致）", () => {
    const cells = getPatternCells("diagonal", rows, cols);
    expect(cells).toEqual([
      { r: 0, c: 0 }, { r: 1, c: 1 }, { r: 2, c: 2 }, { r: 3, c: 3 },
      { r: 4, c: 3 }, { r: 5, c: 4 }, { r: 6, c: 5 }, { r: 7, c: 6 },
    ]);
  });

  it("四隅3x3ブロック: 36マス（4ブロック×9マス、重複無し）", () => {
    const cells = getPatternCells("corners", rows, cols);
    expect(cells.length).toBe(36);
    const keys = toKeySet(cells);
    expect(keys.has(cellKey(0, 0))).toBe(true);
    expect(keys.has(cellKey(2, 2))).toBe(true);
    expect(keys.has(cellKey(0, 4))).toBe(true);
    expect(keys.has(cellKey(0, 6))).toBe(true);
    expect(keys.has(cellKey(5, 0))).toBe(true);
    expect(keys.has(cellKey(7, 6))).toBe(true);
    // 中央帯(盤面の中心付近)は四隅ブロックに含まれない
    expect(keys.has(cellKey(3, 3))).toBe(false);
    expect(keys.has(cellKey(0, 3))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// パターン進捗の累積判定・原因による計上/除外
// ---------------------------------------------------------------------------
describe("recordClear / getProgressCount / isPatternComplete", () => {
  const target = targetCellSet([{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 1, c: 0 }]);

  it("プレイヤーの行動（マッチ・特殊起動・アイテム）による消去は計上される", () => {
    const progress = new Set<string>();
    recordClear(progress, [{ r: 0, c: 0 }], target, "match");
    recordClear(progress, [{ r: 0, c: 1 }], target, "special_activate");
    recordClear(progress, [{ r: 1, c: 0 }], target, "item");
    expect(getProgressCount(progress, target)).toBe(3);
    expect(isPatternComplete(progress, target)).toBe(true);
  });

  it("自動デッドロック回復由来の除去は計上されない", () => {
    const progress = new Set<string>();
    recordClear(progress, [{ r: 0, c: 0 }], target, "recovery_shuffle");
    recordClear(progress, [{ r: 0, c: 1 }], target, "recovery_regen");
    expect(getProgressCount(progress, target)).toBe(0);
  });

  it("プレイヤーが使うシャッフルアイテム(useShuffle)由来の除去は計上されない", () => {
    const progress = new Set<string>();
    recordClear(progress, [{ r: 0, c: 0 }], target, "manual_shuffle");
    expect(getProgressCount(progress, target)).toBe(0);
  });

  it("自動回復由来と手動シャッフル由来は、それぞれ独立して除外されなければならない(片方だけのテストでは両方確認したことにならない)", () => {
    // 自動回復だけ計上されないことを確認しても、手動シャッフルが計上されない保証にはならない
    const progressA = new Set<string>();
    recordClear(progressA, [{ r: 0, c: 0 }], target, "recovery_shuffle");
    expect(getProgressCount(progressA, target)).toBe(0);

    const progressB = new Set<string>();
    recordClear(progressB, [{ r: 0, c: 0 }], target, "manual_shuffle");
    expect(getProgressCount(progressB, target)).toBe(0);
  });

  it("同一セルを複数回消去しても二重カウントしない（累積判定、Setで自然に防止）", () => {
    const progress = new Set<string>();
    recordClear(progress, [{ r: 0, c: 0 }], target, "match");
    recordClear(progress, [{ r: 0, c: 0 }], target, "match");
    recordClear(progress, [{ r: 0, c: 0 }], target, "special_activate");
    expect(getProgressCount(progress, target)).toBe(1);
  });

  it("対象外の座標（パターン領域に含まれないセル）はtargetに無関係なので計上されない", () => {
    const progress = new Set<string>();
    recordClear(progress, [{ r: 5, c: 5 }], target, "match");
    expect(getProgressCount(progress, target)).toBe(0);
  });

  it("マッチ解決時に特殊ピース生成で置き換わったセルも、呼び出し側がclearedCellsに含めれば計上される", () => {
    // 見た目上は空にならないセルでも、呼び出し側(将来のboard.ts統合)が
    // 「マッチ解決時の消費座標一覧」に含めて渡せば、通常のmatch原因として計上される
    const progress = new Set<string>();
    const normallyClearedCells: CellPos[] = [{ r: 0, c: 1 }, { r: 1, c: 0 }];
    const specialGenerationSlotCell: CellPos = { r: 0, c: 0 }; // 特殊ピースに置き換わったセル
    recordClear(progress, [...normallyClearedCells, specialGenerationSlotCell], target, "match");
    expect(isPatternComplete(progress, target)).toBe(true);
  });

  it("全マスが揃わない限りisPatternCompleteはfalse", () => {
    const progress = new Set<string>();
    recordClear(progress, [{ r: 0, c: 0 }, { r: 0, c: 1 }], target, "match");
    expect(isPatternComplete(progress, target)).toBe(false);
    expect(getProgressCount(progress, target)).toBe(2);
  });
});

describe("isCountedCause", () => {
  it("プレイヤーの行動による原因はtrue、リカバリー・手動シャッフルはfalse", () => {
    expect(isCountedCause("match")).toBe(true);
    expect(isCountedCause("special_activate")).toBe(true);
    expect(isCountedCause("item")).toBe(true);
    expect(isCountedCause("recovery_shuffle")).toBe(false);
    expect(isCountedCause("recovery_regen")).toBe(false);
    expect(isCountedCause("manual_shuffle")).toBe(false);
  });
});
