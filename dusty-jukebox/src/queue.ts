import type { Song } from "./catalog";
export interface AudioEndedLike { addEventListener(type: "ended", listener: () => void): void; }
export interface PlayerLike { play(fileId: string): Promise<void>; }

export class PlaybackQueue {
  private songs: Song[] = []; private currentFileId: string | null = null; private excluded = new Set<string>();
  constructor(private readonly player: PlayerLike, audio: AudioEndedLike) { audio.addEventListener("ended", () => void this.next()); }
  setList(songs: Song[]): void { this.songs = songs; this.currentFileId = null; this.excluded = new Set(); }
  exclude(fileId: string, excluded: boolean): void { excluded ? this.excluded.add(fileId) : this.excluded.delete(fileId); }
  isExcluded(fileId: string): boolean { return this.excluded.has(fileId); }
  all(): Song[] { return [...this.songs]; }
  list(): Song[] { return this.songs.filter((s) => !this.isExcluded(s.fileId)); }
  async playAt(index: number): Promise<void> { const list = this.list(); if (index < 0 || index >= list.length) return; this.currentFileId = list[index].fileId; await this.player.play(this.currentFileId); }
  async next(): Promise<void> { const currentIndex = this.currentFileId === null ? -1 : this.songs.findIndex((song) => song.fileId === this.currentFileId); const next = this.songs.find((song, index) => index > currentIndex && !this.isExcluded(song.fileId)); if (next) { this.currentFileId = next.fileId; await this.player.play(next.fileId); } }
  async previous(): Promise<void> { const currentIndex = this.currentFileId === null ? this.songs.length : this.songs.findIndex((song) => song.fileId === this.currentFileId); for (let index = currentIndex - 1; index >= 0; index -= 1) { const song = this.songs[index]; if (!this.isExcluded(song.fileId)) { this.currentFileId = song.fileId; await this.player.play(song.fileId); return; } } }
}
