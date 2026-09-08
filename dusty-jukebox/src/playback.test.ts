import { describe, expect, test, vi } from "vitest";
import { PlaybackAuthenticationRequiredError, PlaybackController, streamUrl, type AudioElementLike } from "./playback";

class FakeAudio implements AudioElementLike {
  src = "";
  currentTime = 0;
  volume = 1;
  paused = true;
  playCount = 0;
  pauseCount = 0;
  private errorListener: (() => void) | undefined;
  private pauseListener: (() => void) | undefined;

  async play(): Promise<void> {
    this.playCount += 1;
    this.paused = false;
  }

  pause(): void {
    this.pauseCount += 1;
    this.paused = true;
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
    expect(audio.src).toBe(streamUrl("A", playback.currentStreamGeneration() ?? undefined));
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

  test("SWから現在のストリームの401が通知された後のaudio errorは認証更新待ちとして伝える", async () => {
    const audio = new FakeAudio();
    const errors: unknown[] = [];
    const playback = new PlaybackController(audio, () => "valid-token", (error) => errors.push(error));

    await playback.play("A");
    expect(playback.markStreamTokenRejected("A", playback.currentGeneration())).toBe(0);
    audio.emitError();

    expect(errors[0]).toBeInstanceOf(PlaybackAuthenticationRequiredError);
  });

  test("別の曲に届いた古い401は現在の再生を認証待ちにしない", async () => {
    const audio = new FakeAudio();
    const errors: unknown[] = [];
    const playback = new PlaybackController(audio, () => "valid-token", (error) => errors.push(error));

    await playback.play("A");
    expect(playback.markStreamTokenRejected("B", playback.currentGeneration())).toBeNull();
    audio.emitError();

    expect(errors[0]).not.toBeInstanceOf(PlaybackAuthenticationRequiredError);
  });

  test("一時停止後に届いた古い401は認証継続を要求しない", async () => {
    const audio = new FakeAudio();
    const playback = new PlaybackController(audio, () => "valid-token");

    await playback.play("A");
    playback.pause();

    expect(playback.markStreamTokenRejected("A", playback.currentGeneration())).toBeNull();
  });

  test("ネイティブ操作で一時停止して再開しても、同じストリーム401を認証継続へ結び付ける", async () => {
    const audio = new FakeAudio();
    const errors: unknown[] = [];
    const playback = new PlaybackController(audio, () => "valid-token", (error) => errors.push(error));

    await playback.play("A");
    const streamGeneration = playback.currentStreamGeneration();
    audio.emitPause(); // <audio controls> による一時停止（PlaybackController.pause()ではない）

    expect(streamGeneration).not.toBeNull();
    expect(playback.markStreamTokenRejected("A", streamGeneration!)).toBe(0);
    audio.emitError();
    expect(errors[0]).toBeInstanceOf(PlaybackAuthenticationRequiredError);
  });

  test("認証更新後の再生は失効直前の位置から再開する", async () => {
    const audio = new FakeAudio();
    const playback = new PlaybackController(audio, () => "valid-token");

    await playback.play("A");
    audio.currentTime = 73.5;
    await playback.play("A", 73.5);

    expect(audio.currentTime).toBe(73.5);
  });

  test("fadeOut指定時は現在再生中の音声をフェードアウトしてから次の曲へ切り替え、volumeを1へ戻す（開発体制#42④）", async () => {
    vi.useFakeTimers();
    const audio = new FakeAudio();
    const playback = new PlaybackController(audio, () => "valid-token");

    await playback.play("A");
    expect(audio.paused).toBe(false);

    const srcDuringA = audio.src;
    const playPromise = playback.play("B", 0, { fadeOut: true });
    // フェードの途中（半分程度）まで時間を進めた時点で、srcはまだ曲Aのままで
    // volumeは1未満に下がっている（実際にフェードが起きていることの検証）。
    await vi.advanceTimersByTimeAsync(1000);
    expect(audio.src).toBe(srcDuringA);
    expect(audio.volume).toBeGreaterThan(0);
    expect(audio.volume).toBeLessThan(1);

    await vi.runAllTimersAsync();
    await playPromise;

    expect(audio.src).toBe(streamUrl("B", playback.currentStreamGeneration() ?? undefined));
    expect(audio.volume).toBe(1);
  });

  test("再生中でない（一時停止中の）曲へのfadeOut指定はフェードを待たずすぐに切り替える", async () => {
    const audio = new FakeAudio();
    const playback = new PlaybackController(audio, () => "valid-token");

    await playback.play("A");
    playback.pause();
    expect(audio.paused).toBe(true);

    await playback.play("B", 0, { fadeOut: true });

    expect(audio.src).toBe(streamUrl("B", playback.currentStreamGeneration() ?? undefined));
    expect(audio.volume).toBe(1);
  });

  test("fadeOut中にトークンが取得できなかった場合もvolumeを1へ戻す", async () => {
    vi.useFakeTimers();
    const audio = new FakeAudio();
    const playback = new PlaybackController(audio, () => null);
    audio.paused = false; // 何かが再生中の状態を模擬

    const playPromise = playback.play("A", 0, { fadeOut: true }).catch(() => {});
    await vi.runAllTimersAsync();
    await playPromise;

    expect(audio.volume).toBe(1);
    expect(audio.src).toBe("");
  });
});
