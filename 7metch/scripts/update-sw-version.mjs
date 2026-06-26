import { readFileSync, writeFileSync } from "fs";

const files = ["sw.js", "public/sw.js"];
let updated = false;

for (const file of files) {
  const content = readFileSync(file, "utf8");
  const match = content.match(/7metch-v(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    console.error(`No version found in ${file}`);
    process.exit(1);
  }
  const [, major, minor, patch] = match;
  const newVersion = `7metch-v${major}.${minor}.${Number(patch) + 1}`;
  const newContent = content.replace(/7metch-v\d+\.\d+\.\d+/, newVersion);
  writeFileSync(file, newContent);
  if (!updated) {
    console.log(`SW version: ${match[0]} → ${newVersion}`);
    updated = true;
  }
}
