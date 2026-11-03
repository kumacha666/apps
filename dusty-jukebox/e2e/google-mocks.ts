import type { BrowserContext, Route } from "@playwright/test";
import { INDEX_SHEET_HEADER, LEGACY_INDEX_SHEET_HEADER_V3 } from "../src/sheets";
import { PLAYLISTS_SHEET_HEADER, PLAYLIST_TRACKS_SHEET_HEADER } from "../src/playlists";
import { FOLDERS_SHEET_HEADER } from "../src/folderCache";
import { ALBUM_ART_SHEET_HEADER } from "../src/albumArtTab";

const TOKEN = "e2e-token";

export type MockOptions = {
  invalidSyncHeader?: boolean;
  delaySheetsReads?: boolean;
  /** Start as an uninitialised library so a scan takes the full-scan path. */
  initialScanCompleted?: boolean;
  /** Hold the SW script response until the test explicitly releases it. */
  delayServiceWorkerActivation?: boolean;
  /** Reject the first otherwise-authenticated media request as a revoked token. */
  rejectFirstStreamToken?: boolean;
  /** Provide multiple albums and deliberately unordered disc/track rows. */
  albumCatalog?: boolean;
  /**
   * アルバム一覧（CDラック）の分け方の確認用：CD1/CD2のフォルダに分かれた2枚組（タグのディスク番号なし）と、
   * アルバムアーティストが空で曲ごとにアーティストが違うオムニバスを、`folders`タブ付きで用意する。
   */
  rackCatalog?: boolean;
  /** Give every Symphony track a manual Genre override for catalog/filter coverage. */
  genreOverride?: boolean;
  /** Serve the pre-genre_override 46-column index grid. */
  legacyIndexGrid?: boolean;
  extractionFailedCount?: number;
  spreadsheetCanEdit?: boolean;
  /** Pre-seed the playlists/playlist_tracks tabs (e.g. a playlist referencing fileIds no longer in the index). */
  seedPlaylists?: { playlistId: string; name: string; fileIds: string[] }[];
  /** Hold every playlists/playlist_tracks list-read (GET) until the test releases it via releasePlaylistsReadsAt(). */
  gatePlaylistsListReads?: boolean;
  /** Hold every playlists/playlist_tracks append (POST) until the test releases it via releaseAllPlaylistsAppends(). */
  gatePlaylistsAppends?: boolean;
  /**
   * Hold the first HTMLMediaElement.play() call pending (never resolving on its own) until the
   * test releases it via window.__e2eReleaseFirstMediaPlay(). Every later play() call resolves
   * immediately as usual. Used to reproduce the realistic ordering where a Drive-side stream
   * rejection (rejectFirstStreamToken) arrives before the native play() promise settles, so
   * PlaybackQueue.currentFileId is still unset when the "認証を更新して続行" continuation UI
   * appears (2026-09-03, review follow-up: without this, play() resolving instantly made the
   * queue's optimistic render happen before the rejection, masking a real display-staleness bug).
   */
  delayFirstMediaPlay?: boolean;
  /**
   * アルバムアート（R17）：これらの曲は、ページからのRange取得（画像の読み出し）に、表紙画像（1×1のPNG）を
   * 埋め込んだ小さなMP3を返す。Service Worker経由の再生用ストリームはこれまでどおり空の応答のまま。
   */
  coverArtFileIds?: string[];
  /** 管理ツールが書くalbumArtタブ（ヘッダーの下の行）。指定したときだけタブがある。 */
  albumArtRows?: string[][];
  /** Driveに置いた表紙の画像（1×1のPNG）として返すファイルID。 */
  driveArtImageIds?: string[];
  /** albumArtタブの読み取りへの応答を、releaseAlbumArtTab()を呼ぶまで返さない。 */
  holdAlbumArtTab?: boolean;
};

// ID3v2.3のAPICフレーム（表紙、1×1のPNG）＋MPEGフレーム3つの小さなMP3。music-metadataで表紙が読めることを確認済み。
const COVER_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
function coverArtMp3(): Buffer {
  const synchsafe = (n: number) => Buffer.from([(n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f]);
  const body = Buffer.concat([Buffer.from([0]), Buffer.from("image/png\0", "latin1"), Buffer.from([3, 0]), COVER_PNG]);
  const frameHeader = Buffer.alloc(10);
  frameHeader.write("APIC", 0, "latin1");
  frameHeader.writeUInt32BE(body.length, 4);
  const frames = Buffer.concat([frameHeader, body]);
  const tag = Buffer.concat([Buffer.from("ID3\x03\x00\x00", "latin1"), synchsafe(frames.length), frames]);
  const mpegFrame = Buffer.alloc(417);
  mpegFrame.set([0xff, 0xfb, 0x90, 0x64]);
  return Buffer.concat([tag, mpegFrame, mpegFrame, mpegFrame]);
}
export const COVER_ART_MP3 = coverArtMp3();

type SheetWrite = {
  url: string;
  method: string;
  sheet: string;
  values: (string | number)[][];
};

// 任意のタブ名を許容する（元々はindex/syncのみを想定していたが、playlists/playlist_tracks
// タブ（保存済みプレイリスト機能）を実際に読み書きして検証するため汎用化した）。
function sheetNameForRange(range: string | undefined): string {
  const match = range?.match(/^'?([^'!]+)'?(?:!|$)/);
  return match?.[1] ?? "unknown";
}

// A1記法の列文字（例："J"）を0-indexedの列インデックスに変換する（sheets.tsのcolumnLetter()の逆変換）。
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

/** In-memory GIS, Drive and Sheets boundary. Every authenticated API request is
 * checked here, so a broken token hand-off cannot look like a successful E2E run. */
export async function installGoogleMocks(context: BrowserContext, options: MockOptions = {}) {
  const indexRow = (values: Record<string, string>) => INDEX_SHEET_HEADER.map((header) => values[header] ?? "");
  const indexRows: string[][] = options.extractionFailedCount ? Array.from({ length: options.extractionFailedCount }, (_, index) =>
    indexRow({ fileId: `failed-${index}`, extension: "mp3", parentId: "root", extractionFailed: "TRUE" })
  ) : options.rackCatalog ? [
    indexRow({ fileId: "double-2-1", extension: "mp3", parentId: "disc-2", title: "Second disc opener", artist: "Band", album: "Double", trackNumber: "1", releaseYear: "2001" }),
    indexRow({ fileId: "double-1-2", extension: "mp3", parentId: "disc-1", title: "First disc closer", artist: "Band", album: "Double", trackNumber: "2", releaseYear: "2001" }),
    indexRow({ fileId: "double-1-1", extension: "mp3", parentId: "disc-1", title: "First disc opener", artist: "Band", album: "Double", trackNumber: "1", releaseYear: "2001" }),
    indexRow({ fileId: "comp-1", extension: "mp3", parentId: "comp", title: "Hit A", artist: "Singer A", album: "Hits", trackNumber: "1", releaseYear: "2010" }),
    indexRow({ fileId: "comp-2", extension: "mp3", parentId: "comp", title: "Hit B", artist: "Singer B feat. C", album: "Hits", trackNumber: "2", releaseYear: "2010" }),
  ] : options.albumCatalog ? [
    indexRow({ fileId: "album-track-3", extension: "mp3", parentId: "root", title: "Finale", artist: "Soloist", albumArtist: "Orchestra", album: "Symphony", composer: "Beethoven", genre: "Classical", genre_override: options.genreOverride ? "Neo Classical" : "", discNumber: "2", trackNumber: "1", releaseYear: "2024", releaseType_override: "Album" }),
    indexRow({ fileId: "other-album", extension: "mp3", parentId: "root", title: "Jazz Song", artist: "Quartet", album: "Blue Notes", composer: "Writer", genre: "Jazz", discNumber: "1", trackNumber: "1", releaseYear: "2020", releaseType_override: "Single" }),
    indexRow({ fileId: "album-track-2", extension: "mp3", parentId: "root", title: "Scherzo", artist: "Soloist", albumArtist: "Orchestra", album: "Symphony", composer: "Beethoven", genre: "Classical", genre_override: options.genreOverride ? "Neo Classical" : "", discNumber: "1", trackNumber: "2", releaseYear: "2024", releaseType_override: "Album" }),
    indexRow({ fileId: "album-track-1", extension: "mp3", parentId: "root", title: "Opening", artist: "Conductor", albumArtist: "Orchestra", album: "Symphony", composer: "Beethoven", genre: "Classical", genre_override: options.genreOverride ? "Neo Classical" : "", discNumber: "1", trackNumber: "1", releaseYear: "2024", releaseType_override: "Album" }),
  ] : [
    indexRow({ fileId: "song-1", extension: "mp3", parentId: "root", driveModifiedTime: "2026-01-01T00:00:00Z", title: "First song", artist: "Artist", genre: "Rock", releaseYear: "2024" }),
    indexRow({ fileId: "song-2", extension: "mp3", parentId: "root", driveModifiedTime: "2026-01-01T00:00:00Z", title: "Second song", artist: "Artist", genre: "Rock", releaseYear: "2024" }),
  ];
  const syncRows = [["startPageToken", "page-1"], ["rootFolderId", "root"], ["initialScanCompletedAt", options.initialScanCompleted === false ? "" : "2026-01-01T00:00:00Z"], ["scanRunId", ""], ["shortcutRootFolderIds", ""]];

  // タブ名→データ行/ヘッダー行の汎用ストア。index/syncは元々の固定配列をそのまま使い、
  // playlists/playlist_tracksは保存済みプレイリスト機能のE2E検証のために追加した
  // （空タブとして最初から存在する扱い。ensurePlaylistsTabsExistの自動作成分岐は
  // 「タブ一覧確認済み・追加スキップ」の疎通確認にとどめ、addSheet系のE2E検証はユニット
  // テスト（sheetsSetup.test.ts）側でカバーする）。
  const seededPlaylistRows = (options.seedPlaylists ?? []).map((p) => [p.playlistId, p.name, "2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z"]);
  const seededTrackRows = (options.seedPlaylists ?? []).flatMap((p) => p.fileIds.map((fileId, i) => [p.playlistId, `1000-${i}-e2e`, fileId]));
  const folderRows = options.rackCatalog ? [["disc-1", "CD1", "double"], ["disc-2", "CD2", "double"], ["double", "Double", "root"], ["comp", "Hits", "root"]] : [];
  const sheetData: Record<string, (string | number)[][]> = { index: indexRows, sync: syncRows, playlists: seededPlaylistRows, playlist_tracks: seededTrackRows, ...(options.rackCatalog ? { folders: folderRows } : {}), ...(options.albumArtRows ? { albumArt: options.albumArtRows } : {}) };
  const sheetHeaders: Record<string, (string | number)[]> = {
    index: [...(options.legacyIndexGrid ? LEGACY_INDEX_SHEET_HEADER_V3 : INDEX_SHEET_HEADER)],
    sync: options.invalidSyncHeader ? ["wrong", "header"] : ["key", "value"],
    playlists: [...PLAYLISTS_SHEET_HEADER],
    playlist_tracks: [...PLAYLIST_TRACKS_SHEET_HEADER],
    ...(options.rackCatalog ? { folders: [...FOLDERS_SHEET_HEADER] } : {}),
    ...(options.albumArtRows ? { albumArt: [...ALBUM_ART_SHEET_HEADER] } : {}),
  };
  const existingTitles = new Set(["index", "sync", "playlists", "playlist_tracks", ...(options.rackCatalog ? ["folders"] : []), ...(options.albumArtRows ? ["albumArt"] : [])]);
  let nextSheetId = 7;
  const sheetIds: Record<string, number> = { index: 1, sync: 2, playlists: 3, playlist_tracks: 4, ...(options.rackCatalog ? { folders: 5 } : {}), ...(options.albumArtRows ? { albumArt: 6 } : {}) };

  const authFailures: string[] = [];
  const streamRequests: string[] = [];
  // ページから直接のRange取得（タグ抽出・アルバムアートの読み出し）。再生用のストリーム（streamRequests）とは数えない
  const pageMediaRequests: string[] = [];
  // Driveに置いた表紙の画像の取得（driveArtImageIdsに入っていないIDもここに数える）
  const driveArtRequests: string[] = [];
  const driveMetadataRequests: string[] = [];
  let remainingStreamTokenRejections = options.rejectFirstStreamToken ? 1 : 0;
  const sheetsWrites: SheetWrite[] = [];
  const sheetsReadRanges: string[] = [];
  const pendingPlaylistsReads: (() => void)[] = [];
  const pendingPlaylistsAppends: (() => void)[] = [];
  let playlistsAppendsReleased = false;
  let releaseServiceWorker = () => {};
  let releaseAlbumArtTab = () => {};
  const albumArtTabGate = options.holdAlbumArtTab ? new Promise<void>((resolve) => { releaseAlbumArtTab = resolve; }) : null;
  const serviceWorkerGate = options.delayServiceWorkerActivation
    ? new Promise<void>((resolve) => { releaseServiceWorker = resolve; })
    : null;
  // The test data is deliberately not a decodable audio file. Keep native media
  // decoding outside this suite while still exercising the actual SW fetch path.
  // The play/pause toggle reads the native paused flag and reacts to the native
  // playing/pause events. The fixture is not decodable audio, so emulate those
  // parts of HTMLMediaElement while keeping decoding outside this suite.
  await context.addInitScript((delayFirstPlay: boolean) => {
    let firstPlayHeld = false;
    let releaseFirstPlay: (() => void) | undefined;
    (window as unknown as { __e2eReleaseFirstMediaPlay: () => void }).__e2eReleaseFirstMediaPlay = () => releaseFirstPlay?.();
    const playingElements = new WeakSet<HTMLMediaElement>();
    Object.defineProperty(HTMLMediaElement.prototype, "paused", {
      configurable: true,
      get: function (this: HTMLMediaElement) { return !playingElements.has(this); },
    });
    document.addEventListener("playing", (event) => playingElements.add(event.target as HTMLMediaElement), true);
    document.addEventListener("pause", (event) => playingElements.delete(event.target as HTMLMediaElement), true);
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: function (this: HTMLMediaElement) {
        if (delayFirstPlay && !firstPlayHeld) {
          firstPlayHeld = true;
          return new Promise<void>((resolve) => {
            releaseFirstPlay = () => {
              playingElements.add(this);
              this.dispatchEvent(new Event("playing"));
              resolve();
            };
          });
        }
        playingElements.add(this);
        this.dispatchEvent(new Event("playing"));
        return Promise.resolve();
      },
    });
    (window as unknown as { __e2ePauseCalls: number }).__e2ePauseCalls = 0;
    const originalPause = HTMLMediaElement.prototype.pause;
    Object.defineProperty(HTMLMediaElement.prototype, "pause", {
      configurable: true,
      value: function (this: HTMLMediaElement, ...args: []) {
        (window as unknown as { __e2ePauseCalls: number }).__e2ePauseCalls += 1;
        playingElements.delete(this);
        const result = originalPause.apply(this, args);
        this.dispatchEvent(new Event("pause"));
        return result;
      },
    });
  }, options.delayFirstMediaPlay ?? false);
  const json = (route: Route, value: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) });
  const requireToken = (route: Route) => {
    if (route.request().headers().authorization === `Bearer ${TOKEN}`) return true;
    authFailures.push(route.request().url());
    void json(route, { error: { message: "missing fake bearer token" } }, 401);
    return false;
  };

  if (serviceWorkerGate) {
    await context.route("**/sw.js", async (route) => {
      await serviceWorkerGate;
      await route.continue();
    });
  }
  await context.route("https://accounts.google.com/gsi/client", (route) => route.fulfill({ contentType: "application/javascript", body: `window.google={accounts:{oauth2:{initTokenClient:(config)=>{const client={...config};client.requestAccessToken=()=>client.callback({access_token:'${TOKEN}',expires_in:3600,scope:client.scope});return client;}}}};` }));
  await context.route("https://www.googleapis.com/**", async (route) => {
    if (!requireToken(route)) return;
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/startPageToken")) return json(route, { startPageToken: "page-1" });
    if (url.pathname.endsWith("/changes")) return json(route, { changes: [], newStartPageToken: "page-2" });
    if (url.searchParams.get("alt") === "media" && route.request().serviceWorker() === null && url.pathname.split("/").pop()?.startsWith("art-")) {
      const artId = url.pathname.split("/").pop() ?? "";
      driveArtRequests.push(artId);
      if (!options.driveArtImageIds?.includes(artId)) return json(route, { error: { message: "File not found" } }, 404);
      return route.fulfill({ status: 200, contentType: "image/png", body: COVER_PNG });
    }
    if (url.searchParams.get("alt") === "media" && route.request().serviceWorker() === null) {
      pageMediaRequests.push(route.request().url());
      const mediaId = url.pathname.split("/").pop() ?? "";
      if (!options.coverArtFileIds?.includes(mediaId)) return route.fulfill({ status: 206, contentType: "audio/mpeg", body: "", headers: { "Accept-Ranges": "bytes" } });
      const match = /bytes=(\d+)-(\d+)?/.exec(route.request().headers().range ?? "");
      const start = match ? Number(match[1]) : 0;
      const end = Math.min(match?.[2] ? Number(match[2]) : COVER_ART_MP3.length - 1, COVER_ART_MP3.length - 1);
      if (start >= COVER_ART_MP3.length) return route.fulfill({ status: 416, body: "" });
      return route.fulfill({ status: 206, contentType: "audio/mpeg", body: COVER_ART_MP3.subarray(start, end + 1), headers: { "Accept-Ranges": "bytes", "Content-Range": `bytes ${start}-${end}/${COVER_ART_MP3.length}` } });
    }
    if (url.searchParams.get("alt") === "media") {
      streamRequests.push(route.request().url());
      if (remainingStreamTokenRejections > 0) {
        remainingStreamTokenRejections -= 1;
        return route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: { message: "revoked token" } }) });
      }
      return route.fulfill({ status: 206, contentType: "audio/mpeg", body: "", headers: { "Accept-Ranges": "bytes" } });
    }
    if (url.pathname.endsWith("/files")) return json(route, { files: [{ id: "song-1", name: "first.mp3", mimeType: "audio/mpeg", parents: ["root"], modifiedTime: "2026-01-01T00:00:00Z" }] });
    const id = url.pathname.split("/").pop();
    driveMetadataRequests.push(id ?? "");
    if (id === "root") return json(route, { id, name: "Root", mimeType: "application/vnd.google-apps.folder", parents: [], capabilities: { canEdit: true } });
    if (id === "sheet") return json(route, { id, name: "Sheet", mimeType: "application/vnd.google-apps.spreadsheet", capabilities: { canEdit: options.spreadsheetCanEdit !== false } });
    if (id && options.coverArtFileIds?.includes(id)) {
      return json(route, { id, name: `${id}.mp3`, mimeType: "audio/mpeg", size: String(COVER_ART_MP3.length), parents: ["root"], modifiedTime: "2026-01-01T00:00:00Z", trashed: false });
    }
    if (id?.startsWith("song-") || id?.startsWith("album-track-") || id === "other-album") {
      return json(route, { id, name: `${id}.mp3`, mimeType: "audio/mpeg", size: "1024", parents: ["root"], modifiedTime: "2026-01-01T00:00:00Z", trashed: false });
    }
    return json(route, { id, name: id, mimeType: "application/vnd.google-apps.folder", parents: ["root"] });
  });
  await context.route("https://sheets.googleapis.com/**", async (route) => {
    if (!requireToken(route)) return;
    const url = decodeURIComponent(route.request().url());
    const method = route.request().method();
    if (options.delaySheetsReads && method === "GET" && url.includes("values/")) await new Promise((resolve) => setTimeout(resolve, 200));
    if (url.includes("?fields=sheets.properties.title")) {
      return json(route, {
        sheets: [...existingTitles].map((title) => ({
          properties: { title, sheetId: sheetIds[title], gridProperties: { columnCount: sheetHeaders[title]?.length ?? 26 } },
        })),
      });
    }
    // スプレッドシート単位のbatchUpdate（addSheet、タブ追加）。values:batchUpdate（行データの
    // 更新）とはURLパスが異なる（前者に"/values"を含まない）ため区別できる。
    if (url.endsWith(":batchUpdate") && !url.includes("/values:batchUpdate") && method === "POST") {
      const body = JSON.parse(route.request().postData() ?? "{}") as {
        requests?: Array<{ addSheet?: { properties?: { title?: string } } }>;
      };
      for (const req of body.requests ?? []) {
        const title = req.addSheet?.properties?.title;
        if (title && !existingTitles.has(title)) {
          existingTitles.add(title);
          sheetIds[title] = nextSheetId++;
          sheetData[title] ??= [];
        }
      }
      return json(route, {});
    }
    if (url.includes("values:batchUpdate") && method === "POST") {
      const body = JSON.parse(route.request().postData() ?? "{}") as { data?: Array<{ range?: string; values?: (string | number)[][] }> };
      for (const update of body.data ?? []) {
        // 行全体の更新（'sheet'!A5:AS5、values[0].length>1）と、カタログ補正機能の単一セル更新
        // （'sheet'!J5、values[0].length===1）の両方に対応する。後者は列がAとは限らないため
        // 列文字を実際にパースして列インデックスへ変換する（旧実装は列Aを暗黙の前提としていた）。
        const match = update.range?.match(/^'?([^'!]+)'?!([A-Z]+)(\d+)/);
        if (!match || !update.values?.[0]) continue;
        const rows = (sheetData[match[1]] ??= []);
        const rowIndex = Number(match[3]) - 2;
        const values = update.values[0];
        if (values.length === 1) {
          const columnIndex = columnLettersToIndex(match[2]);
          const row = (rows[rowIndex] ??= []);
          row[columnIndex] = values[0];
        } else {
          rows[rowIndex] = [...values];
        }
      }
      for (const update of body.data ?? []) {
        sheetsWrites.push({
          url,
          method,
          sheet: sheetNameForRange(update.range),
          values: update.values ?? [],
        });
      }
      return json(route, { totalUpdatedRows: body.data?.length ?? 0 });
    }
    if (url.includes("values/")) {
      const rangeSegment = url.split("values/")[1]?.split("?")[0] ?? "";
      const sheetName = sheetNameForRange(rangeSegment);
      const isHeader = url.includes("1:1") || url.includes("A1:");
      if (method === "GET") {
        sheetsReadRanges.push(rangeSegment);
        if (albumArtTabGate && sheetName === "albumArt") await albumArtTabGate;
        const requestedColumns = requestedColumnCount(rangeSegment);
        const gridColumns = sheetHeaders[sheetName]?.length ?? 26;
        if (requestedColumns !== undefined && requestedColumns > gridColumns) {
          return json(route, { error: { message: `Range exceeds grid limits: ${requestedColumns} > ${gridColumns}` } }, 400);
        }
        const requestedRows = requestedRowCount(rangeSegment);
        const gridRows = Math.max(1000, (sheetData[sheetName]?.length ?? 0) + 1);
        if (requestedRows !== undefined && requestedRows > gridRows) {
          return json(route, { error: { message: `Range exceeds grid limits: ${requestedRows} > ${gridRows}` } }, 400);
        }
        // loadPlaylists()のgenerationガード（main.ts）を検証するテスト専用のゲート。
        // playlists/playlist_tracksタブのA2:...読み取り（listPlaylists/listPlaylistTracks）だけを
        // 対象に、テストが明示的に解放するまで応答を保留する。解放順序を操作することで
        // 「先に開始した読み込みが後で完了する」状況を確定的に再現できる。
        if (options.gatePlaylistsListReads && (sheetName === "playlists" || sheetName === "playlist_tracks") && !isHeader) {
          await new Promise<void>((resolve) => pendingPlaylistsReads.push(resolve));
        }
        const dataRows = (sheetData[sheetName] ?? []).map((row) => row.slice(0, gridColumns));
        const isWholeSheet = !rangeSegment.includes("!");
        return json(route, { values: isHeader ? [sheetHeaders[sheetName] ?? []] : isWholeSheet ? [sheetHeaders[sheetName] ?? [], ...dataRows] : dataRows });
      }
      if (method === "PUT") {
        // writeHeaderRow（タブ初回自動作成のヘッダー書き込み）専用。
        const body = JSON.parse(route.request().postData() ?? "{}") as { values?: (string | number)[][] };
        if (isHeader && body.values?.[0]) sheetHeaders[sheetName] = [...body.values[0]];
        sheetsWrites.push({ url, method, sheet: sheetName, values: body.values ?? [] });
        return json(route, { updatedRows: 1 });
      }
      if (method === "POST") {
        // loadPlaylists()の世代予約がユーザー操作の開始順を正しく反映することを検証する
        // テスト専用のゲート。createPlaylist()（playlists/playlist_tracksタブへのappend）を
        // 意図的に長引かせ、その間に別の一覧更新操作を完了させられるようにする。
        if (options.gatePlaylistsAppends && !playlistsAppendsReleased && (sheetName === "playlists" || sheetName === "playlist_tracks")) {
          await new Promise<void>((resolve) => pendingPlaylistsAppends.push(resolve));
        }
        // values:append。実際に対象タブの末尾へ行を追加する（保存済みプレイリスト機能の
        // 保存→一覧表示→読み込みという一連の流れを実データで検証するために必要）。
        const body = JSON.parse(route.request().postData() ?? "{}") as { values?: (string | number)[][] };
        const rows = (sheetData[sheetName] ??= []);
        rows.push(...(body.values ?? []));
        sheetsWrites.push({ url, method, sheet: sheetName, values: body.values ?? [] });
        return json(route, { updates: { updatedRows: body.values?.length ?? 0 } });
      }
    }
    return json(route, {});
  });
  // gatePlaylistsListReads用：現在保留中の読み取りの件数と、インデックス指定での解放。
  // indexは登録順（listPlaylists→listPlaylistTracksの順で各呼び出しにつき2件ずつ積まれる）。
  const pendingPlaylistsReadCount = () => pendingPlaylistsReads.length;
  const releasePlaylistsReadsAt = (indexes: number[]) => {
    // 後ろのインデックスから外すことで、前のインデックスがずれない。
    for (const i of [...indexes].sort((a, b) => b - a)) {
      const resolve = pendingPlaylistsReads[i];
      if (resolve) { pendingPlaylistsReads.splice(i, 1); resolve(); }
    }
  };
  const releaseAllPlaylistsAppends = () => {
    playlistsAppendsReleased = true;
    while (pendingPlaylistsAppends.length > 0) pendingPlaylistsAppends.shift()!();
  };
  return {
    authFailures,
    streamRequests,
    pageMediaRequests,
    driveArtRequests,
    releaseAlbumArtTab: () => releaseAlbumArtTab(),
    driveMetadataRequests,
    sheetsWrites,
    sheetsReadRanges,
    releaseServiceWorker,
    pendingPlaylistsReadCount,
    releasePlaylistsReadsAt,
    releaseAllPlaylistsAppends,
  };
}
