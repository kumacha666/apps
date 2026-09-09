// 単曲試聴（「この曲を再生」、キュー外）の再開判定（2026-09-09、ChatGPTレビュー指摘：P2）。
// ネイティブ<audio controls>を廃止したことで、従来ネイティブの再生アイコンが担っていた
// 「一時停止位置からの再開」が単曲試聴では失われていた（queue.canResumeCurrent()に相当する
// 仕組みがキュー外の単曲試聴には無かったため）。main.tsの薄いDOM結線から呼ぶ純粋関数として
// 切り出す（mediaSession.ts/playbackStatus.ts等と同じ方針）。

export interface ExternalPlaybackResumeState {
  lastExternalFileId: string | null;
  fileId: string;
  audioPaused: boolean;
  audioEnded: boolean;
}

// 直前に単曲試聴を開始したのと同じfileIdへの再生要求で、かつ一時停止中（自然終了ではない）
// なら、先頭からではなく一時停止位置からの再開を提案する。
// - fileIdが異なる（別の曲、または一度もこのfileIdを単曲試聴していない）→ false
// - 再生中（一時停止していない）→ false（そのまま再生中のため再開の余地が無い）
// - 曲が最後まで再生され自然終了した場合（ended）→ false（先頭から再生し直す）
export function shouldResumeExternalPlayback(state: ExternalPlaybackResumeState): boolean {
  return state.lastExternalFileId === state.fileId && state.audioPaused && !state.audioEnded;
}
