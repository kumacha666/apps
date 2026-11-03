import { defineConfig } from "vite";
import { readFileSync } from "fs";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));

export default defineConfig(({ command }) => ({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  root: ".",
  base: "./",
  plugins: [{
    name: "entry-rewrite",
    transformIndexHtml(html) {
      if (command === "serve") {
        return html.replace(
          /src="\.\/app\.js"/,
          'src="./src/main.ts"'
        );
      }
      return html;
    },
  }],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    minify: true,
    rollupOptions: {
      input: { main: "src/main.ts" },
      output: {
        entryFileNames: "app.js",
        // music-metadata（アルバムアートの埋め込み画像を読む）はフォーマットごとのパーサーを内部でdynamic import()する。
        // deployはdist/app.js1本だけをコピーする前提なので、分割されたチャンクを1ファイルへまとめる（本体dusty-jukeboxと同じ）。
        inlineDynamicImports: true,
      },
    },
  },
  test: {
    environment: "node",
    exclude: ["e2e/**", "node_modules/**"],
  },
}));
