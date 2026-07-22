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
 * E2EはPlaywrightのwebServer設定（`npx vite --port 5183`）が自前でdevサーバーを
 * 立てるため、restore-entry済み（index.htmlが./src/main.tsを指す）状態であれば
 * vite buildの前後どちらでも実行できる。unit testの直後に置く。
 */
import { execSync } from "child_process";

const root = new URL("..", import.meta.url).pathname;
const run = (cmd) => execSync(cmd, { stdio: "inherit", cwd: root });

run("node scripts/restore-entry.mjs");
try {
  run("npm test");
  run("npm run test:e2e");
  run("npx vite build");
} finally {
  run("node scripts/reset-entry.mjs");
}
