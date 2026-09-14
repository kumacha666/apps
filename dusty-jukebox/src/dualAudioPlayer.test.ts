import { describe, expect, test } from "vitest";
import { streamUrl, type AudioElementLike } from "./playback";
import { DualAudioPlayer, createSharedStreamIdAllocator } from "./dualAudioPlayer";
import { PlaybackContinuationRegistry } from "./playbackContinuation";

type FakeAudioEventType = "error" | "pause" | "ended" | "playing" | "timeupdate" | "durationchange" | "loadedmetadata" | "emptied";

class FakeAudio implements AudioElementLike {
  src = "";
  currentTime = 0;
  volume = 1;
  paused = true;
  ended = false;
  duration = NaN;
  playCount = 0;
  private readonly listeners = new Map<FakeAudioEventType, Array<() => void>>();

  async play(): Promise<void> {
    this.playCount += 1;
    this.paused = false;
    this.ended = false;
  }

  pause(): void {
    this.paused = true;
  }

  addEventListener(type: FakeAudioEventType, listener: () => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  emit(type: FakeAudioEventType): void {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }

  emitEnded(): void {
    this.paused = true;
    this.ended = true;
    this.emit("ended");
  }
}

function createPlayer(): { player: DualAudioPlayer; audioA: FakeAudio; audioB: FakeAudio; transitions: string[] } {
  const audioA = new FakeAudio();
  const audioB = new FakeAudio();
  const transitions: string[] = [];
  const player = new DualAudioPlayer(audioA, audioB, () => "valid-token", () => {}, () => transitions.push("transition"));
  return { player, audioA, audioB, transitions };
}

describe("createSharedStreamIdAllocator", () => {
  test("呼び出しごとに1ずつ増える値を返す", () => {
    const allocate = createSharedStreamIdAllocator();
    expect(allocate()).toBe(1);
    expect(allocate()).toBe(2);
    expect(allocate()).toBe(3);
  });

  test("seedを指定するとその次の値から始まる", () => {
    const allocate = createSharedStreamIdAllocator(100);
    expect(allocate()).toBe(101);
  });
});

describe("DualAudioPlayer", () => {
  test("play()はactive側（既定でスロット0）のaudio要素へ委譲する", async () => {
    const { player, audioA, audioB } = createPlayer();
    await player.play("A");
    expect(audioA.playCount).toBe(1);
    expect(audioB.playCount).toBe(0);
    expect(audioA.src).toContain("A");
  });

  // 2026-09-14、main.ts統合時にE2Eで検出した回帰の直接的な回帰防止テスト：
  // registerQueuePlaybackContinuation()等（main.ts）は、Drive 401後の認証継続レジストリに
  // 登録するgenerationを`currentGeneration() + 1`（次のplay()呼び出し後の内部generationの
  // 予測値）として渡す。この予測が正しく機能するのは、streamGeneration（実際にSW/認証継続と
  // やり取りされる値）が内部generationと同じ数列である場合に限る。allocateStreamIdを
  // 注入しない既定のコンストラクタでは、この前提を壊さないことを保証する。
  test("allocateStreamIdを注入しない場合、streamGenerationは各スロット自身のcurrentGeneration()と一致し続ける（'currentGeneration()+1'予測が成立する前提）", async () => {
    const { player } = createPlayer();
    await player.play("A");
    expect(player.currentStreamGeneration()).toBe(player.currentGeneration());
    await player.play("B");
    expect(player.currentStreamGeneration()).toBe(player.currentGeneration());
    player.cancelPendingTransition(); // streamGenerationを更新しない操作
    await player.play("C");
    expect(player.currentStreamGeneration()).toBe(player.currentGeneration());
  });

  test("pause()/cancelPendingTransition()/loadPaused()/markStreamTokenRejected()/currentGeneration()/currentStreamGeneration()もactive側へ委譲する", async () => {
    const { player, audioA } = createPlayer();
    await player.play("A");
    expect(player.currentGeneration()).toBe(1);
    const streamGen = player.currentStreamGeneration();
    expect(streamGen).not.toBeNull();
    expect(player.markStreamTokenRejected("A", streamGen!)).not.toBeNull();

    player.loadPaused("B", 10);
    expect(audioA.src).toBe(streamUrl("B", player.currentStreamGeneration() ?? undefined));
    expect(audioA.currentTime).toBe(10);

    player.cancelPendingTransition();
    expect(player.currentGeneration()).toBe(3); // play + loadPaused + cancelPendingTransition
  });

  test("コンストラクタに渡した採番関数を両コントローラで共有する（別々の既定カウンタを作らない）", async () => {
    // 完全なクロスコントローラ衝突回避の実証（非アクティブ側＝スロット1が実際にstreamIdを
    // 消費するケース）は、スロットを切り替える手段が無いこのPRの時点ではまだできない
    // （次PR「commitCrossfade」等の追加後に、A/B両方が実際にplay()される統合テストとして
    // 追加する）。ここでは「注入した採番関数のインスタンスがそのまま使われている」ことを
    // 直接検証する：もしDualAudioPlayerの実装が誤って各コントローラ用に個別の既定採番関数
    // （createSharedStreamIdAllocator()を2回呼ぶ等）を作ってしまうと、注入した関数の呼び出し
    // 回数がplay()の回数と一致しなくなる。
    const audioA = new FakeAudio();
    const audioB = new FakeAudio();
    let calls = 0;
    const spyAllocateStreamId = () => { calls += 1; return calls; };
    const player = new DualAudioPlayer(audioA, audioB, () => "valid-token", undefined, undefined, spyAllocateStreamId);
    await player.play("A");
    expect(calls).toBe(1);
    expect(audioA.src).toBe(streamUrl("A", 1));
    await player.play("A2");
    expect(calls).toBe(2);
    expect(audioA.src).toBe(streamUrl("A2", 2));
  });

  test("'ended'はactiveなスロットのものだけを外部へ中継する（非アクティブ側の自然終了は無視する）", () => {
    const { player, audioA, audioB } = createPlayer();
    const endedCalls: number[] = [];
    player.addEventListener("ended", () => endedCalls.push(1));

    // 現在active（スロット0=audioA）のendedは中継される。
    audioA.emitEnded();
    expect(endedCalls).toEqual([1]);

    // 非アクティブなaudioBのendedは中継されない（activeを切り替える手段は次PRで追加する
    // ため、ここではDualAudioPlayerが"active"以外の要素のendedを無条件に無視することだけ
    // 確認する）。
    audioB.emitEnded();
    expect(endedCalls).toEqual([1]);
  });

  test("onTransitionStart通知はactiveなスロットの遷移だけを外部（本物のクロスフェード打ち切り通知）へ転送する", async () => {
    const { player, transitions } = createPlayer();
    await player.play("A");
    // activeなスロット（0）でのplay()は転送される（2回：先頭・srcコミット直前）。
    expect(transitions.length).toBeGreaterThan(0);
  });

  // 非アクティブ側の遷移が本物の通知へ転送されないこと（ChatGPTレビュー指摘：③）。
  // inactiveController()経由でスロット1のコントローラへ直接play()し、本物の
  // 割り込み通知（onRealTransitionStart）が呼ばれないことを検証する。
  test("非アクティブ側（inactiveController経由）の遷移はonTransitionStart通知へ転送されない", async () => {
    const { player, transitions } = createPlayer();
    await player.inactiveController().play("preview");
    expect(transitions).toEqual([]);
  });

  test("activeAudioElement()/inactiveAudioElement()はactiveの現在値を反映する", () => {
    const { player, audioA, audioB } = createPlayer();
    expect(player.activeAudioElement()).toBe(audioA);
    expect(player.inactiveAudioElement()).toBe(audioB);
  });

  test("commitPromotion()はsrc/currentTime/play/pauseのいずれにも触れず、activeスロットを付け替えるだけ", async () => {
    const { player, audioA, audioB } = createPlayer();
    await player.play("A");
    audioA.volume = 0;
    audioB.volume = 1;
    const srcA = audioA.src;
    const srcB = audioB.src;
    const playCountA = audioA.playCount;
    const playCountB = audioB.playCount;

    player.commitPromotion();

    // 不変条件：コミット自体はsrc/currentTime/play()/pause()のいずれも呼ばない。
    expect(audioA.src).toBe(srcA);
    expect(audioB.src).toBe(srcB);
    expect(audioA.playCount).toBe(playCountA);
    expect(audioB.playCount).toBe(playCountB);
    // activeがBへ入れ替わったことは、以後の委譲先で確認できる。
    expect(player.activeAudioElement()).toBe(audioB);
    expect(player.inactiveAudioElement()).toBe(audioA);
  });

  test("resetInactive()は非アクティブ側を一時停止しsrcを破棄する（アクティブ側には触れない）", async () => {
    const { player, audioA, audioB } = createPlayer();
    await player.play("A");
    audioB.src = "https://example.com/preview";
    audioB.paused = false;
    const srcABefore = audioA.src;

    player.resetInactive();

    expect(audioB.paused).toBe(true);
    expect(audioB.src).toBe("");
    expect(audioA.src).toBe(srcABefore);
  });

  // 2026-09-14〜、Codexレビュー指摘：P2「Remove the inactive src attribute instead of
  // emptying it」。実HTMLAudioElement相当（removeAttribute実装済み）のフェイクでは、
  // resetInactive()が`src = ""`ではなく`removeAttribute("src")`を呼ぶことを検証する。
  test("resetInactive()はremoveAttribute実装済みのaudio要素では、srcへの空文字列代入ではなく属性除去を使う", async () => {
    class RemovableAudio extends FakeAudio {
      removedAttributes: string[] = [];
      removeAttribute(qualifiedName: string): void {
        this.removedAttributes.push(qualifiedName);
      }
    }
    const audioA = new RemovableAudio();
    const audioB = new RemovableAudio();
    const player = new DualAudioPlayer(audioA, audioB, () => "valid-token", () => {}, () => {});
    await player.play("A");
    audioB.src = "https://example.com/preview";

    player.resetInactive();

    expect(audioB.removedAttributes).toEqual(["src"]);
    // removeAttribute()自体はsrcプロパティを書き換えないフェイクだが、`src=""`への
    // フォールバック代入が二重に走っていないことも確認する（両方呼ばれるのは不整合）。
    expect(audioB.src).toBe("https://example.com/preview");
  });

  // 2026-09-14〜、Codexレビュー指摘：P2「Filter playback errors from the inactive slot」。
  // 先読み中（非アクティブ側）のメディアerrorは、実際に再生中のactive側とは無関係なため、
  // 汎用の「音声を再生できませんでした」でステータスを上書きしてはならない。
  test("非アクティブ側のメディアerrorはonPlaybackErrorへ中継されない（アクティブ側のerrorは中継される）", async () => {
    const audioA = new FakeAudio();
    const audioB = new FakeAudio();
    const errors: unknown[] = [];
    const player = new DualAudioPlayer(audioA, audioB, () => "valid-token", (e) => errors.push(e), () => {});

    // 現在active（スロット0=audioA）のerrorは中継される。
    audioA.emit("error");
    expect(errors.length).toBe(1);

    // 非アクティブなaudioBのerrorは中継されない。
    audioB.emit("error");
    expect(errors.length).toBe(1);

    // activeを切り替えると、以後はaudioB側のerrorが中継されaudioA側は中継されなくなる。
    await player.play("A");
    player.commitPromotion();
    audioB.emit("error");
    expect(errors.length).toBe(2);
    audioA.emit("error");
    expect(errors.length).toBe(2);
  });

  test("cancelPendingTransition()は両スロットを無効化する（非アクティブ側の先読みも打ち切る）", async () => {
    const { player } = createPlayer();
    await player.play("A");
    await player.inactiveController().play("preview");
    const genAfterPreview = player.inactiveController().currentGeneration();
    player.cancelPendingTransition();
    expect(player.inactiveController().currentGeneration()).toBeGreaterThan(genAfterPreview);
  });

  // 2026-09-14、PR2：ロールスワップのUI結線（シークバー・MediaSession・クロスフェードの
  // timeupdate駆動）が必要とする"ended"以外のイベント種別も、同じactive-slotフィルタで
  // 中継されることを確認する（"timeupdate"を代表例として検証）。
  test("timeupdate等の追加イベント種別も、activeスロットの発火だけを中継する", async () => {
    const { player, audioA, audioB } = createPlayer();
    const ticks: number[] = [];
    player.addEventListener("timeupdate", () => ticks.push(1));

    audioA.emit("timeupdate"); // active(0)
    expect(ticks).toEqual([1]);

    audioB.emit("timeupdate"); // inactive(1)、中継されない
    expect(ticks).toEqual([1]);

    await player.play("A");
    player.commitPromotion(); // active が 1(B) へ切り替わる
    audioA.emit("timeupdate"); // 今はinactive、中継されない
    expect(ticks).toEqual([1]);
    audioB.emit("timeupdate"); // 今はactive、中継される
    expect(ticks).toEqual([1, 1]);
  });

  test("markStreamTokenRejected()は非アクティブ側のstreamGenerationにもマッチする", async () => {
    const { player } = createPlayer();
    await player.play("A");
    await player.inactiveController().play("preview");
    const inactiveStreamGen = player.inactiveController().currentStreamGeneration();
    expect(inactiveStreamGen).not.toBeNull();
    // activeController（スロット0）には一致しないgenerationのため、
    // 非アクティブ側（スロット1）へフォールバックしてマッチする必要がある。
    expect(player.markStreamTokenRejected("preview", inactiveStreamGen!)).not.toBeNull();
  });

  // 9. ChatGPTレビュー（PR2の設計条件）：同一fileIdをA/Bで扱ってもstream-idが衝突せず、
  // SW token cache/401 continuationが正しいslotへ紐づくこと。共有アロケータ＋実際の
  // PlaybackController×2＋PlaybackContinuationRegistryを組み合わせた統合テスト
  // （曲のリピート・同一曲へのシーク後のクロスフェード等、同じfileIdがA/B両方に
  // 現れる状況の再現）。
  test("9. 同一fileIdをA/B両方で再生しても、共有アロケータによりstream-idは衝突せず、401継続は正しいstream-idの継続だけに紐づく", async () => {
    const audioA = new FakeAudio();
    const audioB = new FakeAudio();
    const allocator = createSharedStreamIdAllocator();
    const player = new DualAudioPlayer(audioA, audioB, () => "valid-token", () => {}, () => {}, allocator);
    const registry = new PlaybackContinuationRegistry();

    // Aが"song"を再生中。
    await player.play("song");
    const streamIdA = player.currentStreamGeneration()!;
    const continuationA = registry.register({ fileId: "song", streamId: streamIdA, resume: async () => true });

    // Bが同じ"song"を先読み再生（曲のリピート等）。共有アロケータのため、streamIdはAとは
    // 別の値になる。
    await player.inactiveController().play("song");
    const streamIdB = player.inactiveController().currentStreamGeneration()!;
    expect(streamIdB).not.toBe(streamIdA);
    const continuationB = registry.register({ fileId: "song", streamId: streamIdB, resume: async () => true });

    // それぞれのstreamIdでトークン要求を記録し、401を受理する。
    registry.recordTokenRequest("request-a", "song", streamIdA, "token-a");
    registry.recordTokenRequest("request-b", "song", streamIdB, "token-b");

    // Bの401はBの継続だけを返す。
    expect(registry.acceptTokenRejection("request-b", "song", "token-b")).toBe(continuationB);
    // Aは無関係のまま、Aの401は引き続きAの継続に正しく紐づく。
    expect(registry.acceptTokenRejection("request-a", "song", "token-a")).toBe(continuationA);

    // markStreamTokenRejected()もstream-id単位で正しいコントローラへルーティングされる
    // （同一fileIdでもstreamIdが異なるため取り違えない）。
    expect(player.markStreamTokenRejected("song", streamIdA)).not.toBeNull();
    expect(player.markStreamTokenRejected("song", streamIdB)).not.toBeNull();
  });
});
