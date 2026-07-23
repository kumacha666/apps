import { test, expect } from "@playwright/test";

test("title -> game screen -> battle resolves", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#titleScreen")).toBeVisible();

  await page.click("#titleModeRow button >> nth=0");
  await expect(page.locator("#gameScreen")).toBeVisible();
  await expect(page.locator("#titleScreen")).toBeHidden();

  await page.click("#startBtn");
  await expect(page.locator("#startBtn")).toBeDisabled();

  // 1ラウンド目の戦闘が自動進行で決着する（カード選択画面が出る、またはリザルトパネルが出る）まで待つ
  await page.waitForFunction(
    () => {
      const cardArea = document.getElementById("cardArea");
      return (cardArea?.children.length ?? 0) > 0;
    },
    { timeout: 15000 }
  );
});

test("gallery screen is reachable from title", async ({ page }) => {
  await page.goto("/");
  await page.click("#openGalleryBtn");
  await expect(page.locator("#galleryScreen")).toBeVisible();
  await expect(page.locator("#titleScreen")).toBeHidden();

  await page.click("#galleryBackBtn");
  await expect(page.locator("#titleScreen")).toBeVisible();
});
