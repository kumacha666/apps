import type { Song } from "./catalog";
export interface AudioEndedLike { addEventListener(type: "ended", listener: () => void): void; }
export interface PlayerLike { play(fileId: string, position?: number): Promise<void>; }
export type BeforeQueuePlay = (fileId: string) => void;

export class PlaybackQueue {
  private songs: Song[] = []; private currentFileId: string | null = null; private excluded = new Set<string>(); private isQueuePlayback = false;
  private generation = 0;
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
  setList(songs: Song[]): void { this.generation += 1; this.pendingMove = Promise.resolve(false); this.songs = songs; this.currentFileId = null; this.excluded = new Set(); this.isQueuePlayback = false; }
  notifyExternalPlaybackStarted(): void { this.isQueuePlayback = false; }
  exclude(fileId: string, excluded: boolean): void { excluded ? this.excluded.add(fileId) : this.excluded.delete(fileId); }
  isExcluded(fileId: string): boolean { return this.excluded.has(fileId); }
  all(): Song[] { return [...this.songs]; }
  list(): Song[] { return this.songs.filter((s) => !this.isExcluded(s.fileId)); }
  currentPlayingFileId(): string | null { return this.currentFileId; }
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
  previous(): Promise<boolean> { return this.move(async (generation) => { if (this.currentFileId === null) return false; const currentIndex = this.songs.findIndex((song) => song.fileId === this.currentFileId); for (let index = currentIndex - 1; index >= 0; index -= 1) { const song = this.songs[index]; if (!this.isExcluded(song.fileId)) return this.playAndCommit(song.fileId, generation); } return false; }); }
  resumeCurrent(position: number): Promise<boolean> { return this.move(async (generation) => this.currentFileId ? this.playAndCommit(this.currentFileId, generation, position) : false, true); }
  resume(fileId: string, position: number): Promise<boolean> {
    return this.move(async (generation) =>
      this.songs.some((song) => song.fileId === fileId) && !this.isExcluded(fileId)
        ? this.playAndCommit(fileId, generation, position)
        : false,
      true
    );
  }
}
