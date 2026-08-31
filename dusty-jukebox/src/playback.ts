export type GetValidAccessToken = () => string | null | Promise<string | null>;

export function streamUrl(fileId: string, playbackGeneration?: number): string {
  const url = `./stream/${encodeURIComponent(fileId)}`;
  return playbackGeneration === undefined ? url : `${url}?playbackGeneration=${playbackGeneration}`;
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
  private currentFileId: string | null = null;
  private streamGeneration: number | null = null;
  private rejectedGeneration: number | null = null;

  constructor(
    private readonly audio: AudioElementLike,
    private readonly getValidAccessToken: GetValidAccessToken,
    private readonly onPlaybackError: PlaybackErrorHandler = () => {}
  ) {
    audio.addEventListener("error", () => {
      if (this.rejectedGeneration === this.generation) {
        this.rejectedGeneration = null;
        this.onPlaybackError(new PlaybackAuthenticationRequiredError());
        return;
      }
      this.onPlaybackError(new Error("音声を再生できませんでした。ファイルID、形式、アクセス権をご確認ください。"));
    });
    audio.addEventListener("pause", () => { this.generation += 1; this.streamGeneration = null; });
  }

  async play(fileId: string, position = 0): Promise<void> {
    this.generation += 1;
    const playGeneration = this.generation;
    const token = await this.getValidAccessToken();
    if (!token) throw new PlaybackAuthenticationRequiredError();
    // トークン確認中に停止または別曲の再生が入った場合、古い要求はsrcを変更しない。
    if (this.generation !== playGeneration) return;
    this.currentFileId = fileId;
    this.audio.src = streamUrl(fileId, playGeneration);
    this.streamGeneration = playGeneration;
    // Set this after src so a resumed stream seeks instead of being reset by
    // assigning the new media URL. Browsers retain the requested position until
    // metadata is available, and the fake audio used by unit tests mirrors that
    // observable contract.
    if (Number.isFinite(position) && position > 0) this.audio.currentTime = position;
    await this.audio.play();
  }

  // The media element does not expose the HTTP status that made it fail.  The
  // Service Worker reports a Drive 401 separately; mark only the currently
  // requested stream so its following media error is not shown as a generic
  // format/access failure.
  markStreamTokenRejected(fileId: string, generation: number): number | null {
    if (this.currentFileId !== fileId || this.streamGeneration !== generation) return null;
    this.rejectedGeneration = this.generation;
    return this.audio.currentTime;
  }

  currentGeneration(): number { return this.generation; }
  currentStreamGeneration(): number | null { return this.streamGeneration; }

  pause(): void {
    this.generation += 1;
    this.currentFileId = null;
    this.streamGeneration = null;
    this.rejectedGeneration = null;
    this.audio.pause();
  }
}
