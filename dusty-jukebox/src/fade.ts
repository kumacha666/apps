// 手動スキップ（次へ/前へ/曲名クリック）時のフェードアウト（開発体制#42④の一部）。
// 曲間の自然終了時のクロスフェード（本格的な2曲重複再生）は別PRで実装する別機能。
export interface FadeableAudio {
  volume: number;
}

export interface FadeOutOptions {
  // テスト用に段階数・待機関数を差し替え可能にする（他のDI関数と同じ方針）。
  steps?: number;
  wait?: (ms: number) => Promise<void>;
  // 2026-09-08、Codexレビュー指摘（P1）：フェード中に別のplay()が開始する（世代が変わる）等で
  // このフェード自体が不要になった場合、呼び出し元がtrueを返すことで各ステップの直後に
  // 中断できる。中断時はvolumeを0まで下げきらず、その時点の値のまま呼び出し元に制御を返す
  // （中断後のvolume管理は、もはやこのフェードの責務ではなく呼び出し元＝新しい再生の責務）。
  isCancelled?: () => boolean;
}

// 手動スキップのフェードアウトは、音量(振幅)を線形に下げると終わり際に「急に消えた」ように
// 聞こえる（聴感は対数的で、線形ランプは後半で音量の相対的な落ち幅が最も大きくなるため）。
// 開始直後に素早く下がり、その後長く細くなる指数カーブにして自然な余韻にする（2026-10-30、
// ユーザー要望）。値が大きいほど尾が長く、冒頭の落ち込みが急になる。
const FADE_OUT_CURVE_STEEPNESS = 3;
const DEFAULT_STEPS = 60;
const defaultWait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// 進行度（0=開始直後、1=完了）に対する開始音量比（1→0）。終端は厳密に0にする。
export function fadeOutGain(progress: number): number {
  if (progress <= 0) return 1;
  if (progress >= 1) return 0;
  return (Math.exp(FADE_OUT_CURVE_STEEPNESS * (1 - progress)) - 1) / (Math.exp(FADE_OUT_CURVE_STEEPNESS) - 1);
}

// audio.volumeを現在値から0まで段階的に下げる。durationMsが0以下、または既に0の場合は
// 即座に0にして終える（無音状態からの不要な待機を避ける）。
export async function fadeOutVolume(audio: FadeableAudio, durationMs: number, options: FadeOutOptions = {}): Promise<void> {
  const startVolume = audio.volume;
  if (durationMs <= 0 || startVolume <= 0) {
    if (!options.isCancelled?.()) audio.volume = 0;
    return;
  }
  const steps = options.steps ?? DEFAULT_STEPS;
  const wait = options.wait ?? defaultWait;
  const stepDuration = durationMs / steps;
  for (let i = 1; i <= steps; i += 1) {
    await wait(stepDuration);
    if (options.isCancelled?.()) return;
    audio.volume = startVolume * fadeOutGain(i / steps);
  }
}

// 進行度（0=開始直後、1=完了）に対する目標音量比（0→1）。両端で変化率0のなだらかなS字
// （クロスフェードの入場側と同じ余弦イージング）にして、再開の瞬間に唐突に音が立ち上がらず、
// 目標音量にも自然に収束させる。端点は厳密に0/1。
export function fadeInGain(progress: number): number {
  if (!(progress > 0)) return 0;
  if (progress >= 1) return 1;
  return (1 - Math.cos(progress * Math.PI)) / 2;
}

// audio.volumeを0からtargetVolumeまで段階的に上げる（リジューム再生時のフェードイン）。
// 呼び出し元が事前にvolumeを0にしておく前提。durationMsが0以下、またはtargetVolumeが0以下の
// 場合は待機せず即座にtargetVolumeへ設定する。isCancelledがtrueを返した時点で更新を止める
// （中断後のvolume管理は呼び出し元の責務、fadeOutVolume()と同じ方針）。
export async function fadeInVolume(
  audio: FadeableAudio,
  targetVolume: number,
  durationMs: number,
  options: FadeOutOptions = {}
): Promise<void> {
  if (durationMs <= 0 || targetVolume <= 0) {
    if (!options.isCancelled?.()) audio.volume = Math.max(0, targetVolume);
    return;
  }
  const steps = options.steps ?? DEFAULT_STEPS;
  const wait = options.wait ?? defaultWait;
  const stepDuration = durationMs / steps;
  for (let i = 1; i <= steps; i += 1) {
    await wait(stepDuration);
    if (options.isCancelled?.()) return;
    audio.volume = targetVolume * fadeInGain(i / steps);
  }
}
