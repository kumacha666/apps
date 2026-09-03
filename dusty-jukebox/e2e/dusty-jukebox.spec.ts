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
  const mock = await installGoogleMocks(context, { initialScanCompleted: false });
  await page.goto("/"); await login(page);
  await page.locator("#folder-id").fill("root"); await page.locator("#spreadsheet-id").fill("sheet");
  await page.getByRole("button", { name: /スキャンして索引/ }).click();
  await expect(page.locator("#result-list")).toContainText("音楽ファイル: 1件");
  await expect(page.locator("#status")).toContainText("スキャン完了");
  expect(mock.sheetsWrites).toContainEqual(expect.objectContaining({
    sheet: "index",
    values: expect.arrayContaining([expect.arrayContaining(["song-1"])]),
  }));
  expect(mock.authFailures).toEqual([]);
});

test("抽出失敗曲が0件なら再抽出不要のメッセージを表示する", async ({ context, page }) => {
  await installGoogleMocks(context);
  await page.goto("/"); await login(page);
  await page.locator("#spreadsheet-id").fill("sheet");
  await page.getByRole("button", { name: "抽出失敗曲の再抽出を試みる" }).click();
  await expect(page.locator("#status")).toHaveText("抽出失敗として記録されている曲はありません。");
});

test("再抽出は編集権限をタグ取得前に検証する", async ({ context, page }) => {
  const mock = await installGoogleMocks(context, { extractionFailedCount: 1, spreadsheetCanEdit: false });
  await page.goto("/"); await login(page);
  await page.locator("#spreadsheet-id").fill("sheet");
  await page.getByRole("button", { name: "抽出失敗曲の再抽出を試みる" }).click();
  await expect(page.locator("#status")).toContainText("索引スプレッドシートへの編集権限がありません");
  expect(mock.driveMetadataRequests).toEqual(["sheet"]);
});

test("次へを素早く二回押しても同じ曲を重複要求しない", async ({ context, page }) => {
  await installGoogleMocks(context); await page.goto("/"); await login(page); await openCatalog(page);
  await page.getByRole("button", { name: "次へ" }).dblclick();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /song-2(\?|$)/);
});

test("初回制御前の再生もService Worker準備後にストリームへ到達する", async ({ context, page }) => {
  const mock = await installGoogleMocks(context, { delayServiceWorkerActivation: true }); await page.goto("/"); await login(page);
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller === null)).toBe(true);
  await page.locator("#play-file-id").fill("song-1"); await page.getByRole("button", { name: "この曲を再生" }).click();
  await expect(page.locator("#audio-player")).not.toHaveAttribute("src", /stream\/song-1(\?|$)/);
  mock.releaseServiceWorker();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /stream\/song-1(\?|$)/);
  // The native media loader owns this request. Do not issue a synthetic fetch
  // here: it would add an unrelated request to the same Drive mock counter.
  await expect.poll(() => mock.streamRequests.length).toBeGreaterThan(0);
  expect(mock.authFailures).toEqual([]);
});

test("Driveが期限前のトークンを拒否しても、明示的な認証継続で保留した再生を再開できる", async ({ context, page }) => {
  const mock = await installGoogleMocks(context, { rejectFirstStreamToken: true });
  await page.goto("/"); await login(page);
  await page.locator("#play-file-id").fill("song-1");
  await page.getByRole("button", { name: "この曲を再生" }).click();

  await expect(page.getByRole("button", { name: "認証を更新して続行" })).toBeVisible();
  await expect.poll(() => mock.streamRequests.length).toBe(1);
  await page.getByRole("button", { name: "認証を更新して続行" }).click();

  await expect(page.getByRole("button", { name: "認証を更新して続行" })).toBeHidden();
  await expect.poll(() => mock.streamRequests.length).toBeGreaterThan(1);
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

test("除外は再生キューへ反映され、戻して作り直すと復帰する", async ({ context, page }) => {
  await installGoogleMocks(context); await page.goto("/"); await login(page); await openCatalog(page);
  await page.locator("#catalog-list input").first().uncheck();
  await page.getByRole("button", { name: "次へ" }).click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /song-2(\?|$)/);

  await page.locator("#catalog-list input").first().check();
  await page.getByRole("button", { name: "この条件で再生リストを作る" }).click();
  await page.getByRole("button", { name: "次へ" }).click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /song-1(\?|$)/);
});

test("検索で曲を絞り込み、アルバムをdisc/track順のキューに設定して再生できる", async ({ context, page }) => {
  await installGoogleMocks(context, { albumCatalog: true }); await page.goto("/"); await login(page);
  await page.locator("#folder-id").fill("root"); await page.locator("#spreadsheet-id").fill("sheet");
  await page.getByRole("button", { name: "索引から曲一覧を読み込む" }).click();
  await expect(page.locator("#status")).toContainText("索引から4曲");

  await page.locator("#filter-query").fill("jazz");
  await page.getByRole("button", { name: "この条件で再生リストを作る" }).click();
  await expect(page.locator("#catalog-list li")).toHaveCount(1);
  await expect(page.locator("#catalog-list")).toContainText("Jazz Song");

  const symphony = page.locator("#album-list li").filter({ hasText: "Symphony — Orchestra（3曲）" });
  await symphony.getByRole("button", { name: "このアルバムを再生" }).click();
  await expect(page.locator("#catalog-list li")).toHaveCount(3);
  await expect(page.locator("#catalog-list li")).toHaveText([/Opening/, /Scherzo/, /Finale/]);
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-1(\?|$)/);
});

test("再生リストをプレイリストとして保存し、一覧から読み込み直して再生でき、削除もできる", async ({ context, page }) => {
  await installGoogleMocks(context); await page.goto("/"); await login(page); await openCatalog(page);

  await page.locator("#playlist-name").fill("テストリスト");
  await page.getByRole("button", { name: "現在の再生リストをプレイリストとして保存" }).click();
  await expect(page.locator("#status")).toContainText("プレイリスト「テストリスト」（2曲）を保存しました");
  await expect(page.locator("#playlist-list li")).toHaveCount(1);
  await expect(page.locator("#playlist-list")).toContainText("テストリスト（2曲）");

  // キューを進めてから読み込み直すと、保存した並び順の先頭から再生し直すことを確認する。
  await page.getByRole("button", { name: "次へ" }).click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /song-1(\?|$)/);
  await page.getByRole("button", { name: "次へ" }).click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /song-2(\?|$)/);
  await page.getByRole("button", { name: "読み込んで再生リストにする" }).click();
  await expect(page.locator("#catalog-list li")).toHaveCount(2);
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /song-1(\?|$)/);

  // 削除は取り消せないため確認ダイアログを挟む。キャンセルすれば削除されないことをまず確認する。
  page.once("dialog", (dialog) => void dialog.dismiss());
  await page.getByRole("button", { name: "削除" }).click();
  await expect(page.locator("#playlist-list li")).toHaveCount(1);

  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "削除" }).click();
  await expect(page.locator("#status")).toContainText("プレイリストを削除しました");
  await expect(page.locator("#playlist-list li")).toHaveCount(0);
});

test("プレイリスト一覧の読み込み後に入力欄のスプレッドシートIDを変えても、削除は読み込み時のIDへ送られる", async ({ context, page }) => {
  const mock = await installGoogleMocks(context); await page.goto("/"); await login(page); await openCatalog(page);

  await page.locator("#playlist-name").fill("テストリスト");
  await page.getByRole("button", { name: "現在の再生リストをプレイリストとして保存" }).click();
  await expect(page.locator("#playlist-list li")).toHaveCount(1);

  // 一覧を再読み込みせずに入力欄だけを別のスプレッドシートIDへ書き換えてから削除する。
  await page.locator("#spreadsheet-id").fill("other-sheet");
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "削除" }).click();
  await expect(page.locator("#status")).toContainText("プレイリストを削除しました");

  const wroteToOtherSheet = mock.sheetsWrites.some((w) => w.url.includes("/spreadsheets/other-sheet/"));
  expect(wroteToOtherSheet).toBe(false);
  const wroteToOriginalSheet = mock.sheetsWrites.some((w) => w.url.includes("/spreadsheets/sheet/") && w.sheet === "playlist_tracks");
  expect(wroteToOriginalSheet).toBe(true);
});

test("読み込んだプレイリストの全曲が索引から消えていた場合、直前の再生を止める", async ({ context, page }) => {
  // このプレイリストの収録曲（vanished-song）は現在の索引（song-1/song-2のみ）に存在しない
  // 状態を、事前にplaylist_tracksタブへ直接シードして再現する（アプリのUI操作だけでは、
  // 保存した曲が索引から消えた状態を作れないため）。
  await installGoogleMocks(context, { seedPlaylists: [{ playlistId: "p-vanished", name: "消えた曲", fileIds: ["vanished-song"] }] });
  await page.goto("/"); await login(page); await openCatalog(page);

  await page.getByRole("button", { name: "次へ" }).click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /song-1(\?|$)/);

  await page.getByRole("button", { name: "プレイリスト一覧を更新" }).click();
  await expect(page.locator("#playlist-list")).toContainText("消えた曲（1曲）");
  const pauseCallsBefore = await page.evaluate(() => (window as unknown as { __e2ePauseCalls: number }).__e2ePauseCalls);
  await page.getByRole("button", { name: "読み込んで再生リストにする" }).click();
  await expect(page.locator("#catalog-list li")).toHaveCount(0);
  // play()を丸ごと差し替えているため、HTMLMediaElement.pausedはこの環境では常にtrueのまま
  // 変化せず検証にならない。代わりにpause()が実際に呼ばれたことをカウンタで確認する
  // （google-mocks.tsの__e2ePauseCalls参照。直前の曲が鳴り続けていないことの検証）。
  await expect.poll(() => page.evaluate(() => (window as unknown as { __e2ePauseCalls: number }).__e2ePauseCalls)).toBeGreaterThan(pauseCallsBefore);
});

test("スキャン開始後のアルバム再生は再読み込みエラーになりキューを変更しない", async ({ context, page }) => {
  await installGoogleMocks(context, { albumCatalog: true, delaySheetsReads: true }); await page.goto("/"); await login(page);
  await page.locator("#folder-id").fill("root"); await page.locator("#spreadsheet-id").fill("sheet");
  await page.getByRole("button", { name: "索引から曲一覧を読み込む" }).click();
  await expect(page.locator("#status")).toContainText("索引から4曲");
  await page.locator("#filter-query").fill("jazz");
  await page.getByRole("button", { name: "この条件で再生リストを作る" }).click();
  await expect(page.locator("#catalog-list li")).toHaveCount(1);

  await page.getByRole("button", { name: /スキャンして索引/ }).click();
  const symphony = page.locator("#album-list li").filter({ hasText: "Symphony — Orchestra（3曲）" });
  await symphony.getByRole("button", { name: "このアルバムを再生" }).click();
  await expect(page.locator("#status")).toContainText("曲一覧を再読み込みしてから再生リストを作成してください");
  await expect(page.locator("#catalog-list li")).toHaveCount(1);
  await expect(page.locator("#catalog-list")).toContainText("Jazz Song");
  await expect(page.locator("#audio-player")).not.toHaveAttribute("src", /album-track-/);
});
