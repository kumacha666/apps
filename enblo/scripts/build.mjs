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
 *
 * 2026-07-22、Codexレビュー指摘（追加）: Playwrightのchromiumが一切
 * インストールされていない環境（フレッシュチェックアウト・Codex自身のレビュー環境等）
 * では、E2Eをハードゲートにすると npm run deploy 自体が失敗してしまう。
 *
 * 2026-07-22、Codexレビュー指摘（さらに追加）: `~/.cache/ms-playwright`を
 * 決め打ちで見に行く実装だと、macOS/Windows/`PLAYWRIGHT_BROWSERS_PATH=0`等の
 * プラットフォーム固有キャッシュ位置では常にfalse判定になり、視覚E2Eが
 * 無言でスキップされ続けてしまう。キャッシュ位置を自前で推測せず、
 * `@playwright/test`自身の解決ロジック（`chromium.executablePath()`）に
 * 判定を委ねる（このサンドボックス環境固有の安定シンボリックリンクだけは
 * 例外的にそのまま先に見る。インストール済みのPlaywrightのバージョンが
 * このサンドボックスに焼き込まれたリビジョンと一致しないケースがあるため）
 *
 * 2026-07-22、Codexレビュー指摘（さらに追加）: 「見つからなければ警告してスキップ」
 * だと、ブラウザ未インストール環境でE2Eを一度も実行せずに`npm run deploy`が
 * 成功してしまい、「視覚崩れをE2Eで必ず検知する」という本来の目的を満たせない。
 * スキップして成功扱いにするのではなく、見つからない場合は
 * `npx playwright install chromium` で自前でインストールしてから必ずE2Eを実行する
 * （インストール自体が失敗する＝ネットワーク等の環境要因の場合は、素直にビルドが
 * 失敗するのが正しい。silent successより明示的なfailureの方が安全）
 */
import { execSync } from "child_process";
import { existsSync } from "fs";
import { chromium } from "@playwright/test";

const root = new URL("..", import.meta.url).pathname;
const run = (cmd) => execSync(cmd, { stdio: "inherit", cwd: root });

function hasPlaywrightChromium() {
  if (process.env.PLAYWRIGHT_CHROMIUM_PATH) return true;
  if (existsSync("/opt/pw-browsers/chromium")) return true;
  try {
    return existsSync(chromium.executablePath());
  } catch {
    return false;
  }
}

run("node scripts/restore-entry.mjs");
try {
  run("npm test");
  if (!hasPlaywrightChromium()) {
    console.warn("Playwright chromiumが見つからないため、npx playwright install chromiumでインストールします…");
    run("npx playwright install chromium");
  }
  run("npm run test:e2e");
  run("npx vite build");
} finally {
  run("node scripts/reset-entry.mjs");
}
