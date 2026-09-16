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
  // シークバー・クロスフェードのゲート判定（seekBar.ts/crossfade.ts）がactiveスロットの
  // durationを読むために必要（2026-09-14〜、ロールスワップ再設計）。
  duration: number;
  // 曲が最後まで再生され自然終了した場合にtrueになる（ネイティブブラウザの挙動）。
  // 自然終了時も`paused`はtrueになるため、明示的な一時停止と区別するために必要
  // （2026-09-08、Codexレビュー指摘：P1）。
  ended: boolean;
  play(): Promise<void>;
  pause(): void;
  // "ended"以外の追加イベント種別（"playing"/"timeupdate"/"durationchange"/"loadedmetadata"/
  // "emptied"）はDualAudioPlayer（2026-09-14〜、ロールスワップ再設計）がUI結線
  // （シークバー・MediaSession・クロスフェードのtimeupdate駆動）向けのactive-slotフィルタ
  // 済みfaçadeとして購読するために必要。PlaybackController自身はこれらのイベントを使わない
  // （"error"以外は一切listenしない）。
  // "seeked"はクロスフェードのロールスワップ（crossfade.ts）が、ランプ開始前の先読み側の
  // currentTime=0への巻き戻しが実際に完了したかを確認するために必要（2026-09-14〜、ChatGPT
  // レビュー指摘：P2）。
  addEventListener(type: "error" | "pause" | "ended" | "playing" | "timeupdate" | "durationchange" | "loadedmetadata" | "emptied" | "seeked", listener: () => void): void;
  // ロールスワップの後始末（DualAudioPlayer.resetInactive()）が、`src`を空文字列へ設定する
  // 代わりに属性自体を除去するために使う（2026-09-14〜、Codexレビュー指摘：P2「Remove the
  // inactive src attribute instead of emptying it」）。省略可能：テスト用の簡易フェイクは
  // 実装しなくてよく、その場合resetInactive()は従来通り`src = ""`へフォールバックする。
  removeAttribute?(qualifiedName: string): void;
}

export interface PlayOptions {
  // 手動スキップ（次へ/前へ/曲名クリック）時のみtrue（開発体制#42④）。曲の自然終了時の
  // next()呼び出し（advanceOnEnded()経由）では渡さない：将来のクロスフェード機能が
  // この経路を専用に扱うため、フェードアウトと役割を分ける。
  fadeOut?: boolean;
  // ロールスワップ再設計（2026-09-14〜、PR2）向け：このコントローラが実際にstream-idを
  // 確定した瞬間（audio.src設定より前）に同期的に呼ばれる。streamId自体（SW送信URL・
  // 認証継続レジストリに使う一意な値）に加えて、`isSuperseded`——「このplay()呼び出しが
  // 自分自身のコントローラ内で既に追い越されたか」を返す、このコントローラのprivateな
  // generationカウンタを直接参照するクロージャ——も渡す。上位（main.ts）はこれを使って
  // Drive 401後の認証継続をこの正確なstream-idで登録できる。以前は`currentGeneration()+1`で
  // 次のstream-idを予測し、play()呼び出し直後のcurrentStreamGeneration()で事後的に補正する
  // 方式だったが、この補正は「play()の最初のawaitを終える前はstreamGenerationがまだ古い
  // ストリームを指したまま」という事実に依存しており、共有stream-idアロケータ（A/B2つの
  // コントローラが同じ採番カウンタを使う）の下では予測自体が成立しない
  // （`this.generation`は各コントローラのprivateなカウンタで、streamIdの実際の値とは
  // 無関係に進むため）。加えて`isSuperseded`をコールバック経由で直接渡すことで、上位が
  // DualAudioPlayerのような「今どちらがactiveか」を推測する必要のあるファサード越しに
  // 世代を再確認する必要も無くなる（ファサードのactiveポインタは、この呼び出しの完了を
  // 待っている間に別の理由で変化しうるため、そちら経由の再確認は誤ったコントローラの
  // 状態を参照しうる）。
  onStreamIdAllocated?: (streamId: number, isSuperseded: () => boolean) => void;
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
    private readonly onTransitionStart: () => void = () => {},
    // 複数のPlaybackControllerを同時に稼働させる場合（ロールスワップ設計、2026-09-14）、
    // SW送信用URL・streamGeneration・認証継続レジストリに渡す値がコントローラ間で衝突
    // しないよう、呼び出し元が共有の採番関数を注入できるようにする（ChatGPTレビュー
    // 指摘：②）。内部の追い越し判定（isSuperseded）・generationReasonsはこのコントローラ
    // 単体で完結する、既存の作り込み済みロジックのため意図的に分離し変更しない
    // （this.generationの私有カウンタ自体は今まで通り+1ずつ進む）。未指定時は従来通り
    // `this.generation`（＝play()呼び出し時点のplayGeneration）をそのまま使うため、
    // 単一コントローラでの既存の挙動・テストには一切影響しない。
    private readonly allocateStreamId: () => number = () => this.generation
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
    this.onTransitionStart();
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
        // このgenerationの変化が一時停止（ネイティブ・アプリ内いずれも）の連鎖だけで説明でき、
        // かつ今もなお一時停止のままであれば（＝pauseChainStatus()参照）ネイティブ一時停止と
        // 同じくPlaybackPausedErrorとして区別して投げる（そうでなければ、別の正当なplay()に
        // 追い越された・既にネイティブ再開で取り消し済み、のいずれかなので、区別しない
        // PlaybackInterruptedErrorを投げる）。
        if (this.pauseChainStatus(playGeneration) === "paused") {
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
    // の待ちが長引く可能性があるため、fadeOut有無に関わらず常にここで呼ぶ。
    this.onTransitionStart();
    this.currentFileId = fileId;
    const streamId = this.allocateStreamId();
    // audio.src設定より前に、確定したstream-idを通知する（PlayOptions.onStreamIdAllocated
    // コメント参照）。この時点で既に`isSuperseded()`はfalse（直前のチェックで確認済み）であり、
    // かつこの後にawaitを挟まず同期的にaudio.srcを設定するため、呼び出し元がこのコールバック内で
    // 同期的にstreamIdを使った処理（認証継続の登録等）を行える。
    options.onStreamIdAllocated?.(streamId, isSuperseded);
    this.audio.src = streamUrl(fileId, streamId);
    // フェードアウトした分だけ、次の曲の開始時にフェード開始前のvolumeへ戻す
    // （フェードアウトはこの1回のスキップだけの演出のため）。フェードしていない場合は
    // volumeへ一切触れず、ユーザーが<audio controls>で設定した値をそのまま維持する。
    if (preFadeVolume !== null) {
      this.audio.volume = preFadeVolume;
      this.pendingFadeOriginalVolume = null;
    }
    this.streamGeneration = streamId;
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
    if (isSuperseded()) {
      // 一時停止（ネイティブ・アプリ内いずれも）の連鎖だけで説明でき、かつ今もなお一時停止の
      // ままである場合だけ"paused"を返す（pauseChainStatus()コメント参照。2026-09-16、Codexレ
      // ビュー指摘：P1「Revoke the resume acknowledgement on a later pause」を踏まえた再設計。
      // 旧実装は「自分を直接追い越した理由がpauseで、かつネイティブ再開の確認がその直後の
      // generationと一致するか」だけを見ていたため、pause→ネイティブ再開→さらにもう一度pause
      // という3イベントの順序で、2回目のpauseを見逃していた）。ネイティブ再開で既に取り消し
      // 済みの場合（"resumed"）はaudio.srcが一致していても再度audio.pause()しない：既にaudio
      // 要素はネイティブ再開により鳴っているはずで、ここで無条件にpause()すると再開を
      // 打ち消してしまう。
      const status = this.pauseChainStatus(playGeneration);
      if (this.audio.src === thisRequestSrc && status !== "resumed") {
        this.audio.pause();
      }
      // 一時停止の連鎖の結果、今もなお一時停止のままである場合だけPlaybackPausedErrorを投げて
      // PlaybackQueue.playAndCommit()に「成功扱いでcommitしてはならない」ことを伝える
      // （2026-09-15、Codexレビュー指摘：P1「Cancel pending recovery when the user pauses」）。
      // fadeOut無しのこの経路（バックグラウンド復帰のresume()等が主に使う）は、上のaudio.
      // pause()で実際の音声こそ正しく止めるものの、それ以外はこのメソッド自体が単に正常
      // return（void）していたため、PlaybackQueue.playAndCommit()は「再生成功」とみなし、
      // キュー自身のgeneration確認（pause()はPlaybackController側のgenerationしか進めず、
      // PlaybackQueue側のgenerationには一切触れない）をそのまま通過してcurrentFileId/
      // isQueuePlaybackをcommitしてしまっていた。他の理由（別の正当なplay()に追い越された
      // だけ、または既にネイティブ再開で取り消し済み）ではこれまで通り黙ってreturnし、
      // PlaybackQueue側のgeneration確認に判定を委ねる（そちらは既存の複数ラウンドで
      // 固められた既存の設計のため変更しない）。
      if (status === "paused") {
        throw new PlaybackPausedError();
      }
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

  // Bluetooth/OSのMedia Session一時停止（main.ts）はaudio要素のネイティブpause()を直接
  // 呼ぶだけで、PlaybackController.pause()は経由しない（同じボタンでの再開を壊さないため、
  // currentFileId/streamGenerationは温存する設計。上のpause()コメント・mediaSession pause
  // ハンドラのコメント参照）。この経路だけを通ると、進行中のバックグラウンド復帰リトライ
  // （resume()）のネイティブplay()が未解決のまま固まっている間はgenerationも一切変化しない
  // ため`isSuperseded()`がfalseのままとなり、後から解決したその古いplay()呼び出しが
  // 「成功」として扱われ、PlaybackQueue側の状態が誤って書き換わってしまう（2026-09-15、
  // Codexレビュー指摘：P1「Invalidate recovery on Media Session pause」）。pause()と同じ
  // generation/generationReasonsの更新だけを行い、audio.pause()の呼び出し・currentFileId/
  // streamGeneration/rejectedGenerationのクリアは行わない（呼び出し元が既にネイティブ
  // pause()を済ませており、かつ「同じボタンでの再開」を保つため）。
  invalidatePendingRecoveryOnNativePause(): void {
    this.reclaimPendingFadeVolume();
    this.onTransitionStart();
    this.generation += 1;
    this.generationReasons.set(this.generation, "pause");
  }

  // ネイティブ一時停止（invalidatePendingRecoveryOnNativePause()経由・アプリの「一時停止」
  // ボタン=pause()経由のいずれも）の直後に、audio要素のネイティブ再開（Media Sessionの
  // playハンドラがPlaybackControllerを経由せずaudio.play()を直接呼ぶ経路）が発生した場合、
  // その一時停止は既にユーザー自身によって明示的に取り消されている（2026-09-15、Codexレビュー
  // 指摘：P1「Supersede pause ownership on Media Session play」）。generation単独ではこれを
  // 検知できない：ネイティブ再開はPlaybackController側のgenerationを一切進めないため、
  // `this.generation === playGeneration + 1`という既存の厳密一致は「pauseの後、何も起きて
  // いない」と誤認したままになる——古い（未解決のまま固まっていた）play()呼び出しが後から
  // 解決すると、依然としてaudio.srcが一致するという理由でaudio.pause()を再度呼んでしまい、
  // ユーザーがBluetooth/OSの再生ボタンで明示的に再開した直後の音声を勝手に止めてしまう。
  // 「最後にネイティブ再開を確認した時点のgeneration」を記録し、pauseChainStatus()がこれを
  // 参照する。
  private lastNativeResumeAckGeneration: number | null = null;

  // Media Sessionのplayハンドラ（main.ts）がaudio要素のネイティブplay()を直接呼んだ直後に
  // 呼ぶ。
  acknowledgeNativeResume(): void {
    this.lastNativeResumeAckGeneration = this.generation;
  }

  // 自分（playGeneration）を追い越したのが一時停止（ネイティブ・アプリ内いずれも）で、かつ
  // その一時停止が今もなお有効かどうかを判定する（2026-09-16、Codexレビュー指摘：P1「Revoke
  // the resume acknowledgement on a later pause」を踏まえた再設計）。旧実装は「自分を直接
  // 追い越した理由（playGeneration+1）がpauseで、かつそれがlastNativeResumeAckGenerationと
  // 一致するか」だけを見ていたため、pause→ネイティブ再開→さらにもう一度pauseという3イベントの
  // 順序（Bluetooth/OSの再生ボタンを一時停止→再生→一時停止と素早く操作する等）で、2回目の
  // pauseがlastNativeResumeAckGenerationを更新しないまま`this.generation`だけを進めてしまい、
  // 「まだ最初のpauseの直後で何も起きていない」という判定を古いまま維持してしまっていた
  // （実際には既に取り消し済みの再開状態を根拠に、より新しい2回目のpauseを見逃していた）。
  // playGeneration+1からthis.generationまでの間に発生した全ての世代進行が一時停止（ネイティブ・
  // アプリ内いずれも、generationReasonsが"pause"を記録する経路）だけで説明できるかを1件ずつ
  // 確認し（無関係な正当なplay()やcancelPendingTransition()を1件でも挟んでいれば"pause以外"
  // として扱う）、説明できる場合に限り、その一時停止の連鎖の最後がacknowledgeNativeResume()で
  // 取り消されているかどうかで最終的な状態（"paused"/"resumed"）を決める。
  private pauseChainStatus(playGeneration: number): "not-a-pause-chain" | "paused" | "resumed" {
    for (let generation = playGeneration + 1; generation <= this.generation; generation += 1) {
      if (this.generationReasons.get(generation) !== "pause") return "not-a-pause-chain";
    }
    return this.lastNativeResumeAckGeneration === this.generation ? "resumed" : "paused";
  }

  // クロスフェードのハンドオフが既にaudio.srcを次曲へコミット済みの状態で一時停止された場合、
  // 退場側の曲へ音を鳴らさずに（native play()を一切呼ばずに）復元する（2026-09-10、ChatGPT
  // レビュー指摘：P1「Pause後にaudio sourceとqueue currentが食い違ったまま残ります」）。
  // 呼び出し元（main.tsのpause系ハンドラ）は、この関数の前に既に`pause()`を呼んでいる前提
  // （currentFileId/streamGenerationは既にnull化済み）。ここでは新しいgenerationを採番して
  // currentFileId/streamGenerationをこの退場側の曲で確定させ、`audio.src`を差し替えるのみで
  // `audio.play()`は呼ばない（メディア要素はsrc差し替え時にネイティブに一時停止状態へ戻るため、
  // 明示的な`audio.pause()`は保険として呼ぶだけで、聞こえる形で再生が始まることはない）。
  // これにより、①MediaSessionのネイティブPlay（`audioPlayer.play()`直呼び）が退場側の曲を
  // 正しく再開できるようになり（差し替え前は次曲のsrcのまま残っていたため誤った曲が
  // 再開されていた）、②アプリのqueue Play（`queue.resume(currentFileId, audioPlayer.
  // currentTime)`）が使う`audioPlayer.currentTime`も、この関数がここで設定した退場側の
  // 位置を正しく参照するようになる（差し替え前は次曲側の位置が残っており、退場側を
  // 誤った位置から再開していた）。
  loadPaused(fileId: string, position = 0): void {
    this.generation += 1;
    this.currentFileId = fileId;
    const streamId = this.allocateStreamId();
    this.streamGeneration = streamId;
    this.rejectedGeneration = null;
    this.audio.src = streamUrl(fileId, streamId);
    if (Number.isFinite(position) && position > 0) this.audio.currentTime = position;
    this.audio.pause();
  }

  // fadeOut指定時（手動スキップ時と同じ「手動スキップ時にフェードアウトする」設定を
  // 一時停止にも適用してほしいというユーザー要望、2026-09-09）は、実際に一時停止する前に
  // 現在再生中の音声をフェードアウトする。generationはplay()と同様、フェード開始前
  // （実際にはこのメソッドの先頭）で直ちに進める：これにより、フェード中のplay()
  // （手動スキップのフェード等）が既存のisSuperseded()判定・generationReasons経由で
  // この一時停止に追い越されたことを検知でき（"フェード中にアプリ内の「一時停止」ボタンで
  // 中断された場合"のテストと同じ経路）、フェード完了後に誤って次の曲を再生してしまう
  // ことを防げる。
  // 戻り値：実際に一時停止まで完了した場合はtrue、フェード待ち中に別の操作（play()/
  // pause()/cancelPendingTransition()のいずれか）に追い越されて中断された場合はfalse
  // （2026-09-10、続けてChatGPTレビュー指摘：P1「フェード付きPauseが別操作に追い越された
  // 後でも、古い退場曲をloadPaused()してしまいます」）。以前は`isCancelled()`の早期`return`が
  // 単なるvoidの正常終了だったため、呼び出し元（main.tsのアプリ内「一時停止」ボタン、
  // 退場側のクロスフェード復元）はこの中断を区別できず、追い越されて既に別の再生が始まった
  // 後でも`.then()`が実行され、その新しい再生を古い退場側のloadPaused()で上書きしてしまう
  // 不具合があった。
  async pause(fadeOut = false): Promise<boolean> {
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
      if (isCancelled()) return false;
      this.audio.volume = preFadeVolume;
      this.pendingFadeOriginalVolume = null;
    }
    // play()と同じ理由（2026-09-10、Codexレビュー指摘：P1）：一時停止フェード（既定2秒）待ち
    // 中に新しいクロスフェードが始まってしまう同じ競合をここでも防ぐ。
    this.onTransitionStart();
    this.audio.pause();
    return true;
  }
}
