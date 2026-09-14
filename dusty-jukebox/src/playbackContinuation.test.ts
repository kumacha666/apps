import { describe, expect, test } from "vitest";
import { PlaybackContinuationRegistry } from "./playbackContinuation";

describe("PlaybackContinuationRegistry", () => {
  test("native play()が未解決でも、先に登録された継続操作へ401を結び付けられる", async () => {
    const registry = new PlaybackContinuationRegistry();
    let settleNativePlay!: () => void;
    const nativePlay = new Promise<void>((resolve) => { settleNativePlay = resolve; });
    const continuation = registry.register({ fileId: "song-a", streamId: 3, resume: async () => true });

    registry.recordTokenRequest("request-a", "song-a", 3, "token-a");
    expect(registry.acceptTokenRejection("request-a", "song-a", "token-a")).toBe(continuation);

    settleNativePlay();
    await nativePlay;
  });

  test("更新済みトークンに対して古いストリーム401が遅れて届いても継続操作を返さない", () => {
    const registry = new PlaybackContinuationRegistry();
    registry.register({ fileId: "song-a", streamId: 4, resume: async () => true });
    registry.recordTokenRequest("old-request", "song-a", 4, "token-old");

    expect(registry.acceptTokenRejection("old-request", "song-a", "token-new")).toBeNull();
  });

  test("同じ曲を再生し直した（新しいstreamIdで再登録した）後の古い世代の401は無視する", () => {
    const registry = new PlaybackContinuationRegistry();
    registry.recordTokenRequest("old-request", "song-a", 4, "token-a");
    registry.register({ fileId: "song-a", streamId: 5, resume: async () => true });

    // streamId 4の要求だが、Mapにはstream 5のエントリしか無い（4は登録されたことが無い、
    // または後述のclearStreamId()で明示的に無効化された）ため見つからない。
    expect(registry.acceptTokenRejection("old-request", "song-a", "token-a")).toBeNull();
  });

  test("ページ側にトークンが無い要求も現在の継続操作へ結び付ける", () => {
    const registry = new PlaybackContinuationRegistry();
    const continuation = registry.register({ fileId: "song-a", streamId: 4, resume: async () => true });

    registry.recordTokenRequest("missing-token", "song-a", 4, null);

    expect(registry.acceptTokenRejection("missing-token", "song-a", null)).toBe(continuation);
  });

  test("別経路がトークンを先にクリアしても現在のストリーム401を受理する", () => {
    const registry = new PlaybackContinuationRegistry();
    const continuation = registry.register({ fileId: "song-a", streamId: 4, resume: async () => true });
    registry.recordTokenRequest("request-a", "song-a", 4, "token-a");

    expect(registry.acceptTokenRejection("request-a", "song-a", null)).toBe(continuation);
  });

  // ロールスワップ（PR2）向け：streamIdが衝突しない限り、複数の継続を同時に保持できる
  // （A/B両スロットが同時にストリーミングしているケースの再現）。それぞれのstreamIdへの401が、
  // 互いを巻き込まず正しく自分の継続だけに結び付く。
  test("異なるstreamIdの継続は互いに独立して共存し、それぞれのstreamIdの401だけに反応する（複数スロット同時ストリーミングの再現）", () => {
    const registry = new PlaybackContinuationRegistry();
    const continuationA = registry.register({ fileId: "song-a", streamId: 10, resume: async () => true });
    const continuationB = registry.register({ fileId: "song-b", streamId: 11, resume: async () => true });

    registry.recordTokenRequest("request-a", "song-a", 10, "token-a");
    registry.recordTokenRequest("request-b", "song-b", 11, "token-b");

    // Bへの401はBの継続だけを返す（Aの継続を誤って返さない）。
    expect(registry.acceptTokenRejection("request-b", "song-b", "token-b")).toBe(continuationB);
    // Aはこの後も引き続き有効（Bの401処理に巻き込まれていない）。
    expect(registry.acceptTokenRejection("request-a", "song-a", "token-a")).toBe(continuationA);
  });

  test("clearStreamId()は指定したstreamIdの継続だけを無効化し、他のstreamIdには影響しない", () => {
    const registry = new PlaybackContinuationRegistry();
    const continuationA = registry.register({ fileId: "song-a", streamId: 10, resume: async () => true });
    const continuationB = registry.register({ fileId: "song-b", streamId: 11, resume: async () => true });

    registry.clearStreamId(10);

    expect(registry.isCurrent(continuationA)).toBe(false);
    expect(registry.isCurrent(continuationB)).toBe(true);
  });

  // クロスフェード無効時（既定）は毎回の再生が新しいstreamIdでregister()するだけで、
  // clearStreamId()はクロスフェード専用の経路からしか呼ばれないため、通常再生を続ける限り
  // 古いエントリが除去されないままだった（2026-09-14〜、Codexレビュー指摘：P2「Evict
  // superseded playback continuations」）。上限を超えたら古い順に追い出すことを確認する。
  test("register()の件数が上限を超えると、最も古い継続から追い出される（無期限の蓄積を防ぐ）", () => {
    const registry = new PlaybackContinuationRegistry();
    const first = registry.register({ fileId: "song-0", streamId: 0, resume: async () => true });
    for (let streamId = 1; streamId < 32; streamId += 1) {
      registry.register({ fileId: `song-${streamId}`, streamId, resume: async () => true });
    }
    // まだ上限（32件）以内のため、最初の登録もまだ有効。
    expect(registry.isCurrent(first)).toBe(true);

    // 33件目の登録で上限を超え、最も古い（streamId 0）が追い出される。
    const last = registry.register({ fileId: "song-32", streamId: 32, resume: async () => true });
    expect(registry.isCurrent(first)).toBe(false);
    expect(registry.isCurrent(last)).toBe(true);
  });

  test("同じstreamIdで登録し直すと、isCurrent()は新しい継続オブジェクトだけを現在有効とみなす", () => {
    const registry = new PlaybackContinuationRegistry();
    const first = registry.register({ fileId: "song-a", streamId: 10, resume: async () => true });
    const second = registry.register({ fileId: "song-a", streamId: 10, resume: async () => true });

    expect(registry.isCurrent(first)).toBe(false);
    expect(registry.isCurrent(second)).toBe(true);
  });
});
