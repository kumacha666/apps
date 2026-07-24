import { defineConfig } from "@playwright/test";
import { existsSync } from "fs";

// enblo/enblo-classic/combrawlのplaywright.config.tsと同じ構成を踏襲。
// executablePathはこのサンドボックス環境固有の安定シンボリックリンクのみ例外的に
// 先に見て、それ以外はPlaywright標準の解決に委ねる（決め打ちのキャッシュ位置は見に行かない）。
// devサーバーは他アプリ（enblo:5183 / enblo-classic:5185 / combrawl:5189）と
// 重複しないポート(5187)を使い、reuseExistingServer:falseで常に新規起動する
// （誤って他プロセスを使い回さないため）。
//
// 7metchは本番ビルド時にindex.htmlを書き換えない構成（`npm run dev`時のみ
// dev-entry-rewriteプラグインが`transformIndexHtml`でsrc/main.tsを直接配信する。
// vite.config.js参照）なので、enblo/combrawlのようなrestore/reset処理は不要。
// `npx vite --port 5187`をそのまま起動すればよい。
const sandboxChromium = "/opt/pw-browsers/chromium";
const chromiumPath =
  process.env.PLAYWRIGHT_CHROMIUM_PATH || (existsSync(sandboxChromium) ? sandboxChromium : undefined);
const launchOptions = chromiumPath ? { executablePath: chromiumPath } : {};

export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  use: {
    baseURL: "http://localhost:5187",
    launchOptions,
  },
  webServer: {
    command: "npx vite --port 5187",
    url: "http://localhost:5187",
    reuseExistingServer: false,
    timeout: 30000,
  },
});
