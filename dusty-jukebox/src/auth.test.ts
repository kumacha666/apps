import { describe, expect, test } from "vitest";
import { computeExpiresAt, isTokenValid } from "./auth";

describe("auth", () => {
  test("computeExpiresAt: expires_in秒後のepoch msを返す", () => {
    expect(computeExpiresAt(3600, 1000)).toBe(1000 + 3600 * 1000);
  });

  test("isTokenValid: stateが無ければ無効", () => {
    expect(isTokenValid(null)).toBe(false);
    expect(isTokenValid(undefined)).toBe(false);
  });

  test("isTokenValid: 期限まで十分余裕があれば有効", () => {
    const state = { accessToken: "t", expiresAt: 1_000_000 };
    expect(isTokenValid(state, 1_000_000 - 120_000)).toBe(true);
  });

  test("isTokenValid: 期限の60秒前を切ったら無効（安全マージン）", () => {
    const state = { accessToken: "t", expiresAt: 1_000_000 };
    expect(isTokenValid(state, 1_000_000 - 60_000)).toBe(false);
    expect(isTokenValid(state, 1_000_000 - 1_000)).toBe(false);
  });

  test("isTokenValid: 期限を過ぎていれば無効", () => {
    const state = { accessToken: "t", expiresAt: 1_000_000 };
    expect(isTokenValid(state, 1_000_001)).toBe(false);
  });
});
