import { readFileSync, writeFileSync } from "fs";

const files = ["sw.js"];

for (const file of files) {
  const content = readFileSync(file, "utf8");
  const match = content.match(/combrawl-v(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    console.error(`No version found in ${file}`);
    process.exit(1);
  }
  const [, major, minor, patch] = match;
  const newVersion = `combrawl-v${major}.${minor}.${Number(patch) + 1}`;
  const newContent = content.replace(/combrawl-v\d+\.\d+\.\d+/, newVersion);
  writeFileSync(file, newContent);
  console.log(`SW version: ${match[0]} → ${newVersion}`);
}
