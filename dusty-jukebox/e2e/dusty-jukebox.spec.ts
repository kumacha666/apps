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

test("単曲試聴中に一時停止した後、同じファイルIDでもう一度「この曲を再生」を押すと、先頭からではなく一時停止位置から再開する（開発体制#42③、2026-09-09 ChatGPTレビュー指摘：P2。ネイティブ<audio controls>廃止で、従来ネイティブの再生アイコンが担っていた「停止位置からの再開」が単曲試聴では失われていた）", async ({ context, page }) => {
  await installGoogleMocks(context); await page.goto("/"); await login(page);
  await page.locator("#play-file-id").fill("song-1");
  await page.getByRole("button", { name: "この曲を再生" }).click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /stream\/song-1(\?|$)/);
  // 初回は先頭（position 0）から開始していることを確認しておく。
  expect(await page.evaluate(() => (window as unknown as { __e2e: { getLastExternalPlaybackPosition(): number | null } }).__e2e.getLastExternalPlaybackPosition())).toBe(0);

  // 再生位置を進めた状態を模擬する（E2Eモックの音声は実際にはデコードできないダミーデータの
  // ため、実ブラウザのように時間経過で自然には進まない。またE2Eモックのsrc差し替えは
  // currentTimeのリセットタイミングが実ブラウザの挙動と一致するとは限らないため、DOM上の
  // currentTime読み取りではなく__e2e.getLastExternalPlaybackPosition()で実際に渡された
  // position引数を直接検証する）。
  await page.evaluate(() => { (document.querySelector("#audio-player") as HTMLAudioElement).currentTime = 30; });
  await page.getByRole("button", { name: "一時停止" }).click();

  await page.getByRole("button", { name: "この曲を再生" }).click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /stream\/song-1(\?|$)/);
  expect(await page.evaluate(() => (window as unknown as { __e2e: { getLastExternalPlaybackPosition(): number | null } }).__e2e.getLastExternalPlaybackPosition())).toBe(30);
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

test("ネイティブの<audio controls>は表示されず、独自シークバー（#seek-slider）に置き換わっている（開発体制#42③、2026-09-09）", async ({ context, page }) => {
  await installGoogleMocks(context); await page.goto("/"); await login(page); await openCatalog(page);
  expect(await page.locator("#audio-player").evaluate((el) => el.hasAttribute("controls"))).toBe(false);
  await expect(page.locator("#seek-slider")).toBeAttached();
  await expect(page.locator("#seek-current-time")).toBeVisible();
  await expect(page.locator("#seek-duration")).toBeVisible();
});

test("独自シークバーはドラッグ中は反映されず、離した時点（changeイベント）でのみaudio.currentTimeへ反映される（開発体制#42③、2026-09-09）", async ({ context, page }) => {
  await installGoogleMocks(context); await page.goto("/"); await login(page); await openCatalog(page);
  await page.getByRole("button", { name: "次へ" }).click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /song-1(\?|$)/);

  // E2Eモックの音声は実際にはデコードできないダミーデータのため、loadedmetadata/durationchangeが
  // 発火せずシークバーは無効のまま残る（既存のMedia Session E2Eの制限と同じ理由）。ドラッグ→離す
  // という結線自体の検証のため、メタデータ確定済みの状態をテスト側から直接作る。
  await page.evaluate(() => {
    const slider = document.querySelector<HTMLInputElement>("#seek-slider")!;
    slider.disabled = false;
    slider.max = "180";
  });
  await page.evaluate(() => { (document.querySelector("#audio-player") as HTMLAudioElement).currentTime = 0; });

  await page.evaluate(() => {
    const slider = document.querySelector<HTMLInputElement>("#seek-slider")!;
    slider.value = "42";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.locator("#seek-current-time")).toHaveText("0:42");
  expect(await page.evaluate(() => (document.querySelector("#audio-player") as HTMLAudioElement).currentTime)).toBe(0);

  await page.evaluate(() => {
    document.querySelector<HTMLInputElement>("#seek-slider")!.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect.poll(() => page.evaluate(() => (document.querySelector("#audio-player") as HTMLAudioElement).currentTime)).toBe(42);
});

test("シークバーをドラッグ中に曲が切り替わっても、ドラッグ状態が残らず新曲のtimeupdateに追従する（2026-09-09、ChatGPTレビュー指摘：P2。emptiedがseekBarDraggingを解除せず、新曲のtimeupdateが無視され続けたまま固まっていた）", async ({ context, page }) => {
  await installGoogleMocks(context); await page.goto("/"); await login(page); await openCatalog(page);
  await page.getByRole("button", { name: "次へ" }).click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /song-1(\?|$)/);
  await page.evaluate(() => {
    const slider = document.querySelector<HTMLInputElement>("#seek-slider")!;
    slider.disabled = false;
    slider.max = "180";
  });

  // ドラッグを開始したまま（changeで離さないまま）曲が切り替わる状況を模擬する。
  await page.evaluate(() => {
    const slider = document.querySelector<HTMLInputElement>("#seek-slider")!;
    slider.value = "50";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.locator("#seek-current-time")).toHaveText("0:50");

  // E2Eモックの音声はsrc差し替えで実際にemptied/timeupdateが発火しないため、曲切り替え時の
  // ブラウザの挙動をテスト側から直接模擬する（既存のシークバー系E2Eと同じ理由）。
  await page.evaluate(() => {
    document.querySelector<HTMLAudioElement>("#audio-player")!.dispatchEvent(new Event("emptied"));
  });
  await page.evaluate(() => {
    const audio = document.querySelector<HTMLAudioElement>("#audio-player")!;
    audio.currentTime = 77;
    audio.dispatchEvent(new Event("timeupdate"));
  });
  // ドラッグ状態が残っていれば0:50のまま固まる。修正後は新曲の位置（77秒）へ追従する。
  await expect(page.locator("#seek-current-time")).toHaveText("1:17");
});

test("シークバーをドラッグ中に曲が切り替わった後、旧ドラッグ由来のchangeイベントが遅れて発火しても新曲の再生位置を書き換えない（2026-09-09、ChatGPTレビュー再指摘：P2続き）", async ({ context, page }) => {
  await installGoogleMocks(context); await page.goto("/"); await login(page); await openCatalog(page);
  await page.getByRole("button", { name: "次へ" }).click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /song-1(\?|$)/);
  await page.evaluate(() => {
    const slider = document.querySelector<HTMLInputElement>("#seek-slider")!;
    slider.disabled = false;
    slider.max = "180";
  });

  // 旧曲をドラッグ開始（changeで離さないまま）→曲切り替え（emptied）→新曲が実際に
  // 再生位置99秒まで進んだ、という状況を模擬する。
  await page.evaluate(() => {
    const slider = document.querySelector<HTMLInputElement>("#seek-slider")!;
    slider.value = "50";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.evaluate(() => {
    document.querySelector<HTMLAudioElement>("#audio-player")!.dispatchEvent(new Event("emptied"));
  });
  await page.evaluate(() => {
    const audio = document.querySelector<HTMLAudioElement>("#audio-player")!;
    audio.currentTime = 99;
    audio.dispatchEvent(new Event("timeupdate"));
  });

  // 旧ドラッグ由来のchangeイベントが遅れて発火しても、seekBarDraggingは既にemptiedで
  // falseへ戻っているため、無関係な値で新曲のcurrentTimeを書き換えてはならない。
  await page.evaluate(() => {
    document.querySelector<HTMLInputElement>("#seek-slider")!.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(await page.evaluate(() => (document.querySelector("#audio-player") as HTMLAudioElement).currentTime)).toBe(99);
});


// ============================================================================
// クロスフェード ロールスワップ再設計（2026-09-14〜、PR2）
// ============================================================================
// 旧ハンドオフ方式（#audio-player-crossfade、finishCrossfadeHandoff()の再シーク・
// outgoing復元等）が構造的に抱えていた「audio.srcが既に次曲へコミット済みだが
// native play()はまだ未解決」という曖昧な状態そのものを、role-swapは2つの対等な
// 永続audio要素（#audio-player・#audio-player-b）と「コミット瞬間はポインタの
// 付け替えだけ」という不変条件で排除した。この不変条件自体・9件の競合シナリオは
// ユニットテスト（crossfade.test.ts の CrossfadeOrchestrator、dualAudioPlayer.test.ts、
// playbackContinuation.test.ts）で検証済みのため、このE2Eブロックは実ブラウザでの
// 結線そのもの（実際のDOM要素・実際のタイマー・実際のSW経由ストリーミング）が
// 期待通りに繋がっていることの疎通確認に絞る。

test("クロスフェードのUI（チェックボックス・秒数選択・非表示の第二audio要素）が存在する", async ({ context, page }) => {
  await installGoogleMocks(context); await page.goto("/"); await login(page);
  await expect(page.getByRole("checkbox", { name: "曲間をクロスフェードする" })).toBeAttached();
  await expect(page.locator("#crossfade-duration-sec")).toBeAttached();
  await expect(page.locator("#audio-player-b")).toBeAttached();
});

test("クロスフェード無効時は残り時間が閾値以内になっても#audio-player-bへ触れない", async ({ context, page }) => {
  await installGoogleMocks(context, { albumCatalog: true }); await page.goto("/"); await login(page);
  await page.locator("#folder-id").fill("root"); await page.locator("#spreadsheet-id").fill("sheet");
  await page.getByRole("button", { name: "索引から曲一覧を読み込む" }).click();
  await expect(page.locator("#status")).toContainText("索引から4曲");

  const symphony = page.locator("#album-list li").filter({ hasText: "Symphony（3曲）" });
  await symphony.getByRole("button", { name: "このアルバムを再生" }).click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-1(\?|$)/);

  await page.evaluate(() => {
    const audio = document.querySelector<HTMLAudioElement>("#audio-player")!;
    Object.defineProperty(audio, "duration", { value: 180, configurable: true });
    Object.defineProperty(audio, "paused", { value: false, configurable: true });
    audio.currentTime = 179.99;
    audio.dispatchEvent(new Event("timeupdate"));
  });
  await expect(page.locator("#audio-player-b")).not.toHaveAttribute("src");
});

// 準備（#audio-player-bへの接続確立）は実際のランプ開始しきい値より前倒しで始まり、まだ
// 音量には触れない（旧「準備とランプの分離」テストと同じ2段階を、対象要素だけ
// audio-player-crossfade→audio-player-bへ置き換えて検証）。
test("準備（#audio-player-bへの接続確立）は音量ランプ開始しきい値より前倒しで始まり、まだ主audio要素の音量には触れない", async ({ context, page }) => {
  await installGoogleMocks(context, { albumCatalog: true }); await page.goto("/"); await login(page);
  await page.locator("#folder-id").fill("root"); await page.locator("#spreadsheet-id").fill("sheet");
  await page.getByRole("button", { name: "索引から曲一覧を読み込む" }).click();
  await expect(page.locator("#status")).toContainText("索引から4曲");
  await page.getByRole("checkbox", { name: "曲間をクロスフェードする" }).check();

  const symphony = page.locator("#album-list li").filter({ hasText: "Symphony（3曲）" });
  await symphony.getByRole("button", { name: "このアルバムを再生" }).click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-1(\?|$)/);

  await page.clock.install();
  // 準備しきい値（3秒+200ms=約3.2秒）以下・ランプしきい値（50ms）より長い窓（残り150ms）。
  await page.evaluate(() => {
    const audio = document.querySelector<HTMLAudioElement>("#audio-player")!;
    Object.defineProperty(audio, "duration", { value: 180, configurable: true });
    Object.defineProperty(audio, "paused", { value: false, configurable: true });
    audio.currentTime = 179.85;
    audio.dispatchEvent(new Event("timeupdate"));
  });
  await expect(page.locator("#audio-player-b")).toHaveAttribute("src", /album-track-2(\?|$)/);
  const volume = await page.evaluate(() => document.querySelector<HTMLAudioElement>("#audio-player")!.volume);
  expect(volume).toBe(1);
});

// クロスフェードの本体：準備→ランプ→コミット（promotion）まで一連が実際のDOM上で完走し、
// 最終的に#audio-player-bが新しいactiveスロットになる（activeAudioElementId()フック、
// 2026-09-14〜、PR2で追加）。旧テストは常に固定の#audio-playerへ「引き継がれる」ことを
// 検証していたが、role-swapではpromotionのたびにどちらのDOM要素がactiveかが入れ替わる
// ため、このフックで直接確認する。
test("キュー内自然終了に近づくとクロスフェードが発生し、#audio-player-bが新しいactiveスロットへ昇格する", async ({ context, page }) => {
  await installGoogleMocks(context, { albumCatalog: true }); await page.goto("/"); await login(page);
  await page.locator("#folder-id").fill("root"); await page.locator("#spreadsheet-id").fill("sheet");
  await page.getByRole("button", { name: "索引から曲一覧を読み込む" }).click();
  await expect(page.locator("#status")).toContainText("索引から4曲");
  await page.getByRole("checkbox", { name: "曲間をクロスフェードする" }).check();

  const symphony = page.locator("#album-list li").filter({ hasText: "Symphony（3曲）" });
  await symphony.getByRole("button", { name: "このアルバムを再生" }).click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-1(\?|$)/);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __e2e: { activeAudioElementId(): string | null } }).__e2e.activeAudioElementId())).toBe("audio-player");

  // 実時間で進める（page.clockはrunCrossfade()内部のsetTimeoutは制御できてもprepare段階の
  // 実際のSW経由ストリーミング接続確立〈real I/O〉は制御できないため、両方が絡む完走テストは
  // フェイクタイマーよりPlaywrightの自動リトライによる実時間ポーリングの方が頑健
  // ——他の多くのクロスフェードE2Eの教訓、dusty-jukebox/CLAUDE.md参照）。E2Eでは準備リード
  // 200ms・ランプ50msといずれも短いため、実時間ポーリングで十分安定して完了を検出できる。
  await page.evaluate(() => {
    const audio = document.querySelector<HTMLAudioElement>("#audio-player")!;
    Object.defineProperty(audio, "duration", { value: 180, configurable: true });
    Object.defineProperty(audio, "paused", { value: false, configurable: true });
    audio.currentTime = 179.99; // 残り10ms、準備・ランプの両しきい値を一気に超える
    audio.dispatchEvent(new Event("timeupdate"));
  });
  await expect(page.locator("#audio-player-b")).toHaveAttribute("src", /album-track-2(\?|$)/);

  // promotion完了：activeスロットがaudio-player-bへ切り替わっている。
  await expect.poll(
    () => page.evaluate(() => (window as unknown as { __e2e: { activeAudioElementId(): string | null } }).__e2e.activeAudioElementId()),
    { timeout: 10000 }
  ).toBe("audio-player-b");
  await expect(page.locator("#catalog-list li.now-playing")).toContainText("Scherzo");
  // 旧アクティブ側（audio-player）は後始末され無音・停止している。
  const oldSlotVolume = await page.evaluate(() => document.querySelector<HTMLAudioElement>("#audio-player")!.volume);
  expect(oldSlotVolume).toBeCloseTo(0, 5);
  await expect(page.locator("#audio-player-b")).toHaveAttribute("src", /album-track-2(\?|$)/);
});

test("手動で「次へ」を押すとクロスフェードが中断され、#audio-player-bがリセットされる", async ({ context, page }) => {
  await installGoogleMocks(context, { albumCatalog: true }); await page.goto("/"); await login(page);
  await page.locator("#folder-id").fill("root"); await page.locator("#spreadsheet-id").fill("sheet");
  await page.getByRole("button", { name: "索引から曲一覧を読み込む" }).click();
  await expect(page.locator("#status")).toContainText("索引から4曲");
  await page.getByRole("checkbox", { name: "曲間をクロスフェードする" }).check();

  const symphony = page.locator("#album-list li").filter({ hasText: "Symphony（3曲）" });
  await symphony.getByRole("button", { name: "このアルバムを再生" }).click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-1(\?|$)/);

  await page.clock.install();
  await page.evaluate(() => {
    const audio = document.querySelector<HTMLAudioElement>("#audio-player")!;
    Object.defineProperty(audio, "duration", { value: 180, configurable: true });
    Object.defineProperty(audio, "paused", { value: false, configurable: true });
    audio.currentTime = 179.99;
    audio.dispatchEvent(new Event("timeupdate"));
  });
  await expect(page.locator("#audio-player-b")).toHaveAttribute("src", /album-track-2(\?|$)/);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __e2e: { isCrossfadeActive(): boolean } }).__e2e.isCrossfadeActive())).toBe(true);

  await page.getByRole("button", { name: "次へ" }).click();
  // 耐久性のため（他のクロスフェードE2Eと同じ既知の注意点）：#audio-playerへ固定したduration/
  // pausedのオーバーライドは、この「次へ」によるScherzoへの遷移後もDOM要素自身に残り続ける。
  // このモック環境ではsrc再代入がcurrentTimeを自然にリセットしない場合があるため、万一この後
  // 何らかのtimeupdateが実際に発火すると、遷移直後の新しい曲（Scherzo）に対しても再び
  // 「残り時間が閾値以内」を満たしてしまい、このテストの意図（「次へ」でクロスフェードが
  // 打ち切られること）とは無関係な新しいクロスフェード（Finale等）が誤って始まりうる。
  // 遷移直後にオーバーライドを解除し、この干渉を防ぐ。
  await page.evaluate(() => {
    const audio = document.querySelector<HTMLAudioElement>("#audio-player")!;
    Object.defineProperty(audio, "duration", { value: NaN, configurable: true });
  });

  await expect.poll(() => page.evaluate(() => (window as unknown as { __e2e: { isCrossfadeActive(): boolean } }).__e2e.isCrossfadeActive())).toBe(false);
  await expect(page.locator("#audio-player-b")).not.toHaveAttribute("src");
  // 手動「次へ」自身がactiveなスロット（audio-player）でScherzoへ進む（打ち切られた
  // クロスフェードのpromotionには一切依存しない、通常のキュー操作として完了する）。
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-2(\?|$)/);
  await expect(page.locator("#catalog-list li.now-playing")).toContainText("Scherzo");
});

test("シークするとクロスフェードのランプが打ち切られ、#audio-player-bがリセットされる", async ({ context, page }) => {
  await installGoogleMocks(context, { albumCatalog: true }); await page.goto("/"); await login(page);
  await page.locator("#folder-id").fill("root"); await page.locator("#spreadsheet-id").fill("sheet");
  await page.getByRole("button", { name: "索引から曲一覧を読み込む" }).click();
  await expect(page.locator("#status")).toContainText("索引から4曲");
  await page.getByRole("checkbox", { name: "曲間をクロスフェードする" }).check();

  const symphony = page.locator("#album-list li").filter({ hasText: "Symphony（3曲）" });
  await symphony.getByRole("button", { name: "このアルバムを再生" }).click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-1(\?|$)/);

  await page.clock.install();
  await page.evaluate(() => {
    const audio = document.querySelector<HTMLAudioElement>("#audio-player")!;
    Object.defineProperty(audio, "duration", { value: 180, configurable: true });
    Object.defineProperty(audio, "paused", { value: false, configurable: true });
    audio.currentTime = 179.99;
    audio.dispatchEvent(new Event("timeupdate"));
  });
  await expect(page.locator("#audio-player-b")).toHaveAttribute("src", /album-track-2(\?|$)/);

  // 曲末尾から離れる方向へシーク（"input"でドラッグ開始状態にしてから"change"で確定する。
  // wireSeekBar()のchangeハンドラはseekBarDragging===falseだと早期returnするため、
  // "change"だけ単独で発火しても何も起きない）。
  await page.locator("#seek-slider").evaluate((el: HTMLInputElement) => {
    el.value = "10";
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });

  await expect.poll(() => page.evaluate(() => (window as unknown as { __e2e: { isCrossfadeActive(): boolean } }).__e2e.isCrossfadeActive())).toBe(false);
  await expect(page.locator("#audio-player-b")).not.toHaveAttribute("src");
  // アクティブ側（audio-player）はそのままシーク先へ移動しただけで、曲自体は変わっていない。
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-1(\?|$)/);
});

test("一時停止するとクロスフェードのランプが打ち切られ、#audio-player-bがリセットされる", async ({ context, page }) => {
  await installGoogleMocks(context, { albumCatalog: true }); await page.goto("/"); await login(page);
  await page.locator("#folder-id").fill("root"); await page.locator("#spreadsheet-id").fill("sheet");
  await page.getByRole("button", { name: "索引から曲一覧を読み込む" }).click();
  await expect(page.locator("#status")).toContainText("索引から4曲");
  await page.getByRole("checkbox", { name: "曲間をクロスフェードする" }).check();

  const symphony = page.locator("#album-list li").filter({ hasText: "Symphony（3曲）" });
  await symphony.getByRole("button", { name: "このアルバムを再生" }).click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-1(\?|$)/);

  await page.clock.install();
  await page.evaluate(() => {
    const audio = document.querySelector<HTMLAudioElement>("#audio-player")!;
    Object.defineProperty(audio, "duration", { value: 180, configurable: true });
    Object.defineProperty(audio, "paused", { value: false, configurable: true });
    audio.currentTime = 179.99;
    audio.dispatchEvent(new Event("timeupdate"));
  });
  await expect(page.locator("#audio-player-b")).toHaveAttribute("src", /album-track-2(\?|$)/);

  await page.getByRole("button", { name: "一時停止" }).click();

  await expect.poll(() => page.evaluate(() => (window as unknown as { __e2e: { isCrossfadeActive(): boolean } }).__e2e.isCrossfadeActive())).toBe(false);
  await expect(page.locator("#audio-player-b")).not.toHaveAttribute("src");
});

// 先読み再生の開始（#audio-player-bのplay()）が応答なく固まっても、タイムアウトして
// クロスフェード状態が解除され、自然終了時の自動送りが機能する（旧仕組みと同じ耐障害性を
// role-swapでも維持していることの確認）。
test("先読み再生の開始が応答なく固まっても、タイムアウトしてクロスフェード状態が解除され自然終了時の自動送りが機能する", async ({ context, page }) => {
  await installGoogleMocks(context, { albumCatalog: true }); await page.goto("/"); await login(page);
  await page.locator("#folder-id").fill("root"); await page.locator("#spreadsheet-id").fill("sheet");
  await page.getByRole("button", { name: "索引から曲一覧を読み込む" }).click();
  await expect(page.locator("#status")).toContainText("索引から4曲");
  await page.getByRole("checkbox", { name: "曲間をクロスフェードする" }).check();

  const symphony = page.locator("#album-list li").filter({ hasText: "Symphony（3曲）" });
  await symphony.getByRole("button", { name: "このアルバムを再生" }).click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-1(\?|$)/);

  // #audio-player-bのplay()呼び出しだけを永久に保留する。
  await page.evaluate(() => {
    const originalPlay = HTMLMediaElement.prototype.play;
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      value: function (this: HTMLMediaElement) {
        if (this.id === "audio-player-b") return new Promise<void>(() => {});
        return originalPlay.call(this);
      },
      configurable: true,
    });
  });

  await page.clock.install();
  await page.evaluate(() => {
    const audio = document.querySelector<HTMLAudioElement>("#audio-player")!;
    Object.defineProperty(audio, "duration", { value: 180, configurable: true });
    Object.defineProperty(audio, "paused", { value: false, configurable: true });
    audio.currentTime = 179.99;
    audio.dispatchEvent(new Event("timeupdate"));
  });
  await expect(page.locator("#audio-player-b")).toHaveAttribute("src", /album-track-2(\?|$)/);

  // 先読み再生開始タイムアウト（E2Eでは200ms）を超えて進める。
  await page.clock.runFor(300);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __e2e: { isCrossfadeActive(): boolean } }).__e2e.isCrossfadeActive())).toBe(false);

  // 主audio要素の自然終了時、通常の自動送り（クロスフェード無し）で次の曲へ進む。
  await page.evaluate(() => {
    const audio = document.querySelector<HTMLAudioElement>("#audio-player")!;
    Object.defineProperty(audio, "ended", { value: true, configurable: true });
    Object.defineProperty(audio, "paused", { value: true, configurable: true });
    audio.dispatchEvent(new Event("ended"));
  });
  await expect(page.locator("#catalog-list li.now-playing")).toContainText("Scherzo");
});

// 準備完了（#audio-player-bのplay()解決済み）前に退場側が先に自然終了しても、未確立のまま
// ハンドオフせず通常の自動送りへフォールバックする（audioEnded/previewReadyの分離、旧テストの
// 「Finding 2」に相当する検証をrole-swap版として維持）。
test("先読み再生の開始待ち中に主audio要素が自然終了しても、未確立のままハンドオフせず通常の自動送りへフォールバックする", async ({ context, page }) => {
  await installGoogleMocks(context, { albumCatalog: true }); await page.goto("/"); await login(page);
  await page.locator("#folder-id").fill("root"); await page.locator("#spreadsheet-id").fill("sheet");
  await page.getByRole("button", { name: "索引から曲一覧を読み込む" }).click();
  await expect(page.locator("#status")).toContainText("索引から4曲");
  await page.getByRole("checkbox", { name: "曲間をクロスフェードする" }).check();

  const symphony = page.locator("#album-list li").filter({ hasText: "Symphony（3曲）" });
  await symphony.getByRole("button", { name: "このアルバムを再生" }).click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-1(\?|$)/);

  let releaseTrack2Play: (() => void) | undefined;
  await page.exposeFunction("__e2eReleaseTrack2Play", () => releaseTrack2Play?.());
  await page.evaluate(() => {
    const originalPlay = HTMLMediaElement.prototype.play;
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      value: function (this: HTMLMediaElement) {
        if (this.id === "audio-player-b") {
          return new Promise<void>((resolve) => {
            (window as unknown as { __e2eResolveTrack2Play?: () => void }).__e2eResolveTrack2Play = resolve;
          });
        }
        return originalPlay.call(this);
      },
      configurable: true,
    });
  });

  await page.clock.install();
  await page.evaluate(() => {
    const audio = document.querySelector<HTMLAudioElement>("#audio-player")!;
    Object.defineProperty(audio, "duration", { value: 180, configurable: true });
    Object.defineProperty(audio, "paused", { value: false, configurable: true });
    audio.currentTime = 179.99;
    audio.dispatchEvent(new Event("timeupdate"));
  });
  await expect(page.locator("#audio-player-b")).toHaveAttribute("src", /album-track-2(\?|$)/);

  // 準備（play()）がまだ解決していない状態で、主audio要素が自然終了する。
  await page.evaluate(() => {
    const audio = document.querySelector<HTMLAudioElement>("#audio-player")!;
    Object.defineProperty(audio, "ended", { value: true, configurable: true });
    Object.defineProperty(audio, "paused", { value: true, configurable: true });
    audio.dispatchEvent(new Event("ended"));
  });

  // 未確立のままハンドオフせず、通常の自動送り（クロスフェード無し）で次の曲へ進む。
  await expect(page.locator("#catalog-list li.now-playing")).toContainText("Scherzo");
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-2(\?|$)/);
});

test("バックグラウンドで<audio>が黙って一時停止しても、フォアグラウンド復帰（visibilitychange）で自動的に再開を試みる", async ({ context, page }) => {
  await installGoogleMocks(context);
  await page.goto("/"); await login(page); await openCatalog(page);

  await page.getByRole("button", { name: "次へ" }).click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /song-1(\?|$)/);
  const srcBefore = await page.locator("#audio-player").getAttribute("src");

  // アプリの「一時停止」ボタン・Bluetooth/OSのpauseを経由せず、OS/ブラウザ側が<audio>要素を
  // 内部的に一時停止した状態（バックグラウンドでの停止を想定）を模擬する。
  await page.evaluate(() => document.querySelector<HTMLAudioElement>("#audio-player")!.dispatchEvent(new Event("pause")));

  // フォアグラウンド復帰（visibilitychange）で自動的に再開を試みる。
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));

  // #diag-log-outputはtextareaで、値はJSからoutput.value = ...で設定される（textContentには
  // 反映されない）ため、toContainText()ではなくtoHaveValue()で検証する。
  await page.getByRole("button", { name: "診断ログを表示" }).click();
  await expect(page.locator("#diag-log-output")).toHaveValue(/backgroundRecovery:attempt/);
  await expect(page.locator("#audio-player")).not.toHaveAttribute("src", srcBefore!);
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /song-1(\?|$)/);
});

test("ユーザー自身が一時停止した曲は、フォアグラウンド復帰では自動的に再開しない", async ({ context, page }) => {
  await installGoogleMocks(context);
  await page.goto("/"); await login(page); await openCatalog(page);

  await page.getByRole("button", { name: "次へ" }).click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /song-1(\?|$)/);
  const srcBefore = await page.locator("#audio-player").getAttribute("src");

  await page.getByRole("button", { name: "一時停止" }).click();
  await page.evaluate(() => document.querySelector<HTMLAudioElement>("#audio-player")!.dispatchEvent(new Event("pause")));
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));

  await page.getByRole("button", { name: "診断ログを表示" }).click();
  await expect(page.locator("#diag-log-output")).not.toHaveValue(/backgroundRecovery:attempt/);
  await expect(page.locator("#audio-player")).toHaveAttribute("src", srcBefore!);
});

test("バックグラウンドのまま曲間の接続に失敗しても、フォアグラウンド復帰を待たずに定期的にリトライして復帰する", async ({ context, page }) => {
  await installGoogleMocks(context);
  await page.goto("/"); await login(page); await openCatalog(page);

  await page.getByRole("button", { name: "次へ" }).click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /song-1(\?|$)/);
  const srcBefore = await page.locator("#audio-player").getAttribute("src");

  // documentをhidden状態にしてvisibilitychangeを発火させ、定期リトライループを開始させる
  // （実際のタブ切り替え・画面ロックの代わりに、document.visibilityStateを直接上書きする）。
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });

  // OS/ブラウザ側が<audio>要素を内部的に一時停止した状態（バックグラウンドでの不意の停止）を模擬する。
  await page.evaluate(() => document.querySelector<HTMLAudioElement>("#audio-player")!.dispatchEvent(new Event("pause")));

  // visibilitychange（フォアグラウンド復帰）を一切発火させないまま、定期リトライ（VITE_E2Eでは
  // 50ms間隔）だけで再開することを検証する。
  await expect(page.locator("#audio-player")).not.toHaveAttribute("src", srcBefore!, { timeout: 5000 });
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /song-1(\?|$)/);
});

test("バックグラウンドの定期リトライがネイティブplay()の未解決のまま固まっても、フォアグラウンド復帰時の復帰は妨げられない（2026-09-15、Codexレビュー指摘：P1の回帰防止）", async ({ context, page }) => {
  await installGoogleMocks(context);
  await page.goto("/"); await login(page); await openCatalog(page);

  await page.getByRole("button", { name: "次へ" }).click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /song-1(\?|$)/);

  // ネイティブplay()を、呼び出し回数を記録しつつ呼び出しのたびに「解決しない新しいPromise」を
  // 返すスタブへ差し替える（本アプリの複数箇所が警告している「ネイティブplay()は解決が保証
  // されない」ケースを再現する）。
  await page.evaluate(() => {
    (window as unknown as { __e2ePlayCallCount: number }).__e2ePlayCallCount = 0;
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: function (this: HTMLMediaElement) {
        (window as unknown as { __e2ePlayCallCount: number }).__e2ePlayCallCount += 1;
        return new Promise<void>(() => {});
      },
    });
  });

  // documentをhiddenにして定期リトライを開始させ、OS/ブラウザ側の不意の一時停止を模擬する。
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.evaluate(() => document.querySelector<HTMLAudioElement>("#audio-player")!.dispatchEvent(new Event("pause")));

  // 定期リトライ（VITE_E2Eでは50ms間隔）が、未解決のまま固まるplay()を少なくとも1回呼ぶまで待つ。
  // 以後このPromiseは永久に解決しないため、リトライ自身は「解決しないまま固まっている」状態になる。
  await expect.poll(() => page.evaluate(() => (window as unknown as { __e2ePlayCallCount: number }).__e2ePlayCallCount)).toBeGreaterThanOrEqual(1);
  const callsBeforeForeground = await page.evaluate(() => (window as unknown as { __e2ePlayCallCount: number }).__e2ePlayCallCount);

  // 固まったリトライを解放しないまま、フォアグラウンドへ復帰する。
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });

  // フォアグラウンド復帰トリガーは、固まったリトライとは独立に新しいplay()呼び出しを行うことを
  // 検証する（修正前は共有の再入防止ガードにより、この2回目の呼び出し自体が起きなかった）。
  await expect.poll(() => page.evaluate(() => (window as unknown as { __e2ePlayCallCount: number }).__e2ePlayCallCount)).toBeGreaterThan(callsBeforeForeground);
});

test("自然終了に伴う次曲への遷移が未解決のまま固まっても、バックグラウンド復帰は次の曲を再試行し、直前の曲を再生し直さない（2026-09-15、Codexレビュー指摘：P1の回帰防止）", async ({ context, page }) => {
  await installGoogleMocks(context);
  await page.goto("/"); await login(page); await openCatalog(page);

  await page.getByRole("button", { name: "次へ" }).click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /song-1(\?|$)/);

  // 自然終了に伴う次曲（song-2）への最初の遷移だけを未解決のまま固まらせ、以降の呼び出しは
  // 通常通り即座に解決するスタブへ差し替える。
  await page.evaluate(() => {
    let callCount = 0;
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: function () {
        callCount += 1;
        if (callCount === 1) return new Promise<void>(() => {});
        return Promise.resolve();
      },
    });
  });

  // song-1の自然終了を模擬する。PlaybackControllerはネイティブplay()を待つ前にaudio.srcを
  // 次の曲（song-2）へ既に差し替えているが、queue.currentPlayingFileId()はplay()が解決する
  // （＝コミットする）までsong-1を指したままになる。この最初の遷移自体のplay()呼び出しが
  // queue.pendingMoveに未解決のまま残り続ける（2026-09-15、Codexレビュー再指摘：P1続き）。
  await page.evaluate(() => document.querySelector<HTMLAudioElement>("#audio-player")!.dispatchEvent(new Event("ended")));
  // この時点のsrcは最初の（未解決の）遷移自身が既に設定したものであり、後続の検証がこれを
  // 「再試行が成功した証拠」と誤認しないよう、実際に曲一覧の再生中ハイライトがまだsong-2へ
  // 更新されていない（＝queue側はまだコミットしていない）ことも確認しておく。
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /song-2(\?|$)/);
  await expect(page.locator("#catalog-list li.now-playing")).toContainText("First song");

  // documentをhidden→visibleにしてバックグラウンド復帰を発火させる。
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });

  // song-1へ巻き戻さず、song-2への遷移を再試行して実際にコミットすることを検証する。
  // audio.srcの一致だけでは、未解決の最初の遷移が既に設定した値と区別がつかず「再試行が
  // 実際に何もしていない」偽陽性を検出できないため（2026-09-15、Codexレビュー再指摘：
  // 未解決のqueue.pendingMoveへ直列に連結されるだけの素朴な再試行では、実際にはコミット
  // されないままsrcだけが偶然一致し続けることが判明した）、queue側の「現在の曲」を反映する
  // 再生中ハイライトがsong-2へ実際に切り替わることまで確認する。
  await expect(page.locator("#catalog-list li.now-playing")).toContainText("Second song");
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /song-2(\?|$)/);
});

test("バックグラウンドで復帰済みトークンが古いリトライの遅延解決によって誤って解除されない（2026-09-15、Codexレビュー指摘：P2の回帰防止）", async ({ context, page }) => {
  await installGoogleMocks(context);
  await page.goto("/"); await login(page); await openCatalog(page);

  await page.getByRole("button", { name: "次へ" }).click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /song-1(\?|$)/);

  // ネイティブplay()を、呼び出し順にインデックスを振り、個別に解放できるスタブへ差し替える。
  await page.evaluate(() => {
    const resolvers: (() => void)[] = [];
    (window as unknown as { __e2ePlayCallCount: number }).__e2ePlayCallCount = 0;
    (window as unknown as { __e2eReleasePlayCallAt: (i: number) => void }).__e2eReleasePlayCallAt = (i: number) => resolvers[i]?.();
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: function () {
        const idx = (window as unknown as { __e2ePlayCallCount: number }).__e2ePlayCallCount;
        (window as unknown as { __e2ePlayCallCount: number }).__e2ePlayCallCount += 1;
        return new Promise<void>((resolve) => { resolvers[idx] = resolve; });
      },
    });
  });

  // OS/ブラウザ側の不意の一時停止を模擬し、documentをhiddenにして定期リトライを開始させる。
  await page.evaluate(() => document.querySelector<HTMLAudioElement>("#audio-player")!.dispatchEvent(new Event("pause")));
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });

  // 最初のリトライ（A）が未解決のまま固まるまで待つ。
  await expect.poll(() => page.evaluate(() => (window as unknown as { __e2ePlayCallCount: number }).__e2ePlayCallCount)).toBe(1);

  // Aを解放しないまま、いったんフォアグラウンドへ復帰してから再びバックグラウンドへ戻る
  // （定期リトライループの停止・再開を挟む。フォアグラウンド復帰トリガー自身も独立した
  // play()呼び出しを発行するため、以降は絶対的な呼び出し回数ではなく相対的な増分で確認する）。
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });

  // フォアグラウンド復帰トリガー自身の呼び出し・新しい定期リトライ（B）の呼び出しが両方とも
  // 発行され、いずれも未解決のまま固まるまで待つ（合計2回以上に増えるまで）。
  await expect.poll(() => page.evaluate(() => (window as unknown as { __e2ePlayCallCount: number }).__e2ePlayCallCount)).toBeGreaterThanOrEqual(3);
  const countAfterCycle = await page.evaluate(() => (window as unknown as { __e2ePlayCallCount: number }).__e2ePlayCallCount);

  // ここでAを遅れて解放する。Bはまだ解放していないため、Bの追跡トークンが誤って解除され
  // 3件目（C）が並行して発行されないことを検証する。
  await page.evaluate(() => (window as unknown as { __e2eReleasePlayCallAt: (i: number) => void }).__e2eReleasePlayCallAt(0));

  // 複数回分の定期リトライ間隔（VITE_E2Eでは50ms）が経過しても、呼び出し回数が増えないことを
  // 確認する（修正前は、Aの解決がBの追跡トークンを誤って解除し、次のtickで新しい呼び出しが
  // 発行されてしまっていた）。
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (window as unknown as { __e2ePlayCallCount: number }).__e2ePlayCallCount)).toBe(countAfterCycle);
});

test("バックグラウンド復帰が自然終了に伴う遷移をreplacePendingで迂回した後、元の遷移が遅れて解決してもさらに先へ進んだ再生状態を巻き戻さない（2026-09-15、Codexレビュー指摘：P2「Invalidate the bypassed natural-end operation」の回帰防止）", async ({ context, page }) => {
  await installGoogleMocks(context, { albumCatalog: true }); await page.goto("/"); await login(page);
  await page.locator("#folder-id").fill("root"); await page.locator("#spreadsheet-id").fill("sheet");
  await page.getByRole("button", { name: "索引から曲一覧を読み込む" }).click();
  await expect(page.locator("#status")).toContainText("索引から4曲");

  const symphony = page.locator("#album-list li").filter({ hasText: "Symphony（3曲）" });
  await symphony.getByRole("button", { name: "このアルバムを再生" }).click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-1(\?|$)/);

  // 最初のplay()呼び出し（Opening→Scherzoへの自然終了に伴う遷移）だけを未解決のまま固まらせ、
  // 呼び出し側から明示的に解放できるようにする。以降の呼び出しは即座に解決する。
  await page.evaluate(() => {
    let callCount = 0;
    let releaseFirst: (() => void) | null = null;
    (window as unknown as { __e2eReleaseFirstNaturalEndPlay: () => void }).__e2eReleaseFirstNaturalEndPlay = () => releaseFirst?.();
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: function () {
        callCount += 1;
        if (callCount === 1) return new Promise<void>((resolve) => { releaseFirst = resolve; });
        return Promise.resolve();
      },
    });
  });

  // Opening（album-track-1）の自然終了を模擬する。この最初の遷移（Scherzoへ）のplay()呼び出しが
  // queue.pendingMoveに未解決のまま残り続ける。
  await page.evaluate(() => document.querySelector<HTMLAudioElement>("#audio-player")!.dispatchEvent(new Event("ended")));
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-2(\?|$)/);
  await expect(page.locator("#catalog-list li.now-playing")).toContainText("Opening");

  // バックグラウンド復帰でreplacePending方式の迂回（queue.resume(nextFileId, 0)）を発生させ、
  // 実際にScherzoへコミットさせる。
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.locator("#catalog-list li.now-playing")).toContainText("Scherzo");

  // さらに正当な自然終了でFinale（album-track-3）へ進める（迂回とは無関係の、通常の自然終了）。
  await page.evaluate(() => document.querySelector<HTMLAudioElement>("#audio-player")!.dispatchEvent(new Event("ended")));
  await expect(page.locator("#catalog-list li.now-playing")).toContainText("Finale");
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-3(\?|$)/);

  // ここで初めて、最初の（迂回で追い越された）Scherzoへの遷移を遅れて解決させる。
  // queue.invalidatePendingMove()でgenerationを進めていなければ、この遅延解決が
  // currentFileIdをScherzoへ誤って巻き戻してしまう（2026-09-15、Codexレビュー指摘：P2）。
  await page.evaluate(() => (window as unknown as { __e2eReleaseFirstNaturalEndPlay: () => void }).__e2eReleaseFirstNaturalEndPlay());
  await page.waitForTimeout(100);
  await expect(page.locator("#catalog-list li.now-playing")).toContainText("Finale");
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-3(\?|$)/);
});

test("バックグラウンドで手動の「次へ」が未解決のまま固まっても、復帰は直前の（既に進行中の）曲を再生し直さず正しい遷移先へ迂回する（2026-09-15、Codexレビュー指摘：P1「Preserve targets of pending manual navigation」の回帰防止）", async ({ context, page }) => {
  await installGoogleMocks(context); await page.goto("/"); await login(page); await openCatalog(page);

  await page.getByRole("button", { name: "次へ" }).click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /song-1(\?|$)/);

  // song-1の再生開始（1回目のplay()呼び出し）は既に完了済みのため、このスタブに差し替えて
  // からの最初の呼び出し（song-2への手動「次へ」）だけを未解決のまま固まらせる。
  await page.evaluate(() => {
    let callCount = 0;
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: function () {
        callCount += 1;
        if (callCount === 1) return new Promise<void>(() => {});
        return Promise.resolve();
      },
    });
  });

  // 手動で「次へ」を押す（Bluetooth/OSメディアキーのnexttrackハンドラも同じ
  // handleQueuePlayback(() => queue?.next(...))経路のため、可視の「次へ」ボタンで代表させる）。
  // このplay()呼び出しがqueue.pendingMoveに未解決のまま残り続ける。
  await page.getByRole("button", { name: "次へ" }).click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /song-2(\?|$)/);
  // queue.currentPlayingFileId()はまだコミットされていないためsong-1のまま。
  await expect(page.locator("#catalog-list li.now-playing")).toContainText("First song");

  // documentをhidden→visibleにしてバックグラウンド復帰を発火させる。
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });

  // 修正前は、pendingNaturalEndAdvanceがfalse（自然終了ではなく手動操作のため）のため
  // plain分岐がqueue.currentPlayingFileId()（song-1、まだコミット前の古い曲）を
  // queue.invalidatePendingMove()で進行中の「次へ」ごと無効化した上でresume()してしまい、
  // song-1が再生し直されていた。修正後はpendingQueueTransitionTarget（song-2、
  // registerQueuePlaybackContinuation()経由で既に記録済み）へ正しく迂回し、song-2が
  // 実際にコミットされる。
  await expect(page.locator("#catalog-list li.now-playing")).toContainText("Second song");
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /song-2(\?|$)/);
});

test("自然終了の遷移が未解決のまま固まるのではなく実際に失敗した後、別の曲へのユーザー操作が固まっても、復帰は失敗済みの自然終了先ではなくユーザーの最新の選択へ迂回する（2026-09-15、Codexレビュー指摘：P2「Prefer a later manual transition over stale natural-end state」の回帰防止）", async ({ context, page }) => {
  await installGoogleMocks(context, { albumCatalog: true }); await page.goto("/"); await login(page);
  await page.locator("#folder-id").fill("root"); await page.locator("#spreadsheet-id").fill("sheet");
  await page.getByRole("button", { name: "索引から曲一覧を読み込む" }).click();
  await expect(page.locator("#status")).toContainText("索引から4曲");

  const symphony = page.locator("#album-list li").filter({ hasText: "Symphony（3曲）" });
  await symphony.getByRole("button", { name: "このアルバムを再生" }).click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-1(\?|$)/);

  // 1回目のplay()呼び出し（Opening→Scherzoへの自然終了に伴う遷移）は未解決のまま固まらせず、
  // 実際にreject（失敗）させる。2回目（ユーザーが後からFinaleへ手動遷移する呼び出し）は
  // バックグラウンド復帰が発火するまで未解決のまま固まらせる。3回目以降（バックグラウンド
  // 復帰自身がpendingQueueTransitionTarget経由で発行するresume()呼び出し）は通常通り
  // 即座に解決させ、実際にコミットされることを確認できるようにする。
  await page.evaluate(() => {
    let callCount = 0;
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: function () {
        callCount += 1;
        if (callCount === 1) return Promise.reject(new Error("boom"));
        if (callCount === 2) return new Promise<void>(() => {});
        return Promise.resolve();
      },
    });
  });

  // Openingの自然終了を模擬する。Scherzoへの遷移はネイティブplay()が実際にreject（未解決の
  // まま固まるのではなく失敗して終了）するため、PlaybackQueue.pendingMove自体は解決済みの
  // 状態へ戻り、後続のナビゲーションは通常通り実行できる。
  await page.evaluate(() => document.querySelector<HTMLAudioElement>("#audio-player")!.dispatchEvent(new Event("ended")));
  await expect(page.locator("#status")).toContainText("boom");

  // ユーザーが（Bluetooth/OSメディアキーではなく曲名クリックで代表させる）Finaleへ手動で
  // 遷移する。この遷移のplay()呼び出しが未解決のまま固まり続ける。
  await page.locator("#catalog-list li").nth(2).locator(".song-link").click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-3(\?|$)/);
  // まだコミットされていないためOpeningのまま。
  await expect(page.locator("#catalog-list li.now-playing")).toContainText("Opening");

  // documentをhidden→visibleにしてバックグラウンド復帰を発火させる。
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });

  // 修正前は、失敗済みの自然終了遷移のpendingNaturalEndAdvanceフラグが解除されないまま残り、
  // 復帰がpeekNextFileId()（Scherzo、自然終了の本来の遷移先）を優先してしまい、ユーザーが
  // 実際に選んだFinaleへの手動遷移を無効化・上書きしていた。修正後はpendingNaturalEndAdvance
  // が失敗時点で解除されるため、pendingQueueTransitionTarget（Finale）が正しく優先される。
  await expect(page.locator("#catalog-list li.now-playing")).toContainText("Finale");
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-3(\?|$)/);
});

test("バックグラウンドの定期リトライがネイティブplay()の未解決のまま固まっている間にユーザーが明示的に一時停止すると、そのリトライが後から解決しても以後の定期リトライが再開を試みない（2026-09-15、Codexレビュー指摘：P1「Cancel pending recovery when the user pauses」の回帰防止）", async ({ context, page }) => {
  await installGoogleMocks(context);
  await page.goto("/"); await login(page); await openCatalog(page);

  await page.getByRole("button", { name: "次へ" }).click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /song-1(\?|$)/);

  // 以降のplay()呼び出しはすべて、呼び出しごとに個別に解放できるまで未解決のまま固まる。
  await page.evaluate(() => {
    const resolvers: (() => void)[] = [];
    (window as unknown as { __e2ePlayCallCount: number }).__e2ePlayCallCount = 0;
    (window as unknown as { __e2eReleasePlayCallAt: (i: number) => void }).__e2eReleasePlayCallAt = (i: number) => resolvers[i]?.();
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: function () {
        const idx = (window as unknown as { __e2ePlayCallCount: number }).__e2ePlayCallCount;
        (window as unknown as { __e2ePlayCallCount: number }).__e2ePlayCallCount += 1;
        return new Promise<void>((resolve) => { resolvers[idx] = resolve; });
      },
    });
  });

  // OS/ブラウザ側の不意の一時停止を模擬し、documentをhiddenにして定期リトライを開始させる。
  await page.evaluate(() => document.querySelector<HTMLAudioElement>("#audio-player")!.dispatchEvent(new Event("pause")));
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });

  // 定期リトライ自身のresume()呼び出し（play()呼び出し#0）が未解決のまま固まるまで待つ。
  await expect.poll(() => page.evaluate(() => (window as unknown as { __e2ePlayCallCount: number }).__e2ePlayCallCount)).toBe(1);

  // この呼び出しがまだ固まっている間に、ユーザーがアプリ内の「一時停止」ボタンを押す。
  await page.getByRole("button", { name: "一時停止" }).click();

  // ここで初めて、定期リトライ自身の（未解決のまま固まっていた）play()呼び出しを解放する。
  await page.evaluate(() => (window as unknown as { __e2eReleasePlayCallAt: (i: number) => void }).__e2eReleasePlayCallAt(0));
  await page.waitForTimeout(100);

  // 修正前は、この遅れて解決したplay()呼び出しが（一時停止による中断として扱われず）
  // そのままqueue側へ「再生成功」としてcommitされ、handlePlaybackAction()の成功分岐が
  // userPausedPlaybackまで解除してしまっていた。その結果、以降の定期リトライ（VITE_E2Eでは
  // 50ms間隔）がユーザーの一時停止と衝突して再び再開を試みてしまう。複数回分の定期リトライ
  // 間隔が経過しても新しいplay()呼び出し（#1以降）が発行されないことを確認する。
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (window as unknown as { __e2ePlayCallCount: number }).__e2ePlayCallCount)).toBe(1);
});

test("新規に作成した再生リストの最初の曲（playAt(0)）がネイティブplay()の未解決のまま固まっても、バックグラウンド復帰はその最初の曲を再試行する（2026-09-15、Codexレビュー指摘：P1「Recover the first pending queue track」の回帰防止）", async ({ context, page }) => {
  await installGoogleMocks(context);
  await page.goto("/"); await login(page); await openCatalog(page);

  // 索引読み込み・再生リスト作成直後はまだ何も再生していない（queue.currentPlayingFileId()は
  // null、isQueuePlaybackもfalseのまま）。最初のplay()呼び出し（「再生」ボタン→
  // queue.playAt(0)）だけを未解決のまま固まらせる。
  await page.evaluate(() => {
    let callCount = 0;
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: function () {
        callCount += 1;
        if (callCount === 1) return new Promise<void>(() => {});
        return Promise.resolve();
      },
    });
  });

  await page.getByRole("button", { name: "再生", exact: true }).click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /song-1(\?|$)/);
  // queue.currentPlayingFileId()はまだnullのまま（isQueuePlaybackもfalse）のため
  // ハイライトはまだ付いていない。
  await expect(page.locator("#catalog-list li.now-playing")).toHaveCount(0);

  // documentをhidden→visibleにしてバックグラウンド復帰を発火させる。
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });

  // 修正前は、canResumeCurrent()（isQueuePlaybackがまだfalse）がfalseのままのため
  // shouldAttemptBackgroundPlaybackRecovery()自体がfalseを返し、関数全体がここで早期return
  // していた。pendingQueueTransitionTarget（song-1、既に記録済み）は一切参照されず、固まった
  // 最初の曲は定期リトライでもフォアグラウンド復帰でも永久にリトライされなかった。修正後は
  // userPausedPlaybackだけを先に確認し、pendingQueueTransitionTarget分岐へ到達してsong-1を
  // 再試行し、実際にコミットされる。
  await expect(page.locator("#catalog-list li.now-playing")).toContainText("First song");
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /song-1(\?|$)/);
});

