import type { BrowserContext, Route } from "@playwright/test";

const TOKEN = "e2e-token";
const indexHeader = ["fileId", "extension", "parentId", "driveModifiedTime", "lastScannedAt", "title", "title_override", "artist", "artist_override", "albumArtist", "albumArtist_override", "album", "album_override", "composer", "composer_override", "genre", "trackNumber", "discNumber", "releaseYear", "releaseYear_override", "copyrightYear", "releaseType_override", "vocalGender_override", "providerNote_override", "garbledSuspect", "garbledResolved", "extractionFailed", "title_conflictCandidate", "title_hasConflict", "artist_conflictCandidate", "artist_hasConflict", "albumArtist_conflictCandidate", "albumArtist_hasConflict", "composer_conflictCandidate", "composer_hasConflict", "releaseYear_conflictCandidate", "releaseYear_hasConflict", "releaseType_conflictCandidate", "releaseType_hasConflict", "vocalGender_conflictCandidate", "vocalGender_hasConflict", "providerNote_conflictCandidate", "providerNote_hasConflict", "scanRunId"];

export type MockOptions = { invalidSyncHeader?: boolean; delaySheetsReads?: boolean };

/** In-memory GIS, Drive and Sheets boundary. Every authenticated API request is
 * checked here, so a broken token hand-off cannot look like a successful E2E run. */
export async function installGoogleMocks(context: BrowserContext, options: MockOptions = {}) {
  const indexRows: string[][] = [
    ["song-1", "mp3", "root", "2026-01-01T00:00:00Z", "", "First song", "", "Artist", "", "", "", "", "", "", "", "Rock", "", "", "2024"],
    ["song-2", "mp3", "root", "2026-01-01T00:00:00Z", "", "Second song", "", "Artist", "", "", "", "", "", "", "", "Rock", "", "", "2024"],
  ];
  const syncRows = [["startPageToken", "page-1"], ["rootFolderId", "root"], ["initialScanCompletedAt", "2026-01-01T00:00:00Z"], ["scanRunId", ""], ["shortcutRootFolderIds", ""]];
  const authFailures: string[] = [];
  const streamRequests: string[] = [];
  // The test data is deliberately not a decodable audio file. Keep native media
  // decoding outside this suite while still exercising the actual SW fetch path.
  await context.addInitScript(() => Object.defineProperty(HTMLMediaElement.prototype, "play", { configurable: true, value: () => Promise.resolve() }));
  const json = (route: Route, value: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) });
  const requireToken = (route: Route) => {
    if (route.request().headers().authorization === `Bearer ${TOKEN}`) return true;
    authFailures.push(route.request().url());
    void json(route, { error: { message: "missing fake bearer token" } }, 401);
    return false;
  };

  await context.route("https://accounts.google.com/gsi/client", (route) => route.fulfill({ contentType: "application/javascript", body: `window.google={accounts:{oauth2:{initTokenClient:(config)=>({requestAccessToken:()=>config.callback({access_token:'${TOKEN}',expires_in:3600,scope:config.scope})})}}};` }));
  await context.route("https://www.googleapis.com/**", async (route) => {
    if (!requireToken(route)) return;
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/startPageToken")) return json(route, { startPageToken: "page-1" });
    if (url.pathname.endsWith("/changes")) return json(route, { changes: [], newStartPageToken: "page-2" });
    if (url.searchParams.get("alt") === "media") { streamRequests.push(route.request().url()); return route.fulfill({ status: 206, contentType: "audio/mpeg", body: "", headers: { "Accept-Ranges": "bytes" } }); }
    if (url.pathname.endsWith("/files")) return json(route, { files: [{ id: "song-1", name: "first.mp3", mimeType: "audio/mpeg", parents: ["root"], modifiedTime: "2026-01-01T00:00:00Z" }] });
    const id = url.pathname.split("/").pop();
    if (id === "root") return json(route, { id, name: "Root", mimeType: "application/vnd.google-apps.folder", parents: [], capabilities: { canEdit: true } });
    if (id === "sheet") return json(route, { id, name: "Sheet", mimeType: "application/vnd.google-apps.spreadsheet", capabilities: { canEdit: true } });
    return json(route, { id, name: id, mimeType: "application/vnd.google-apps.folder", parents: ["root"] });
  });
  await context.route("https://sheets.googleapis.com/**", async (route) => {
    if (!requireToken(route)) return;
    const url = decodeURIComponent(route.request().url());
    if (options.delaySheetsReads && route.request().method() === "GET" && url.includes("values/")) await new Promise((resolve) => setTimeout(resolve, 200));
    if (url.includes("?fields=sheets.properties.title")) return json(route, { sheets: [{ properties: { title: "index", sheetId: 1, gridProperties: { columnCount: 60 } } }, { properties: { title: "sync", sheetId: 2, gridProperties: { columnCount: 2 } } }] });
    if (url.includes("values/")) {
      const isSync = url.includes("sync");
      const isHeader = url.includes("1:1") || url.includes("A1:");
      if (route.request().method() === "GET") return json(route, { values: isHeader ? [isSync ? (options.invalidSyncHeader ? ["wrong", "header"] : ["key", "value"]) : indexHeader] : (isSync ? syncRows : indexRows) });
      if (route.request().method() === "POST" || route.request().method() === "PUT") return json(route, { updatedRows: 1 });
    }
    return json(route, {});
  });
  return { authFailures, streamRequests };
}
