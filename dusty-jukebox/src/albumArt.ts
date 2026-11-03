// アルバムアート（R17、Android版の`core/NowArtwork`・`AlbumArtCache`に合わせた）のうち、画面に依存しない部分。
// 索引には画像が無いので、再生した曲の埋め込み画像を小さくしてブラウザに保存し、アルバム一覧でも使う
// （一度聞いたアルバムから出る。まだのアルバムは頭文字のタイル）。
//
// 画像は「どの曲から読んだか」と組にして扱う：読み出しが終わる前に曲が変わっても、読めた画像はその曲の
// アルバムとして保存し、表示はその曲がまだ再生中のときだけにする（Android版で、前の曲の画像を次の曲の
// アルバムとして保存してしまう不具合が実機で出たため）。

import type { AlbumGroup } from "./catalog";
import type { RackSong } from "./albumRack";
import type { CoverArtResult } from "./coverArt";

/** 保存するときのキー（アルバム一覧の1件＝「アルバム名＋まとめる単位のフォルダ」と同じ単位）。アルバム名が無ければnull。 */
export function albumArtKey(album: string, albumFolderId: string): string | null {
  const name = album.trim();
  return name ? `${name}\u0000${albumFolderId}` : null;
}

/** アルバム一覧の1件のキー（`groupAlbumsForRack`の分け方と同じく、まとめる単位のフォルダを使う）。 */
export function albumArtKeyOfGroup(group: AlbumGroup): string | null {
  const first = group.songs[0] as RackSong | undefined;
  if (!first) return null;
  return albumArtKey(group.album, first.albumFolderId ?? first.parentId);
}

/** 曲→その曲が入っているアルバムのキー。アルバム一覧と同じ分け方なので、曲の画像と一覧の画像が必ず一致する。 */
export function albumArtKeysByFileId(groups: readonly AlbumGroup[]): Map<string, string> {
  const keys = new Map<string, string>();
  for (const group of groups) {
    const key = albumArtKeyOfGroup(group);
    if (!key) continue;
    for (const song of group.songs) keys.set(song.fileId, key);
  }
  return keys;
}

/** 頭文字のタイルに出す1文字（無ければ♪）。サロゲートペア・結合文字を壊さないよう1書記素で切る。 */
export function albumInitial(album: string): string {
  const name = album.trim();
  if (!name) return "♪";
  const Segmenter = (Intl as unknown as { Segmenter?: new (locale?: string, options?: { granularity: "grapheme" }) => { segment(input: string): Iterable<{ segment: string }> } }).Segmenter;
  const first = Segmenter ? [...new Segmenter(undefined, { granularity: "grapheme" }).segment(name)][0]?.segment : [...name][0];
  return (first ?? "♪").toLocaleUpperCase();
}

/** 頭文字のタイルの色相（アルバム名から決まる、0〜359）。 */
export function albumTileHue(album: string): number {
  let hash = 0;
  for (const ch of album.trim()) hash = (hash * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  return hash % 360;
}

/** 縮小後の大きさ（長い辺を[maxPx]以下に。元が小さければそのまま）。 */
export function thumbnailSize(width: number, height: number, maxPx: number): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const scale = Math.min(1, maxPx / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** アルバムの小さな画像（data URL）の置き場。ブラウザではIndexedDB、テストでは配列などに差し替える。 */
export interface AlbumArtStore {
  /** 保存してある画像。無ければnull。 */
  get(key: string): Promise<string | null>;
  /** 無ければ保存する（すでにあれば何もしない）。新しく保存できたら`true`。 */
  putIfAbsent(key: string, url: string): Promise<boolean>;
}

/** Driveに置いた表紙（管理ツールが集めたもの）を探した結果。`none`はalbumArtタブに無い、`failed`は取れなかった。 */
export type RemoteArtResult = { kind: "none" } | { kind: "picture"; url: string } | { kind: "failed" };

export interface NowArtworkDeps {
  /** 曲が入っているアルバムのキー（アルバム名が無い・索引に無い曲はnull）。 */
  keyOf(fileId: string): string | null;
  store: AlbumArtStore;
  /** 曲の埋め込み画像を読む。曲が変わったら[signal]が中断される。 */
  extract(fileId: string, signal: AbortSignal): Promise<CoverArtResult>;
  /** 画像を小さくしてdata URLにする（読めない画像はnull）。 */
  makeThumbnail(data: Uint8Array, format: string): Promise<string | null>;
  /** 再生中の曲の画像を出す（[url]がnullなら頭文字のタイル）。[fileId]は、その画像がどの曲のものか。 */
  show(fileId: string | null, url: string | null): void;
  /** アルバムの画像を新しく保存した（表示中のアルバム一覧を差し替えるため）。 */
  onSaved(key: string, url: string): void;
  /**
   * Driveに置いた表紙を探す（あれば、保存してある画像・曲のファイルより先に使う。確認画面で選び直した表紙を反映するため）。
   * 無い・取れなければ、これまでどおり保存してある画像→曲のファイルの順。
   */
  remote?(key: string): Promise<RemoteArtResult>;
}

/**
 * 再生中の曲のアルバムアートを用意する。曲が変わるたびに[setCurrent]を呼ぶ（同じ曲なら何もしない）。
 * Driveに置いた表紙があればそれを、無ければ保存済みのアルバムの画像を出し、それも無ければ曲のファイルから読んで小さく保存する。
 */
export class NowArtwork {
  private current: string | null = null;
  private generation = 0;
  private abort: AbortController | null = null;
  // 読めたが画像の無かった曲（このページを開いている間は読み直さない）
  private readonly noPicture = new Set<string>();
  private shownFileId: string | null = null;
  private shownUrl: string | null = null;

  constructor(private readonly deps: NowArtworkDeps) {}

  /** いま出している画像（[fileId]が再生中の曲のときだけ）。 */
  urlFor(fileId: string | null | undefined): string | null {
    return fileId && fileId === this.shownFileId ? this.shownUrl : null;
  }

  /**
   * 今の曲の画像を探し直す（索引を読み直してDriveの表紙が分かったときなど）。表示は、見つかるまで今のまま。
   * 曲が無ければ何もしない。
   */
  refresh(): Promise<void> {
    if (this.current === null) return Promise.resolve();
    this.generation += 1;
    this.abort?.abort();
    this.abort = null;
    return this.prepare(this.current, this.generation);
  }

  setCurrent(fileId: string | null): Promise<void> {
    if (fileId === this.current) return Promise.resolve();
    this.current = fileId;
    this.generation += 1;
    this.abort?.abort();
    this.abort = null;
    this.display(fileId, null);
    if (fileId === null) return Promise.resolve();
    return this.prepare(fileId, this.generation);
  }

  private display(fileId: string | null, url: string | null): void {
    this.shownFileId = fileId;
    this.shownUrl = url;
    this.deps.show(fileId, url);
  }

  private async prepare(fileId: string, generation: number): Promise<void> {
    const key = this.deps.keyOf(fileId);
    if (key && this.deps.remote) {
      const remote = await this.deps.remote(key).catch((): RemoteArtResult => ({ kind: "failed" }));
      if (generation !== this.generation) return;
      if (remote.kind === "picture") {
        this.deps.onSaved(key, remote.url);
        this.display(fileId, remote.url);
        return;
      }
    }
    if (key) {
      const cached = await this.deps.store.get(key).catch(() => null);
      if (generation !== this.generation) return;
      if (cached) {
        this.display(fileId, cached);
        return;
      }
    }
    if (this.noPicture.has(fileId)) return;
    const abort = new AbortController();
    this.abort = abort;
    const result = await this.deps.extract(fileId, abort.signal).catch((): CoverArtResult => ({ kind: "failed" }));
    if (this.abort === abort) this.abort = null;
    if (result.kind === "none") {
      this.noPicture.add(fileId);
      return;
    }
    if (result.kind !== "picture") return;
    const url = await this.deps.makeThumbnail(result.data, result.format).catch(() => null);
    if (!url) return;
    // 画像は読み出した曲（fileId）のアルバムとして保存する。今の曲（this.current）ではない。
    if (key && (await this.deps.store.putIfAbsent(key, url).catch(() => false))) this.deps.onSaved(key, url);
    if (generation === this.generation) this.display(fileId, url);
  }
}
