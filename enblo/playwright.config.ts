import { defineConfig } from "@playwright/test";
import { existsSync } from "fs";

// 2026-07-22、Codexレビュー指摘: npm run test:e2eをbuild/deployの自動ゲートに
// 組み込んだことで、以下2点がこの環境固有の前提に依存していた問題が顕在化した。
// 1. executablePathをこの環境限定の絶対パスに固定していたため、そのパスを持たない
//    マシン（開発者のローカルWindows機等）ではVite出力(dist)が生成される前にビルド
//    自体が失敗するようになっていた。PLAYWRIGHT_CHROMIUM_PATHが明示されない限りは
//    Playwright標準のブラウザ解決に委ね、この環境専用のパスをデフォルト値として
//    埋め込まない
// 2. reuseExistingServer:trueだと、既に同じポートで別プロセス（enblo-classicの
//    devサーバー等）が起動していた場合、そちらを誤って使い回してしまい、今回の
//    変更が一切レンダリングされないままE2Eが「成功」する。自動ゲートとしては
//    常に新規サーバーを起動させ、ポートも姉妹アプリ(enblo-classic)と重複しない
//    値にする
const sandboxChromium = "/opt/pw-browsers/chromium";
const chromiumPath =
  process.env.PLAYWRIGHT_CHROMIUM_PATH || (existsSync(sandboxChromium) ? sandboxChromium : undefined);
const launchOptions = chromiumPath ? { executablePath: chromiumPath } : {};

export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  use: {
    baseURL: "http://localhost:5183",
    launchOptions,
  },
  webServer: {
    command: "npx vite --port 5183",
    url: "http://localhost:5183",
    reuseExistingServer: false,
    timeout: 30000,
  },
});
