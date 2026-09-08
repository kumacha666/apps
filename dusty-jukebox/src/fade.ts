// 手動スキップ（次へ/前へ/曲名クリック）時のフェードアウト（開発体制#42④の一部）。
// 曲間の自然終了時のクロスフェード（本格的な2曲重複再生）は別PRで実装する別機能。
export interface FadeableAudio {
  volume: number;
}

export interface FadeOutOptions {
  // テスト用に段階数・待機関数を差し替え可能にする（他のDI関数と同じ方針）。
  steps?: number;
  wait?: (ms: number) => Promise<void>;
}

const DEFAULT_STEPS = 20;
const defaultWait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// audio.volumeを現在値から0まで段階的に下げる。durationMsが0以下、または既に0の場合は
// 即座に0にして終える（無音状態からの不要な待機を避ける）。
export async function fadeOutVolume(audio: FadeableAudio, durationMs: number, options: FadeOutOptions = {}): Promise<void> {
  const startVolume = audio.volume;
  if (durationMs <= 0 || startVolume <= 0) {
    audio.volume = 0;
    return;
  }
  const steps = options.steps ?? DEFAULT_STEPS;
  const wait = options.wait ?? defaultWait;
  const stepDuration = durationMs / steps;
  for (let i = 1; i <= steps; i += 1) {
    await wait(stepDuration);
    audio.volume = Math.max(0, startVolume * (1 - i / steps));
  }
  audio.volume = 0;
}
