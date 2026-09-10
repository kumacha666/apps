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
  // クロスフェードのハンドオフ専用（2026-09-10、実機フィードバックによる再設計）。trueの
  // 場合、このplay()呼び出し自身はonTransitionStart()（main.ts側のcancelCrossfadeIfActive()）
  // を呼ばない。理由：クロスフェードのハンドオフ（先読み再生していた曲への正式な引き継ぎ）は
  // このメソッドを呼んでキュー側の次曲へコミットするが、この呼び出し自体が無条件に
  // onTransitionStart()を呼ぶ設計のままだと、ハンドオフの最中に「自分自身」でクロスフェードの
  // 状態（main.tsのcrossfadeGeneration）を進めてしまい（自己キャンセル）、本当の手動割り込み
  // （一時停止・シーク・次へ等）が起きたかどうかをcrossfadeGenerationの変化で区別できなく
  // なっていた。結果、ハンドオフ後のクリーンアップ・フォールバック判定コードが事実上常に
  // 「割り込まれた」扱いになり機能しない、または逆に本物の割り込みを見逃す、という不具合が
  // あった（実機フィードバック：シークバー操作が効かない、一時停止を押しても次の曲の再生に
  // 進んでしまう）。このオプションでハンドオフ自身の呼び出しだけonTransitionStart()を
  // スキップすることで、crossfadeGenerationの変化を「本物の割り込みが起きたか」のsignalとして
  // 正しく使えるようにする（generation自体は通常通り進める：フェード付きplay()等、他の
  // 既存の割り込み判定はこれまで通り機能させる必要があるため）。
  suppressTransitionCancel?: boolean;
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
  // generation番号ごとに、その番号への遷移を引き起こした理由（pause()かcancelPendingTransition()
  // か）を記録する（2026-09-08、Codexレビュー指摘：P1）。フェード完了後のisSuperseded()判定
  // だけでは、generationがpause()/cancelPendingTransition()自身によって進んだのか、別の正当な
  // play()呼び出しによって進んだのかを区別できない。
  // 当初は「最後にpause()/cancelPendingTransition()が進めたgeneration」を1つの数値フィールドで
  // 覚え、`this.generation === 記録値`という厳密一致で判定していたが、pause()/cancelPending
  // Transition()の直後にさらに別のplay()が続く一般的な流れ（例：setList()の直後にplayAt(0)）
  // では、その新しいplay()がgenerationをさらに進めてしまい一致しなくなる不具合があった
  // （Codexレビュー指摘：P1続き）。次に`this.generation === 記録値`を「自分のplay()開始より後に
  // 一度でも呼ばれたか」という不等号比較に変更したところ、今度は自分より「ずっと後」の、
  // 全く無関係な世代で発生したpause()まで拾ってしまう回帰が生じた（Codexレビュー指摘：P1続き。
  // 例：A→Bのフェードを`setList()`+Cの再生が追い越し、古いフェードが次のタイマーステップへ
  // 戻る前にCを一時停止して再開すると、古いB要求のpausedAtGeneration比較がCの一時停止を
  // 拾ってしまい、Cの再開操作まで誤って無効化される）。
  // 「自分（playGeneration）を直接superseded（=playGeneration+1）させた操作が何だったか」だけを
  // 見れば、後続の無関係な操作を拾わずに済む。generationは各呼び出しで必ずちょうど1ずつ進む
  // ため、`playGeneration + 1`の理由を引ければ、それが自分を最初に追い越した操作だと確定できる
  // （エントリが無ければ、それは通常のplay()呼び出しだったということ）。
  private generationReasons = new Map<number, "pause" | "cancel">();
  // 進行中のフェード（play()のfadeOut・pause(true)のどちらも）が記録した「フェード開始前の
  // volume」（2026-09-09、ChatGPTレビュー指摘：P2×3）。play()側・pause側で別々のローカル
  // 変数に持たせていた当初の設計では、①一時停止ボタンをフェード中に連打、②pause(true)フェード
  // 中にpause(false)、③pause(true)フェード中にフェード付きplay()、④（本フィールドを導入する
  // 決め手になった指摘）フェード付きplay()（手動スキップ）の途中にpause(true)、のいずれも
  // 「追い越された側」の元のvolumeが失われる・「追い越した側」が復元前の下がったvolumeを
  // 自分の基準値として取得してしまう、という同根の回帰を繰り返していた。play()・pause()の
  // どちらのフェードも同じこの1つのフィールドを共有することで、フェードの種類を問わず
  // 「今まさに進行中のフェードが1つあれば、その元のvolumeはここにある」という単一の
  // 真実の情報源にした。
  private pendingFadeOriginalVolume: number | null = null;

  // 進行中のフェードがあれば、audio.volumeをフェード開始前の値へ即座に戻して
  // pendingFadeOriginalVolumeをクリアする（2026-09-09、ChatGPTレビュー指摘：P2続き）。
  // generationReasonsの"pause"は`pause(true)`と`pause(false)`を区別できず、また
  // play()側のフェードの元volumeを一切追跡していなかったため、「追い越した側の理由で
  // 判定する」設計ではいずれの組み合わせも取りこぼしがあった。play()/pause()/
  // cancelPendingTransition()という、generationを進める＝進行中のフェードを追い越しうる
  // 全ての操作の先頭でこれを呼ぶことで、後続の操作がaudio.volumeを読み書きする前に必ず
  // 正しいベースラインへ戻す（「後続の種類」を判定する必要が無くなるため、判定ロジック
  // 自体を単純化できる）。
  private reclaimPendingFadeVolume(): void {
    if (this.pendingFadeOriginalVolume !== null) {
      this.audio.volume = this.pendingFadeOriginalVolume;
      this.pendingFadeOriginalVolume = null;
    }
  }

  constructor(
    private readonly audio: AudioElementLike,
    private readonly getValidAccessToken: GetValidAccessToken,
    private readonly onPlaybackError: PlaybackErrorHandler = () => {},
    // クロスフェード（main.ts）の進行中ランプを、実際に新しい遷移がコミットされる瞬間
    // （play()/pause()/cancelPendingTransition()それぞれの先頭、generationを進める直前）に
    // 必ず打ち切る（2026-09-10、Codexレビュー指摘：P1）。main.ts側でhandleQueuePlayback()の
    // 先頭で一度だけcancelCrossfadeIfActive()を呼ぶだけでは、その後の操作がPlaybackQueueの
    // pendingMoveチェーンで長時間待たされている間に新しいクロスフェードが始まってしまい、
    // 手動操作が実際にplay()へ到達した時点では既に別のクロスフェードが進行中、という
    // 取りこぼしがあった。reclaimPendingFadeVolume()と同じ「generationを進める全操作の
    // 先頭で必ず呼ぶ」という既存の設計パターンに乗せることで、非同期の待機経路の長さに
    // 関わらず、実際に遷移がコミットされる瞬間には必ずクロスフェードが打ち切られていることを
    // 保証する。
    private readonly onTransitionStart: () => void = () => {}
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
    this.reclaimPendingFadeVolume();
    if (!options.suppressTransitionCancel) this.onTransitionStart();
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
      // 進行中のフェードの元volumeとしてpendingFadeOriginalVolumeへ登録する
      // （2026-09-09、ChatGPTレビュー指摘：P2続き。以前はplay()側のフェードの元volumeを
      // どこにも共有せず、この後でpause(true)に追い越されると、pause側は復元前の下がった
      // volumeを自分の基準値として取得してしまい、最終的な一時停止音量が本来の値ではなく
      // なる回帰があった）。
      this.pendingFadeOriginalVolume = preFadeVolume;
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
      if (isSuperseded()) {
        // 2026-09-09、ChatGPTレビュー指摘：P2続き。以前はここでこの分岐自身がvolumeを
        // 復元していたが、追い越した側（pause()/cancelPendingTransition()/別のplay()の
        // いずれも）が自分の処理を始める前に必ずreclaimPendingFadeVolume()を呼び、既に
        // volumeを復元・pendingFadeOriginalVolumeをクリア済みのため、ここでは一切触れない
        // （このplay()呼び出し自身のpendingFadeOriginalVolumeは既に追い越した側に消費・
        // クリアされている）。PlaybackPausedError/PlaybackInterruptedErrorの区別のみ行う：
        // このgenerationの変化がpause()自身によるものであれば（＝pause()以降まだ他のplay()
        // が呼ばれていなければ）ネイティブ一時停止と同じくPlaybackPausedErrorとして区別して
        // 投げる（そうでなければ、別の正当なplay()に追い越されただけなので、区別しない
        // PlaybackInterruptedErrorを投げる）。
        const supersededByReason = this.generationReasons.get(playGeneration + 1);
        if (supersededByReason === "pause") throw new PlaybackPausedError();
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
        this.pendingFadeOriginalVolume = null;
        throw new PlaybackPausedError();
      }
    }
    const token = await this.getValidAccessToken();
    if (!token) {
      if (preFadeVolume !== null && !isSuperseded()) {
        this.audio.volume = preFadeVolume;
        this.pendingFadeOriginalVolume = null;
      }
      throw new PlaybackAuthenticationRequiredError();
    }
    // トークン確認中に停止または別曲の再生が入った場合、古い要求はsrcを変更しない。
    if (isSuperseded()) return;
    // onTransitionStart()をメソッド先頭だけでなく、実際にsrcをコミットする直前にも再度呼ぶ
    // （2026-09-10、Codexレビュー指摘：P1）。手動スキップのフェード（FADE_OUT_DURATION_MS、
    // 通常2秒）待ち中に旧曲がクロスフェードの残り時間（3秒）閾値へ入ると、先頭で一度きりの
    // 呼び出しでは間に合わず新しいクロスフェードが始まってしまい、この後のsrcコミットと
    // 音量の取り合いになる。fadeOutを指定しない通常再生でもトークン確認（getValidAccessToken）
    // の待ちが長引く可能性があるため、fadeOut有無に関わらず常にここで呼ぶ
    // （suppressTransitionCancel指定時はここもスキップする：クロスフェードのハンドオフ自身の
    // 呼び出しであり、自己キャンセルさせないため）。
    if (!options.suppressTransitionCancel) this.onTransitionStart();
    this.currentFileId = fileId;
    this.audio.src = streamUrl(fileId, playGeneration);
    // フェードアウトした分だけ、次の曲の開始時にフェード開始前のvolumeへ戻す
    // （フェードアウトはこの1回のスキップだけの演出のため）。フェードしていない場合は
    // volumeへ一切触れず、ユーザーが<audio controls>で設定した値をそのまま維持する。
    if (preFadeVolume !== null) {
      this.audio.volume = preFadeVolume;
      this.pendingFadeOriginalVolume = null;
    }
    this.streamGeneration = playGeneration;
    // Set this after src so a resumed stream seeks instead of being reset by
    // assigning the new media URL. Browsers retain the requested position until
    // metadata is available, and the fake audio used by unit tests mirrors that
    // observable contract.
    if (Number.isFinite(position) && position > 0) this.audio.currentTime = position;
    const thisRequestSrc = this.audio.src;
    await this.audio.play();
    // ここまで到達した後（audio.src差し替え後、ネイティブaudio.play()の解決待ち中）にも
    // cancelPendingTransition()やpause()等でこの要求が無効化されうる（2026-09-08、Codexレビュー
    // 指摘：P1）。このplay()呼び出し自体はエラーを投げずに解決するため、PlaybackQueue側の
    // commit判定（キュー自身のgeneration確認）は既に正しく拒否するが、audio要素自体は実際に
    // 「もう選ばれていない曲」を鳴らし続けてしまう。ただし、この停止は自分がsrcを設定した時点
    // からまだ誰も上書きしていない場合に限る：既に別の（より新しい）play()呼び出しがsrcを
    // 差し替えて再生を開始している場合、ここで無条件にpause()するとその正当な新しい再生まで
    // 誤って止めてしまうため、audio.srcが依然として自分の設定したものと一致する場合だけ止める。
    if (isSuperseded() && this.audio.src === thisRequestSrc) {
      this.audio.pause();
    }
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

  // フェードを含む進行中のplay()を、audioを止めずに無効化する（2026-09-08、Codexレビュー指摘：
  // P1）。PlaybackQueue.setList()（別アルバム・プレイリストの選択）はキュー側の状態
  // （activeFadeToken等）だけを失効させても、PlaybackController内で進行中のフェード付き
  // play()自体はキャンセルされないため、そのままにするとフェード完了後に「もう選ばれていない
  // 旧リストの曲」のaudio.srcが設定されaudio.play()が呼ばれ、実際に鳴ってしまう
  // （isSuperseded()はthis.generationの変化でしか検知できず、setList()はcontroller側の
  // generationを一切進めないため）。pause()と異なりaudio.pause()やcurrentFileIdのクリアは
  // 行わない（setList()の直後に新しいplayAt()が続く場合、無関係にaudioを止めてしまわないため）。
  cancelPendingTransition(): void {
    this.reclaimPendingFadeVolume();
    this.onTransitionStart();
    this.generation += 1;
    this.generationReasons.set(this.generation, "cancel");
  }

  // fadeOut指定時（手動スキップ時と同じ「手動スキップ時にフェードアウトする」設定を
  // 一時停止にも適用してほしいというユーザー要望、2026-09-09）は、実際に一時停止する前に
  // 現在再生中の音声をフェードアウトする。generationはplay()と同様、フェード開始前
  // （実際にはこのメソッドの先頭）で直ちに進める：これにより、フェード中のplay()
  // （手動スキップのフェード等）が既存のisSuperseded()判定・generationReasons経由で
  // この一時停止に追い越されたことを検知でき（"フェード中にアプリ内の「一時停止」ボタンで
  // 中断された場合"のテストと同じ経路）、フェード完了後に誤って次の曲を再生してしまう
  // ことを防げる。
  async pause(fadeOut = false): Promise<void> {
    // 進行中の一時停止フェードがあれば、まずフェード開始前の値へ戻してから自分の処理を
    // 始める（2026-09-09、ChatGPTレビュー指摘：P2続き。generationReasonsの"pause"は
    // pause(true)とpause(false)を区別できないため、「後続が'pause'理由で終わるかどうか」で
    // volumeを戻すか判定していた当初の設計では、pause(true)フェード中にpause(false)や
    // フェード付きplay()に追い越された場合、下がったvolumeが復元されないまま取り残されて
    // いた。generationを進める全操作（play()/pause()/cancelPendingTransition()）の先頭で
    // reclaimPendingFadeVolume()を呼ぶことで、後続の操作がaudio.volumeを読み書きする
    // 前に必ず正しいベースラインへ戻し、「後続の種類」を判定する必要自体を無くしている）。
    this.reclaimPendingFadeVolume();
    this.onTransitionStart();
    this.generation += 1;
    const pauseGeneration = this.generation;
    this.generationReasons.set(pauseGeneration, "pause");
    this.currentFileId = null;
    this.streamGeneration = null;
    this.rejectedGeneration = null;

    if (fadeOut && !this.audio.paused) {
      const preFadeVolume = this.audio.volume;
      this.pendingFadeOriginalVolume = preFadeVolume;
      const isCancelled = () => this.generation !== pauseGeneration;
      await fadeOutVolume(this.audio, FADE_OUT_DURATION_MS, { isCancelled });
      // フェード中に新しい操作（play()/pause()/cancelPendingTransition()のいずれか）に
      // 追い越された場合、その操作が自分自身の先頭でreclaimPendingFadeVolume()を
      // 呼び既にvolumeを復元・pendingFadeOriginalVolumeをクリア済みのため、ここでは一切触れない。
      if (isCancelled()) return;
      this.audio.volume = preFadeVolume;
      this.pendingFadeOriginalVolume = null;
    }
    // play()と同じ理由（2026-09-10、Codexレビュー指摘：P1）：一時停止フェード（既定2秒）待ち
    // 中に新しいクロスフェードが始まってしまう同じ競合をここでも防ぐ。
    this.onTransitionStart();
    this.audio.pause();
  }
}
