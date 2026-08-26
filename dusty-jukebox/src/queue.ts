import type { Song } from "./catalog";
export interface AudioEndedLike { addEventListener(type: "ended", listener: () => void): void; }
export interface PlayerLike { play(fileId: string): Promise<void>; }

export class PlaybackQueue {
  private songs: Song[] = []; private currentFileId: string | null = null; private excluded = new Set<string>(); private isQueuePlayback = false;
  // A play request does not commit the current song until PlaybackController has
  // started it. Keep navigation requests ordered so a second quick "next" sees
  // the result of the first request instead of requesting the same song again.
  private pendingMove: Promise<void> = Promise.resolve();
  constructor(private readonly player: PlayerLike, audio: AudioEndedLike, private readonly onError: (error: unknown) => void = () => {}) {
    audio.addEventListener("ended", () => { if (this.isQueuePlayback) void this.next().catch(this.onError); });
  }
  setList(songs: Song[]): void { this.songs = songs; this.currentFileId = null; this.excluded = new Set(); this.isQueuePlayback = false; }
  notifyExternalPlaybackStarted(): void { this.isQueuePlayback = false; }
  exclude(fileId: string, excluded: boolean): void { excluded ? this.excluded.add(fileId) : this.excluded.delete(fileId); }
  isExcluded(fileId: string): boolean { return this.excluded.has(fileId); }
  all(): Song[] { return [...this.songs]; }
  list(): Song[] { return this.songs.filter((s) => !this.isExcluded(s.fileId)); }
  private async playAndCommit(fileId: string): Promise<void> {
    await this.player.play(fileId);
    this.currentFileId = fileId;
    this.isQueuePlayback = true;
  }
  private move(operation: () => Promise<void>): Promise<void> {
    const result = this.pendingMove.then(operation);
    // A rejected playback must reject its own caller, but must not prevent a
    // later navigation request from being processed.
    this.pendingMove = result.catch(() => {});
    return result;
  }
  playAt(index: number): Promise<void> { return this.move(async () => { const list = this.list(); if (index < 0 || index >= list.length) return; await this.playAndCommit(list[index].fileId); }); }
  next(): Promise<void> { return this.move(async () => { const currentIndex = this.currentFileId === null ? -1 : this.songs.findIndex((song) => song.fileId === this.currentFileId); const next = this.songs.find((song, index) => index > currentIndex && !this.isExcluded(song.fileId)); if (next) await this.playAndCommit(next.fileId); }); }
  previous(): Promise<void> { return this.move(async () => { if (this.currentFileId === null) return; const currentIndex = this.songs.findIndex((song) => song.fileId === this.currentFileId); for (let index = currentIndex - 1; index >= 0; index -= 1) { const song = this.songs[index]; if (!this.isExcluded(song.fileId)) { await this.playAndCommit(song.fileId); return; } } }); }
}
