/**
 * npm run test:e2e のオーケストレーションスクリプト。build.mjsと同じ
 * restore-entry → 処理 → try/finallyでreset-entry のパターンを踏襲する。
 *
 * 2026-07-23、Codexレビュー指摘: playwright.config.tsのwebServer.command側で
 * restore/resetを完結させようとしたが、Playwrightがテスト終了時にwebServer
 * プロセスへ送る停止シグナルはNode側でトラップできない（実機検証で確認済み。
 * 子プロセスに手動でSIGTERMを送った場合は正しく後始末できるのに、Playwright
 * 管理下の停止では一切後始末が走らなかった＝SIGKILL相当で止めていると考えられる）。
 * Playwrightの終了処理に依存せず、自分たちが完全に制御できるこのラッパー
 * スクリプト側でrestore/resetを行うことで、`npm run test:e2e`を単独実行しても
 * `npm run build`経由で実行しても、実行後は必ずindex.htmlが元の状態に戻る。
 */
import { execSync } from "child_process";

const root = new URL("..", import.meta.url).pathname;
const run = (cmd) => execSync(cmd, { stdio: "inherit", cwd: root });

run("node scripts/restore-entry.mjs");
try {
  run("npx playwright test");
} finally {
  run("node scripts/reset-entry.mjs");
}
