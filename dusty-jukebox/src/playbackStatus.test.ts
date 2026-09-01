import { describe, expect, it } from "vitest";
import { playbackStatusForEvent } from "./playbackStatus";

describe("playbackStatusForEvent", () => {
  const normalState = {
    hasAuthenticationNotice: false,
    hasMediaError: false,
    hasEnded: false,
  };

  it("does not overwrite an authentication notice when pause fires", () => {
    expect(playbackStatusForEvent("pause", { ...normalState, hasAuthenticationNotice: true })).toBeNull();
  });

  it("does not overwrite a media error when pause fires", () => {
    expect(playbackStatusForEvent("pause", { ...normalState, hasMediaError: true })).toBeNull();
  });

  it("does not report paused when pause fires immediately before ended", () => {
    expect(playbackStatusForEvent("pause", { ...normalState, hasEnded: true })).toBeNull();
  });

  it("returns the paused status for an ordinary pause event", () => {
    expect(playbackStatusForEvent("pause", normalState)).toBe("一時停止中");
  });

  it("returns the playing status for an ordinary playing event", () => {
    expect(playbackStatusForEvent("playing", normalState)).toBe("再生中");
  });
});
