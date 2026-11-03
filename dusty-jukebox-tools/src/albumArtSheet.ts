// albumArtタブ：アルバムごとの表紙の記録（このツールだけが書き、本体dusty-jukebox・アプリ版が読む）。
// 1アルバム＝1行。キーは albumFolderId＋album（本体のアルバム一覧の1件と同じ単位、albumArtAlbums.ts）。
//
// - embedded：曲のファイルに表紙が埋め込まれているか（yes / no。読めなかったら空）
// - artFileId：Driveに置いた表紙の小さな画像（埋め込みがあればそれを縮めたもの、無ければWebから補完したもの）
// - source：embedded / musicbrainz / itunes / notfound（Webで見つからない）/ error（読めなかった・取れなかった。次回やり直す）
//   / rejected（確認画面で「外す」を選んだ。表紙なしのまま、次回も集め直さない）
//   / deezer（AIが探した候補から取り込んだもの。AIの候補はmusicbrainz・itunesのこともある）
// - sourceId：取得元のID（MusicBrainzのrelease-group ID、iTunesのcollectionId、DeezerのアルバムID）
// - checkedFileId：表紙を読んだ曲
// - match：どう見つけたか（空＝このツールが自動で集めた、ai-exact / ai-variant / ai-close / ai-guess＝AIが探した候補を取り込んだ
//   〈下ほど見つけにくかった＝間違っている可能性が高い〉、manual＝確認画面で選んだ）。2026-11-03に足した10列目
//   （それまでの9列のタブは、開いたときに見出しを足す。本体・アプリ版は先頭9列だけを読む）

import { sheetRange } from "./lib";
import { columnLetter, createSheetsFetch } from "./sheets";

/** AIが探した表紙の候補のタブ（albumArtImport.ts）。 */
export const CANDIDATES_SHEET_NAME = "albumArtCandidates";

export const ALBUM_ART_SHEET_NAME = "albumArt";
export const ALBUM_ART_SHEET_HEADER = [
  "albumFolderId",
  "album",
  "artist",
  "embedded",
  "artFileId",
  "source",
  "sourceId",
  "checkedFileId",
  "updatedAt",
  "match",
] as const;
/** 2026-11-03より前の見出し（match列が無い）。 */
const LEGACY_HEADER_LENGTH = 9;

export const ART_SOURCES = ["embedded", "musicbrainz", "itunes", "deezer", "notfound", "error", "rejected"] as const;
export type ArtSource = (typeof ART_SOURCES)[number];

/** AIが探した候補の確からしさ（下ほど見つけにくかった＝間違っている可能性が高い）。 */
export const AI_MATCHES = ["ai-exact", "ai-variant", "ai-close", "ai-guess"] as const;
export type AiMatch = (typeof AI_MATCHES)[number];
export type ArtMatch = "" | AiMatch | "manual";
export function isAiMatch(value: string): value is AiMatch {
  return (AI_MATCHES as readonly string[]).includes(value);
}

export interface AlbumArtRecord {
  albumFolderId: string;
  album: string;
  artist: string;
  embedded: "yes" | "no" | "";
  artFileId: string;
  source: ArtSource;
  sourceId: string;
  checkedFileId: string;
  updatedAt: string;
  match: ArtMatch;
}

export function isValidAlbumArtHeader(header: readonly (string | number)[]): boolean {
  return header.length >= ALBUM_ART_SHEET_HEADER.length && ALBUM_ART_SHEET_HEADER.every((v, i) => header[i] === v);
}

/** match列を足す前の見出し（先頭9列だけが一致し、10列目が空）。 */
export function isLegacyAlbumArtHeader(header: readonly (string | number)[]): boolean {
  return (
    ALBUM_ART_SHEET_HEADER.slice(0, LEGACY_HEADER_LENGTH).every((v, i) => header[i] === v) &&
    header.slice(LEGACY_HEADER_LENGTH).every((v) => String(v).trim() === "")
  );
}

export const albumArtKey = (albumFolderId: string, album: string) => JSON.stringify([albumFolderId, album.trim()]);

const asSource = (v: string): ArtSource => ((ART_SOURCES as readonly string[]).includes(v) ? (v as ArtSource) : "error");
const asEmbedded = (v: string): AlbumArtRecord["embedded"] => (v === "yes" || v === "no" ? v : "");
const asMatch = (v: string): ArtMatch => (isAiMatch(v) || v === "manual" ? v : "");

/** タブの行（ヘッダーを除く）→ キーごとの記録と行番号（シート上の行番号、2始まり）。同じキーが重なれば先の行を使う。 */
export function parseAlbumArtRows(rows: readonly (string | number)[][]): Map<string, { rowNumber: number; record: AlbumArtRecord }> {
  const map = new Map<string, { rowNumber: number; record: AlbumArtRecord }>();
  rows.forEach((row, i) => {
    const s = (index: number) => String(row[index] ?? "").trim();
    const albumFolderId = s(0);
    const album = s(1);
    if (!albumFolderId || !album) return;
    const key = albumArtKey(albumFolderId, album);
    if (map.has(key)) return;
    map.set(key, {
      rowNumber: i + 2,
      record: {
        albumFolderId,
        album,
        artist: s(2),
        embedded: asEmbedded(s(3)),
        artFileId: s(4),
        source: asSource(s(5)),
        sourceId: s(6),
        checkedFileId: s(7),
        updatedAt: s(8),
        match: asMatch(s(9)),
      },
    });
  });
  return map;
}

export function albumArtRow(record: AlbumArtRecord): string[] {
  return [
    record.albumFolderId,
    record.album,
    record.artist,
    record.embedded,
    record.artFileId,
    record.source,
    record.sourceId,
    record.checkedFileId,
    record.updatedAt,
    record.match,
  ];
}

/** もう一度やらなくてよい記録か（読めなかった・取れなかったものだけやり直す）。 */
export function isSettled(record: AlbumArtRecord | undefined): boolean {
  return record !== undefined && record.source !== "error";
}

export type AlbumArtSummary = Record<ArtSource, number>;

export function summarize(records: Iterable<AlbumArtRecord>): AlbumArtSummary {
  const summary: AlbumArtSummary = { embedded: 0, musicbrainz: 0, itunes: 0, deezer: 0, notfound: 0, error: 0, rejected: 0 };
  for (const r of records) summary[r.source] += 1;
  return summary;
}

export interface AlbumArtSheetIO {
  /** タブが無ければ作り、ヘッダーを書く。別の内容のタブがあればエラー。 */
  ensureTab(): Promise<void>;
  readRows(): Promise<(string | number)[][]>;
  appendRows(rows: string[][]): Promise<void>;
  updateRows(updates: { rowNumber: number; row: string[] }[]): Promise<void>;
  /** foldersタブ（無ければ空）。 */
  readFolderRows(): Promise<(string | number)[][]>;
  /** AIが探した候補のタブ（見出しを含む。無ければnull）。 */
  readCandidateRows(): Promise<(string | number)[][] | null>;
}

export function createAlbumArtSheetIO(spreadsheetId: string, getAccessToken: () => Promise<string>): AlbumArtSheetIO {
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}`;
  const sheetsFetch = createSheetsFetch(spreadsheetId, getAccessToken);
  const lastCol = columnLetter(ALBUM_ART_SHEET_HEADER.length);
  const readValues = async (range: string) => {
    const res = await sheetsFetch(`${base}/values/${encodeURIComponent(range)}`);
    return ((await res.json()) as { values?: (string | number)[][] }).values ?? [];
  };
  const listSheetTitles = async () => {
    const res = await sheetsFetch(`${base}?fields=${encodeURIComponent("sheets.properties.title")}`);
    const data = (await res.json()) as { sheets?: { properties?: { title?: string } }[] };
    return (data.sheets ?? []).map((s) => s.properties?.title ?? "");
  };
  return {
    async ensureTab() {
      if (!(await listSheetTitles()).includes(ALBUM_ART_SHEET_NAME)) {
        await sheetsFetch(`${base}:batchUpdate`, {
          method: "POST",
          body: JSON.stringify({ requests: [{ addSheet: { properties: { title: ALBUM_ART_SHEET_NAME } } }] }),
        });
      }
      const header = (await readValues(sheetRange(ALBUM_ART_SHEET_NAME, "1:1")))[0] ?? [];
      if (header.length > 0 && header.length <= LEGACY_HEADER_LENGTH && isLegacyAlbumArtHeader(header)) {
        // match列を足す前のタブ：見出しを足すだけ（既存の行のmatchは空＝自動で集めた）
        await sheetsFetch(`${base}/values/${encodeURIComponent(sheetRange(ALBUM_ART_SHEET_NAME, `A1:${lastCol}1`))}?valueInputOption=RAW`, {
          method: "PUT",
          body: JSON.stringify({ values: [[...ALBUM_ART_SHEET_HEADER]] }),
        });
      } else if (header.length === 0) {
        await sheetsFetch(`${base}/values/${encodeURIComponent(sheetRange(ALBUM_ART_SHEET_NAME, `A1:${lastCol}1`))}?valueInputOption=RAW`, {
          method: "PUT",
          body: JSON.stringify({ values: [[...ALBUM_ART_SHEET_HEADER]] }),
        });
      } else if (!isValidAlbumArtHeader(header)) {
        throw new Error(`「${ALBUM_ART_SHEET_NAME}」タブの1行目が想定と違います。別の用途のタブなら名前を変えてください。`);
      }
    },
    async readRows() {
      return readValues(sheetRange(ALBUM_ART_SHEET_NAME, `A2:${lastCol}`));
    },
    async appendRows(rows) {
      if (rows.length === 0) return;
      await sheetsFetch(
        `${base}/values/${encodeURIComponent(sheetRange(ALBUM_ART_SHEET_NAME, "A1"))}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
        { method: "POST", body: JSON.stringify({ values: rows }) }
      );
    },
    async updateRows(updates) {
      if (updates.length === 0) return;
      await sheetsFetch(`${base}/values:batchUpdate`, {
        method: "POST",
        body: JSON.stringify({
          valueInputOption: "RAW",
          data: updates.map(({ rowNumber, row }) => ({
            range: sheetRange(ALBUM_ART_SHEET_NAME, `A${rowNumber}:${lastCol}${rowNumber}`),
            values: [row],
          })),
        }),
      });
    },
    async readFolderRows() {
      if (!(await listSheetTitles()).includes("folders")) return [];
      return readValues(sheetRange("folders", "A2:C"));
    },
    async readCandidateRows() {
      if (!(await listSheetTitles()).includes(CANDIDATES_SHEET_NAME)) return null;
      return readValues(sheetRange(CANDIDATES_SHEET_NAME, "A1:G"));
    },
  };
}
