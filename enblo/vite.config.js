import { defineConfig } from "vite";
import { readFileSync } from "fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));

export default defineConfig(() => ({
  root: ".",
  base: "./",
  publicDir: "public",
  plugins: [{
    name: "entry-rewrite",
    transformIndexHtml(html) {
      return html.replace(
        /<script type="module"[^>]*src="[^"]*game\.js"/,
        '<script type="module" src="./src/main.ts"'
      );
    },
  }],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    minify: "terser",
    rollupOptions: {
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
    exclude: ["e2e/**", "node_modules/**"],
  },
}));
