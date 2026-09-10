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

// E2Eでは実時間で3秒待つとテストが遅くなるため短縮する（他の機能のVITE_E2E分岐と同じ方針）。
export const CROSSFADE_DURATION_MS = import.meta.env.VITE_E2E === "true" ? 50 : 3000;

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
}

// 準備済み（第二audio要素が既に再生開始済み）の状態から、実際に音量ランプを開始すべき
// タイミングかどうか。
export function shouldBeginCrossfadeRamp(params: ShouldBeginCrossfadeRampParams): boolean {
  if (
    !params.crossfadeEnabled ||
    !params.isPreparing ||
    params.isCrossfading ||
    !params.hasNextSong ||
    params.manualTransitionInFlight
  ) return false;
  if (params.audioEnded) return true;
  if (params.audioPaused) return false;
  const remainingMs = remainingMsUntilEnd(params.duration, params.currentTime);
  return remainingMs !== null && remainingMs <= params.crossfadeDurationMs;
}
