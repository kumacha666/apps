import { test, expect } from "@playwright/test";
import { installGoogleMocks } from "./google-mocks";
import { INDEX_SHEET_HEADER } from "../src/sheets";

const SPREADSHEET_ID = "sheet-1";

function makeRow(overrides: Partial<Record<(typeof INDEX_SHEET_HEADER)[number], string>>): (string | number)[] {
  const row = new Array(INDEX_SHEET_HEADER.length).fill("");
  for (const [key, value] of Object.entries(overrides)) {
    row[INDEX_SHEET_HEADER.indexOf(key as (typeof INDEX_SHEET_HEADER)[number])] = value;
  }
  return row;
}

async function login(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "スプレッドシートへログイン" }).click();
  await expect(page.locator("#status")).toContainText("ログイン済み");
}

test("表記ゆれをチェックして統一し、元に戻せる", async ({ page, context }) => {
  await installGoogleMocks(context, {
    rows: [
      makeRow({ fileId: "1", title: "A", artist: "akb48" }),
      makeRow({ fileId: "2", title: "B", artist: "AKB48" }),
      makeRow({ fileId: "3", title: "C", artist: "AKB48" }),
    ],
  });
  await login(page);
  await page.locator("#spreadsheet-id").fill(SPREADSHEET_ID);

  await page.getByRole("button", { name: "表記ゆれをチェック" }).click();
  await expect(page.locator("#status")).toContainText("1件の表記ゆれ候補");
  await expect(page.locator("#casing-results")).toContainText("AKB48");
  await expect(page.locator("#casing-results")).toContainText("akb48");

  await page.getByRole("button", { name: "統一を適用" }).click();
  await expect(page.locator("#status")).toContainText("1件の表記ゆれを統一しました");

  await page.getByRole("button", { name: "直前の統一を元に戻す" }).click();
  await expect(page.locator("#status")).toContainText("1件の表記ゆれ統一を元に戻しました");
});

test("文字化けをチェックして修復し、元に戻せる", async ({ page, context }) => {
  // repairGarbledText()で実際に往復可能な実例（lib.test.tsの既存ケースと同じ由来）。
  await installGoogleMocks(context, {
    rows: [makeRow({ fileId: "1", title: "縺薙ｓ縺ｫ縺｡縺ｯ荳也阜", artist: "Artist" })],
  });
  await login(page);
  await page.locator("#spreadsheet-id").fill(SPREADSHEET_ID);

  await page.getByRole("button", { name: "文字化けをチェック" }).click();
  await expect(page.locator("#status")).toContainText("1件の修復候補");
  await expect(page.locator("#garbled-results")).toContainText("こんにちは世界");

  await page.getByRole("button", { name: "修復を適用" }).click();
  await expect(page.locator("#status")).toContainText("1件の文字化けを修復しました");

  await page.getByRole("button", { name: "直前の修復を元に戻す" }).click();
  await expect(page.locator("#status")).toContainText("1件の文字化け修復を元に戻しました");
});

test("ライブラリ健全性チェックで4項目の結果が表示される（書き込みは行わない）", async ({ page, context }) => {
  const mocks = await installGoogleMocks(context, {
    rows: [
      // ①文字化けの疑い（Latin-1範囲文字の混入）
      makeRow({ fileId: "1", title: "Song A", artist: "Rë¡", album: "Best", releaseYear: "2005" }),
      // ②欠落フィールド（album/genreが空）
      makeRow({ fileId: "2", title: "Song B", artist: "Artist" }),
      // ③同一フォルダ内でのタイトル重複
      makeRow({ fileId: "3", parentId: "folderA", title: "Houston" }),
      makeRow({ fileId: "4", parentId: "folderA", title: "Houston" }),
      // ④同一アルバム内でのリリース年の外れ値（Bestアルバムの過半数は2005）
      makeRow({ fileId: "5", album: "Best", artist: "X", releaseYear: "2005" }),
      makeRow({ fileId: "6", album: "Best", artist: "X", releaseYear: "2005" }),
      makeRow({ fileId: "7", album: "Best", artist: "X", releaseYear: "1999" }),
    ],
  });
  await login(page);
  await page.locator("#spreadsheet-id").fill(SPREADSHEET_ID);

  await page.getByRole("button", { name: "健全性チェックを実行" }).click();
  await expect(page.locator("#status")).toContainText("件の要確認項目が見つかりました");
  await expect(page.locator("#status")).toContainText("書き込みは行っていません");

  const results = page.locator("#healthcheck-results");
  await expect(results).toContainText("① 文字化けの疑い");
  await expect(results).toContainText("② 欠落フィールド");
  await expect(results).toContainText("③ 同一フォルダ内でのタイトル重複");
  await expect(results).toContainText("④ 同一アルバム内でのリリース年の外れ値");
  await expect(results).toContainText("Rë¡");
  await expect(results).toContainText("「Houston」が2件");
  await expect(results).toContainText("「Best」: 1999");

  // 読み取り専用であることを実際のネットワーク層でも確認する（書き込みAPIが一切呼ばれない）。
  expect(mocks.sheetsWrites).toHaveLength(0);
});

test("チェック時と異なるスプレッドシートIDで適用しようとすると拒否される", async ({ page, context }) => {
  await installGoogleMocks(context, {
    rows: [
      makeRow({ fileId: "1", title: "A", artist: "akb48" }),
      makeRow({ fileId: "2", title: "B", artist: "AKB48" }),
    ],
  });
  await login(page);
  await page.locator("#spreadsheet-id").fill(SPREADSHEET_ID);
  await page.getByRole("button", { name: "表記ゆれをチェック" }).click();
  await expect(page.locator("#status")).toContainText("1件の表記ゆれ候補");

  await page.locator("#spreadsheet-id").fill("different-sheet");
  await page.getByRole("button", { name: "統一を適用" }).click();
  await expect(page.locator("#status")).toContainText("チェック時と異なるスプレッドシートID");
});
