// バックグラウンド再生の自動復帰の判定（2026-09-15、実機フィードバック「バックグラウンド再生時に
// 次曲が再生されない問題も解決してほしい」）。ページが再びvisible/resumeになった時点で、
// 「キュー曲を再生中のはずなのに、ユーザー自身が明示的に一時停止したわけではなく、実際の
// <audio>要素は一時停止・未終了のまま止まっている」場合にのみ自動再開を試みる、という条件を
// main.tsの薄いDOM結線から切り出した純粋関数（externalPlayback.ts/playbackStatus.ts等と同じ方針）。

export interface BackgroundPlaybackRecoveryState {
  userPausedPlayback: boolean;
  canResumeCurrent: boolean;
  audioPaused: boolean;
  audioEnded: boolean;
}

// - ユーザー自身が明示的に一時停止した（アプリの「一時停止」ボタン・Bluetooth/OSのpause）
//   → false（意図的な停止を勝手に再開しない）
// - キュー曲を再開できる状態にない（未再生・単曲試聴で上書き済み・除外済み等）→ false
// - 既に再生中（一時停止していない）→ false（再開の余地が無い）
// - 曲が最後まで再生され自然終了した場合（ended）→ false（次の'ended'処理に委ねる）
export function shouldAttemptBackgroundPlaybackRecovery(state: BackgroundPlaybackRecoveryState): boolean {
  return !state.userPausedPlayback && state.canResumeCurrent && state.audioPaused && !state.audioEnded;
}
