import { describe, expect, test, vi } from "vitest";
import { PlaybackAuthenticationRequiredError, PlaybackController, PlaybackInterruptedError, PlaybackPausedError, streamUrl, type AudioElementLike } from "./playback";

class FakeAudio implements AudioElementLike {
  src = "";
  currentTime = 0;
  volume = 1;
  paused = true;
  ended = false;
  playCount = 0;
  pauseCount = 0;
  private errorListener: (() => void) | undefined;
  private pauseListener: (() => void) | undefined;

  async play(): Promise<void> {
    this.playCount += 1;
    this.paused = false;
    this.ended = false;
  }

  pause(): void {
    this.pauseCount += 1;
    this.paused = true;
  }

  // 曲が最後まで再生され自然終了した状態を模擬する（pause()と異なりendedもtrueになる）。
  emitEnded(): void {
    this.paused = true;
    this.ended = true;
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

  test("fadeOut指定時は現在再生中の音声をフェードアウトしてから次の曲へ切り替え、フェード開始前のvolumeへ戻す（開発体制#42④）", async () => {
    vi.useFakeTimers();
    const audio = new FakeAudio();
    const playback = new PlaybackController(audio, () => "valid-token");

    await playback.play("A");
    expect(audio.paused).toBe(false);
    // ユーザーが<audio controls>で0.6に調整していた想定（2026-09-08、Codexレビュー指摘：P1。
    // 以前は次の曲の開始時に無条件でvolume=1へ戻していたため、この設定が失われていた）。
    audio.volume = 0.6;

    const srcDuringA = audio.src;
    const playPromise = playback.play("B", 0, { fadeOut: true });
    // フェードの途中（半分程度）まで時間を進めた時点で、srcはまだ曲Aのままで
    // volumeは0.6未満に下がっている（実際にフェードが起きていることの検証）。
    await vi.advanceTimersByTimeAsync(1000);
    expect(audio.src).toBe(srcDuringA);
    expect(audio.volume).toBeGreaterThan(0);
    expect(audio.volume).toBeLessThan(0.6);

    await vi.runAllTimersAsync();
    await playPromise;

    expect(audio.src).toBe(streamUrl("B", playback.currentStreamGeneration() ?? undefined));
    expect(audio.volume).toBe(0.6);
  });

  test("再生中でない（一時停止中の）曲へのfadeOut指定はフェードを待たずすぐに切り替え、volumeに触れない", async () => {
    const audio = new FakeAudio();
    const playback = new PlaybackController(audio, () => "valid-token");

    await playback.play("A");
    playback.pause();
    expect(audio.paused).toBe(true);
    audio.volume = 0.4; // 一時停止中にユーザーが調整した想定

    await playback.play("B", 0, { fadeOut: true });

    expect(audio.src).toBe(streamUrl("B", playback.currentStreamGeneration() ?? undefined));
    expect(audio.volume).toBe(0.4);
  });

  test("fadeOutを指定しない通常の再生ではvolumeへ一切触れない（2026-09-08、Codexレビュー指摘：P1の回帰防止。曲の自然終了時の次曲再生や、フェード無効時の手動スキップでユーザーの音量設定を壊さないこと）", async () => {
    const audio = new FakeAudio();
    const playback = new PlaybackController(audio, () => "valid-token");

    await playback.play("A");
    audio.volume = 0.25;
    await playback.play("B"); // fadeOut未指定

    expect(audio.volume).toBe(0.25);
  });

  test("fadeOut中にトークンが取得できなかった場合もフェード開始前のvolumeへ戻す", async () => {
    vi.useFakeTimers();
    const audio = new FakeAudio();
    const playback = new PlaybackController(audio, () => null);
    audio.paused = false; // 何かが再生中の状態を模擬
    audio.volume = 0.7;

    const playPromise = playback.play("A", 0, { fadeOut: true }).catch(() => {});
    await vi.runAllTimersAsync();
    await playPromise;

    expect(audio.volume).toBe(0.7);
    expect(audio.src).toBe("");
  });

  test("フェード完了時に別のplay()へ追い越されていた場合、そちらのvolume制御を上書きせず直ちに中断する（2026-09-08、Codexレビュー指摘：P1）", async () => {
    vi.useFakeTimers();
    const audio = new FakeAudio();
    const playback = new PlaybackController(audio, () => "valid-token");

    await playback.play("A");
    // 生成直後にハンドラを付けておく（追い越された側は最終的にPlaybackInterruptedErrorで
    // rejectするため、unhandled rejection警告を避ける）。
    const firstFadeError = playback.play("B", 0, { fadeOut: true }).catch((err: unknown) => err);
    // フェードが半分ほど進み、実際にvolumeが下がった後に、追い越す形で新しい再生が
    // 開始される（例：フェード中にキュー外の単曲試聴を始めた場合）。
    await vi.advanceTimersByTimeAsync(1000);
    const volumeMidFade = audio.volume;
    expect(volumeMidFade).toBeLessThan(1);
    const secondPlay = playback.play("C");
    await vi.runAllTimersAsync();
    // 追い越された側は、次の曲へ誤ってcommitされないようPlaybackInterruptedErrorで
    // 中断する（2026-09-08、Codexレビュー指摘：P1続き。以前は正常returnしていた）。
    expect(await firstFadeError).toBeInstanceOf(PlaybackInterruptedError);
    await secondPlay;

    // 最新の再生（C）が正しく開始され、追い越された古いフェードの残りステップによる
    // volume書き換えでは上書きされていない（isCancelledで即座に中断するため、Cが
    // 開始した時点のvolume以降は変化しない）。
    expect(audio.src).toBe(streamUrl("C", playback.currentStreamGeneration() ?? undefined));
    expect(audio.volume).toBe(volumeMidFade);
  });

  test("フェード中にネイティブ操作で明示的に一時停止された場合、フェード完了後も次の曲を勝手に再生しない（2026-09-08、Codexレビュー指摘：P1）", async () => {
    vi.useFakeTimers();
    const audio = new FakeAudio();
    const playback = new PlaybackController(audio, () => "valid-token");

    await playback.play("A");
    audio.volume = 0.5;
    const srcDuringA = audio.src;
    // 生成直後にハンドラを付けておく（runAllTimersAsync()の間に解決してしまうと、
    // 後から.rejects/.catchを付けるまでの間unhandled rejection警告が出るため）。
    const playError = playback.play("B", 0, { fadeOut: true }).catch((err: unknown) => err);
    // フェードの途中で、ユーザーが<audio controls>のネイティブ一時停止ボタンを押す
    // （PlaybackController.pause()を経由しないため、generationは変化しない）。
    await vi.advanceTimersByTimeAsync(500);
    audio.pause();
    expect(audio.paused).toBe(true);
    await vi.runAllTimersAsync();

    // 呼び出し元（PlaybackQueue）が誤って再生成功とみなしcommitしないよう、
    // PlaybackInterruptedErrorをスローする（2026-09-08、Codexレビュー指摘：P1続き）。
    expect(await playError).toBeInstanceOf(PlaybackInterruptedError);

    // 曲Bへは切り替わらず、フェード開始前のvolumeへ戻るだけで再生は始まらない。
    expect(audio.src).toBe(srcDuringA);
    expect(audio.volume).toBe(0.5);
    expect(audio.playCount).toBe(1); // 曲Aの1回のみ（Bのplay()は呼ばれない）
  });

  test("フェード中に旧曲が自然終了した場合は、明示的な一時停止と区別して次の曲への切り替えを継続する（2026-09-08、Codexレビュー指摘：P1続き。自然終了もaudio.pausedはtrueになるため、区別しないと次の曲へcommitされたのに実際にはaudio要素が旧曲のsrcで停止したまま、というUI/キューとの不整合が生じる）", async () => {
    vi.useFakeTimers();
    const audio = new FakeAudio();
    const playback = new PlaybackController(audio, () => "valid-token");

    await playback.play("A");
    audio.volume = 0.5;
    const playPromise = playback.play("B", 0, { fadeOut: true });
    // フェードの途中で、旧曲Aが自然終了する（emitEndedはpause()と異なりendedもtrueにする）。
    await vi.advanceTimersByTimeAsync(500);
    audio.emitEnded();
    expect(audio.paused).toBe(true);
    await vi.runAllTimersAsync();
    await playPromise;

    // 一時停止として扱われず、曲Bへ正しく切り替わる。
    expect(audio.src).toBe(streamUrl("B", playback.currentStreamGeneration() ?? undefined));
    expect(audio.volume).toBe(0.5);
    expect(audio.playCount).toBe(2); // 曲A・曲Bの両方
  });

  test("フェード中にアプリ内の「一時停止」ボタン（PlaybackController.pause()）で中断された場合も、再生成功として誤commitされないようPlaybackPausedErrorを投げ、フェード開始前のvolumeへ戻す（2026-09-08、Codexレビュー指摘：P1続き。pause()はgenerationを進めるため、この分岐はネイティブpauseとは別経路を通る。当初はPlaybackInterruptedErrorを投げるだけでvolumeを戻していなかったため、再開時にフェードで下がったままの音量で再生されてしまっていた）", async () => {
    vi.useFakeTimers();
    const audio = new FakeAudio();
    const playback = new PlaybackController(audio, () => "valid-token");

    await playback.play("A");
    const srcDuringA = audio.src;
    audio.volume = 0.8;
    const playError = playback.play("B", 0, { fadeOut: true }).catch((err: unknown) => err);
    // フェードの途中で、アプリ内の「一時停止」ボタンが押される（PlaybackController.pause()を
    // 直接呼ぶため、audio.pause()だけでなくgenerationも進む）。
    await vi.advanceTimersByTimeAsync(500);
    const volumeMidFade = audio.volume;
    expect(volumeMidFade).toBeLessThan(0.8); // フェードが実際に途中まで進んでいることの前提確認
    playback.pause();
    await vi.runAllTimersAsync();

    const error = await playError;
    expect(error).toBeInstanceOf(PlaybackPausedError);
    expect(error).toBeInstanceOf(PlaybackInterruptedError); // PlaybackPausedErrorはPlaybackInterruptedErrorの一種
    expect(audio.src).toBe(srcDuringA); // 曲Bへは切り替わらない
    expect(audio.volume).toBe(0.8); // フェードで下がった音量のまま取り残されない
  });
  test("フェード中に別のplay()（一時停止ではなく正当な追い越し）に追い越された場合はPlaybackPausedErrorではなくPlaybackInterruptedErrorを投げ、volumeには触れない（2026-09-08、Codexレビュー指摘：P1。一時停止によるものと誤判定すると、PlaybackQueue側が追い越し成功後の新しい操作まで巻き込んで無効化してしまう）", async () => {
    vi.useFakeTimers();
    const audio = new FakeAudio();
    const playback = new PlaybackController(audio, () => "valid-token");

    await playback.play("A");
    audio.volume = 0.8;
    const firstError = playback.play("B", 0, { fadeOut: true }).catch((err: unknown) => err);
    await vi.advanceTimersByTimeAsync(500);
    const volumeMidFade = audio.volume;
    expect(volumeMidFade).toBeLessThan(0.8);

    // pause()ではなく、別の正当なplay()（例：別アルバム選択）に追い越される。
    const secondPlay = playback.play("C");
    await vi.runAllTimersAsync();
    await secondPlay;

    const error = await firstError;
    expect(error).toBeInstanceOf(PlaybackInterruptedError);
    expect(error).not.toBeInstanceOf(PlaybackPausedError);
    // 追い越した側（C）が既に設定したvolumeを、古いフェードの中断処理が上書きしない
    // （volumeMidFadeのままのはず＝Cのvolume制御に一切触れていないことの確認）。
    expect(audio.volume).toBe(volumeMidFade);
  });
  test("cancelPendingTransition()（PlaybackQueue.setList()経由）でフェード中に中断された場合も、フェード開始前のvolumeへ戻す（2026-09-08、Codexレビュー指摘：P1。setList()単独の経路〈直後にplayAt()しない場合を含む〉では他に誰もvolumeを復元しないため、復元しないと旧曲の音量が下がったまま残り続け、以後の通常再生すべてに影響する）", async () => {
    vi.useFakeTimers();
    const audio = new FakeAudio();
    const playback = new PlaybackController(audio, () => "valid-token");

    await playback.play("A");
    audio.volume = 0.8;
    const playError = playback.play("B", 0, { fadeOut: true }).catch((err: unknown) => err);
    await vi.advanceTimersByTimeAsync(500);
    const volumeMidFade = audio.volume;
    expect(volumeMidFade).toBeLessThan(0.8);

    // PlaybackQueue.setList()に相当する中断（pause()ではない）。
    playback.cancelPendingTransition();
    await vi.runAllTimersAsync();

    const error = await playError;
    expect(error).toBeInstanceOf(PlaybackInterruptedError);
    expect(error).not.toBeInstanceOf(PlaybackPausedError); // 一時停止ではないため区別する
    expect(audio.volume).toBe(0.8); // フェードで下がった音量のまま取り残されない
  });
  test("cancelPendingTransition()の直後にさらに別のplay()が続く実際の流れ（setList()の直後にplayAt(0)）でも、フェード開始前のvolumeへ戻す（2026-09-08、Codexレビュー指摘：P1続き。当初の`this.generation === this.cancelledAtGeneration`という厳密一致判定は、cancelPendingTransition()の直後に別のplay()がgenerationをさらに進めてしまう一般的な流れでは不一致になり、volumeが復元されないまま取り残されていた）", async () => {
    vi.useFakeTimers();
    const audio = new FakeAudio();
    const playback = new PlaybackController(audio, () => "valid-token");

    await playback.play("A");
    audio.volume = 0.8;
    const playError = playback.play("B", 0, { fadeOut: true }).catch((err: unknown) => err);
    await vi.advanceTimersByTimeAsync(500);
    expect(audio.volume).toBeLessThan(0.8);

    // PlaybackQueue.setList()相当の中断の直後に、フェードなしの新しいplay()が続く
    // （main.tsのcreateQueueFromFilters()と同じ、setList()の直後にplayAt(0)する実際の流れ）。
    playback.cancelPendingTransition();
    await playback.play("C"); // フェードなしなのでvolumeには一切触れない

    await vi.runAllTimersAsync();
    const error = await playError;
    expect(error).toBeInstanceOf(PlaybackInterruptedError);
    expect(error).not.toBeInstanceOf(PlaybackPausedError);
    // "C"はフェードなしのためvolumeに触れないが、孤立した古いフェードの中断処理により
    // 正しく0.8へ復元されている。
    expect(audio.volume).toBe(0.8);
  });
  test("フェードを追い越した後の、全く無関係な世代でのpause()を、追い越された古い要求が誤って自分への一時停止と取り違えない（2026-09-08、Codexレビュー指摘：P1。不等号比較〈自分より後に一度でもpause()が呼ばれたか〉は、A→Bのフェードを正当な追い越し（Cの再生）で中断した後、Cを一時停止して再開する操作まで拾ってしまい、その全く無関係な一時停止・再開操作をB要求のPlaybackPausedErrorとして誤って投げ、PlaybackQueue側がCの再開操作まで無効化してしまっていた）", async () => {
    vi.useFakeTimers();
    const audio = new FakeAudio();
    const playback = new PlaybackController(audio, () => "valid-token");

    await playback.play("A");
    audio.volume = 0.8;
    const firstError = playback.play("B", 0, { fadeOut: true }).catch((err: unknown) => err);
    await vi.advanceTimersByTimeAsync(500);
    const volumeMidFade = audio.volume;
    expect(volumeMidFade).toBeLessThan(0.8);

    // Bのフェードを、正当な追い越し（Cの再生）が中断する（一時停止ではない）。
    await playback.play("C");
    expect(audio.paused).toBe(false);

    // 古いB要求がまだ次のフェードタイマーステップへ戻る前に、Cを一時停止してすぐ再開する
    // （Bの追い越しとは全く無関係な、Cについての操作）。
    playback.pause();
    await playback.play("C");
    expect(audio.paused).toBe(false);

    // 古いB要求のフェードタイマーが今になって進み、isSuperseded()判定に到達する。
    await vi.runAllTimersAsync();
    const error = await firstError;

    // Bを中断したのは（Cへの）正当な追い越しであって一時停止ではないため、
    // PlaybackPausedErrorではなくPlaybackInterruptedErrorのはず（Cの一時停止・再開操作を
    // Bへの一時停止と誤って取り違えていないことの確認）。
    expect(error).toBeInstanceOf(PlaybackInterruptedError);
    expect(error).not.toBeInstanceOf(PlaybackPausedError);
    // Cは（Bの追い越し中断処理の誤動作により）引き続き再生中のはず。
    expect(audio.paused).toBe(false);
    expect(audio.src).toContain("C");
  });
  test("フェード完了後、audio.srcを設定しaudio.play()の解決待ち中にcancelPendingTransition()で中断された場合も、実際に鳴らないよう一時停止する（2026-09-08、Codexレビュー指摘：P1。従来のgeneration確認はaudio.src設定より前までしか効かず、この区間で中断されると『もう選ばれていない曲』のネイティブaudio.play()がそのまま解決し実際に鳴ってしまっていた）", async () => {
    let resolvePlay!: () => void;
    class SlowPlayAudio extends FakeAudio {
      override async play(): Promise<void> {
        await new Promise<void>((resolve) => { resolvePlay = resolve; });
        return super.play();
      }
    }
    const audio = new SlowPlayAudio();
    const playback = new PlaybackController(audio, () => "valid-token");

    const playPromise = playback.play("A"); // フェードなし、audio.play()が未解決のまま保留
    await vi.waitFor(() => expect(resolvePlay).toBeDefined());
    expect(audio.src).toContain("A");

    // audio.srcの設定後・ネイティブaudio.play()の解決待ち中に、setList()相当の中断が入る。
    playback.cancelPendingTransition();
    resolvePlay(); // ネイティブplay()自体は今になって解決する
    await playPromise;

    // 「もう選ばれていない曲」が実際に鳴り続けないよう一時停止されている。
    expect(audio.paused).toBe(true);
  });
  test("audio.play()の解決待ち中に中断されても、既に別の新しいplay()がsrcを差し替えて再生を開始していた場合はその新しい再生を誤って止めない（2026-09-08、Codexレビュー指摘：P1続き。孤立した古い要求のsrcが既に上書きされているかどうかを確認せず無条件にpause()すると、正当な新しい再生まで巻き込んで止めてしまう）", async () => {
    let resolveOldPlay!: () => void;
    class SlowPlayAudio extends FakeAudio {
      private isFirstPlay = true;
      override async play(): Promise<void> {
        if (this.isFirstPlay) {
          this.isFirstPlay = false;
          await new Promise<void>((resolve) => { resolveOldPlay = resolve; });
        }
        return super.play();
      }
    }
    const audio = new SlowPlayAudio();
    const playback = new PlaybackController(audio, () => "valid-token");

    const oldPlay = playback.play("A"); // audio.play()が未解決のまま保留
    await vi.waitFor(() => expect(resolveOldPlay).toBeDefined());

    // 別の正当な新しいplay()が先に完了し、audio.srcを"B"へ上書きして再生を開始する。
    await playback.play("B");
    expect(audio.src).toContain("B");
    expect(audio.paused).toBe(false);

    // 孤立していた古い要求("A")のネイティブplay()が今になって解決する。
    resolveOldPlay();
    await oldPlay;

    // 新しい正当な再生("B")は誤って止められていない。
    expect(audio.paused).toBe(false);
    expect(audio.src).toContain("B");
  });

  test("pause(true)指定時は現在再生中の音声をフェードアウトしてから実際に一時停止し、フェード開始前のvolumeへ戻す（開発体制#45、2026-09-09、ユーザー要望：手動スキップ時のフェードアウト設定を一時停止にも適用してほしい）", async () => {
    vi.useFakeTimers();
    const audio = new FakeAudio();
    const playback = new PlaybackController(audio, () => "valid-token");

    await playback.play("A");
    audio.volume = 0.6;

    const pausePromise = playback.pause(true);
    // フェードの途中では、まだ実際には一時停止されておらず、volumeだけが下がっている。
    await vi.advanceTimersByTimeAsync(1000);
    expect(audio.paused).toBe(false);
    expect(audio.volume).toBeGreaterThan(0);
    expect(audio.volume).toBeLessThan(0.6);

    await vi.runAllTimersAsync();
    await pausePromise;

    expect(audio.paused).toBe(true);
    expect(audio.volume).toBe(0.6);
  });

  test("pause(true)を、既に一時停止中の音声に対して呼んでもフェードを待たずすぐに完了し、volumeに触れない", async () => {
    const audio = new FakeAudio();
    const playback = new PlaybackController(audio, () => "valid-token");

    await playback.play("A");
    audio.pause(); // ネイティブ一時停止で既に止まっている想定
    audio.volume = 0.4;

    await playback.pause(true);

    expect(audio.paused).toBe(true);
    expect(audio.volume).toBe(0.4);
  });

  test("pause()を指定しない（fadeOut=false）場合は従来通りフェード無しで即座に一時停止する", async () => {
    const audio = new FakeAudio();
    const playback = new PlaybackController(audio, () => "valid-token");

    await playback.play("A");
    audio.volume = 0.9;
    await playback.pause();

    expect(audio.paused).toBe(true);
    expect(audio.volume).toBe(0.9); // フェードしていないのでvolumeには触れない
  });

  test("pause(true)のフェード中にfadeOutを指定しない新しいplay()が開始されると、一時停止側のフェードは中断され新しい再生を止めない。下がったvolumeもフェード開始前の値へ戻す（2026-09-09、ChatGPTレビュー指摘：P2。以前はここでvolumeに一切触れなかったため、fadeOutを指定しない通常のplay()〈単曲試聴・曲の自然終了時のnext()等〉に追い越された場合、下がったままのvolumeが新しい再生へ引き継がれていた）", async () => {
    vi.useFakeTimers();
    const audio = new FakeAudio();
    const playback = new PlaybackController(audio, () => "valid-token");

    await playback.play("A");
    audio.volume = 0.6;
    const pausePromise = playback.pause(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(audio.paused).toBe(false);
    const volumeMidFade = audio.volume;
    expect(volumeMidFade).toBeLessThan(0.6);

    // フェード中にfadeOutを指定しない新しい再生が開始される（例：単曲試聴）。
    await playback.play("B");
    expect(audio.paused).toBe(false);
    expect(audio.src).toContain("B");
    // Bはvolumeに一切触れないため、この時点ではまだフェード中の値のまま。
    expect(audio.volume).toBe(volumeMidFade);

    await vi.runAllTimersAsync();
    await pausePromise;

    // 追い越された一時停止側のフェードは、新しい再生を止めていない。
    expect(audio.paused).toBe(false);
    expect(audio.src).toContain("B");
    // 下がったままのvolumeを新しい再生へ引き継がせず、フェード開始前の値へ戻している。
    expect(audio.volume).toBe(0.6);
  });

  test("一時停止ボタンをフェード中に連打（pause(true)を2回連続で呼ぶ）しても、最終的にフェード開始前の元の音量まで一時停止する（2026-09-09、ChatGPTレビュー指摘：P2続き。以前は2回目の呼び出しが「フェードで既に下がった値」を新しい基準にしてしまい、最終的に本来の音量へ戻らなくなる回帰があった）", async () => {
    vi.useFakeTimers();
    const audio = new FakeAudio();
    const playback = new PlaybackController(audio, () => "valid-token");

    await playback.play("A");
    audio.volume = 0.6;
    const firstPause = playback.pause(true);
    await vi.advanceTimersByTimeAsync(1000);
    const volumeMidFade = audio.volume;
    expect(volumeMidFade).toBeLessThan(0.6);

    // フェード中にもう一度一時停止ボタンが押される。
    const secondPause = playback.pause(true);
    await vi.runAllTimersAsync();
    await firstPause;
    await secondPause;

    // 最終的な一時停止は、連打時点の（既に下がった）音量ではなく、最初のフェード開始前の
    // 元の音量（0.6）まで下がりきってから一時停止している。
    expect(audio.paused).toBe(true);
    expect(audio.volume).toBe(0.6);
  });

  test("フェード付きの手動スキップ（play()側のfadeOut）の最中にpause(true)が呼ばれると、play()側はPlaybackPausedErrorとして中断し、pause()側は実際の一時停止まで進む", async () => {
    vi.useFakeTimers();
    const audio = new FakeAudio();
    const playback = new PlaybackController(audio, () => "valid-token");

    await playback.play("A");
    const srcDuringA = audio.src;
    audio.volume = 0.8;
    const playError = playback.play("B", 0, { fadeOut: true }).catch((err: unknown) => err);
    await vi.advanceTimersByTimeAsync(500);

    const pausePromise = playback.pause(true);
    await vi.runAllTimersAsync();
    await pausePromise;

    const error = await playError;
    expect(error).toBeInstanceOf(PlaybackPausedError);
    expect(audio.src).toBe(srcDuringA); // 曲Bへは切り替わらない
    expect(audio.paused).toBe(true); // 一時停止側のフェードが実際に一時停止まで完了している
  });
});
