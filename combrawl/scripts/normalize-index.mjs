/**
 * npm run deploy でルート直下にコピーしたdist/index.htmlは、Viteがscript/link
 * タグ挿入時に大量の空白パディングを付与する（sourcemap位置合わせ目的とみられる）。
 * このパディング付きのindex.htmlをそのままコミットして次回ビルドの入力にすると、
 * restore-entry.mjs→vite buildのたびにViteがそのパディングの上にさらにパディングを
 * 積み増し、デプロイのたびにindex.htmlがほぼ倍々に肥大化し続ける
 * （2026-07-15、Codexレビュー指摘。実測: 1回目7.9KB→2回目14KB→...と倍増）。
 * ビルド直後に、注入されたタグ直前の空白ランを1個の改行+インデントへ正規化することで
 * この複利的な肥大化を断つ。
 */
import { readFileSync, writeFileSync } from "fs";

const path = new URL("../index.html", import.meta.url).pathname;
let html = readFileSync(path, "utf8");

const before = html.length;
html = html.replace(/[ \t]{2,}(<script type="module")/g, "\n$1");
html = html.replace(/[ \t]{2,}(<link rel="stylesheet")/g, "\n$1");
html = html.replace(/[ \t]{2,}(<\/head>)/g, "\n$1");

writeFileSync(path, html);
console.log(`index.html normalized: ${before} bytes → ${html.length} bytes`);
