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

  // 読み込み済み（有効なスナップショットがある）かどうか。検索ボタンの有効/無効など、曲を取り出さず
  // 状態だけを知りたい呼び出し元向け。
  isLoaded(): boolean {
    return this.loaded;
  }

  createQueue(select: (songs: T[]) => T[]): T[] | null {
    return this.loaded ? select(this.songs) : null;
  }
}
