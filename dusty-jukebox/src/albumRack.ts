// アルバム一覧の分け方（部屋のCDラックのイメージ。Android版の`core/AlbumRack`・`core/AlbumFolders`と同じ規則）。
// - CD1枚＝1件：「アルバム名＋まとめる単位のフォルダ」が同じ曲を1枚にする（曲ごとのアーティストが違っても分けない）。
//   ディスクごとのフォルダ（`アルバム/CD1`・`アルバム/Disc 2`等）に分かれた何枚組も、その上のフォルダで1枚にする
// - 棚（見出し）：アルバムアーティスト → 半分を超える曲のアーティスト → どちらも無ければオムニバス。アーティストが全く無ければ不明
// - 収録曲：ディスク番号（タグが無ければディスクのフォルダの番号）→ トラック番号の順
// - 並べ方：既定はアーティストの棚ごと（見出しで区切り、棚の中は発売の古い順）。発売の古い順・新しい順・アルバム名順も選べる
// 文字列の比較はlocaleCompare（再生リストの並び替え・ライブラリと同じ）。
import { albumReleaseYear, type AlbumGroup, type Song } from "./catalog";

/** オムニバスの棚の印（タグの値と重ならない）。表示名は[displayShelf]。 */
export const VARIOUS_SHELF = "\u0001various";
export const VARIOUS_LABEL = "オムニバス";
export const UNKNOWN_LABEL = "不明なアーティスト";

export const ALBUM_RACK_SORTS = ["shelf", "year-asc", "year-desc", "title"] as const;
export type AlbumRackSort = (typeof ALBUM_RACK_SORTS)[number];
export const ALBUM_RACK_SORT_LABELS: Record<AlbumRackSort, string> = {
  shelf: "アーティストの棚（発売順）",
  "year-asc": "発売の古い順",
  "year-desc": "発売の新しい順",
  title: "アルバム名順",
};
export function isAlbumRackSort(value: string): value is AlbumRackSort {
  return (ALBUM_RACK_SORTS as readonly string[]).includes(value);
}

/** `folders`タブ（フォルダ名キャッシュ）の1件。 */
export interface FolderInfo { name: string; parentId: string; }

/** 曲に付ける、アルバムをまとめる単位（何枚組の上のフォルダ）とディスクのフォルダ名。無ければ親フォルダ・空。 */
export interface RackSong extends Song { albumFolderId?: string; discFolder?: string; }

// `CD1`・`CD 2`・`Disc-3`・`DISK04`・`ディスク1`・`CD1 本編` など。数字は2桁まで。
const DISC = /^(?:cd|disc|disk|ディスク)\s*[-_.#]?\s*0*(\d{1,2})(?!\d)/i;

/** ディスクごとのフォルダの名前なら、そのディスク番号。違えばundefined。 */
export function discNumberFromFolderName(folderName: string): number | undefined {
  const m = DISC.exec(folderName.trim());
  return m ? Number(m[1]) : undefined;
}

/** ディスクごとのフォルダに入っている曲に、まとめる単位（上のフォルダ）とディスクのフォルダ名を付ける。 */
export function annotateAlbumFolders(songs: Song[], folders: ReadonlyMap<string, FolderInfo>): RackSong[] {
  if (folders.size === 0) return songs;
  return songs.map((song) => {
    const folder = folders.get(song.parentId);
    if (folder && folder.parentId !== "" && discNumberFromFolderName(folder.name) !== undefined) {
      return { ...song, albumFolderId: folder.parentId, discFolder: folder.name };
    }
    return song;
  });
}

const numeric = (v: string) => { const n = Number(v); return v.trim() !== "" && Number.isFinite(n) ? n : Number.POSITIVE_INFINITY; };

/** 曲のディスク番号：タグがあればそれ、無ければディスクのフォルダの番号、どちらも無ければ不明（末尾）。 */
export function effectiveDisc(song: RackSong): number {
  const tagged = numeric(song.discNumber);
  if (Number.isFinite(tagged)) return tagged;
  return song.discFolder ? discNumberFromFolderName(song.discFolder) ?? Number.POSITIVE_INFINITY : Number.POSITIVE_INFINITY;
}

// いちばん多い値とその数（同数なら先に出たもの）。
function mostCommon(values: string[]): [string, number] | undefined {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: [string, number] | undefined;
  for (const [v, n] of counts) if (!best || n > best[1]) best = [v, n];
  return best;
}

/** 1枚のアルバムを置く棚（AlbumGroup.albumArtistに入れる）。 */
export function shelfOf(songs: Song[]): string {
  const albumArtist = mostCommon(songs.map((s) => s.albumArtist.trim()).filter((v) => v !== ""));
  if (albumArtist) return albumArtist[0];
  const artist = mostCommon(songs.map((s) => s.artist.trim()).filter((v) => v !== ""));
  if (!artist) return "";
  return artist[1] * 2 > songs.length ? artist[0] : VARIOUS_SHELF;
}

export function displayShelf(shelf: string): string {
  return shelf === VARIOUS_SHELF ? VARIOUS_LABEL : shelf === "" ? UNKNOWN_LABEL : shelf;
}

const differ = (a: string, b: string) => a.localeCompare(b) || (a < b ? -1 : a > b ? 1 : 0);

/** 全曲からアルバムを作る（アルバム名の無い曲は入れない）。 */
export function groupAlbumsForRack(songs: RackSong[]): AlbumGroup[] {
  const members = new Map<string, RackSong[]>();
  for (const song of songs) {
    const album = song.album.trim();
    if (!album) continue;
    const key = JSON.stringify([album, song.albumFolderId ?? song.parentId]);
    const list = members.get(key);
    if (list) list.push(song); else members.set(key, [song]);
  }
  return [...members.entries()].map(([key, list]) => ({
    album: (JSON.parse(key) as [string, string])[0],
    albumArtist: shelfOf(list),
    songs: [...list].sort((a, b) => effectiveDisc(a) - effectiveDisc(b) || numeric(a.trackNumber) - numeric(b.trackNumber)),
  })).sort((a, b) => differ(a.album, b.album) || differ(a.albumArtist, b.albumArtist));
}

const shelfRank = (shelf: string) => (shelf === VARIOUS_SHELF ? 1 : shelf === "" ? 2 : 0);
/** 棚の並び：アーティスト名の順。オムニバス、不明の棚は最後。 */
export function compareShelves(a: string, b: string): number {
  return shelfRank(a) - shelfRank(b) || differ(a, b);
}

/** 並べ方ごとの、アルバムの並び（shelfは棚の中の並び）。発売年の不明なものは最後。 */
export function compareRackAlbums(sort: AlbumRackSort): (a: AlbumGroup, b: AlbumGroup) => number {
  const byTitle = (a: AlbumGroup, b: AlbumGroup) => differ(a.album, b.album) || differ(a.albumArtist, b.albumArtist);
  const byYear = (desc: boolean) => (a: AlbumGroup, b: AlbumGroup) => {
    const ay = albumReleaseYear(a); const by = albumReleaseYear(b);
    if (ay === undefined) return by === undefined ? byTitle(a, b) : 1;
    if (by === undefined) return -1;
    return (desc ? by - ay : ay - by) || byTitle(a, b);
  };
  switch (sort) {
    case "shelf":
    case "year-asc": return byYear(false);
    case "year-desc": return byYear(true);
    case "title": return byTitle;
    default: {
      const _exhaustive: never = sort;
      return _exhaustive;
    }
  }
}

export type AlbumRackRow =
  | { kind: "shelf"; label: string; albumCount: number }
  | { kind: "album"; group: AlbumGroup; showArtist: boolean };

/**
 * 検索語（アルバム名・棚のアーティスト名の部分一致）で絞り、並べ方に応じた行にする。
 * 棚ごとの並べ方なら見出しを付け、それ以外は見出し無しの1列（行にアーティスト名を出す）。
 */
export function albumRackRows(groups: AlbumGroup[], query: string, sort: AlbumRackSort): AlbumRackRow[] {
  const q = query.trim().toLocaleLowerCase();
  const matched = q === "" ? groups : groups.filter((g) => g.album.toLocaleLowerCase().includes(q) || displayShelf(g.albumArtist).toLocaleLowerCase().includes(q));
  const byAlbum = compareRackAlbums(sort);
  if (sort !== "shelf") return [...matched].sort(byAlbum).map((group) => ({ kind: "album", group, showArtist: true }));
  const byShelf = new Map<string, AlbumGroup[]>();
  for (const g of matched) {
    const list = byShelf.get(g.albumArtist);
    if (list) list.push(g); else byShelf.set(g.albumArtist, [g]);
  }
  return [...byShelf.entries()].sort((a, b) => compareShelves(a[0], b[0])).flatMap(([shelf, albums]) => [
    { kind: "shelf" as const, label: displayShelf(shelf), albumCount: albums.length },
    ...[...albums].sort(byAlbum).map((group) => ({ kind: "album" as const, group, showArtist: false })),
  ]);
}
