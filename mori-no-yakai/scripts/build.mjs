/**
 * npm run build のオーケストレーションスクリプト。
 * entry書き換え → テスト → vite build を実行し、途中で失敗しても
 * 必ず（try/finallyで）index.htmlを元の状態に復元する（enblo/combrawlと同じ方式）。
 */
import { execSync } from "child_process";

const root = new URL("..", import.meta.url).pathname;
const run = (cmd) => execSync(cmd, { stdio: "inherit", cwd: root });

run("node scripts/restore-entry.mjs");
try {
  run("npm test");
  run("npx vite build");
} finally {
  run("node scripts/reset-entry.mjs");
}
