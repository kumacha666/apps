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
