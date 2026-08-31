import { describe, expect, test } from "vitest";
import { PlaybackContinuationRegistry } from "./playbackContinuation";

describe("PlaybackContinuationRegistry", () => {
  test("native play()が未解決でも、先に登録された継続操作へ401を結び付けられる", async () => {
    const registry = new PlaybackContinuationRegistry();
    let settleNativePlay!: () => void;
    const nativePlay = new Promise<void>((resolve) => { settleNativePlay = resolve; });
    const continuation = registry.register({ fileId: "song-a", generation: 3, resume: async () => true });

    registry.recordTokenRequest("request-a", "song-a", 3, "token-a");
    expect(registry.acceptTokenRejection("request-a", "song-a", "token-a")).toBe(continuation);

    settleNativePlay();
    await nativePlay;
  });

  test("更新済みトークンに対して古いストリーム401が遅れて届いても継続操作を返さない", () => {
    const registry = new PlaybackContinuationRegistry();
    registry.register({ fileId: "song-a", generation: 4, resume: async () => true });
    registry.recordTokenRequest("old-request", "song-a", 4, "token-old");

    expect(registry.acceptTokenRejection("old-request", "song-a", "token-new")).toBeNull();
  });

  test("同じ曲を再生し直した後の古い世代の401は無視する", () => {
    const registry = new PlaybackContinuationRegistry();
    registry.recordTokenRequest("old-request", "song-a", 4, "token-a");
    registry.register({ fileId: "song-a", generation: 5, resume: async () => true });

    expect(registry.acceptTokenRejection("old-request", "song-a", "token-a")).toBeNull();
  });

  test("ページ側にトークンが無い要求も現在の継続操作へ結び付ける", () => {
    const registry = new PlaybackContinuationRegistry();
    const continuation = registry.register({ fileId: "song-a", generation: 4, resume: async () => true });

    registry.recordTokenRequest("missing-token", "song-a", 4, null);

    expect(registry.acceptTokenRejection("missing-token", "song-a", null)).toBe(continuation);
  });
});
