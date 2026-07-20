/**
 * ビルド前にroot index.htmlのscript参照をViteが解決できる
 * ./src/main.ts に書き換える。deployでdist/game.jsを上書きするため毎回必要。
 *
 * 書き換え前の内容を .entry-backup.html に退避しておき、
 * postbuild（reset-entry.mjs）でビルド直前の状態に正確に戻せるようにする
 * （enblo/combrawlと同じ方式。2026-07-19、mori-no-yakaiの旧entry-rewriteプラグイン
 * 方式が、Vite 6.4系でsrcの変更がビルドに反映されない既知の不具合の対象になり
 * うることが判明したため、enblo/combrawlで実績のあるこの方式に統一した）。
 */
import { readFileSync, writeFileSync, existsSync } from "fs";

const path = new URL("../index.html", import.meta.url).pathname;
const backupPath = new URL("../.entry-backup.html", import.meta.url).pathname;
let html = readFileSync(path, "utf8");

if (!existsSync(backupPath)) {
  writeFileSync(backupPath, html);
}

html = html.replace(
  /<script[^>]*\bsrc="\.\/game\.js"[^>]*>/,
  '<script type="module" crossorigin src="./src/main.ts">'
);
html = html.replace(/<link rel="stylesheet" crossorigin href="\.\/style\.css">\n?/, "");

writeFileSync(path, html);
console.log("Entry restored: ./game.js → ./src/main.ts");
