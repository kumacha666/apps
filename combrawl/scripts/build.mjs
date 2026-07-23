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
 * 2026-07-23、apps/CLAUDE.mdの「視覚的なUI崩れの検証」ルール対応でE2Eを追加。
 * enblo/enblo-classicで2026-07-22に一連のCodexレビューを経て固めた形をそのまま踏襲する：
 * chromiumが見つからない場合は`npx playwright install chromium`で確保してから必ずE2Eを
 * 実行する（見つからなければ警告してスキップ、という形にはしない。実行せずにビルドが
 * 成功してしまうと「視覚崩れを必ず検知する」というルールの目的自体が形骸化するため）。
 *
 * 2026-07-23、Codexレビュー指摘: `npm run test:e2e`（scripts/test-e2e.mjs）自体が
 * 単独実行時にも安全なよう、内部で独自にrestore-entry→reset-entryを行うように
 * なった。このbuild.mjs側で「restore一発→test/e2e/vite buildをまとめて実行→reset一発」
 * という1つの大きな窓で囲うと、test:e2e内部のreset-entryが早期に発火してしまい、
 * その後に実行するvite buildがrestoreされていない（本番のgame.js参照のままの）
 * index.htmlを見てビルドしてしまう。unit test・E2E・vite buildをそれぞれ独立した
 * restore→処理→resetの窓で順番に実行し、互いのreset-entryが干渉しないようにする
 * （restore-entry.mjsは既にバックアップ済みなら二重実行しても安全、reset-entry.mjs
 * もバックアップが無ければ何もしない設計のため、この3窓構成でも安全）。
 */
import { execSync } from "child_process";
import { existsSync } from "fs";

const root = new URL("..", import.meta.url).pathname;
const run = (cmd) => execSync(cmd, { stdio: "inherit", cwd: root });

function hasPlaywrightChromium() {
  if (process.env.PLAYWRIGHT_CHROMIUM_PATH) return true;
  if (existsSync("/opt/pw-browsers/chromium")) return true;
  return false;
}

run("node scripts/restore-entry.mjs");
try {
  run("npm test");
} finally {
  run("node scripts/reset-entry.mjs");
}

if (!hasPlaywrightChromium()) {
  console.warn("Playwright chromiumが見つからないため、npx playwright install chromiumでインストールします…");
  run("npx playwright install chromium");
}
run("npm run test:e2e");

run("node scripts/restore-entry.mjs");
try {
  run("npx vite build");
} finally {
  run("node scripts/reset-entry.mjs");
}
