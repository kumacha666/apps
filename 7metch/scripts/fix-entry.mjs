import { readFileSync, writeFileSync } from "fs";

const html = readFileSync("index.html", "utf8");
const fixed = html.replace(
  /<script type="module"[^>]*src="[^"]*"/,
  '<script type="module" src="./src/main.ts"'
);
writeFileSync("index.html", fixed);
console.log("Entry point set to ./src/main.ts");
