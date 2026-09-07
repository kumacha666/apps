import type { Song } from "./catalog";
import { sortSongsForQueue, type QueueSortDirection, type QueueSortField } from "./queueSort";
export interface AudioEndedLike { addEventListener(type: "ended", listener: () => void): void; }
export interface PlayerLike { play(fileId: string, position?: number): Promise<void>; }
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
  constructor(
    private readonly player: PlayerLike,
    audio: AudioEndedLike,
    private readonly onError: (error: unknown) => void = () => {},
    private readonly onEnded: (() => void) | null = null,
    private readonly onBeforePlay: BeforeQueuePlay = () => {}
  ) {
    audio.addEventListener("ended", () => {
      if (!this.isQueuePlayback) return;
      if (this.onEnded) this.onEnded();
      else void this.next().catch(this.onError);
    });
  }
  setList(songs: Song[]): void { this.generation += 1; this.pendingMove = Promise.resolve(false); this.songs = songs; this.currentFileId = null; this.excluded = new Set(); this.isQueuePlayback = false; this.originalOrder = null; }
  notifyExternalPlaybackStarted(): void { this.isQueuePlayback = false; }
  exclude(fileId: string, excluded: boolean): void { excluded ? this.excluded.add(fileId) : this.excluded.delete(fileId); }
  isExcluded(fileId: string): boolean { return this.excluded.has(fileId); }
  all(): Song[] { return [...this.songs]; }
  list(): Song[] { return this.songs.filter((s) => !this.isExcluded(s.fileId)); }
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
  private async playAndCommit(fileId: string, generation: number, position?: number): Promise<boolean> {
    // Register a continuation before the native play promise settles: the
    // initial stream request can receive a 401 while that promise is pending.
    this.onBeforePlay(fileId);
    if (position === undefined) await this.player.play(fileId);
    else await this.player.play(fileId, position);
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
    const predecessor = replacePending ? Promise.resolve(false) : this.pendingMove;
    const result = predecessor.then(() => generation === this.generation ? operation(generation) : false);
    // A rejected playback must reject its own caller, but must not prevent a
    // later navigation request from being processed.
    this.pendingMove = result.catch(() => false);
    return result;
  }
  playAt(index: number): Promise<boolean> { return this.move(async (generation) => { const list = this.list(); if (index < 0 || index >= list.length) return false; return this.playAndCommit(list[index].fileId, generation); }); }
  next(): Promise<boolean> { return this.move(async (generation) => { const currentIndex = this.currentFileId === null ? -1 : this.songs.findIndex((song) => song.fileId === this.currentFileId); const next = this.songs.find((song, index) => index > currentIndex && !this.isExcluded(song.fileId)); return next ? this.playAndCommit(next.fileId, generation) : false; }); }
  // 曲の自然終了（<audio>のended）専用のnext()。next()自体にこのロジックを組み込まないのは、
  // 末尾で「次へ」ボタンを空振りクリックしただけ（曲はまだ再生中）でも再開不可状態へ遷移して
  // しまうと、その後「一時停止して再生」で現在位置から再開する既存の想定動作を壊すため
  // （2026-09-06、PR #418 ChatGPTレビュー再々指摘：キューを最後まで自然再生し終えた後も
  // isQueuePlaybackがtrueのまま残り、「再生」ボタンが曲末尾の再生位置からresume()してしまい、
  // 実質何も再生されない不具合があった）。次の曲が無い場合のみisQueuePlaybackを明示的に
  // falseへ遷移させ、以後の「再生」ボタンがplayAt(0)で先頭から再生し直せるようにする。
  advanceOnEnded(): Promise<boolean> {
    return this.next().then((started) => {
      if (!started) this.isQueuePlayback = false;
      return started;
    });
  }
  previous(): Promise<boolean> { return this.move(async (generation) => { if (this.currentFileId === null) return false; const currentIndex = this.songs.findIndex((song) => song.fileId === this.currentFileId); for (let index = currentIndex - 1; index >= 0; index -= 1) { const song = this.songs[index]; if (!this.isExcluded(song.fileId)) return this.playAndCommit(song.fileId, generation); } return false; }); }
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
  // shuffle()と同じ理由で、現在位置（currentIndex）より前（＝現在の曲を含む、既に辿った区間）は
  // 並べ替え対象から除外し、それより後ろの区間だけを並べ替える（2026-09-07、ChatGPTレビュー
  // 指摘：全曲を対象に並べ替えると、現在曲が新しい並びで後方へ移動した場合、それより前に来た
  // 未再生曲がnext()の探索範囲（currentIndexより後ろだけ）から外れ、二度と辿れなくなる。
  // 「next()/previous()はfileIdでcurrentIndexを探し直すため新しい並びをそのまま辿れる」という
  // 説明だけでは、前方へ移動した未再生曲の到達性までは保証できない）。現在位置より後ろの区間は
  // 常に現在曲より後ろの位置に留まるため、next()は並べ替え後の新しい順序をそのまま辿れる。
  // シャッフル履歴（originalOrder）は無効化する（setList()と同じ扱い）：手動で並び替えた後は
  // 「シャッフル前の並び」という概念自体が意味を持たなくなるため、「シャッフルを元に戻す」
  // ボタンは無効に戻る。
  // next()/playAt()等と同じpendingMoveの直列化チェーンに参加させる（shuffle()と同じ理由：
  // 進行中の移動と同期に配列を書き換えると一時的な不整合を招きうるため）。
  sortBy(field: QueueSortField, direction: QueueSortDirection = "asc"): Promise<boolean> {
    return this.move(async () => {
      const currentIndex = this.currentFileId === null ? -1 : this.songs.findIndex((song) => song.fileId === this.currentFileId);
      const prefix = this.songs.slice(0, currentIndex + 1);
      const suffix = sortSongsForQueue(this.songs.slice(currentIndex + 1), field, direction);
      this.songs = [...prefix, ...suffix];
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
