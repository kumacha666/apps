// A catalog snapshot is valid only until the next scan starts. Keeping that
// lifecycle separate from DOM controls makes the required reload explicit.
export class CatalogSession<T> {
  private songs: T[] = [];
  private loaded = false;

  replace(songs: T[]): void {
    this.songs = songs;
    this.loaded = true;
  }

  invalidate(): void {
    this.songs = [];
    this.loaded = false;
  }

  createQueue(select: (songs: T[]) => T[]): T[] | null {
    return this.loaded ? select(this.songs) : null;
  }
}
