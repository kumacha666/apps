// 曲間のクロスフェード（開発体制#42④の続き、2026-09-10）：手動スキップ時のフェードアウト
// （fade.ts、単曲の音量を下げてから切り替える簡易版）とは別に、キュー内の曲が自然終了する際、
// 次の曲を先読み再生しながら2曲を重ねて鳴らす本格版。ユーザーとの相談で「キュー内の曲の
// 自然終了時のみ」「新しいチェックボックスで独立にON/OFF」「長さは固定3秒程度」で合意。

export interface CrossfadeableAudio {
  volume: number;
}

export interface CrossfadeOptions {
  // テスト用に段階数・待機関数を差し替え可能にする（fade.tsの既存DI方針と同じ）。
  steps?: number;
  wait?: (ms: number) => Promise<void>;
  // ランプの各ステップ直後に呼ばれ、trueなら以後のvolume更新を中断する（手動スキップ等で
  // クロスフェード自体が不要になった場合。fade.tsのisCancelledと同じ方針）。中断時点の
  // 中間的なvolumeのまま残す（完了扱いにはしない）。
  isCancelled?: () => boolean;
  // ランプの各ステップ直後に呼ばれ、trueなら直ちに最終値（outgoing=0, incoming=1）を設定して
  // 終了する（2026-09-10、Codexレビュー指摘：P2）。次の曲（incoming）自体がクロスフェード長
  // より短く、ランプ完了前に自然終了した場合に使う：isCancelled（中断・中間値のまま放置）とは
  // 異なり、こちらは「完了扱い」として最終値まで進めてから戻るべきケースのため区別する。
  shouldFinishEarly?: () => boolean;
}

const DEFAULT_STEPS = 30;
const defaultWait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// クロスフェード長は秒単位でユーザーが選べる（2026-09-11、ユーザーからの提案：ON/OFFの隣に
// 秒数設定を置き、3/5/7/10秒から選べるとちょうどよい）。QUEUE_SORT_FIELDS（queueSort.ts）と
// 同じ「as const配列＋Record<...,label>」パターンで網羅性を保証する。
export const CROSSFADE_DURATION_OPTIONS_SEC = [3, 5, 7, 10] as const;
export type CrossfadeDurationSec = (typeof CROSSFADE_DURATION_OPTIONS_SEC)[number];
export const DEFAULT_CROSSFADE_DURATION_SEC: CrossfadeDurationSec = 3;

export function isCrossfadeDurationSec(value: number): value is CrossfadeDurationSec {
  return (CROSSFADE_DURATION_OPTIONS_SEC as readonly number[]).includes(value);
}

// E2Eでは実時間で長く待つとテストが遅くなるため短縮する（他の機能のVITE_E2E分岐と同じ方針）。
// 既定（3秒）がこれまでの固定値（50ms）と一致するよう、選択秒数に比例させる。
export const CROSSFADE_DURATION_MS = import.meta.env.VITE_E2E === "true" ? 50 : 3000;

export function crossfadeDurationMsForSeconds(seconds: number): number {
  return import.meta.env.VITE_E2E === "true"
    ? (seconds / DEFAULT_CROSSFADE_DURATION_SEC) * CROSSFADE_DURATION_MS
    : seconds * 1000;
}

// 第二audio要素の接続確立（先読み再生の開始）を、実際の音量ランプ開始しきい値より前倒しで
// 始めるための追加リード時間（2026-09-10、実機フィードバックによる再設計）。CROSSFADE_
// PREVIEW_START_TIMEOUT_MS（接続確立自体の上限）と同じ値にする：接続確立が最悪その上限まで
// かかったとしても、ランプ開始しきい値（残りcrossfadeDurationMs）に間に合わせる、または
// 僅かに間に合わない程度に抑える狙い。
export const CROSSFADE_PREPARE_LEAD_MS = import.meta.env.VITE_E2E === "true" ? 200 : 5000;

// 第二audio要素の先読み再生開始（play()）に与えるタイムアウト（2026-09-10、Codexレビュー
// 指摘：P1）。Driveストリームが拒否も解決もせず単に無応答のままだと、await crossfadeAudio.play()
// が永久に解決せずcrossfading=trueのまま固まり、主audio要素側の'ended'抑止（main.tsのonEnded
// コールバック）がキューの自動送りを無期限に止めてしまう。withTimeout()（Service Worker
// 制御待ちのタイムアウトと同じ方針）でこの待機に上限を設け、超過時は通常の`play()`失敗と同じ
// フォールバック経路（audioPlayer.endedなら通常の自然終了フローへ）に合流させる。
export const CROSSFADE_PREVIEW_START_TIMEOUT_MS = import.meta.env.VITE_E2E === "true" ? 200 : 5000;

// ハンドオフ完了時、主audio要素をまだ無音（volume 0）のうちに先読み側の到達位置へ追いつかせる
// 再シークの「seeked」イベント待ちに与えるタイムアウト（2026-09-12、ChatGPTレビュー指摘：
// P1。詳細はmain.tsのfinishCrossfadeHandoff()コメント参照）。この待機がタイムアウトしても
// 致命的ではない（その時点のcurrentTimeのままvolumeを1へ進めるだけ）ため、他の待機
// （CROSSFADE_PREVIEW_START_TIMEOUT_MS等）より短い値にしている——通常この再シークは既に
// バッファ済みの範囲内で完結する軽い操作のはずで、長時間かかる場合はもう追いつくのを
// 諦めた方がユーザー体験上望ましいため。
export const CROSSFADE_HANDOFF_SEEK_TIMEOUT_MS = import.meta.env.VITE_E2E === "true" ? 100 : 1000;

// 2026-09-13、Codexレビュー指摘（P1×2）を受けた再設計：①「Keep an audible source running
// until the seek completes」——先読み側（crossfadeAudio）を早期に一時停止すると、主audio要素が
// まだ無音のこの待機中は完全な無音区間になってしまう（一時対応した「一時停止して位置を凍結する」
// 設計自体が、PR #443で解消したはずの無音区間を再導入していた）。②「Freeze the preview at the
// snapshot or otherwise account for its elapsed time」——一方、先読み側を鳴らし続けたまま単発の
// 再シークだけで済ませると、待機に要した時間ぶん先読み側がさらに進んでしまい、位置がずれる
// （#446のフレーズリピート回帰の再導入）。両立させるため、先読み側は最後まで鳴らし続けたまま
// （＝①を満たす）、追いつくべき目標位置を都度再確認しながら再シークを複数回繰り返し、待機中の
// 前進分を後続のイテレーションで吸収する（＝②を満たす）方式にした。無限に繰り返さないよう
// 試行回数の上限（`CROSSFADE_HANDOFF_CATCHUP_MAX_ATTEMPTS`）と、十分収束したとみなす許容誤差
// （`CROSSFADE_HANDOFF_CATCHUP_TOLERANCE_SEC`）を設ける。最後のイテレーション後は追加の
// シークを行わずvolumeを1へ進めるため、音量を上げる瞬間に新たな`currentTime`書き換えが
// 起きることはない（=これがそもそもの音飛びの原因だったため、ここが崩れると再発する）。
export const CROSSFADE_HANDOFF_CATCHUP_MAX_ATTEMPTS = 3;
export const CROSSFADE_HANDOFF_CATCHUP_TOLERANCE_SEC = 0.05;

// 進行度（0=開始直後、1=完了）に対する退場側/入場側それぞれの音量。単純な線形（合計は常に1）。
export function crossfadeVolumes(progress: number): { outgoing: number; incoming: number } {
  const p = Math.min(1, Math.max(0, progress));
  return { outgoing: 1 - p, incoming: p };
}

// 退場側（outgoing）を1→0、入場側（incoming）を0→1へ同時にランプする。durationMsが0以下の
// 場合は即座に完了値へ設定する（fadeOutVolume()と同じ方針）。
export async function runCrossfade(
  outgoing: CrossfadeableAudio,
  incoming: CrossfadeableAudio,
  durationMs: number,
  options: CrossfadeOptions = {}
): Promise<void> {
  if (durationMs <= 0) {
    if (!options.isCancelled?.()) {
      outgoing.volume = 0;
      incoming.volume = 1;
    }
    return;
  }
  const steps = options.steps ?? DEFAULT_STEPS;
  const wait = options.wait ?? defaultWait;
  const stepDuration = durationMs / steps;
  for (let i = 1; i <= steps; i += 1) {
    await wait(stepDuration);
    if (options.isCancelled?.()) return;
    if (options.shouldFinishEarly?.()) {
      outgoing.volume = 0;
      incoming.volume = 1;
      return;
    }
    const { outgoing: o, incoming: inc } = crossfadeVolumes(i / steps);
    outgoing.volume = o;
    incoming.volume = inc;
  }
}

// 実機フィードバック（2026-09-10マージ後）：「フェードが短すぎてまだクロスしてません」
// 「次曲に切り替わったあと、一瞬曲が途切れています」。根本原因は、旧設計が「曲の末尾まで
// crossfadeDurationMs以下」を検知した"その場で"第二audio要素のplay()を待ってからランプを
// 開始していたこと。Service Worker経由のDrive接続確立（認証・Range要求の往復）は数百ms〜
// 数秒かかりうる実際のネットワークI/Oで、この待ち時間の分だけ退場側の実際の残り時間が
// 目減りするにも関わらず、ランプ自体は常に固定のcrossfadeDurationMsで走っていた。接続確立が
// 長引くと退場側がランプ完了前に（時にはランプ開始前に）自然終了してしまい、「クロスして
// いるはずの時間のほとんどが無音の退場側を相手にした空ランプ」になる——ひどい場合は
// `audioPlayer.ended`分岐によりランプ自体が省略され、フェードが全く無い即座の切り替えになる。
// 「開始判定」と「実際に音量ランプを開始してよい判定」を分離し、前者を十分早いタイミング
// （crossfadeDurationMs + prepareLeadMs前）で発火させて接続確立をランプ開始前に完了させておく
// （＝実際にランプを開始する時点では、第二audio要素は既に音を流せる状態になっている）よう
// 再設計した。

export interface CrossfadeGateParams {
  crossfadeEnabled: boolean;
  hasNextSong: boolean;
  duration: number;
  currentTime: number;
  // 主audio要素が一時停止中かどうか（2026-09-10、Codexレビュー指摘：P1）。一時停止中は
  // isPlayingFromQueue()がtrueのまま残るため（アプリの一時停止ボタン・Media Sessionの
  // 一時停止のいずれも、キュー由来の再生であることそのものは変えない）、この判定が無いと、
  // 一時停止してから曲末尾のしきい値以内へシークするだけで先読み再生が始まり、Playを
  // 押していないのに音が鳴り出してしまう。
  audioPaused: boolean;
  // 明示的な手動遷移（次へ/前へ/曲名クリック等キュー由来の操作、一時停止ボタン）が進行中
  // かどうか（2026-09-10、ChatGPTレビュー指摘：P1）。手動フェードアウト（既定約2秒）を伴う
  // 操作は、その待機中も旧曲がまだ再生中のままtimeupdateが継続するため、crossfading・
  // audioPaused・isPlayingFromQueue()だけではクロスフェードの開始を防げず、フェード完了直前の
  // onTransitionStart()で最終的な二重commitこそ防げるものの、その手前で実際に先読み再生を
  // 開始してしまっていた（クロスフェードは「キュー内曲の自然終了時のみ」の設計に反する）。
  manualTransitionInFlight: boolean;
}

function remainingMsUntilEnd(duration: number, currentTime: number): number | null {
  if (!Number.isFinite(duration) || duration <= 0) return null;
  const remainingMs = (duration - currentTime) * 1000;
  return remainingMs > 0 ? remainingMs : null;
}

export interface ShouldStartCrossfadePreparationParams extends CrossfadeGateParams {
  isPreparing: boolean;
  isCrossfading: boolean;
  // 実際のランプ開始しきい値（crossfadeDurationMs）より前倒しで、第二audio要素の接続確立
  // だけを先に始めるためのしきい値（crossfadeDurationMs + 接続確立の見込み時間）。
  prepareThresholdMs: number;
}

// 第二audio要素の先読み再生（接続確立）を開始すべきタイミングかどうか。durationが未確定
// （NaN/Infinity/0以下、ストリーミング開始直後でメタデータ未確定の間）は開始しない
// （seekBar.tsのisSeekableDurationと同じ理由）。
export function shouldStartCrossfadePreparation(params: ShouldStartCrossfadePreparationParams): boolean {
  if (
    !params.crossfadeEnabled ||
    params.isPreparing ||
    params.isCrossfading ||
    !params.hasNextSong ||
    params.audioPaused ||
    params.manualTransitionInFlight
  ) return false;
  const remainingMs = remainingMsUntilEnd(params.duration, params.currentTime);
  return remainingMs !== null && remainingMs <= params.prepareThresholdMs;
}

export interface ShouldBeginCrossfadeRampParams extends CrossfadeGateParams {
  isPreparing: boolean;
  isCrossfading: boolean;
  crossfadeDurationMs: number;
  // 退場側（主audio要素）が既に自然終了しているかどうか。接続確立に crossfadeDurationMs +
  // prepareLeadMs を超える時間がかかった稀なケースで、まだ「準備中」のうちに退場側が
  // 先に終わってしまうことがある。ended時はaudioPaused（ended時はネイティブにpausedも
  // trueになる）に関わらず直ちにランプを開始すべきなので、audioPausedチェックより先に
  // 判定する。
  audioEnded: boolean;
  // 第二audio要素の先読み再生が実際に開始済み（play()が解決済み）かどうか（2026-09-10、
  // ChatGPTレビュー指摘：P1）。isPreparing自体はplay()呼び出し直前（まだ何も鳴っていない
  // 可能性がある）から立つため、これだけでは「実際にランプしてよい状態」を保証できない。
  // これが無いと、退場側が準備中に先に自然終了した場合のaudioEndedバイパスが、まだ再生を
  // 開始していない（無音のままかもしれない）第二audio要素へ向けてランプを始めてしまい、
  // 「先読みが未確立のままハンドオフする」という、このPRが本来解消しようとした不具合を
  // audioEndedバイパス経由で再現してしまう。
  previewReady: boolean;
}

// 準備済み（第二audio要素が既に再生開始済み）の状態から、実際に音量ランプを開始すべき
// タイミングかどうか。
export function shouldBeginCrossfadeRamp(params: ShouldBeginCrossfadeRampParams): boolean {
  if (
    !params.crossfadeEnabled ||
    !params.isPreparing ||
    params.isCrossfading ||
    !params.hasNextSong ||
    params.manualTransitionInFlight ||
    !params.previewReady
  ) return false;
  if (params.audioEnded) return true;
  if (params.audioPaused) return false;
  const remainingMs = remainingMsUntilEnd(params.duration, params.currentTime);
  return remainingMs !== null && remainingMs <= params.crossfadeDurationMs;
}

// ============================================================================
// クロスフェード ロールスワップ・オーケストレーター（2026-09-14〜、PR2）
// ============================================================================
// 上記の純粋な判定関数（shouldStartCrossfadePreparation/shouldBeginCrossfadeRamp/
// runCrossfade）はそのまま再利用できる（旧ハンドオフ方式でも「音量をどうランプするか」
// 「いつ準備・ランプを始めるべきか」という判定自体は同じだったため）。変わるのは「準備・
// ランプ・コミットを実際にどう実行するか」——旧方式は一時的な第二audio要素へシーク＋
// 音量ジャンプでメインへ制御を渡す「ハンドオフ」だったが、role-swapはDualAudioPlayerの
// 非アクティブスロットで先読み再生を最後まで独立に続け、コミット瞬間はポインタの
// 付け替えだけ（src/currentTime/play/pause/volumeのいずれにも触れない）にする。
// 状態機械（準備中→ランプ中→コミット）自体はmain.tsではなくここ（テスト可能なモジュール）に
// 持たせる——main.tsはDOM結線のみを担うという本リポジトリ全体の既存方針（AI開発ルール1）に
// 沿う。

export interface CrossfadeAudioElement {
  volume: number;
  paused: boolean;
  ended: boolean;
  duration: number;
  currentTime: number;
  pause(): void;
}

export interface CrossfadePlaybackControllerLike {
  play(fileId: string, position?: number): Promise<void>;
  cancelPendingTransition?(): void;
}

// main.tsのDualAudioPlayerが実装するインターフェースの、このオーケストレーターが必要とする
// 部分だけを切り出したもの（テスト時は薄いフェイクで満たせる）。
export interface CrossfadeDualPlayerLike {
  inactiveController(): CrossfadePlaybackControllerLike;
  activeAudioElement(): CrossfadeAudioElement;
  inactiveAudioElement(): CrossfadeAudioElement;
  // 不変条件そのもの：src/currentTime/play()/pause()/volumeのいずれにも触れず、
  // activeスロットを付け替えるだけ。
  commitPromotion(): void;
  // 昇格後、非アクティブ側（＝旧アクティブ側 or 打ち切られた準備）を後始末する。
  resetInactive(): void;
}

export interface CrossfadeQueueLike {
  peekNextFileId(): string | null;
  isPlayingFromQueue(): boolean;
  // 不変条件：prepared曲が除外済み・別リストへ変更済み・世代不一致ならfalseを返し
  // （commitしない）、trueを返した場合だけ実際にキューのcurrentFileId/isQueuePlaybackが
  // 確定する。player.play()は一切呼ばない。
  commitPreparedFile(fileId: string): Promise<boolean>;
}

export type WaitFn = (ms: number) => Promise<void>;
export type WithTimeoutFn = <T>(promise: Promise<T>, timeoutMs: number, message: string) => Promise<T>;

export interface CrossfadeOrchestratorOptions {
  steps?: number;
  wait?: WaitFn;
  withTimeout?: WithTimeoutFn;
  prepareLeadMs?: number;
  previewStartTimeoutMs?: number;
  // promotion完了直後（awaitを挟まず同期的に）呼ばれる。呼び出し元がシークバー等の表示を
  // 次のtimeupdate発火を待たず即座に更新するためのフック。
  onPromoted?: () => void;
  // 進行中の準備・ランプが、この曲自体の理由（先読み再生開始失敗・タイムアウト・退場側の
  // 自然終了に追いつけない等）で諦める必要が生じた場合に呼ばれる。呼び出し元は通常の
  // 自然終了フロー（advanceOnEnded()等）へフォールバックする。
  onFallbackToNaturalEnd?: () => void;
}

export interface CrossfadeStartParams {
  enabled: boolean;
  durationMs: number;
  manualTransitionInFlight: boolean;
}

const defaultWithTimeoutFn: WithTimeoutFn = (promise, timeoutMs, message) =>
  Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(message)), timeoutMs)),
  ]);

export class CrossfadeOrchestrator {
  private generation = 0;
  private preparing = false;
  private crossfading = false;
  private previewReady = false;
  private previewedFileId: string | null = null;
  private durationMsActive = 0;

  constructor(
    private readonly player: CrossfadeDualPlayerLike,
    private readonly queue: CrossfadeQueueLike,
    private readonly hasToken: () => boolean,
    private readonly options: CrossfadeOrchestratorOptions = {}
  ) {}

  isPreparing(): boolean { return this.preparing; }
  isCrossfading(): boolean { return this.crossfading; }
  isActive(): boolean { return this.preparing || this.crossfading; }

  // main.tsのtimeupdate（activeスロットのfaçade経由）から毎回呼ぶ。①準備中でも実行中でも
  // なければ準備を試み、②準備中かつ実行中でなければランプ開始を試みる（同一呼び出し内で
  // カスケードしうる：残り時間が既にランプしきい値以下なら、準備を試みた直後にランプ判定も
  // 行われる）。
  async maybeStart(params: CrossfadeStartParams): Promise<void> {
    if (!this.preparing && !this.crossfading) {
      if (!this.shouldPrepareNow(params)) return;
      await this.startPreparation(params.durationMs);
    }
    if (this.preparing && !this.crossfading) {
      await this.tryBeginRamp(params);
    }
  }

  private shouldPrepareNow(params: CrossfadeStartParams): boolean {
    const audio = this.player.activeAudioElement();
    return (
      shouldStartCrossfadePreparation({
        crossfadeEnabled: params.enabled,
        isPreparing: this.preparing,
        isCrossfading: this.crossfading,
        hasNextSong: Boolean(this.queue.peekNextFileId()),
        duration: audio.duration,
        currentTime: audio.currentTime,
        prepareThresholdMs: params.durationMs + (this.options.prepareLeadMs ?? CROSSFADE_PREPARE_LEAD_MS),
        audioPaused: audio.paused,
        manualTransitionInFlight: params.manualTransitionInFlight,
      }) && this.queue.isPlayingFromQueue()
    );
  }

  private async startPreparation(durationMs: number): Promise<void> {
    const nextFileId = this.queue.peekNextFileId();
    // 現在有効なトークンが無ければクロスフェードを諦め、通常の自然終了フローに委ねる
    // （v1と同じ既知の制限：クロスフェードの先読み再生自体はDrive 401の認証継続フローに
    // フックしない）。
    if (!nextFileId || !this.hasToken()) return;

    this.preparing = true;
    this.previewReady = false;
    this.durationMsActive = durationMs;
    this.previewedFileId = nextFileId;
    const myGeneration = this.generation;
    const inactiveAudio = this.player.inactiveAudioElement();
    inactiveAudio.volume = 0;
    const withTimeout = this.options.withTimeout ?? defaultWithTimeoutFn;
    try {
      await withTimeout(
        this.player.inactiveController().play(nextFileId),
        this.options.previewStartTimeoutMs ?? CROSSFADE_PREVIEW_START_TIMEOUT_MS,
        "クロスフェードの先読み再生がタイムアウトしました"
      );
      // play()が実際に解決した時点でのみ「準備完了」とする。待機中に本物の割り込み
      // （cancel()）で既に打ち切られていた場合は反映しない。
      if (this.generation === myGeneration) this.previewReady = true;
    } catch {
      if (this.generation === myGeneration && this.preparing) {
        const wasActiveEnded = this.player.activeAudioElement().ended;
        this.resetPrepareState();
        this.player.resetInactive();
        if (wasActiveEnded) this.options.onFallbackToNaturalEnd?.();
      }
      // generationが既に変わっていれば、cancel()側が後始末済み（何もしない）。
    }
  }

  private resetPrepareState(): void {
    this.preparing = false;
    this.previewReady = false;
    this.previewedFileId = null;
  }

  // 準備完了後、実際にランプを開始してよいタイミングかどうかを判定し、満たしていればランプを
  // 実行する。呼び出し元（queueのonEnded経由、退場側が準備中に先に自然終了した場合の即時
  // ハンドオフ）からも呼べるよう公開する。
  async tryBeginRamp(params: CrossfadeStartParams): Promise<boolean> {
    const activeAudio = this.player.activeAudioElement();
    const ok =
      shouldBeginCrossfadeRamp({
        crossfadeEnabled: params.enabled,
        isPreparing: this.preparing,
        isCrossfading: this.crossfading,
        hasNextSong: Boolean(this.queue.peekNextFileId()),
        duration: activeAudio.duration,
        currentTime: activeAudio.currentTime,
        crossfadeDurationMs: this.durationMsActive,
        audioPaused: activeAudio.paused,
        audioEnded: activeAudio.ended,
        manualTransitionInFlight: params.manualTransitionInFlight,
        previewReady: this.previewReady,
      }) && this.queue.isPlayingFromQueue();
    if (!ok) return false;
    await this.beginRamp();
    return true;
  }

  private async beginRamp(): Promise<void> {
    const nextFileId = this.previewedFileId;
    if (!nextFileId) {
      this.preparing = false;
      return;
    }
    this.preparing = false;
    this.crossfading = true;
    const myGeneration = this.generation;
    const activeAudio = this.player.activeAudioElement();
    const inactiveAudio = this.player.inactiveAudioElement();
    // 準備開始からランプ開始までの間、先読み側は無音のまま鳴り続けているため、この時点の
    // currentTimeは既に数秒進んでいる（CROSSFADE_PREPARE_LEAD_MS分）。次の曲は「冒頭から」
    // 重ねて鳴らす設計のため、ランプ開始前に先頭へ巻き戻す。
    if (inactiveAudio.currentTime !== 0) inactiveAudio.currentTime = 0;
    // 退場側が既に自然終了している場合のみ、ランプ自体を省略して直ちに完了値へ進める。
    const rampDurationMs = activeAudio.ended ? 0 : this.durationMsActive;
    await runCrossfade(activeAudio, inactiveAudio, rampDurationMs, {
      isCancelled: () => this.generation !== myGeneration,
      // 次の曲（入場側）自体がクロスフェード長より短く、ランプ完了前に自然終了した場合。
      shouldFinishEarly: () => inactiveAudio.ended,
      steps: this.options.steps,
      wait: this.options.wait,
    });
    if (this.generation !== myGeneration) return;
    await this.commit(nextFileId, myGeneration);
  }

  private async commit(nextFileId: string, myGeneration: number): Promise<void> {
    // queue.commitPreparedFile()はplayer.play()を一切呼ばない純粋な帳簿更新（pendingMove
    // 直列化のためawaitは必要）。この待機中に本物の割り込み（cancel()）が発生していれば、
    // 既にそちらが後始末済みのため何もしない。
    const committed = await this.queue.commitPreparedFile(nextFileId);
    if (this.generation !== myGeneration) return;
    if (!committed) {
      // 不変条件：commit失敗時はpromotionしない（除外済み・別リストへ変更済み等）。
      this.crossfading = false;
      this.previewedFileId = null;
      this.player.resetInactive();
      return;
    }
    // 不変条件のコア：commitとpromotionの間にawaitを挟まない。ランプ完了時点で既に
    // outgoing.volume===0 / incoming.volume===1が成立しているため、promotionの前後で
    // 聴感上の変化は生じない。旧active側の後始末（pause/src破棄）はpromotion完了後、
    // 今や非アクティブになったその要素に対して行う。
    this.player.commitPromotion();
    this.crossfading = false;
    this.previewedFileId = null;
    this.player.resetInactive();
    this.options.onPromoted?.();
  }

  // 本物の割り込み（一時停止・シーク・次へ/前へ・setList等）が起きた場合に呼ぶ。進行中の
  // 準備・ランプを打ち切り、非アクティブ側だけを後始末する。アクティブ側のsrc/currentTime/
  // play/pauseには一切触れない（不変条件：古いslotの後始末が新active側の遷移状態を
  // 巻き込まない）——これは、準備・ランプが常に非アクティブ側のコントローラだけを操作し
  // （ChatGPTレビュー指摘③、DualAudioPlayerのonTransitionStartが非アクティブ側を無視する
  // ことと対になる設計）、この打ち切りも非アクティブ側のコントローラだけを対象にする
  // （player.cancelPendingTransition()という両スロット無効化のブロードな版ではなく、
  // inactiveController()経由で狭くスコープする）ことで保証される。
  cancel(): void {
    if (!this.preparing && !this.crossfading) return;
    this.generation += 1;
    this.preparing = false;
    this.crossfading = false;
    this.previewReady = false;
    this.previewedFileId = null;
    this.player.inactiveController().cancelPendingTransition?.();
    this.player.resetInactive();
  }
}

// 実機フィードバック（2026-09-11〜12）：「クロスフェードで曲が切り替わって、シークバーと
// ステータスが次曲に変わった瞬間に一瞬音飛みします」。当初の原因分析は`finishCrossfadeHandoff()`
// （main.ts）が、主audio要素の再生開始（`initialHandoffPosition`から）後に、先読み側
// （crossfadeAudio、鳴り続けたぶんだけさらに進んでいる）の位置へ**もう一度**再シークしており、
// バッファ範囲を超えると新しいRange要求を伴うため、というものだった。「バッファ済みの範囲
// だけへ再シーク」（`isPositionBuffered()`→`bufferedCatchUpPosition()`）と2段階で絞り込んだが、
// 実機の録画（波形解析）で再検証したところ、範囲内に絞ってもなお同じ瞬間に音飛びが発生して
// いた。原因はバッファの有無ではなく、`audioPlayer.currentTime`への書き込みという操作
// そのもの（ブラウザの内部デコードパイプラインを瞬間的に再同期させる）が、その直後の
// `volume = 1`と重なって聞こえていたことだったと判明した。最終的にmain.tsの
// `finishCrossfadeHandoff()`からこの位置合わせ用の再シーク自体を撤去し、この関数と
// `BufferedRangesLike`は不要になったため削除した（詳細な経緯は`dusty-jukebox/CLAUDE.md`の
// 「クロスフェード」節参照）。
