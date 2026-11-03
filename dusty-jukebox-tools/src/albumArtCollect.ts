// アルバムの表紙を集める流れ（画面・通信に依存しない部分。通信や画像の縮小は引数で受け取る）。
// 1アルバムごとに：
//   1. 曲のファイルの埋め込み画像を読む（最初の曲、無ければ最後の曲）。あれば縮めてDriveへ置く（source=embedded）
//   2. 無ければWebで探す（MusicBrainz→iTunes）。見つかれば縮めてDriveへ置く。無ければnotfound
//   読めなかった・取れなかったときはerror（次の実行でやり直す）。Driveの認証エラーなどは例外のまま返し、全体を止める。

import type { ArtAlbum } from "./albumArtAlbums";
import { coverCandidateTracks } from "./albumArtAlbums";
import { albumArtKey, albumArtRow, isSettled, type AlbumArtRecord } from "./albumArtSheet";
import { normalizeForMatch, searchTitle, WebSearchError, type ArtCandidate, type WebArtSearch } from "./albumArtSearch";
import type { CoverArtResult } from "./coverArt";

/** Webの画像が取れなかった（通信の失敗など）。そのアルバムはerrorにして次回やり直す。 */
export class ImageFetchError extends Error {}

export interface CollectDeps {
  extractEmbedded(fileId: string): Promise<CoverArtResult>;
  search: WebArtSearch;
  /** Webの画像を取る。無い（404等）ならnull、通信の失敗はImageFetchError。 */
  fetchImage(url: string): Promise<{ data: Uint8Array; format: string } | null>;
  /** 画像を小さなJPEGにする。読めない画像ならnull。 */
  makeThumbnail(data: Uint8Array, format: string): Promise<Blob | null>;
  /** Driveへ置いて、そのファイルIDを返す。 */
  upload(album: ArtAlbum, image: Blob): Promise<string>;
  now(): string;
}

// サウンドトラックの作品名（作曲者の表記が取得元とタグで揃わないことが多いので、アーティストで絞らない）。
const SOUNDTRACK_TITLE = /soundtrack|\bo\.?s\.?[tv]\b|サウンドトラック|サントラ/i;
// アーティスト名の代わりに入っている、作品の種類の名前（これで絞ると何も見つからない）。
const SOUNDTRACK_ARTISTS = new Set(
  ["Soundtrack", "サウンドトラック", "Original Soundtrack", "Original Game Soundtrack", "Video Game Soundtrack", "Game Soundtrack", "OST", "Score"].map(normalizeForMatch)
);
const VARIOUS_ARTISTS = new Set(["Various Artists", "Various", "VA", "V.A.", "オムニバス", "ヴァリアス・アーティスト"].map(normalizeForMatch));

/**
 * Webで探すときのアーティスト名。空文字は「アルバム名だけで探し、アーティストは比べない」。nullは探さない。
 * - サウンドトラック（作品名で判断、またはアーティスト欄が「Soundtrack」等）：アルバム名だけで探す
 * - オムニバス（アーティスト欄が「Various Artists」等、または曲ごとにアーティストが違う）："Various Artists"
 * - アーティストが分からない（サウンドトラックでもない）：探さない（アルバム名だけでは取り違えが多い）
 */
export function searchArtist(album: ArtAlbum): string | null {
  const name = normalizeForMatch(album.artist);
  if (SOUNDTRACK_TITLE.test(album.album) || (album.shelf === "artist" && SOUNDTRACK_ARTISTS.has(name))) return "";
  if (album.shelf === "various" || (album.shelf === "artist" && VARIOUS_ARTISTS.has(name))) return "Various Artists";
  if (album.shelf === "artist") return album.artist;
  return null;
}

/** 前回、曲のファイルに表紙が無いと確かめてあるアルバム（もう一度探すときは曲を読み直さない）。値は確かめた曲。 */
export type KnownNoEmbedded = ReadonlyMap<string, string>;

/** Webの検索・画像の取得の失敗（そのアルバムだけerrorにする）か。 */
export function isRetryLaterError(err: unknown): boolean {
  return err instanceof ImageFetchError || err instanceof WebSearchError;
}

export async function collectAlbumArt(album: ArtAlbum, deps: CollectDeps, knownNoEmbedded?: KnownNoEmbedded): Promise<AlbumArtRecord> {
  const record = (fields: Partial<AlbumArtRecord> & Pick<AlbumArtRecord, "source">): AlbumArtRecord => ({
    albumFolderId: album.albumFolderId,
    album: album.album,
    artist: album.artist,
    embedded: "",
    artFileId: "",
    sourceId: "",
    checkedFileId: "",
    updatedAt: deps.now(),
    ...fields,
  });

  // 1. 埋め込み画像（前回、無いと確かめてあれば読み直さない）
  let readFailed = false;
  const known = knownNoEmbedded?.get(albumArtKey(album.albumFolderId, album.album));
  let checkedFileId = known ?? "";
  for (const track of known === undefined ? coverCandidateTracks(album) : []) {
    const result = await deps.extractEmbedded(track.fileId);
    if (result.kind === "failed") {
      readFailed = true;
      continue;
    }
    checkedFileId ||= track.fileId;
    if (result.kind === "picture") {
      const thumb = await deps.makeThumbnail(result.data, result.format);
      // 縮められない（ブラウザで読めない形式の）画像は、アプリでも表示できないので「無い」とみなす
      if (thumb) {
        const artFileId = await deps.upload(album, thumb);
        return record({ embedded: "yes", artFileId, source: "embedded", checkedFileId: track.fileId });
      }
    }
  }
  if (readFailed) return record({ source: "error", checkedFileId });

  // 2. Webで探す
  const artist = searchArtist(album);
  if (artist === null) return record({ embedded: "no", source: "notfound", checkedFileId });
  try {
    for (const find of [deps.search.musicBrainz, deps.search.iTunes]) {
      const candidates: ArtCandidate[] = await find.call(deps.search, searchTitle(album.album), artist);
      for (const candidate of candidates) {
        const image = await deps.fetchImage(candidate.imageUrl);
        if (!image) continue;
        const thumb = await deps.makeThumbnail(image.data, image.format);
        if (!thumb) continue;
        const artFileId = await deps.upload(album, thumb);
        return record({ embedded: "no", artFileId, source: candidate.source, sourceId: candidate.sourceId, checkedFileId });
      }
    }
  } catch (err) {
    if (isRetryLaterError(err)) return record({ embedded: "no", source: "error", checkedFileId });
    throw err;
  }
  return record({ embedded: "no", source: "notfound", checkedFileId });
}

/**
 * これから集めるアルバム（記録が無い、または前回errorだったもの）。
 * [retryNotFound]なら、前回Webで見つからなかったアルバムも（探し方を直したときに、見つからなかった分だけ探し直す）。
 */
export function albumsToCollect(
  albums: readonly ArtAlbum[],
  existing: ReadonlyMap<string, { record: AlbumArtRecord }>,
  options: { retryNotFound?: boolean } = {}
): ArtAlbum[] {
  return albums.filter((a) => {
    const record = existing.get(albumArtKey(a.albumFolderId, a.album))?.record;
    return !isSettled(record) || (options.retryNotFound === true && record?.source === "notfound");
  });
}

/** 前回、曲に表紙が無いと確かめてあるアルバム（Webで見つからなかったもの）。 */
export function knownNoEmbeddedOf(existing: ReadonlyMap<string, { record: AlbumArtRecord }>): Map<string, string> {
  const known = new Map<string, string>();
  for (const [key, { record }] of existing) if (record.embedded === "no" && record.source === "notfound") known.set(key, record.checkedFileId);
  return known;
}

/** 書き込む内容：記録のあるアルバムはその行を上書き、無ければ追記。 */
export function planAlbumArtWrites(
  records: readonly AlbumArtRecord[],
  existing: ReadonlyMap<string, { rowNumber: number }>
): { appends: string[][]; updates: { rowNumber: number; row: string[] }[] } {
  const appends: string[][] = [];
  const updates: { rowNumber: number; row: string[] }[] = [];
  for (const r of records) {
    const found = existing.get(albumArtKey(r.albumFolderId, r.album));
    if (found) updates.push({ rowNumber: found.rowNumber, row: albumArtRow(r) });
    else appends.push(albumArtRow(r));
  }
  return { appends, updates };
}

export interface RunCollectionOptions {
  albums: readonly ArtAlbum[];
  deps: CollectDeps;
  /** まとめて書き込む（この件数ごと、と最後に）。 */
  flush(records: AlbumArtRecord[]): Promise<void>;
  flushEvery?: number;
  knownNoEmbedded?: KnownNoEmbedded;
  concurrency?: number;
  shouldStop(): boolean;
  onProgress(done: number, total: number, last: AlbumArtRecord): void;
}

/** アルバムを順に集め、途中経過をこまめに書き込む（止めても、次回は書き込んだ分を飛ばして続けられる）。 */
export async function runCollection(options: RunCollectionOptions): Promise<{ done: number; stopped: boolean }> {
  const { albums, deps, flush, shouldStop, onProgress } = options;
  const flushEvery = options.flushEvery ?? 10;
  const concurrency = Math.max(1, options.concurrency ?? 3);
  let next = 0;
  let done = 0;
  let pending: AlbumArtRecord[] = [];
  let flushing: Promise<void> = Promise.resolve();
  let fatal: unknown = null;
  const flushPending = () => {
    const batch = pending;
    pending = [];
    flushing = flushing.then(() => (batch.length > 0 ? flush(batch) : undefined));
    return flushing;
  };
  const worker = async () => {
    while (fatal === null && !shouldStop()) {
      const index = next++;
      const album = albums[index];
      if (!album) return;
      try {
        const record = await collectAlbumArt(album, deps, options.knownNoEmbedded);
        pending.push(record);
        done += 1;
        onProgress(done, albums.length, record);
        if (pending.length >= flushEvery) await flushPending();
      } catch (err) {
        fatal ??= err;
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  await flushPending();
  if (fatal !== null) throw fatal;
  return { done, stopped: done < albums.length };
}
