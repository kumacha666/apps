// タグ解析ロジック（catalog-script/src/lib.js からの移植）。
// CONCEPT.md 3.2節: Driveが報告するmimeTypeは信用できない（.m4aがvideo/mp4になる等）ため、
// タグパーサーへのヒントは拡張子から自前で推定する。ファイル発見もmimeTypeではなく拡張子ベースで行う。

const EXTENSION_MIME_TYPES: Record<string, string> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  alac: "audio/mp4",
  flac: "audio/flac",
  wav: "audio/wav",
  aac: "audio/aac",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/opus",
  wma: "audio/x-ms-wma",
  aiff: "audio/aiff",
  aif: "audio/aiff",
};

export const AUDIO_EXTENSIONS = new Set(Object.keys(EXTENSION_MIME_TYPES));

export function getExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  if (dot === -1 || dot === fileName.length - 1) return "";
  return fileName.slice(dot + 1).toLowerCase();
}

export function isAudioFile(fileName: string): boolean {
  return AUDIO_EXTENSIONS.has(getExtension(fileName));
}

export function guessMimeType(fileName: string): string | undefined {
  return EXTENSION_MIME_TYPES[getExtension(fileName)];
}

// タイトルタグが無い場合のフォールバック（CONCEPT.md 3.3/4.4節）。indexスキーマには
// 元のファイル名を保存する列が無いため、タグ抽出に失敗した・またはtitleタグが空だった行を
// fileId以外で識別する手段が無くなってしまう（2026-08-20 Codexレビュー指摘）。拡張子を
// 除いたファイル名を暫定タイトルとして使う。
export function deriveFallbackTitle(fileName: string): string {
  const ext = getExtension(fileName);
  return ext ? fileName.slice(0, -(ext.length + 1)) : fileName;
}

// A1記法のシート名はスペース・アポストロフィ等を含む場合クォートが必須
export function sheetRange(sheetName: string, cell: string): string {
  const quoted = `'${sheetName.replace(/'/g, "''")}'`;
  return `${quoted}!${cell}`;
}

// CONCEPT.md 3.3/3.4節: 一部日本語タイトルで文字化けを確認済み。
// UTF-8のJIS系文字列をShift_JIS/EUC-JP等で誤デコードした際に頻出する文字（いわゆる「文字化けマーカー」）と、
// デコード失敗を示すU+FFFDの出現を検出する簡易ヒューリスティック。完全な判定ではなく「要目視確認」フラグ用途。
const MOJIBAKE_MARKERS = ["縺", "繧", "繝", "蟲", "繹", "荳", "隱"];
// buildRow()は1ファイルあたり最大5回detectGarbled()を呼ぶため、10235件規模のスキャンでは
// マーカーごとのRegExpを毎回newすると数十万回のコンパイルが走る。固定のマーカー集合なので
// モジュールロード時に1度だけコンパイルして使い回す。
const MOJIBAKE_MARKER_REGEXES = MOJIBAKE_MARKERS.map((marker) => new RegExp(marker, "g"));

export function detectGarbled(text: string | undefined | null): boolean {
  if (!text) return false;
  if (text.includes("�")) return true;
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(text)) return true;
  // 出現「種類数」ではなく出現「回数」の合計で数える。同じマーカー文字が連続する
  // 典型的な文字化け（例: 縺薙ｓ縺ｫ縺｡縺ｯ）を、種類数ベースだと1種類しかヒットせず
  // 見逃してしまうため（閾値2は、通常の日本語文章にマーカー文字が単発で
  // 紛れ込むだけでは誤検出しないようにするためのもの）
  let markerHits = 0;
  for (const regex of MOJIBAKE_MARKER_REGEXES) {
    const matches = text.match(regex);
    if (matches) markerHits += matches.length;
  }
  return markerHits >= 2;
}

export const SHEET_HEADER = [
  "fileId",
  "fileName",
  "extension",
  "folderPath",
  "parentFolderId",
  "sizeBytes",
  "driveMimeType",
  "tagArtist",
  "tagTitle",
  "tagAlbum",
  "tagAlbumArtist",
  "tagComposer",
  "tagGenre",
  "tagYear",
  "tagTrackNo",
  "tagDiscNo",
  "copyrightNote",
  "garbledSuspect",
  "parseError",
  "scannedAt",
] as const;

// tags: music-metadataのcommonブロック相当（呼び出し側でnullを許容）
export interface DriveFileLike {
  id: string;
  name: string;
  size?: string | number;
  mimeType?: string;
}

export interface CommonTagsLike {
  artist?: string;
  title?: string;
  album?: string;
  albumartist?: string;
  composer?: string | string[];
  genre?: string | string[];
  year?: string | number;
  track?: { no?: string | number | null };
  disk?: { no?: string | number | null };
  copyright?: string;
}

export interface BuildRowArgs {
  file: DriveFileLike;
  folderPath: string;
  parentFolderId: string;
  tags: CommonTagsLike | null | undefined;
  parseErrorMessage: string;
  scannedAtIso: string;
}

export function buildRow({ file, folderPath, parentFolderId, tags, parseErrorMessage, scannedAtIso }: BuildRowArgs): (string | number)[] {
  const artist = tags?.artist ?? "";
  const title = tags?.title ?? "";
  const album = tags?.album ?? "";
  const albumArtist = tags?.albumartist ?? "";
  const composer = Array.isArray(tags?.composer) ? tags.composer.join(" / ") : (tags?.composer ?? "");
  const genre = Array.isArray(tags?.genre) ? tags.genre.join(" / ") : (tags?.genre ?? "");
  const year = tags?.year ?? "";
  const trackNo = tags?.track?.no ?? "";
  const discNo = tags?.disk?.no ?? "";
  const copyrightNote = tags?.copyright ?? "";

  const garbledSuspect = [artist, title, album, albumArtist, composer].some((v) => detectGarbled(String(v)));

  return [
    file.id,
    file.name,
    getExtension(file.name),
    folderPath,
    parentFolderId,
    file.size ?? "",
    file.mimeType ?? "",
    artist,
    title,
    album,
    albumArtist,
    composer,
    genre,
    year,
    trackNo,
    discNo,
    copyrightNote,
    garbledSuspect ? "TRUE" : "FALSE",
    parseErrorMessage ?? "",
    scannedAtIso,
  ];
}

// Rangeリクエスト方式の検証（verify-range.js相当）用: 実際に抽出されたタグ由来の値だけを比較したい列
// （fileId/folderPath/scannedAt等、抽出方式に関係ない列は比較対象から除く）
export const COMPARABLE_TAG_FIELDS = [
  "tagArtist",
  "tagTitle",
  "tagAlbum",
  "tagAlbumArtist",
  "tagComposer",
  "tagGenre",
  "tagYear",
  "tagTrackNo",
  "tagDiscNo",
  "copyrightNote",
] as const;

export interface TagDiff {
  field: string;
  expected: string;
  actual: string;
}

// buildRow()が返す行同士（同じSHEET_HEADER順）を、タグ抽出結果に関わる列だけ比較する。
// 差分があったフィールドを{field, expected, actual}の配列で返す（空配列なら完全一致）。
//
// expectedRow（スプレッドシートからvalues.getで読み戻した行）はSheets APIの既定表示形式で
// 数値セルを文字列化して返す一方、actualRow（buildRow()の直接の戻り値）はyear/trackNo/discNoが
// music-metadata由来の数値のまま入っている。素の!==比較だと"1994"と1994のような正しい抽出結果まで
// 不一致扱いになってしまうため、両辺を文字列化してから比較する。
export function diffTagRows(expectedRow: (string | number)[], actualRow: (string | number)[]): TagDiff[] {
  const diffs: TagDiff[] = [];
  for (const field of COMPARABLE_TAG_FIELDS) {
    const idx = SHEET_HEADER.indexOf(field);
    const expected = String(expectedRow[idx] ?? "");
    const actual = String(actualRow[idx] ?? "");
    if (expected !== actual) {
      diffs.push({ field, expected, actual });
    }
  }
  return diffs;
}
