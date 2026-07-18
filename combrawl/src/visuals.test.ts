import { describe, expect, it } from "vitest";
import {
  atkThresholdForTier,
  atkTier,
  defThresholdForTier,
  defTier,
  hpThresholdForTier,
  hpTier,
  isHpCapped,
  materialClassForDefTier,
  shapeForAtkTier,
  sizeForHpTier,
  starPolygonClipPath,
  thresholdForValue,
  tierForValue,
} from "./visuals";

describe("tierForValue", () => {
  it("基準値ちょうどはtier1", () => {
    expect(tierForValue(8, 8)).toBe(1);
  });
  it("stepLog2省略時は約2倍ごとに1段階上がる（既定値1）", () => {
    expect(tierForValue(16, 8)).toBe(2);
    expect(tierForValue(32, 8)).toBe(3);
    expect(tierForValue(64, 8)).toBe(4);
  });
  it("stepLog2を指定すると、1段階に必要な倍率を変えられる（例: stepLog2=3で約8倍ごとに1段階）", () => {
    expect(tierForValue(8, 8, 3)).toBe(1);
    expect(tierForValue(8 * 8, 8, 3)).toBe(2); // 8倍でtier2
    expect(tierForValue(8 * 8 * 8, 8, 3)).toBe(3); // 64倍でtier3
  });
  it("基準値未満でも下限tier1を割らない", () => {
    expect(tierForValue(1, 8)).toBe(1);
    expect(tierForValue(0, 8)).toBe(1);
  });
  it("12段階で頭打ちになる（それ以上は伸びても同じtierを返す）", () => {
    expect(tierForValue(8 * 2 ** 11, 8)).toBe(12);
    expect(tierForValue(8 * 2 ** 100, 8)).toBe(12);
    expect(tierForValue(8 * 8 ** 11, 8, 3)).toBe(12); // stepLog2=3でも頭打ちは同じtier12
  });
});

describe("hpTier / atkTier / defTier", () => {
  // 2026-07-18、ユーザー要望でSTEP_LOG2=3（約8倍ごとに1段階）にレア化した結果、
  // 初期値はいずれも最低段階(tier1)から始まるようになった（以前はSTEP_LOG2=1でtier2）
  it("初期値(HP24/ATK4/DEF5)は最低段階(tier1)から始まる", () => {
    expect(hpTier(24)).toBe(1);
    expect(atkTier(4)).toBe(1);
    expect(defTier(5)).toBe(1);
  });
  it("基準値から約8倍ごとに1段階上がる", () => {
    expect(hpTier(8 * 8)).toBe(2); // HP_BASE=8
    expect(atkTier(2 * 8)).toBe(2); // ATK_BASE=2
    expect(defTier(2 * 8)).toBe(2); // DEF_BASE=2
  });
});

describe("thresholdForValue", () => {
  it("tier1は基準値そのもの", () => {
    expect(thresholdForValue(1, 8)).toBe(8);
  });
  it("stepLog2ぶんの倍率でしきい値が上がる（既定stepLog2=1で約2倍ごと）", () => {
    expect(thresholdForValue(2, 8)).toBe(16);
    expect(thresholdForValue(3, 8)).toBe(32);
  });
  it("stepLog2=3では約8倍ごとにしきい値が上がる", () => {
    expect(thresholdForValue(1, 8, 3)).toBe(8);
    expect(thresholdForValue(2, 8, 3)).toBe(64); // 8倍
    expect(thresholdForValue(3, 8, 3)).toBe(512); // 64倍
  });
  it("tierForValueの逆関数になっている（往復させると元のtierに戻る）", () => {
    for (let tier = 1; tier <= 12; tier++) {
      const value = thresholdForValue(tier, 8, 3);
      expect(tierForValue(value, 8, 3)).toBe(tier);
    }
  });
  it("範囲外のtierも1〜12にクランプする", () => {
    expect(thresholdForValue(0, 8)).toBe(thresholdForValue(1, 8));
    expect(thresholdForValue(99, 8)).toBe(thresholdForValue(12, 8));
  });
});

describe("hpThresholdForTier / atkThresholdForTier / defThresholdForTier", () => {
  it("各チャンネルの基準値・STEP_LOG2でしきい値を返す", () => {
    expect(hpThresholdForTier(1)).toBe(8); // HP_BASE=8
    expect(atkThresholdForTier(1)).toBe(2); // ATK_BASE=2
    expect(defThresholdForTier(1)).toBe(2); // DEF_BASE=2
    expect(hpThresholdForTier(2)).toBe(8 * 8); // 8倍ごとに1段階
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
  it("tier12に達するとcapped扱いになる（STEP_LOG2=3で頭打ちする桁数の値を使う）", () => {
    expect(isHpCapped(24)).toBe(false);
    expect(isHpCapped(8 * 8 ** 11)).toBe(true);
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
  it("硬質化(def*=3)を1回積んだだけではtierは上がらない（2026-07-18、レア化。8倍ごとに1段階に対し3倍では足りない）", () => {
    const before = defTier(5);
    const after = defTier(5 * 3);
    expect(after).toBe(before);
  });
  it("硬質化(def*=3)を繰り返し積み重ねればtierは上がる", () => {
    const before = defTier(5);
    // 8倍(STEP_LOG2=3)を確実に超えるまで積む（3^4=81倍 > 8倍）
    const after = defTier(5 * 3 * 3 * 3 * 3);
    expect(after).toBeGreaterThan(before);
    expect(materialClassForDefTier(after)).not.toBe(materialClassForDefTier(before));
  });
});
