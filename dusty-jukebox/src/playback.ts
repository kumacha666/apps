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
  // 曲が最後まで再生され自然終了した場合にtrueになる（ネイティブブラウザの挙動）。
  // 自然終了時も`paused`はtrueになるため、明示的な一時停止と区別するために必要
  // （2026-09-08、Codexレビュー指摘：P1）。
  ended: boolean;
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

// フェード中にユーザーが明示的に一時停止した（自然終了ではない）ため、次の曲への切り替えを
// 中断したことを呼び出し元へ伝える（2026-09-08、Codexレビュー指摘：P1）。play()がこれを
// スローせず単に正常終了すると、PlaybackQueue.playAndCommit()はplay()の解決を再生成功と
// みなして対象曲をcurrentFileIdへcommitしてしまい、実際にはaudio要素が旧曲のsrcで停止した
// ままなのにUIとキューだけが次の曲を再生中と表示する不整合が生じる。
export class PlaybackInterruptedError extends Error {
  constructor(message = "再生が中断されました") {
    super(message);
    this.name = "PlaybackInterruptedError";
  }
}

// PlaybackInterruptedErrorのうち、ユーザーが明示的に一時停止した（ネイティブ<audio controls>・
// Media Session・アプリ内「一時停止」ボタンのいずれか）ことによる中断だけを表す（2026-09-08、
// Codexレビュー指摘：P1）。フェード中に別の正当なplay()（例：別アルバム選択によるsetList()＋
// playAt()）に追い越された場合も同じisSuperseded()分岐からPlaybackInterruptedErrorが投げられる
// ため、区別しないとPlaybackQueue側が「一時停止時は待機中の後続操作も無効化する」処理を
// 追い越しのケースにも適用してしまい、正当に成功した新しい曲への切り替えまで巻き込んで
// 無効化してしまう（詳細はqueue.tsのplayAndCommit()参照）。
export class PlaybackPausedError extends PlaybackInterruptedError {
  constructor() {
    super("再生が一時停止されました");
    this.name = "PlaybackPausedError";
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
  // pause()が最後にgenerationを進めた時点のgenerationの値（2026-09-08、Codexレビュー指摘：P1）。
  // フェード完了後の isSuperseded() 判定だけでは、generationがpause()自身によって進んだのか、
  // 別の正当なplay()呼び出しによって進んだのかを区別できない。pause()の直後にまだ他のplay()が
  // 呼ばれていなければ`this.generation === this.pausedAtGeneration`が成立するため、この一致を
  // もって「一時停止による中断」と判定する（一致しなければ、それ以降に別のplay()が実行され
  // generationがさらに進んでいる＝一時停止ではなく追い越しと判定できる）。
  private pausedAtGeneration: number | null = null;

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
    const isSuperseded = () => this.generation !== playGeneration;
    // フェードアウトを実際に行った場合だけ、フェード開始前のvolumeを覚えておく（2026-09-08、
    // Codexレビュー指摘：P1。以前は毎回volume=1へ強制リセットしていたため、ユーザーが
    // <audio controls>で音量を調整していても、フェード無効時の通常再生や曲の自然終了時の
    // 次曲再生で突然最大音量へ戻ってしまっていた。フェードを行っていない限りvolumeには
    // 一切触れない）。
    let preFadeVolume: number | null = null;
    if (options.fadeOut && !this.audio.paused) {
      preFadeVolume = this.audio.volume;
      // 現在再生中の音声（これから置き換わる方）に対して行う。src差し替え・トークン確認より前に
      // 行うことで、「まだ次の曲が確定するか分からない段階で無音にしてしまう」事態を避ける
      // （次の曲が実際に見つからずplay()自体が呼ばれない場合はフェードも発生しない、moveSong等と
      // 同じ「見つかった時だけ動く」設計）。isCancelledで各ステップ後にgenerationを再確認し、
      // フェード完了を待たず別のplay()が既に開始していた場合（Codexレビュー指摘：P1）、
      // そちらのvolume制御を古いフェードのタイマーが上書きしないよう直ちに中断する。
      await fadeOutVolume(this.audio, FADE_OUT_DURATION_MS, { isCancelled: isSuperseded });
      // 2026-09-08、Codexレビュー指摘：P1続き。アプリ内の「一時停止」ボタンは
      // PlaybackController.pause()を直接呼びgenerationを進めるため、この分岐（ネイティブ
      // pauseとは別経路）を通る。以前はここで正常return（voidの成功扱い）していたため、
      // 呼び出し元のPlaybackQueue.playAndCommit()が誤って次の曲へcommitしてしまっていた。
      // volumeは既にisCancelled経由でこれ以上更新されない（新しい世代の制御を妨げないため）。
      if (isSuperseded()) {
        // 2026-09-08、Codexレビュー指摘：P1続き。このgenerationの変化がpause()自身による
        // ものであれば（＝pause()以降まだ他のplay()が呼ばれていなければ）、ネイティブ一時停止
        // と同じくフェード開始前のvolumeへ戻し、PlaybackPausedErrorとして区別して投げる
        // （そうでなければ、別の正当なplay()に追い越されただけなので、そちらのvolume制御を
        // 妨げないよう一切触れず、区別しないPlaybackInterruptedErrorを投げる）。
        if (this.generation === this.pausedAtGeneration) {
          this.audio.volume = preFadeVolume;
          throw new PlaybackPausedError();
        }
        throw new PlaybackInterruptedError();
      }
      // フェード中にネイティブ操作（<audio controls>・Media Session）で明示的に一時停止された
      // 場合、generationは変わらないため上のチェックだけでは検知できない（2026-09-08、Codexレビュー
      // 指摘：P1）。ユーザーが止めた直後に再生が勝手に始まらないよう、ここで中断してvolumeを戻す。
      // 旧曲がフェード中に自然終了した場合も`paused`はtrueになるが、これは明示的な一時停止では
      // ないため中断しない（2026-09-08、Codexレビュー指摘：P1続き。ここでreturnしてしまうと、
      // 呼び出し元のPlaybackQueue.playAndCommit()はplay()の正常解決を再生成功とみなして
      // currentFileIdを次の曲へcommitしてしまい、実際には旧曲のsrcで停止したままなのに
      // UIとキューだけが次の曲を再生中と表示する不整合が生じる）。
      if (this.audio.paused && !this.audio.ended) {
        this.audio.volume = preFadeVolume;
        throw new PlaybackPausedError();
      }
    }
    const token = await this.getValidAccessToken();
    if (!token) {
      if (preFadeVolume !== null && !isSuperseded()) this.audio.volume = preFadeVolume;
      throw new PlaybackAuthenticationRequiredError();
    }
    // トークン確認中に停止または別曲の再生が入った場合、古い要求はsrcを変更しない。
    if (isSuperseded()) return;
    this.currentFileId = fileId;
    this.audio.src = streamUrl(fileId, playGeneration);
    // フェードアウトした分だけ、次の曲の開始時にフェード開始前のvolumeへ戻す
    // （フェードアウトはこの1回のスキップだけの演出のため）。フェードしていない場合は
    // volumeへ一切触れず、ユーザーが<audio controls>で設定した値をそのまま維持する。
    if (preFadeVolume !== null) this.audio.volume = preFadeVolume;
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
    this.pausedAtGeneration = this.generation;
    this.currentFileId = null;
    this.streamGeneration = null;
    this.rejectedGeneration = null;
    this.audio.pause();
  }
}
