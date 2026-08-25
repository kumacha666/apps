import type { EnsureAccessToken } from "./streamAuth";

export function streamUrl(fileId: string): string {
  return `./stream/${encodeURIComponent(fileId)}`;
}

export interface AudioElementLike {
  src: string;
  currentTime: number;
  play(): Promise<void>;
  pause(): void;
  addEventListener(type: "error" | "pause", listener: () => void): void;
}

export type PlaybackRetryErrorHandler = (error: unknown) => void;

// 再生キューを持たない最小の再生器。401時のaudio要素は詳細なHTTPステータスを公開しないため、
// src読み込みエラーを認証更新後の一度だけの再試行として扱う。
export class PlaybackController {
  private currentFileId: string | null = null;
  private retried = false;
  private generation = 0;

  constructor(
    private readonly audio: AudioElementLike,
    private readonly refreshAccessToken: EnsureAccessToken,
    private readonly onRetryError: PlaybackRetryErrorHandler = () => {}
  ) {
    audio.addEventListener("error", () => void this.retryAfterAuthFailure());
    // ネイティブコントロール経由の停止でも、認証再取得中の古い再試行を破棄する。
    audio.addEventListener("pause", () => { this.generation += 1; });
  }

  async play(fileId: string): Promise<void> {
    this.generation += 1;
    this.currentFileId = fileId;
    this.retried = false;
    this.audio.src = streamUrl(fileId);
    await this.audio.play();
  }

  pause(): void {
    this.generation += 1;
    this.audio.pause();
  }

  private async retryAfterAuthFailure(): Promise<void> {
    if (!this.currentFileId || this.retried) return;
    this.retried = true;
    const retryGeneration = this.generation;
    const retryFileId = this.currentFileId;
    const position = this.audio.currentTime;
    try {
      await this.refreshAccessToken();
      // トークン再取得中に別曲の再生・停止が入ったなら、その古い続行処理は破棄する。
      if (this.generation !== retryGeneration || this.currentFileId !== retryFileId) return;
      this.audio.src = streamUrl(retryFileId);
      this.audio.currentTime = position;
      await this.audio.play();
    } catch (error) {
      // 同じ世代の失敗だけをUIに通知する。古い再試行の失敗で現在の状態を上書きしない。
      if (this.generation === retryGeneration && this.currentFileId === retryFileId) {
        this.onRetryError(error);
      }
    }
  }
}
