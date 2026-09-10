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
  // クロスフェード自体が不要になった場合。fade.tsのisCancelledと同じ方針）。
  isCancelled?: () => boolean;
}

const DEFAULT_STEPS = 30;
const defaultWait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// E2Eでは実時間で3秒待つとテストが遅くなるため短縮する（他の機能のVITE_E2E分岐と同じ方針）。
export const CROSSFADE_DURATION_MS = import.meta.env.VITE_E2E === "true" ? 50 : 3000;

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
}

// 現在の再生位置がクロスフェードを開始すべきタイミング（曲の末尾までの残り時間がクロスフェード
// の長さ以下）かどうか。durationが未確定（NaN/Infinity/0以下、ストリーミング開始直後でメタ
// データ未確定の間）は開始しない（seekBar.tsのisSeekableDurationと同じ理由）。
export function shouldStartCrossfade(params: ShouldStartCrossfadeParams): boolean {
  if (!params.crossfadeEnabled || params.isCrossfading || !params.hasNextSong) return false;
  if (!Number.isFinite(params.duration) || params.duration <= 0) return false;
  const remainingMs = (params.duration - params.currentTime) * 1000;
  return remainingMs > 0 && remainingMs <= params.crossfadeDurationMs;
}
