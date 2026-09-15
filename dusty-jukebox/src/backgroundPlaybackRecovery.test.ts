import { describe, expect, it } from "vitest";
import { shouldAttemptBackgroundPlaybackRecovery } from "./backgroundPlaybackRecovery";

function baseState() {
  return { userPausedPlayback: false, canResumeCurrent: true, audioPaused: true, audioEnded: false };
}

describe("shouldAttemptBackgroundPlaybackRecovery", () => {
  it("recovers when the queue should be playing but the audio element is silently paused", () => {
    expect(shouldAttemptBackgroundPlaybackRecovery(baseState())).toBe(true);
  });

  it("does not override an explicit user pause", () => {
    expect(shouldAttemptBackgroundPlaybackRecovery({ ...baseState(), userPausedPlayback: true })).toBe(false);
  });

  it("does nothing when there is no resumable queue playback", () => {
    expect(shouldAttemptBackgroundPlaybackRecovery({ ...baseState(), canResumeCurrent: false })).toBe(false);
  });

  it("does nothing when audio is already playing", () => {
    expect(shouldAttemptBackgroundPlaybackRecovery({ ...baseState(), audioPaused: false })).toBe(false);
  });

  it("does nothing when the track ended naturally (defers to the ended handler)", () => {
    expect(shouldAttemptBackgroundPlaybackRecovery({ ...baseState(), audioEnded: true })).toBe(false);
  });
});
