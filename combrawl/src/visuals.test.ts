import { describe, expect, it } from "vitest";
import {
  atkTier,
  defTier,
  hpTier,
  isHpCapped,
  materialClassForDefTier,
  shapeForAtkTier,
  sizeForHpTier,
  starPolygonClipPath,
  tierForValue,
} from "./visuals";

describe("tierForValue", () => {
  it("基準値ちょうどはtier1", () => {
    expect(tierForValue(8, 8)).toBe(1);
  });
  it("約2倍ごとに1段階上がる", () => {
    expect(tierForValue(16, 8)).toBe(2);
    expect(tierForValue(32, 8)).toBe(3);
    expect(tierForValue(64, 8)).toBe(4);
  });
  it("基準値未満でも下限tier1を割らない", () => {
    expect(tierForValue(1, 8)).toBe(1);
    expect(tierForValue(0, 8)).toBe(1);
  });
  it("12段階で頭打ちになる（それ以上は伸びても同じtierを返す）", () => {
    expect(tierForValue(8 * 2 ** 11, 8)).toBe(12);
    expect(tierForValue(99360, 8)).toBe(12);
    expect(tierForValue(8 * 2 ** 100, 8)).toBe(12);
  });
});

describe("hpTier / atkTier / defTier", () => {
  it("初期値(HP24/ATK4/DEF5)は低〜中段階に収まる", () => {
    expect(hpTier(24)).toBe(2);
    expect(atkTier(4)).toBe(2);
    expect(defTier(5)).toBe(2);
  });
  it("実測の巨大化ビルド(HP約99,360)は最大tier12に達する", () => {
    expect(hpTier(99360)).toBe(12);
  });
});

describe("sizeForHpTier / isHpCapped", () => {
  it("tierが上がるほどサイズも大きくなる", () => {
    expect(sizeForHpTier(1)).toBe(22);
    expect(sizeForHpTier(12)).toBe(140);
    expect(sizeForHpTier(6)).toBeGreaterThan(sizeForHpTier(3));
  });
  it("範囲外のtierも1〜12にクランプする", () => {
    expect(sizeForHpTier(0)).toBe(22);
    expect(sizeForHpTier(99)).toBe(140);
  });
  it("tier12に達するとcapped扱いになる", () => {
    expect(isHpCapped(24)).toBe(false);
    expect(isHpCapped(99360)).toBe(true);
  });
});

describe("shapeForAtkTier", () => {
  it("tier1〜3は角の丸みが変わる四角形（星ではない）", () => {
    expect(shapeForAtkTier(1)).toEqual({ kind: "rounded", borderRadiusPercent: 50 });
    expect(shapeForAtkTier(2)).toEqual({ kind: "rounded", borderRadiusPercent: 26 });
    expect(shapeForAtkTier(3)).toEqual({ kind: "rounded", borderRadiusPercent: 6 });
  });
  it("tier4〜12はN芒星（tier=頂点数）になる", () => {
    expect(shapeForAtkTier(4)).toEqual({ kind: "star", points: 4 });
    expect(shapeForAtkTier(12)).toEqual({ kind: "star", points: 12 });
  });
});

describe("starPolygonClipPath", () => {
  it("polygon(...)形式の文字列を返し、頂点数×2個の座標を含む", () => {
    const clip = starPolygonClipPath(5);
    expect(clip.startsWith("polygon(")).toBe(true);
    const coordCount = clip.split(",").length;
    expect(coordCount).toBe(10); // 5芒星 = 外側5点+内側5点
  });
});

describe("materialClassForDefTier", () => {
  it("tier1はmat-none、tier12はmat-void", () => {
    expect(materialClassForDefTier(1)).toBe("mat-none");
    expect(materialClassForDefTier(12)).toBe("mat-void");
  });
  it("硬質化(def*=3)でtierが上がる", () => {
    const before = defTier(5);
    const after = defTier(5 * 3);
    expect(after).toBeGreaterThan(before);
    expect(materialClassForDefTier(after)).not.toBe(materialClassForDefTier(before));
  });
});
