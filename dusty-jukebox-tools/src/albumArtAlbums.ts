// アルバムアートの収集で使う、アルバムの一覧（索引の行＋foldersタブから作る）。
// 本体dusty-jukeboxのアルバム一覧（src/albumRack.tsのannotateAlbumFolders・groupAlbumsForRack・shelfOf）と
// 同じ分け方にする：「アルバム名（override優先）＋まとめる単位のフォルダ」が同じ曲を1枚とし、
// ディスクごとのフォルダ（CD1・Disc 2等）に入った曲はその上のフォルダでまとめる。
// 本体・アプリ版はこの2つ（albumFolderId・album）でalbumArtタブの行を引くので、分け方がずれると表紙が出ない。
// apps全体の方針でアプリ間のコード共有はしないため、本体から必要な部分だけを移植している。

import { INDEX_SHEET_HEADER } from "./sheets";

type Row = (string | number)[];
type Column = (typeof INDEX_SHEET_HEADER)[number];

const column = (name: Column) => INDEX_SHEET_HEADER.indexOf(name);
const cell = (row: Row, name: Column) => String(row[column(name)] ?? "").trim();

// 本体catalog.tsのreadOverride()と同じ規約：override優先、"(none)"は明示的な空、空欄なら抽出値。
function effective(row: Row, field: "album" | "albumArtist" | "artist"): string {
  const override = cell(row, `${field}_override` as Column);
  if (override === "(none)") return "";
  if (override !== "") return override;
  return cell(row, field);
}

/** foldersタブの1件。 */
export interface FolderInfo { name: string; parentId: string }

/** アルバムの1曲（表紙を読む順に並べるための番号を含む）。 */
export interface AlbumTrack { fileId: string; disc: number; track: number; modifiedTime: string }

export interface ArtAlbum {
  /** まとめる単位のフォルダ（albumArtタブのキーの1つ）。 */
  albumFolderId: string;
  /** アルバム名（override優先・前後の空白なし。albumArtタブのキーの1つ）。 */
  album: string;
  /** 棚（アルバムアーティスト → 半分を超える曲のアーティスト）。オムニバス・不明なら空。Webで探すときに使う。 */
  artist: string;
  /** 棚の種類：アーティスト・オムニバス（曲ごとにアーティストが違う）・不明（アーティストのタグが無い）。 */
  shelf: "artist" | "various" | "unknown";
  /** ディスク→トラックの順。 */
  tracks: AlbumTrack[];
}

// `CD1`・`CD 2`・`Disc-3`・`DISK04`・`ディスク1`など（本体albumRack.tsと同じ）。
const DISC = /^(?:cd|disc|disk|ディスク)\s*[-_.#]?\s*0*(\d{1,2})(?!\d)/i;
export function discNumberFromFolderName(folderName: string): number | undefined {
  const m = DISC.exec(folderName.trim());
  return m ? Number(m[1]) : undefined;
}

const numeric = (v: string) => {
  const n = Number(v);
  return v.trim() !== "" && Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
};

function mostCommon(values: string[]): [string, number] | undefined {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: [string, number] | undefined;
  for (const [v, n] of counts) if (!best || n > best[1]) best = [v, n];
  return best;
}

/** 索引の行からアルバムの一覧を作る（アルバム名の無い曲・fileIdの無い行は入れない）。 */
export function buildArtAlbums(rows: readonly Row[], folders: ReadonlyMap<string, FolderInfo>): ArtAlbum[] {
  const groups = new Map<string, { album: string; albumFolderId: string; members: { row: Row; disc: number; track: number }[] }>();
  const seen = new Set<string>();
  for (const row of rows) {
    const fileId = cell(row, "fileId");
    const album = effective(row, "album");
    if (!fileId || !album || seen.has(fileId)) continue;
    seen.add(fileId);
    const parentId = cell(row, "parentId");
    const folder = folders.get(parentId);
    const discFromFolder = folder && folder.parentId !== "" ? discNumberFromFolderName(folder.name) : undefined;
    const albumFolderId = discFromFolder !== undefined ? folder!.parentId : parentId;
    const taggedDisc = numeric(cell(row, "discNumber"));
    const disc = Number.isFinite(taggedDisc) ? taggedDisc : discFromFolder ?? Number.POSITIVE_INFINITY;
    const key = JSON.stringify([album, albumFolderId]);
    let group = groups.get(key);
    if (!group) groups.set(key, (group = { album, albumFolderId, members: [] }));
    group.members.push({ row, disc, track: numeric(cell(row, "trackNumber")) });
  }
  return [...groups.values()].map(({ album, albumFolderId, members }) => {
    members.sort((a, b) => a.disc - b.disc || a.track - b.track);
    const albumArtist = mostCommon(members.map((m) => effective(m.row, "albumArtist")).filter((v) => v !== ""));
    const artist = mostCommon(members.map((m) => effective(m.row, "artist")).filter((v) => v !== ""));
    const name = albumArtist ? albumArtist[0] : artist && artist[1] * 2 > members.length ? artist[0] : "";
    return {
      albumFolderId,
      album,
      artist: name,
      shelf: name ? "artist" : artist ? "various" : "unknown",
      tracks: members.map((m) => ({ fileId: cell(m.row, "fileId"), disc: m.disc, track: m.track, modifiedTime: cell(m.row, "driveModifiedTime") })),
    };
  });
}

/** 表紙を読みに行く曲：最初の曲、無ければ最後の曲も（1曲目にだけ画像が無いアルバムがあるため）。 */
export function coverCandidateTracks(album: ArtAlbum): AlbumTrack[] {
  const first = album.tracks[0];
  const last = album.tracks[album.tracks.length - 1];
  if (!first) return [];
  return last && last.fileId !== first.fileId ? [first, last] : [first];
}

/** foldersタブの行（folderId, name, parentId）→ 対応表。 */
export function parseFolderRows(rows: readonly Row[]): Map<string, FolderInfo> {
  const map = new Map<string, FolderInfo>();
  for (const row of rows) {
    const id = String(row[0] ?? "").trim();
    if (id) map.set(id, { name: String(row[1] ?? ""), parentId: String(row[2] ?? "").trim() });
  }
  return map;
}
