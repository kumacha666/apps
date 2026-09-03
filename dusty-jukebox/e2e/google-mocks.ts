import type { BrowserContext, Route } from "@playwright/test";
import { INDEX_SHEET_HEADER } from "../src/sheets";
import { PLAYLISTS_SHEET_HEADER, PLAYLIST_TRACKS_SHEET_HEADER } from "../src/playlists";

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
  extractionFailedCount?: number;
  spreadsheetCanEdit?: boolean;
  /** Pre-seed the playlists/playlist_tracks tabs (e.g. a playlist referencing fileIds no longer in the index). */
  seedPlaylists?: { playlistId: string; name: string; fileIds: string[] }[];
  /** Hold every playlists/playlist_tracks list-read (GET) until the test releases it via releasePlaylistsReadsAt(). */
  gatePlaylistsListReads?: boolean;
};

type SheetWrite = {
  url: string;
  method: string;
  sheet: string;
  values: (string | number)[][];
};

// 任意のタブ名を許容する（元々はindex/syncのみを想定していたが、playlists/playlist_tracks
// タブ（保存済みプレイリスト機能）を実際に読み書きして検証するため汎用化した）。
function sheetNameForRange(range: string | undefined): string {
  const match = range?.match(/^'?([^'!]+)'?!/);
  return match?.[1] ?? "unknown";
}

/** In-memory GIS, Drive and Sheets boundary. Every authenticated API request is
 * checked here, so a broken token hand-off cannot look like a successful E2E run. */
export async function installGoogleMocks(context: BrowserContext, options: MockOptions = {}) {
  const indexRow = (values: Record<string, string>) => INDEX_SHEET_HEADER.map((header) => values[header] ?? "");
  const indexRows: string[][] = options.extractionFailedCount ? Array.from({ length: options.extractionFailedCount }, (_, index) =>
    indexRow({ fileId: `failed-${index}`, extension: "mp3", parentId: "root", extractionFailed: "TRUE" })
  ) : options.albumCatalog ? [
    indexRow({ fileId: "album-track-3", extension: "mp3", parentId: "root", title: "Finale", artist: "Soloist", albumArtist: "Orchestra", album: "Symphony", composer: "Beethoven", genre: "Classical", discNumber: "2", trackNumber: "1", releaseYear: "2024" }),
    indexRow({ fileId: "other-album", extension: "mp3", parentId: "root", title: "Jazz Song", artist: "Quartet", album: "Blue Notes", composer: "Writer", genre: "Jazz", discNumber: "1", trackNumber: "1", releaseYear: "2020" }),
    indexRow({ fileId: "album-track-2", extension: "mp3", parentId: "root", title: "Scherzo", artist: "Soloist", albumArtist: "Orchestra", album: "Symphony", composer: "Beethoven", genre: "Classical", discNumber: "1", trackNumber: "2", releaseYear: "2024" }),
    indexRow({ fileId: "album-track-1", extension: "mp3", parentId: "root", title: "Opening", artist: "Soloist", albumArtist: "Orchestra", album: "Symphony", composer: "Beethoven", genre: "Classical", discNumber: "1", trackNumber: "1", releaseYear: "2024" }),
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
  const sheetData: Record<string, (string | number)[][]> = { index: indexRows, sync: syncRows, playlists: seededPlaylistRows, playlist_tracks: seededTrackRows };
  const sheetHeaders: Record<string, (string | number)[]> = {
    index: [...INDEX_SHEET_HEADER],
    sync: options.invalidSyncHeader ? ["wrong", "header"] : ["key", "value"],
    playlists: [...PLAYLISTS_SHEET_HEADER],
    playlist_tracks: [...PLAYLIST_TRACKS_SHEET_HEADER],
  };
  const existingTitles = new Set(["index", "sync", "playlists", "playlist_tracks"]);
  let nextSheetId = 5;
  const sheetIds: Record<string, number> = { index: 1, sync: 2, playlists: 3, playlist_tracks: 4 };

  const authFailures: string[] = [];
  const streamRequests: string[] = [];
  const driveMetadataRequests: string[] = [];
  let remainingStreamTokenRejections = options.rejectFirstStreamToken ? 1 : 0;
  const sheetsWrites: SheetWrite[] = [];
  const pendingPlaylistsReads: (() => void)[] = [];
  let releaseServiceWorker = () => {};
  const serviceWorkerGate = options.delayServiceWorkerActivation
    ? new Promise<void>((resolve) => { releaseServiceWorker = resolve; })
    : null;
  // The test data is deliberately not a decodable audio file. Keep native media
  // decoding outside this suite while still exercising the actual SW fetch path.
  // play() is fully replaced (not wrapped), so the native `paused` flag never
  // reflects app-driven playback here. Track pause() calls explicitly via
  // window.__e2ePauseCalls so tests can verify a real pause was requested
  // (e.g. stopping playback when a loaded playlist resolves to zero songs).
  await context.addInitScript(() => {
    Object.defineProperty(HTMLMediaElement.prototype, "play", { configurable: true, value: () => Promise.resolve() });
    (window as unknown as { __e2ePauseCalls: number }).__e2ePauseCalls = 0;
    const originalPause = HTMLMediaElement.prototype.pause;
    Object.defineProperty(HTMLMediaElement.prototype, "pause", {
      configurable: true,
      value: function (this: HTMLMediaElement, ...args: []) {
        (window as unknown as { __e2ePauseCalls: number }).__e2ePauseCalls += 1;
        return originalPause.apply(this, args);
      },
    });
  });
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
        const match = update.range?.match(/^'?([^'!]+)'?!A(\d+)/);
        if (!match || !update.values?.[0]) continue;
        const rows = (sheetData[match[1]] ??= []);
        rows[Number(match[2]) - 2] = [...update.values[0]];
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
      const rangeSegment = url.split("values/")[1]?.split("?")[0].split(":")[0] ?? "";
      const sheetName = sheetNameForRange(rangeSegment);
      const isHeader = url.includes("1:1") || url.includes("A1:");
      if (method === "GET") {
        // loadPlaylists()のgenerationガード（main.ts）を検証するテスト専用のゲート。
        // playlists/playlist_tracksタブのA2:...読み取り（listPlaylists/listPlaylistTracks）だけを
        // 対象に、テストが明示的に解放するまで応答を保留する。解放順序を操作することで
        // 「先に開始した読み込みが後で完了する」状況を確定的に再現できる。
        if (options.gatePlaylistsListReads && (sheetName === "playlists" || sheetName === "playlist_tracks") && !isHeader) {
          await new Promise<void>((resolve) => pendingPlaylistsReads.push(resolve));
        }
        return json(route, { values: isHeader ? [sheetHeaders[sheetName] ?? []] : (sheetData[sheetName] ?? []) });
      }
      if (method === "PUT") {
        // writeHeaderRow（タブ初回自動作成のヘッダー書き込み）専用。
        const body = JSON.parse(route.request().postData() ?? "{}") as { values?: (string | number)[][] };
        if (isHeader && body.values?.[0]) sheetHeaders[sheetName] = [...body.values[0]];
        sheetsWrites.push({ url, method, sheet: sheetName, values: body.values ?? [] });
        return json(route, { updatedRows: 1 });
      }
      if (method === "POST") {
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
  return {
    authFailures,
    streamRequests,
    driveMetadataRequests,
    sheetsWrites,
    releaseServiceWorker,
    pendingPlaylistsReadCount,
    releasePlaylistsReadsAt,
  };
}
