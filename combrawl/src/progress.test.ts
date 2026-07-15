import { describe, expect, it } from "vitest";
import { isEndless, roundLabel } from "./progress";

describe("isEndless", () => {
  it("10層以下はエンドレスではない", () => {
    expect(isEndless(1)).toBe(false);
    expect(isEndless(10)).toBe(false);
  });
  it("11層以降はエンドレス", () => {
    expect(isEndless(11)).toBe(true);
  });
});

describe("roundLabel", () => {
  it("10層以下は分数表記", () => {
    expect(roundLabel(3)).toBe("3 / 10");
  });
  it("11層以降はエンドレス表記", () => {
    expect(roundLabel(14)).toBe("14（エンドレス）");
  });
});
