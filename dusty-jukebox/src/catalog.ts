import { INDEX_SHEET_HEADER } from "./sheets";

export interface Song {
  fileId: string; parentId: string; title: string; artist: string; album: string; genre: string;
  composer: string; albumArtist: string; releaseYear: string; discNumber: string; trackNumber: string; folderPath?: string;
}

type Row = (string | number)[];
const col = (name: (typeof INDEX_SHEET_HEADER)[number]) => INDEX_SHEET_HEADER.indexOf(name);
const cell = (row: Row, name: (typeof INDEX_SHEET_HEADER)[number]) => String(row[col(name)] ?? "").trim();

// 空欄は抽出値、(none) は明示的な空、その他は手動補正値。
export function readOverride(row: Row, field: "title" | "artist" | "album" | "releaseYear" | "composer" | "albumArtist"): string {
  const override = cell(row, `${field}_override` as (typeof INDEX_SHEET_HEADER)[number]);
  return override === "" ? cell(row, field) : override === "(none)" ? "" : override;
}

export function parseIndexRows(rows: Row[]): Song[] {
  const fileIds = new Set<string>();
  return rows.filter((row) => {
    const fileId = cell(row, "fileId");
    if (fileId === "" || fileIds.has(fileId)) return false;
    fileIds.add(fileId);
    return true;
  }).map((row) => {
    const fileId = cell(row, "fileId");
    const title = readOverride(row, "title") || fileId;
    return { fileId, parentId: cell(row, "parentId"), title, artist: readOverride(row, "artist"),
      album: readOverride(row, "album"), composer: readOverride(row, "composer"), albumArtist: readOverride(row, "albumArtist"),
      genre: cell(row, "genre"), releaseYear: readOverride(row, "releaseYear"),
      discNumber: cell(row, "discNumber"), trackNumber: cell(row, "trackNumber") };
  });
}

export interface SongFilters { query?: string; artist?: string; album?: string; composer?: string; minYear?: number; maxYear?: number; includeUnknownYear: boolean; genre?: string; }
export function filterSongs(songs: Song[], filters: SongFilters): Song[] {
  const query = filters.query?.toLocaleLowerCase() ?? "";
  const artist = filters.artist?.toLocaleLowerCase() ?? "";
  const album = filters.album?.toLocaleLowerCase() ?? "";
  const composer = filters.composer?.toLocaleLowerCase() ?? "";
  const genre = filters.genre?.toLocaleLowerCase() ?? "";
  return songs.filter((song) => {
    if (query && ![song.title, song.artist, song.album, song.composer].some((value) => value.toLocaleLowerCase().includes(query))) return false;
    if (artist && !song.artist.toLocaleLowerCase().includes(artist)) return false;
    if (album && !song.album.toLocaleLowerCase().includes(album)) return false;
    if (composer && !song.composer.toLocaleLowerCase().includes(composer)) return false;
    if (genre && !song.genre.split(" / ").some((value) => value.trim().toLocaleLowerCase() === genre)) return false;
    const releaseYear = song.releaseYear.trim();
    const year = Number(releaseYear);
    if (releaseYear === "" || !Number.isFinite(year)) return filters.includeUnknownYear;
    return (filters.minYear === undefined || year >= filters.minYear) && (filters.maxYear === undefined || year <= filters.maxYear);
  });
}

// アーティスト/アルバム/作曲者/Genre欄のオートコンプリート候補（入力中のdatalist）用に、
// 索引から実際に使われている値だけを重複無く取り出す。スプレッドシートを見ないと
// 何が登録されているか分からない、という使いづらさへの対応（開発体制#39④）。
// genreは1曲に複数ジャンルが" / "区切りで入る（filterSongsの一致判定と同じ分割規則）ため、
// 個々のジャンル語として分解してから重複排除する。
export type AutocompleteField = "artist" | "album" | "composer" | "genre";
export function distinctFieldValues(songs: Song[], field: AutocompleteField): string[] {
  const values = new Set<string>();
  for (const song of songs) {
    const raw = song[field];
    const parts = field === "genre" ? raw.split(" / ") : [raw];
    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed) values.add(trimmed);
    }
  }
  return [...values].sort((a, b) => a.localeCompare(b));
}

const numeric = (v: string) => { const n = Number(v); return v.trim() !== "" && Number.isFinite(n) ? n : Number.POSITIVE_INFINITY; };
export function sortSongs(songs: Song[]): Song[] {
  return [...songs].sort((a, b) => numeric(a.releaseYear) - numeric(b.releaseYear) || a.artist.localeCompare(b.artist) ||
    a.album.localeCompare(b.album) || numeric(a.discNumber) - numeric(b.discNumber) || numeric(a.trackNumber) - numeric(b.trackNumber));
}

export interface AlbumGroup { album: string; albumArtist: string; songs: Song[]; }
export function groupSongsByAlbum(songs: Song[]): AlbumGroup[] {
  const groups = new Map<string, AlbumGroup>();
  for (const song of songs) {
    const album = song.album.trim();
    if (!album) continue;
    const albumArtist = song.albumArtist.trim() || song.artist.trim();
    const key = JSON.stringify([album, albumArtist, song.parentId]);
    const group = groups.get(key) ?? { album, albumArtist, songs: [] };
    group.songs.push(song);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((group) => ({ ...group, songs: [...group.songs].sort((a, b) => numeric(a.discNumber) - numeric(b.discNumber) || numeric(a.trackNumber) - numeric(b.trackNumber)) }))
    .sort((a, b) => a.album.localeCompare(b.album) || a.albumArtist.localeCompare(b.albumArtist));
}

// アルバム一覧を全件フラットに並べると探しにくい、という使いづらさへの対応（開発体制#39④UI-3）。
// アーティスト（albumArtist）別にまとめて表示するための見出し付きグルーピング。
export interface ArtistAlbumGroup { albumArtist: string; albums: AlbumGroup[]; }
export function groupAlbumsByArtist(groups: AlbumGroup[]): ArtistAlbumGroup[] {
  const byArtist = new Map<string, AlbumGroup[]>();
  for (const group of groups) {
    const albums = byArtist.get(group.albumArtist) ?? [];
    albums.push(group);
    byArtist.set(group.albumArtist, albums);
  }
  return [...byArtist.entries()]
    .map(([albumArtist, albums]) => ({ albumArtist, albums: [...albums].sort((a, b) => a.album.localeCompare(b.album)) }))
    .sort((a, b) => a.albumArtist.localeCompare(b.albumArtist));
}

// アルバム名・アーティスト名での絞り込み（部分一致、大文字小文字を区別しない）。
export function filterAlbumGroups(groups: AlbumGroup[], query: string): AlbumGroup[] {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return groups;
  return groups.filter((group) => group.album.toLocaleLowerCase().includes(q) || group.albumArtist.toLocaleLowerCase().includes(q));
}
