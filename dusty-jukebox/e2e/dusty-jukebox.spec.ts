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

test("Service Workerの制御待ちがタイムアウトした場合、固まらずエラーメッセージを表示する（開発体制#44：強制リロード時、Service Workerの制御が永久に来ずボタンが無反応のまま固まっていた不具合の対策）", async ({ context, page }) => {
  // releaseServiceWorker()を一度も呼ばない＝Service Workerの制御が永久に来ない状態を再現する。
  await installGoogleMocks(context, { delayServiceWorkerActivation: true });
  await page.goto("/"); await login(page);
  await page.locator("#play-file-id").fill("song-1"); await page.getByRole("button", { name: "この曲を再生" }).click();
  await expect(page.locator("#status")).toContainText("Service Workerの準備がタイムアウトしました", { timeout: 5000 });
});

test("Service Worker制御待ちが一度タイムアウトしても、その後実際に制御を取得できればページを再読み込みせず次の再生が成功する（2026-09-08 ChatGPTレビュー指摘：タイムアウト結果をserviceWorkerReady自体に固定してしまうと、初回インストール時の低速回線等で8秒を超えて制御を取得できた場合でも、その後の再生がリロードするまで永久に失敗し続けてしまっていた）", async ({ context, page }) => {
  const mock = await installGoogleMocks(context, { delayServiceWorkerActivation: true });
  await page.goto("/"); await login(page);
  await page.locator("#play-file-id").fill("song-1"); await page.getByRole("button", { name: "この曲を再生" }).click();
  await expect(page.locator("#status")).toContainText("Service Workerの準備がタイムアウトしました", { timeout: 5000 });

  // タイムアウト後に、実際にはService Workerの制御を取得できたとする。
  mock.releaseServiceWorker();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));

  // ページを再読み込みせず、同じセッションのまま再度「この曲を再生」を押す。
  await page.getByRole("button", { name: "この曲を再生" }).click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /stream\/song-1(\?|$)/);
  await expect.poll(() => mock.streamRequests.length).toBeGreaterThan(0);
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

test("「再生リストをクリア」で再生リストを空にでき、リロードせず初期状態（各操作ボタン無効）に戻せる（2026-09-09、ユーザー要望）", async ({ context, page }) => {
  await installGoogleMocks(context); await page.goto("/"); await login(page); await openCatalog(page);
  await expect(page.locator("#catalog-list li")).toHaveCount(2);
  await page.getByRole("button", { name: "次へ" }).click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /song-1(\?|$)/);

  await page.getByRole("button", { name: "再生リストをクリア" }).click();
  await expect(page.locator("#status")).toContainText("再生リストをクリアしました。");
  await expect(page.locator("#catalog-list li")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "再生リストをクリア" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "次へ" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "前へ" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "シャッフル", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "再生", exact: true })).toBeDisabled();
});

test("認証更新待ち（「認証を更新して続行」表示中）の状態から「再生リストをクリア」を押すと、保留中の認証継続通知も消える（2026-09-09、ChatGPTレビュー指摘：P2。setList([])だけではキューとは別管理のPlaybackAuthenticationGateの保留操作・通知が残り、クリア済みなのに認証更新ボタンだけが残る矛盾した状態になっていた）", async ({ context, page }) => {
  await installGoogleMocks(context, { rejectFirstStreamToken: true });
  await page.goto("/"); await login(page); await openCatalog(page);
  await page.getByRole("button", { name: "次へ" }).click();
  await expect(page.getByRole("button", { name: "認証を更新して続行" })).toBeVisible();

  await page.getByRole("button", { name: "再生リストをクリア" }).click();
  await expect(page.getByRole("button", { name: "認証を更新して続行" })).toBeHidden();
  await expect(page.locator("#catalog-list li")).toHaveCount(0);
});

test("索引読み込み後、アーティスト/Genre欄の候補一覧（datalist）に実在する値が反映される", async ({ context, page }) => {
  await installGoogleMocks(context); await page.goto("/"); await login(page); await openCatalog(page);
  await expect(page.locator("#filter-artist-options option")).toHaveText(["Artist"]);
  await expect(page.locator("#filter-genre-options option")).toHaveText(["Rock"]);
});

test("再生バー（音声コントロール・再生中の曲名・ステータス/エラーメッセージ）は画面下に固定され、再生リストをスクロールしても隠れない（2026-09-09、ユーザー指摘：単曲試聴欄の直下にあると再生リスト操作中に見えなくなっていた。肝心なときに目に入らないステータス/エラーメッセージ〈#status〉も同様の理由で統合）", async ({ context, page }) => {
  await installGoogleMocks(context); await page.goto("/"); await login(page); await openCatalog(page);
  const bar = page.locator(".now-playing-bar");
  await expect(bar).toHaveCSS("position", "fixed");
  // #statusも同じ固定バーの一部になっていること（画面最下部に単独で残っていないこと）。
  await expect(bar.locator("#status")).toHaveCount(1);
  const before = await bar.boundingBox();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const after = await bar.boundingBox();
  // position:fixedのため、スクロールしてもビューポート内の座標は変わらない
  // （テストの前後でy座標が同じ＝実際に画面上へ固定され続けていることの確認）。
  expect(after?.y).toBe(before?.y);
});

test("再生バーの高さが認証通知＋長いステータス文言で伸びても、末尾コンテンツと重ならない（2026-09-09、ChatGPTレビュー指摘：P2。固定padding-bottomだけでは長い#status文言＋#playback-auth-noticeが同時に表示された場合に末尾コンテンツがバーの下に隠れうる）", async ({ context, page }) => {
  await installGoogleMocks(context, { rejectFirstStreamToken: true });
  await page.goto("/"); await login(page); await openCatalog(page);
  await page.setViewportSize({ width: 320, height: 700 });
  await page.locator("#play-file-id").fill("song-1");
  await page.getByRole("button", { name: "この曲を再生" }).click();
  await expect(page.getByRole("button", { name: "認証を更新して続行" })).toBeVisible();
  // 実際のAPI/ネットワークエラーで文言が長くなるケースを模擬する（#playback-auth-noticeと
  // 同時に表示された最悪ケースの高さで検証するため、テスト側から直接注入する）。
  await page.evaluate(() => {
    document.getElementById("status")!.textContent = "非常に長いエラーメッセージのサンプルです。".repeat(10);
  });
  // ResizeObserverのコールバックは次のレイアウト後（非同期）に発火するため、
  // --now-playing-bar-heightの反映を待ってからボックスを計測する。
  await page.waitForTimeout(200);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const lastContentBox = await page.locator("#refresh-playlists-btn").boundingBox();
  const barBox = await page.locator(".now-playing-bar").boundingBox();
  expect(lastContentBox).not.toBeNull();
  expect(barBox).not.toBeNull();
  // 末尾コンテンツの下端が固定バーの上端以下（＝バーの裏に隠れていない）であること。
  expect(lastContentBox!.y + lastContentBox!.height).toBeLessThanOrEqual(barBox!.y);
});

test("折り返し点の無い長い1単語（フォルダ名・曲名等）が再生リストに混ざっても、ページが横方向にはみ出さず固定バーも画面幅に収まる（2026-09-09、実機確認時にユーザー指摘：シークバー/ステータス表示が画面外へはみ出して見えた。実際の原因は、区切りに空白を含まない長いフォルダ名等がページ全体を横に広げ、position: fixedの固定バーもそのレイアウトビューポート幅で描画されていたこと）", async ({ context, page }) => {
  await installGoogleMocks(context);
  await page.goto("/"); await login(page); await openCatalog(page);
  await page.setViewportSize({ width: 320, height: 700 });
  await page.evaluate(() => {
    const label = document.querySelector("#catalog-list .song-link");
    if (label) label.textContent = "A".repeat(300);
  });
  const overflowsHorizontally = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflowsHorizontally).toBe(false);
  const barBox = await page.locator(".now-playing-bar").boundingBox();
  expect(barBox).not.toBeNull();
  expect(barBox!.x).toBeGreaterThanOrEqual(0);
  expect(barBox!.x + barBox!.width).toBeLessThanOrEqual(321); // 1px許容（サブピクセル丸め）
});

test("再生中の曲名（#now-playing）に折り返し点の無い長い1単語が入っても、固定バー自身の外へはみ出さない（2026-09-09、ChatGPTレビュー指摘：P2。再生リスト側のoverflow-wrap対策だけでは、再生リスト外で表示される#now-playing自身は保護されず、画面外へクリップされて読めなくなりうる）", async ({ context, page }) => {
  await installGoogleMocks(context);
  await page.goto("/"); await login(page); await openCatalog(page);
  await page.setViewportSize({ width: 320, height: 700 });
  await page.evaluate(() => {
    document.getElementById("now-playing")!.textContent = "再生中: " + "A".repeat(300);
  });
  const overflowsOwnBox = await page.evaluate(() => {
    const el = document.getElementById("now-playing")!;
    return el.scrollWidth > el.clientWidth + 1;
  });
  expect(overflowsOwnBox).toBe(false);
  const overflowsHorizontally = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflowsHorizontally).toBe(false);
  const barBox = await page.locator(".now-playing-bar").boundingBox();
  expect(barBox).not.toBeNull();
  expect(barBox!.x + barBox!.width).toBeLessThanOrEqual(321); // 1px許容（サブピクセル丸め）
});

test("絞り込み欄同士が連動し、アーティストを選ぶとアルバム欄の候補がそのアーティストのものだけに絞られる（開発体制#43）", async ({ context, page }) => {
  await installGoogleMocks(context, { albumCatalog: true }); await page.goto("/"); await login(page);
  await page.locator("#folder-id").fill("root"); await page.locator("#spreadsheet-id").fill("sheet");
  await page.getByRole("button", { name: "索引から曲一覧を読み込む" }).click();
  await expect(page.locator("#status")).toContainText("索引から4曲");

  // 絞り込み前はSoloist（Symphony）とQuartet（Blue Notes）の両方のアルバムが候補に出る。
  await expect(page.locator("#filter-album-options option")).toHaveText(["Blue Notes", "Symphony"]);

  await page.locator("#filter-artist").fill("Soloist");
  // アーティストをSoloistに絞ると、そのアーティストのアルバム（Symphony）だけが候補に残る。
  await expect(page.locator("#filter-album-options option")).toHaveText(["Symphony"]);

  // アーティスト欄自身の候補は、自分自身の入力では絞り込まれず全アーティストのまま出る
  // （ネイティブdatalistのprefixフィルタと二重に絞り込まれることを避けるため）。
  await expect(page.locator("#filter-artist-options option")).toHaveText(["Quartet", "Soloist"]);

  await page.locator("#filter-artist").fill("");
  // アーティスト条件を解除すると、アルバム候補も全アルバムに戻る。
  await expect(page.locator("#filter-album-options option")).toHaveText(["Blue Notes", "Symphony"]);
});

test("再生リストの曲をクリックするとその曲が再生され、再生中の曲名表示と行のハイライトが更新される", async ({ context, page }) => {
  await installGoogleMocks(context); await page.goto("/"); await login(page); await openCatalog(page);

  const items = page.locator("#catalog-list li");
  await expect(items).toHaveCount(2);
  await items.nth(1).locator(".song-link").click();

  await expect(page.locator("#audio-player")).toHaveAttribute("src", /song-2(\?|$)/);
  await expect(page.locator("#now-playing")).toContainText("Second song");
  await expect(items.nth(1)).toHaveClass(/now-playing/);
  await expect(items.nth(0)).not.toHaveClass(/now-playing/);

  await items.nth(0).locator(".song-link").click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /song-1(\?|$)/);
  await expect(page.locator("#now-playing")).toContainText("First song");
  await expect(items.nth(0)).toHaveClass(/now-playing/);
  await expect(items.nth(1)).not.toHaveClass(/now-playing/);
});

test("Bluetooth/OSメディアキー対応：再生中の曲情報がnavigator.mediaSessionへ反映される", async ({ context, page }) => {
  // playbackState（"playing"/"paused"）の更新は<audio>要素のネイティブplaying/pauseイベントに
  // 連動させているが、このE2Eモックの音声は実際にはデコードできないダミーデータのため、
  // ネイティブイベント自体が発火しない（play()はスタブされ即座に解決するため尚更）。
  // updatePlaybackState()自体のロジックはmediaSession.test.tsでユニットテスト済みのため、
  // ここではDOM結線が実際に機能するmetadata側（handlePlaybackAction/renderQueue経由、
  // ネイティブイベントに依存しない）だけを実ブラウザで検証する。
  await installGoogleMocks(context); await page.goto("/"); await login(page); await openCatalog(page);

  const items = page.locator("#catalog-list li");
  await items.nth(1).locator(".song-link").click(); // Second song
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /song-2(\?|$)/);
  await expect.poll(() => page.evaluate(() => navigator.mediaSession.metadata?.title)).toBe("Second song");
  await expect.poll(() => page.evaluate(() => navigator.mediaSession.metadata?.artist)).toBe("Artist");

  await items.nth(0).locator(".song-link").click(); // First song
  await expect.poll(() => page.evaluate(() => navigator.mediaSession.metadata?.title)).toBe("First song");
});

test("再生リストの曲クリックがDrive側401で保留になっても、認証継続後の再生中の曲名表示と行のハイライトが正しい（2026-09-03 レビュー指摘：handleStreamTokenRejected()の認証継続はhandleQueuePlayback()を経由しないため、独立した再描画経路が必要）", async ({ context, page }) => {
  // delayFirstMediaPlay: 最初のHTMLMediaElement.play()を意図的に保留し、SWの401応答（実際の
  // fetch/ルート処理を経由するため相対的に遅い）が先に届く現実的な順序を再現する。これが無いと
  // play()が即座に解決しqueue.currentFileIdが確定してしまい、認証継続成功時の再描画有無による
  // 表示の違いが表面化しない（false negativeになる、レビュー指摘）。
  const mock = await installGoogleMocks(context, { rejectFirstStreamToken: true, delayFirstMediaPlay: true });
  await page.goto("/"); await login(page); await openCatalog(page);

  const items = page.locator("#catalog-list li");
  await items.nth(1).locator(".song-link").click(); // 曲B（Second song）。最初のplay()は保留のまま、ストリーム要求だけが401で拒否される
  await expect(page.getByRole("button", { name: "認証を更新して続行" })).toBeVisible();
  // play()がまだ解決していないため、queue.currentFileIdは未確定のまま
  await expect(page.locator("#now-playing")).toHaveText("");
  await expect(items.nth(1)).not.toHaveClass(/now-playing/);

  await page.getByRole("button", { name: "認証を更新して続行" }).click(); // 認証継続は2回目のplay()（保留されない）で再生する
  await expect(page.getByRole("button", { name: "認証を更新して続行" })).toBeHidden();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /song-2(\?|$)/);
  await expect(page.locator("#now-playing")).toContainText("Second song");
  await expect(items.nth(1)).toHaveClass(/now-playing/);
  await expect(items.nth(0)).not.toHaveClass(/now-playing/);
  expect(mock.authFailures).toEqual([]);

  await page.evaluate(() => (window as unknown as { __e2eReleaseFirstMediaPlay: () => void }).__e2eReleaseFirstMediaPlay());
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

  const symphony = page.locator("#album-list li").filter({ hasText: "Symphony（3曲）" });
  await symphony.getByRole("button", { name: "このアルバムを再生" }).click();
  await expect(page.locator("#catalog-list li")).toHaveCount(3);
  await expect(page.locator("#catalog-list li")).toHaveText([/Opening/, /Scherzo/, /Finale/]);
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-1(\?|$)/);
});

test("リリース種別欄の候補一覧が反映され、絞り込みができる（開発体制#39④UI-5）", async ({ context, page }) => {
  await installGoogleMocks(context, { albumCatalog: true }); await page.goto("/"); await login(page);
  await page.locator("#folder-id").fill("root"); await page.locator("#spreadsheet-id").fill("sheet");
  await page.getByRole("button", { name: "索引から曲一覧を読み込む" }).click();
  await expect(page.locator("#status")).toContainText("索引から4曲");
  await expect(page.locator("#filter-release-type-options option")).toHaveText(["Album", "Single"]);

  await page.locator("#filter-release-type").fill("single");
  await page.getByRole("button", { name: "この条件で再生リストを作る" }).click();
  await expect(page.locator("#catalog-list li")).toHaveCount(1);
  await expect(page.locator("#catalog-list")).toContainText("Jazz Song");
});

test("再生中にシャッフルしても現在曲は維持され、次へで残り曲を1曲も失わず辿れる", async ({ context, page }) => {
  await installGoogleMocks(context, { albumCatalog: true }); await page.goto("/"); await login(page);
  await page.locator("#folder-id").fill("root"); await page.locator("#spreadsheet-id").fill("sheet");
  await page.getByRole("button", { name: "索引から曲一覧を読み込む" }).click();
  await expect(page.locator("#status")).toContainText("索引から4曲");

  const symphony = page.locator("#album-list li").filter({ hasText: "Symphony（3曲）" });
  await symphony.getByRole("button", { name: "このアルバムを再生" }).click();
  await expect(page.locator("#catalog-list li")).toHaveCount(3);
  // アルバム再生開始時点で1曲目（album-track-1）が既に再生中の状態を作る。
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-1(\?|$)/);

  await page.getByRole("button", { name: "シャッフル", exact: true }).click();
  // 2026-09-06、ChatGPTレビュー指摘：再生中の曲を含めて全体をシャッフルすると、現在曲より
  // 前の位置に移動した未再生曲がnext()から永久に到達不能になり、残り曲があっても再生が
  // 止まってしまう不具合があった。再生中の曲はシャッフル後も位置・再生状態とも維持され、
  // 「次へ」で残り2曲を1曲も失わず・重複せず辿れることを検証する。
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-1(\?|$)/);

  const reached: string[] = [];
  for (let i = 0; i < 2; i += 1) {
    await page.getByRole("button", { name: "次へ" }).click();
    const src = await page.locator("#audio-player").getAttribute("src");
    const match = /album-track-(\d)/.exec(src ?? "");
    if (!match) throw new Error(`unexpected audio src: ${src}`);
    reached.push(`album-track-${match[1]}`);
  }
  expect(reached.sort()).toEqual(["album-track-2", "album-track-3"]);
});

test("「シャッフルを元に戻す」でシャッフル前の並び順に戻る", async ({ context, page }) => {
  await installGoogleMocks(context, { albumCatalog: true }); await page.goto("/"); await login(page);
  await page.locator("#folder-id").fill("root"); await page.locator("#spreadsheet-id").fill("sheet");
  await page.getByRole("button", { name: "索引から曲一覧を読み込む" }).click();
  await expect(page.locator("#status")).toContainText("索引から4曲");

  const symphony = page.locator("#album-list li").filter({ hasText: "Symphony（3曲）" });
  await symphony.getByRole("button", { name: "このアルバムを再生" }).click();
  await expect(page.locator("#catalog-list li")).toHaveCount(3);
  await expect(page.getByRole("button", { name: "シャッフルを元に戻す" })).toBeDisabled();

  // シャッフル自体が実際に並び順を変えることは別テスト（「再生中にシャッフルしても現在曲は
  // 維持され...」）で既に検証済みのため、ここではランダム性に左右されない「元に戻す」の
  // 機能だけを検証する（並びが変わったことの追加確認は入れない。稀に変わらない結果になっても
  // 偽陽性・偽陰性のどちらにもならないよう、以下は復元後の一致だけを見る）。
  const originalOrder = await page.locator("#catalog-list li").allTextContents();
  await page.getByRole("button", { name: "シャッフル", exact: true }).click();
  await expect(page.getByRole("button", { name: "シャッフルを元に戻す" })).toBeEnabled();

  await page.getByRole("button", { name: "シャッフルを元に戻す" }).click();
  await expect(page.locator("#catalog-list li")).toHaveText(originalOrder.map((t) => new RegExp(t)));
  await expect(page.getByRole("button", { name: "シャッフルを元に戻す" })).toBeDisabled();
});

test("並び替え機能でタイトル順（昇順/降順）に並べ替えられる", async ({ context, page }) => {
  await installGoogleMocks(context, { albumCatalog: true }); await page.goto("/"); await login(page);
  await page.locator("#folder-id").fill("root"); await page.locator("#spreadsheet-id").fill("sheet");
  await page.getByRole("button", { name: "索引から曲一覧を読み込む" }).click();
  await expect(page.locator("#status")).toContainText("索引から4曲");

  await page.getByRole("button", { name: "この条件で再生リストを作る" }).click();
  await expect(page.locator("#catalog-list li")).toHaveCount(4);

  await page.locator("#sort-field").selectOption("title");
  await page.locator("#sort-direction").selectOption("asc");
  await page.getByRole("button", { name: "並び替えを適用" }).click();
  const ascTitles = await page.locator("#catalog-list li").allTextContents();
  expect(ascTitles.map((t) => t.trim())).toEqual([
    expect.stringContaining("Finale"),
    expect.stringContaining("Jazz Song"),
    expect.stringContaining("Opening"),
    expect.stringContaining("Scherzo"),
  ]);

  await page.locator("#sort-direction").selectOption("desc");
  await page.getByRole("button", { name: "並び替えを適用" }).click();
  const descTitles = await page.locator("#catalog-list li").allTextContents();
  expect(descTitles.map((t) => t.trim())).toEqual([
    expect.stringContaining("Scherzo"),
    expect.stringContaining("Opening"),
    expect.stringContaining("Jazz Song"),
    expect.stringContaining("Finale"),
  ]);
});

test("並び替えは再生中の曲を含むリスト全体を対象にする（開発体制#42、以前は再生中の曲より前を固定していた）", async ({ context, page }) => {
  await installGoogleMocks(context, { albumCatalog: true }); await page.goto("/"); await login(page);
  await page.locator("#folder-id").fill("root"); await page.locator("#spreadsheet-id").fill("sheet");
  await page.getByRole("button", { name: "索引から曲一覧を読み込む" }).click();
  await expect(page.locator("#status")).toContainText("索引から4曲");

  // アルバム再生で自動的に先頭曲（Opening、disc1/track1）が再生される。
  const symphony = page.locator("#album-list li").filter({ hasText: "Symphony（3曲）" });
  await symphony.getByRole("button", { name: "このアルバムを再生" }).click();
  await expect(page.locator("#catalog-list li")).toHaveCount(3);
  await expect(page.locator("#now-playing")).toContainText("Opening");
  // アルバム再生直後の並びはdisc/track順: Opening, Scherzo, Finale（Openingが先頭）。
  const beforeSort = await page.locator("#catalog-list li").allTextContents();
  expect(beforeSort.map((t) => t.trim())[0]).toContain("Opening");

  // タイトル昇順で並び替えると、修正前は再生中のOpeningが先頭に固定されたままだったが、
  // 修正後は再生中の曲も含めてリスト全体がタイトル順（Finale, Opening, Scherzo）になる。
  await page.locator("#sort-field").selectOption("title");
  await page.locator("#sort-direction").selectOption("asc");
  await page.getByRole("button", { name: "並び替えを適用" }).click();
  const afterSort = await page.locator("#catalog-list li").allTextContents();
  expect(afterSort.map((t) => t.trim())).toEqual([
    expect.stringContaining("Finale"),
    expect.stringContaining("Opening"),
    expect.stringContaining("Scherzo"),
  ]);
  // 再生中の曲自体（Opening）は変わらず、ハイライトも新しい位置へ移動している。
  await expect(page.locator("#now-playing")).toContainText("Opening");
  await expect(page.locator("#catalog-list li.now-playing")).toContainText("Opening");
});

test("並び替えの第二候補を指定すると、第一候補が同値の曲同士を第二候補で並べ替える（開発体制#42）", async ({ context, page }) => {
  await installGoogleMocks(context, { albumCatalog: true }); await page.goto("/"); await login(page);
  await page.locator("#folder-id").fill("root"); await page.locator("#spreadsheet-id").fill("sheet");
  await page.getByRole("button", { name: "索引から曲一覧を読み込む" }).click();
  await expect(page.locator("#status")).toContainText("索引から4曲");

  await page.getByRole("button", { name: "この条件で再生リストを作る" }).click();
  await expect(page.locator("#catalog-list li")).toHaveCount(4);

  // 第一候補: リリース年（昇順）、第二候補: トラック番号（昇順）。
  // Jazz Song(2020,track1) → Symphonyの3曲(2024)はtrack番号順、track1同士（Finale/Opening）は
  // タイトルで最終的な決定性を確保するため Finale が先。
  await page.locator("#sort-field").selectOption("releaseYear");
  await page.locator("#sort-direction").selectOption("asc");
  await page.locator("#sort-secondary-field").selectOption("track");
  await page.locator("#sort-secondary-direction").selectOption("asc");
  await page.getByRole("button", { name: "並び替えを適用" }).click();
  const titles = await page.locator("#catalog-list li").allTextContents();
  expect(titles.map((t) => t.trim())).toEqual([
    expect.stringContaining("Jazz Song"),
    expect.stringContaining("Finale"),
    expect.stringContaining("Opening"),
    expect.stringContaining("Scherzo"),
  ]);
});

test("再生リストの上下ボタンで曲の順番を手動で入れ替えられる（開発体制#42②）", async ({ context, page }) => {
  await installGoogleMocks(context, { albumCatalog: true }); await page.goto("/"); await login(page);
  await page.locator("#folder-id").fill("root"); await page.locator("#spreadsheet-id").fill("sheet");
  await page.getByRole("button", { name: "索引から曲一覧を読み込む" }).click();
  await expect(page.locator("#status")).toContainText("索引から4曲");

  await page.getByRole("button", { name: "この条件で再生リストを作る" }).click();
  const items = page.locator("#catalog-list li");
  await expect(items).toHaveCount(4);
  const originalOrder = await items.allTextContents();

  // 2番目の行を上へ移動 → 先頭の曲と入れ替わる。
  await items.nth(1).getByRole("button", { name: "↑", exact: true }).click();
  const afterUp = await items.allTextContents();
  expect(afterUp[0]).toEqual(originalOrder[1]);
  expect(afterUp[1]).toEqual(originalOrder[0]);

  // 先頭行の「↑」は無効化されている（これ以上上へ動かせない）。
  await expect(items.nth(0).getByRole("button", { name: "↑", exact: true })).toBeDisabled();
  // 末尾行の「↓」も無効化されている。
  await expect(items.nth(3).getByRole("button", { name: "↓", exact: true })).toBeDisabled();

  // 先頭の曲（元々2番目だった曲）を下へ動かすと、元の並びに戻る。
  await items.nth(0).getByRole("button", { name: "↓", exact: true }).click();
  const afterDown = await items.allTextContents();
  expect(afterDown).toEqual(originalOrder);
});

test("並べ替え待機中に曲名をクリックしても、待機中の並べ替え完了後の位置ではなくクリックした曲がfileIdで正しく再生される（開発体制#42②、2026-09-08 Codexレビュー指摘の回帰防止）", async ({ context, page }) => {
  // delayFirstMediaPlay: 最初のHTMLMediaElement.play()を意図的に保留し、「↑」ボタンと
  // 曲名クリックの両方がpendingMove待機中にキューイングされる状況を再現する。
  await installGoogleMocks(context, { delayFirstMediaPlay: true });
  await page.goto("/"); await login(page); await openCatalog(page);

  const items = page.locator("#catalog-list li");
  await expect(items).toHaveCount(2);
  // 先頭曲（song-1）の再生を開始する。最初のplay()は保留されたまま。
  await page.getByRole("button", { name: "再生", exact: true }).click();

  // 保留中に、2番目の行（song-2）を上へ動かす（[song-1, song-2] → [song-2, song-1]）。
  await items.nth(1).getByRole("button", { name: "↑", exact: true }).click();
  // まだ再描画されていない古いDOM上で、"song-2"の行（クリック時点ではindex1）をクリックする。
  await items.nth(1).locator(".song-link").click();

  await page.evaluate(() => (window as unknown as { __e2eReleaseFirstMediaPlay: () => void }).__e2eReleaseFirstMediaPlay());

  // 修正前（listIndexをそのまま使う実装）だと、並べ替え後にindex1が指す"song-1"が
  // 再生されてしまっていた。fileIdで解決する現在の実装では、クリックした"song-2"が
  // 正しく再生される。
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /song-2(\?|$)/);
  await expect(page.locator("#now-playing")).toContainText("Second song");
});

test("並べ替え待機中に保存ボタンを押しても、要求した新しい順序で保存される（開発体制#42②、2026-09-08 Codexレビュー指摘の回帰防止）", async ({ context, page }) => {
  await installGoogleMocks(context, { delayFirstMediaPlay: true });
  await page.goto("/"); await login(page); await openCatalog(page);

  const items = page.locator("#catalog-list li");
  await page.getByRole("button", { name: "再生", exact: true }).click(); // song-1の再生開始、play()は保留のまま

  // 保留中に2番目の行を上へ動かし（[song-1, song-2] → [song-2, song-1]）、
  // 反映を待たずにそのまま保存する。
  await items.nth(1).getByRole("button", { name: "↑", exact: true }).click();
  await page.locator("#playlist-name").fill("並べ替え直後保存");
  await page.getByRole("button", { name: "現在の再生リストをプレイリストとして保存" }).click();

  await page.evaluate(() => (window as unknown as { __e2eReleaseFirstMediaPlay: () => void }).__e2eReleaseFirstMediaPlay());

  await expect(page.locator("#status")).toContainText("プレイリスト「並べ替え直後保存」（2曲）を保存しました");

  // 保存されたプレイリストを読み込み直し、要求した新しい順序（song-2が先頭）で
  // 保存されたことを確認する（修正前は並べ替え前のスナップショットが保存されていた）。
  await page.getByRole("button", { name: "読み込んで再生リストにする" }).click();
  await expect(items).toHaveCount(2);
  await expect(items.nth(0).locator(".song-link")).toContainText("Second song");
  await expect(items.nth(1).locator(".song-link")).toContainText("First song");
});

test("保存ボタンの待機中に別の再生リストへ差し替えられた場合、保存は中止され意図しない曲は保存されない（開発体制#42②、2026-09-08 Codexレビュー指摘の回帰防止）", async ({ context, page }) => {
  await installGoogleMocks(context, { delayFirstMediaPlay: true });
  await page.goto("/"); await login(page); await openCatalog(page);

  await page.getByRole("button", { name: "再生", exact: true }).click(); // song-1の再生開始、play()は保留のまま
  await page.locator("#playlist-name").fill("差し替えテスト");
  await page.getByRole("button", { name: "現在の再生リストをプレイリストとして保存" }).click();

  // 保存がpendingMove待機中の間に、絞り込みで全く別の再生リストへ差し替える
  // （setList()によりqueueの世代が進む）。
  await page.getByRole("button", { name: "この条件で再生リストを作る" }).click();

  await page.evaluate(() => (window as unknown as { __e2eReleaseFirstMediaPlay: () => void }).__e2eReleaseFirstMediaPlay());

  await expect(page.locator("#status")).toContainText("保存を待っている間に再生リストが変更されたため、保存を中止しました。");
  await expect(page.locator("#playlist-list li")).toHaveCount(0);
});

test("保存ボタンの待機中に一部の曲だけチェックを外した場合も、保存は中止され意図しない曲は保存されない（開発体制#42②、2026-09-08 Codexレビュー指摘の回帰防止）", async ({ context, page }) => {
  // 4曲（albumCatalog）を使い、除外後も0曲チェックに引っかからない（1曲だけ除外→3曲残る）
  // 状況を再現する。
  await installGoogleMocks(context, { albumCatalog: true, delayFirstMediaPlay: true });
  await page.goto("/"); await login(page);
  await page.locator("#folder-id").fill("root"); await page.locator("#spreadsheet-id").fill("sheet");
  await page.getByRole("button", { name: "索引から曲一覧を読み込む" }).click();
  await expect(page.locator("#status")).toContainText("索引から4曲");
  await page.getByRole("button", { name: "この条件で再生リストを作る" }).click();
  const items = page.locator("#catalog-list li");
  await expect(items).toHaveCount(4);

  await page.getByRole("button", { name: "再生", exact: true }).click(); // 先頭曲の再生開始、play()は保留のまま
  await page.locator("#playlist-name").fill("除外テスト");
  await page.getByRole("button", { name: "現在の再生リストをプレイリストとして保存" }).click();

  // 保存がpendingMove待機中の間に、1曲だけチェックを外す（setList()は経由しないため
  // exclusionVersionだけが進み、除外後も3曲残るため0曲チェックにも該当しない）。
  await items.nth(1).locator("input[type=checkbox]").uncheck();

  await page.evaluate(() => (window as unknown as { __e2eReleaseFirstMediaPlay: () => void }).__e2eReleaseFirstMediaPlay());

  await expect(page.locator("#status")).toContainText("保存を待っている間に再生リストが変更されたため、保存を中止しました。");
  await expect(page.locator("#playlist-list li")).toHaveCount(0);
});

test("「再生」ボタンで先頭曲から再生でき、一時停止中の曲は同じ位置から再開する", async ({ context, page }) => {
  await installGoogleMocks(context, { albumCatalog: true }); await page.goto("/"); await login(page);
  await page.locator("#folder-id").fill("root"); await page.locator("#spreadsheet-id").fill("sheet");
  await page.getByRole("button", { name: "索引から曲一覧を読み込む" }).click();
  await expect(page.locator("#status")).toContainText("索引から4曲");

  // 「この条件で再生リストを作る」は自動再生しない（アルバム再生・プレイリスト読み込みとは
  // 異なる既存の仕様）ため、この状態で「再生」ボタンを押すと先頭曲から再生できることを確認する。
  // 検索で1曲だけに絞り込み、どの曲が「先頭」になるか（sortSongsの並び順）に依存しないようにする。
  await page.locator("#filter-query").fill("opening");
  await page.getByRole("button", { name: "この条件で再生リストを作る" }).click();
  await expect(page.locator("#catalog-list li")).toHaveCount(1);
  await expect(page.locator("#audio-player")).not.toHaveAttribute("src", /.+/);
  await page.getByRole("button", { name: "再生", exact: true }).click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-1(\?|$)/);

  // 一時停止した曲は「再生」ボタンで同じ曲から再開できる（次へ等で別の曲に切り替えない限り、
  // currentPlayingFileId()は一時停止後も保持され続けるため）。
  await page.getByRole("button", { name: "一時停止" }).click();
  await page.getByRole("button", { name: "再生", exact: true }).click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-1(\?|$)/);
});

test("キュー曲再生中に「この曲を再生」でキュー外の単曲試聴を挟んでから「再生」ボタンを押すと、キューの古い再生位置を誤って再開せず先頭から再生し直す（2026-09-06 PR #418 ChatGPTレビュー再指摘）", async ({ context, page }) => {
  await installGoogleMocks(context); await page.goto("/"); await login(page); await openCatalog(page);
  await page.getByRole("button", { name: "再生", exact: true }).click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /song-1(\?|$)/);
  await page.getByRole("button", { name: "次へ" }).click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /song-2(\?|$)/);

  // キュー外の単曲試聴（開発時の疎通確認用）に切り替える。currentPlayingFileId()自体は
  // "song-2"のまま温存されるため、この状態を区別しないとcanResumeCurrent()が誤ってtrueになる。
  await page.locator("#play-file-id").fill("song-1");
  await page.getByRole("button", { name: "この曲を再生" }).click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /stream\/song-1(\?|$)/);

  // 修正前は、外部試聴中の再生位置のままキューの古いcurrentFileId（song-2）をresume()して
  // しまっていた。修正後はcanResumeCurrent()がfalseになり、先頭（song-1）から再生し直す。
  await page.getByRole("button", { name: "再生", exact: true }).click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /song-1(\?|$)/);
});

test("再生中の曲をチェック解除で除外してから「再生」ボタンを押すと、除外中の曲を再開しようとせず次の未除外曲から再生する（2026-09-06 PR #418 ChatGPTレビュー再々指摘）", async ({ context, page }) => {
  await installGoogleMocks(context); await page.goto("/"); await login(page); await openCatalog(page);
  await page.getByRole("button", { name: "再生", exact: true }).click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /song-1(\?|$)/);

  // 再生中のsong-1自身を除外する。修正前はcanResumeCurrent()が除外状態を見ておらず、
  // resume()が除外を理由にfalseを返すため「再生」ボタンが何も再生できなくなっていた。
  await page.locator("#catalog-list input").first().uncheck();
  await page.getByRole("button", { name: "再生", exact: true }).click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /song-2(\?|$)/);
});

test("アルバム一覧はアーティスト別に見出し付きで表示され、検索欄でアルバム名/アーティスト名を絞り込める", async ({ context, page }) => {
  await installGoogleMocks(context, { albumCatalog: true }); await page.goto("/"); await login(page);
  await page.locator("#folder-id").fill("root"); await page.locator("#spreadsheet-id").fill("sheet");
  await page.getByRole("button", { name: "索引から曲一覧を読み込む" }).click();
  await expect(page.locator("#status")).toContainText("索引から4曲");

  const albumList = page.locator("#album-list");
  await expect(albumList.locator(".album-artist-heading")).toHaveText(["Orchestra", "Quartet"]);

  await page.locator("#album-search").fill("quartet");
  await expect(albumList.locator(".album-artist-heading")).toHaveText(["Quartet"]);
  await expect(albumList).toContainText("Blue Notes");
  await expect(albumList).not.toContainText("Symphony");

  await page.locator("#album-search").fill("symphony");
  await expect(albumList.locator(".album-artist-heading")).toHaveText(["Orchestra"]);
  await expect(albumList).toContainText("Symphony");
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
  // 保存時のappendも記録に含まれてしまい「playlist_tracksへの書き込みがある」だけでは削除
  // 自体を検証したことにならないため、削除クリック直前でスナップショットしてから比較する
  // （2026-09-03 Codexレビュー指摘：P1。以前のアサーションは削除処理を完全にスキップしても
  // 素通りしてしまっていた）。
  const writesBeforeDelete = mock.sheetsWrites.length;
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "削除" }).click();
  await expect(page.locator("#status")).toContainText("プレイリストを削除しました");

  // 削除（deletePlaylist）は`values:batchUpdate`で行毎に空欄化する。曲の追記
  // （`values/A1:append`）とはURLパスが異なるため区別できる。
  const deleteWrites = mock.sheetsWrites.slice(writesBeforeDelete).filter((w) => w.url.includes("values:batchUpdate"));
  expect(deleteWrites.length).toBeGreaterThan(0);
  expect(deleteWrites.every((w) => w.url.includes("/spreadsheets/sheet/"))).toBe(true);
  expect(deleteWrites.some((w) => w.url.includes("/spreadsheets/other-sheet/"))).toBe(false);
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

test("対象スプレッドシートを切り替えた後に完了した旧対象向けの読み込みはコミットしない（新対象への切り替え後は破棄）", async ({ context, page }) => {
  const mock = await installGoogleMocks(context, { gatePlaylistsListReads: true });
  await page.goto("/"); await login(page);
  await page.locator("#spreadsheet-id").fill("sheet");

  const getCommitCount = () => page.evaluate(() => (window as unknown as { __e2e: { getPlaylistsCommitCount: () => number } }).__e2e.getPlaylistsCommitCount());
  const callLoadPlaylists = (id: string) => page.evaluate((spreadsheetId) => (window as unknown as { __e2e: { loadPlaylists: (id: string) => Promise<boolean> } }).__e2e.loadPlaylists(spreadsheetId), id);

  // listPlaylists→listPlaylistTracksは同一呼び出し内で直列（await）のため、1回の呼び出しに
  // つき同時に保留されるのは常に1件。呼び出しA（"sheet"を対象に先に開始）のlistPlaylistsが
  // 保留される。
  const callA = callLoadPlaylists("sheet");
  await expect.poll(() => mock.pendingPlaylistsReadCount()).toBe(1);
  // 呼び出しB（別のスプレッドシート"sheet-b"へ対象を切り替えて後から開始）のlistPlaylistsも
  // 保留される（Aはまだ保留中のまま）。
  const callB = callLoadPlaylists("sheet-b");
  await expect.poll(() => mock.pendingPlaylistsReadCount()).toBe(2);

  // BのlistPlaylists（インデックス1）を解放するとBはlistPlaylistTracksへ進み、それも保留される。
  mock.releasePlaylistsReadsAt([1]);
  await expect.poll(() => mock.pendingPlaylistsReadCount()).toBe(2);
  // BのlistPlaylistTracks（残っている方のインデックス1）を解放し、Bを完了させる。
  mock.releasePlaylistsReadsAt([1]);
  expect(await callB).toBe(true);
  await expect.poll(() => getCommitCount()).toBe(1);

  // ここでAのlistPlaylists（インデックス0）を解放するとAはlistPlaylistTracksへ進む。
  mock.releasePlaylistsReadsAt([0]);
  await expect.poll(() => mock.pendingPlaylistsReadCount()).toBe(1);
  // AのlistPlaylistTracksを解放しAを完了させる。対象は既に"sheet-b"へ切り替わっている
  // （＝Aはもはや対象スプレッドシートではない）ため、コミットされないはずである。
  mock.releasePlaylistsReadsAt([0]);
  expect(await callA).toBe(false);
  // Aの完了後もコミット回数はBの1回のまま増えないことを確認する（Aの結果が破棄されたことの検証）。
  await expect.poll(() => getCommitCount()).toBe(1);
});

test("保存操作自身の一覧自動更新は、同じスプレッドシートを対象とした手動更新が先に完了していても反映される", async ({ context, page }) => {
  // createPlaylist()（playlists/playlist_tracksタブへのappend）を意図的に長引かせる。
  const mock = await installGoogleMocks(context, { gatePlaylistsAppends: true });
  await page.goto("/"); await login(page); await openCatalog(page);

  const getCommitCount = () => page.evaluate(() => (window as unknown as { __e2e: { getPlaylistsCommitCount: () => number } }).__e2e.getPlaylistsCommitCount());

  // 保存操作を開始する（先発の操作）。createPlaylist()のappendがゲートで保留されるため、
  // handleSavePlaylistはcreatePlaylist()を待ったまま進まない（ボタンはdisabledのまま）。
  await page.locator("#playlist-name").fill("先発の保存");
  await page.getByRole("button", { name: "現在の再生リストをプレイリストとして保存" }).click();
  await expect(page.getByRole("button", { name: "現在の再生リストをプレイリストとして保存" })).toBeDisabled();

  // 保存操作の開始より後、同じスプレッドシートに対して手動更新（後発の操作）を実行して
  // 完了させる。この時点ではまだ何も保存されていないため一覧は0件。「一覧が0件」は何も
  // ロードしていない初期状態でも成り立ってしまい待機条件として使えないため、コミット回数が
  // 実際に1件増えるまで待つことで、手動更新が本当に完了したことを確認する。
  await page.getByRole("button", { name: "プレイリスト一覧を更新" }).click();
  await expect.poll(() => getCommitCount()).toBe(1);
  await expect(page.locator("#playlist-list li")).toHaveCount(0);

  // 保留していた保存のappendを解放し、保存を完了させる。対象スプレッドシートは手動更新の
  // 後も切り替わっていない（＝同じスプレッドシートに対する重複読み込み）ため、保存操作
  // 自身の自動更新は開始順に関わらずコミットされ、新しく保存したプレイリストが一覧へ
  // 反映されなければならない（2026-09-03 Codexレビュー指摘：P2。世代番号による開始順
  // 判定だと、この自動更新が「古い」という理由だけで一律に破棄され、保存したプレイリストが
  // 次に手動更新するまで一覧に現れなかった）。
  mock.releaseAllPlaylistsAppends();
  await expect(page.getByRole("button", { name: "現在の再生リストをプレイリストとして保存" })).toBeEnabled();
  await expect.poll(() => getCommitCount()).toBe(2);
  await expect(page.locator("#playlist-list li")).toHaveCount(1);
});

test("保存中に次のプレイリスト名を入力し始めても、保存完了時にその入力を消さない", async ({ context, page }) => {
  const mock = await installGoogleMocks(context, { gatePlaylistsAppends: true });
  await page.goto("/"); await login(page); await openCatalog(page);

  await page.locator("#playlist-name").fill("先発の保存");
  await page.getByRole("button", { name: "現在の再生リストをプレイリストとして保存" }).click();
  await expect(page.getByRole("button", { name: "現在の再生リストをプレイリストとして保存" })).toBeDisabled();

  // 保存が完了する前に、次のプレイリスト用の名前を入力し始める。
  await page.locator("#playlist-name").fill("次の入力中の名前");

  mock.releaseAllPlaylistsAppends();
  await expect(page.getByRole("button", { name: "現在の再生リストをプレイリストとして保存" })).toBeEnabled();
  // 保存完了時に入力欄が保存開始時点の名前（"先発の保存"）と一致しない＝ユーザーが既に
  // 次の名前を入力し始めているため、消さずに残さなければならない。
  await expect(page.locator("#playlist-name")).toHaveValue("次の入力中の名前");
});

test("前後に空白があるプレイリスト名でも、保存完了後に入力欄をきちんと空欄化する", async ({ context, page }) => {
  await installGoogleMocks(context); await page.goto("/"); await login(page); await openCatalog(page);

  await page.locator("#playlist-name").fill(" 空白付きの名前 ");
  await page.getByRole("button", { name: "現在の再生リストをプレイリストとして保存" }).click();
  await expect(page.locator("#status")).toContainText("を保存しました");
  await expect(page.locator("#playlist-name")).toHaveValue("");
});

test("曲一覧とプレイリスト一覧が別のスプレッドシートから読み込まれている場合、読み込んで再生リストにする操作を拒否する", async ({ context, page }) => {
  // 両方とも同じモックデータストア（実際にはスプレッドシートIDを区別しない）を参照するため、
  // このテストではID不一致の「ガード」自体が働くことだけを検証する（内容の食い違いではなく）。
  await installGoogleMocks(context, { seedPlaylists: [{ playlistId: "p1", name: "別シート由来", fileIds: ["song-1"] }] });
  await page.goto("/"); await login(page); await openCatalog(page);

  // 一覧を再読み込みせずに入力欄だけを別のスプレッドシートIDへ書き換えてから、そのIDで
  // プレイリスト一覧を読み込む。
  await page.locator("#spreadsheet-id").fill("other-sheet");
  await page.getByRole("button", { name: "プレイリスト一覧を更新" }).click();
  await expect(page.locator("#playlist-list li")).toHaveCount(1);

  await page.getByRole("button", { name: "読み込んで再生リストにする" }).click();
  await expect(page.locator("#status")).toContainText("曲一覧とプレイリスト一覧が別のスプレッドシートから読み込まれています");
  // キューは変更されず、直前の状態のまま（除外反映前のカタログ一覧が空のまま）であることを確認する。
  await expect(page.locator("#catalog-list li")).toHaveCount(2);
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
  const symphony = page.locator("#album-list li").filter({ hasText: "Symphony（3曲）" });
  await symphony.getByRole("button", { name: "このアルバムを再生" }).click();
  await expect(page.locator("#status")).toContainText("曲一覧を再読み込みしてから再生リストを作成してください");
  await expect(page.locator("#catalog-list li")).toHaveCount(1);
  await expect(page.locator("#catalog-list")).toContainText("Jazz Song");
  await expect(page.locator("#audio-player")).not.toHaveAttribute("src", /album-track-/);
});
