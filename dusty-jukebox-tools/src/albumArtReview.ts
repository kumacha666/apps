// アルバムアートの確認画面（画面・通信に依存しない部分）。
// 集めた表紙を眺めて、違うものを「外す」か「別の候補」から選び直す。見つからなかったアルバムも、ここで手で探して入れられる。
// 別の候補は、一括で集めるとき（albumArtSearch.tsの照合）より緩く、検索結果をそのまま並べて人が選ぶ。

import { albumArtKey, isAiMatch, type AiMatch, type AlbumArtRecord, type ArtMatch, type ArtSource } from "./albumArtSheet";
import { iTunesSearchUrl, musicBrainzSearchUrl, Throttle, WebSearchError, type ArtCandidate } from "./albumArtSearch";

export const REVIEW_VIEWS = ["web", "ai", "ai-exact", "ai-variant", "ai-close", "ai-guess", "manual", "notfound", "rejected", "error", "embedded", "all"] as const;
export type ReviewView = (typeof REVIEW_VIEWS)[number];
export const REVIEW_VIEW_LABELS: Record<ReviewView, string> = {
  web: "Webから補完した表紙（自動）",
  ai: "AIが探した表紙（すべて）",
  "ai-exact": "AIが探した表紙：名前が一致",
  "ai-variant": "AIが探した表紙：表記違い",
  "ai-close": "AIが探した表紙：名前が近い",
  "ai-guess": "AIが探した表紙：推測（いちばん怪しい）",
  manual: "確認画面で選んだ表紙",
  notfound: "見つからなかったアルバム",
  rejected: "外したアルバム",
  error: "読めなかった・取れなかったアルバム",
  embedded: "埋め込みの表紙",
  all: "すべて",
};
export function isReviewView(value: string): value is ReviewView {
  return (REVIEW_VIEWS as readonly string[]).includes(value);
}

/** どう見つけたかの短い名前（確認画面のタイルに出す）。自動で集めたものは出さない。 */
export const MATCH_LABELS: Record<ArtMatch, string> = {
  "": "",
  "ai-exact": "AI：一致",
  "ai-variant": "AI：表記違い",
  "ai-close": "AI：近い",
  "ai-guess": "AI：推測",
  manual: "手で選んだ",
};

const WEB_SOURCES: readonly ArtSource[] = ["musicbrainz", "itunes", "deezer"];

function inView(r: AlbumArtRecord, view: ReviewView): boolean {
  switch (view) {
    case "all":
      return true;
    case "web":
      return WEB_SOURCES.includes(r.source) && r.match === "";
    case "ai":
      return WEB_SOURCES.includes(r.source) && isAiMatch(r.match);
    case "ai-exact":
    case "ai-variant":
    case "ai-close":
    case "ai-guess":
      return WEB_SOURCES.includes(r.source) && r.match === (view satisfies AiMatch);
    case "manual":
      return WEB_SOURCES.includes(r.source) && r.match === "manual";
    case "notfound":
    case "rejected":
    case "error":
    case "embedded":
      return r.source === view;
    default: {
      const never: never = view;
      return never;
    }
  }
}

const compare = (a: string, b: string) => a.localeCompare(b) || (a < b ? -1 : a > b ? 1 : 0);

/**
 * 表示するアルバム（アーティスト→アルバム名の順）。[unreviewedOnly]なら、表紙のあるアルバムはまだ確かめていないものだけ
 * （表紙の無いアルバム〈見つからなかった・外した・読めなかった〉は確かめる表紙が無いので、そのまま出す）。
 */
export function recordsForView(records: Iterable<AlbumArtRecord>, view: ReviewView, options: { unreviewedOnly?: boolean } = {}): AlbumArtRecord[] {
  const list = [...records].filter((r) => inView(r, view) && !(options.unreviewedOnly && r.artFileId && r.reviewedAt));
  return list.sort((a, b) => compare(a.artist, b.artist) || compare(a.album, b.album) || compare(a.albumFolderId, b.albumFolderId));
}

/** 画面に出した記録から変わっていないか（表紙・取得元・更新日時）。変わっていたら、見ていない記録を書き換えないよう操作を止める。 */
export function isSameArtRecord(current: AlbumArtRecord, shown: AlbumArtRecord): boolean {
  return (
    current.artFileId === shown.artFileId &&
    current.source === shown.source &&
    current.sourceId === shown.sourceId &&
    current.updatedAt === shown.updatedAt
  );
}

/** 「外す」：表紙なしにし、次回の収集でも入れ直さない。 */
export function rejectedRecord(record: AlbumArtRecord, now: string): AlbumArtRecord {
  return { ...record, artFileId: "", source: "rejected", sourceId: "", updatedAt: now, match: "", reviewedAt: now };
}

/** 「これにする」：選んだ候補の画像に差し替える（埋め込みの有無はそのまま）。 */
export function chosenRecord(record: AlbumArtRecord, candidate: ArtCandidate, artFileId: string, now: string): AlbumArtRecord {
  return { ...record, artFileId, source: candidate.source, sourceId: candidate.sourceId, updatedAt: now, match: "manual", reviewedAt: now };
}

/** 「OK」：表紙はそのままで、確かめた印だけを付ける（表紙の記録・更新日時は変えない）。 */
export function reviewedRecord(record: AlbumArtRecord, now: string): AlbumArtRecord {
  return { ...record, reviewedAt: now };
}

/**
 * 表示中のうち、まだ確かめていない表紙をまとめて「OK」にする書き込み。書く直前に読み直したタブ（[current]）の行番号で書き、
 * 画面に出した記録（[shown]）から変わっていた表紙（別の画面で差し替えた等）は、見ていないので印を付けない。
 */
export function planReviewedWrites(
  shown: readonly AlbumArtRecord[],
  current: ReadonlyMap<string, { rowNumber: number; record: AlbumArtRecord }>,
  now: string
): { updates: { rowNumber: number; record: AlbumArtRecord }[]; skipped: number } {
  const updates: { rowNumber: number; record: AlbumArtRecord }[] = [];
  let skipped = 0;
  for (const r of shown) {
    if (!r.artFileId || r.reviewedAt) continue;
    const now_ = current.get(albumArtKey(r.albumFolderId, r.album));
    if (!now_ || !isSameArtRecord(now_.record, r)) {
      skipped += 1;
      continue;
    }
    if (now_.record.reviewedAt) continue; // 別の画面で確かめ済み
    updates.push({ rowNumber: now_.rowNumber, record: reviewedRecord(now_.record, now) });
  }
  return { updates, skipped };
}

/** 取得元のページ（Webから補完したものだけ）。 */
export function sourcePageUrl(record: Pick<AlbumArtRecord, "source" | "sourceId">): string | null {
  if (!record.sourceId) return null;
  if (record.source === "musicbrainz") return `https://musicbrainz.org/release-group/${encodeURIComponent(record.sourceId)}`;
  if (record.source === "itunes") return `https://music.apple.com/jp/album/${encodeURIComponent(record.sourceId)}`;
  if (record.source === "deezer") return `https://www.deezer.com/album/${encodeURIComponent(record.sourceId)}`;
  return null;
}

export const SOURCE_LABELS: Record<ArtSource, string> = {
  embedded: "埋め込み",
  musicbrainz: "MusicBrainz",
  itunes: "iTunes",
  deezer: "Deezer",
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
