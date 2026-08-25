import { readFileSync, writeFileSync } from "fs";

const file = "sw.js";
const content = readFileSync(file, "utf8");
const match = content.match(/dusty-jukebox-v(\d+)\.(\d+)\.(\d+)/);
if (!match) {
  console.error(`No version found in ${file}`);
  process.exit(1);
}
const [, major, minor, patch] = match;
const next = `dusty-jukebox-v${major}.${minor}.${Number(patch) + 1}`;
writeFileSync(file, content.replace(/dusty-jukebox-v\d+\.\d+\.\d+/, next));
console.log(`SW version: ${match[0]} → ${next}`);
