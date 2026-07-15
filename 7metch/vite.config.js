import { defineConfig } from "vite";
import { resolve } from "path";
import { readFileSync } from "fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));

export default defineConfig(({ mode }) => ({
  root: ".",
  base: "./",
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    minify: "terser",
    terserOptions: {
      compress: {
        drop_console: false,
        pure_funcs: [],
      },
    },
    rollupOptions: {
      // index.htmlは本番配信用に./game.js（ビルド成果物のコピー）を直接参照するため、
      // Viteのentry-pointは index.html 経由ではなく src/main.ts を直接指定する
      // （HTML内のscript src書き換えによる旧entry-rewrite方式はVite 6系で
      //   entry検出に反映されないことが判明したため廃止）。
      input: resolve(__dirname, "src/main.ts"),
      output: {
        entryFileNames: "game.js",
        assetFileNames: (assetInfo) => {
          if (assetInfo.names && assetInfo.names.some(n => n.endsWith(".css"))) {
            return "style.css";
          }
          return "[name][extname]";
        },
      },
    },
  },
  define: {
    __DEBUG__: JSON.stringify(process.env.NODE_ENV !== "production"),
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  test: {
    environment: "node",
    alias: {
      "./audio": resolve("src/__mocks__/audio.ts"),
      "./animations": resolve("src/__mocks__/animations.ts"),
      "./rendering": resolve("src/__mocks__/rendering.ts"),
      "./vfx": resolve("src/__mocks__/vfx.ts"),
      "./tracking": resolve("src/__mocks__/tracking.ts"),
      "./ui": resolve("src/__mocks__/ui.ts"),
    },
  },
}));
