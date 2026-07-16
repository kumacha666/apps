import { describe, expect, it } from "vitest";
import { isEndless, roundLabel, RUN_LENGTH_OPTIONS } from "./progress";

describe("isEndless", () => {
  it("finalRound以下はエンドレスではない", () => {
    expect(isEndless(1, 10)).toBe(false);
    expect(isEndless(10, 10)).toBe(false);
  });
  it("finalRoundを超えるとエンドレス", () => {
    expect(isEndless(11, 10)).toBe(true);
  });
  it("finalRoundが15層/20層でも同じ基準で判定する", () => {
    expect(isEndless(15, 15)).toBe(false);
    expect(isEndless(16, 15)).toBe(true);
    expect(isEndless(20, 20)).toBe(false);
    expect(isEndless(21, 20)).toBe(true);
  });
});

describe("roundLabel", () => {
  it("finalRound以下は分数表記", () => {
    expect(roundLabel(3, 10)).toBe("3 / 10");
  });
  it("finalRoundを超えるとエンドレス表記", () => {
    expect(roundLabel(14, 10)).toBe("14（エンドレス）");
  });
  it("finalRoundが15層/20層でも分母に反映される", () => {
    expect(roundLabel(3, 15)).toBe("3 / 15");
    expect(roundLabel(3, 20)).toBe("3 / 20");
  });
});

describe("RUN_LENGTH_OPTIONS", () => {
  it("10/15/20層の3種類を提供する", () => {
    expect(RUN_LENGTH_OPTIONS).toEqual([10, 15, 20]);
  });
});
