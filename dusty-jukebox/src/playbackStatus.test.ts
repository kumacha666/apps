import { describe, expect, it } from "vitest";
import { playbackStatusForEvent } from "./playbackStatus";

describe("playbackStatusForEvent", () => {
  it("returns the paused status for a pause event", () => {
    expect(playbackStatusForEvent("pause")).toBe("一時停止中");
  });

  it("returns the playing status for a play event", () => {
    expect(playbackStatusForEvent("play")).toBe("再生中");
  });
});
