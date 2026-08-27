import { existsSync } from "fs";
import { execFileSync } from "child_process";
import { chromium } from "@playwright/test";

// Keep the build/deploy gate equivalent to the other Playwright-enabled apps,
// but do not make a source build impossible in minimal/offline environments
// where Playwright's browser binary is intentionally absent.
const sandboxChromium = "/opt/pw-browsers/chromium";
const browserPath = process.env.PLAYWRIGHT_CHROMIUM_PATH
  || (existsSync(sandboxChromium) ? sandboxChromium : chromium.executablePath());

if (!existsSync(browserPath)) {
  console.warn("Playwright Chromium が見つからないため、E2E はスキップします。");
  process.exit(0);
}

execFileSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "test:e2e"], { stdio: "inherit" });
