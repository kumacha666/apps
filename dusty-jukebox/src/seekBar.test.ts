import { describe, expect, it } from "vitest";
import { formatSeekTime, isSeekableDuration } from "./seekBar";

describe("formatSeekTime", () => {
  it("秒数を分:秒表記へ変換する", () => {
    expect(formatSeekTime(0)).toBe("0:00");
    expect(formatSeekTime(5)).toBe("0:05");
    expect(formatSeekTime(65)).toBe("1:05");
    expect(formatSeekTime(599)).toBe("9:59");
  });

  it("1時間以上は時:分:秒表記になる", () => {
    expect(formatSeekTime(3600)).toBe("1:00:00");
    expect(formatSeekTime(3661)).toBe("1:01:01");
  });

  it("小数は切り捨てる", () => {
    expect(formatSeekTime(65.9)).toBe("1:05");
  });

  it("NaN/Infinity/負値は0:00を返す", () => {
    expect(formatSeekTime(NaN)).toBe("0:00");
    expect(formatSeekTime(Infinity)).toBe("0:00");
    expect(formatSeekTime(-1)).toBe("0:00");
  });
});

describe("isSeekableDuration", () => {
  it("有限の正数はtrue", () => {
    expect(isSeekableDuration(180)).toBe(true);
  });

  it("0以下・NaN・Infinityはfalse", () => {
    expect(isSeekableDuration(0)).toBe(false);
    expect(isSeekableDuration(-1)).toBe(false);
    expect(isSeekableDuration(NaN)).toBe(false);
    expect(isSeekableDuration(Infinity)).toBe(false);
  });
});
