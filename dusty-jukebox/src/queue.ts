import type { Song } from "./catalog";
import { sortSongsForQueue, type QueueSortDirection, type QueueSortField } from "./queueSort";
import { PlaybackInterruptedError, PlaybackPausedError } from "./playback";
export interface AudioEndedLike { addEventListener(type: "ended", listener: () => void): void; }
export interface PlayerLike {
  play(fileId: string, position?: number, options?: { fadeOut?: boolean }): Promise<void>;
  // setList()（別アルバム・プレイリスト選択）でPlaybackController側の進行中フェードも
  // 無効化するために使う（2026-09-08、Codexレビュー指摘：P1、詳細はplayback.tsの実装参照）。
  // 実PlaybackController以外の簡易モック（既存テスト等）を壊さないためoptionalにする。
  cancelPendingTransition?(): void;
}
export type BeforeQueuePlay = (fileId: string) => void;

export class PlaybackQueue {
  private songs: Song[] = []; private currentFileId: string | null = null; private excluded = new Set<string>(); private isQueuePlayback = false;
  private generation = 0;
  // シャッフル前の並び順（初回シャッフル時点のスナップショット）。連続してシャッフルしても
  // 上書きしない＝unshuffle()は常に「一度も並べ替えていない元の並び」へ戻る。setList()で
  // リストを作り直すたびにリセットする。
  private originalOrder: Song[] | null = null;
  // A play request does not commit the current song until PlaybackController has
  // started it. Keep navigation requests ordered so a second quick "next" sees
  // the result of the first request instead of requesting the same song again.
  private pendingMove: Promise<boolean> = Promise.resolve(false);
  // フェードアウトを伴う手動スキップ（next/previous/playFileIdにfadeOut=trueで呼ぶ経路）が
  // player.play()の完了を待っている間、その操作を表すトークンをactiveFadeTokenへ持たせる
  // （2026-09-08、Codexレビュー指摘：P1、開発体制#42④。単純なboolean（旧fadeInFlight）だと、
  // replacePending（認証継続のresume()）で置き換えられ「孤立」した古いplayAndCommit()が、
  // 後から（新しいフェード操作が既に進行中の状態で）解決・拒否した際、その古い操作自身の
  // finallyが共有のboolean/フラグをfalseへ戻してしまい、進行中の新しいフェード操作の状態を
  // 誤って解除してしまう競合があった。各操作に一意なトークンを持たせ、`finally`では
  // 「現在のactiveFadeTokenが依然として自分自身のトークンである場合のみ」解除することで、
  // 後から解決した孤立操作が新しい操作の状態を巻き込んで壊さないようにする）。
  // フェード中はaudio.srcがまだ旧曲のままのため、旧曲がこの待機中に自然終了すると
  // 'ended'が発火するが、旧曲のcurrentFileIdはまだ更新されていない（手動スキップがまだ
  // committされていない）ため、この'ended'から通常通りnext()/advanceOnEnded()すると、手動
  // スキップがcommitした直後の新しい曲を追い越してさらに1曲進めてしまう（例：A再生末尾で
  // 「次へ」でBへフェード中にAが自然終了→Bがcommitされた直後にB→Cへ自動進行し、Bが丸ごと
  // スキップされる）。フェード中の自然終了は、手動スキップが既にこの遷移を代表しているため
  // 無視する（フェードを伴わない通常のsrc即時差し替えでは、ブラウザは新しいsrcへの差し替えを
  // 中断＝load abortとして扱い'ended'自体を発火しないため、この問題は起きない）。
  private fadeTokenCounter = 0;
  private activeFadeToken: number | null = null;
  constructor(
    private readonly player: PlayerLike,
    audio: AudioEndedLike,
    private readonly onError: (error: unknown) => void = () => {},
    private readonly onEnded: (() => void) | null = null,
    private readonly onBeforePlay: BeforeQueuePlay = () => {}
  ) {
    audio.addEventListener("ended", () => {
      if (!this.isQueuePlayback || this.activeFadeToken !== null) return;
      if (this.onEnded) this.onEnded();
      else void this.next().catch(this.onError);
    });
  }
  // 呼び出し元の配列をそのまま参照せずコピーする（2026-09-08、Codexレビュー指摘：P2）。
  // shuffle()/moveSong()はthis.songsの要素をその場で入れ替えるため、呼び出し元
  // （main.tsのアルバム再生ボタン等）が`group.songs`のような他の場所でも保持している配列を
  // そのまま渡すと、この入れ替えが呼び出し元の配列まで書き換えてしまう（例：アルバム再生後に
  // 上下ボタンで並び替えると、`loadedAlbumGroups`が保持する元のアルバム内曲順自体が
  // 破壊され、以後そのアルバムを読み込み直しても正しいdisc/track順に戻らない）。
  // setList()もmove()のreplacePendingと同じく、pendingMoveを即座に差し替えて新しいリストの
  // 操作を始められる独立した経路のため、activeFadeTokenも同様に失効させる（2026-09-08、
  // Codexレビュー指摘：P1）。失効させないと、フェード付きの古いplayer.play()がネットワーク待ち
  // 等で未解決のまま残っている間に別アルバム・プレイリストを選ぶと、新しい曲が再生されても
  // 古いトークンが残り続け、コンストラクタの'ended'ガードがそれを無期限に一時停止扱いのまま
  // 無視してしまい、自動送りが止まる。
  // activeFadeTokenの失効だけではキュー側の状態を正すのみで、PlaybackController内で進行中の
  // フェード付きplay()自体はキャンセルされない（2026-09-08、Codexレビュー指摘：P1続き）。
  // player.cancelPendingTransition()でcontroller側のgenerationも進め、フェード完了後に
  // 「もう選ばれていない旧リストの曲」が実際に鳴ってしまうのを防ぐ。
  setList(songs: Song[]): void { this.generation += 1; this.pendingMove = Promise.resolve(false); this.activeFadeToken = null; this.player.cancelPendingTransition?.(); this.songs = [...songs]; this.currentFileId = null; this.excluded = new Set(); this.isQueuePlayback = false; this.originalOrder = null; }
  notifyExternalPlaybackStarted(): void { this.isQueuePlayback = false; }
  // 呼び出しのたびに1つ進む（2026-09-08、Codexレビュー指摘：P2続き）。exclude()はsetList()を
  // 経由せず即座にexcludedを書き換えるため、generationId()では検出できない「除外/除外解除だけの
  // 変更」を呼び出し元が検出できるようにする（exclusionVersion()参照）。
  private exclusionVersionCounter = 0;
  exclude(fileId: string, excluded: boolean): void { excluded ? this.excluded.add(fileId) : this.excluded.delete(fileId); this.exclusionVersionCounter += 1; }
  isExcluded(fileId: string): boolean { return this.excluded.has(fileId); }
  all(): Song[] { return [...this.songs]; }
  list(): Song[] { return this.songs.filter((s) => !this.isExcluded(s.fileId)); }
  // setList()のたびに1つ進む、現在のリストの世代（2026-09-08、Codexレビュー指摘：P2向け）。
  // whenIdle()はpendingMove待機中の他の操作（アルバム再生・絞り込み等によるsetList()）までは
  // 防げないため、呼び出し元（handleSavePlaylist()等）が「待っている間に全く別のリストへ
  // 差し替えられていないか」を確認するのに使う。
  generationId(): number { return this.generation; }
  // exclude()の呼び出し回数（2026-09-08、Codexレビュー指摘：P2続き）。generationId()と
  // 組み合わせて使う：待機中にチェックボックスで一部の曲だけ除外/除外解除された場合、
  // setList()を経由しないためgenerationId()は変わらないが、これは変わる。
  exclusionVersion(): number { return this.exclusionVersionCounter; }
  currentPlayingFileId(): string | null { return this.currentFileId; }
  // 「再生」ボタン（開発体制#40）向け：現在の曲を再開してよいかどうか。currentFileIdは
  // notifyExternalPlaybackStarted()後も温存され続けるため、これ単独では「キュー由来の再生
  // （一時停止中を含む）が今も有効かどうか」を判定できない（2026-09-06、PR #418
  // ChatGPTレビュー指摘：キュー曲再生→キュー外の単曲試聴→「再生」ボタンで、試聴中の曲の
  // 再生位置のままキューの古い曲を誤って再開してしまう）。isQueuePlaybackも併せて確認する。
  // 現在曲が除外済みの場合もfalseにする（2026-09-06、PR #418 ChatGPTレビュー再々指摘：
  // resume()自体は除外中のfileIdを拒否するため、除外済みの現在曲でtrueを返すと「再生」
  // ボタンが何も再生できなくなる。除外済みならplayAt(0)側へフォールバックさせる）。
  canResumeCurrent(): boolean {
    return this.isQueuePlayback && this.currentFileId !== null && !this.isExcluded(this.currentFileId);
  }
  // クロスフェード（開発体制#42④続き）向け：現在の再生がキュー由来かどうか。外部の単曲試聴
  // （main.tsの「この曲を再生」）中はクロスフェードを発火させないためのガードに使う
  // （currentFileId自体はnotifyExternalPlaybackStarted()後も温存され続けるため、これ単独では
  // 判定できない。canResumeCurrent()と同じ理由）。
  isPlayingFromQueue(): boolean {
    return this.isQueuePlayback;
  }
  // クロスフェード向け：次に再生される曲のfileId（無ければnull）。next()と同じ探索ロジックだが
  // 状態を変更しない読み取り専用の先読み。
  private findNext(): Song | undefined {
    const currentIndex = this.currentFileId === null ? -1 : this.songs.findIndex((song) => song.fileId === this.currentFileId);
    return this.songs.find((song, index) => index > currentIndex && !this.isExcluded(song.fileId));
  }
  peekNextFileId(): string | null {
    return this.findNext()?.fileId ?? null;
  }
  private async playAndCommit(fileId: string, generation: number, position?: number, fadeOut = false): Promise<boolean> {
    // Register a continuation before the native play promise settles: the
    // initial stream request can receive a 401 while that promise is pending.
    this.onBeforePlay(fileId);
    // このフェード操作自身のトークンを発行する（2026-09-08、Codexレビュー指摘：P1）。
    let myFadeToken: number | null = null;
    if (fadeOut) {
      this.fadeTokenCounter += 1;
      myFadeToken = this.fadeTokenCounter;
      this.activeFadeToken = myFadeToken;
    }
    try {
      await this.player.play(fileId, position, fadeOut ? { fadeOut: true } : undefined);
    } catch (err) {
      // フェード中にユーザーが明示的に一時停止した場合（2026-09-08、Codexレビュー指摘：P1）。
      // player.play()は次の曲へ実際には切り替わっていないため、これを再生成功として
      // commitしてはならない（currentFileId/isQueuePlaybackを更新せずfalseを返す）。
      // 「一時停止しただけ」はエラー表示すべき状況ではないため、呼び出し元へは再送出しない
      // （queue操作が「何も始まらなかった」を示すfalseを返すという既存の設計に合わせる）。
      if (err instanceof PlaybackInterruptedError) {
        // 一時停止（PlaybackPausedError）による中断の場合だけthis.generationを進め、既に
        // pendingMoveへ積まれている後続のナビゲーション操作（素早い連続クリックや、フェード中の
        // 旧曲自然終了によるadvanceOnEnded()経由のnext()等）も無効化する（2026-09-08、Codexレビュー
        // 指摘：P1）。move()はoperation実行直前に`generation === this.generation`を確認するため
        // （setList()と同じ既存の無効化機構）、ここで進めないと、ユーザーが明示的に一時停止した
        // 直後に後続操作が次の曲を再生してしまい一時停止が勝手に取り消される。
        // 一時停止によるものではなく、フェード中に別の正当なplay()（例：別アルバム選択による
        // setList()＋playAt()）に追い越されただけの場合は進めない（2026-09-08、Codexレビュー
        // 指摘：P1続き。ここで無条件に進めると、新しく開始した正当な操作がpendingMove内で
        // 自身のgeneration確認に失敗し、実際には再生が始まっているのにキューの現在曲・UIが
        // 更新されなくなってしまう）。
        if (err instanceof PlaybackPausedError) this.generation += 1;
        return false;
      }
      throw err;
    } finally {
      // 自分自身が発行したトークンが依然として「現在アクティブなフェード」である場合のみ解除する
      // （2026-09-08、Codexレビュー指摘：P1）。置き換えられて孤立した古い操作がここに後から
      // 到達しても、既にactiveFadeTokenは新しい操作のトークンへ差し替わっているため、この
      // 古い操作のfinallyは新しい操作の状態を誤って解除しない。
      if (myFadeToken !== null && this.activeFadeToken === myFadeToken) this.activeFadeToken = null;
    }
    if (generation !== this.generation) return false;
    this.currentFileId = fileId;
    this.isQueuePlayback = true;
    return true;
  }
  private move(operation: (generation: number) => Promise<boolean>, replacePending = false): Promise<boolean> {
    const generation = this.generation;
    // Authentication continuation must not wait behind the original native
    // play(), which can remain pending after its stream has already returned
    // 401. Replace that chain while keeping ordinary navigation serialized.
    // replacePending（認証継続のresume()）でチェーンを置き換える場合、置き換えられた側の
    // 古いplayer.play()呼び出しが実際にいつ解決するかは保証されない（2026-09-08、Codexレビュー
    // 指摘：P1。ブラウザのHTMLMediaElement.play()自体が長時間未解決のままになりうるため、
    // playAndCommit()のtry/finallyがfadeInFlightを確実に解除できるとは限らない）。fadeInFlightを
    // 解除せず取り残すと、それ以降の曲の自然終了（'ended'）が恒久的に無視され続け、キューが
    // 二度と自動で進まなくなってしまう。新しいチェーンを開始する時点で、古いフェード待機状態は
    // もはや意味を持たないため、ここで明示的に解除する（トークン方式のため、後から古い操作の
    // finallyが誤って新しい操作の状態を解除することもない）。
    if (replacePending) this.activeFadeToken = null;
    const predecessor = replacePending ? Promise.resolve(false) : this.pendingMove;
    const result = predecessor.then(() => generation === this.generation ? operation(generation) : false);
    // A rejected playback must reject its own caller, but must not prevent a
    // later navigation request from being processed.
    this.pendingMove = result.catch(() => false);
    return result;
  }
  playAt(index: number): Promise<boolean> { return this.move(async (generation) => { const list = this.list(); if (index < 0 || index >= list.length) return false; return this.playAndCommit(list[index].fileId, generation); }); }
  // 再生リストの曲名クリック向け：playAt(index)と異なりfileIdで直接指定する（2026-09-08、
  // Codexレビュー指摘：DOM側は描画時点の`QueueRowView.listIndex`をクリックハンドラの
  // クロージャに固定して持つため、moveSong()/sortBy()等でpendingMove待機中に配列の並びが
  // 変わると、実行時にはそのインデックスが指す曲が変わっており、クリックした曲と異なる曲が
  // 再生されうる。move()経由でthis.list()をpendingMoveチェーン内の実行時点で評価し、
  // fileIdで探すことで、先に完了した並べ替え後の状態を必ず反映する）。除外中の曲は
  // this.list()の対象外のため見つからずfalseになる（playAt()と同じ挙動）。
  // fadeOut（開発体制#42④）：手動スキップのフェードアウトを適用するかどうか。
  // main.tsの曲名クリックハンドラがフェード設定の現在値を渡す。
  playFileId(fileId: string, fadeOut = false): Promise<boolean> {
    return this.move(async (generation) => {
      const song = this.list().find((s) => s.fileId === fileId);
      return song ? this.playAndCommit(song.fileId, generation, undefined, fadeOut) : false;
    });
  }
  // それまでにキューイングされた操作（moveSong/sortBy/shuffle/next/previous等）がすべて
  // 完了するのを待つ（2026-09-08、Codexレビュー指摘：P2）。list()/all()を読む前にこれを
  // awaitすれば、上下ボタンを押した直後（moveSong()がplayer.play()の解決待ちで
  // pendingMove内に留まっている間）に「保存」ボタンを押しても、まだ反映されていない
  // 並び替え前のスナップショットを保存してしまう競合を避けられる。呼び出し時点の
  // pendingMoveだけを捕捉して待つ（以降に新しくキューイングされる操作までは待たない）。
  async whenIdle(): Promise<void> {
    await this.pendingMove.catch(() => {});
  }
  // fadeOut（開発体制#42④）：手動の「次へ」ボタン・Bluetooth/OSメディアキーからの呼び出し時のみ
  // trueを渡す。曲の自然終了（advanceOnEnded()経由）ではfalse（既定値）のまま呼ぶ——将来の
  // クロスフェード機能（曲間で2曲が重なる本格版）がこの経路を専用に扱うため、フェードアウト
  // （単曲の音量を下げてから切り替える簡易版）とは役割を分ける。
  // startPosition（クロスフェード向け、2026-09-10）：クロスフェードの先読み再生が既に進んでいた
  // 秒数を渡し、その位置から次の曲を引き継ぐ。省略時（既存の全呼び出し）はplayAndCommit()の
  // 既定どおり先頭（0）から再生する。
  next(fadeOut = false, startPosition?: number): Promise<boolean> {
    return this.move(async (generation) => {
      const next = this.findNext();
      return next ? this.playAndCommit(next.fileId, generation, startPosition, fadeOut) : false;
    });
  }
  // 曲の自然終了（<audio>のended）専用のnext()。next()自体にこのロジックを組み込まないのは、
  // 末尾で「次へ」ボタンを空振りクリックしただけ（曲はまだ再生中）でも再開不可状態へ遷移して
  // しまうと、その後「一時停止して再生」で現在位置から再開する既存の想定動作を壊すため
  // （2026-09-06、PR #418 ChatGPTレビュー再々指摘：キューを最後まで自然再生し終えた後も
  // isQueuePlaybackがtrueのまま残り、「再生」ボタンが曲末尾の再生位置からresume()してしまい、
  // 実質何も再生されない不具合があった）。次の曲が無い場合のみisQueuePlaybackを明示的に
  // falseへ遷移させ、以後の「再生」ボタンがplayAt(0)で先頭から再生し直せるようにする。
  // startPosition：クロスフェード向け（next()参照）。省略時は先頭（0）から。
  advanceOnEnded(startPosition?: number): Promise<boolean> {
    return this.next(false, startPosition).then((started) => {
      if (!started) this.isQueuePlayback = false;
      return started;
    });
  }
  // クロスフェード向け：ランプ中に先読み再生していた曲を、途中でキューが変更されても必ず
  // その曲へ確定させる（2026-09-10、Codexレビュー指摘：P1）。next()/advanceOnEnded()は
  // 実行時点の最新の並びでfindNext()を再探索するため、ランプ中にexclude/並べ替え/シャッフル
  // 等でキューが変わっていると、既に先読み再生していた曲と異なる曲へコミットしてしまい、
  // 一部の曲が丸ごとスキップされたり別の曲へ不自然に切り替わったりする不具合があった。
  // 先読みしていた曲が既にリストから消えている・除外された場合のみ、通常のfindNext()へ
  // フォールバックする（advanceOnEnded()と同じく、次の曲が無ければisQueuePlaybackをfalseへ
  // 遷移させる）。
  advanceToPreviewedFile(fileId: string, startPosition?: number): Promise<boolean> {
    return this.move(async (generation) => {
      const stillQueued = this.list().some((song) => song.fileId === fileId);
      const target = stillQueued ? fileId : this.findNext()?.fileId;
      return target ? this.playAndCommit(target, generation, startPosition, false) : false;
    }).then((started) => {
      if (!started) this.isQueuePlayback = false;
      return started;
    });
  }
  // fadeOut：next()と同じ（開発体制#42④）。
  previous(fadeOut = false): Promise<boolean> { return this.move(async (generation) => { if (this.currentFileId === null) return false; const currentIndex = this.songs.findIndex((song) => song.fileId === this.currentFileId); for (let index = currentIndex - 1; index >= 0; index -= 1) { const song = this.songs[index]; if (!this.isExcluded(song.fileId)) return this.playAndCommit(song.fileId, generation, undefined, fadeOut); } return false; }); }
  resumeCurrent(position: number): Promise<boolean> { return this.move(async (generation) => this.currentFileId ? this.playAndCommit(this.currentFileId, generation, position) : false, true); }
  // 絞り込んだ再生リストをその場でランダムな順番に並べ替える（開発体制#39④UI-4）。
  // CONCEPT.mdの設計方針「気分はフィルタ条件で満たす、シャッフルは任意の再生モードの1つ」
  // に沿い、既存の絞り込み結果に対する任意操作として提供する（フィルタそのものは変えない）。
  // currentFileId・excluded・generationはそのまま（再生中の曲を止めたり、既存の除外設定を
  // リセットしたりしない）。
  // 再生中の曲がある場合、その曲自身と、それより前の位置はシャッフル対象から除外する
  // （2026-09-06、ChatGPTレビュー指摘：next()はcurrentFileIdの現在のインデックスより
  // 後ろだけを探索するため、現在曲を含めて全体をシャッフルすると、現在曲より前の位置に
  // 移動した未再生曲がnext()から永久に到達不能になり、残り曲があるのに再生が止まって
  // しまう。現在曲より後ろの区間だけをシャッフルすることで、その区間の曲は常に
  // 現在曲より後ろの位置に留まりnext()で辿り着ける）。
  // next()/playAt()等と同じpendingMoveの直列化チェーンに参加させる（2026-09-06、
  // ChatGPTレビュー再指摘：シャッフルが独立した同期操作のままだと、next()のplayAndCommit()が
  // player.play()の解決待ちでcurrentFileIdをまだ更新していない間にシャッフルすると、
  // 古いcurrentFileIdを基準に並べ替えてしまい、直後にcurrentFileIdへ確定する曲が
  // 並べ替え後の配列で他の未再生曲より前の位置に来てしまうことがある。move()経由にすることで、
  // 進行中の移動がcurrentFileIdを確定させた後の状態を基準に並べ替えられる）。
  shuffle(random: () => number = Math.random): Promise<boolean> {
    return this.move(async () => {
      if (this.originalOrder === null) this.originalOrder = [...this.songs];
      const currentIndex = this.currentFileId === null ? -1 : this.songs.findIndex((song) => song.fileId === this.currentFileId);
      const start = currentIndex + 1;
      for (let i = this.songs.length - 1; i > start; i -= 1) {
        const j = start + Math.floor(random() * (i - start + 1));
        [this.songs[i], this.songs[j]] = [this.songs[j], this.songs[i]];
      }
      return true;
    });
  }
  hasShuffleHistory(): boolean { return this.originalOrder !== null; }
  // シャッフル前の並び順に戻す。再生中の曲・除外設定・generationは変更しない（shuffle()と対称）。
  // next()/playAt()等と同じpendingMoveの直列化チェーンに参加させる（shuffle()と同じ理由：
  // 進行中のnext()等がcurrentFileIdを確定させる前に実行すると、その後next()がsongs配列を
  // 参照する際に一時的な不整合を招きうるため）。
  // 現在位置（プレフィックス）はそのまま残し、それより後ろ（未再生のサフィックス）だけを
  // originalOrderの相対順に戻す（2026-09-06、PR #418 ChatGPTレビュー指摘：シャッフル後に
  // next()で再生位置が進んだ状態で配列全体をoriginalOrderへ戻すと、currentFileIdの元配列上の
  // 位置がプレフィックス長より後ろにずれてしまい、next()がその位置より前の未再生曲を
  // 永久にスキップしたり、既に再生済みの曲を再度辿ったりする不具合があった。shuffle()自身が
  // 現在位置より前を並べ替え対象から常に除外しているのと対称の設計にする）。
  unshuffle(): Promise<boolean> {
    return this.move(async () => {
      if (this.originalOrder === null) return false;
      const currentIndex = this.currentFileId === null ? -1 : this.songs.findIndex((song) => song.fileId === this.currentFileId);
      const prefix = this.songs.slice(0, currentIndex + 1);
      const playedIds = new Set(prefix.map((song) => song.fileId));
      const suffix = this.originalOrder.filter((song) => !playedIds.has(song.fileId));
      this.songs = [...prefix, ...suffix];
      this.originalOrder = null;
      return true;
    });
  }
  // 再生リストの手動並び替え（普通の音楽プレイヤーの「並び替え」機能）。currentFileId・excluded・
  // generationはそのまま（再生中の曲を止めたり、除外設定をリセットしたりしない）。
  // **常にリスト全体（現在曲・既に辿った曲を含む）を対象に並べ替える**（2026-09-08、開発体制#42
  // 実機フィードバック：以前は現在位置より前を固定し後ろだけを並べ替えていたが、「常にリスト
  // 全体をその条件でソートしてほしい」という明示要望を受けて撤廃した）。currentFileId自体は
  // 不変（並べ替えでfileIdが指す曲そのものは変わらない）だが、その曲が新しい並びのどこへ
  // 移動するかは並べ替え結果次第で、next()はcurrentFileIdの新しい位置より後ろだけを探索する
  // ため、新しい並びで現在曲より前に来た未再生曲へはnext()で到達できなくなる（全体ソートを
  // 優先する以上のトレードオフとして許容。ユーザーとの相談で確認済み）。
  // シャッフル履歴（originalOrder）は無効化する（setList()と同じ扱い）：手動で並び替えた後は
  // 「シャッフル前の並び」という概念自体が意味を持たなくなるため、「シャッフルを元に戻す」
  // ボタンは無効に戻る。
  // next()/playAt()等と同じpendingMoveの直列化チェーンに参加させる（shuffle()と同じ理由：
  // 進行中の移動と同期に配列を書き換えると一時的な不整合を招きうるため）。
  sortBy(
    field: QueueSortField,
    direction: QueueSortDirection = "asc",
    secondaryField?: QueueSortField,
    secondaryDirection: QueueSortDirection = "asc"
  ): Promise<boolean> {
    return this.move(async () => {
      this.songs = sortSongsForQueue(this.songs, field, direction, secondaryField, secondaryDirection);
      this.originalOrder = null;
      return true;
    });
  }
  resume(fileId: string, position: number): Promise<boolean> {
    return this.move(async (generation) =>
      this.songs.some((song) => song.fileId === fileId) && !this.isExcluded(fileId)
        ? this.playAndCommit(fileId, generation, position)
        : false,
      true
    );
  }
  // 再生リスト内の曲を1つ上/下へ手動で入れ替える（上下ボタン、開発体制#42②）。除外中の曲も
  // 通常の行として一覧に表示され続けるため（main.tsのrenderQueue参照）、除外の有無に関わらず
  // 表示順そのままの隣接する2件を入れ替える（除外中の曲だけ飛び越える等の特別扱いはしない。
  // 見た目の並びと配列の並びを常に一致させ、挙動を単純・予測可能にするため）。currentFileId・
  // 除外設定は変えない。sortBy()と同じ理由でシャッフル履歴（originalOrder）は無効化する：
  // 手動で並び替えた後は「シャッフル前の並び」という概念自体が意味を持たなくなるため。
  // next()/playAt()等と同じpendingMoveの直列化チェーンに参加させる（進行中の移動と同期に
  // 配列を書き換えると一時的な不整合を招きうるため）。
  moveSong(fileId: string, direction: "up" | "down"): Promise<boolean> {
    return this.move(async () => {
      const index = this.songs.findIndex((song) => song.fileId === fileId);
      if (index === -1) return false;
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= this.songs.length) return false;
      [this.songs[index], this.songs[target]] = [this.songs[target], this.songs[index]];
      this.originalOrder = null;
      return true;
    });
  }
}

// 索引ライブラリUI（main.tsのrenderQueue）向けの純粋な表示計算。DOM操作自体はmain.tsに残すが、
// 「除外されていない曲だけがplayAt()のインデックス対象になる」「どの行が再生中か」という
// ロジック自体は切り出してテストする（AI開発ルール1：DOM操作を含むからという理由だけでテスト
// 対象外にしない）。2026-09-03、実機利用フィードバック：再生リストの曲をクリックしても再生
// できない・再生中の曲がどれか分からない、という2点への対応。
export interface QueueRowView {
  song: Song;
  excluded: boolean;
  // playAt()に渡すインデックス（list()＝除外されていない曲だけを数えた位置）。除外中の曲はnull
  // （クリックしても再生できない。除外を解除してから再生する運用のため）。
  listIndex: number | null;
  isCurrent: boolean;
}

export function queueRowViews(songs: Song[], isExcluded: (fileId: string) => boolean, currentFileId: string | null): QueueRowView[] {
  let listIndex = 0;
  return songs.map((song) => {
    const excluded = isExcluded(song.fileId);
    const view: QueueRowView = { song, excluded, listIndex: excluded ? null : listIndex, isCurrent: song.fileId === currentFileId };
    if (!excluded) listIndex += 1;
    return view;
  });
}

export function songDisplayLabel(song: Song): string {
  return `${song.title}${song.artist ? ` — ${song.artist}` : ""}${song.album ? ` / ${song.album}` : ""}${song.folderPath ? ` [${song.folderPath}]` : ""}`;
}

export function nowPlayingLabel(song: Song | undefined): string {
  return song ? `再生中: ${songDisplayLabel(song)}` : "";
}
