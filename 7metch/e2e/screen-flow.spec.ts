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

// startStage()の再入ガードにG.animatingを流用していた旧実装では、直前の手の
// マッチ演出(シャッフル等、詰み回復とは無関係)がまだ解決中の間に「リトライ」を
// 押すと、演出中を理由にstartStage()本体が黙って無視される回帰があった
// (PR #361, /code-review指摘)。専用のG.stageStartingへ分離した修正の恒久的な
// 回帰テスト。+3手アイテムで残り手数をbaseと区別できる値にしておき、シャッフル
// 演出中に即座にリトライを押しても実際に効く(baseへ戻る)ことを確認する
test("retry during an unrelated match animation is not silently ignored", async ({ page }) => {
  await page.goto("/");
  await page.click("#screen-splash");
  await expect(page.locator("#screen-title")).toHaveClass(/active/);

  // デバッグモードを有効化し、アイテム使用のコイン制限を外す(G.debugMode)
  for (let i = 0; i < 7; i++) await page.click("#version-info");
  await expect(page.locator("#debug-panel")).not.toHaveClass(/hidden/);
  await page.click("#btn-debug-close");

  await page.click("#btn-stage-select");
  await expect(page.locator("#screen-stage-select")).toHaveClass(/active/);
  await page.locator(".stage-btn:not(.locked)").first().click();
  await expect(page.locator("#screen-game")).toHaveClass(/active/);

  const tutorial = page.locator("#tutorial-overlay");
  if (await tutorial.isVisible()) await tutorial.click();

  const movesBaseline = await page.locator("#hud-moves").innerText();
  await page.click('[data-item="addmoves"]');
  await expect(page.locator("#hud-moves")).not.toHaveText(movesBaseline);

  // シャッフル演出(G.animating=true、300ms+)を発生させ、その解決を待たず直後に
  // リトライを押す
  await page.click('[data-item="shuffle"]');
  await page.click("#btn-retry");
  const confirmBtn = page.locator(".modal-btn-confirm");
  if (await confirmBtn.isVisible().catch(() => false)) await confirmBtn.click();

  // リトライが効いていればステージが再生成され、手数はbaselineへ戻る
  // (旧実装では無視されるためbaseline+3のまま止まっていた)
  await expect(page.locator("#hud-moves")).toHaveText(movesBaseline);
});
