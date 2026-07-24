import { test, expect } from "@playwright/test";

test("splash -> title -> stage select -> game screen", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#screen-splash")).toHaveClass(/active/);

  await page.click("#screen-splash");
  await expect(page.locator("#screen-title")).toHaveClass(/active/);

  await page.click("#btn-stage-select");
  await expect(page.locator("#screen-stage-select")).toHaveClass(/active/);

  const firstStage = page.locator(".stage-btn:not(.locked)").first();
  await expect(firstStage).toBeVisible();
  await firstStage.click();

  await expect(page.locator("#screen-game")).toHaveClass(/active/);
  await expect(page.locator("#hud-stage")).not.toBeEmpty();
  await expect(page.locator("#hud-moves")).not.toBeEmpty();
});

test("help screen is reachable from title and back", async ({ page }) => {
  await page.goto("/");
  await page.click("#screen-splash");
  await expect(page.locator("#screen-title")).toHaveClass(/active/);

  await page.click("#btn-help");
  await expect(page.locator("#screen-help")).toHaveClass(/active/);

  await page.click("#btn-back-help");
  await expect(page.locator("#screen-title")).toHaveClass(/active/);
});
