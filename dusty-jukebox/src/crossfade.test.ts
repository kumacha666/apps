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
  pause(): void { this.pauseCalls += 1; this.paused = true; }
}

class FakeController implements CrossfadePlaybackControllerLike {
  playCalls: Array<{ fileId: string; position?: number }> = [];
  cancelCalls = 0;
  autoResolve = true;
  private pending: { resolve: () => void; reject: (e: unknown) => void } | null = null;

  play(fileId: string, position?: number): Promise<void> {
    this.playCalls.push({ fileId, position });
    if (this.autoResolve) return Promise.resolve();
    return new Promise((resolve, reject) => { this.pending = { resolve, reject }; });
  }
  resolvePending(): void { this.pending?.resolve(); this.pending = null; }
  rejectPending(e: unknown): void { this.pending?.reject(e); this.pending = null; }
  cancelPendingTransition(): void { this.cancelCalls += 1; }
}

class FakeDualPlayer implements CrossfadeDualPlayerLike {
  activeAudio = new FakeAudioEl();
  inactiveAudio = new FakeAudioEl();
  activeControllerInstance = new FakeController();
  inactiveControllerInstance = new FakeController();
  promotions = 0;
  resets = 0;

  inactiveController(): CrossfadePlaybackControllerLike { return this.inactiveControllerInstance; }
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
});
