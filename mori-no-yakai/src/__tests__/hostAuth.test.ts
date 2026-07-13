import { describe, it, expect } from "vitest";
import { verifyHostPassphrase } from "../hostAuth";

describe("verifyHostPassphrase", () => {
  it("正しい合言葉なら true", () => {
    expect(verifyHostPassphrase("1night")).toBe(true);
  });

  it("誤った合言葉なら false", () => {
    expect(verifyHostPassphrase("wrong")).toBe(false);
  });

  it("前後の空白は無視する", () => {
    expect(verifyHostPassphrase("  1night  ")).toBe(true);
  });

  it("大文字小文字は区別する", () => {
    expect(verifyHostPassphrase("1Night")).toBe(false);
  });

  it("空文字なら false", () => {
    expect(verifyHostPassphrase("")).toBe(false);
  });
});
