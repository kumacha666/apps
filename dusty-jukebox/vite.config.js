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
        // music-metadataはフォーマットごとのパーサーを内部でdynamic import()する（コード分割）。
        // このアプリのdeployスクリプトはdist/app.js1本のみをルート直下にコピーする前提
        // （apps/CLAUDE.md「ルート直下に存在するgame.js/style.css/sw.jsはビルド成果物のコピー」）
        // のため、分割されたチャンクを単一ファイルへ強制的にインライン化する。
        inlineDynamicImports: true,
      },
    },
  },
  test: {
    environment: "node",
  },
}));
