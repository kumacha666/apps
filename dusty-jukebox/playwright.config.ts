import { defineConfig } from "@playwright/test";
import { existsSync } from "fs";

// Other apps use the stable sandbox symlink when it is available, while a
// normal developer/CI installation is resolved by Playwright itself.
const sandboxChromium = "/opt/pw-browsers/chromium";
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_PATH || (existsSync(sandboxChromium) ? sandboxChromium : undefined);
const launchOptions = chromiumPath ? { executablePath: chromiumPath } : {};

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  use: { baseURL: "http://localhost:5191", launchOptions },
  webServer: {
    command: "npx vite --port 5191",
    env: {
      VITE_GOOGLE_CLIENT_ID: "e2e-client",
      VITE_E2E: "true",
    },
    url: "http://localhost:5191",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
