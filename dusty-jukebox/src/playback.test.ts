import { describe, expect, test } from "vitest";
import { PlaybackController, streamUrl, type AudioElementLike } from "./playback";

class FakeAudio implements AudioElementLike {
  src = "";
  currentTime = 0;
  playCount = 0;
  pauseCount = 0;
  private errorListener: (() => void) | undefined;
  private pauseListener: (() => void) | undefined;

  async play(): Promise<void> {
    this.playCount += 1;
  }

  pause(): void {
    this.pauseCount += 1;
  }

  addEventListener(type: "error" | "pause", listener: () => void): void {
    if (type === "error") this.errorListener = listener;
    if (type === "pause") this.pauseListener = listener;
  }

  emitError(): void {
    this.errorListener?.();
  }

  emitPause(): void {
    this.pauseListener?.();
  }
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  return { promise: new Promise((nextResolve) => { resolve = nextResolve; }), resolve };
}

describe("streamUrl", () => {
  test("アプリスコープ配下の相対ストリームURLを組み立て、fileIdをエンコードする", () => {
    expect(streamUrl("id/with ? characters")).toBe("./stream/id%2Fwith%20%3F%20characters");
  });
});

describe("PlaybackController", () => {
  test("再試行中に別曲が選ばれたら古い曲を再開しない", async () => {
    const audio = new FakeAudio();
    const token = deferred<string>();
    const playback = new PlaybackController(audio, () => token.promise);

    await playback.play("A");
    audio.currentTime = 12;
    audio.emitError();
    await Promise.resolve();
    await playback.play("B");
    token.resolve("new-token");
    await Promise.resolve();
    await Promise.resolve();

    expect(audio.src).toBe(streamUrl("B"));
    expect(audio.playCount).toBe(2);
  });

  test("再試行中に停止されたら再生を再開しない", async () => {
    const audio = new FakeAudio();
    const token = deferred<string>();
    const playback = new PlaybackController(audio, () => token.promise);

    await playback.play("A");
    audio.emitError();
    await Promise.resolve();
    playback.pause();
    token.resolve("new-token");
    await Promise.resolve();
    await Promise.resolve();

    expect(audio.pauseCount).toBe(1);
    expect(audio.playCount).toBe(1);
  });

  test("ネイティブコントロールで停止されたら再生を再開しない", async () => {
    const audio = new FakeAudio();
    const token = deferred<string>();
    const playback = new PlaybackController(audio, () => token.promise);

    await playback.play("A");
    audio.emitError();
    await Promise.resolve();
    audio.emitPause();
    token.resolve("new-token");
    await Promise.resolve();
    await Promise.resolve();

    expect(audio.playCount).toBe(1);
  });

  test("再試行のトークン更新に失敗したらUI用コールバックへ伝える", async () => {
    const audio = new FakeAudio();
    const errors: unknown[] = [];
    const playback = new PlaybackController(audio, async () => { throw new Error("reauth failed"); }, (error) => errors.push(error));

    await playback.play("A");
    audio.emitError();
    await Promise.resolve();
    await Promise.resolve();

    expect(errors).toHaveLength(1);
    expect((errors[0] as Error).message).toBe("reauth failed");
  });
});
