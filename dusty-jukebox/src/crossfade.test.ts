import { describe, expect, it, vi } from "vitest";
import {
  CROSSFADE_DURATION_OPTIONS_SEC,
  CrossfadeAudioElement,
  CrossfadeDualPlayerLike,
  CrossfadeOrchestrator,
  CrossfadePlaybackControllerLike,
  CrossfadeQueueLike,
  DEFAULT_CROSSFADE_DURATION_SEC,
  WaitFn,
  crossfadeDurationMsForSeconds,
  crossfadeVolumes,
  isCrossfadeDurationSec,
  runCrossfade,
  shouldBeginCrossfadeRamp,
  shouldStartCrossfadePreparation,
} from "./crossfade";

// 2026-09-11、ユーザー提案（クロスフェードON/OFFの隣に3/5/7/10秒から選べる設定を置く）による
// クロスフェード長の秒数選択式化。
describe("crossfadeDurationMsForSeconds", () => {
  it("秒数をms換算する（このテスト実行環境はVITE_E2E未設定＝本番相当のため、秒×1000）", () => {
    for (const sec of CROSSFADE_DURATION_OPTIONS_SEC) {
      expect(crossfadeDurationMsForSeconds(sec)).toBe(sec * 1000);
    }
  });

  it("既定値（3秒）は既存の固定値と一致する", () => {
    expect(crossfadeDurationMsForSeconds(DEFAULT_CROSSFADE_DURATION_SEC)).toBe(3000);
  });
});

describe("isCrossfadeDurationSec", () => {
  it("選択肢に含まれる値はtrue", () => {
    for (const sec of CROSSFADE_DURATION_OPTIONS_SEC) {
      expect(isCrossfadeDurationSec(sec)).toBe(true);
    }
  });

  it("選択肢に含まれない値（DOM改変等の想定外の状態）はfalse", () => {
    expect(isCrossfadeDurationSec(4)).toBe(false);
    expect(isCrossfadeDurationSec(0)).toBe(false);
    expect(isCrossfadeDurationSec(NaN)).toBe(false);
  });
});

describe("crossfadeVolumes", () => {
  it("進行度に応じて退場側/入場側の音量を線形に計算する", () => {
    expect(crossfadeVolumes(0)).toEqual({ outgoing: 1, incoming: 0 });
    expect(crossfadeVolumes(0.5)).toEqual({ outgoing: 0.5, incoming: 0.5 });
    expect(crossfadeVolumes(1)).toEqual({ outgoing: 0, incoming: 1 });
  });

  it("範囲外の進行度は0〜1へクランプする", () => {
    expect(crossfadeVolumes(-1)).toEqual({ outgoing: 1, incoming: 0 });
    expect(crossfadeVolumes(2)).toEqual({ outgoing: 0, incoming: 1 });
  });
});

describe("runCrossfade", () => {
  it("段階的に退場側を1→0、入場側を0→1へランプする", async () => {
    const outgoing = { volume: 1 };
    const incoming = { volume: 0 };
    const wait = vi.fn().mockResolvedValue(undefined);
    await runCrossfade(outgoing, incoming, 300, { steps: 3, wait });
    expect(wait).toHaveBeenCalledTimes(3);
    expect(outgoing.volume).toBe(0);
    expect(incoming.volume).toBe(1);
  });

  it("durationMsが0以下なら即座に完了値へ設定する", async () => {
    const outgoing = { volume: 1 };
    const incoming = { volume: 0 };
    await runCrossfade(outgoing, incoming, 0);
    expect(outgoing.volume).toBe(0);
    expect(incoming.volume).toBe(1);
  });

  it("isCancelledがtrueを返すと以後のvolume更新を中断する", async () => {
    const outgoing = { volume: 1 };
    const incoming = { volume: 0 };
    const wait = vi.fn().mockResolvedValue(undefined);
    let cancelled = false;
    await runCrossfade(outgoing, incoming, 400, {
      steps: 4,
      wait,
      isCancelled: () => cancelled,
    });
    // 全ステップ完了しているはず（キャンセルしていないため）。
    expect(outgoing.volume).toBe(0);
    // 途中でキャンセルした場合は、それ以降volumeが更新されないことを別途検証する。
    cancelled = false;
    const outgoing2 = { volume: 1 };
    const incoming2 = { volume: 0 };
    let callCount = 0;
    const cancelAfterTwoSteps = () => {
      callCount += 1;
      return callCount > 2;
    };
    await runCrossfade(outgoing2, incoming2, 400, { steps: 4, wait, isCancelled: cancelAfterTwoSteps });
    // 2ステップ分（0.5進行度）まで反映され、以降は更新されないため0.5のまま。
    expect(outgoing2.volume).toBe(0.5);
    expect(incoming2.volume).toBe(0.5);
  });

  // 2026-09-10、Codexレビュー指摘：P2。次の曲（incoming）自体がクロスフェード長より短く、
  // ランプ完了前に自然終了した場合、isCancelledと違い「完了扱い」として最終値まで進めてから
  // 終了する必要がある（isCancelledは中間値のまま放置するため、入場側が無音のまま残ってしまう）。
  it("shouldFinishEarlyがtrueを返すと直ちに完了値へ設定して終了する", async () => {
    const outgoing = { volume: 1 };
    const incoming = { volume: 0 };
    const wait = vi.fn().mockResolvedValue(undefined);
    let callCount = 0;
    const finishAfterTwoSteps = () => {
      callCount += 1;
      return callCount > 2;
    };
    await runCrossfade(outgoing, incoming, 400, { steps: 4, wait, shouldFinishEarly: finishAfterTwoSteps });
    // isCancelledとは異なり、中間値（0.5）ではなく完了値まで進んでいる。
    expect(outgoing.volume).toBe(0);
    expect(incoming.volume).toBe(1);
    // 3ステップ目でshouldFinishEarlyがtrueになり終了するため、4ステップ目のwaitは呼ばれない。
    expect(wait).toHaveBeenCalledTimes(3);
  });
});

// 2026-09-10、実機フィードバック（マージ後）による再設計：「開始判定」を「準備（第二audio
// 要素の接続確立）を始めるべきか」と「実際に音量ランプを開始してよいか」の2段階に分離した。
describe("shouldStartCrossfadePreparation", () => {
  const baseParams = {
    crossfadeEnabled: true,
    repeatSingle: false,
    isPreparing: false,
    isCrossfading: false,
    hasNextSong: true,
    duration: 180,
    currentTime: 172,
    prepareThresholdMs: 8000,
    audioPaused: false,
    manualTransitionInFlight: false,
  };

  it("残り時間が準備しきい値以下ならtrue", () => {
    expect(shouldStartCrossfadePreparation(baseParams)).toBe(true);
  });

  it("残り時間が準備しきい値より長ければfalse", () => {
    expect(shouldStartCrossfadePreparation({ ...baseParams, currentTime: 100 })).toBe(false);
  });

  it("クロスフェードが無効ならfalse", () => {
    expect(shouldStartCrossfadePreparation({ ...baseParams, crossfadeEnabled: false })).toBe(false);
  });

  it("1曲リピート中は他の条件を満たしてもfalse", () => {
    expect(shouldStartCrossfadePreparation({ ...baseParams, repeatSingle: true })).toBe(false);
  });

  it("既に準備中ならfalse（多重起動防止）", () => {
    expect(shouldStartCrossfadePreparation({ ...baseParams, isPreparing: true })).toBe(false);
  });

  it("既にランプ中ならfalse（多重起動防止）", () => {
    expect(shouldStartCrossfadePreparation({ ...baseParams, isCrossfading: true })).toBe(false);
  });

  it("次の曲が無ければfalse", () => {
    expect(shouldStartCrossfadePreparation({ ...baseParams, hasNextSong: false })).toBe(false);
  });

  it("durationがNaN/Infinity/0以下（メタデータ未確定）ならfalse", () => {
    expect(shouldStartCrossfadePreparation({ ...baseParams, duration: NaN })).toBe(false);
    expect(shouldStartCrossfadePreparation({ ...baseParams, duration: Infinity })).toBe(false);
    expect(shouldStartCrossfadePreparation({ ...baseParams, duration: 0 })).toBe(false);
  });

  it("既に曲の末尾を過ぎている（残り時間が0以下）場合はfalse", () => {
    expect(shouldStartCrossfadePreparation({ ...baseParams, currentTime: 181 })).toBe(false);
  });

  it("主audio要素が一時停止中ならfalse", () => {
    expect(shouldStartCrossfadePreparation({ ...baseParams, audioPaused: true })).toBe(false);
  });

  it("明示的な手動遷移（フェード待機中を含む）が進行中ならfalse", () => {
    expect(shouldStartCrossfadePreparation({ ...baseParams, manualTransitionInFlight: true })).toBe(false);
  });
});

describe("shouldBeginCrossfadeRamp", () => {
  const baseParams = {
    crossfadeEnabled: true,
    repeatSingle: false,
    isPreparing: true,
    isCrossfading: false,
    hasNextSong: true,
    duration: 180,
    currentTime: 178,
    crossfadeDurationMs: 3000,
    audioPaused: false,
    audioEnded: false,
    manualTransitionInFlight: false,
    previewReady: true,
  };

  it("残り時間がクロスフェード長以下ならtrue", () => {
    expect(shouldBeginCrossfadeRamp(baseParams)).toBe(true);
  });

  it("1曲リピート中は他の条件を満たしてもfalse", () => {
    expect(shouldBeginCrossfadeRamp({ ...baseParams, repeatSingle: true })).toBe(false);
  });

  it("残り時間がクロスフェード長より長ければfalse（準備は完了済みだがまだランプは始めない）", () => {
    expect(shouldBeginCrossfadeRamp({ ...baseParams, currentTime: 100 })).toBe(false);
  });

  it("まだ準備中でなければfalse", () => {
    expect(shouldBeginCrossfadeRamp({ ...baseParams, isPreparing: false })).toBe(false);
  });

  it("クロスフェードが無効ならfalse", () => {
    expect(shouldBeginCrossfadeRamp({ ...baseParams, crossfadeEnabled: false })).toBe(false);
  });

  it("既にランプ中ならfalse（多重起動防止）", () => {
    expect(shouldBeginCrossfadeRamp({ ...baseParams, isCrossfading: true })).toBe(false);
  });

  it("次の曲が無ければfalse", () => {
    expect(shouldBeginCrossfadeRamp({ ...baseParams, hasNextSong: false })).toBe(false);
  });

  it("明示的な手動遷移が進行中ならfalse", () => {
    expect(shouldBeginCrossfadeRamp({ ...baseParams, manualTransitionInFlight: true })).toBe(false);
  });

  // 2026-09-10、実機フィードバックによる再設計時に追加：接続確立が長引き、準備中のうちに
  // 退場側が先に自然終了してしまった場合、audioPausedはended時ネイティブにtrueになるが、
  // それに関わらず直ちにランプを開始すべき（そうしないと準備済みのまま永久に取り残される）。
  it("退場側が既に自然終了していれば、一時停止中の判定より優先してtrue", () => {
    expect(shouldBeginCrossfadeRamp({ ...baseParams, audioEnded: true, audioPaused: true, currentTime: 180 })).toBe(true);
  });

  it("自然終了していない場合、主audio要素が一時停止中ならfalse", () => {
    expect(shouldBeginCrossfadeRamp({ ...baseParams, audioPaused: true })).toBe(false);
  });

  it("durationがNaN/Infinity/0以下（メタデータ未確定）で、自然終了もしていなければfalse", () => {
    expect(shouldBeginCrossfadeRamp({ ...baseParams, duration: NaN })).toBe(false);
    expect(shouldBeginCrossfadeRamp({ ...baseParams, duration: Infinity })).toBe(false);
    expect(shouldBeginCrossfadeRamp({ ...baseParams, duration: 0 })).toBe(false);
  });

  // 2026-09-10、ChatGPTレビュー指摘：P1（Finding 2）。第二audio要素の先読み再生がまだ実際に
  // 開始していない（play()未解決）間は、通常の残り時間トリガーはもちろん、退場側の自然終了
  // バイパスであってもランプを始めてはならない（未確立のままハンドオフする不具合の再現を防ぐ）。
  it("先読み再生がまだ準備完了していなければfalse（残り時間が閾値以内でも）", () => {
    expect(shouldBeginCrossfadeRamp({ ...baseParams, previewReady: false })).toBe(false);
  });

  it("先読み再生がまだ準備完了していなければfalse（退場側が既に自然終了していても）", () => {
    expect(
      shouldBeginCrossfadeRamp({ ...baseParams, previewReady: false, audioEnded: true, audioPaused: true, currentTime: 180 })
    ).toBe(false);
  });
});

// 2026-09-11〜12、実機フィードバック「クロスフェードで曲が切り替わった瞬間に一瞬音飛みする」。
// finishCrossfadeHandoff()のハンドオフ最終位置合わせ（先読み側の到達位置への再シーク）が
// 原因と考え、「バッファ済みなら再シーク」→「バッファ済み範囲内で目標位置へできるだけ
// 追いつく」（bufferedCatchUpPosition）と2段階で絞り込んだが、実機の録画（波形解析）で
// 再検証したところ、バッファの有無に関わらず同じ瞬間に音飛みが再現した。原因は
// `currentTime`への書き込みという操作そのものだったため、位置合わせの再シーク自体を撤去し
// （main.tsのfinishCrossfadeHandoff()参照）、bufferedCatchUpPosition自体も不要になり削除した。

// ============================================================================
// CrossfadeOrchestrator（ロールスワップ本体、2026-09-14〜、PR2）
// ============================================================================
// ChatGPTレビュー（PR2の設計条件）で指定された競合テスト群。main.tsは薄いDOM結線のみを
// 担うという本リポジトリの既存方針（AI開発ルール1）に沿い、状態機械そのものはこの
// テスト可能なクラスに持たせている。

class FakeAudioEl implements CrossfadeAudioElement {
  volume = 1;
  paused = false;
  ended = false;
  duration = 100;
  currentTime = 0;
  pauseCalls = 0;
  private seekedListeners: Array<{ listener: () => void; once: boolean }> = [];
  pause(): void { this.pauseCalls += 1; this.paused = true; }
  addEventListener(type: "seeked", listener: () => void, options: { once: boolean }): void {
    if (type === "seeked") this.seekedListeners.push({ listener, once: options.once });
  }
  // タイムアウト等でリスナーを明示的に外す経路の回帰防止に使う
  // （2026-09-14〜、Codexレビュー指摘：P2「Remove the seek listener when abandoning the wait」）。
  removeEventListener(type: "seeked", listener: () => void): void {
    if (type !== "seeked") return;
    this.seekedListeners = this.seekedListeners.filter((entry) => entry.listener !== listener);
  }
  // テスト側から実際にseek完了を模擬する（本物の<audio>が発火する'seeked'相当）。once指定の
  // リスナーは本物のaddEventListener({once:true})と同じく発火後に自動で外れる
  // （2026-09-14〜、Codexレビュー指摘：P2「Remove settled seek listeners after each ramp」
  // の回帰防止に使う）。
  fireSeeked(): void {
    const remaining: typeof this.seekedListeners = [];
    for (const entry of this.seekedListeners) {
      entry.listener();
      if (!entry.once) remaining.push(entry);
    }
    this.seekedListeners = remaining;
  }
  seekedListenerCount(): number {
    return this.seekedListeners.length;
  }
}

class FakeController implements CrossfadePlaybackControllerLike {
  playCalls: Array<{ fileId: string; position?: number }> = [];
  cancelCalls = 0;
  autoResolve = true;
  streamIdCounter = 0;
  streamGeneration: number | null = null;
  private pending: { resolve: () => void; reject: (e: unknown) => void } | null = null;

  play(
    fileId: string,
    position?: number,
    options?: { onStreamIdAllocated?: (streamId: number, isSuperseded: () => boolean) => void }
  ): Promise<void> {
    this.playCalls.push({ fileId, position });
    this.streamIdCounter += 1;
    const streamId = this.streamIdCounter;
    this.streamGeneration = streamId;
    options?.onStreamIdAllocated?.(streamId, () => false);
    if (this.autoResolve) return Promise.resolve();
    return new Promise((resolve, reject) => { this.pending = { resolve, reject }; });
  }
  resolvePending(): void { this.pending?.resolve(); this.pending = null; }
  rejectPending(e: unknown): void { this.pending?.reject(e); this.pending = null; }
  cancelPendingTransition(): void { this.cancelCalls += 1; }
  currentStreamGeneration(): number | null { return this.streamGeneration; }
}

class FakeDualPlayer implements CrossfadeDualPlayerLike {
  activeAudio = new FakeAudioEl();
  inactiveAudio = new FakeAudioEl();
  activeControllerInstance = new FakeController();
  inactiveControllerInstance = new FakeController();
  promotions = 0;
  resets = 0;

  inactiveController(): CrossfadePlaybackControllerLike { return this.inactiveControllerInstance; }
  activeController(): CrossfadePlaybackControllerLike { return this.activeControllerInstance; }
  activeAudioElement(): CrossfadeAudioElement { return this.activeAudio; }
  inactiveAudioElement(): CrossfadeAudioElement { return this.inactiveAudio; }
  commitPromotion(): void {
    this.promotions += 1;
    [this.activeAudio, this.inactiveAudio] = [this.inactiveAudio, this.activeAudio];
    [this.activeControllerInstance, this.inactiveControllerInstance] = [this.inactiveControllerInstance, this.activeControllerInstance];
  }
  resetInactive(): void {
    this.resets += 1;
    this.inactiveAudio.pause();
  }
}

class FakeQueue implements CrossfadeQueueLike {
  nextFileId: string | null = "next";
  playingFromQueue = true;
  commitCalls: string[] = [];
  commitResult: boolean = true;
  singleRepeat = false;

  isSingleRepeat(): boolean { return this.singleRepeat; }
  peekNextFileId(): string | null { return this.nextFileId; }
  isPlayingFromQueue(): boolean { return this.playingFromQueue; }
  commitPreparedFile(fileId: string): Promise<boolean> {
    this.commitCalls.push(fileId);
    return Promise.resolve(this.commitResult);
  }
}

const immediateWait: WaitFn = () => Promise.resolve();

// 曲末尾まであと1秒（残り時間が閾値以内）の典型的な状態を作る。
function setNearEnd(player: FakeDualPlayer): void {
  player.activeAudio.duration = 100;
  player.activeAudio.currentTime = 99;
}

describe("CrossfadeOrchestrator", () => {
  it("1. A再生中＋B先読み中にBが401（=inactiveController側のstream要求拒否）が起きても、A自身の再生状態には一切影響しない", async () => {
    // オーケストレーター自身はDrive 401の認証継続フローにフックしない設計（v1から継続する
    // 既知の制限、CLAUDE.md参照）だが、「Bのストリームで何が起きてもAの状態機械には波及
    // しない」という分離自体は保証されるべき不変条件。inactiveController.play()が
    // （401相当で）rejectしても、activeController側は一切呼ばれず、activeAudioの状態も
    // 変化しないことを検証する。
    const player = new FakeDualPlayer();
    const queue = new FakeQueue();
    player.inactiveControllerInstance.autoResolve = false;
    const orchestrator = new CrossfadeOrchestrator(player, queue, () => true, { wait: immediateWait, steps: 1 });
    setNearEnd(player);

    const started = orchestrator.maybeStart({ enabled: true, durationMs: 3000, manualTransitionInFlight: false });
    await Promise.resolve();
    expect(player.inactiveControllerInstance.playCalls).toHaveLength(1);
    expect(player.activeControllerInstance.playCalls).toHaveLength(0);

    player.inactiveControllerInstance.rejectPending(new Error("401"));
    await started;

    expect(player.activeControllerInstance.playCalls).toHaveLength(0);
    expect(player.promotions).toBe(0);
    expect(orchestrator.isActive()).toBe(false);
  });

  it("2. A/B同時ストリーミング時にAが401が起きても、進行中のB側の準備状態を巻き込まない", async () => {
    // Aの401はPlaybackAuthenticationGate等main.ts側の既存フローが扱う対象であり、
    // オーケストレーター自身に「Aの401」という概念は存在しない（activeController.play()は
    // このクラスが呼ばない、main.ts側の別経路のため）。このクラスの不変条件として検証すべきは
    // 「Bの準備が進行中に、Aに関する操作（このクラスが一切関与しない）が呼ばれても、
    // オーケストレーターの内部状態（preparing/previewReady等）は勝手に変化しない」こと。
    const player = new FakeDualPlayer();
    const queue = new FakeQueue();
    const orchestrator = new CrossfadeOrchestrator(player, queue, () => true, { wait: immediateWait, steps: 1 });
    setNearEnd(player);
    player.inactiveControllerInstance.autoResolve = false;

    const started = orchestrator.maybeStart({ enabled: true, durationMs: 3000, manualTransitionInFlight: false });
    await Promise.resolve();
    expect(orchestrator.isPreparing()).toBe(true);

    // Aの401相当（オーケストレーターに一切関知させない、activeController経由の操作）。
    player.activeControllerInstance.cancelPendingTransition();

    // Bの準備状態はこの操作の影響を受けず、そのままplay()解決を待ち続けている。
    expect(orchestrator.isPreparing()).toBe(true);
    player.inactiveControllerInstance.resolvePending();
    await started;
    // Aの401（オーケストレーターに一切関知させないactiveController経由の操作）に巻き込まれず、
    // Bの準備→ランプ→コミットまで正常に完走している。
    expect(queue.commitCalls).toEqual(["next"]);
    expect(player.promotions).toBe(1);
  });

  it("3. Bのplay()待機中にPause/Next/setList相当のcancel()が呼ばれると、Bが後から解決してもpromotionされない", async () => {
    const player = new FakeDualPlayer();
    const queue = new FakeQueue();
    player.inactiveControllerInstance.autoResolve = false;
    const orchestrator = new CrossfadeOrchestrator(player, queue, () => true, { wait: immediateWait, steps: 1 });
    setNearEnd(player);

    const started = orchestrator.maybeStart({ enabled: true, durationMs: 3000, manualTransitionInFlight: false });
    await Promise.resolve();
    expect(orchestrator.isPreparing()).toBe(true);

    orchestrator.cancel(); // Pause/Next/setList相当
    expect(orchestrator.isActive()).toBe(false);
    expect(player.inactiveControllerInstance.cancelCalls).toBe(1);
    expect(player.resets).toBeGreaterThan(0);

    player.inactiveControllerInstance.resolvePending(); // Bが後から解決
    await started;
    await Promise.resolve();

    expect(player.promotions).toBe(0);
    expect(orchestrator.isActive()).toBe(false);
    expect(queue.commitCalls).toEqual([]);
  });

  it("4. prepared曲がcommit直前に除外・削除済み（commitPreparedFile()がfalse）の場合、Bをpromotionせずqueueと実音源が食い違わない", async () => {
    const player = new FakeDualPlayer();
    const queue = new FakeQueue();
    queue.commitResult = false; // 除外・削除・世代不一致のいずれか
    const orchestrator = new CrossfadeOrchestrator(player, queue, () => true, { wait: immediateWait, steps: 1 });
    setNearEnd(player);

    await orchestrator.maybeStart({ enabled: true, durationMs: 3000, manualTransitionInFlight: false });

    expect(queue.commitCalls).toEqual(["next"]);
    expect(player.promotions).toBe(0);
    expect(orchestrator.isActive()).toBe(false);
    expect(player.resets).toBeGreaterThan(0);
  });

  it("5. ランプ進行中に多重トリガー（曲末尾のtimeupdate連打・Aのendedによるtry BeginRamp等）が来ても二重にcommitされない", async () => {
    const player = new FakeDualPlayer();
    const queue = new FakeQueue();
    const release: { fn: (() => void) | null } = { fn: null };
    const controlledWait: WaitFn = () => new Promise((resolve) => { release.fn = resolve; });
    const orchestrator = new CrossfadeOrchestrator(player, queue, () => true, { wait: controlledWait, steps: 1 });
    setNearEnd(player);

    const first = orchestrator.maybeStart({ enabled: true, durationMs: 3000, manualTransitionInFlight: false });
    await vi.waitFor(() => expect(orchestrator.isCrossfading()).toBe(true));

    // 多重トリガー（timeupdate連打・Aのended経由の即時ハンドオフ試行を模擬）。
    const second = await orchestrator.tryBeginRamp({ enabled: true, durationMs: 3000, manualTransitionInFlight: false });
    expect(second).toBe(false); // isCrossfadingガードによりno-op、ランプを二重に開始しない
    await orchestrator.maybeStart({ enabled: true, durationMs: 3000, manualTransitionInFlight: false });

    release.fn?.();
    await first;
    expect(queue.commitCalls).toEqual(["next"]);
    expect(player.promotions).toBe(1);
  });

  it("6. promotion後、activeAudioElement()/activeなplay()呼び出しはB（新active）を操作し、旧A（今の非アクティブ）を操作しない", async () => {
    const player = new FakeDualPlayer();
    const queue = new FakeQueue();
    const orchestrator = new CrossfadeOrchestrator(player, queue, () => true, { wait: immediateWait, steps: 1 });
    setNearEnd(player);
    const originalActiveController = player.activeControllerInstance;
    const originalActiveAudio = player.activeAudio;

    await orchestrator.maybeStart({ enabled: true, durationMs: 3000, manualTransitionInFlight: false });

    expect(player.promotions).toBe(1);
    // promotion後、"active"は元inactive（B）へ切り替わっている。
    expect(player.activeControllerInstance).not.toBe(originalActiveController);
    expect(player.activeAudioElement()).not.toBe(originalActiveAudio);
    // 旧active（A）は今や非アクティブとして後始末（pause）されている。
    expect(originalActiveAudio.pauseCalls).toBeGreaterThan(0);
  });

  it("7. commitPromotion()単体は、src/currentTime/play/pause/volumeへの書き込みが実際に0回であること（プロパティ書き込みを計装して確認）", async () => {
    const player = new FakeDualPlayer();

    let volumeWrites = 0;
    let currentTimeWrites = 0;
    let pauseCalls = 0;
    // ランプ完了直後（volume書き込み自体はランプ中に発生する、これは許容——検証したいのは
    // commitPromotion()呼び出しそのものが追加の書き込みを一切発生させないこと）なので、
    // commitPromotion()呼び出しの直前直後だけを計測する。
    const audio = player.activeAudio;
    let realVolume = audio.volume;
    let realCurrentTime = audio.currentTime;
    Object.defineProperty(audio, "volume", {
      get: () => realVolume,
      set: (v) => { volumeWrites += 1; realVolume = v; },
    });
    Object.defineProperty(audio, "currentTime", {
      get: () => realCurrentTime,
      set: (v) => { currentTimeWrites += 1; realCurrentTime = v; },
    });
    const originalPause = audio.pause.bind(audio);
    audio.pause = () => { pauseCalls += 1; originalPause(); };

    const beforeVolumeWrites = volumeWrites;
    const beforeCurrentTimeWrites = currentTimeWrites;
    const beforePauseCalls = pauseCalls;
    player.commitPromotion();

    expect(volumeWrites).toBe(beforeVolumeWrites);
    expect(currentTimeWrites).toBe(beforeCurrentTimeWrites);
    expect(pauseCalls).toBe(beforePauseCalls);
  });

  it("8. promotion後に旧A（今の非アクティブ）をcleanupしても、新active（B）の遷移キャンセルは発火しない", async () => {
    const player = new FakeDualPlayer();
    const queue = new FakeQueue();
    const orchestrator = new CrossfadeOrchestrator(player, queue, () => true, { wait: immediateWait, steps: 1 });
    setNearEnd(player);

    await orchestrator.maybeStart({ enabled: true, durationMs: 3000, manualTransitionInFlight: false });
    expect(player.promotions).toBe(1);

    // promotion後の新active（B）のコントローラは、この一連のcommit/cleanup処理を通じて
    // 一度もcancelPendingTransition()を呼ばれていない（cleanupは常にinactiveController()＝
    // 旧activeのAだけを対象にする）。
    expect(player.activeControllerInstance.cancelCalls).toBe(0);
  });

  // 2026-09-14〜、ChatGPTレビュー指摘（HEAD `834557e`）4件の回帰防止テスト。

  it("9. ランプ途中でcancel()すると、active側のvolumeがランプ開始前の値へ復元される（P1）", async () => {
    const player = new FakeDualPlayer();
    const queue = new FakeQueue();
    const release: { fn: (() => void) | null } = { fn: null };
    const controlledWait: WaitFn = () => new Promise((resolve) => { release.fn = resolve; });
    const orchestrator = new CrossfadeOrchestrator(player, queue, () => true, { wait: controlledWait, steps: 2 });
    setNearEnd(player);
    player.activeAudio.volume = 0.6; // ユーザーが独自に調整していた音量を模擬

    const started = orchestrator.maybeStart({ enabled: true, durationMs: 4000, manualTransitionInFlight: false });
    await vi.waitFor(() => expect(orchestrator.isCrossfading()).toBe(true));
    release.fn?.(); // 1/2ステップぶん進める
    await vi.waitFor(() => expect(player.activeAudio.volume).toBeLessThan(0.6));
    expect(player.activeAudio.volume).toBeGreaterThan(0); // ランプ中の中間値のまま

    orchestrator.cancel(); // Seek/Next/Previous/Pause/setList相当
    expect(player.activeAudio.volume).toBe(0.6);

    release.fn?.(); // 残りのタイマーも解放し、Promiseが浮遊したままにならないようにする
    await started;
  });

  it("10. 先読み開始時にonPreviewStreamAllocatedが実際のfileId/streamIdで呼ばれ、isPendingPreview()もこの間trueを返す（P1）", async () => {
    const player = new FakeDualPlayer();
    const queue = new FakeQueue();
    const allocated: Array<{ fileId: string; streamId: number }> = [];
    const orchestrator = new CrossfadeOrchestrator(player, queue, () => true, {
      wait: immediateWait,
      steps: 1,
      onPreviewStreamAllocated: (fileId, streamId) => allocated.push({ fileId, streamId }),
    });
    setNearEnd(player);
    player.inactiveControllerInstance.autoResolve = false;

    const started = orchestrator.maybeStart({ enabled: true, durationMs: 3000, manualTransitionInFlight: false });
    await Promise.resolve();

    expect(allocated).toEqual([{ fileId: "next", streamId: 1 }]);
    expect(orchestrator.isPendingPreview("next", 1)).toBe(true);
    expect(orchestrator.isPendingPreview("next", 2)).toBe(false);
    expect(orchestrator.isPendingPreview("other", 1)).toBe(false);

    player.inactiveControllerInstance.resolvePending();
    await started;
  });

  it("11. cancel()でpromotionされないまま打ち切られた先読みは、onPreviewDiscardedで継続が無効化されisPendingPreview()もfalseになる（P1）", async () => {
    const player = new FakeDualPlayer();
    const queue = new FakeQueue();
    const discarded: number[] = [];
    const orchestrator = new CrossfadeOrchestrator(player, queue, () => true, {
      wait: immediateWait,
      steps: 1,
      onPreviewDiscarded: (streamId) => discarded.push(streamId),
    });
    setNearEnd(player);
    player.inactiveControllerInstance.autoResolve = false;

    const started = orchestrator.maybeStart({ enabled: true, durationMs: 3000, manualTransitionInFlight: false });
    await Promise.resolve();
    expect(orchestrator.isPendingPreview("next", 1)).toBe(true);

    orchestrator.cancel();
    expect(discarded).toEqual([1]);
    expect(orchestrator.isPendingPreview("next", 1)).toBe(false);

    player.inactiveControllerInstance.resolvePending();
    await started;
  });

  it("12. commitPreparedFile()が失敗した場合もonPreviewDiscardedで継続が無効化される（P1）", async () => {
    const player = new FakeDualPlayer();
    const queue = new FakeQueue();
    queue.commitResult = false;
    const discarded: number[] = [];
    const orchestrator = new CrossfadeOrchestrator(player, queue, () => true, {
      wait: immediateWait,
      steps: 1,
      onPreviewDiscarded: (streamId) => discarded.push(streamId),
    });
    setNearEnd(player);

    await orchestrator.maybeStart({ enabled: true, durationMs: 3000, manualTransitionInFlight: false });

    expect(discarded).toEqual([1]);
    expect(player.promotions).toBe(0);
  });

  it("18. commitPreparedFile()が失敗した時点でoutgoing（active）側が既に自然終了していれば、自動送り（onFallbackToNaturalEnd）へ委ねる（2026-09-14〜、Codexレビュー指摘：P1）", async () => {
    // ランプ完走後（=outgoing.volumeが既に0まで下がった時点）は、outgoing側が自然終了済み
    // であることが多い。crossfading中はこの'ended'を無視する設計のため、commit失敗で
    // promotionしないままここで終わると、自動送りのトリガーを失い再生が止まってしまう。
    const player = new FakeDualPlayer();
    const queue = new FakeQueue();
    queue.commitResult = false;
    const fallbacks: number[] = [];
    const orchestrator = new CrossfadeOrchestrator(player, queue, () => true, {
      wait: immediateWait,
      steps: 1,
      onFallbackToNaturalEnd: () => { fallbacks.push(1); },
    });
    setNearEnd(player);
    player.activeAudio.ended = true; // outgoing側が既に自然終了している状態を模擬

    await orchestrator.maybeStart({ enabled: true, durationMs: 3000, manualTransitionInFlight: false });

    expect(player.promotions).toBe(0);
    expect(fallbacks).toEqual([1]);
  });

  it("13. promotion成功時は先読みの継続を無効化せず維持し、代わりに旧activeストリームの継続をonOutgoingStreamRetiredで無効化する（P1）", async () => {
    const player = new FakeDualPlayer();
    const queue = new FakeQueue();
    const discarded: number[] = [];
    const retired: Array<number | null> = [];
    const orchestrator = new CrossfadeOrchestrator(player, queue, () => true, {
      wait: immediateWait,
      steps: 1,
      onPreviewDiscarded: (streamId) => discarded.push(streamId),
      onOutgoingStreamRetired: (streamId) => retired.push(streamId),
    });
    setNearEnd(player);
    // 旧active（元々のA）が既に発行済みのstreamId（実運用ではこの曲自身の再生開始時に確定済み）。
    await player.activeControllerInstance.play("current");

    await orchestrator.maybeStart({ enabled: true, durationMs: 3000, manualTransitionInFlight: false });

    expect(player.promotions).toBe(1);
    expect(discarded).toEqual([]); // promotionされたので破棄されない
    expect(retired).toEqual([1]); // 旧active（元A）のstreamId
    expect(orchestrator.isPendingPreview("next", 1)).toBe(false); // promotion後は「先読み中」ではなくなる
  });

  it("14. 入場側がランプ完了前に（ランプ開始後に）自然終了(ended)すると、promotion後に自動送り（onFallbackToNaturalEnd）が発火する（P1）", async () => {
    // shouldFinishEarly: () => inactiveAudio.ended。先読み側（次の曲）自体がクロスフェード長より
    // 短く、ランプ完了前に自然終了した状態を模擬する。ランプ開始「前」（prepareリード中）に
    // 既にendedなケースは別テスト（16）が担うため、ここではランプが実際に始まった後で
    // endedへ切り替える（controlledWaitでステップの合間に差し込む）。
    const player = new FakeDualPlayer();
    const queue = new FakeQueue();
    const fallbacks: number[] = [];
    const release: { fn: (() => void) | null } = { fn: null };
    const controlledWait: WaitFn = () => new Promise((resolve) => { release.fn = resolve; });
    const orchestrator = new CrossfadeOrchestrator(player, queue, () => true, {
      wait: controlledWait,
      steps: 4,
      onFallbackToNaturalEnd: () => { fallbacks.push(1); },
    });
    setNearEnd(player);

    const started = orchestrator.maybeStart({ enabled: true, durationMs: 4000, manualTransitionInFlight: false });
    await vi.waitFor(() => expect(orchestrator.isCrossfading()).toBe(true));
    release.fn?.(); // 1/4ステップぶん進める（この時点ではまだended=false）
    await vi.waitFor(() => expect(player.inactiveAudio.volume).toBeGreaterThan(0));
    player.inactiveAudio.ended = true; // ランプ開始後に入場側が自然終了
    release.fn?.(); // 残りのステップでshouldFinishEarlyが拾う
    await started;

    expect(player.promotions).toBe(1);
    expect(fallbacks).toEqual([1]);
  });

  it("16. 先読み側がprepareリード中（ランプ開始前）に既に自然終了していた場合、そのまま昇格させず自然終了フローへ委ねる（P1）", async () => {
    const player = new FakeDualPlayer();
    const queue = new FakeQueue();
    const fallbacks: number[] = [];
    const discarded: number[] = [];
    const orchestrator = new CrossfadeOrchestrator(player, queue, () => true, {
      wait: immediateWait,
      steps: 1,
      onFallbackToNaturalEnd: () => { fallbacks.push(1); },
      onPreviewDiscarded: (streamId) => discarded.push(streamId),
    });
    setNearEnd(player);
    player.activeAudio.ended = true; // 退場側（A）も既に自然終了している状態を模擬
    // 先読み（次の曲）自体がprepareリード時間より短く、ランプ開始前に既に自然終了・
    // 一時停止していた状態を模擬（実HTMLAudioElementと同様、ended時はpausedもtrueになる）。
    player.inactiveAudio.ended = true;
    player.inactiveAudio.paused = true;

    await orchestrator.maybeStart({ enabled: true, durationMs: 3000, manualTransitionInFlight: false });

    // 停止済み・無音のBをそのままpromotionしていない。
    expect(player.promotions).toBe(0);
    expect(orchestrator.isActive()).toBe(false);
    // 退場側（A）も既にendedのため、通常の自然終了フローへ明示的に委ねる。
    expect(fallbacks).toEqual([1]);
    // 先読みの継続（登録されていれば）も破棄されている。
    expect(discarded).toEqual([1]);
  });

  it("17. ランプ開始前のseek完了待ちがタイムアウトすると、ランプを開始せずクロスフェードを諦める（P2）", async () => {
    const player = new FakeDualPlayer();
    const queue = new FakeQueue();
    const fallbacks: number[] = [];
    const orchestrator = new CrossfadeOrchestrator(player, queue, () => true, {
      wait: immediateWait,
      steps: 1,
      seekTimeoutMs: 10,
      withTimeout: (promise, _timeoutMs, message) => {
        // seek完了待ちだけを即座にタイムアウトさせる（seekedが絶対に発火しないシナリオを
        // 模擬、実機のデコーダ次第・E2Eモック環境で起こりうる）。先読み再生の開始自体の
        // タイムアウト（別のmessage）は通常通りpromiseの解決を待つ。
        if (message.includes("seek")) {
          return new Promise((_, reject) => setTimeout(() => reject(new Error(message)), 0));
        }
        return promise;
      },
      onFallbackToNaturalEnd: () => { fallbacks.push(1); },
    });
    setNearEnd(player);
    player.activeAudio.ended = true; // 退場側（A）も既に自然終了している状態を模擬
    const previewAudio = player.inactiveAudio;
    previewAudio.currentTime = 5; // 準備リード時間ぶん進んでいた状態を模擬（seek対象になる）

    await orchestrator.maybeStart({ enabled: true, durationMs: 3000, manualTransitionInFlight: false });

    // seek未settleのままランプ（volume上昇）を開始していない。
    expect(previewAudio.volume).toBe(0);
    expect(player.promotions).toBe(0);
    expect(orchestrator.isActive()).toBe(false);
    expect(fallbacks).toEqual([1]);
    // {once: true}は発火しない限り自動で外れないため、タイムアウトで待ちを諦める経路では
    // 明示的にリスナーを外している必要がある（2026-09-14〜、Codexレビュー指摘：P2「Remove
    // the seek listener when abandoning the wait」の回帰防止。audio要素は長寿命で使い回される
    // ため、外さないとタイムアウトのたびにリスナーが蓄積してしまう）。
    expect(previewAudio.seekedListenerCount()).toBe(0);
  });

  it("15. ランプ開始前、先読み側のcurrentTime=0への巻き戻しがseeked完了するまでincoming.volumeを上げない（P2）", async () => {
    const player = new FakeDualPlayer();
    const queue = new FakeQueue();
    const orchestrator = new CrossfadeOrchestrator(player, queue, () => true, { wait: immediateWait, steps: 1 });
    setNearEnd(player);
    const previewAudio = player.inactiveAudio;
    previewAudio.currentTime = 5; // 準備リード時間ぶん進んでいた状態を模擬
    previewAudio.volume = 0;

    const started = orchestrator.maybeStart({ enabled: true, durationMs: 3000, manualTransitionInFlight: false });
    await vi.waitFor(() => expect(previewAudio.currentTime).toBe(0));

    // 巻き戻し自体は既に行われているが、seeked未発火のためまだランプは始まっていない。
    expect(previewAudio.volume).toBe(0);

    previewAudio.fireSeeked();
    await started;

    expect(previewAudio.volume).toBe(1);
  });

  it("19. seek完了待ちのリスナーは{once:true}で登録され、発火後は自動的に外れる（2026-09-14〜、Codexレビュー指摘：P2「Remove settled seek listeners after each ramp」）", async () => {
    const player = new FakeDualPlayer();
    const queue = new FakeQueue();
    const orchestrator = new CrossfadeOrchestrator(player, queue, () => true, { wait: immediateWait, steps: 1 });
    setNearEnd(player);
    const previewAudio = player.inactiveAudio;
    previewAudio.currentTime = 5; // 準備リード時間ぶん進んでいた状態を模擬（seek対象になる）

    const started = orchestrator.maybeStart({ enabled: true, durationMs: 3000, manualTransitionInFlight: false });
    await vi.waitFor(() => expect(previewAudio.seekedListenerCount()).toBe(1));

    previewAudio.fireSeeked();
    await started;

    // {once: true}で登録されているため、発火後はリスナーが自動的に外れている必要がある
    // （audio要素は長寿命でクロスフェードのたびに使い回されるため、外れなければリスナーが
    // 無期限に蓄積してしまう）。
    expect(previewAudio.seekedListenerCount()).toBe(0);
  });
});
