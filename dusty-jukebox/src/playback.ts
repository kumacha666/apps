export type GetValidAccessToken = () => string | null | Promise<string | null>;

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

export type PlaybackErrorHandler = (error: unknown) => void;

// 再生要求の時点で有効なトークンが無い。ここでは再取得を試みない。GIS のポップアップは
// 直接のユーザー操作からしか確実に開けないため、UI 層が明示的な「続行」ボタンを表示する。
export class PlaybackAuthenticationRequiredError extends Error {
  constructor() {
    super("再生を続けるには認証の更新が必要です");
    this.name = "PlaybackAuthenticationRequiredError";
  }
}

// 再生キューを持たない最小の再生器。Service Worker がトークンを待つ後追い方式にはせず、
// audio.src を設定する前にページ側で有効トークンを確認する。audio の error はファイル不正・
// 未対応形式なども区別できないため、ここから認証更新や自動リトライは行わない。
export class PlaybackController {
  private generation = 0;

  constructor(
    private readonly audio: AudioElementLike,
    private readonly getValidAccessToken: GetValidAccessToken,
    private readonly onPlaybackError: PlaybackErrorHandler = () => {}
  ) {
    audio.addEventListener("error", () => this.onPlaybackError(new Error("音声を再生できませんでした。ファイルID、形式、アクセス権をご確認ください。")));
    audio.addEventListener("pause", () => { this.generation += 1; });
  }

  async play(fileId: string): Promise<void> {
    this.generation += 1;
    const playGeneration = this.generation;
    const token = await this.getValidAccessToken();
    if (!token) throw new PlaybackAuthenticationRequiredError();
    // トークン確認中に停止または別曲の再生が入った場合、古い要求はsrcを変更しない。
    if (this.generation !== playGeneration) return;
    this.audio.src = streamUrl(fileId);
    await this.audio.play();
  }

  pause(): void {
    this.generation += 1;
    this.audio.pause();
  }
}
