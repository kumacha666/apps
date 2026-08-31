import { describe, expect, test } from "vitest";
import { PlaybackAuthenticationRequiredError, PlaybackController, streamUrl, type AudioElementLike } from "./playback";

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

describe("streamUrl", () => {
  test("アプリスコープ配下の相対ストリームURLを組み立て、fileIdをエンコードする", () => {
    expect(streamUrl("id/with ? characters")).toBe("./stream/id%2Fwith%20%3F%20characters");
  });
});

describe("PlaybackController", () => {
  test("有効なトークンを確認してからsrcを設定し、すぐに再生を開始する", async () => {
    const audio = new FakeAudio();
    const tokenChecks: string[] = [];
    const playback = new PlaybackController(audio, () => {
      tokenChecks.push("checked");
      expect(audio.src).toBe("");
      return "valid-token";
    });

    await playback.play("A");

    expect(tokenChecks).toEqual(["checked"]);
    expect(audio.src).toBe(streamUrl("A"));
    expect(audio.playCount).toBe(1);
  });

  test("有効なトークンが無い時はsrcを設定せず、認証が必要であることを通知する", async () => {
    const audio = new FakeAudio();
    const playback = new PlaybackController(audio, () => null);

    await expect(playback.play("A")).rejects.toBeInstanceOf(PlaybackAuthenticationRequiredError);
    expect(audio.src).toBe("");
    expect(audio.playCount).toBe(0);
  });

  test("トークン確認中に停止されたら古い要求はsrcを変更しない", async () => {
    const audio = new FakeAudio();
    let resolveToken!: (token: string) => void;
    const token = new Promise<string>((resolve) => { resolveToken = resolve; });
    const playback = new PlaybackController(audio, () => token);

    // play()はトークン確認中に待機するので、別タスクとして開始する。
    const pendingPlay = playback.play("B");
    playback.pause();
    resolveToken("valid-token");
    await pendingPlay;

    expect(audio.src).toBe("");
    expect(audio.playCount).toBe(0);
  });

  test("audio errorは認証更新を自動実行せずUI用コールバックへ伝える", async () => {
    const audio = new FakeAudio();
    const errors: unknown[] = [];
    let tokenChecks = 0;
    const playback = new PlaybackController(audio, () => {
      tokenChecks += 1;
      return "valid-token";
    }, (error) => errors.push(error));

    await playback.play("A");
    audio.emitError();

    expect(errors).toHaveLength(1);
    expect(tokenChecks).toBe(1);
  });
});
