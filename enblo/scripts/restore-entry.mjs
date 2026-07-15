/**
 * ビルド前にroot index.htmlのscript参照をViteが解決できる
 * ./src/main.ts に書き換える。deployでdist/index.htmlが上書きするため毎回必要。
 *
 * 書き換え前の内容を .entry-backup.html に退避しておき、
 * postbuild（reset-entry.mjs）でビルド直前の状態に正確に戻せるようにする
 * （2026-07-15、Codexレビュー指摘: git checkoutで丸ごと戻すと、index.htmlに
 *   コミット前の手動編集が残っていた場合に消えてしまうため、退避方式に変更）。
 */
import { readFileSync, writeFileSync, existsSync } from "fs";

const path = new URL("../index.html", import.meta.url).pathname;
const backupPath = new URL("../.entry-backup.html", import.meta.url).pathname;
let html = readFileSync(path, "utf8");

// prebuildとpredeployの両方から呼ばれ二重実行されうるため、
// 既に書き換え済み（バックアップが存在する）場合は再度バックアップを取らない
if (!existsSync(backupPath)) {
  writeFileSync(backupPath, html);
}

html = html.replace(
  /<script[^>]*\bsrc="\.\/game\.js"[^>]*>/,
  '<script type="module" crossorigin src="./src/main.ts">'
);
// dist/index.htmlが注入するstyle linkが残っていれば除去（Viteがbuild時に再注入する）
html = html.replace(/<link rel="stylesheet" crossorigin href="\.\/style\.css">\n?/, "");

writeFileSync(path, html);
console.log("Entry restored: ./game.js → ./src/main.ts");
