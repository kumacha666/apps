/**
 * root index.htmlのscript参照をViteが解決できる ./src/main.ts に戻す。
 * deployでdist/index.htmlが上書きするため、buildのたびに必要（prebuildから毎回呼ぶ）。
 * これを怠ると、直近のdeployで書き出された ./game.js を素通りさせるだけの
 * ビルドになり、src/main.tsへの変更が反映されない「見た目だけ成功するビルド」になる。
 */
import { readFileSync, writeFileSync } from "fs";

const path = new URL("../index.html", import.meta.url).pathname;
let html = readFileSync(path, "utf8");

html = html.replace(
  /<script[^>]*\bsrc="\.\/game\.js"[^>]*>/,
  '<script type="module" crossorigin src="./src/main.ts">'
);
html = html.replace(/<link rel="stylesheet" crossorigin href="\.\/style\.css">\n?/, "");

writeFileSync(path, html);
console.log("Entry restored: ./game.js → ./src/main.ts");
