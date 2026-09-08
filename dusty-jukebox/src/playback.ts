import { fadeOutVolume } from "./fade";

export type GetValidAccessToken = () => string | null | Promise<string | null>;

export function streamUrl(fileId: string, playbackGeneration?: number): string {
  const url = `./stream/${encodeURIComponent(fileId)}`;
  return playbackGeneration === undefined ? url : `${url}?playbackGeneration=${playbackGeneration}`;
}

// E2Eでは実時間で2秒待つとテストが遅くなるため、短縮する（他の機能のVITE_E2E分岐と同じ方針）。
export const FADE_OUT_DURATION_MS = import.meta.env.VITE_E2E === "true" ? 50 : 2000;

export interface AudioElementLike {
  src: string;
  currentTime: number;
  volume: number;
  paused: boolean;
  play(): Promise<void>;
  pause(): void;
  addEventListener(type: "error" | "pause", listener: () => void): void;
}

export interface PlayOptions {
  // 手動スキップ（次へ/前へ/曲名クリック）時のみtrue（開発体制#42④）。曲の自然終了時の
  // next()呼び出し（advanceOnEnded()経由）では渡さない：将来のクロスフェード機能が
  // この経路を専用に扱うため、フェードアウトと役割を分ける。
  fadeOut?: boolean;
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
    // A pause emitted by the native <audio controls> does not replace the
    // stream.  Keep its generation associated with the element so a 401 after
    // a native pause/resume still reaches the authentication continuation.
  }

  async play(fileId: string, position = 0, options: PlayOptions = {}): Promise<void> {
    this.generation += 1;
    const playGeneration = this.generation;
    // フェードアウトは現在再生中の音声（これから置き換わる方）に対して行う。src差し替え・
    // トークン確認より前に行うことで、「まだ次の曲が確定するか分からない段階で無音にしてしまう」
    // 事態を避ける（次の曲が実際に見つからずplay()自体が呼ばれない場合はフェードも発生しない、
    // moveSong等と同じ「見つかった時だけ動く」設計）。フェード完了時に別のplay()が既に開始して
    // いた場合（generation不一致）は、そちらのvolume制御を上書きしないようreturnする。
    if (options.fadeOut && !this.audio.paused) {
      await fadeOutVolume(this.audio, FADE_OUT_DURATION_MS);
      if (this.generation !== playGeneration) return;
    }
    const token = await this.getValidAccessToken();
    if (!token) {
      this.audio.volume = 1;
      throw new PlaybackAuthenticationRequiredError();
    }
    // トークン確認中に停止または別曲の再生が入った場合、古い要求はsrcを変更しない。
    if (this.generation !== playGeneration) { this.audio.volume = 1; return; }
    this.currentFileId = fileId;
    this.audio.src = streamUrl(fileId, playGeneration);
    // 次の曲の開始時は必ず全音量に戻す（フェードアウトはこの1回のスキップだけの演出のため）。
    this.audio.volume = 1;
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
