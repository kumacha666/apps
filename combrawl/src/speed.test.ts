import { describe, expect, it } from "vitest";
import { scaledDelay } from "./speed";

describe("scaledDelay", () => {
  it("normalは元の遅延をほぼそのまま返す", () => {
    expect(scaledDelay(190, "normal")).toBe(190);
  });

  it("fast/ultraの順で遅延が短くなる", () => {
    const normal = scaledDelay(190, "normal");
    const fast = scaledDelay(190, "fast");
    const ultra = scaledDelay(190, "ultra");
    expect(fast).toBeLessThan(normal);
    expect(ultra).toBeLessThan(fast);
  });

  it("どれだけ倍率が小さくても、最小遅延(4ms)を下回らない", () => {
    expect(scaledDelay(1, "ultra")).toBeGreaterThanOrEqual(4);
    expect(scaledDelay(0, "ultra")).toBeGreaterThanOrEqual(4);
  });
});
