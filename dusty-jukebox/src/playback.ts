import type { EnsureAccessToken } from "./streamAuth";

export function streamUrl(fileId: string): string {
  return `./stream/${encodeURIComponent(fileId)}`;
}

export interface AudioElementLike {
  src: string;
  currentTime: number;
  play(): Promise<void>;
  pause(): void;
  addEventListener(type: "error", listener: () => void): void;
}

// 再生キューを持たない最小の再生器。401時のaudio要素は詳細なHTTPステータスを公開しないため、
// src読み込みエラーを認証更新後の一度だけの再試行として扱う。
export class PlaybackController {
  private currentFileId: string | null = null;
  private retried = false;

  constructor(private readonly audio: AudioElementLike, private readonly refreshAccessToken: EnsureAccessToken) {
    audio.addEventListener("error", () => void this.retryAfterAuthFailure());
  }

  async play(fileId: string): Promise<void> {
    this.currentFileId = fileId;
    this.retried = false;
    this.audio.src = streamUrl(fileId);
    await this.audio.play();
  }

  pause(): void {
    this.audio.pause();
  }

  private async retryAfterAuthFailure(): Promise<void> {
    if (!this.currentFileId || this.retried) return;
    this.retried = true;
    const position = this.audio.currentTime;
    try {
      await this.refreshAccessToken();
      this.audio.src = streamUrl(this.currentFileId);
      this.audio.currentTime = position;
      await this.audio.play();
    } catch {
      // UI側はaudioのerrorを起点に表示を更新する。ここでは無限リトライを行わない。
    }
  }
}
