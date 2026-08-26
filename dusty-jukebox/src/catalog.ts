import { INDEX_SHEET_HEADER } from "./sheets";

export interface Song {
  fileId: string; parentId: string; title: string; artist: string; album: string; genre: string;
  releaseYear: string; discNumber: string; trackNumber: string; folderPath?: string;
}

type Row = (string | number)[];
const col = (name: (typeof INDEX_SHEET_HEADER)[number]) => INDEX_SHEET_HEADER.indexOf(name);
const cell = (row: Row, name: (typeof INDEX_SHEET_HEADER)[number]) => String(row[col(name)] ?? "").trim();

// 空欄は抽出値、(none) は明示的な空、その他は手動補正値。
export function readOverride(row: Row, field: "title" | "artist" | "album" | "releaseYear"): string {
  const override = cell(row, `${field}_override` as (typeof INDEX_SHEET_HEADER)[number]);
  return override === "" ? cell(row, field) : override === "(none)" ? "" : override;
}

export function parseIndexRows(rows: Row[]): Song[] {
  return rows.filter((row) => cell(row, "fileId") !== "").map((row) => {
    const fileId = cell(row, "fileId");
    const title = readOverride(row, "title") || fileId;
    return { fileId, parentId: cell(row, "parentId"), title, artist: readOverride(row, "artist"),
      album: readOverride(row, "album"), genre: cell(row, "genre"), releaseYear: readOverride(row, "releaseYear"),
      discNumber: cell(row, "discNumber"), trackNumber: cell(row, "trackNumber") };
  });
}

export interface SongFilters { artist?: string; minYear?: number; maxYear?: number; includeUnknownYear: boolean; genre?: string; }
export function filterSongs(songs: Song[], filters: SongFilters): Song[] {
  const artist = filters.artist?.toLocaleLowerCase() ?? "";
  const genre = filters.genre?.toLocaleLowerCase() ?? "";
  return songs.filter((song) => {
    if (artist && !song.artist.toLocaleLowerCase().includes(artist)) return false;
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
