import { test, expect } from "@playwright/test";

test("title -> class select -> combat -> next screen", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#screen-title")).toHaveClass(/active/);

  await page.click("#btn-start");
  await expect(page.locator("#screen-class-select")).toHaveClass(/active/);

  await page.click("#class-grid .option-card >> nth=0");
  await expect(page.locator("#screen-combat")).toHaveClass(/active/);

  await page.waitForFunction(() => {
    const upgrade = document.getElementById("screen-upgrade");
    const result = document.getElementById("screen-result");
    return upgrade?.classList.contains("active") || result?.classList.contains("active");
  }, { timeout: 15000 });

  const activeId = await page.evaluate(
    () => document.querySelector(".screen.active")?.id
  );
  expect(["screen-upgrade", "screen-result"]).toContain(activeId);
});

test("permanent upgrade screen is reachable from title", async ({ page }) => {
  await page.goto("/");
  await page.click("#btn-permanent");
  await expect(page.locator("#screen-permanent")).toHaveClass(/active/);
  await expect(page.locator("#permanent-options .option-card").first()).toBeVisible();

  await page.click("#btn-permanent-back");
  await expect(page.locator("#screen-title")).toHaveClass(/active/);
});
