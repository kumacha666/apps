import { defineConfig } from "vite";

export default defineConfig(({ command }) => ({
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
