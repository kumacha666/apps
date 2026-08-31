import { existsSync } from "fs";
import { execFileSync } from "child_process";

// Keep the build/deploy gate equivalent to the other Playwright-enabled apps.
// Do not infer Playwright's cache layout here: chromium.executablePath() only
// identifies the full Chromium binary, while Playwright can run with only its
// headless shell installed. Outside this sandbox's stable shortcuts, attempt
// Playwright's own installation command so an unavailable browser fails the
// build instead of silently skipping the E2E gate.
const sandboxChromium = "/opt/pw-browsers/chromium";

function hasPlaywrightChromium() {
  if (process.env.PLAYWRIGHT_CHROMIUM_PATH) return true;
  if (existsSync(sandboxChromium)) return true;
  return false;
}

// Node's CVE-2024-27980 mitigation requires shell: true to invoke a .cmd file
// directly on Windows, or execFileSync fails with EINVAL before spawning anything.
const isWindows = process.platform === "win32";

if (!hasPlaywrightChromium()) {
  console.warn("Playwright Chromiumが見つからないため、npx playwright install chromiumでインストールします…");
  execFileSync(isWindows ? "npx.cmd" : "npx", ["playwright", "install", "chromium"], { stdio: "inherit", shell: isWindows });
}

execFileSync(isWindows ? "npm.cmd" : "npm", ["run", "test:e2e"], { stdio: "inherit", shell: isWindows });
