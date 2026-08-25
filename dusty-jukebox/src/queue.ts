import type { Song } from "./catalog";
export interface AudioEndedLike { addEventListener(type: "ended", listener: () => void): void; }
export interface PlayerLike { play(fileId: string): Promise<void>; }

export class PlaybackQueue {
  private songs: Song[] = []; private index = -1; private excluded = new Set<string>();
  constructor(private readonly player: PlayerLike, audio: AudioEndedLike) { audio.addEventListener("ended", () => void this.next()); }
  setList(songs: Song[]): void { this.songs = songs; this.index = -1; this.excluded = new Set(); }
  exclude(fileId: string, excluded: boolean): void { excluded ? this.excluded.add(fileId) : this.excluded.delete(fileId); }
  list(): Song[] { return this.songs.filter((s) => !this.excluded.has(s.fileId)); }
  async playAt(index: number): Promise<void> { const list = this.list(); if (index < 0 || index >= list.length) return; this.index = index; await this.player.play(list[index].fileId); }
  async next(): Promise<void> { await this.playAt(this.index + 1); }
  async previous(): Promise<void> { await this.playAt(this.index - 1); }
}
