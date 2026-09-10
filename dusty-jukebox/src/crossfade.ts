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

export interface ShouldStartCrossfadeParams {
  crossfadeEnabled: boolean;
  isCrossfading: boolean;
  hasNextSong: boolean;
  duration: number;
  currentTime: number;
  crossfadeDurationMs: number;
  // 主audio要素が一時停止中かどうか（2026-09-10、Codexレビュー指摘：P1）。一時停止中は
  // isPlayingFromQueue()がtrueのまま残るため（アプリの一時停止ボタン・Media Sessionの
  // 一時停止のいずれも、キュー由来の再生であることそのものは変えない）、この判定が無いと、
  // 一時停止してから曲末尾3秒以内へシークするだけで先読み再生が始まり、Playを押していない
  // のに音が鳴り出してしまう。
  audioPaused: boolean;
  // 明示的な手動遷移（次へ/前へ/曲名クリック等キュー由来の操作、一時停止ボタン）が進行中
  // かどうか（2026-09-10、ChatGPTレビュー指摘：P1）。手動フェードアウト（既定約2秒）を伴う
  // 操作は、その待機中も旧曲がまだ再生中のままtimeupdateが継続するため、crossfading・
  // audioPaused・isPlayingFromQueue()だけではクロスフェードの開始を防げず、フェード完了直前の
  // onTransitionStart()で最終的な二重commitこそ防げるものの、その手前で実際に先読み再生を
  // 開始してしまっていた（クロスフェードは「キュー内曲の自然終了時のみ」の設計に反する）。
  manualTransitionInFlight: boolean;
}

// 現在の再生位置がクロスフェードを開始すべきタイミング（曲の末尾までの残り時間がクロスフェード
// の長さ以下）かどうか。durationが未確定（NaN/Infinity/0以下、ストリーミング開始直後でメタ
// データ未確定の間）は開始しない（seekBar.tsのisSeekableDurationと同じ理由）。
export function shouldStartCrossfade(params: ShouldStartCrossfadeParams): boolean {
  if (
    !params.crossfadeEnabled ||
    params.isCrossfading ||
    !params.hasNextSong ||
    params.audioPaused ||
    params.manualTransitionInFlight
  ) return false;
  if (!Number.isFinite(params.duration) || params.duration <= 0) return false;
  const remainingMs = (params.duration - params.currentTime) * 1000;
  return remainingMs > 0 && remainingMs <= params.crossfadeDurationMs;
}
