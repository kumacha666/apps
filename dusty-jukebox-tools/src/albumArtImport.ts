// AIが探した表紙の候補を取り込む（画面・通信に依存しない部分）。
// 自動の収集で見つからなかったアルバムについて、AI（Claude）がWebで探した候補を、索引の`albumArtCandidates`タブに書く。
// このツールはその画像を取り、縮めてDriveへ置き、albumArtタブに記録する（どう見つけたかを`match`列に残す）。
// 取り込むのは、いまも「見つからない」ままのアルバムだけ（その後に手で入れた・外した表紙を上書きしない）。

import type { ArtAlbum } from "./albumArtAlbums";
import { ImageFetchError } from "./albumArtCollect";
import { albumArtKey, CANDIDATES_SHEET_NAME, isAiMatch, type AiMatch, type AlbumArtRecord } from "./albumArtSheet";

export { CANDIDATES_SHEET_NAME };
export const CANDIDATES_SHEET_HEADER = ["albumFolderId", "album", "imageUrl", "source", "sourceId", "match", "note"] as const;

const CANDIDATE_SOURCES = ["musicbrainz", "itunes", "deezer"] as const;
type CandidateSource = (typeof CANDIDATE_SOURCES)[number];

export interface ImportCandidate {
  albumFolderId: string;
  album: string;
  imageUrl: string;
  source: CandidateSource;
  sourceId: string;
  match: AiMatch;
  note: string;
}

/** 候補のタブの行（見出しを含む）→ 候補。見出しが違えば例外。形の合わない行は飛ばし、同じアルバムが重なれば先の行。 */
export function parseCandidateRows(values: readonly (readonly (string | number)[])[]): { candidates: ImportCandidate[]; skipped: number } {
  const [header, ...rows] = values;
  if (!header || !CANDIDATES_SHEET_HEADER.slice(0, 6).every((v, i) => String(header[i] ?? "").trim() === v)) {
    throw new Error(`「${CANDIDATES_SHEET_NAME}」タブの1行目が想定と違います。`);
  }
  const seen = new Set<string>();
  const candidates: ImportCandidate[] = [];
  let skipped = 0;
  for (const row of rows) {
    const s = (i: number) => String(row[i] ?? "").trim();
    const [albumFolderId, album, imageUrl, source, sourceId, match] = [s(0), s(1), s(2), s(3), s(4), s(5)];
    if (!albumFolderId && !album && !imageUrl) continue; // 空行
    const key = albumArtKey(albumFolderId, album);
    const ok =
      albumFolderId !== "" &&
      album !== "" &&
      /^https:\/\//i.test(imageUrl) &&
      (CANDIDATE_SOURCES as readonly string[]).includes(source) &&
      isAiMatch(match) &&
      !seen.has(key);
    if (!ok) {
      skipped += 1;
      continue;
    }
    seen.add(key);
    candidates.push({ albumFolderId, album, imageUrl, source: source as CandidateSource, sourceId, match, note: s(6) });
  }
  return { candidates, skipped };
}

/** 取り込む候補：いまも見つからない（画像の無い）アルバムだけ。記録の無いアルバム・既に表紙のあるアルバム・外したアルバムは入れない。 */
export function candidatesToImport(
  candidates: readonly ImportCandidate[],
  existing: ReadonlyMap<string, { record: AlbumArtRecord }>
): { candidate: ImportCandidate; record: AlbumArtRecord }[] {
  const items: { candidate: ImportCandidate; record: AlbumArtRecord }[] = [];
  for (const candidate of candidates) {
    const record = existing.get(albumArtKey(candidate.albumFolderId, candidate.album))?.record;
    if (record?.source === "notfound" && !record.artFileId) items.push({ candidate, record });
  }
  return items;
}

export interface ImportDeps {
  /** Webの画像を取る。無い（404等）ならnull、通信の失敗はImageFetchError。 */
  fetchImage(url: string): Promise<{ data: Uint8Array; format: string } | null>;
  makeThumbnail(data: Uint8Array, format: string): Promise<Blob | null>;
  upload(album: ArtAlbum, image: Blob): Promise<string>;
  now(): string;
}

/**
 * 1枚取り込む。画像が取れない・読めないときはnull（記録しない。見つからないままにする）。
 * Driveへの送信の失敗（認証など）は例外のまま返し、全体を止める（どの候補でも同じく失敗するため）。
 */
export async function importCandidate(item: { candidate: ImportCandidate; record: AlbumArtRecord }, deps: ImportDeps): Promise<AlbumArtRecord | null> {
  const { candidate, record } = item;
  let image: { data: Uint8Array; format: string } | null;
  try {
    image = await deps.fetchImage(candidate.imageUrl);
  } catch (err) {
    if (err instanceof ImageFetchError) return null;
    throw err;
  }
  if (!image) return null;
  const thumb = await deps.makeThumbnail(image.data, image.format);
  if (!thumb) return null;
  const artFileId = await deps.upload({ albumFolderId: record.albumFolderId, album: record.album, artist: record.artist, shelf: "artist", tracks: [] }, thumb);
  return { ...record, artFileId, source: candidate.source, sourceId: candidate.sourceId, match: candidate.match, updatedAt: deps.now() };
}
