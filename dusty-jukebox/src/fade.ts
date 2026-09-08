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

const DEFAULT_STEPS = 20;
const defaultWait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

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
    audio.volume = Math.max(0, startVolume * (1 - i / steps));
  }
}
