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
  await page.getByRole("button", { name: "Googleへログイン" }).click();
  await expect(page.locator("#status")).toContainText("ログイン済み");
}

test("46列のレガシーindexグリッドから全データ行を読み取れる", async ({ page, context }) => {
  const mocks = await installGoogleMocks(context, {
    rows: [makeRow({ fileId: "1", title: "Song", artist: "Artist", album: "Album", genre: "Rock" })],
  });
  await login(page);
  await page.locator("#spreadsheet-id").fill(SPREADSHEET_ID);
  await page.getByRole("button", { name: "健全性チェックを実行" }).click();
  await expect(page.locator("#status")).toContainText("要確認項目は見つかりませんでした");
  expect(mocks.sheetsReadRanges).toContain("'index'");
});

test("46列のレガシーindexグリッドではGenre表記ゆれチェックを拒否する", async ({ page, context }) => {
  const mocks = await installGoogleMocks(context, {
    rows: [
      makeRow({ fileId: "1", title: "A", genre: "rock" }),
      makeRow({ fileId: "2", title: "B", genre: "Rock" }),
    ],
  });
  await login(page);
  await page.locator("#spreadsheet-id").fill(SPREADSHEET_ID);

  await page.getByRole("button", { name: "Genre表記ゆれをチェック" }).click();

  await expect(page.locator("#status")).toContainText("本体アプリ（dusty-jukebox）でスキャンを一度実行してから");
  await expect(page.locator("#genre-results")).toBeEmpty();
  await expect(page.getByRole("button", { name: "Genre統一を適用" })).toBeDisabled();
  expect(mocks.sheetsWrites).toEqual([]);
});

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

  await page.getByRole("button", { name: "表記ゆれをチェック", exact: true }).click();
  await expect(page.locator("#status")).toContainText("1件の表記ゆれ候補");
  await expect(page.locator("#casing-results")).toContainText("AKB48");
  await expect(page.locator("#casing-results")).toContainText("akb48");

  await page.getByRole("button", { name: "統一を適用", exact: true }).click();
  await expect(page.locator("#status")).toContainText("1件の表記ゆれを統一しました");

  await page.getByRole("button", { name: "直前の統一を元に戻す", exact: true }).click();
  await expect(page.locator("#status")).toContainText("1件の表記ゆれ統一を元に戻しました");
});

test("Genre表記ゆれをトークン単位で統一し、元に戻せる", async ({ page, context }) => {
  const mocks = await installGoogleMocks(context, {
    currentHeader: true,
    rows: [
      makeRow({ fileId: "1", title: "A", genre: "rock / Jazz" }),
      makeRow({ fileId: "2", title: "B", genre: "Rock / jazz" }),
    ],
  });
  await login(page);
  await page.locator("#spreadsheet-id").fill(SPREADSHEET_ID);

  await page.getByRole("button", { name: "Genre表記ゆれをチェック" }).click();
  await expect(page.locator("#status")).toContainText("2件のGenre表記ゆれ候補");
  await expect(page.locator("#genre-results")).toContainText("トークン: 「Rock」(1曲) / 「rock」(1曲)");
  await expect(page.locator("#genre-results")).toContainText("トークン: 「Jazz」(1曲) / 「jazz」(1曲)");
  await page.screenshot({ path: "/tmp/genre-normalization-ui.png", fullPage: true });

  await page.getByRole("button", { name: "Genre統一を適用" }).click();
  await expect(page.locator("#status")).toContainText("2曲のGenre表記ゆれを統一しました");
  expect(mocks.getIndexRows().map((row) => row[INDEX_SHEET_HEADER.indexOf("genre_override")])).toEqual([
    "Rock / Jazz",
    "Rock / Jazz",
  ]);

  await page.getByRole("button", { name: "直前のGenre統一を元に戻す" }).click();
  await expect(page.locator("#status")).toContainText("2曲のGenre表記ゆれ統一を元に戻しました");
  expect(mocks.getIndexRows().map((row) => row[INDEX_SHEET_HEADER.indexOf("genre_override")])).toEqual(["", ""]);
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

test("欠落フィールドを一覧表示し、入力した項目だけを保存できる（元に戻せる）", async ({ page, context }) => {
  await installGoogleMocks(context, {
    rows: [makeRow({ fileId: "1", title: "Song A" })],
  });
  await login(page);
  await page.locator("#spreadsheet-id").fill(SPREADSHEET_ID);

  await page.getByRole("button", { name: "欠落フィールドをチェック" }).click();
  await expect(page.locator("#status")).toContainText("2件の欠落フィールドが見つかりました");

  // title="Song A"のためtitleは含まれず、artist/albumの2件が表示される（フィールド順）。
  const inputs = page.locator("#missing-field-results input");
  await expect(inputs).toHaveCount(2);
  await inputs.nth(0).fill("手動入力アーティスト");
  // albumの入力欄は空欄のままにする→保存対象から除外されるはず。

  await page.getByRole("button", { name: "入力した内容を保存" }).click();
  await expect(page.locator("#status")).toContainText("1件を保存しました");

  await page.getByRole("button", { name: "直前の保存を元に戻す" }).click();
  await expect(page.locator("#status")).toContainText("1件の保存を元に戻しました");
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
  await page.getByRole("button", { name: "表記ゆれをチェック", exact: true }).click();
  await expect(page.locator("#status")).toContainText("1件の表記ゆれ候補");

  await page.locator("#spreadsheet-id").fill("different-sheet");
  await page.getByRole("button", { name: "統一を適用", exact: true }).click();
  await expect(page.locator("#status")).toContainText("チェック時と異なるスプレッドシートID");
});

test("アルバムアート：埋め込みのある表紙は縮めてDriveへ置き、無いものはWebで探し、どれもalbumArtタブに記録する", async ({ page, context }) => {
  const mocks = await installGoogleMocks(context, {
    currentHeader: true,
    rows: [
      makeRow({ fileId: "e1", album: "Embedded", artist: "Band", parentId: "p-emb", trackNumber: "1" }),
      makeRow({ fileId: "e2", album: "Embedded", artist: "Band", parentId: "p-emb", trackNumber: "2" }),
      makeRow({ fileId: "f1", album: "Found", artist: "Web Artist", parentId: "p-found", trackNumber: "1" }),
      // ディスクごとのフォルダ（CD1・CD2）に分かれた2枚組は、上のフォルダで1枚にまとめる
      makeRow({ fileId: "m1", album: "Missing", artist: "Nobody", parentId: "cd1", trackNumber: "1" }),
      makeRow({ fileId: "m2", album: "Missing", artist: "Nobody", parentId: "cd2", trackNumber: "1" }),
    ],
    coverArtFileIds: ["e2"],
    folderRows: [
      ["cd1", "CD1", "p-box"],
      ["cd2", "CD2", "p-box"],
    ],
  });
  await login(page);
  await page.locator("#spreadsheet-id").fill(SPREADSHEET_ID);
  await page.getByRole("button", { name: "表紙を集める" }).click();
  await expect(page.locator("#status")).toContainText("3枚の表紙を調べました", { timeout: 20_000 });
  await expect(page.locator("#art-results")).toContainText("全3枚：埋め込み 1・MusicBrainz 1・iTunes 0・見つからない 1・読めなかった 0");

  const rows = mocks.getAlbumArtRows() ?? [];
  expect(rows[0]).toEqual(["albumFolderId", "album", "artist", "embedded", "artFileId", "source", "sourceId", "checkedFileId", "updatedAt", "match"]);
  const byAlbum = Object.fromEntries(rows.slice(1).map((r) => [r[1], r]));
  // 埋め込みは1曲目に無く、最後の曲（e2）にあった
  expect(byAlbum["Embedded"].slice(0, 8)).toEqual(["p-emb", "Embedded", "Band", "yes", expect.stringMatching(/^art-/), "embedded", "", "e2"]);
  expect(byAlbum["Found"].slice(0, 8)).toEqual(["p-found", "Found", "Web Artist", "no", expect.stringMatching(/^art-/), "musicbrainz", "rg-found", "f1"]);
  expect(byAlbum["Missing"].slice(0, 6)).toEqual(["p-box", "Missing", "Nobody", "no", "", "notfound"]);
  expect(mocks.driveFolders).toEqual(["folder-1"]);
  expect(mocks.driveUploads.map((u) => u.parents)).toEqual([["folder-1"], ["folder-1"]]);
  // 埋め込みのあったアルバムはWebで探さない
  expect(mocks.webRequests.some((u) => u.includes("Embedded"))).toBe(false);
  expect(mocks.webRequests.some((u) => u.includes('releasegroup:"Found"'))).toBe(true);

  // もう一度押しても、記録済みのアルバムは調べ直さない
  const webBefore = mocks.webRequests.length;
  await page.getByRole("button", { name: "表紙を集める" }).click();
  await expect(page.locator("#status")).toContainText("全3枚のアルバムは集め終わっています");
  expect(mocks.webRequests.length).toBe(webBefore);
  expect(mocks.driveUploads).toHaveLength(2);
});

test("アルバムアートの確認：表紙を一覧にし、外す・別の候補から選び直せる（行を並べ替えられていても取り違えない）", async ({ page, context }) => {
  const header = ["albumFolderId", "album", "artist", "embedded", "artFileId", "source", "sourceId", "checkedFileId", "updatedAt"];
  const mocks = await installGoogleMocks(context, {
    currentHeader: true,
    albumArtRows: [
      header,
      ["p1", "Web Album", "Band", "no", "art-old", "musicbrainz", "rg-old", "t1", ""],
      ["p2", "Candidate Me", "Nobody", "no", "", "notfound", "", "t2", ""],
      ["p3", "Embedded One", "Band", "yes", "art-emb", "embedded", "", "t3", ""],
    ],
  });
  await login(page);
  await page.locator("#spreadsheet-id").fill(SPREADSHEET_ID);
  await page.getByRole("button", { name: "確認する" }).click();
  await expect(page.locator("#status")).toContainText("3枚の記録を読み込みました");

  // 既定はWebから補完した表紙だけ。Driveの画像をログイン中のトークンで読んで出す
  const review = page.locator("#art-review");
  await expect(review).toContainText("Webから補完した表紙（自動）：1枚");
  const tile = review.locator(".art-tile").filter({ hasText: "Web Album" });
  await expect(tile.locator("img")).toHaveAttribute("src", /^blob:/);
  expect(await tile.locator("img").evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await expect(tile.getByRole("link", { name: "MusicBrainz" })).toHaveAttribute("href", "https://musicbrainz.org/release-group/rg-old");

  // スプレッドシートで行を並べ替えられても、書く直前に読み直して正しい行に書く
  const rows = mocks.getAlbumArtRows()!;
  mocks.setAlbumArtRows([rows[0], rows[3], rows[2], rows[1]]);
  await tile.getByRole("button", { name: "「Web Album」の表紙を外す" }).click();
  await expect(page.locator("#status")).toContainText("「Web Album」の表紙を外しました");
  const afterReject = Object.fromEntries(mocks.getAlbumArtRows()!.slice(1).map((r) => [r[1], r]));
  expect(afterReject["Web Album"].slice(4, 7)).toEqual(["", "rejected", ""]);
  expect(afterReject["Embedded One"].slice(4, 6)).toEqual(["art-emb", "embedded"]);
  await expect.poll(() => mocks.driveTrashed).toEqual(["art-old"]);
  await expect(review).toContainText("Webから補完した表紙（自動）：0枚");

  // 見つからなかったアルバムを、別の候補（照合の緩い検索）から選んで入れる
  await page.locator("#art-view").selectOption("notfound");
  await review.getByRole("button", { name: "「Candidate Me」の別の候補" }).click();
  const candidates = page.locator("#art-candidates");
  await expect(candidates).toContainText("「Candidate Me」の別の候補");
  await candidates.getByRole("button", { name: "「Candidate Me (Deluxe)」（MusicBrainz）の表紙にする" }).click();
  await expect(page.locator("#status")).toContainText("「Candidate Me」の表紙を差し替えました");
  const afterChoose = Object.fromEntries(mocks.getAlbumArtRows()!.slice(1).map((r) => [r[1], r]));
  expect(afterChoose["Candidate Me"].slice(3, 7)).toEqual(["no", "art-1", "musicbrainz", "rg-cand"]);
  expect(mocks.driveUploads.map((u) => u.name)).toEqual(["Candidate Me [p2].jpg"]);
  await expect(candidates).toBeHidden();

  // 外したアルバムは「外したアルバム」に出る
  await page.locator("#art-view").selectOption("rejected");
  await expect(review).toContainText("外したアルバム：1枚");
  await expect(review.locator(".art-tile")).toContainText("Web Album");

  // スマホの幅でも横にはみ出さない
  await page.locator("#art-view").selectOption("all");
  await page.setViewportSize({ width: 320, height: 700 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

const ART_HEADER = ["albumFolderId", "album", "artist", "embedded", "artFileId", "source", "sourceId", "checkedFileId", "updatedAt"];

test("アルバムアートの確認：画像の送信中に行が並べ替えられても、選んだアルバムの行に書く（長い名前でもはみ出さない）", async ({ page, context }) => {
  const longName = `Candidate Me${"X".repeat(100)}`;
  const mocks = await installGoogleMocks(context, {
    currentHeader: true,
    albumArtRows: [
      ART_HEADER,
      ["p2", longName, "Nobody", "no", "", "notfound", "", "t2", "u1"],
      ["p4", "Other Album", "Band", "no", "art-x", "itunes", "9", "t4", "u2"],
    ],
  });
  await page.setViewportSize({ width: 320, height: 700 });
  await login(page);
  await page.locator("#spreadsheet-id").fill(SPREADSHEET_ID);
  await page.getByRole("button", { name: "確認する" }).click();
  await expect(page.locator("#status")).toContainText("2枚の記録を読み込みました");
  await page.locator("#art-view").selectOption("notfound");
  await page.locator("#art-review").getByRole("button", { name: `「${longName}」の別の候補` }).click();
  const candidates = page.locator("#art-candidates");
  await expect(candidates.getByRole("button", { name: /の表紙にする$/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);

  // 画像をDriveへ送っている間に、スプレッドシートの行が入れ替わる
  mocks.setUploadHook(() => {
    const rows = mocks.getAlbumArtRows()!;
    mocks.setAlbumArtRows([rows[0], rows[2], rows[1]]);
  });
  await candidates.getByRole("button", { name: /の表紙にする$/ }).click();
  await expect(page.locator("#status")).toContainText("の表紙を差し替えました");
  const byAlbum = Object.fromEntries(mocks.getAlbumArtRows()!.slice(1).map((r) => [r[1], r]));
  expect(byAlbum[longName].slice(4, 7)).toEqual(["art-1", "musicbrainz", "rg-cand"]);
  expect(byAlbum["Other Album"].slice(4, 9)).toEqual(["art-x", "itunes", "9", "t4", "u2"]);
});

test("アルバムアートの確認：画面に出した後に別の画面で表紙が変わっていたら、外さず・差し替えず知らせる", async ({ page, context }) => {
  const mocks = await installGoogleMocks(context, {
    currentHeader: true,
    albumArtRows: [ART_HEADER, ["p1", "Web Album", "Band", "no", "art-old", "musicbrainz", "rg-old", "t1", "u1"]],
  });
  await login(page);
  await page.locator("#spreadsheet-id").fill(SPREADSHEET_ID);
  await page.getByRole("button", { name: "確認する" }).click();
  await expect(page.locator("#art-review")).toContainText("Webから補完した表紙（自動）：1枚");

  // 別の画面で差し替えられた
  const changed = ["p1", "Web Album", "Band", "no", "art-elsewhere", "itunes", "77", "t1", "u9"];
  mocks.setAlbumArtRows([ART_HEADER, changed]);

  await page.getByRole("button", { name: "「Web Album」の表紙を外す" }).click();
  await expect(page.locator("#status")).toContainText("別の画面で変更されています");
  expect(mocks.getAlbumArtRows()![1]).toEqual(changed);
  expect(mocks.driveTrashed).toEqual([]);

  // 別の候補から選んでも書かず、送った画像はゴミ箱へ戻す
  await page.getByRole("button", { name: "「Web Album」の別の候補" }).click();
  await page.locator("#art-candidates input").first().fill("Candidate Me");
  await page.locator("#art-candidates").getByRole("button", { name: "探す" }).click();
  await page.locator("#art-candidates").getByRole("button", { name: /の表紙にする$/ }).click();
  await expect(page.locator("#status")).toContainText("別の画面で変更されています");
  expect(mocks.getAlbumArtRows()![1]).toEqual(changed);
  await expect.poll(() => mocks.driveTrashed).toEqual(["art-1"]);
});

test("アルバムアートの確認：記録を書けたか分からない（応答が届かない）ときは、送った画像を消さない", async ({ page, context }) => {
  const mocks = await installGoogleMocks(context, {
    currentHeader: true,
    albumArtRows: [ART_HEADER, ["p2", "Candidate Me", "Nobody", "no", "", "notfound", "", "t2", "u1"]],
  });
  await login(page);
  await page.locator("#spreadsheet-id").fill(SPREADSHEET_ID);
  await page.getByRole("button", { name: "確認する" }).click();
  await page.locator("#art-view").selectOption("notfound");
  await page.locator("#art-review").getByRole("button", { name: "「Candidate Me」の別の候補" }).click();
  mocks.setDropAlbumArtWriteResponses(true);
  await page.locator("#art-candidates").getByRole("button", { name: /の表紙にする$/ }).click();
  await expect(page.locator("#status")).toContainText("差し替えられませんでした", { timeout: 20_000 });
  // 書き込み自体はシートに反映されている。その画像はゴミ箱へ移さない
  expect(mocks.getAlbumArtRows()![1].slice(4, 6)).toEqual(["art-1", "musicbrainz"]);
  await page.waitForTimeout(300);
  expect(mocks.driveTrashed).toEqual([]);
});

test("アルバムアート：見つからなかったアルバムだけを、探し方を広げてもう一度探す（曲のファイルは読み直さない）", async ({ page, context }) => {
  const mocks = await installGoogleMocks(context, {
    currentHeader: true,
    rows: [
      makeRow({ fileId: "s1", album: "夏の思い出 [Disc 1]", artist: "ケツメイシ", parentId: "p-s", trackNumber: "1" }),
      makeRow({ fileId: "n1", album: "Nowhere", artist: "Nobody", parentId: "p-n", trackNumber: "1" }),
      makeRow({ fileId: "r1", album: "Rejected", artist: "Band", parentId: "p-r", trackNumber: "1" }),
    ],
    albumArtRows: [
      ART_HEADER,
      ["p-s", "夏の思い出 [Disc 1]", "ケツメイシ", "no", "", "notfound", "", "s1", "u1"],
      ["p-n", "Nowhere", "Nobody", "no", "", "notfound", "", "n1", "u1"],
      ["p-r", "Rejected", "Band", "no", "", "rejected", "", "r1", "u1"],
    ],
  });
  await login(page);
  await page.locator("#spreadsheet-id").fill(SPREADSHEET_ID);
  // ふつうの「表紙を集める」では、見つからなかったアルバムは調べ直さない
  await page.getByRole("button", { name: "表紙を集める" }).click();
  await expect(page.locator("#status")).toContainText("集め終わっています");
  expect(mocks.webRequests).toEqual([]);

  await page.getByRole("button", { name: "見つからなかったアルバムをもう一度探す" }).click();
  await expect(page.locator("#status")).toContainText("見つからなかった2枚を探し直し、1枚の表紙が見つかりました", { timeout: 20_000 });
  const byAlbum = Object.fromEntries(mocks.getAlbumArtRows()!.slice(1).map((r) => [r[1], r]));
  // ディスクの印を外して探し、iTunesの「 - Single」も同じアルバムとみなす
  expect(byAlbum["夏の思い出 [Disc 1]"].slice(3, 8)).toEqual(["no", "art-1", "itunes", "55", "s1"]);
  expect(byAlbum["Nowhere"][5]).toBe("notfound");
  expect(byAlbum["Rejected"][5]).toBe("rejected");
  expect(mocks.webRequests.some((u) => u.includes('releasegroup:"夏の思い出"'))).toBe(true);
  expect(mocks.webRequests.some((u) => u.includes("Rejected"))).toBe(false);
  expect(mocks.driveFileRequests).toEqual([]);
});

test("アルバムアート：もう一度探すのは見つからなかったアルバムだけ。集めている間に行が並べ替えられても、別の画面で変えられても取り違えない", async ({ page, context }) => {
  const mocks = await installGoogleMocks(context, {
    currentHeader: true,
    rows: [
      makeRow({ fileId: "s1", album: "夏の思い出", artist: "ケツメイシ", parentId: "p-s", trackNumber: "1" }),
      makeRow({ fileId: "e1", album: "Errored", artist: "Band", parentId: "p-e", trackNumber: "1" }),
      makeRow({ fileId: "u1", album: "Uncollected", artist: "Band", parentId: "p-u", trackNumber: "1" }),
    ],
    albumArtRows: [
      ART_HEADER,
      ["p-s", "夏の思い出", "ケツメイシ", "no", "", "notfound", "", "s1", "u1"],
      ["p-e", "Errored", "Band", "", "", "error", "", "", "u1"],
      ["p-o", "Other Album", "Band", "no", "art-x", "itunes", "9", "o1", "u2"],
    ],
  });
  await login(page);
  await page.locator("#spreadsheet-id").fill(SPREADSHEET_ID);
  // 表紙を送っている間に、「夏の思い出」の行と「Other Album」の行が入れ替わる
  mocks.setUploadHook(() => {
    const rows = mocks.getAlbumArtRows()!;
    mocks.setAlbumArtRows([rows[0], rows[3], rows[2], rows[1]]);
  });
  await page.getByRole("button", { name: "見つからなかったアルバムをもう一度探す" }).click();
  await expect(page.locator("#status")).toContainText("見つからなかった1枚を探し直し、1枚の表紙が見つかりました", { timeout: 20_000 });
  const rows = mocks.getAlbumArtRows()!;
  expect(rows).toHaveLength(4);
  const byAlbum = Object.fromEntries(rows.slice(1).map((r) => [r[1], r]));
  expect(byAlbum["夏の思い出"].slice(4, 7)).toEqual(["art-1", "itunes", "55"]);
  expect(byAlbum["Other Album"].slice(4, 9)).toEqual(["art-x", "itunes", "9", "o1", "u2"]);
  // 読めなかった・まだ調べていないアルバムは対象外（曲のファイルにも問い合わせない）
  expect(byAlbum["Errored"][5]).toBe("error");
  expect(byAlbum["Uncollected"]).toBeUndefined();
  expect(mocks.driveFileRequests).toEqual([]);
});

test("アルバムアート：もう一度探している間に別の画面で外されたアルバムは、上書きせず、置いた画像をゴミ箱へ戻す", async ({ page, context }) => {
  const mocks = await installGoogleMocks(context, {
    currentHeader: true,
    rows: [makeRow({ fileId: "s1", album: "夏の思い出", artist: "ケツメイシ", parentId: "p-s", trackNumber: "1" })],
    albumArtRows: [ART_HEADER, ["p-s", "夏の思い出", "ケツメイシ", "no", "", "notfound", "", "s1", "u1"]],
  });
  await login(page);
  await page.locator("#spreadsheet-id").fill(SPREADSHEET_ID);
  const rejected = ["p-s", "夏の思い出", "ケツメイシ", "no", "", "rejected", "", "s1", "u9"];
  mocks.setUploadHook(() => mocks.setAlbumArtRows([ART_HEADER, rejected]));
  await page.getByRole("button", { name: "見つからなかったアルバムをもう一度探す" }).click();
  await expect(page.locator("#status")).toContainText("1枚は別の画面で変更されていたため、書き込みませんでした", { timeout: 20_000 });
  expect(mocks.getAlbumArtRows()![1]).toEqual(rejected);
  await expect.poll(() => mocks.driveTrashed).toEqual(["art-1"]);
});

test("アルバムアート：AIが探した候補を、いまも見つからないアルバムの分だけ取り込み、確認画面でどう見つけたかで絞れる", async ({ page, context }) => {
  const CANDIDATE_HEADER = ["albumFolderId", "album", "imageUrl", "source", "sourceId", "match", "note"];
  const mocks = await installGoogleMocks(context, {
    currentHeader: true,
    rows: [],
    // match列を足す前（9列）のタブ：開いたときに見出しを足す
    albumArtRows: [
      ART_HEADER,
      ["p-s", "桜坂", "福山雅治", "no", "", "notfound", "", "s1", "u1"],
      ["p-m", "Missing Cover", "Band", "no", "", "notfound", "", "m1", "u1"],
      ["p-a", "Already", "Band", "no", "art-x", "itunes", "9", "a1", "u2"],
      ["p-r", "Rejected", "Band", "no", "", "rejected", "", "r1", "u2"],
    ],
    candidateRows: [
      CANDIDATE_HEADER,
      ["p-s", "桜坂", "https://cdn-images.dzcdn.net/images/cover/sakura/500x500.jpg", "deezer", "301", "ai-variant", "Sakurazaka"],
      ["p-m", "Missing Cover", "https://cdn-images.dzcdn.net/images/cover/missing/500x500.jpg", "deezer", "302", "ai-exact", ""],
      ["p-a", "Already", "https://cdn-images.dzcdn.net/images/cover/already/500x500.jpg", "deezer", "303", "ai-exact", ""],
      ["p-r", "Rejected", "https://cdn-images.dzcdn.net/images/cover/rejected/500x500.jpg", "deezer", "304", "ai-guess", ""],
      ["p-x", "Bad Row", "http://insecure/x.jpg", "deezer", "305", "ai-exact", ""],
    ],
  });
  await login(page);
  await page.locator("#spreadsheet-id").fill(SPREADSHEET_ID);
  await page.getByRole("button", { name: "AIが探した候補を取り込む" }).click();
  await expect(page.locator("#status")).toContainText("1枚の表紙を取り込みました", { timeout: 20_000 });
  await expect(page.locator("#status")).toContainText("1枚は画像を取れなかったため");
  await expect(page.locator("#status")).toContainText("1行は形が合わないため");
  const rows = mocks.getAlbumArtRows()!;
  expect(rows[0][9]).toBe("match");
  const byAlbum = Object.fromEntries(rows.slice(1).map((r) => [r[1], r]));
  expect(byAlbum["桜坂"].slice(3, 8)).toEqual(["no", "art-1", "deezer", "301", "s1"]);
  expect(byAlbum["桜坂"][9]).toBe("ai-variant");
  // 画像を取れなかった・既に表紙がある・外したアルバムはそのまま
  expect(byAlbum["Missing Cover"].slice(4, 6)).toEqual(["", "notfound"]);
  expect(byAlbum["Already"].slice(4, 7)).toEqual(["art-x", "itunes", "9"]);
  expect(byAlbum["Rejected"][5]).toBe("rejected");
  expect(mocks.driveUploads).toHaveLength(1);

  // 確認画面：どう見つけたかで絞る。自動で集めた表紙とは分かれる
  await page.getByRole("button", { name: "確認する" }).click();
  await page.locator("#art-view").selectOption("ai-variant");
  const tiles = page.locator("#art-review .art-tile");
  await expect(tiles).toHaveCount(1);
  await expect(tiles.first()).toContainText("桜坂");
  await expect(tiles.first().locator(".art-source")).toHaveText("Deezer・AI：表記違い");
  await expect(tiles.first().locator(".art-source a")).toHaveAttribute("href", "https://www.deezer.com/album/301");
  await page.locator("#art-view").selectOption("web");
  await expect(tiles).toHaveCount(1);
  await expect(tiles.first()).toContainText("Already");

  // もう一度押しても、取り込み済み・見つからないままのものだけが対象（画像を取れなかった分を試し直す）
  await page.getByRole("button", { name: "AIが探した候補を取り込む" }).click();
  await expect(page.locator("#status")).toContainText("0枚の表紙を取り込みました", { timeout: 20_000 });
  expect(mocks.driveUploads).toHaveLength(1);
});
