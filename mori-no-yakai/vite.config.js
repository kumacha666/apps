import { defineConfig } from "vite";
import { readFileSync } from "fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));

export default defineConfig({
  root: ".",
  base: "./",
  plugins: [
    {
      name: "entry-rewrite",
      transformIndexHtml: {
        order: "pre",
        handler(html) {
          return html.replace(
            /<script type="module"[^>]*src="[^"]*game\.js"/,
            '<script type="module" src="./src/main.ts"'
          );
        },
      },
    },
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: "game.js",
        assetFileNames: (assetInfo) => {
          if (assetInfo.names && assetInfo.names.some((n) => n.endsWith(".css"))) {
            return "style.css";
          }
          return "[name][extname]";
        },
      },
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  test: {
    environment: "node",
  },
});
