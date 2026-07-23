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
// レイアウトを検証する前に別の理由で失敗する。restore-entry.mjsを毎回明示的に
// 実行してからdevサーバーを起動するようにし、実行経路によらず常にsrc/main.tsの
// 現在のソースを検証対象にする（restore-entry.mjs自体は既にバックアップ済みなら
// 再実行しても安全なよう冪等に作られている）。
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
    command: "node scripts/restore-entry.mjs && npx vite --port 5189",
    url: "http://localhost:5189",
    reuseExistingServer: false,
    timeout: 30000,
  },
});
