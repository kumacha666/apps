// アルバムの中身（トラック一覧）の表示用データ（R20、Android版の`core/AlbumDetail`に合わせた）。
// 収録曲の並びは`groupAlbumsForRack`で決まっている（ディスク番号→トラック番号の順）ので、ここでは各行の番号と補足を作るだけ。

import type { AlbumGroup } from "./catalog";
import { displayShelf, effectiveDisc, type RackSong } from "./albumRack";

/** トラック一覧の1行。numberはトラック番号の表記（何枚組なら「2-03」の形、番号が無ければ空）。artistは棚のアーティストと違うときだけ出す名前。 */
export interface AlbumTrack { song: RackSong; number: string; artist: string }

const finiteNumber = (value: string): number | null => {
  const n = Number(value);
  return value.trim() !== "" && Number.isFinite(n) ? n : null;
};

export function albumTracks(group: AlbumGroup): AlbumTrack[] {
  const songs = group.songs as RackSong[];
  const discs = new Set(songs.map((s) => effectiveDisc(s)).filter((d) => Number.isFinite(d)));
  const multiDisc = discs.size > 1;
  const shelf = displayShelf(group.albumArtist);
  return songs.map((song) => {
    const artist = song.artist.trim();
    return { song, number: trackNumberLabel(song, multiDisc), artist: artist && artist !== shelf ? artist : "" };
  });
}

function trackNumberLabel(song: RackSong, multiDisc: boolean): string {
  const track = finiteNumber(song.trackNumber);
  if (track === null) return "";
  const disc = effectiveDisc(song);
  return multiDisc && Number.isFinite(disc) ? `${Math.trunc(disc)}-${String(Math.trunc(track)).padStart(2, "0")}` : String(Math.trunc(track));
}

/** アルバムの補足（棚のアーティスト・曲数・発売年。年が複数なら範囲）。 */
export function albumSummary(group: AlbumGroup): string {
  const years = [...new Set(group.songs.map((s) => finiteNumber(s.releaseYear)).filter((y): y is number => y !== null).map((y) => Math.trunc(y)))].sort((a, b) => a - b);
  const year = years.length === 0 ? null : years.length === 1 ? `${years[0]}年` : `${years[0]}〜${years[years.length - 1]}年`;
  return [displayShelf(group.albumArtist), `${group.songs.length}曲`, year].filter((v): v is string => Boolean(v)).join("・");
}

/** アルバム一覧の1件を指す印（先頭の曲のfileId。同名のアルバムが別フォルダにあっても区別できる）。 */
export function albumOpenKey(group: AlbumGroup): string | null {
  return group.songs[0]?.fileId ?? null;
}
