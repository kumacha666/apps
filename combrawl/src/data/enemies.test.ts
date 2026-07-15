import { describe, expect, it } from "vitest";
import { FINAL_ROUND, setupEnemies } from "./enemies";

describe("setupEnemies", () => {
  it("ラウンド1は連撃付与なし", () => {
    const units = setupEnemies(1);
    expect(units.length).toBe(2);
    expect(units.every((u) => u.attackCount === 1)).toBe(true);
  });

  it("ラウンド2以降は1体に連撃が付与される", () => {
    const units = setupEnemies(2);
    const rapidCount = units.filter((u) => u.attackCount > 1).length;
    expect(rapidCount).toBe(1);
  });

  it("体数はラウンドに応じて増え、上限5で頭打ちになる", () => {
    expect(setupEnemies(1).length).toBe(2);
    expect(setupEnemies(9).length).toBe(5);
    expect(setupEnemies(30).length).toBe(5); // エンドレスでラウンドが伸びても上限は変わらない
  });

  it("FINAL_ROUNDを超えても同じ式で敵編成を生成し続けられる(エンドレスモードの前提)", () => {
    const beyondFinal = setupEnemies(FINAL_ROUND + 5);
    expect(beyondFinal.length).toBeGreaterThan(0);
    expect(beyondFinal[0].hp).toBe(12 + (FINAL_ROUND + 5) * 5);
  });
});
