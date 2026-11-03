// Webで表紙を探す（埋め込み画像の無いアルバム用）。まずMusicBrainz（Cover Art Archive）、無ければiTunes。
// どちらもキー不要で、ブラウザから直接呼べる（CORS許可を確認済み）。
// 取り違えを減らすため、アルバム名が一致し（括弧の付記は無視してよい）、アーティストも一致する候補だけを使う
// （オムニバス・不明のアルバムはアーティストを比べない）。

export interface ArtCandidate {
  source: "musicbrainz" | "itunes";
  sourceId: string;
  imageUrl: string;
}

/** 比べるための形：互換文字をそろえ（全角英数→半角等）、小文字にし、文字・数字以外を除く。 */
export function normalizeForMatch(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

// 末尾などの括弧の付記（(Remastered)・[Disc 1]・【初回盤】等）を除いた形。
function withoutBrackets(text: string): string {
  return text.normalize("NFKC").replace(/\([^)]*\)|\[[^\]]*\]|【[^】]*】|〔[^〕]*〕/g, " ");
}

/** アルバム名が同じか（そのまま、または括弧の付記を除いて一致）。 */
export function titleMatches(wanted: string, candidate: string): boolean {
  const a = normalizeForMatch(wanted);
  const b = normalizeForMatch(candidate);
  if (a === "" || b === "") return false;
  if (a === b) return true;
  const a2 = normalizeForMatch(withoutBrackets(wanted));
  const b2 = normalizeForMatch(withoutBrackets(candidate));
  return a2 !== "" && a2 === b2;
}

/** アーティストが同じか（片方がもう片方を含めばよい。"feat."・"&"で並んだ名義も拾うため）。探す側が空なら比べない。 */
export function artistMatches(wanted: string, candidate: string): boolean {
  const a = normalizeForMatch(wanted);
  if (a === "") return true;
  const b = normalizeForMatch(candidate);
  return b !== "" && (a.includes(b) || b.includes(a));
}

// Luceneの句（"..."）の中で意味を持つ文字を逃がす。
const phrase = (text: string) => `"${text.replace(/[\\"]/g, (c) => `\\${c}`)}"`;

export function musicBrainzSearchUrl(album: string, artist: string): string {
  const query = artist ? `releasegroup:${phrase(album)} AND artist:${phrase(artist)}` : `releasegroup:${phrase(album)}`;
  return `https://musicbrainz.org/ws/2/release-group/?query=${encodeURIComponent(query)}&fmt=json&limit=10`;
}

interface MusicBrainzResponse {
  "release-groups"?: { id?: string; title?: string; score?: number; "artist-credit"?: { name?: string; artist?: { name?: string } }[] }[];
}

/** MusicBrainzの検索結果から、使える候補（スコアの高い順、最大3件）。表紙はCover Art Archiveの500px版。 */
export function musicBrainzCandidates(response: unknown, album: string, artist: string): ArtCandidate[] {
  const groups = (response as MusicBrainzResponse)?.["release-groups"] ?? [];
  return groups
    .filter((g) => g.id && (g.score ?? 0) >= 80 && titleMatches(album, g.title ?? ""))
    .filter((g) => {
      const credit = (g["artist-credit"] ?? []).map((c) => `${c.name ?? ""} ${c.artist?.name ?? ""}`).join(" ");
      return artistMatches(artist, credit);
    })
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 3)
    .map((g) => ({ source: "musicbrainz", sourceId: g.id!, imageUrl: `https://coverartarchive.org/release-group/${g.id}/front-500` }));
}

export function iTunesSearchUrl(album: string, artist: string): string {
  const term = artist ? `${artist} ${album}` : album;
  return `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=album&country=JP&limit=10`;
}

interface ITunesResponse {
  results?: { collectionId?: number; collectionName?: string; artistName?: string; artworkUrl100?: string }[];
}

/** iTunesの検索結果から、使える候補（最大3件）。画像は600×600に指定し直す。 */
export function iTunesCandidates(response: unknown, album: string, artist: string): ArtCandidate[] {
  return ((response as ITunesResponse)?.results ?? [])
    .filter((r) => r.collectionId !== undefined && r.artworkUrl100 && titleMatches(album, r.collectionName ?? "") && artistMatches(artist, r.artistName ?? ""))
    .slice(0, 3)
    .map((r) => ({
      source: "itunes",
      sourceId: String(r.collectionId),
      imageUrl: r.artworkUrl100!.replace(/\/\d+x\d+bb\.(?:jpg|png|webp)$/i, "/600x600bb.jpg"),
    }));
}

/** 呼び出しの間隔を空ける（MusicBrainzは1秒に1回まで、iTunesは1分に20回程度まで）。 */
export class Throttle {
  private next = 0;
  constructor(
    private readonly intervalMs: number,
    private readonly now: () => number = () => Date.now(),
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))
  ) {}
  async wait(): Promise<void> {
    const at = Math.max(this.now(), this.next);
    this.next = at + this.intervalMs;
    const delay = at - this.now();
    if (delay > 0) await this.sleep(delay);
  }
}

export class WebSearchError extends Error {}

export interface WebArtSearch {
  musicBrainz(album: string, artist: string): Promise<ArtCandidate[]>;
  iTunes(album: string, artist: string): Promise<ArtCandidate[]>;
}

/** 実際に検索する（fetchは差し替えられる）。通信・応答の失敗はWebSearchError（その回は「取れなかった」扱いで次回やり直す）。 */
export function createWebArtSearch(fetchFn: typeof fetch = (...args) => fetch(...args)): WebArtSearch {
  const mb = new Throttle(1_100);
  const it = new Throttle(3_100);
  const getJson = async (throttle: Throttle, url: string) => {
    await throttle.wait();
    let res: Response;
    try {
      res = await fetchFn(url, { headers: { Accept: "application/json" } });
    } catch (err) {
      throw new WebSearchError(`検索に失敗しました: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!res.ok) throw new WebSearchError(`検索に失敗しました: ${res.status}`);
    // 本文の受信中に切れた・JSONとして読めない場合も、そのアルバムだけ「取れなかった」にする
    try {
      return (await res.json()) as unknown;
    } catch (err) {
      throw new WebSearchError(`検索の応答を読めませんでした: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  return {
    async musicBrainz(album, artist) {
      return musicBrainzCandidates(await getJson(mb, musicBrainzSearchUrl(album, artist)), album, artist);
    },
    async iTunes(album, artist) {
      return iTunesCandidates(await getJson(it, iTunesSearchUrl(album, artist)), album, artist);
    },
  };
}
