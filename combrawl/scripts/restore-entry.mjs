/**
 * deployの前にroot index.htmlのscript参照をViteが解決できる
 * ./src/main.ts に戻す。deployでdist/index.htmlが上書きするため毎回必要。
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
