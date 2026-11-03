import type { BrowserContext, Route } from "@playwright/test";
import { INDEX_SHEET_HEADER, LEGACY_INDEX_SHEET_HEADER_V3 } from "../src/sheets";

const TOKEN = "e2e-token";

export type MockOptions = {
  /** Seed the index tab with these rows instead of the small default fixture. */
  rows?: (string | number)[][];
  /** Serve an index tab whose header row does not match INDEX_SHEET_HEADER. */
  invalidHeader?: boolean;
  /** Use the current schema (including genre_override) instead of the legacy readable schema. */
  currentHeader?: boolean;
  /** アルバムアート：表紙が埋め込まれた曲のfileId（それ以外の曲は表紙の無い小さなMP3を返す）。 */
  coverArtFileIds?: string[];
  /** アルバムアート：foldersタブの行（folderId, name, parentId）。 */
  folderRows?: string[][];
  /** アルバムアート：albumArtタブの最初の中身（ヘッダー行を含む）。 */
  albumArtRows?: (string | number)[][];
};

// ID3v2.3のAPICフレーム（表紙、1×1のPNG）＋MPEGフレーム3つの小さなMP3（本体dusty-jukeboxのe2e/google-mocks.tsと同じ）。
const COVER_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const MPEG_FRAME = (() => {
  const frame = Buffer.alloc(417);
  frame.set([0xff, 0xfb, 0x90, 0x64]);
  return frame;
})();
function coverArtMp3(): Buffer {
  const synchsafe = (n: number) => Buffer.from([(n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f]);
  const body = Buffer.concat([Buffer.from([0]), Buffer.from("image/png\0", "latin1"), Buffer.from([3, 0]), COVER_PNG]);
  const frameHeader = Buffer.alloc(10);
  frameHeader.write("APIC", 0, "latin1");
  frameHeader.writeUInt32BE(body.length, 4);
  const frames = Buffer.concat([frameHeader, body]);
  const tag = Buffer.concat([Buffer.from("ID3\x03\x00\x00", "latin1"), synchsafe(frames.length), frames]);
  return Buffer.concat([tag, MPEG_FRAME, MPEG_FRAME, MPEG_FRAME]);
}
const COVER_ART_MP3 = coverArtMp3();
const PLAIN_MP3 = Buffer.concat([MPEG_FRAME, MPEG_FRAME, MPEG_FRAME]);
export const ALBUM_ART_TEST_PNG = COVER_PNG;

/**
 * dusty-jukebox本体のe2e/google-mocks.tsを参考にした、このアプリ用の簡略版。
 * GIS・Sheets API（indexタブの読み取りと対象セル単体の書き込み、albumArt・foldersタブ）をモックする。
 * アルバムアートの収集のため、Drive（曲のファイルの読み出し・フォルダ・画像の保存）とWeb検索（MusicBrainz・iTunes・Cover Art Archive）もモックする。
 */
export async function installGoogleMocks(context: BrowserContext, options: MockOptions = {}) {
  const defaultRows: (string | number)[][] = [
    INDEX_SHEET_HEADER.map((h) => (h === "fileId" ? "song-1" : h === "title" ? "First song" : h === "artist" ? "Artist" : "")),
    INDEX_SHEET_HEADER.map((h) => (h === "fileId" ? "song-2" : h === "title" ? "Second song" : h === "artist" ? "Artist" : "")),
  ];
  let indexRows: (string | number)[][] = options.rows ?? defaultRows;
  // 実運用でスキャン前に残る直前の46列ヘッダーを既定にし、全機能が読み取り時に
  // マイグレーションやヘッダー書き込みを要求しないことをブラウザ経路で検証する。
  const header: (string | number)[] = options.invalidHeader
    ? ["wrong", "header"]
    : [...(options.currentHeader ? INDEX_SHEET_HEADER : LEGACY_INDEX_SHEET_HEADER_V3)];

  const authFailures: string[] = [];
  // アルバムアート：albumArtタブ（無ければnull）・Driveに置いた画像・Webへの問い合わせ
  let albumArtRows: (string | number)[][] | null = options.albumArtRows ?? null;
  const driveTrashed: string[] = [];
  // 画像の送信を受けた直後に呼ぶ（送信中にスプレッドシートが変わる場合を作るため）
  let uploadHook: (() => void) | null = null;
  const driveUploads: { name: string; parents: string[] }[] = [];
  const driveFolders: string[] = [];
  const webRequests: string[] = [];
  const sheetsWrites: { range: string; value: string | number }[] = [];
  const sheetsReadRanges: string[] = [];

  const json = (route: Route, value: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) });
  const requireToken = (route: Route) => {
    if (route.request().headers().authorization === `Bearer ${TOKEN}`) return true;
    authFailures.push(route.request().url());
    void json(route, { error: { message: "missing fake bearer token" } }, 401);
    return false;
  };

  await context.route("https://accounts.google.com/gsi/client", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `window.google={accounts:{oauth2:{initTokenClient:(config)=>{const client={...config};client.requestAccessToken=()=>client.callback({access_token:'${TOKEN}',expires_in:3600,scope:client.scope});return client;}}}};`,
    })
  );

  await context.route("https://sheets.googleapis.com/**", async (route) => {
    if (!requireToken(route)) return;
    const url = decodeURIComponent(route.request().url());
    const method = route.request().method();

    // アルバムアート：タブの一覧・albumArtタブの作成と読み書き・foldersタブ
    if (url.includes("?fields=sheets.properties.title")) {
      const titles = ["index", ...(options.folderRows ? ["folders"] : []), ...(albumArtRows ? ["albumArt"] : [])];
      return json(route, { sheets: titles.map((title) => ({ properties: { title } })) });
    }
    if (url.endsWith(":batchUpdate") && !url.includes("values:batchUpdate") && method === "POST") {
      albumArtRows = [];
      return json(route, {});
    }
    if (url.includes("values/'folders'!")) return json(route, { values: options.folderRows ?? [] });
    if (url.includes("values/'albumArt'!")) {
      const rows = albumArtRows ?? [];
      if (url.includes(":append")) {
        const body = JSON.parse(route.request().postData() ?? "{}") as { values: (string | number)[][] };
        rows.push(...body.values);
        return json(route, {});
      }
      if (method === "PUT") {
        const body = JSON.parse(route.request().postData() ?? "{}") as { values: (string | number)[][] };
        rows[0] = body.values[0];
        return json(route, {});
      }
      if (url.includes("!1:1")) return json(route, { values: rows[0] ? [rows[0]] : [] });
      return json(route, { values: rows.slice(1) });
    }
    if (url.includes("values:batchUpdate") && route.request().postData()?.includes("'albumArt'!")) {
      const body = JSON.parse(route.request().postData() ?? "{}") as { data: { range: string; values: (string | number)[][] }[] };
      for (const update of body.data) {
        const rowNumber = Number(update.range.match(/!A(\d+):/)?.[1]);
        (albumArtRows ?? [])[rowNumber - 1] = update.values[0];
      }
      return json(route, {});
    }

    if (url.includes("values/") && (url.includes("1:1") || url.includes("A1:"))) {
      return json(route, { values: [header] });
    }
    if (url.includes("values/") && method === "GET") {
      const range = url.split("values/")[1]?.split("?")[0] ?? "";
      sheetsReadRanges.push(range);
      const requestedColumns = requestedColumnCount(range);
      if (requestedColumns !== undefined && requestedColumns > header.length) {
        return json(route, { error: { message: `Range exceeds grid limits: ${requestedColumns} > ${header.length}` } }, 400);
      }
      const requestedRows = requestedRowCount(range);
      const gridRows = Math.max(1000, indexRows.length + 1);
      if (requestedRows !== undefined && requestedRows > gridRows) {
        return json(route, { error: { message: `Range exceeds grid limits: ${requestedRows} > ${gridRows}` } }, 400);
      }
      const dataRows = indexRows.map((row) => row.slice(0, header.length));
      return json(route, { values: range.includes("!") ? dataRows : [header, ...dataRows] });
    }
    if (url.includes("values:batchUpdate") && method === "POST") {
      const body = JSON.parse(route.request().postData() ?? "{}") as {
        data?: { range?: string; values?: (string | number)[][] }[];
      };
      for (const update of body.data ?? []) {
        const match = update.range?.match(/^'?([^'!]+)'?!([A-Z]+)(\d+)/);
        const value = update.values?.[0]?.[0];
        if (!match || value === undefined) continue;
        sheetsWrites.push({ range: update.range ?? "", value });
        const columnIndex = columnLettersToIndex(match[2]);
        const rowIndex = Number(match[3]) - 2;
        const row = (indexRows[rowIndex] ??= new Array(INDEX_SHEET_HEADER.length).fill(""));
        row[columnIndex] = value;
      }
      return json(route, { totalUpdatedRows: body.data?.length ?? 0 });
    }
    return json(route, {});
  });

  // アルバムアート：Drive（曲のファイルの読み出し・フォルダ・画像の保存）
  await context.route("https://www.googleapis.com/**", async (route) => {
    if (!requireToken(route)) return;
    const url = new URL(route.request().url());
    const method = route.request().method();
    if (url.pathname === "/upload/drive/v3/files" && method === "POST") {
      const body = route.request().postDataBuffer()?.toString("latin1") ?? "";
      const metadata = JSON.parse(body.slice(body.indexOf("{"), body.indexOf("}\r\n") + 1)) as { name: string; parents: string[] };
      driveUploads.push(metadata);
      uploadHook?.();
      return json(route, { id: `art-${driveUploads.length}` });
    }
    if (url.pathname === "/drive/v3/files" && method === "GET") {
      return json(route, { files: driveFolders.map((id) => ({ id })) });
    }
    if (url.pathname === "/drive/v3/files" && method === "POST") {
      driveFolders.push(`folder-${driveFolders.length + 1}`);
      return json(route, { id: driveFolders[driveFolders.length - 1] });
    }
    const fileId = decodeURIComponent(url.pathname.split("/").pop() ?? "");
    if (method === "PATCH") {
      driveTrashed.push(fileId);
      return json(route, { id: fileId });
    }
    // このツールが置いた表紙（art-で始まる）は画像を返す
    if (fileId.startsWith("art-") && url.searchParams.get("alt") === "media") {
      return route.fulfill({ status: 200, contentType: "image/png", body: COVER_PNG });
    }
    const media = options.coverArtFileIds?.includes(fileId) ? COVER_ART_MP3 : PLAIN_MP3;
    if (url.searchParams.get("alt") === "media") {
      const range = /bytes=(\d+)-(\d+)/.exec(route.request().headers().range ?? "");
      const start = range ? Number(range[1]) : 0;
      const end = range ? Math.min(Number(range[2]), media.length - 1) : media.length - 1;
      return route.fulfill({
        status: 206,
        contentType: "audio/mpeg",
        body: media.subarray(start, end + 1),
        headers: { "Content-Range": `bytes ${start}-${end}/${media.length}`, "Accept-Ranges": "bytes" },
      });
    }
    return json(route, { size: String(media.length), mimeType: "audio/mpeg" });
  });

  // アルバムアート：Webの検索（MusicBrainz・iTunes）と画像。"Found"という名前のアルバムだけMusicBrainzに表紙がある
  await context.route(/https:\/\/(musicbrainz\.org|itunes\.apple\.com|coverartarchive\.org)\/.*/, async (route) => {
    const url = decodeURIComponent(route.request().url());
    webRequests.push(url);
    const cors = { "Access-Control-Allow-Origin": "*" };
    if (url.startsWith("https://musicbrainz.org/")) {
      const groups = url.includes('releasegroup:"Found"')
        ? [{ id: "rg-found", title: "Found", score: 100, "artist-credit": [{ name: "Web Artist" }] }]
        : url.includes('releasegroup:"Candidate Me')
          ? [{ id: "rg-cand", title: "Candidate Me (Deluxe)", score: 70, "artist-credit": [{ name: "Someone" }] }]
          : [];
      return route.fulfill({ status: 200, contentType: "application/json", headers: cors, body: JSON.stringify({ "release-groups": groups }) });
    }
    if (url.startsWith("https://itunes.apple.com/")) {
      return route.fulfill({ status: 200, contentType: "application/json", headers: cors, body: JSON.stringify({ results: [] }) });
    }
    return route.fulfill({ status: 200, contentType: "image/png", headers: cors, body: COVER_PNG });
  });

  return {
    driveUploads,
    driveFolders,
    webRequests,
    driveTrashed,
    getAlbumArtRows: () => albumArtRows,
    setAlbumArtRows: (rows: (string | number)[][]) => {
      albumArtRows = rows;
    },
    setUploadHook: (hook: (() => void) | null) => {
      uploadHook = hook;
    },
    authFailures,
    sheetsWrites,
    sheetsReadRanges,
    getIndexRows: () => indexRows,
    setIndexRows: (rows: (string | number)[][]) => {
      indexRows = rows;
    },
  };
}

function columnLettersToIndex(letters: string): number {
  let index = 0;
  for (const ch of letters) index = index * 26 + (ch.charCodeAt(0) - 64);
  return index - 1;
}

function requestedColumnCount(range: string): number | undefined {
  const a1 = range.split("!")[1];
  const match = a1?.match(/^[A-Z]+\d*:\s*([A-Z]+)/);
  return match ? columnLettersToIndex(match[1]) + 1 : undefined;
}

function requestedRowCount(range: string): number | undefined {
  const a1 = range.split("!")[1];
  const rows = a1?.match(/\d+/g)?.map(Number);
  return rows?.length ? Math.max(...rows) : undefined;
}
