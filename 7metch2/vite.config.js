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
          /src="\.\/game\.js"/,
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
        entryFileNames: "game.js",
      },
    },
  },
}));
