import type { BrowserContext, Route } from "@playwright/test";
import { INDEX_SHEET_HEADER } from "../src/sheets";

const TOKEN = "e2e-token";

export type MockOptions = {
  /** Seed the index tab with these rows instead of the small default fixture. */
  rows?: (string | number)[][];
  /** Serve an index tab whose header row does not match INDEX_SHEET_HEADER. */
  invalidHeader?: boolean;
};

/**
 * dusty-jukebox本体のe2e/google-mocks.tsを参考にした、このアプリ用の簡略版。
 * このアプリはDriveへは一切アクセスせず（spreadsheetsスコープのみ）、indexタブの
 * 読み取り（listExistingRows/readHeaderRow）と対象セル単体の書き込み（updateCells、
 * values:batchUpdate経由）しか行わないため、モック対象もGIS＋Sheets APIのみでよい。
 */
export async function installGoogleMocks(context: BrowserContext, options: MockOptions = {}) {
  const defaultRows: (string | number)[][] = [
    INDEX_SHEET_HEADER.map((h) => (h === "fileId" ? "song-1" : h === "title" ? "First song" : h === "artist" ? "Artist" : "")),
    INDEX_SHEET_HEADER.map((h) => (h === "fileId" ? "song-2" : h === "title" ? "Second song" : h === "artist" ? "Artist" : "")),
  ];
  let indexRows: (string | number)[][] = options.rows ?? defaultRows;
  const header: (string | number)[] = options.invalidHeader ? ["wrong", "header"] : [...INDEX_SHEET_HEADER];

  const authFailures: string[] = [];
  const sheetsWrites: { range: string; value: string | number }[] = [];

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

    if (url.includes("values/") && (url.includes("1:1") || url.includes("A1:"))) {
      return json(route, { values: [header] });
    }
    if (url.includes("values/") && method === "GET") {
      return json(route, { values: indexRows });
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

  return {
    authFailures,
    sheetsWrites,
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
