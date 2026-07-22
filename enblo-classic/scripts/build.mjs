/**
 * npm run build のオーケストレーションスクリプト。
 * entry書き換え → テスト → E2E → vite build を実行し、途中で失敗しても
 * 必ず（try/finallyで）index.htmlを元の状態に復元する。
 *
 * 2026-07-15、Codexレビュー指摘: prebuild/build/postbuildの3スクリプトに
 * 分かれていると、npmはprebuildやbuildが失敗した時点でpostbuildを実行しない。
 * そのため、restore-entry.mjsが書き換えた index.html とバックアップ
 * (.entry-backup.html) が残ったままになり、次回実行時に「失敗前の古い
 * バックアップ」から誤って復元してしまうリスクがあった。build全体を
 * 1つのNodeスクリプトにまとめ、finallyで確実に復元する。
 *
 * 2026-07-22、apps/CLAUDE.mdの「視覚的なUI崩れの検証」ルール追加に伴い
 * `npm run test:e2e` をここに組み込んだ（Codexレビュー指摘: ルール追加時点では
 * deployパイプラインに未配線で、ドキュメントと実態が食い違っていた）。
 * E2EはPlaywrightのwebServer設定（`npx vite --port 5185`）が自前でdevサーバーを
 * 立てるため、restore-entry済み（index.htmlが./src/main.tsを指す）状態であれば
 * vite buildの前後どちらでも実行できる。unit testの直後に置く。
 *
 * 2026-07-22、Codexレビュー指摘（追加）: Playwrightのchromiumが一切
 * インストールされていない環境（フレッシュチェックアウト・Codex自身のレビュー環境等）
 * では、E2Eをハードゲートにすると npm run deploy 自体が失敗してしまう。
 * chromiumの実体が見つかる場合のみE2Eを実行し、見つからない場合は警告を出して
 * スキップする（silent skipにはしない。ビルド自体は止めない）
 */
import { execSync } from "child_process";
import { existsSync, readdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const root = new URL("..", import.meta.url).pathname;
const run = (cmd) => execSync(cmd, { stdio: "inherit", cwd: root });

function hasPlaywrightChromium() {
  if (process.env.PLAYWRIGHT_CHROMIUM_PATH) return true;
  if (existsSync("/opt/pw-browsers/chromium")) return true;
  const cacheDir = process.env.PLAYWRIGHT_BROWSERS_PATH || join(homedir(), ".cache", "ms-playwright");
  if (existsSync(cacheDir)) {
    try {
      return readdirSync(cacheDir).some((entry) => entry.startsWith("chromium-"));
    } catch {
      return false;
    }
  }
  return false;
}

run("node scripts/restore-entry.mjs");
try {
  run("npm test");
  if (hasPlaywrightChromium()) {
    run("npm run test:e2e");
  } else {
    console.warn(
      "⚠️  Playwright chromiumが見つからないため、視覚E2Eチェックをスキップしました。`npx playwright install chromium` でインストールすると有効になります。"
    );
  }
  run("npx vite build");
} finally {
  run("node scripts/reset-entry.mjs");
}
