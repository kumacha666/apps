/**
 * npm run build（prebuild）から呼ばれ、E2E(Playwright)実行前にchromiumが
 * 利用可能か確認する。無ければ`npx playwright install chromium`で自前インストール
 * してから必ずE2Eを実行させる（見つからない場合にE2Eを黙ってスキップして
 * ビルドを成功させると、視覚崩れ検知という本来の目的を満たせなくなるため。
 * enblo/enblo-classic/combrawlのbuild.mjsと同じ判断基準・同じ理由）。
 *
 * キャッシュ位置を自前で推測せず、このサンドボックス環境固有の安定
 * シンボリックリンクだけを例外的に先に見て、それ以外はインストールを試みる。
 */
import { execSync } from "child_process";
import { existsSync } from "fs";

function hasPlaywrightChromium() {
  if (process.env.PLAYWRIGHT_CHROMIUM_PATH) return true;
  if (existsSync("/opt/pw-browsers/chromium")) return true;
  return false;
}

if (!hasPlaywrightChromium()) {
  console.warn("Playwright chromiumが見つからないため、npx playwright install chromiumでインストールします…");
  execSync("npx playwright install chromium", { stdio: "inherit" });
}
