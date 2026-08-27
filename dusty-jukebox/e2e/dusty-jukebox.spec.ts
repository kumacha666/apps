import { expect, test } from "@playwright/test";
import { installGoogleMocks } from "./google-mocks";

async function login(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: /ログイン/ }).click();
  await expect(page.locator("#status")).toContainText("ログイン済み");
}
async function openCatalog(page: import("@playwright/test").Page) {
  await page.locator("#folder-id").fill("root");
  await page.locator("#spreadsheet-id").fill("sheet");
  await page.getByRole("button", { name: "索引から曲一覧を読み込む" }).click();
  await expect(page.locator("#status")).toContainText("索引から2曲");
  await page.getByRole("button", { name: "この条件で再生リストを作る" }).click();
}

test("ログインからスキャンして索引を書き込める", async ({ context, page }) => {
  const mock = await installGoogleMocks(context);
  await page.goto("/"); await login(page);
  await page.locator("#folder-id").fill("root"); await page.locator("#spreadsheet-id").fill("sheet");
  await page.getByRole("button", { name: /スキャンして索引/ }).click();
  await expect(page.locator("#result-list")).toContainText("音楽ファイル: 1件");
  expect(mock.authFailures).toEqual([]);
});

test("次へを素早く二回押しても同じ曲を重複要求しない", async ({ context, page }) => {
  await installGoogleMocks(context); await page.goto("/"); await login(page); await openCatalog(page);
  await page.getByRole("button", { name: "次へ" }).dblclick();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /song-2$/);
});

test("初回制御前の再生もService Worker準備後にストリームへ到達する", async ({ context, page }) => {
  const mock = await installGoogleMocks(context); await page.goto("/"); await login(page);
  await page.locator("#play-file-id").fill("song-1"); await page.getByRole("button", { name: "この曲を再生" }).click();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  const status = await page.evaluate(() => fetch("./stream/song-1", { headers: { Range: "bytes=0-1" } }).then((response) => response.status));
  expect(status).toBe(206);
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /stream\/song-1$/);
  expect(mock.streamRequests).toHaveLength(1);
  expect(mock.authFailures).toEqual([]);
});

test("スキャン中のカタログ読み込みは相互排他で拒否される", async ({ context, page }) => {
  await installGoogleMocks(context, { delaySheetsReads: true }); await page.goto("/"); await login(page);
  await page.locator("#folder-id").fill("root"); await page.locator("#spreadsheet-id").fill("sheet");
  await page.getByRole("button", { name: /スキャンして索引/ }).click();
  await expect(page.getByRole("button", { name: "索引から曲一覧を読み込む" })).toBeDisabled();
});

test("不正なsyncヘッダーは誤った設定を使わずエラーになる", async ({ context, page }) => {
  await installGoogleMocks(context, { invalidSyncHeader: true }); await page.goto("/"); await login(page);
  await page.locator("#folder-id").fill("root"); await page.locator("#spreadsheet-id").fill("sheet");
  await page.getByRole("button", { name: /スキャンして索引/ }).click();
  await expect(page.locator("#status")).toContainText("sync");
});

test("除外はチェックを戻すと一覧へ復帰する", async ({ context, page }) => {
  await installGoogleMocks(context); await page.goto("/"); await login(page); await openCatalog(page);
  const first = page.locator("#catalog-list input").first(); await first.uncheck(); await expect(first).not.toBeChecked(); await first.check(); await expect(first).toBeChecked();
});
