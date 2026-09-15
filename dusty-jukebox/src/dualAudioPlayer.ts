import { PlaybackController, type AudioElementLike, type GetValidAccessToken, type PlaybackErrorHandler, type PlayOptions } from "./playback";
import type { AudioEndedLike, PlayerLike } from "./queue";

// クロスフェードのロールスワップ再設計（2026-09-14、実機で検出した約22msの繋ぎ目クリック
// を受けて着手。詳細は`dusty-jukebox/CLAUDE.md`のクロスフェード節参照）第1段階：既存の
// `PlaybackController`をそのまま2インスタンス（audio要素A・B用）持ち、「今どちらが主か」
// を指すポインタの付け替えだけで主従を切り替えるための土台。このPRでは挙動を変えない
// （非アクティブ側の準備・ランプ・コミットAPIは次PRで追加する）：常に`active`側だけが
// 通常のplay()/pause()/cancelPendingTransition()/loadPaused()/markStreamTokenRejected()を
// 受け、既存の単一コントローラと全く同じに振る舞う。

// SW送信用URL・streamGeneration・認証継続レジストリに渡す値が、A/B間で衝突しないよう
// 共有する採番関数（ChatGPTレビュー指摘：②）。単純な+1カウンタで十分：各コントローラの
// 内部generation（isSuperseded判定・generationReasons）は意図的にこの採番と分離したまま
// （playback.tsのallocateStreamIdコメント参照）。
export type StreamIdAllocator = () => number;

export function createSharedStreamIdAllocator(seed = 0): StreamIdAllocator {
  let next = seed;
  return () => ++next;
}

export type PlayerSlot = 0 | 1;

// main.ts側がPlaybackControllerの具象型を直接参照している箇所（pause/loadPaused/
// markStreamTokenRejected/currentGeneration/currentStreamGeneration）を、
// DualAudioPlayerでも同じ形で満たすための型。play()の`options`からPlayOptionsを直接
// 再エクスポートせず、PlayerLikeと同じ緩い型で受ける（queue.tsとの結線を壊さないため）。
export interface PlaybackControllerLike {
  play(fileId: string, position?: number, options?: PlayOptions): Promise<void>;
  pause(fadeOut?: boolean): Promise<boolean>;
  cancelPendingTransition(): void;
  loadPaused(fileId: string, position?: number): void;
  markStreamTokenRejected(fileId: string, generation: number): number | null;
  currentGeneration(): number;
  currentStreamGeneration(): number | null;
}

// main.ts側のUI結線（シークバー・MediaSession・クロスフェードのtimeupdate駆動等）が必要とする
// イベント種別。role-swap後は「今どちらの要素が主か」がpromotion()で動的に変わるため、これらの
// イベントは常にactiveスロットの要素からだけ中継しなければならない（さもないと、準備中の
// 非アクティブ側の内部再生が、まだ主ではない段階でシークバー表示等を乱してしまう）。
export type FacadeEventType = "ended" | "playing" | "pause" | "timeupdate" | "durationchange" | "loadedmetadata" | "emptied";

export class DualAudioPlayer implements PlayerLike, AudioEndedLike, PlaybackControllerLike {
  private active: PlayerSlot = 0;
  private readonly controllers: [PlaybackController, PlaybackController];
  private readonly audios: [AudioElementLike, AudioElementLike];
  private readonly listeners = new Map<FacadeEventType, Array<() => void>>();

  constructor(
    audioA: AudioElementLike,
    audioB: AudioElementLike,
    getValidAccessToken: GetValidAccessToken,
    onPlaybackError: PlaybackErrorHandler = () => {},
    // 「本物の」遷移開始通知（main.ts側のcancelCrossfadeIfActive()等）。今アクティブな
    // スロットの遷移だけをこれへ転送する（ChatGPTレビュー指摘：③）。非アクティブ側
    // （次PR以降、準備中のコントローラ）の内部play()呼び出しは、role-swap自身の先読み
    // 開始のためのものであり、「本物の割り込み」として扱うと自己キャンセルしてしまう
    // ため、活動中でない側の通知は握りつぶす。
    onRealTransitionStart: () => void = () => {},
    // 未指定時はここでは共有カウンタを作らない（2026-09-14、E2Eで発覚した回帰を受けて修正）。
    // main.ts側の`currentGeneration() + 1`という予測（registerQueuePlaybackContinuation等、
    // Drive 401後の認証継続レジストリに登録するgenerationの決め方）は、「次のplay()呼び出しの
    // streamGenerationは、呼び出し前の内部generation+1と必ず一致する」という前提に依存して
    // いる。この前提は、streamIdが各コントローラ自身のprivateなgenerationカウンタと同一の
    // 場合にのみ成り立つ。ここで無条件に共有アロケータを既定値にしてしまうと、この前提が
    // 崩れ、Drive 401後の認証継続が正しい世代と一致しなくなり「音声を再生できませんでした」
    // という汎用エラーに化けてしまう（実際にE2Eで検出：401モックが効かなくなった）。
    // 共有アロケータ自体が必要になるのは、非アクティブ側が実際にstreamIdを消費するように
    // なる次PR（先読み準備の追加）以降であり、その時に上記の予測ロジック自体も合わせて
    // 見直す。このPRの時点では、呼び出し元が明示的に注入しない限り両コントローラとも
    // 自身の既定（`() => this.generation`）のまま——単一のactiveスロットしか実際には
    // 使われないため、既存の予測ロジックと完全に同じ挙動を保つ。
    allocateStreamId?: StreamIdAllocator
  ) {
    const makeOnTransitionStart = (slot: PlayerSlot) => () => {
      if (this.active === slot) onRealTransitionStart();
    };
    // 非アクティブ側（先読み準備中）のメディアerrorを、activeスロットの再生状態とは無関係に
    // 無条件でonPlaybackErrorへ流さない（2026-09-14〜、Codexレビュー指摘：P2「Filter
    // playback errors from the inactive slot」）。façadeイベント（forward()）と同じ
    // 「今アクティブなスロットのものだけを外部へ中継する」方針に揃える：先読み中のBが
    // 壊れたファイル・アクセス不可等でerrorを起こしても、実際に再生中のA側には無関係な
    // ため、汎用の「音声を再生できませんでした」でステータスを上書きしてはならない。
    const makeOnPlaybackError = (slot: PlayerSlot) => (error: unknown) => {
      if (this.active === slot) onPlaybackError(error);
    };
    this.controllers = allocateStreamId
      ? [
          new PlaybackController(audioA, getValidAccessToken, makeOnPlaybackError(0), makeOnTransitionStart(0), allocateStreamId),
          new PlaybackController(audioB, getValidAccessToken, makeOnPlaybackError(1), makeOnTransitionStart(1), allocateStreamId),
        ]
      : [
          new PlaybackController(audioA, getValidAccessToken, makeOnPlaybackError(0), makeOnTransitionStart(0)),
          new PlaybackController(audioB, getValidAccessToken, makeOnPlaybackError(1), makeOnTransitionStart(1)),
        ];
    this.audios = [audioA, audioB];
    // 両方のaudio要素の対象イベントを常時購読し、発火した瞬間に「その要素が現在アクティブか」で
    // 絞り込んでから外部へ中継する（ChatGPTレビュー指摘：④、"ended"以外のイベント種別は
    // ロールスワップのオーケストレーション本体〈PR2〉向けに一般化）。PlaybackQueueは1つの
    // AudioEndedLikeにしか結線できないため、DualAudioPlayer自身がこのfaçadeを担う。
    const facadeEventTypes: FacadeEventType[] = ["ended", "playing", "pause", "timeupdate", "durationchange", "loadedmetadata", "emptied"];
    for (const type of facadeEventTypes) {
      audioA.addEventListener(type, () => this.forward(type, 0));
      audioB.addEventListener(type, () => this.forward(type, 1));
    }
  }

  private forward(type: FacadeEventType, slot: PlayerSlot): void {
    if (this.active !== slot) return;
    for (const listener of this.listeners.get(type) ?? []) listener();
  }

  addEventListener(type: FacadeEventType, listener: () => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  private get activePlaybackController(): PlaybackController {
    return this.controllers[this.active];
  }

  private get inactiveSlot(): PlayerSlot {
    return this.active === 0 ? 1 : 0;
  }

  // ロールスワップ（PR2）向け：非アクティブ側のコントローラ・audio要素への参照。
  // 先読み再生・クロスフェードのランプはこちらへ向けて行う。
  inactiveController(): PlaybackControllerLike {
    return this.controllers[this.inactiveSlot];
  }

  // ChatGPTレビュー指摘（2026-09-14、PR2続き）：クロスフェードのコミット時、旧active側の
  // 実際のstreamId（退役するストリーム）を取得し、その継続（PlaybackContinuationRegistry）を
  // 明示的に無効化できるようにするために必要。
  activeController(): PlaybackControllerLike {
    return this.controllers[this.active];
  }

  activeAudioElement(): AudioElementLike {
    return this.audios[this.active];
  }

  inactiveAudioElement(): AudioElementLike {
    return this.audios[this.inactiveSlot];
  }

  // コミット瞬間の不変条件（ChatGPTレビュー、役割交換の核心）：
  // 「A.volume=0/B.volume=1になった後、activeSlotを付け替えるだけ」。
  // このメソッド自身はsrc/currentTime/play()/pause()のいずれにも一切触れない
  // （呼び出し元が事前に音量ランプを完了させてから呼ぶ前提）。
  commitPromotion(): void {
    this.active = this.inactiveSlot;
  }

  // 昇格後、旧アクティブ側（今の非アクティブ側）の後始末。無音確定後に呼ぶ想定。
  // `src = ""`ではなく属性自体を除去する（2026-09-14〜、Codexレビュー指摘：P2）：
  // `src`へ空文字列を代入すると、attribute自体は「存在するが空」のままリソース選択
  // アルゴリズムを走らせてしまい、両スロットのコントローラが張ったままの`error`
  // リスナー（rejectedGeneration不一致時は汎用の「音声を再生できませんでした」を
  // 発火する）が誤って発火し、実際には新active側が問題なく再生中でもこのエラーが
  // 表示されてしまう。テスト用の簡易フェイク（removeAttribute未実装）は従来通り
  // `src = ""`へフォールバックする。
  resetInactive(): void {
    const audio = this.inactiveAudioElement();
    audio.pause();
    if (audio.removeAttribute) audio.removeAttribute("src");
    else audio.src = "";
  }

  play(fileId: string, position?: number, options?: PlayOptions): Promise<void> {
    return this.activePlaybackController.play(fileId, position, options);
  }

  pause(fadeOut = false): Promise<boolean> {
    return this.activePlaybackController.pause(fadeOut);
  }

  // 両スロットを無効化する（ChatGPTレビュー指摘：PR2前提①）。非アクティブ側が
  // 実際に先読み再生するようになった以上、setList()等の割り込みはその先読みも
  // 打ち切らなければ、後から鳴り始めてしまう恐れがある。
  cancelPendingTransition(): void {
    this.controllers[0].cancelPendingTransition();
    this.controllers[1].cancelPendingTransition();
  }

  // Media Session一時停止（main.ts）向け：activeAudioElement()を直接ネイティブpause()した
  // 呼び出し元が、そのすぐ後で呼ぶ想定（2026-09-15、Codexレビュー指摘：P1「Invalidate
  // recovery on Media Session pause」）。進行中のバックグラウンド復帰リトライは常に
  // activeスロット上で実行される（resume()はcommitPromotion()を経由せず現在のactiveへ
  // そのまま届く）ため、activePlaybackController側だけを無効化すれば足りる
  // （cancelPendingTransition()のような両スロット無効化は不要）。
  invalidatePendingRecoveryOnNativePause(): void {
    this.activePlaybackController.invalidatePendingRecoveryOnNativePause();
  }

  // Media Session一時停止と対になる、ネイティブ再開の確認（2026-09-15、Codexレビュー
  // 指摘：P1「Supersede pause ownership on Media Session play」）。呼び出し元
  // （main.ts）が既にactiveAudioElement()へネイティブplay()を直接呼んだ直後に呼ぶ想定。
  acknowledgeNativeResume(): void {
    this.activePlaybackController.acknowledgeNativeResume();
  }

  loadPaused(fileId: string, position = 0): void {
    this.activePlaybackController.loadPaused(fileId, position);
  }

  // 両スロットに問い合わせる（ChatGPTレビュー指摘：PR2前提②の一部）。非アクティブ側の
  // 先読みストリームがDrive 401を受けた場合、そちらのコントローラでしかmatchしないため。
  markStreamTokenRejected(fileId: string, generation: number): number | null {
    return (
      this.controllers[0].markStreamTokenRejected(fileId, generation) ??
      this.controllers[1].markStreamTokenRejected(fileId, generation)
    );
  }

  currentGeneration(): number {
    return this.activePlaybackController.currentGeneration();
  }

  currentStreamGeneration(): number | null {
    return this.activePlaybackController.currentStreamGeneration();
  }
}
