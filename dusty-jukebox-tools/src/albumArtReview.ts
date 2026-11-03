// アルバムアートの確認画面（画面・通信に依存しない部分）。
// 集めた表紙を眺めて、違うものを「外す」か「別の候補」から選び直す。見つからなかったアルバムも、ここで手で探して入れられる。
// 別の候補は、一括で集めるとき（albumArtSearch.tsの照合）より緩く、検索結果をそのまま並べて人が選ぶ。

import type { AlbumArtRecord, ArtSource } from "./albumArtSheet";
import { iTunesSearchUrl, musicBrainzSearchUrl, Throttle, WebSearchError, type ArtCandidate } from "./albumArtSearch";

export const REVIEW_VIEWS = ["web", "notfound", "rejected", "error", "embedded", "all"] as const;
export type ReviewView = (typeof REVIEW_VIEWS)[number];
export const REVIEW_VIEW_LABELS: Record<ReviewView, string> = {
  web: "Webから補完した表紙",
  notfound: "見つからなかったアルバム",
  rejected: "外したアルバム",
  error: "読めなかった・取れなかったアルバム",
  embedded: "埋め込みの表紙",
  all: "すべて",
};
export function isReviewView(value: string): value is ReviewView {
  return (REVIEW_VIEWS as readonly string[]).includes(value);
}

const VIEW_SOURCES: Record<Exclude<ReviewView, "all">, readonly ArtSource[]> = {
  web: ["musicbrainz", "itunes"],
  notfound: ["notfound"],
  rejected: ["rejected"],
  error: ["error"],
  embedded: ["embedded"],
};

const compare = (a: string, b: string) => a.localeCompare(b) || (a < b ? -1 : a > b ? 1 : 0);

/** 表示するアルバム（アーティスト→アルバム名の順）。 */
export function recordsForView(records: Iterable<AlbumArtRecord>, view: ReviewView): AlbumArtRecord[] {
  const list = [...records].filter((r) => view === "all" || VIEW_SOURCES[view].includes(r.source));
  return list.sort((a, b) => compare(a.artist, b.artist) || compare(a.album, b.album) || compare(a.albumFolderId, b.albumFolderId));
}

/** 「外す」：表紙なしにし、次回の収集でも入れ直さない。 */
export function rejectedRecord(record: AlbumArtRecord, now: string): AlbumArtRecord {
  return { ...record, artFileId: "", source: "rejected", sourceId: "", updatedAt: now };
}

/** 「これにする」：選んだ候補の画像に差し替える（埋め込みの有無はそのまま）。 */
export function chosenRecord(record: AlbumArtRecord, candidate: ArtCandidate, artFileId: string, now: string): AlbumArtRecord {
  return { ...record, artFileId, source: candidate.source, sourceId: candidate.sourceId, updatedAt: now };
}

/** 取得元のページ（Webから補完したものだけ）。 */
export function sourcePageUrl(record: Pick<AlbumArtRecord, "source" | "sourceId">): string | null {
  if (!record.sourceId) return null;
  if (record.source === "musicbrainz") return `https://musicbrainz.org/release-group/${encodeURIComponent(record.sourceId)}`;
  if (record.source === "itunes") return `https://music.apple.com/jp/album/${encodeURIComponent(record.sourceId)}`;
  return null;
}

export const SOURCE_LABELS: Record<ArtSource, string> = {
  embedded: "埋め込み",
  musicbrainz: "MusicBrainz",
  itunes: "iTunes",
  notfound: "見つからない",
  error: "読めなかった",
  rejected: "外した",
};

/** 確認画面の候補（並べて見せるための小さな画像・名前つき）。 */
export interface ReviewCandidate extends ArtCandidate {
  previewUrl: string;
  title: string;
  artist: string;
}

interface MusicBrainzResponse {
  "release-groups"?: { id?: string; title?: string; score?: number; "artist-credit"?: { name?: string }[]; "primary-type"?: string }[];
}

/** MusicBrainzの検索結果を、照合せずにスコアの高い順に並べる（表紙が無いものもあるので、画像が出なければ画面で隠す）。 */
export function looseMusicBrainzCandidates(response: unknown, limit = 8): ReviewCandidate[] {
  return ((response as MusicBrainzResponse)?.["release-groups"] ?? [])
    .filter((g) => g.id)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, limit)
    .map((g) => ({
      source: "musicbrainz",
      sourceId: g.id!,
      imageUrl: `https://coverartarchive.org/release-group/${g.id}/front-500`,
      previewUrl: `https://coverartarchive.org/release-group/${g.id}/front-250`,
      title: g.title ?? "",
      artist: (g["artist-credit"] ?? []).map((c) => c.name ?? "").join(""),
    }));
}

interface ITunesResponse {
  results?: { collectionId?: number; collectionName?: string; artistName?: string; artworkUrl100?: string }[];
}

/** iTunesの検索結果を、照合せずに並べる。 */
export function looseITunesCandidates(response: unknown, limit = 8): ReviewCandidate[] {
  return ((response as ITunesResponse)?.results ?? [])
    .filter((r) => r.collectionId !== undefined && r.artworkUrl100)
    .slice(0, limit)
    .map((r) => ({
      source: "itunes",
      sourceId: String(r.collectionId),
      imageUrl: r.artworkUrl100!.replace(/\/\d+x\d+bb\.(?:jpg|png|webp)$/i, "/600x600bb.jpg"),
      previewUrl: r.artworkUrl100!.replace(/\/\d+x\d+bb\.(?:jpg|png|webp)$/i, "/200x200bb.jpg"),
      title: r.collectionName ?? "",
      artist: r.artistName ?? "",
    }));
}

/** 確認画面で候補を探す（MusicBrainz→iTunesの順に並べる）。どちらかが失敗しても、もう片方の結果は出す。両方失敗ならWebSearchError。 */
export function createReviewSearch(fetchFn: typeof fetch = (...args) => fetch(...args)) {
  const mb = new Throttle(1_100);
  const it = new Throttle(3_100);
  const getJson = async (throttle: Throttle, url: string): Promise<unknown> => {
    await throttle.wait();
    try {
      const res = await fetchFn(url, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()) as unknown;
    } catch (err) {
      throw new WebSearchError(`検索に失敗しました: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  return async (album: string, artist: string): Promise<ReviewCandidate[]> => {
    const [fromMb, fromIt] = await Promise.allSettled([
      getJson(mb, musicBrainzSearchUrl(album, artist)).then((r) => looseMusicBrainzCandidates(r)),
      getJson(it, iTunesSearchUrl(album, artist)).then((r) => looseITunesCandidates(r)),
    ]);
    if (fromMb.status === "rejected" && fromIt.status === "rejected") throw fromMb.reason;
    return [...(fromMb.status === "fulfilled" ? fromMb.value : []), ...(fromIt.status === "fulfilled" ? fromIt.value : [])];
  };
}
