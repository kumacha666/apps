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
 *
 * 2026-07-22、Codexレビュー指摘（さらに追加）: 汎用フォールバック分岐で
 * `chromium.executablePath()`（通常のchromeバイナリ）の存在だけを見ていたが、
 * このE2E設定はexecutablePath未指定・headless実行のため、Playwrightは
 * 実際には別バイナリ（chromium-headless-shell）を起動しに行く。chrome本体は
 * あってもheadless-shellが無い環境では、この判定が誤ってtrueを返し
 * installがスキップされてしまっていた。汎用フォールバックでは「入っているか」を
 * 自前で推測するのをやめ、判断不能な場合は常にinstallを試みる（このサンドボックス
 * 固有の2つの近道はネットワーク不要なのでそのまま残す。実際に`npx playwright
 * install chromium`を無条件実行するとこのサンドボックスではネットワーク制限で
 * 失敗することを確認済み）
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
  if (!hasPlaywrightChromium()) {
    console.warn("Playwright chromiumが見つからないため、npx playwright install chromiumでインストールします…");
    run("npx playwright install chromium");
  }
  run("npm run test:e2e");
  run("npx vite build");
} finally {
  run("node scripts/reset-entry.mjs");
}
