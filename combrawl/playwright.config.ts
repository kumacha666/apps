import { defineConfig } from "@playwright/test";
import { existsSync } from "fs";

// enblo/enblo-classicのplaywright.config.tsと同じ構成（2026-07-22の一連のCodexレビュー対応を
// 踏襲）。executablePathはこのサンドボックス環境固有の安定シンボリックリンクのみ例外的に
// 先に見て、それ以外はPlaywright標準の解決に委ねる（決め打ちのキャッシュ位置は見に行かない）。
// devサーバーは他アプリ（enblo:5183 / enblo-classic:5185）と重複しないポートを使い、
// reuseExistingServer:falseで常に新規起動する（誤って他プロセスを使い回さないため）。
//
// 2026-07-23、Codexレビュー指摘: webServer.commandを`npx vite --port 5189`のまま
// （`npm run dev`を経由しない形）にしていると、`npm run build`経由（build.mjsが
// 事前にrestore-entry.mjsを実行してからtest:e2eを呼ぶ）以外の実行——`npm run test:e2e`を
// フレッシュなチェックアウトで単独実行するケース——では、index.htmlが直近デプロイの
// `./game.js`を指したままになる。この場合、直近デプロイのビルド成果物には
// window.__e2eフックが含まれていない可能性が高く、visual-layout.spec.tsが
// レイアウトを検証する前に別の理由で失敗する。
//
// restore/resetの責務は`npm run test:e2e`本体（scripts/test-e2e.mjs）側に持たせた。
// 当初はこのwebServer.command側でPlaywrightのプロセス終了シグナルをフックして
// 後始末する方式を試したが、Playwrightがテスト終了時にwebServerへ送る停止シグナルは
// Node側でトラップできない（実機検証で、子プロセスにSIGTERMを手動送信した場合は
// 後始末できるのに、Playwright管理下の停止では後始末が一切走らないことを確認した）。
// そのため、Playwrightの終了処理に依存せず、build.mjsと同じ「restore→処理→
// try/finallyでreset」という自分たちが完全に制御できる形に置き換えた
// （詳細はscripts/test-e2e.mjs参照）。ここではviteを素朴に起動するだけでよい。
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
