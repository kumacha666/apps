import { defineConfig } from "@playwright/test";
import { existsSync } from "fs";

// enblo/enblo-classicのplaywright.config.tsと同じ構成（2026-07-22の一連のCodexレビュー対応を
// 踏襲）。executablePathはこのサンドボックス環境固有の安定シンボリックリンクのみ例外的に
// 先に見て、それ以外はPlaywright標準の解決に委ねる（決め打ちのキャッシュ位置は見に行かない）。
// devサーバーは他アプリ（enblo:5183 / enblo-classic:5185）と重複しないポートを使い、
// reuseExistingServer:falseで常に新規起動する（誤って他プロセスを使い回さないため）。
const sandboxChromium = "/opt/pw-browsers/chromium";
const chromiumPath =
  process.env.PLAYWRIGHT_CHROMIUM_PATH || (existsSync(sandboxChromium) ? sandboxChromium : undefined);
const launchOptions = chromiumPath ? { executablePath: chromiumPath } : {};

export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  use: {
    baseURL: "http://localhost:5189",
    launchOptions,
  },
  webServer: {
    command: "npx vite --port 5189",
    url: "http://localhost:5189",
    reuseExistingServer: false,
    timeout: 30000,
  },
});
