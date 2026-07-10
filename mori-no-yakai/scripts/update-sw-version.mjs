import { readFileSync, writeFileSync } from "fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const [major, minor, patch] = pkg.version.split(".").map(Number);
const newVersion = `${major}.${minor}.${patch + 1}`;

pkg.version = newVersion;
writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");

const swContent = readFileSync("sw.js", "utf8").replace(
  /mori-no-yakai-v\d+\.\d+\.\d+/,
  `mori-no-yakai-v${newVersion}`
);
writeFileSync("sw.js", swContent);

writeFileSync("version.json", JSON.stringify({ version: newVersion }) + "\n");

console.log(`Version bumped to ${newVersion}`);
