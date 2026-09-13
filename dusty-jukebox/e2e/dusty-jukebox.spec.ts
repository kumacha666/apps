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

test("クロスフェードのUI（チェックボックス・非表示の第二audio要素）が存在する（開発体制#42④、2026-09-10）", async ({ context, page }) => {
  await installGoogleMocks(context); await page.goto("/"); await login(page);
  await expect(page.getByRole("checkbox", { name: "曲間をクロスフェードする" })).toBeAttached();
  await expect(page.locator("#audio-player-crossfade")).toBeAttached();
});

// 2026-09-11、ユーザー提案（クロスフェードON/OFFの隣に3/5/7/10秒から選べる設定を置く）。
// 既定値（3秒）は既存のE2E固定値（50ms）と一致するよう設計したため、この選択肢自体は既存の
// 多数のクロスフェードE2Eに影響しない。ここでは既定値より長い5秒を選んだ場合に、既定値
// （3秒＝E2Eでは50ms）のしきい値では届かない残り時間でもランプが実際に開始されることを
// 検証する（選択値が本当に使われていることの直接的な証拠）。
test("クロスフェード長の秒数選択（3/5/7/10秒）が実際のランプ開始しきい値に反映される（2026-09-11）", async ({ context, page }) => {
  await installGoogleMocks(context, { albumCatalog: true }); await page.goto("/"); await login(page);
  await page.locator("#folder-id").fill("root"); await page.locator("#spreadsheet-id").fill("sheet");
  await page.getByRole("button", { name: "索引から曲一覧を読み込む" }).click();
  await expect(page.locator("#status")).toContainText("索引から4曲");

  await page.getByRole("checkbox", { name: "曲間をクロスフェードする" }).check();
  // 既定の3秒（E2Eでは50ms）から5秒（E2Eでは50ms×5/3≒83.3ms）へ変更する。
  await page.locator("#crossfade-duration-sec").selectOption("5");

  const symphony = page.locator("#album-list li").filter({ hasText: "Symphony（3曲）" });
  await symphony.getByRole("button", { name: "このアルバムを再生" }).click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-1(\?|$)/);

  await page.clock.install();

  // 準備しきい値（5秒選択：83.3+200=約283.3ms）以下・ランプ開始しきい値（約83.3ms）より
  // 長い窓（残り150ms）に置き、準備（接続確立）だけを完了させる（既存の「準備とランプの
  // 分離」テストと同じ2段階の手順）。
  await page.evaluate(() => {
    const audio = document.querySelector<HTMLAudioElement>("#audio-player")!;
    Object.defineProperty(audio, "duration", { value: 180, configurable: true });
    Object.defineProperty(audio, "paused", { value: false, configurable: true });
    audio.currentTime = 179.85; // 残り150ms
    audio.dispatchEvent(new Event("timeupdate"));
  });
  await expect(page.locator("#audio-player-crossfade")).toHaveAttribute("src", /album-track-2(\?|$)/);
  const volumeBeforeEitherThreshold = await page.evaluate(
    () => document.querySelector<HTMLAudioElement>("#audio-player")!.volume
  );
  expect(volumeBeforeEitherThreshold).toBe(1);

  // 残り時間を「既定の3秒（50ms）のランプしきい値は過ぎているが、選択した5秒（約83.3ms）の
  // ランプしきい値にはまだ届いている」窓（残り65ms）へ進める。選択値が正しく使われていれば、
  // 既定値のままでは始まらないはずのこの時点でランプが実際に始まる。
  await page.evaluate(() => {
    const audio = document.querySelector<HTMLAudioElement>("#audio-player")!;
    audio.currentTime = 179.935; // 残り65ms
    audio.dispatchEvent(new Event("timeupdate"));
  });
  await page.clock.runFor(10);
  const volumeDuringRamp = await page.evaluate(
    () => document.querySelector<HTMLAudioElement>("#audio-player")!.volume
  );
  expect(volumeDuringRamp).toBeLessThan(1);

  // 5秒選択のランプ全体（約83.3ms）を進め、最終的に次の曲へ正しく引き継がれることも確認する。
  await page.clock.runFor(100);
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-2(\?|$)/);
  await expect(page.locator("#catalog-list li.now-playing")).toContainText("Scherzo");
});

// 実機フィードバック（PR #443マージ後）：「フェードが短すぎてまだクロスしてません。また次曲に
// 切り替わったあと、一瞬曲が途切れてます」。根本原因は、旧実装が「音量ランプ開始しきい値
// （残りcrossfadeDurationMs）」に達したその場で初めて第二audio要素のplay()（Service Worker
// 経由のDrive接続確立、実際のネットワークI/Oで数百ms〜数秒かかりうる）を待っており、この
// 待ち時間の分だけ実際の残り時間が目減りするのにランプ自体は常に固定長で走っていたこと。
// 「準備（接続確立）」を実際のランプ開始しきい値より十分早いタイミングへ前倒しし、実際に
// ランプを開始する時点では接続確立の待ちが発生しない設計に再設計した。このテストは、
// 「準備が完了しても、実際のランプ開始しきい値に達するまでは音量に一切触れない」という
// 2段階の分離そのものを検証する。
test("クロスフェードは準備（接続確立）と音量ランプの開始を分離し、準備完了後も実際のしきい値に達するまで音量へ触れない（2026-09-10、実機フィードバックによる再設計）", async ({ context, page }) => {
  await installGoogleMocks(context, { albumCatalog: true }); await page.goto("/"); await login(page);
  await page.locator("#folder-id").fill("root"); await page.locator("#spreadsheet-id").fill("sheet");
  await page.getByRole("button", { name: "索引から曲一覧を読み込む" }).click();
  await expect(page.locator("#status")).toContainText("索引から4曲");

  await page.getByRole("checkbox", { name: "曲間をクロスフェードする" }).check();

  const symphony = page.locator("#album-list li").filter({ hasText: "Symphony（3曲）" });
  await symphony.getByRole("button", { name: "このアルバムを再生" }).click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-1(\?|$)/);

  await page.clock.install();

  // 残り時間を「準備しきい値（E2E: 50+200=250ms）以下だが、ランプ開始しきい値（E2E: 50ms）
  // より長い」窓（150ms）に置く。
  await page.evaluate(() => {
    const audio = document.querySelector<HTMLAudioElement>("#audio-player")!;
    Object.defineProperty(audio, "duration", { value: 180, configurable: true });
    Object.defineProperty(audio, "paused", { value: false, configurable: true });
    audio.currentTime = 179.85; // 残り150ms
    audio.dispatchEvent(new Event("timeupdate"));
  });

  // 準備は完了する（第二audio要素に次曲のstreamURLが設定される）。
  await expect(page.locator("#audio-player-crossfade")).toHaveAttribute("src", /album-track-2(\?|$)/);
  // しかしランプ開始しきい値にはまだ達していないため、主audio要素のvolumeは1のまま
  // （音量に一切触れていない）。
  const volumeStillOne = await page.evaluate(() => document.querySelector<HTMLAudioElement>("#audio-player")!.volume);
  expect(volumeStillOne).toBe(1);

  // 残り時間をランプ開始しきい値（50ms）以下へ進める。currentTimeの直接更新だけでは
  // timeupdateは自動発火しないため、明示的にdispatchする。
  await page.evaluate(() => {
    const audio = document.querySelector<HTMLAudioElement>("#audio-player")!;
    audio.currentTime = 179.99; // 残り10ms
    audio.dispatchEvent(new Event("timeupdate"));
  });

  // 追加の接続確立待ちが無いため（既に準備済み）、ランプが直ちに始まりvolumeが下がる。
  await page.clock.runFor(10);
  const volumeDuringRamp = await page.evaluate(() => document.querySelector<HTMLAudioElement>("#audio-player")!.volume);
  expect(volumeDuringRamp).toBeLessThan(1);

  // 耐久性のため、ハンドオフ完了前にduration上書きを元に戻す（2026-09-12、
  // finishCrossfadeHandoff()が位置合わせの再シーク自体を行わなくなったため、主audio要素の
  // currentTimeがsrc切り替え後もテスト側が設定した古い値〈179.99〉のまま残ってしまう場合が
  // ある〈実ブラウザではsrc代入自体がcurrentTimeを0へリセットするが、このモック環境では
  // そう振る舞わないことがある、既存の複数のクロスフェードE2Eと同じ注意点〉。残しておくと、
  // ハンドオフ後に万一timeupdateが再発火した際、同じ「残り時間が閾値以内」条件を次の曲に
  // 対しても満たしてしまい、無関係な別のクロスフェードが連鎖してしまう。
  await page.evaluate(() => {
    document.querySelector<HTMLAudioElement>("#audio-player")!.currentTime = 0;
  });

  // ランプ完了まで進め、最終的に次の曲へ正しく引き継がれることも確認する。
  await page.clock.runFor(100);
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-2(\?|$)/);
  await expect(page.locator("#catalog-list li.now-playing")).toContainText("Scherzo");
});

// 2026-09-10、ChatGPTレビュー指摘（PR #444、HEAD c4cb692）：P1「Finding 1」。準備開始から
// ランプ開始までの間、先読み再生（第二audio要素）は無音のまま鳴り続けるため、実際にランプを
// 開始する時点では既に数秒分再生位置が進んでいる（本番ではCROSSFADE_PREPARE_LEAD_MS分、
// 最大約5秒）。この位置のままランプを始めると、次の曲の冒頭が丸ごとスキップされてしまう。
test("クロスフェードのランプ開始時、先読み再生（第二audio要素）の再生位置は冒頭へ巻き戻る（2026-09-10、ChatGPTレビュー指摘：P1「Finding 1」）", async ({ context, page }) => {
  await installGoogleMocks(context, { albumCatalog: true }); await page.goto("/"); await login(page);
  await page.locator("#folder-id").fill("root"); await page.locator("#spreadsheet-id").fill("sheet");
  await page.getByRole("button", { name: "索引から曲一覧を読み込む" }).click();
  await expect(page.locator("#status")).toContainText("索引から4曲");

  await page.getByRole("checkbox", { name: "曲間をクロスフェードする" }).check();

  const symphony = page.locator("#album-list li").filter({ hasText: "Symphony（3曲）" });
  await symphony.getByRole("button", { name: "このアルバムを再生" }).click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-1(\?|$)/);

  await page.clock.install();

  // 準備しきい値以下・ランプしきい値より長い窓（150ms）に入れ、準備（接続確立）だけを
  // 完了させる。
  await page.evaluate(() => {
    const audio = document.querySelector<HTMLAudioElement>("#audio-player")!;
    Object.defineProperty(audio, "duration", { value: 180, configurable: true });
    Object.defineProperty(audio, "paused", { value: false, configurable: true });
    audio.currentTime = 179.85; // 残り150ms
    audio.dispatchEvent(new Event("timeupdate"));
  });
  await expect(page.locator("#audio-player-crossfade")).toHaveAttribute("src", /album-track-2(\?|$)/);

  // E2Eモックの<audio>は実際にはネイティブ再生しないため先読み再生の位置は自然には進まない。
  // 準備完了後・ランプ開始前に実際に進んだ状態をテスト側から直接模擬する。
  await page.evaluate(() => {
    document.querySelector<HTMLAudioElement>("#audio-player-crossfade")!.currentTime = 5;
  });

  // 残り時間をランプ開始しきい値（50ms）以下へ進める。
  await page.evaluate(() => {
    const audio = document.querySelector<HTMLAudioElement>("#audio-player")!;
    audio.currentTime = 179.99; // 残り10ms
    audio.dispatchEvent(new Event("timeupdate"));
  });

  // ランプ開始（beginCrossfadeRamp()の先頭）は同期的に位置を巻き戻すため、この時点で既に
  // 冒頭（0）に戻っているはず。
  const previewPositionAtRampStart = await page.evaluate(
    () => document.querySelector<HTMLAudioElement>("#audio-player-crossfade")!.currentTime
  );
  expect(previewPositionAtRampStart).toBe(0);
});

// 2026-09-10、ChatGPTレビュー指摘（PR #444、HEAD c4cb692）：P1「Finding 2」。crossfadePreparing
// はplay()呼び出し直前（まだ何も鳴っていない可能性がある）から立つため、これだけでは
// 「先読み再生が実際に開始済みか」を保証できない。この保証が無いと、通常の残り時間トリガー
// （audioEndedバイパスではない方）が、まだ実際には再生していない（無音のままの）先読みへ
// 向けて音量ランプを始めてしまい、ランプの間ずっと入場側が本当に無音のまま進む——このPR
// 自体が解消しようとした「接続未確立のままハンドオフする」不具合を再現してしまう。
test("先読み再生がまだ実際に開始していない（play()未解決）間は、残り時間がランプしきい値に達しても音量ランプを始めない（2026-09-10、ChatGPTレビュー指摘：P1「Finding 2」）", async ({ context, page }) => {
  await installGoogleMocks(context, { albumCatalog: true }); await page.goto("/"); await login(page);
  await page.locator("#folder-id").fill("root"); await page.locator("#spreadsheet-id").fill("sheet");
  await page.getByRole("button", { name: "索引から曲一覧を読み込む" }).click();
  await expect(page.locator("#status")).toContainText("索引から4曲");

  await page.getByRole("checkbox", { name: "曲間をクロスフェードする" }).check();

  const symphony = page.locator("#album-list li").filter({ hasText: "Symphony（3曲）" });
  await symphony.getByRole("button", { name: "このアルバムを再生" }).click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-1(\?|$)/);

  await page.clock.install();

  // 第二audio要素（先読み再生）自身のplay()呼び出しだけを保留する（＝crossfadePreviewReady
  // は決して true にならない）。
  await page.evaluate(() => {
    const originalPlay = HTMLMediaElement.prototype.play;
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: function (this: HTMLMediaElement) {
        if (this.id === "audio-player-crossfade") {
          return new Promise<void>((resolve) => {
            (window as unknown as { __e2eReleasePreviewPlay?: () => void }).__e2eReleasePreviewPlay = resolve;
          });
        }
        return originalPlay.call(this);
      },
    });
  });

  // 準備しきい値以下の窓へ入れ、先読み再生の開始（play()）を試みさせる（保留されるため
  // 解決しない）。
  await page.evaluate(() => {
    const audio = document.querySelector<HTMLAudioElement>("#audio-player")!;
    Object.defineProperty(audio, "duration", { value: 180, configurable: true });
    Object.defineProperty(audio, "paused", { value: false, configurable: true });
    audio.currentTime = 179.85; // 残り150ms（準備しきい値以下）
    audio.dispatchEvent(new Event("timeupdate"));
  });
  await expect.poll(() =>
    page.evaluate(() => Boolean((window as unknown as { __e2eReleasePreviewPlay?: () => void }).__e2eReleasePreviewPlay))
  ).toBe(true);

  // 先読みのplay()がまだ解決していない間に、残り時間をランプ開始しきい値（50ms）以下へ進める。
  await page.evaluate(() => {
    const audio = document.querySelector<HTMLAudioElement>("#audio-player")!;
    audio.currentTime = 179.99; // 残り10ms
    audio.dispatchEvent(new Event("timeupdate"));
  });
  await page.clock.runFor(20);

  // page.clockはこの直接I/O待ち（保留中のplay()）を進めないため、locatorの自動リトライに
  // 頼らず1回だけ直接読み取る（CLAUDE.mdの既知の注意点参照）。先読みが未確立のため音量
  // ランプは始まっておらず、主audio要素のvolumeは1のまま（無音区間を作っていない）。
  const volumeWhilePreviewUnready = await page.evaluate(
    () => document.querySelector<HTMLAudioElement>("#audio-player")!.volume
  );
  expect(volumeWhilePreviewUnready).toBe(1);

  // 先読みのplay()を解放すると、直ちにランプが始まり実際に次の曲へ引き継がれる
  // （crossfadePreviewReadyがtrueになった時点で、maybeStartCrossfade()の次のtimeupdateが
  // 拾えるようになる）。
  await page.evaluate(() => (window as unknown as { __e2eReleasePreviewPlay?: () => void }).__e2eReleasePreviewPlay?.());
  await page.evaluate(() => {
    const audio = document.querySelector<HTMLAudioElement>("#audio-player")!;
    audio.dispatchEvent(new Event("timeupdate"));
  });
  await page.clock.runFor(100);
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-2(\?|$)/);
});

test("キュー内自然終了に近づくとクロスフェードが発生し、次の曲へ引き継がれる（開発体制#42④、2026-09-10）", async ({ context, page }) => {
  await installGoogleMocks(context, { albumCatalog: true }); await page.goto("/"); await login(page);
  await page.locator("#folder-id").fill("root"); await page.locator("#spreadsheet-id").fill("sheet");
  await page.getByRole("button", { name: "索引から曲一覧を読み込む" }).click();
  await expect(page.locator("#status")).toContainText("索引から4曲");

  await page.getByRole("checkbox", { name: "曲間をクロスフェードする" }).check();

  const symphony = page.locator("#album-list li").filter({ hasText: "Symphony（3曲）" });
  await symphony.getByRole("button", { name: "このアルバムを再生" }).click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-1(\?|$)/);

  // クロスフェードのランプ（E2Eでは50ms）はsetTimeoutベースのため、page.clockで時刻を
  // 制御して待機時間を決定的に進める（実時間のポーリングだと、後述のテスト用duration
  // 上書きがハンドオフ後も同一DOM要素に残り続け、実ブラウザのtimeupdate発火タイミング次第で
  // 次のクロスフェードまで連鎖してしまい不安定になるため。durationの上書きも、クロスフェード
  // 開始トリガーに使った1回だけを狙い撃ちできる）。
  await page.clock.install();

  // E2Eモックの音声は実際にはデコードできないダミーデータのため、durationは自然には
  // 確定しない（既存のシークバー/Media Session E2Eの制限と同じ理由）。曲の末尾に近づいた
  // 状態をテスト側から直接作り、timeupdateでクロスフェード判定をトリガーする。pausedも
  // 同じ理由でモックされたplay()は実際にはネイティブ再生を開始しないため常にtrueのまま
  // 残ってしまい（2026-09-10、Codexレビュー指摘：P1の`audioPaused`ガード追加により判明）、
  // 上書きしないとクロスフェード自体が開始条件を満たさない。
  await page.evaluate(() => {
    const audio = document.querySelector<HTMLAudioElement>("#audio-player")!;
    Object.defineProperty(audio, "duration", { value: 180, configurable: true });
    Object.defineProperty(audio, "paused", { value: false, configurable: true });
    audio.currentTime = 179.99;
    audio.dispatchEvent(new Event("timeupdate"));
  });

  // クロスフェード開始直後、第二audio要素に次の曲（album-track-2）のストリームURLが設定される。
  await expect(page.locator("#audio-player-crossfade")).toHaveAttribute("src", /album-track-2(\?|$)/);

  // ハンドオフ後、耐久性のためduration上書きを元に戻す（現実的なdurationに戻すことで、
  // 万一ハンドオフ後に何らかの理由でtimeupdateが再度発火しても連鎖クロスフェードを起こさない）。
  await page.evaluate(() => {
    document.querySelector<HTMLAudioElement>("#audio-player")!.currentTime = 0;
  });

  // クロスフェード完了（E2Eでは50ms、30ステップ）まで仮想時刻を進める。既存の
  // queue.advanceOnEnded()経由でメインのaudio-playerが次の曲へ実際に引き継がれる。
  await page.clock.runFor(100);
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-2(\?|$)/);
  await expect(page.locator("#catalog-list li.now-playing")).toContainText("Scherzo");
});

test("手動で「次へ」を押すとクロスフェードが中断され、第二audio要素がリセットされる（開発体制#42④、2026-09-10）", async ({ context, page }) => {
  await installGoogleMocks(context, { albumCatalog: true }); await page.goto("/"); await login(page);
  await page.locator("#folder-id").fill("root"); await page.locator("#spreadsheet-id").fill("sheet");
  await page.getByRole("button", { name: "索引から曲一覧を読み込む" }).click();
  await expect(page.locator("#status")).toContainText("索引から4曲");

  await page.getByRole("checkbox", { name: "曲間をクロスフェードする" }).check();

  const symphony = page.locator("#album-list li").filter({ hasText: "Symphony（3曲）" });
  await symphony.getByRole("button", { name: "このアルバムを再生" }).click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-1(\?|$)/);

  // 上記テストと同じ理由でpage.clockを使い、クロスフェードのランプ中に確実に割り込む。
  await page.clock.install();
  await page.evaluate(() => {
    const audio = document.querySelector<HTMLAudioElement>("#audio-player")!;
    Object.defineProperty(audio, "duration", { value: 180, configurable: true });
    Object.defineProperty(audio, "paused", { value: false, configurable: true });
    audio.currentTime = 179.99;
    audio.dispatchEvent(new Event("timeupdate"));
  });
  await expect(page.locator("#audio-player-crossfade")).toHaveAttribute("src", /album-track-2(\?|$)/);

  // ハンドオフ後、duration上書きを元に戻す（テスト用の"末尾間近"状態を解除しないと、
  // 割り込み後に切り替わる次の曲でも同じ条件が成立し、新しいクロスフェードが連鎖して
  // しまう。上記の成功パステストと同じ理由）。
  await page.evaluate(() => {
    const audio = document.querySelector<HTMLAudioElement>("#audio-player")!;
    Object.defineProperty(audio, "duration", { value: NaN, configurable: true });
    audio.currentTime = 0;
  });

  // クロスフェードが完了しきる前（ランプの途中）に手動で「次へ」を押すと中断され、
  // そのまま次の曲（album-track-2）へ直接遷移する。クロスフェード完了を待たずに割り込んでも、
  // 第二audio要素は使われなくなりsrcが空へ戻ることを確認する（cancelCrossfadeIfActive()の
  // 回帰防止）。
  await page.getByRole("button", { name: "次へ" }).click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-2(\?|$)/);
  await expect(page.locator("#audio-player-crossfade")).not.toHaveAttribute("src");

  // 中断されたクロスフェードのランプが後から時刻経過で最後まで走り切っても、既に無効化
  // されたトークン（crossfadeGeneration）のため、以後の再生状態を巻き戻さないことも確認する。
  await page.clock.runFor(100);
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-2(\?|$)/);
});

test("クロスフェードのランプ中に主audio要素が自然終了（ended）しても、ランプを追い越して再度先頭から再生し直さない（2026-09-10、Codexレビュー指摘：P1）", async ({ context, page }) => {
  // クロスフェードは残り時間がクロスフェード長（E2Eでは50ms）以下になった時点で開始する一方、
  // ランプ自体は常に固定長走るため、開始タイミング次第で主audio要素の実際の'ended'はランプ
  // 完了より先に発火しうる。この'ended'を無視せず通常通りadvanceOnEnded()してしまうと、
  // クロスフェードのランプ・先読み再生とは別に次の曲が0秒目から即座に開始され、直後に
  // クロスフェード側のハンドオフがそれを追い越して曲を最初からやり直してしまう（音量も
  // 一時的にvolume=1へ強制的に戻る）。
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
  await expect(page.locator("#audio-player-crossfade")).toHaveAttribute("src", /album-track-2(\?|$)/);

  // ランプが完了する前に、主audio要素の自然終了（'ended'）を模擬発火する。
  await page.evaluate(() => {
    document.querySelector<HTMLAudioElement>("#audio-player")!.dispatchEvent(new Event("ended"));
  });

  // 'ended'に反応して即座に次の曲（album-track-2）へ切り替わっていないこと（ランプがまだ
  // 完了していないため、クロスフェード自身のハンドオフが先に進んでいてはならない）。
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-1(\?|$)/);

  // ハンドオフ後、duration/paused上書きを元に戻す（テスト用の"末尾間近"状態を解除しないと、
  // 割り込み後に切り替わる次の曲でも同じ条件が成立し、新しいクロスフェードが連鎖してしまう。
  // 上記の成功パステストと同じ理由）。
  await page.evaluate(() => {
    const audio = document.querySelector<HTMLAudioElement>("#audio-player")!;
    Object.defineProperty(audio, "duration", { value: NaN, configurable: true });
    audio.currentTime = 0;
  });

  // ランプ完了まで仮想時刻を進めると、クロスフェード自身のハンドオフによって（'ended'による
  // 二重の遷移ではなく）1回だけ次の曲へ引き継がれる。
  await page.clock.runFor(100);
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-2(\?|$)/);
  await expect(page.locator("#catalog-list li.now-playing")).toContainText("Scherzo");
});

test("クロスフェードのランプ中に主audio要素が一時停止/自然終了しても、Media Sessionのplaybackstateを一時停止にしない（2026-09-10、Codexレビュー指摘：P1）", async ({ context, page }) => {
  // クロスフェード中は実際には第二audio要素経由で音声が鳴り続けているため、主audio要素の
  // 自然終了（同時に発火する'pause'含む）でMedia Sessionのplaybackstateを"paused"にすると、
  // OS/ヘッドセット側の表示がPlayに切り替わり、それを押すと既に終了済みの主audio要素へ
  // 再生要求が飛んでしまう不具合があった。
  await installGoogleMocks(context, { albumCatalog: true }); await page.goto("/"); await login(page);
  await page.locator("#folder-id").fill("root"); await page.locator("#spreadsheet-id").fill("sheet");
  await page.getByRole("button", { name: "索引から曲一覧を読み込む" }).click();
  await expect(page.locator("#status")).toContainText("索引から4曲");

  await page.getByRole("checkbox", { name: "曲間をクロスフェードする" }).check();

  const symphony = page.locator("#album-list li").filter({ hasText: "Symphony（3曲）" });
  await symphony.getByRole("button", { name: "このアルバムを再生" }).click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-1(\?|$)/);

  // 再生中状態を作る（ネイティブ'playing'イベントを模擬発火）。
  await page.evaluate(() => {
    document.querySelector<HTMLAudioElement>("#audio-player")!.dispatchEvent(new Event("playing"));
  });
  await expect.poll(() => page.evaluate(() => navigator.mediaSession.playbackState)).toBe("playing");

  await page.clock.install();
  await page.evaluate(() => {
    const audio = document.querySelector<HTMLAudioElement>("#audio-player")!;
    Object.defineProperty(audio, "duration", { value: 180, configurable: true });
    Object.defineProperty(audio, "paused", { value: false, configurable: true });
    audio.currentTime = 179.99;
    audio.dispatchEvent(new Event("timeupdate"));
  });
  await expect(page.locator("#audio-player-crossfade")).toHaveAttribute("src", /album-track-2(\?|$)/);

  // 実ブラウザは自然終了時に'pause'→'ended'の順で発火する（曲の自然終了専用のテストと同じ
  // 前提）。ランプがまだ完了していない状態で両方を模擬発火する。
  await page.evaluate(() => {
    const audio = document.querySelector<HTMLAudioElement>("#audio-player")!;
    audio.dispatchEvent(new Event("pause"));
    audio.dispatchEvent(new Event("ended"));
  });

  // playbackstateは"paused"へ変わっていないこと（実際には音が鳴り続けているため）。
  expect(await page.evaluate(() => navigator.mediaSession.playbackState)).toBe("playing");
});

test("クロスフェードのランプ中に独自シークバーで曲末尾から離れる方向へシークすると、クロスフェードが打ち切られる（2026-09-10、Codexレビュー指摘：P1）", async ({ context, page }) => {
  // シークバーの操作はcrossfadeGenerationを変えないため、クロスフェード自身のisCancelled()
  // 判定（世代比較のみ）ではシークを検知できず、曲末尾から離れる方向へシークしても
  // ランプが止まらず、3秒後に予期しない曲送りが起きてしまう不具合があった。
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
  await expect(page.locator("#audio-player-crossfade")).toHaveAttribute("src", /album-track-2(\?|$)/);

  // シークバーを曲の先頭付近（末尾から離れる方向）へドラッグして離す。
  await page.evaluate(() => {
    const slider = document.querySelector<HTMLInputElement>("#seek-slider")!;
    slider.disabled = false;
    slider.max = "180";
    slider.value = "10";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    slider.dispatchEvent(new Event("change", { bubbles: true }));
  });

  // 中断されたクロスフェードの第二audio要素はリセットされる。
  await expect(page.locator("#audio-player-crossfade")).not.toHaveAttribute("src");

  // ランプが本来完了するはずだった時刻を過ぎても、曲は切り替わらない（ユーザーのシークが
  // 保持される）。
  await page.clock.runFor(100);
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-1(\?|$)/);
});

test("先読み再生の開始（play()）が応答なく固まっても、タイムアウトしてクロスフェード状態が解除され自然終了時の自動送りが機能する（2026-09-10、Codexレビュー指摘：P1）", async ({ context, page }) => {
  // Driveストリームが拒否も解決もせず単に無応答のままだと、crossfadeAudio.play()が永久に
  // 解決せずcrossfading=trueのまま固まり、主audio要素側の'ended'抑止（onEndedコールバック）が
  // キューの自動送りを無期限に止めてしまう不具合があった。
  await installGoogleMocks(context, { albumCatalog: true }); await page.goto("/"); await login(page);
  await page.locator("#folder-id").fill("root"); await page.locator("#spreadsheet-id").fill("sheet");
  await page.getByRole("button", { name: "索引から曲一覧を読み込む" }).click();
  await expect(page.locator("#status")).toContainText("索引から4曲");

  await page.getByRole("checkbox", { name: "曲間をクロスフェードする" }).check();

  const symphony = page.locator("#album-list li").filter({ hasText: "Symphony（3曲）" });
  await symphony.getByRole("button", { name: "このアルバムを再生" }).click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-1(\?|$)/);

  await page.clock.install();

  // 第二audio要素（クロスフェードの先読み再生用）のplay()だけを永久に解決しないようにする。
  await page.evaluate(() => {
    const originalPlay = HTMLMediaElement.prototype.play;
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: function (this: HTMLMediaElement) {
        if (this.id === "audio-player-crossfade") return new Promise<void>(() => {});
        return originalPlay.call(this);
      },
    });
  });

  await page.evaluate(() => {
    const audio = document.querySelector<HTMLAudioElement>("#audio-player")!;
    Object.defineProperty(audio, "duration", { value: 180, configurable: true });
    Object.defineProperty(audio, "paused", { value: false, configurable: true });
    audio.currentTime = 179.99;
    audio.dispatchEvent(new Event("timeupdate"));
  });

  // 先読み再生の開始タイムアウト（E2Eでは200ms）を過ぎるまで仮想時刻を進める。
  await page.clock.runFor(300);

  // タイムアウトによりcrossfadingが解除されているため、主audio要素の自然終了（'ended'）で
  // 通常の自動送りが機能する（解除されていなければ、この'ended'は無視され続け曲が進まない）。
  await page.evaluate(() => {
    document.querySelector<HTMLAudioElement>("#audio-player")!.dispatchEvent(new Event("ended"));
  });
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-2(\?|$)/);
});

test("先読み再生の開始タイムアウト後にDriveストリームが遅れて復旧しても、第二audio要素が無音のまま鳴り続けない（2026-09-10、Codexレビュー指摘：P2）", async ({ context, page }) => {
  // withTimeout()はタイムアウト時に元のplay()自体を中断できないため、タイムアウト後に
  // 遅れてplay()が実際に解決すると、後始末（pause+src除去）をしていなければ第二audio要素が
  // srcを保持したまま無音で再生され続け、以後Drive呼び出し・デコーダーが不要に動き続けてしまう。
  await installGoogleMocks(context, { albumCatalog: true }); await page.goto("/"); await login(page);
  await page.locator("#folder-id").fill("root"); await page.locator("#spreadsheet-id").fill("sheet");
  await page.getByRole("button", { name: "索引から曲一覧を読み込む" }).click();
  await expect(page.locator("#status")).toContainText("索引から4曲");

  await page.getByRole("checkbox", { name: "曲間をクロスフェードする" }).check();

  const symphony = page.locator("#album-list li").filter({ hasText: "Symphony（3曲）" });
  await symphony.getByRole("button", { name: "このアルバムを再生" }).click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-1(\?|$)/);

  await page.clock.install();

  // 第二audio要素のplay()だけを、タイムアウト（200ms）より遅い1000ms後に解決するようにする
  // （「永久に保留」ではなく「タイムアウト後に遅れて復旧」を再現する）。
  await page.evaluate(() => {
    const originalPlay = HTMLMediaElement.prototype.play;
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: function (this: HTMLMediaElement) {
        if (this.id === "audio-player-crossfade") {
          return new Promise<void>((resolve) => { setTimeout(resolve, 1000); });
        }
        return originalPlay.call(this);
      },
    });
  });

  await page.evaluate(() => {
    const audio = document.querySelector<HTMLAudioElement>("#audio-player")!;
    Object.defineProperty(audio, "duration", { value: 180, configurable: true });
    Object.defineProperty(audio, "paused", { value: false, configurable: true });
    audio.currentTime = 179.99;
    audio.dispatchEvent(new Event("timeupdate"));
  });

  // タイムアウト（200ms）を過ぎた時点で、第二audio要素は既に後始末（src除去）されている。
  await page.clock.runFor(300);
  await expect(page.locator("#audio-player-crossfade")).not.toHaveAttribute("src");

  // 元のplay()が遅れて解決する時刻（1000ms）まで仮想時刻を進めても、srcが再び付いたり
  // 例外が起きたりしない（無音再生が続かないことの確認）。
  await page.clock.runFor(800);
  await expect(page.locator("#audio-player-crossfade")).not.toHaveAttribute("src");
});

test("手動フェードアウト待機中は、残り時間がクロスフェード閾値に入ってもクロスフェードを開始しない（2026-09-10、ChatGPTレビュー指摘：P1）", async ({ context, page }) => {
  // 手動フェードアウト（既定約2秒、E2Eでは短縮）を伴う一時停止/次へ/前へは、その待機中も
  // 旧曲がまだ再生中のままtimeupdateが継続するため、crossfading・audioPaused・
  // isPlayingFromQueue()だけではクロスフェードの開始を防げず、フェード完了直前の
  // onTransitionStart()で最終的な二重commitこそ防げるものの、その手前で先読み再生が
  // 始まってしまう（クロスフェードは「キュー内曲の自然終了時のみ」の設計に反する）不具合が
  // あった。
  await installGoogleMocks(context, { albumCatalog: true }); await page.goto("/"); await login(page);
  await page.locator("#folder-id").fill("root"); await page.locator("#spreadsheet-id").fill("sheet");
  await page.getByRole("button", { name: "索引から曲一覧を読み込む" }).click();
  await expect(page.locator("#status")).toContainText("索引から4曲");

  await page.getByRole("checkbox", { name: "曲間をクロスフェードする" }).check();
  await page.getByRole("checkbox", { name: "手動スキップ/一時停止時にフェードアウトする" }).check();

  const symphony = page.locator("#album-list li").filter({ hasText: "Symphony（3曲）" });
  await symphony.getByRole("button", { name: "このアルバムを再生" }).click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-1(\?|$)/);

  await page.evaluate(() => {
    const audio = document.querySelector<HTMLAudioElement>("#audio-player")!;
    Object.defineProperty(audio, "paused", { value: false, configurable: true });
  });

  await page.clock.install();

  // 「一時停止」ボタンでフェードアウトを開始する（E2Eでは短縮された時間）。
  await page.getByRole("button", { name: "一時停止" }).click();

  // フェードが完了しきる前の時点まで仮想時刻を進める。
  await page.clock.runFor(10);

  // フェード待機中に残り時間がクロスフェード閾値（3秒）へ入っても、クロスフェードは
  // 開始しない（第二audio要素にsrcが設定されない）。
  await page.evaluate(() => {
    const audio = document.querySelector<HTMLAudioElement>("#audio-player")!;
    Object.defineProperty(audio, "duration", { value: 180, configurable: true });
    audio.currentTime = 179.99;
    audio.dispatchEvent(new Event("timeupdate"));
  });
  // page.clockでランプ用setTimeoutを止めていても、crossfadeAudio.play()自体は
  // モックされたPromise.resolve()で即座に解決しRangeフェッチ（Service Worker経由の実際の
  // 非同期I/O）が続いて走るため、locatorのtoHaveAttribute()の自動リトライ待ちの間に
  // src自体が後から変化しうる（偽陰性の原因になった。1回だけの直接読み取りで判定する）。
  const crossfadeSrc = await page.evaluate(() => document.querySelector("#audio-player-crossfade")!.getAttribute("src"));
  expect(crossfadeSrc).toBeNull();
});

test("認証継続の再試行中も、手動遷移ガード（manualTransitionCount）が維持される（2026-09-10、Codexレビュー指摘：P1）", async ({ context, page }) => {
  // 修正前はmanualTransitionInFlight（boolean）の増減をhandleQueuePlayback()の外側
  // （handlePlaybackAction()を呼ぶ前後）に置いていたため、action自体がPlaybackAuthentication
  // RequiredErrorを投げてplaybackAuthGate.defer(() => handlePlaybackAction(action))で再試行が
  // 登録された時点で、外側のtry/finallyは（再試行の完了を待たず）即座に完了してしまい、
  // ユーザーが「認証を更新して続行」をクリックした後の実際の再試行中はガードが一切掛からなく
  // なっていた。トークンをテスト側から失効させ、この再試行中にmanualTransitionCountが
  // 0より大きいままであることを直接検証する。
  await installGoogleMocks(context, { albumCatalog: true }); await page.goto("/"); await login(page);
  await page.locator("#folder-id").fill("root"); await page.locator("#spreadsheet-id").fill("sheet");
  await page.getByRole("button", { name: "索引から曲一覧を読み込む" }).click();
  await expect(page.locator("#status")).toContainText("索引から4曲");

  const symphony = page.locator("#album-list li").filter({ hasText: "Symphony（3曲）" });
  await symphony.getByRole("button", { name: "このアルバムを再生" }).click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-1(\?|$)/);

  // 「次へ」がトークン失効中のPlaybackAuthenticationRequiredErrorを実際に踏むように、
  // 「次へ」のハンドオフ先（album-track-2）へのplay()呼び出し自体は保留せず即座に解決させる
  // （このテストはtimeupdate等の時刻経過を使わないため、page.clockは使わない）。トークンの
  // 失効はGISモックの`expires_in: 3600`から実際に1時間超経過させて再現する。
  await page.clock.install();
  await page.clock.fastForward(3_601_000);

  await page.getByRole("button", { name: "次へ" }).click();
  await expect(page.getByRole("button", { name: "認証を更新して続行" })).toBeVisible();
  // トークン確認自体はplay()呼び出しの前に即座に失敗するため、再試行が始まる前は
  // ガードは掛からない（すぐ解除される）。
  expect(await page.evaluate(() => (window as unknown as { __e2e: { isManualTransitionInFlight: () => boolean } }).__e2e.isManualTransitionInFlight())).toBe(false);

  // 再試行のplay()呼び出し（album-track-2への実際の切り替え）だけを保留し、再試行が
  // 進行中の間にガードの状態を確認できるようにする。
  let releaseTrack2Play: (() => void) | undefined;
  await page.evaluate(() => {
    const originalPlay = HTMLMediaElement.prototype.play;
    (window as unknown as { __e2eReleaseTrack2Play?: () => void }).__e2eReleaseTrack2Play = undefined;
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: function (this: HTMLMediaElement) {
        if (this.id === "audio-player" && this.src.includes("album-track-2")) {
          return new Promise<void>((resolve) => {
            (window as unknown as { __e2eReleaseTrack2Play?: () => void }).__e2eReleaseTrack2Play = resolve;
          });
        }
        return originalPlay.call(this);
      },
    });
  });

  await page.getByRole("button", { name: "認証を更新して続行" }).click();

  // 再試行のクロージャがawaitServiceWorkerReady()を抜けてaction()（queue.next()）を実行し、
  // album-track-2へのplay()呼び出しが（上記のオーバーライドにより）保留された状態まで進むのを
  // 待つ。この間、ガードは掛かったままのはず（修正前は再試行開始時点で既に解除されていた）。
  await expect.poll(() => page.evaluate(() => Boolean((window as unknown as { __e2eReleaseTrack2Play?: () => void }).__e2eReleaseTrack2Play))).toBe(true);
  expect(await page.evaluate(() => (window as unknown as { __e2e: { isManualTransitionInFlight: () => boolean } }).__e2e.isManualTransitionInFlight())).toBe(true);

  // 保留していたplay()を解決し、再試行が完了するとガードも解除される。
  await page.evaluate(() => (window as unknown as { __e2eReleaseTrack2Play: () => void }).__e2eReleaseTrack2Play());
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-2(\?|$)/);
  expect(await page.evaluate(() => (window as unknown as { __e2e: { isManualTransitionInFlight: () => boolean } }).__e2e.isManualTransitionInFlight())).toBe(false);
});

test("Service Workerの準備待ちが遅延している間も、手動遷移ガードは最初から掛かっている（2026-09-10、Codexレビュー指摘：P1）", async ({ context, page }) => {
  // 修正前はmanualTransitionCountのincrementがawaitServiceWorkerReady()より後にあったため、
  // Service Workerの準備が遅延している間はガードがまだ掛からず、その待機中にtimeupdateが
  // クロスフェードを開始・完了させてしまうと、準備完了後にこの手動操作の遷移とクロスフェードの
  // ハンドオフが競合しうる窓が残っていた。
  const mock = await installGoogleMocks(context, { delayServiceWorkerActivation: true, albumCatalog: true });
  await page.goto("/"); await login(page);
  await page.locator("#folder-id").fill("root"); await page.locator("#spreadsheet-id").fill("sheet");
  await page.getByRole("button", { name: "索引から曲一覧を読み込む" }).click();
  await expect(page.locator("#status")).toContainText("索引から4曲");

  const isGuardActive = () => page.evaluate(() => (window as unknown as { __e2e: { isManualTransitionInFlight: () => boolean } }).__e2e.isManualTransitionInFlight());
  expect(await isGuardActive()).toBe(false);

  const symphony = page.locator("#album-list li").filter({ hasText: "Symphony（3曲）" });
  await symphony.getByRole("button", { name: "このアルバムを再生" }).click();

  // Service Worker制御はまだ来ていない（awaitServiceWorkerReady()が保留中）が、ガードは
  // この待機に入る前の時点で既に掛かっているはず（修正前は待機中はまだfalseのままだった）。
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller === null)).toBe(true);
  expect(await isGuardActive()).toBe(true);

  mock.releaseServiceWorker();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-1(\?|$)/);
  expect(await isGuardActive()).toBe(false);
});

test("外部単曲試聴（この曲を再生）の実行中も、手動遷移ガードが掛かりキュー側のクロスフェードを止める（2026-09-10、ChatGPT再レビュー指摘：P1）", async ({ context, page }) => {
  // handlePlay()（キュー外の単曲試聴）はcancelCrossfadeIfActive()を1回呼ぶだけで、
  // handleQueuePlayback()と異なりmanualTransitionCountを一切増減していなかった。外部再生の
  // 試行中（Service Worker準備待ち・実際のplay()解決待ちのいずれも）は、まだ
  // queue.notifyExternalPlaybackStarted()が呼ばれていないため、キュー側は
  // isPlayingFromQueue()がtrueのまま・audioPlayerのpausedもfalseのまま残る。この間にキュー曲が
  // 末尾3秒圏内に入ると、外部再生が「選ばれていない」キューの次曲へのクロスフェードを開始・
  // 完了させてしまいうる（PR仕様「外部単曲試聴はクロスフェード対象外」に反する）。
  await installGoogleMocks(context, { albumCatalog: true }); await page.goto("/"); await login(page);
  await page.locator("#folder-id").fill("root"); await page.locator("#spreadsheet-id").fill("sheet");
  await page.getByRole("button", { name: "索引から曲一覧を読み込む" }).click();
  await expect(page.locator("#status")).toContainText("索引から4曲");

  await page.getByRole("checkbox", { name: "曲間をクロスフェードする" }).check();

  const symphony = page.locator("#album-list li").filter({ hasText: "Symphony（3曲）" });
  await symphony.getByRole("button", { name: "このアルバムを再生" }).click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-1(\?|$)/);

  // 外部単曲試聴（別のfileId）の主audio要素へのplay()呼び出しだけを保留し、その待機中の
  // 状態を検証できるようにする。
  await page.evaluate(() => {
    const originalPlay = HTMLMediaElement.prototype.play;
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: function (this: HTMLMediaElement) {
        if (this.id === "audio-player" && this.src.includes("external-track")) {
          return new Promise<void>((resolve) => {
            (window as unknown as { __e2eReleaseExternalPlay?: () => void }).__e2eReleaseExternalPlay = resolve;
          });
        }
        return originalPlay.call(this);
      },
    });
  });

  await page.locator("#play-file-id").fill("external-track");
  await page.getByRole("button", { name: "この曲を再生" }).click();

  const isGuardActive = () => page.evaluate(() => (window as unknown as { __e2e: { isManualTransitionInFlight: () => boolean } }).__e2e.isManualTransitionInFlight());
  await expect.poll(() => page.evaluate(() => Boolean((window as unknown as { __e2eReleaseExternalPlay?: () => void }).__e2eReleaseExternalPlay))).toBe(true);
  expect(await isGuardActive()).toBe(true);

  // 外部再生の試行中、キュー側の主audio要素（同じDOM要素）が末尾3秒圏内に入っても、
  // ガードによりクロスフェードは開始されない。
  await page.evaluate(() => {
    const audio = document.querySelector<HTMLAudioElement>("#audio-player")!;
    Object.defineProperty(audio, "duration", { value: 180, configurable: true });
    Object.defineProperty(audio, "paused", { value: false, configurable: true });
    audio.currentTime = 179.99;
    audio.dispatchEvent(new Event("timeupdate"));
  });
  const crossfadeSrc = await page.evaluate(() => document.querySelector("#audio-player-crossfade")!.getAttribute("src"));
  expect(crossfadeSrc).toBeNull();

  await page.evaluate(() => (window as unknown as { __e2eReleaseExternalPlay: () => void }).__e2eReleaseExternalPlay());
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /external-track(\?|$)/);
  expect(await isGuardActive()).toBe(false);
});

test("一時停止ボタンを連打（1回目のフェード完了前に2回目）しても、両方が解決するまで手動遷移ガードが維持される（2026-09-10、Codexレビュー指摘：P1）", async ({ context, page }) => {
  // 修正前はmanualTransitionInFlightがbooleanのため、1回目のクリックのpause()フェードが
  // 2回目のクリックにより追い越されて早期returnした時点で、1回目の`finally`がガードを
  // falseへ戻してしまい、2回目のフェードがまだ進行中でもガードが解除されてしまっていた。
  await installGoogleMocks(context, { albumCatalog: true }); await page.goto("/"); await login(page);
  await page.locator("#folder-id").fill("root"); await page.locator("#spreadsheet-id").fill("sheet");
  await page.getByRole("button", { name: "索引から曲一覧を読み込む" }).click();
  await expect(page.locator("#status")).toContainText("索引から4曲");

  await page.getByRole("checkbox", { name: "手動スキップ/一時停止時にフェードアウトする" }).check();

  const symphony = page.locator("#album-list li").filter({ hasText: "Symphony（3曲）" });
  await symphony.getByRole("button", { name: "このアルバムを再生" }).click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-1(\?|$)/);
  await page.evaluate(() => {
    const audio = document.querySelector<HTMLAudioElement>("#audio-player")!;
    Object.defineProperty(audio, "paused", { value: false, configurable: true });
  });

  await page.clock.install();

  const isGuardActive = () => page.evaluate(() => (window as unknown as { __e2e: { isManualTransitionInFlight: () => boolean } }).__e2e.isManualTransitionInFlight());

  await page.getByRole("button", { name: "一時停止" }).click(); // 1回目
  expect(await isGuardActive()).toBe(true);

  await page.clock.runFor(10); // 1回目のフェード（E2Eでは50ms）の途中まで進める

  await page.getByRole("button", { name: "一時停止" }).click(); // 2回目、1回目のフェードを追い越す
  expect(await isGuardActive()).toBe(true);

  // 1回目のフェードが自身の次のステップで中断（isCancelled）を検知し、早期returnで解決する。
  await page.clock.runFor(5);
  // 1回目のfinallyが解決済みでも、2回目のフェードがまだ進行中のためガードは維持される
  // （修正前はここでfalseになってしまう）。
  expect(await isGuardActive()).toBe(true);

  // 2回目のフェードも完了させると、ようやくガードが解除される。
  await page.clock.runFor(60);
  expect(await isGuardActive()).toBe(false);
});

// 2026-09-10、ChatGPTレビュー指摘（PR #444、HEAD c4cb692）：P1「Finding 2」を受けて、この
// テストが検証する挙動自体を変更した。旧実装は「先読み再生（crossfadeAudio.play()）がまだ
// 開始していなくても、退場側が自然終了していればランプを省略して直ちにハンドオフする」方針
// だったが、これは「先読みが未確立のままハンドオフする」不具合そのもの（play()未解決の
// crossfadeAudioへ実際にハンドオフ・位置同期しようとする）だったと判明した。現在は
// shouldBeginCrossfadeRampにpreviewReadyガードを追加し、先読みが実際に開始済み
// （play()解決済み）でない限り、audioEndedバイパスであってもランプ・ハンドオフを一切
// 試みず、通常の自動送り（クロスフェード無し）へフォールバックするよう修正した。
test("先読み再生の開始待ち中に主audio要素が自然終了しても、未確立のままハンドオフせず通常の自動送りへフォールバックする（2026-09-10、ChatGPTレビュー指摘：P1「Finding 2」による方針変更）", async ({ context, page }) => {
  // Driveストリームの応答が遅く、先読み再生の開始（crossfadeAudio.play()）に時間がかかると、
  // その間に主audio要素の残り時間（開始時点で3秒以内）が尽きて自然終了してしまうことがある
  // （この'ended'はcrossfading中のため既に抑止済み）。
  await installGoogleMocks(context, { albumCatalog: true }); await page.goto("/"); await login(page);
  await page.locator("#folder-id").fill("root"); await page.locator("#spreadsheet-id").fill("sheet");
  await page.getByRole("button", { name: "索引から曲一覧を読み込む" }).click();
  await expect(page.locator("#status")).toContainText("索引から4曲");

  await page.getByRole("checkbox", { name: "曲間をクロスフェードする" }).check();

  const symphony = page.locator("#album-list li").filter({ hasText: "Symphony（3曲）" });
  await symphony.getByRole("button", { name: "このアルバムを再生" }).click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-1(\?|$)/);

  await page.clock.install();

  // 第二audio要素のplay()の解決を100ms遅らせる（この間に主audio要素が自然終了する状況を
  // 再現する）。
  await page.evaluate(() => {
    const originalPlay = HTMLMediaElement.prototype.play;
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: function (this: HTMLMediaElement) {
        if (this.id === "audio-player-crossfade") {
          return new Promise<void>((resolve) => { setTimeout(resolve, 100); });
        }
        return originalPlay.call(this);
      },
    });
  });

  await page.evaluate(() => {
    const audio = document.querySelector<HTMLAudioElement>("#audio-player")!;
    Object.defineProperty(audio, "duration", { value: 180, configurable: true });
    Object.defineProperty(audio, "paused", { value: false, configurable: true });
    audio.currentTime = 179.99;
    audio.dispatchEvent(new Event("timeupdate"));
  });
  await expect(page.locator("#audio-player-crossfade")).toHaveAttribute("src", /album-track-2(\?|$)/);

  // 先読み再生の開始待ち中に主audio要素が自然終了する（'ended'、同時に'pause'も発火）。
  // dispatchEvent()自体はネイティブの.endedプロパティを変えないため、実ブラウザの自然終了と
  // 同じ状態を模擬するために明示的に上書きする（main.ts側の修正はaudioPlayer.endedの実際の
  // 値を見て判定するため）。'ended'ディスパッチと同じ同期的なタイミングで、durationの固定値
  // （180）も解除しておく（他のクロスフェードE2Eと同じ理由：フォールバックで次の曲
  //〈album-track-2〉へ切り替わった後、万一この固定値が残ったまま実ブラウザ由来のstray
  // timeupdateが発火すると、同じ「残り時間が閾値以内」条件を新しい曲に対しても満たしてしまい、
  // このテストの本題とは無関係な別のクロスフェードが連鎖してしまう）。
  await page.evaluate(() => {
    const audio = document.querySelector<HTMLAudioElement>("#audio-player")!;
    Object.defineProperty(audio, "ended", { value: true, configurable: true });
    audio.dispatchEvent(new Event("pause"));
    audio.dispatchEvent(new Event("ended"));
    Object.defineProperty(audio, "duration", { value: NaN, configurable: true });
  });

  // フォールバック（通常のadvanceOnEnded()経由）は先読みのplay()解決を待たず即座に完了する。
  // page.clock使用時はtoHaveAttribute()の自動リトライが偽陰性になりうるため（上記「手動
  // フェードアウト待機中は...」テストの注記参照）、1回だけの直接読み取りで判定する。
  const srcAfterFallback = await page.evaluate(() => document.querySelector("#audio-player")!.getAttribute("src"));
  expect(srcAfterFallback).toMatch(/album-track-2(\?|$)/);
  // 未確立だった先読み（第二audio要素）はcancelCrossfadeIfActive()経由で後始末され、
  // srcを保持したまま残らない（クロスフェードは一切成立していないため）。
  const crossfadeSrcAfterFallback = await page.evaluate(() =>
    document.querySelector("#audio-player-crossfade")!.hasAttribute("src")
  );
  expect(crossfadeSrcAfterFallback).toBe(false);

  // 耐久性のため、100ms経過後（先読みのplay()が遅れて解決するタイミング）に副作用が無いことも
  // 確認しておく（既にキャンセル済みのため、generation不一致によりcrossfadePreviewReadyには
  // 反映されず、何も起きないはず）。
  await page.clock.runFor(100);
  const srcAfterDelayedResolve = await page.evaluate(() => document.querySelector("#audio-player")!.getAttribute("src"));
  expect(srcAfterDelayedResolve).toMatch(/album-track-2(\?|$)/);
});

test("先読み再生中（入場側）の曲がクロスフェード長より短く先に自然終了しても、ランプを完了扱いにして進める（2026-09-10、Codexレビュー指摘：P2）", async ({ context, page }) => {
  // 次の曲（入場側）自体がクロスフェード長（3秒）より短いと、ランプ完了前に入場側が
  // 自然終了してしまう。修正前は残りのランプが無音のまま進み、ハンドオフ位置が入場側自身の
  // 末尾になってしまっていた。
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
  await expect(page.locator("#audio-player-crossfade")).toHaveAttribute("src", /album-track-2(\?|$)/);

  // ハンドオフ後、duration/paused上書きを元に戻す（テスト用の"末尾間近"状態を解除しないと、
  // ハンドオフ後に切り替わる次の曲でも同じ条件が成立し、新しいクロスフェードが連鎖してしまう。
  // 他のクロスフェードE2Eテストと同じ理由）。
  await page.evaluate(() => {
    const audio = document.querySelector<HTMLAudioElement>("#audio-player")!;
    Object.defineProperty(audio, "duration", { value: NaN, configurable: true });
    audio.currentTime = 0;
  });

  // ランプの途中で、入場側（第二audio要素）自身が自然終了する。dispatchEvent()自体はネイティブの
  // .endedプロパティを変えないため、明示的に上書きする（main.ts側のshouldFinishEarlyは
  // crossfadeAudio.endedの実際の値を見て判定するため）。
  await page.clock.runFor(10);
  await page.evaluate(() => {
    const crossfadeAudio = document.querySelector<HTMLAudioElement>("#audio-player-crossfade")!;
    Object.defineProperty(crossfadeAudio, "ended", { value: true, configurable: true });
    crossfadeAudio.dispatchEvent(new Event("ended"));
  });

  // 残りのランプ時間（クロスフェード長50msのうち、まだ40ms近く残っている）を待たなくても、
  // 既に完了扱いとしてハンドオフが進む（page.clock使用時はtoHaveAttribute()の自動リトライが
  // 偽陰性になりうるため、1回だけの直接読み取りで判定する）。ここでのrunFor()は小さくし、
  // 修正が無ければ「単に十分な時間が経って自然にランプが完了しただけ」で偽陽性になることを防ぐ。
  await page.clock.runFor(5);
  const src = await page.evaluate(() => document.querySelector("#audio-player")!.getAttribute("src"));
  expect(src).toMatch(/album-track-2(\?|$)/);
});

test("クロスフェードのハンドオフが認証エラーで再試行に回った後、再試行自体が別の理由で失敗しても自動送りへフォールバックする（2026-09-10、Codexレビュー指摘：P2）", async ({ context, page }) => {
  // ①ハンドオフの初回試行が認証エラーで「認証を更新して続行」の再試行へ委ねられた後、その
  // 再試行自体が（認証エラー以外の）別の理由で失敗しても、修正前は初回試行時点で一度きり
  // 判定していたフォールバックが再評価されず、再生が止まったままになっていた。②主audio要素の
  // endedは、ハンドオフのPlaybackController.play()がaudio.srcを新しい曲へ差し替えた時点で
  // ネイティブにfalseへリセットされる（既存のE2Eの多くはendedを固定own propertyで上書きして
  // いるためこのリセットが再現されず、この回帰を見逃していた）。ここではsrcのsetterに
  // フックしてこのネイティブなリセット挙動を再現し、ハンドオフ開始前に確定していた
  // 「退場側は既に自然終了していたか」を正しく使えているかを検証する。
  await installGoogleMocks(context, { albumCatalog: true }); await page.goto("/"); await login(page);
  await page.locator("#folder-id").fill("root"); await page.locator("#spreadsheet-id").fill("sheet");
  await page.getByRole("button", { name: "索引から曲一覧を読み込む" }).click();
  await expect(page.locator("#status")).toContainText("索引から4曲");

  await page.getByRole("checkbox", { name: "曲間をクロスフェードする" }).check();

  const symphony = page.locator("#album-list li").filter({ hasText: "Symphony（3曲）" });
  await symphony.getByRole("button", { name: "このアルバムを再生" }).click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-1(\?|$)/);

  await page.clock.install();

  // 主audio要素のendedを、srcが再設定されるとネイティブにfalseへリセットされる（実ブラウザの
  // 実際の挙動）ものとして再現する。ランプ開始判定の時点ではended=falseにしておき（ランプ
  // 自体が省略されず、後段でトークンを失効させる時間を確保するため）、ランプの途中で
  // 退場側が自然終了したことを模擬する（他のクロスフェードE2Eと同じ手順）。
  await page.evaluate(() => {
    const audio = document.querySelector<HTMLAudioElement>("#audio-player")!;
    let endedValue = false;
    Object.defineProperty(audio, "ended", { configurable: true, get: () => endedValue });
    (window as any).__setMainEnded = (value: boolean) => { endedValue = value; };
    const nativeSrcDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "src")!;
    Object.defineProperty(audio, "src", {
      configurable: true,
      get() { return nativeSrcDescriptor.get!.call(this); },
      set(value: string) {
        endedValue = false;
        nativeSrcDescriptor.set!.call(this, value);
      },
    });
    Object.defineProperty(audio, "duration", { value: 180, configurable: true });
    Object.defineProperty(audio, "paused", { value: false, configurable: true });
    audio.currentTime = 179.99;
    audio.dispatchEvent(new Event("timeupdate"));
    // pausedをtrueへ戻さない（2026-09-10、実機フィードバックによる再設計で判明した注意点）：
    // 準備→ランプ開始の判定が2段階に分かれ、ランプ開始しきい値（shouldBeginCrossfadeRamp）は
    // 準備の非同期完了後に評価されるため、この時点で同期的にpausedを戻すと、実際にランプ
    // 開始を判定する時点で「一時停止中」と誤判定されクロスフェード自体が始まらなくなる
    // （既存の「duration/paused上書きの連鎖」パターン対策は、旧・単相設計〈開始判定が全て
    // 同期的に完了する〉を前提にしていたため、この2段階設計には当てはまらない）。
  });
  await expect(page.locator("#audio-player-crossfade")).toHaveAttribute("src", /album-track-2(\?|$)/);

  // ランプの途中まで進める。
  await page.clock.runFor(5);
  // ここで退場側（主audio要素）自身が自然終了する。
  await page.evaluate(() => (window as any).__setMainEnded(true));
  // 残りのランプ完了・ハンドオフ試行まで仮想時刻を進める前に、トークンを実際に失効させる
  // （GISモックのexpires_in: 3600を1時間超過させる）。ランプ完了後のハンドオフ初回試行が
  // このトークンでPlaybackAuthenticationRequiredErrorを踏む。
  await page.clock.fastForward(3_601_000);
  await expect.poll(() => page.getByRole("button", { name: "認証を更新して続行" }).isVisible()).toBe(true);
  // このタイミングでは、初回試行はaudio.srcへ到達する前（トークン確認）で失敗しているため、
  // album-track-2への実際のplay()呼び出しはまだ一度も行われていない。
  const srcAfterFirstAttempt = await page.evaluate(() => document.querySelector("#audio-player")!.getAttribute("src"));
  expect(srcAfterFirstAttempt).toMatch(/album-track-1(\?|$)/);

  // 再試行（認証更新後）のplay()呼び出しだけを、認証エラー以外の理由で失敗させる。
  await page.evaluate(() => {
    const originalPlay = HTMLMediaElement.prototype.play;
    let track2AttemptCount = 0;
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: function (this: HTMLMediaElement) {
        if (this.id === "audio-player" && this.src.includes("album-track-2")) {
          track2AttemptCount += 1;
          if (track2AttemptCount === 1) return Promise.reject(new Error("再試行時の一時的なストリームエラー"));
        }
        return originalPlay.call(this);
      },
    });
  });

  await page.getByRole("button", { name: "認証を更新して続行" }).click();

  // 再試行自体が別の理由で失敗しても、フォールバックが再評価されalbum-track-2へ切り替わる
  // （src再設定によるended=falseへのネイティブリセットを経ても、ハンドオフ開始前に確定した
  // 「退場側は自然終了していた」という情報を使って正しく判定できることの確認）。
  await expect.poll(() => page.evaluate(() => document.querySelector("#status")!.textContent)).toContain("再生中");
  await expect(page.locator("#catalog-list li.now-playing")).toContainText("Scherzo");
  const src = await page.evaluate(() => document.querySelector("#audio-player")!.getAttribute("src"));
  expect(src).toMatch(/album-track-2(\?|$)/);
});

test("クロスフェードのハンドオフ自体が失敗（認証エラー以外）しても、主audio要素が自然終了済みなら通常の自動送りへフォールバックする（2026-09-10、Codexレビュー指摘：P2）", async ({ context, page }) => {
  // ランプ完了後のハンドオフ（queue.advanceToPreviewedFile()）自体が認証エラー以外の理由で
  // 失敗すると、修正前はcrossfadingの後始末だけを行い、主audio要素の自然終了に対応する
  // 遷移（'ended'は既にcrossfading中のため抑止済み）が失われたまま再生が止まってしまっていた。
  await installGoogleMocks(context, { albumCatalog: true }); await page.goto("/"); await login(page);
  await page.locator("#folder-id").fill("root"); await page.locator("#spreadsheet-id").fill("sheet");
  await page.getByRole("button", { name: "索引から曲一覧を読み込む" }).click();
  await expect(page.locator("#status")).toContainText("索引から4曲");

  await page.getByRole("checkbox", { name: "曲間をクロスフェードする" }).check();

  const symphony = page.locator("#album-list li").filter({ hasText: "Symphony（3曲）" });
  await symphony.getByRole("button", { name: "このアルバムを再生" }).click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-1(\?|$)/);

  await page.clock.install();

  // 主audio要素（#audio-player）がalbum-track-2へのハンドオフを試みる最初の1回だけplay()を
  // 認証エラー以外の汎用エラーで失敗させる（2回目以降のplay()呼び出し＝フォールバックの
  // advanceOnEnded()経由の再試行は通常通り成功させる）。
  await page.evaluate(() => {
    const originalPlay = HTMLMediaElement.prototype.play;
    let track2AttemptCount = 0;
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: function (this: HTMLMediaElement) {
        if (this.id === "audio-player" && this.src.includes("album-track-2")) {
          track2AttemptCount += 1;
          if (track2AttemptCount === 1) return Promise.reject(new Error("一時的なストリームエラー"));
        }
        return originalPlay.call(this);
      },
    });
  });

  // 主audio要素は既に自然終了済み（ended=true）とする。曲末尾間近の状態も併せて作ることで
  // クロスフェードの開始条件を満たす（rampDurationMsはended済みのため0になり、ランプ自体を
  // 待たずに直ちにハンドオフが試みられる）。
  await page.evaluate(() => {
    const audio = document.querySelector<HTMLAudioElement>("#audio-player")!;
    Object.defineProperty(audio, "duration", { value: 180, configurable: true });
    Object.defineProperty(audio, "paused", { value: false, configurable: true });
    Object.defineProperty(audio, "ended", { value: true, configurable: true });
    audio.currentTime = 179.99;
    audio.dispatchEvent(new Event("timeupdate"));
    // maybeStartCrossfade()の同期部分（この時点で既に開始判定・先読み再生の開始までは完了
    // している）はここで既に実行済みのため、以降のpausedを元に戻しても今回の判定には
    // 影響しない。E2Eモックの<audio>へ実際にsrcを設定すると、モックされたSW経由のダミー
    // データの読み込みでネイティブのtimeupdateが後から本物として発火することがあり
    // （既知の「duration/paused上書きの連鎖」パターン、CLAUDE.md参照）、pausedをtrueへ戻して
    // おくことで、その後の（意図しない）追加のtimeupdateがさらに次のクロスフェードを
    // 連鎖的に開始してしまわないようにする。
    Object.defineProperty(audio, "paused", { value: true, configurable: true });
  });

  // ハンドオフの最初の試み（失敗する）→フォールバックのadvanceOnEnded()（成功する）まで、
  // page.clockのタイマーには依存しない非同期処理のみのため、直接読み取りで完了を確認する。
  await expect(page.locator("#status")).toContainText("再生中");
  await expect(page.locator("#catalog-list li.now-playing")).toContainText("Scherzo");
  const src = await page.evaluate(() => document.querySelector("#audio-player")!.getAttribute("src"));
  expect(src).toMatch(/album-track-2(\?|$)/);
});

// 2026-09-10、実機フィードバックによるハンドオフ再設計（ランプ完了後もcrossfadeAudioを
// 即座に一時停止せず、ハンドオフ（Service Worker準備待ち・実際のDrive接続）の間も鳴らし
// 続けるよう変更）の回帰防止。旧実装はランプ完了直後にcrossfadeAudioを一時停止してから
// 接続を開始していたため、接続にかかる実時間ぶん両方のaudio要素が無音になる区間
// （「一瞬途切れる」）が生じていた。
test("クロスフェードのハンドオフ待機中も、第二audio要素は一時停止・リセットされず鳴り続ける（実機フィードバック：曲の切り替わりが一瞬途切れる不具合の再設計、2026-09-10）", async ({ context, page }) => {
  await installGoogleMocks(context, { albumCatalog: true }); await page.goto("/"); await login(page);
  await page.locator("#folder-id").fill("root"); await page.locator("#spreadsheet-id").fill("sheet");
  await page.getByRole("button", { name: "索引から曲一覧を読み込む" }).click();
  await expect(page.locator("#status")).toContainText("索引から4曲");

  await page.getByRole("checkbox", { name: "曲間をクロスフェードする" }).check();

  const symphony = page.locator("#album-list li").filter({ hasText: "Symphony（3曲）" });
  await symphony.getByRole("button", { name: "このアルバムを再生" }).click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-1(\?|$)/);

  await page.clock.install();

  // 主audio要素（#audio-player）がalbum-track-2へのハンドオフを試みるplay()呼び出しだけを
  // 保留し、その待機中の第二audio要素の状態を検証できるようにする。
  await page.evaluate(() => {
    const originalPlay = HTMLMediaElement.prototype.play;
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: function (this: HTMLMediaElement) {
        if (this.id === "audio-player" && this.src.includes("album-track-2")) {
          return new Promise<void>((resolve) => {
            (window as unknown as { __e2eReleaseHandoffPlay?: () => void }).__e2eReleaseHandoffPlay = resolve;
          });
        }
        return originalPlay.call(this);
      },
    });
  });

  await page.evaluate(() => {
    const audio = document.querySelector<HTMLAudioElement>("#audio-player")!;
    Object.defineProperty(audio, "duration", { value: 180, configurable: true });
    Object.defineProperty(audio, "paused", { value: false, configurable: true });
    audio.currentTime = 179.99;
    audio.dispatchEvent(new Event("timeupdate"));
  });
  await expect(page.locator("#audio-player-crossfade")).toHaveAttribute("src", /album-track-2(\?|$)/);

  // ランプ（E2Eでは50ms）を完了させ、ハンドオフのplay()呼び出しへ到達させる。
  await page.clock.runFor(100);
  await expect.poll(() => page.evaluate(() => Boolean((window as unknown as { __e2eReleaseHandoffPlay?: () => void }).__e2eReleaseHandoffPlay))).toBe(true);

  // page.clockのfakeタイマーはこの直接I/O待ち（保留中のplay()）を進めないため、locatorの
  // 自動リトライに頼らず1回だけ直接読み取る（CLAUDE.mdの既知の注意点参照）。ハンドオフの
  // 接続待ち中も、第二audio要素は一時停止・リセットされず（src・pauseのどちらも）鳴り続けて
  // いなければならない（pause()自体はsrc属性を変えないため、hasAttribute("src")だけでは
  // 「一時停止されたか」を区別できない。実際に呼ばれたpause()の総数も併せて確認する）。
  const stateDuringHandoff = await page.evaluate(() => ({
    hasSrc: document.querySelector<HTMLAudioElement>("#audio-player-crossfade")!.hasAttribute("src"),
    pauseCalls: (window as unknown as { __e2ePauseCalls: number }).__e2ePauseCalls,
  }));
  expect(stateDuringHandoff.hasSrc).toBe(true);
  // 直前の「album-track-1再生開始」1回だけで、まだ一度もpause()は呼ばれていない。
  expect(stateDuringHandoff.pauseCalls).toBe(0);

  // ハンドオフを完了させる：主audio要素が引き継ぎ、第二audio要素はここで初めて後始末される。
  await page.evaluate(() => (window as unknown as { __e2eReleaseHandoffPlay?: () => void }).__e2eReleaseHandoffPlay?.());
  await expect(page.locator("#catalog-list li.now-playing")).toContainText("Scherzo");
  await expect(page.locator("#audio-player-crossfade")).not.toHaveAttribute("src");
});

// 2026-09-11〜12、実機フィードバック「クロスフェードで曲が切り替わって、シークバーと
// ステータスが次曲に変わった瞬間に一瞬音飛みします」。①「バッファ済みの位置だけへ再シーク」
// （isPositionBuffered）②「バッファ済み範囲内で目標位置へできるだけ追いつく」
// （bufferedCatchUpPosition）と2段階で絞り込んだが、実機の録画（波形解析）で再検証したところ、
// バッファの有無に関わらず同じ瞬間に音飛びが再現した。一度は再シーク自体を撤去したが
// （`currentTime`書き換えが原因と判明したため）、ChatGPTレビューで「削除するとhandoff待機
// 時間ぶん曲が巻き戻って同じ区間を聞き直すことになる」と指摘され、**再シークそのものではなく
// 再シーク直後に無条件でvolumeを1へ上げていたタイミングが問題**という設計へ変更した
// （詳細は`dusty-jukebox/CLAUDE.md`「クロスフェード」節参照）。主audio要素がまだvolume 0
// （無音）のうちに先読み側の現在位置へ追いつく再シークを行い、`seeked`イベントを待ってから
// 初めてvolumeを1へ戻す。以下のテストは、この順序（無音のうちにシーク→seeked待ち→volume
// 復元）が実際に守られていることを検証する。
function overrideHandoffPlayHold(page: import("@playwright/test").Page, releaseKey: string) {
  return page.evaluate((key) => {
    const originalPlay = HTMLMediaElement.prototype.play;
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: function (this: HTMLMediaElement) {
        if (this.id === "audio-player" && this.src.includes("album-track-2")) {
          return new Promise<void>((resolve) => {
            (window as unknown as Record<string, () => void>)[key] = resolve;
          });
        }
        return originalPlay.call(this);
      },
    });
  }, releaseKey);
}

async function setUpPendingHandoff(page: import("@playwright/test").Page, releaseKey: string) {
  await page.locator("#folder-id").fill("root"); await page.locator("#spreadsheet-id").fill("sheet");
  await page.getByRole("button", { name: "索引から曲一覧を読み込む" }).click();
  await expect(page.locator("#status")).toContainText("索引から4曲");

  await page.getByRole("checkbox", { name: "曲間をクロスフェードする" }).check();

  const symphony = page.locator("#album-list li").filter({ hasText: "Symphony（3曲）" });
  await symphony.getByRole("button", { name: "このアルバムを再生" }).click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-1(\?|$)/);

  await page.clock.install();
  await overrideHandoffPlayHold(page, releaseKey);

  await page.evaluate(() => {
    const audio = document.querySelector<HTMLAudioElement>("#audio-player")!;
    Object.defineProperty(audio, "duration", { value: 180, configurable: true });
    Object.defineProperty(audio, "paused", { value: false, configurable: true });
    audio.currentTime = 179.99;
    audio.dispatchEvent(new Event("timeupdate"));
  });
  await expect(page.locator("#audio-player-crossfade")).toHaveAttribute("src", /album-track-2(\?|$)/);
  await page.clock.runFor(100);
  await expect.poll(() =>
    page.evaluate((key) => Boolean((window as unknown as Record<string, unknown>)[key]), releaseKey)
  ).toBe(true);
}

test("クロスフェードのハンドオフ完了時、主audio要素は無音のうちに先読み側の位置へ追いつき、seeked後にvolumeを戻す（実機フィードバックの再設計、2026-09-12）", async ({ context, page }) => {
  await installGoogleMocks(context, { albumCatalog: true }); await page.goto("/"); await login(page);
  const releaseKey = "__e2eReleaseHandoffPlay3";
  await setUpPendingHandoff(page, releaseKey);

  // ランプ完了により主audio要素は既に無音（volume 0）のはず。
  const volumeBeforeRelease = await page.evaluate(() => document.querySelector<HTMLAudioElement>("#audio-player")!.volume);
  expect(volumeBeforeRelease).toBe(0);

  // 先読み側（crossfadeAudio）へのpause()呼び出し回数を記録する（2026-09-13、Codexレビュー
  // 指摘：P1「Freeze the preview during the catch-up seek」の回帰防止）。このE2Eモック環境
  // では`<audio>`が実際にはデコードできないダミーデータのため、pause()を呼ばなくても
  // `.paused`は元々true（真の再生が起きていないため）のまま観測されてしまい、`.paused`だけを
  // 見る検証では偽陰性になる。呼び出し自体を直接記録することで判別力を持たせる。
  await page.evaluate(() => {
    const originalPause = HTMLMediaElement.prototype.pause;
    (window as unknown as { __previewPauseCount: number }).__previewPauseCount = 0;
    Object.defineProperty(HTMLMediaElement.prototype, "pause", {
      configurable: true,
      value: function (this: HTMLMediaElement) {
        if (this.id === "audio-player-crossfade") {
          (window as unknown as { __previewPauseCount: number }).__previewPauseCount += 1;
        }
        return originalPause.call(this);
      },
    });
  });

  // 先読み側が、待機中にさらに進んだことにする（はっきり区別できる値。追いつくべき目標）。
  await page.evaluate(() => {
    document.querySelector<HTMLAudioElement>("#audio-player-crossfade")!.currentTime = 42;
  });
  // 主audio要素の初期ハンドオフ位置を明示的に模擬する（このE2Eモック環境ではsrc代入が
  // currentTimeを実ブラウザのように0へリセットしないことがあるため、既存の複数のクロス
  // フェードE2Eと同じ「耐久性のため」の対策）。
  await page.evaluate(() => {
    document.querySelector<HTMLAudioElement>("#audio-player")!.currentTime = 0;
  });
  // 保留していたplay()を解放してハンドオフを完了させる。
  await page.evaluate((key) => (window as unknown as Record<string, () => void>)[key]?.(), releaseKey);

  // 主audio要素は無音のうちに先読み側の位置（42）へ追いつく。seekedがまだ発火していない
  // 間はvolumeもまだ1へ戻らない（無音のうちにシークが完結していることの確認）。
  await expect.poll(() => page.evaluate(() => document.querySelector<HTMLAudioElement>("#audio-player")!.currentTime)).toBe(42);
  const volumeDuringSeekWait = await page.evaluate(() => document.querySelector<HTMLAudioElement>("#audio-player")!.volume);
  expect(volumeDuringSeekWait).toBe(0);
  // この待機の間、先読み側（crossfadeAudio）はまだ一時停止されていない（2026-09-13、
  // Codexレビュー指摘：P1「Keep an audible source running until the seek completes」。
  // 早期に一時停止すると、主audio要素がまだ無音のこの待機中は完全な無音区間になってしまう
  // ため、先読み側は最後まで鳴らし続けたまま追いつく設計にした）。
  const previewPauseCountDuringWait = await page.evaluate(() => (window as unknown as { __previewPauseCount: number }).__previewPauseCount);
  expect(previewPauseCountDuringWait).toBe(0);

  // seekedイベント（実ブラウザの内部デコードパイプライン再同期の完了通知）が発火すると、
  // 目標位置（42）へ既に追いついている（差が許容誤差以内）ため追加の再シークは行わず、
  // このタイミングで初めて先読み側を一時停止しvolumeが1へ戻る。
  await page.evaluate(() => {
    document.querySelector<HTMLAudioElement>("#audio-player")!.dispatchEvent(new Event("seeked"));
  });
  await expect(page.locator("#catalog-list li.now-playing")).toContainText("Scherzo");
  const volumeAfterSeeked = await page.evaluate(() => document.querySelector<HTMLAudioElement>("#audio-player")!.volume);
  expect(volumeAfterSeeked).toBe(1);
  // 先読み側は追いつき確定後（＝これ以上主audio要素をシークする必要がないと判断した後）に
  // 初めて一時停止される（2026-09-13、Codexレビュー指摘：P1「Apply the preview position
  // only to the matching track」に対応した再設計。先読み側を鳴らし続ける設計と両立させる
  // ため、シーク回数を都度再確認する収束ループへ変更した詳細はcrossfade.tsのコメント参照）。
  const previewPauseCountAfterSeeked = await page.evaluate(() => (window as unknown as { __previewPauseCount: number }).__previewPauseCount);
  expect(previewPauseCountAfterSeeked).toBeGreaterThan(0);
});

// seekedイベントが（実ブラウザの異常等で）一切発火しなかった場合でも、CROSSFADE_HANDOFF_
// SEEK_TIMEOUT_MS（E2Eでは100ms）のタイムアウトで諦めてvolumeを1へ戻し、無音のまま
// 固まらないことを検証する。
test("クロスフェードのハンドオフ完了時、seekedイベントが発火しなくてもタイムアウトでvolumeが1へ戻る", async ({ context, page }) => {
  await installGoogleMocks(context, { albumCatalog: true }); await page.goto("/"); await login(page);
  const releaseKey = "__e2eReleaseHandoffPlay3b";
  await setUpPendingHandoff(page, releaseKey);

  await page.evaluate(() => {
    document.querySelector<HTMLAudioElement>("#audio-player-crossfade")!.currentTime = 42;
  });
  await page.evaluate(() => {
    document.querySelector<HTMLAudioElement>("#audio-player")!.currentTime = 0;
  });
  await page.evaluate((key) => (window as unknown as Record<string, () => void>)[key]?.(), releaseKey);

  await expect.poll(() => page.evaluate(() => document.querySelector<HTMLAudioElement>("#audio-player")!.currentTime)).toBe(42);
  const volumeBeforeTimeout = await page.evaluate(() => document.querySelector<HTMLAudioElement>("#audio-player")!.volume);
  expect(volumeBeforeTimeout).toBe(0);

  // seekedを一切発火させず、タイムアウト（100ms）分だけ仮想時刻を進める。
  await page.clock.runFor(100);
  await expect.poll(() => page.evaluate(() => document.querySelector<HTMLAudioElement>("#audio-player")!.volume)).toBe(1);
  await expect(page.locator("#catalog-list li.now-playing")).toContainText("Scherzo");
});

// 2026-09-12、finishCrossfadeHandoff()の非同期化（無音のうちにseekedを待つ設計）に伴い、
// この待機中かどうかを検証するための`window.__e2e.isCrossfadeFinishing()`フックを追加した
// （ChatGPTレビュー指摘：P1「この経路は認証継続・手動Pause/Seek/Nextによるgeneration
// cancellationとも競合するため、修正時は『seek待機中にキャンセルされた場合に古いhandoffが
// 後からvolumeを戻さない』回帰テストも必要です」）。フラグが実際に待機状態を反映すること、
// および待機中に本物の割り込み（一時停止）が発生した場合、割り込み後に遅れて届いた古い
// seekedイベントがその後の状態（一時停止で復元した退場曲の表示・volume）を巻き戻さないことを
// 検証する。
test("クロスフェードのハンドオフ完了待機中はisCrossfadeFinishing()がtrueを返し、待機中に一時停止しても古いseekedが後から状態を巻き戻さない", async ({ context, page }) => {
  await installGoogleMocks(context, { albumCatalog: true }); await page.goto("/"); await login(page);
  const releaseKey = "__e2eReleaseHandoffPlay3c";
  await setUpPendingHandoff(page, releaseKey);

  await page.evaluate(() => {
    document.querySelector<HTMLAudioElement>("#audio-player-crossfade")!.currentTime = 42;
  });
  await page.evaluate(() => {
    document.querySelector<HTMLAudioElement>("#audio-player")!.currentTime = 0;
  });
  await page.evaluate((key) => (window as unknown as Record<string, () => void>)[key]?.(), releaseKey);

  // 主audio要素が先読み側の位置へ追いついた（＝finishCrossfadeHandoff()がseeked待ちに入った）
  // 時点で、isCrossfadeFinishing()がtrueを返す。
  await expect.poll(() => page.evaluate(() => document.querySelector<HTMLAudioElement>("#audio-player")!.currentTime)).toBe(42);
  const finishingDuringWait = await page.evaluate(
    () => (window as unknown as { __e2e?: { isCrossfadeFinishing: () => boolean } }).__e2e?.isCrossfadeFinishing()
  );
  expect(finishingDuringWait).toBe(true);

  // 待機中に本物の割り込み（一時停止）が発生する。ハンドオフは既にaudio.srcを次曲（Scherzo）
  // へコミット済みのため、一時停止は退場曲（Overture）へ音を鳴らさず復元する
  // （cancelCrossfadeIfActive()→loadPaused()、詳細はCLAUDE.md参照）。
  await page.getByRole("button", { name: "一時停止" }).click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-1(\?|$)/);
  const volumeAfterPause = await page.evaluate(() => document.querySelector<HTMLAudioElement>("#audio-player")!.volume);
  expect(volumeAfterPause).toBe(1);

  // loadPaused()は退場側の位置（crossfading開始時点の曲末尾間近の値）へcurrentTimeを
  // 書き戻すため、このE2Eモック環境では`.paused`を固定値falseでオーバーライドしており
  // 実ブラウザのように`.pause()`呼び出しと連動しないので、この書き戻し自体が
  // shouldStartCrossfadePreparation()の残り時間条件を再び満たしてしまい、以降で検証したい
  // 「古いstale seekedの影響」とは無関係な、別の正当なクロスフェードが誤って再発火し
  // テストを偽陽性/偽陰性にしうる（他の複数のクロスフェードE2Eで既知の注意点と同種）。
  // ここでは曲末尾から明示的に離すことでこの副作用を回避する（crossfadeOutgoingPositionは
  // crossfading開始時点で既に確定済みのため、この後の変更は検証対象のガード自体には影響しない）。
  await page.evaluate(() => {
    document.querySelector<HTMLAudioElement>("#audio-player")!.currentTime = 0;
  });

  // 割り込み後、古いfinishCrossfadeHandoff()自身の待機はまだ解決していない可能性がある
  // （isCrossfadeFinishing()は待機自体が終わるまでtrueのまま残る設計、詳細は
  // crossfadeFinishing変数宣言コメント参照）。その古い待機に対して、遅れて`seeked`が届いても、
  // 一時停止で復元した状態（退場曲のaudio.src・volume）を巻き戻さないことを検証する
  // （generation不一致による早期returnガードの回帰防止）。
  await page.evaluate(() => {
    document.querySelector<HTMLAudioElement>("#audio-player")!.dispatchEvent(new Event("seeked"));
  });
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-1(\?|$)/);
  const volumeAfterStaleSeeked = await page.evaluate(() => document.querySelector<HTMLAudioElement>("#audio-player")!.volume);
  expect(volumeAfterStaleSeeked).toBe(1);
});

// 2026-09-13、Codexレビュー指摘：P1「Verify convergence after the final catch-up seek」の
// 回帰防止。固定の試行回数（例：3回）で打ち切る設計だと、各回の`seeked`待ちがそれぞれ
// タイムアウト（E2Eでは100ms）まで長引く環境では、追いつき処理全体で最大 試行回数×100ms
// （3回なら300ms）もの無音待機が発生しうる——単発の再シーク方式（最大100ms）よりむしろ
// 悪化する回帰。追いつき処理全体の合計待機時間を単発方式と同じ予算（100ms）で打ち切るよう
// 修正した。
//
// 検証方法について：`page.clock`の仮想時間を1回の`runFor()`で大きく進めると、ループの
// 2回目以降が新たにスケジュールする`setTimeout`が、その`runFor()`呼び出しが処理する
// 範囲内で実際に発火するかどうかがPlaywrightのfakeタイマー実装の詳細に依存し、
// 単発方式・旧来の毎回フルタイムアウト方式のどちらでも見かけ上volumeが1へ戻ってしまい、
// 両者を区別できないことが分かった（時間経過そのものでは判別しない）。代わりに、
// 「main audio要素のcurrentTimeへ実際に書き込まれた回数」を計装して直接数える：
// 単発の予算方式は最初の1回だけ書き込んだ後、`Date.now() < catchUpDeadline`が
// 成立しなくなり2回目以降のループ自体に入らないため、書き込み回数は常に1回のまま。
// 旧来の毎回フルタイムアウト方式は、先読み側が待機中も進み続ける限り（差分が許容誤差を
// 超え続ける限り）試行回数の上限（3回）まで毎回書き込む。
test("クロスフェードのハンドオフ完了時、複数回の追いつきシークが必要でも合計の待機時間は単発方式と同じ予算に収まる（2026-09-13、Codexレビュー指摘：P1「Verify convergence after the final catch-up seek」）", async ({ context, page }) => {
  await installGoogleMocks(context, { albumCatalog: true }); await page.goto("/"); await login(page);
  const releaseKey = "__e2eReleaseHandoffPlay3d";
  await setUpPendingHandoff(page, releaseKey);

  // 先読み側（crossfadeAudio）が待機中もずっと進み続ける状況を模擬する（実ブラウザでは
  // 再生が続く限り自然にこうなるが、このE2Eモックの<audio>は自動で進まないため、
  // page.clockが仮想時間を進めるたびに位置を進める`setInterval`で代替する）。
  await page.evaluate(() => {
    const crossfadeAudio = document.querySelector<HTMLAudioElement>("#audio-player-crossfade")!;
    setInterval(() => { crossfadeAudio.currentTime += 5; }, 10);
  });

  await page.evaluate(() => {
    document.querySelector<HTMLAudioElement>("#audio-player-crossfade")!.currentTime = 42;
  });

  // main audio要素のcurrentTimeへの書き込み回数を計装する（追いつきループが実際に何回
  // 書き込みを試みたかを、仮想時間の境界に依存せず直接数える）。
  await page.evaluate(() => {
    const audioPlayer = document.querySelector<HTMLAudioElement>("#audio-player")!;
    const proto = HTMLMediaElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, "currentTime")!;
    (window as unknown as { __catchUpWriteCount: number }).__catchUpWriteCount = 0;
    Object.defineProperty(audioPlayer, "currentTime", {
      configurable: true,
      get() {
        return descriptor.get!.call(this);
      },
      set(value: number) {
        (window as unknown as { __catchUpWriteCount: number }).__catchUpWriteCount += 1;
        descriptor.set!.call(this, value);
      },
    });
    audioPlayer.currentTime = 0;
    // 上のリセット自体もカウントされてしまうため、計装後の意図的な書き込みだけを数える
    // よう0へ戻す（これから追いつきループが実際に行う書き込みだけを検証対象にするため）。
    (window as unknown as { __catchUpWriteCount: number }).__catchUpWriteCount = 0;
  });

  await page.evaluate((key) => (window as unknown as Record<string, () => void>)[key]?.(), releaseKey);

  // seekedを一切発火させないまま、十分な仮想時間（旧来の毎回フルタイムアウト方式が3回の
  // 試行を使い切る300msを超える400ms）を進める。先読み側は上のsetIntervalによりこの間
  // ずっと進み続けるため、複数回の追いつきシークが必要になる状況を再現している。
  await page.clock.runFor(400);

  const writeCount = await page.evaluate(
    () => (window as unknown as { __catchUpWriteCount: number }).__catchUpWriteCount,
  );
  // ループ自体は予算を使い切って1回だけ書き込むが、2026-09-13の続けての修正（下記の
  // 「収束せずに待機を終えても最新の先読み位置へ最後にもう一度追いつく」テスト参照）で、
  // ループ終了後に最新位置へもう一度だけ（待たずに）書き込む最終キャッチアップを追加した
  // ため、合計は最大2回になる（ループの旧・毎回フルタイムアウト方式へ戻すと、ループ自体が
  // 3回書き込み+最終キャッチアップの計4回になり、この上限を超えて引き続き失敗する）。
  expect(writeCount).toBeLessThanOrEqual(2);

  await expect.poll(() => page.evaluate(() => document.querySelector<HTMLAudioElement>("#audio-player")!.volume)).toBe(1);
});

// 2026-09-13、続けてCodexレビュー指摘：P1「Recheck the offset after the final catch-up
// seek」の回帰防止。上のテストが検証する「合計待機時間の予算」自体を守っていても、ループが
// 収束せずに（seekedが届かず）予算を使い切って終了した場合、ループ最後の待機中にも先読み側は
// 進み続けているため、ループが最後に書き込んだ`target`はこの時点で既に古い値になる。この
// 古い値のままvolumeを1へ戻すと、実機で報告された「巻き戻ってフレーズを聞き直す」不具合が
// 形を変えて残ってしまう。ループ終了後にもう一度（待たずに）最新の`crossfadeAudio.currentTime`
// を読み直し、許容誤差を超えていれば最後に一度だけ追いつくことを検証する。
test("クロスフェードのハンドオフ完了時、収束せずに待機を終えても最後に最新の先読み位置へ追いつく（2026-09-13、Codexレビュー指摘：P1「Recheck the offset after the final catch-up seek」）", async ({ context, page }) => {
  await installGoogleMocks(context, { albumCatalog: true }); await page.goto("/"); await login(page);
  const releaseKey = "__e2eReleaseHandoffPlay3e";
  await setUpPendingHandoff(page, releaseKey);

  await page.evaluate(() => {
    const crossfadeAudio = document.querySelector<HTMLAudioElement>("#audio-player-crossfade")!;
    setInterval(() => { crossfadeAudio.currentTime += 5; }, 10);
  });

  await page.evaluate(() => {
    document.querySelector<HTMLAudioElement>("#audio-player-crossfade")!.currentTime = 42;
  });
  await page.evaluate(() => {
    document.querySelector<HTMLAudioElement>("#audio-player")!.currentTime = 0;
  });
  await page.evaluate((key) => (window as unknown as Record<string, () => void>)[key]?.(), releaseKey);

  // seekedを一切発火させないまま、単発方式と同じ予算（100ms）ぶんだけ仮想時間を進める。
  // 先読み側は上のsetIntervalによりこの間ずっと進み続ける。
  await page.clock.runFor(100);

  await expect.poll(() => page.evaluate(() => document.querySelector<HTMLAudioElement>("#audio-player")!.volume)).toBe(1);

  // 2つの要素の値を1回のevaluate呼び出しでまとめて読む（別々の呼び出しに分けると、その間に
  // setIntervalがさらに1回発火してpreviewCurrentTime側だけ余分に進み、誤差が本質的でない
  // 理由で開いてしまうため）。
  const { finalCurrentTime, previewCurrentTime } = await page.evaluate(() => ({
    finalCurrentTime: document.querySelector<HTMLAudioElement>("#audio-player")!.currentTime,
    previewCurrentTime: document.querySelector<HTMLAudioElement>("#audio-player-crossfade")!.currentTime,
  }));
  // ループが最初に書き込んだ値（42）のまま残っていれば不具合の再現（差が大きい）。最後に
  // もう一度追いついていれば、先読み側の最新位置とほぼ一致するはず。
  expect(finalCurrentTime).toBeGreaterThan(60);
  expect(Math.abs(finalCurrentTime - previewCurrentTime)).toBeLessThanOrEqual(0.1);
});

// 2026-09-10、実機フィードバックによるハンドオフ再設計の回帰防止（bug #10：クロスフェードが
// 始まった後にシークバーを操作すると再生ボタンを押さないと再生されなくなる不具合）。
// 根本原因はcancelCrossfadeIfActive()がqueue.invalidatePendingMove()を呼んでいなかったこと
// （PlaybackQueue自身のgeneration確認だけでは、audioが止まっていても「次の曲へコミット成功」
// 扱いになってしまう不整合が残っていた）。
test("クロスフェードのハンドオフ待機中にシークしても、ハンドオフが後から解決してもキューの現在曲が誤って次の曲へコミットされない（実機フィードバック：シークが効かない不具合の再設計、2026-09-10）", async ({ context, page }) => {
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
    const originalPlay = HTMLMediaElement.prototype.play;
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: function (this: HTMLMediaElement) {
        if (this.id === "audio-player" && this.src.includes("album-track-2")) {
          return new Promise<void>((resolve) => {
            (window as unknown as { __e2eReleaseHandoffPlay?: () => void }).__e2eReleaseHandoffPlay = resolve;
          });
        }
        return originalPlay.call(this);
      },
    });
  });

  await page.evaluate(() => {
    const audio = document.querySelector<HTMLAudioElement>("#audio-player")!;
    Object.defineProperty(audio, "duration", { value: 180, configurable: true });
    Object.defineProperty(audio, "paused", { value: false, configurable: true });
    audio.currentTime = 179.99;
    audio.dispatchEvent(new Event("timeupdate"));
  });
  await expect(page.locator("#audio-player-crossfade")).toHaveAttribute("src", /album-track-2(\?|$)/);
  await page.clock.runFor(100);
  await expect.poll(() => page.evaluate(() => Boolean((window as unknown as { __e2eReleaseHandoffPlay?: () => void }).__e2eReleaseHandoffPlay))).toBe(true);

  // ハンドオフがまだ解決していない時点で、独自シークバーを操作する（ドラッグ開始→離す）。
  await page.evaluate(() => {
    const slider = document.querySelector<HTMLInputElement>("#seek-slider")!;
    slider.disabled = false;
    slider.max = "180";
    slider.value = "10";
    slider.dispatchEvent(new Event("input"));
    slider.dispatchEvent(new Event("change"));
  });

  // シーク時点ではまだキューの現在曲はコミットされていない（ハンドオフのplay()が未解決）。
  await expect(page.locator("#catalog-list li.now-playing")).toContainText("Opening");

  // 保留していたハンドオフのplay()を今になって解決させても、シークによる打ち切り
  // （cancelPendingTransition + invalidatePendingMove）が効いているため、キューの現在曲は
  // 誤って次の曲（Scherzo）へコミットされたままにならない。
  await page.evaluate(() => (window as unknown as { __e2eReleaseHandoffPlay?: () => void }).__e2eReleaseHandoffPlay?.());
  await page.waitForTimeout(50);
  await expect(page.locator("#catalog-list li.now-playing")).toContainText("Opening");
});

// 2026-09-10、実機フィードバックによるハンドオフ再設計の回帰防止（bug #8：手動フェードアウト
// 設定中に曲終わりのフェード開始状態で一時停止しても止まらず次の曲の再生に進んでしまう不具合）。
// pause-btnクリックが呼ぶcancelCrossfadeIfActive()はqueue.invalidatePendingMove()を呼ぶため、
// 進行中のハンドオフが後から解決しても、キューの現在曲は次の曲へコミットされない。
test("クロスフェードのハンドオフ待機中に一時停止しても、ハンドオフが後から解決してもキューの現在曲が誤って次の曲へコミットされない（実機フィードバック：一時停止しても次の曲が再生される不具合の再設計、2026-09-10）", async ({ context, page }) => {
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
    const originalPlay = HTMLMediaElement.prototype.play;
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: function (this: HTMLMediaElement) {
        if (this.id === "audio-player" && this.src.includes("album-track-2")) {
          return new Promise<void>((resolve) => {
            (window as unknown as { __e2eReleaseHandoffPlay?: () => void }).__e2eReleaseHandoffPlay = resolve;
          });
        }
        return originalPlay.call(this);
      },
    });
  });

  await page.evaluate(() => {
    const audio = document.querySelector<HTMLAudioElement>("#audio-player")!;
    Object.defineProperty(audio, "duration", { value: 180, configurable: true });
    Object.defineProperty(audio, "paused", { value: false, configurable: true });
    audio.currentTime = 179.99;
    audio.dispatchEvent(new Event("timeupdate"));
  });
  await expect(page.locator("#audio-player-crossfade")).toHaveAttribute("src", /album-track-2(\?|$)/);
  await page.clock.runFor(100);
  await expect.poll(() => page.evaluate(() => Boolean((window as unknown as { __e2eReleaseHandoffPlay?: () => void }).__e2eReleaseHandoffPlay))).toBe(true);

  await page.getByRole("button", { name: "一時停止" }).click();
  await expect(page.locator("#catalog-list li.now-playing")).toContainText("Opening");

  await page.evaluate(() => (window as unknown as { __e2eReleaseHandoffPlay?: () => void }).__e2eReleaseHandoffPlay?.());
  await page.waitForTimeout(50);
  // 一時停止後に保留していたハンドオフが遅れて解決しても、次の曲（Scherzo）の再生には進まない。
  await expect(page.locator("#catalog-list li.now-playing")).toContainText("Opening");
});

// 2026-09-10、`@codex review`指摘（P1）の回帰防止。退場側（主audio要素）が既に自然終了済み
// （ended=true、ランプ完了時点でよくある状態）の状態でシーク・MediaSessionネイティブ
// 一時停止等（manualTransitionCountを増減しない経路）がハンドオフを打ち切ると、
// cancelCrossfadeIfActive()のqueue.invalidatePendingMove()によりadvanceToPreviewedFile()が
// falseを返す。この`!handoffStarted`自体を「ended済みなので自動送りしてよい」と誤認し、
// crossfadeGenerationの変化（＝本物の割り込みで打ち切られたこと）を見ずに
// advanceOnEnded()を呼んでしまうと、割り込みで止めたはずの遷移がそのまま次の曲を
// 開始してしまい、ユーザーの操作を取り消してしまっていた。
test("退場側が自然終了済みの状態でシークしてハンドオフを打ち切っても、自動送りが割り込みを取り消して次の曲を開始しない（2026-09-10、Codexレビュー指摘：P1）", async ({ context, page }) => {
  await installGoogleMocks(context, { albumCatalog: true }); await page.goto("/"); await login(page);
  await page.locator("#folder-id").fill("root"); await page.locator("#spreadsheet-id").fill("sheet");
  await page.getByRole("button", { name: "索引から曲一覧を読み込む" }).click();
  await expect(page.locator("#status")).toContainText("索引から4曲");

  await page.getByRole("checkbox", { name: "曲間をクロスフェードする" }).check();

  const symphony = page.locator("#album-list li").filter({ hasText: "Symphony（3曲）" });
  await symphony.getByRole("button", { name: "このアルバムを再生" }).click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-1(\?|$)/);

  await page.clock.install();

  // album-track-2へのplay()呼び出しのうち最初の1回だけを保留する（ハンドオフ自身の呼び出し）。
  // 誤って発火するadvanceOnEnded()フォールバックが試みるplay()呼び出しは2回目以降になるため、
  // そちらは即座に解決させ、実際に「次の曲が始まってしまうか」まで検証できるようにする。
  await page.evaluate(() => {
    const originalPlay = HTMLMediaElement.prototype.play;
    let track2CallCount = 0;
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: function (this: HTMLMediaElement) {
        if (this.id === "audio-player" && this.src.includes("album-track-2")) {
          track2CallCount += 1;
          if (track2CallCount === 1) {
            return new Promise<void>((resolve) => {
              (window as unknown as { __e2eReleaseHandoffPlay?: () => void }).__e2eReleaseHandoffPlay = resolve;
            });
          }
        }
        return originalPlay.call(this);
      },
    });
  });

  await page.evaluate(() => {
    const audio = document.querySelector<HTMLAudioElement>("#audio-player")!;
    Object.defineProperty(audio, "duration", { value: 180, configurable: true });
    Object.defineProperty(audio, "paused", { value: false, configurable: true });
    // 退場側は既に自然終了済み（ランプ完了時点でよくある状態）。
    Object.defineProperty(audio, "ended", { value: true, configurable: true });
    audio.currentTime = 179.99;
    audio.dispatchEvent(new Event("timeupdate"));
  });
  await expect(page.locator("#audio-player-crossfade")).toHaveAttribute("src", /album-track-2(\?|$)/);
  await page.clock.runFor(100);
  await expect.poll(() => page.evaluate(() => Boolean((window as unknown as { __e2eReleaseHandoffPlay?: () => void }).__e2eReleaseHandoffPlay))).toBe(true);

  // ハンドオフがまだ解決していない時点で、独自シークバーを操作する（manualTransitionCountを
  // 増減しない割り込み経路）。
  await page.evaluate(() => {
    const slider = document.querySelector<HTMLInputElement>("#seek-slider")!;
    slider.disabled = false;
    slider.max = "180";
    slider.value = "10";
    slider.dispatchEvent(new Event("input"));
    slider.dispatchEvent(new Event("change"));
  });

  // 保留していたハンドオフのplay()を今になって解決させる（無効化されているため成功しない）。
  await page.evaluate(() => (window as unknown as { __e2eReleaseHandoffPlay?: () => void }).__e2eReleaseHandoffPlay?.());

  // シークによる打ち切り後、自動送り（advanceOnEnded()の誤爆）が次の曲（Scherzo）を
  // 勝手に開始していないこと。誤爆した場合、2回目のplay()呼び出しは即座に解決するため、
  // page.clockに頼らず短い実時間待ちで十分検出できる。
  await page.waitForTimeout(200);
  await expect(page.locator("#catalog-list li.now-playing")).toContainText("Opening");
});

// 2026-09-10、`@codex review`3回目の指摘（P1、"Do not apply the preview position to a fallback
// track"）の回帰防止。ハンドオフの待機中に先読み対象自体が除外されると、advanceToPreviewedFile()
// は自動的に次の曲（フォールバック先）へ切り替えてコミットする。この時、finishCrossfadeHandoff()
// は本来先読みしていた曲（crossfadePreviewedFileId）とは異なる曲がコミットされたことを検知し、
// crossfadeAudioの再生位置（先読みしていた曲自身の位置）をフォールバック先へ誤って適用しない
// （適用すると、フォールバック先の曲の冒頭をスキップ、または曲の長さを超えて丸ごとスキップして
// しまう）。
test("先読み対象が待機中に除外されフォールバックした場合、先読み位置をフォールバック先の曲へ誤って適用しない（2026-09-10、Codexレビュー指摘：P1）", async ({ context, page }) => {
  await installGoogleMocks(context, { albumCatalog: true }); await page.goto("/"); await login(page);
  await page.locator("#folder-id").fill("root"); await page.locator("#spreadsheet-id").fill("sheet");
  await page.getByRole("button", { name: "索引から曲一覧を読み込む" }).click();
  await expect(page.locator("#status")).toContainText("索引から4曲");

  await page.getByRole("checkbox", { name: "曲間をクロスフェードする" }).check();

  const symphony = page.locator("#album-list li").filter({ hasText: "Symphony（3曲）" });
  await symphony.getByRole("button", { name: "このアルバムを再生" }).click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-1(\?|$)/);

  await page.clock.install();

  // album-track-2（本来の先読み対象）へのplay()呼び出しだけを保留する。フォールバック先
  // （album-track-3）へのplay()呼び出しは即座に解決させる。
  await page.evaluate(() => {
    const originalPlay = HTMLMediaElement.prototype.play;
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: function (this: HTMLMediaElement) {
        if (this.id === "audio-player" && this.src.includes("album-track-2")) {
          return new Promise<void>((resolve) => {
            (window as unknown as { __e2eReleaseHandoffPlay?: () => void }).__e2eReleaseHandoffPlay = resolve;
          });
        }
        return originalPlay.call(this);
      },
    });
  });

  await page.evaluate(() => {
    const audio = document.querySelector<HTMLAudioElement>("#audio-player")!;
    Object.defineProperty(audio, "duration", { value: 180, configurable: true });
    Object.defineProperty(audio, "paused", { value: false, configurable: true });
    audio.currentTime = 179.99;
    audio.dispatchEvent(new Event("timeupdate"));
  });
  await expect(page.locator("#audio-player-crossfade")).toHaveAttribute("src", /album-track-2(\?|$)/);
  await page.clock.runFor(100);
  await expect.poll(() => page.evaluate(() => Boolean((window as unknown as { __e2eReleaseHandoffPlay?: () => void }).__e2eReleaseHandoffPlay))).toBe(true);

  // 先読みしていた曲（crossfadeAudio）が、フォールバック先とは無関係な、はっきり区別できる
  // 位置まで進んでいることにする。
  await page.evaluate(() => {
    document.querySelector<HTMLAudioElement>("#audio-player-crossfade")!.currentTime = 150;
  });
  // 主audio要素の初期位置を明示的に0へ模擬する（このE2Eモック環境ではsrc代入がcurrentTimeを
  // 実ブラウザのように0へリセットしないことがあるため、既存の複数のクロスフェードE2Eと同じ
  // 「耐久性のため」の対策。ここで明示的にリセットしないと、先読み側の150秒より前の値が
  // 偶然残ってしまい、finishCrossfadeHandoff()の「既に追いついている」早期break分岐を
  // 意図せず通ってしまい、これから検証したい識別チェック自体を経由しなくなる）。
  await page.evaluate(() => {
    document.querySelector<HTMLAudioElement>("#audio-player")!.currentTime = 0;
  });

  // 先読み対象自体をチェックボックスで除外する（フォールバックを引き起こす）。
  const scherzoRow = page.locator("#catalog-list li").filter({ hasText: "Scherzo" });
  await scherzoRow.getByRole("checkbox").uncheck();

  // 保留していたplay()を解決する。advanceToPreviewedFile()の内部ループが、除外された
  // album-track-2をコミット後すぐに検知し、次の曲（album-track-3「Finale」）へフォールバックする。
  await page.evaluate(() => (window as unknown as { __e2eReleaseHandoffPlay?: () => void }).__e2eReleaseHandoffPlay?.());
  await expect(page.locator("#catalog-list li.now-playing")).toContainText("Finale");

  // フォールバック先（Finale）の再生位置が、先読みしていた曲（Scherzo）の位置（150秒）へ
  // 誤って合わせられていないこと。
  const finalCurrentTime = await page.evaluate(() => document.querySelector<HTMLAudioElement>("#audio-player")!.currentTime);
  expect(finalCurrentTime).not.toBe(150);
});

// 2026-09-10、`@codex review`3回目の指摘（P1、"Finalize the crossfade from the auth
// continuation"）の回帰防止。ハンドオフ自身のネイティブplay()が（解決を保証されないため）
// 保留されたまま、Drive側の401がSW経由で先に届き認証継続（queue.resume()）が独立に成功した
// 場合、finishCrossfadeHandoff()が明示的に呼ばれないと、crossfadingが true に固定され続け、
// 実際には再生に成功している主audio要素がvolume 0のまま無音になってしまう。
test("クロスフェードのハンドオフ自身のplay()が保留されたまま認証継続が先に成功しても、crossfadingの後始末（volume復元・第二audio要素の停止）が行われる（2026-09-10、Codexレビュー指摘：P1）", async ({ context, page }) => {
  await installGoogleMocks(context, { albumCatalog: true }); await page.goto("/"); await login(page);
  await page.locator("#folder-id").fill("root"); await page.locator("#spreadsheet-id").fill("sheet");
  await page.getByRole("button", { name: "索引から曲一覧を読み込む" }).click();
  await expect(page.locator("#status")).toContainText("索引から4曲");

  await page.getByRole("checkbox", { name: "曲間をクロスフェードする" }).check();

  const symphony = page.locator("#album-list li").filter({ hasText: "Symphony（3曲）" });
  await symphony.getByRole("button", { name: "このアルバムを再生" }).click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-1(\?|$)/);

  await page.clock.install();

  // album-track-2への最初のplay()呼び出し（ハンドオフ自身）だけを、二度と解放しないまま
  // 保留する（実機で「ネイティブplay()の解決が保証されない」既知のリスクを再現）。実際の
  // ネイティブplay()自体は呼ぶ（その結果は無視する）ことで、ブラウザの実際のリソース取得
  // （SW経由の実際のRangeリクエスト）は引き続き発生させる——呼び出し元へ返すPromiseだけを、
  // 二度と解決しない別のPromiseに差し替える。2回目以降（認証継続のqueue.resume()自身の
  // play()呼び出し）は通常通り解決させる。
  await page.evaluate(() => {
    const originalPlay = HTMLMediaElement.prototype.play;
    let track2CallCount = 0;
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: function (this: HTMLMediaElement) {
        if (this.id === "audio-player" && this.src.includes("album-track-2")) {
          track2CallCount += 1;
          if (track2CallCount === 1) {
            originalPlay.call(this).catch(() => {});
            return new Promise<void>(() => {}); // 二度と解決しない
          }
        }
        return originalPlay.call(this);
      },
    });
  });

  await page.evaluate(() => {
    const audio = document.querySelector<HTMLAudioElement>("#audio-player")!;
    Object.defineProperty(audio, "duration", { value: 180, configurable: true });
    Object.defineProperty(audio, "paused", { value: false, configurable: true });
    audio.currentTime = 179.99;
    audio.dispatchEvent(new Event("timeupdate"));
  });
  await expect(page.locator("#audio-player-crossfade")).toHaveAttribute("src", /album-track-2(\?|$)/);
  await page.clock.runFor(100);

  // ハンドオフ自身のplay()は保留されたまま（二度と解決しない）。この間、SW経由でDrive側の401が
  // 届いたことを直接シミュレートする（main.tsのhandleStreamTokenRejected()相当の効果）ため、
  // main.tsの__e2eフックからではなく、実際のワーカーメッセージ経路を模して
  // navigator.serviceWorker経由でpostMessageする代わりに、テスト対象のresumeコールバック自身が
  // 実際に呼ばれるよう、Drive側の401を実際のRangeリクエストで再現する。
  let rejectedOnce = false;
  await context.route("**/drive/v3/files/album-track-2*", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("alt") === "media" && !rejectedOnce) {
      rejectedOnce = true;
      await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: { message: "revoked token" } }) });
      return;
    }
    await route.continue();
  });
  // SWにalbum-track-2への実際のストリーム要求を発行させ、401を検知させる。ハンドオフの
  // ネイティブplay()自体は上記の通り保留されたままだが、audio.srcの設定自体は既にコミット
  // 済みのため、ブラウザのリソース選択アルゴリズムが実際にRangeリクエストを発行する。
  await expect.poll(() => page.evaluate(() => document.querySelector("#audio-player")!.getAttribute("src"))).toMatch(/album-track-2/);

  await expect(page.getByRole("button", { name: "認証を更新して続行" })).toBeVisible();
  await page.getByRole("button", { name: "認証を更新して続行" }).click();

  // 認証継続（queue.resume()）が独立に成功し、主audio要素のvolumeが1へ復元され、第二audio要素
  // （crossfadeAudio）が停止・リセットされる（ハンドオフ自身の保留中のplay()は無関係に
  // 残り続けるが、これはfinishCrossfadeHandoff()のcrossfadingガードにより二重処理されない）。
  await expect(page.locator("#catalog-list li.now-playing")).toContainText("Scherzo");
  await expect.poll(() => page.evaluate(() => document.querySelector<HTMLAudioElement>("#audio-player")!.volume)).toBe(1);
  await expect(page.locator("#audio-player-crossfade")).not.toHaveAttribute("src");
});

// 2026-09-10、`@codex review`4回目の指摘（P1、"Recover when the authenticated resume rejects
// the previewed file"）の回帰防止。認証を更新して続行を押す前に先読み対象自体をチェックボックスで
// 除外していた場合、queue.resume()は除外中のfileIdを拒否しfalseを返す。この場合も
// finishCrossfadeHandoff()を呼ばないと、crossfadingがtrueに固定されたまま、実際には
// 二度と再試行されない（PlaybackAuthenticationGateが保留操作を外し通知も消すため）にも
// 関わらず、主audio要素がvolume 0の無音のまま取り残されてしまっていた。
test("認証継続の対象曲が『認証を更新して続行』を押す前に除外されて失敗しても、crossfadingの後始末（volume復元・第二audio要素の停止）が行われる（2026-09-10、Codexレビュー指摘：P1）", async ({ context, page }) => {
  await installGoogleMocks(context, { albumCatalog: true }); await page.goto("/"); await login(page);
  await page.locator("#folder-id").fill("root"); await page.locator("#spreadsheet-id").fill("sheet");
  await page.getByRole("button", { name: "索引から曲一覧を読み込む" }).click();
  await expect(page.locator("#status")).toContainText("索引から4曲");

  await page.getByRole("checkbox", { name: "曲間をクロスフェードする" }).check();

  const symphony = page.locator("#album-list li").filter({ hasText: "Symphony（3曲）" });
  await symphony.getByRole("button", { name: "このアルバムを再生" }).click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-1(\?|$)/);

  await page.clock.install();

  // album-track-2への最初のplay()呼び出し（ハンドオフ自身）だけを保留し、実際のネイティブ
  // play()自体は呼んで実際のSW経由のRangeリクエストを発生させる。
  await page.evaluate(() => {
    const originalPlay = HTMLMediaElement.prototype.play;
    let track2CallCount = 0;
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: function (this: HTMLMediaElement) {
        if (this.id === "audio-player" && this.src.includes("album-track-2")) {
          track2CallCount += 1;
          if (track2CallCount === 1) {
            originalPlay.call(this).catch(() => {});
            return new Promise<void>(() => {}); // 二度と解決しない
          }
        }
        return originalPlay.call(this);
      },
    });
  });

  await page.evaluate(() => {
    const audio = document.querySelector<HTMLAudioElement>("#audio-player")!;
    Object.defineProperty(audio, "duration", { value: 180, configurable: true });
    Object.defineProperty(audio, "paused", { value: false, configurable: true });
    audio.currentTime = 179.99;
    audio.dispatchEvent(new Event("timeupdate"));
  });
  await expect(page.locator("#audio-player-crossfade")).toHaveAttribute("src", /album-track-2(\?|$)/);
  await page.clock.runFor(100);

  let rejectedOnce = false;
  await context.route("**/drive/v3/files/album-track-2*", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("alt") === "media" && !rejectedOnce) {
      rejectedOnce = true;
      await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: { message: "revoked token" } }) });
      return;
    }
    await route.continue();
  });
  await expect.poll(() => page.evaluate(() => document.querySelector("#audio-player")!.getAttribute("src"))).toMatch(/album-track-2/);
  await expect(page.getByRole("button", { name: "認証を更新して続行" })).toBeVisible();

  // 「認証を更新して続行」を押す前に、先読み対象（Scherzo=album-track-2）自体を除外する。
  const scherzoRow = page.locator("#catalog-list li").filter({ hasText: "Scherzo" });
  await scherzoRow.getByRole("checkbox").uncheck();

  await page.getByRole("button", { name: "認証を更新して続行" }).click();

  // resume()は除外中のfileIdを拒否しfalseを返す（次の曲へは進まない）が、それでも
  // crossfadingの後始末（volume復元・第二audio要素の停止）は行われる。
  await expect.poll(() => page.evaluate(() => document.querySelector<HTMLAudioElement>("#audio-player")!.volume)).toBe(1);
  await expect(page.locator("#audio-player-crossfade")).not.toHaveAttribute("src");
});

// 2026-09-10、`@codex review`4回目の指摘（P1、"Invalidate the registered stream continuation
// on cancellation"）の回帰防止。ハンドオフの主audio要素へのストリーム要求が発行された（＝
// audio.srcが既にコミット済み）が、その401がまだ届いていない間にシーク等でハンドオフが
// 打ち切られると、cancelPendingTransition()はcurrentFileId/streamGenerationを変えないため、
// 打ち切り後に遅れて届いた401がそのまま受理され、既にキャンセルしたはずのハンドオフに対して
// 認証継続UI（「認証を更新して続行」）が表示され、かつ現在有効なトークンが不要に破棄されて
// しまっていた。
test("ハンドオフ打ち切り後に遅れて届いた401は、認証継続UIを表示しない（2026-09-10、Codexレビュー指摘：P1）", async ({ context, page }) => {
  await installGoogleMocks(context, { albumCatalog: true }); await page.goto("/"); await login(page);
  await page.locator("#folder-id").fill("root"); await page.locator("#spreadsheet-id").fill("sheet");
  await page.getByRole("button", { name: "索引から曲一覧を読み込む" }).click();
  await expect(page.locator("#status")).toContainText("索引から4曲");

  await page.getByRole("checkbox", { name: "曲間をクロスフェードする" }).check();

  const symphony = page.locator("#album-list li").filter({ hasText: "Symphony（3曲）" });
  await symphony.getByRole("button", { name: "このアルバムを再生" }).click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-1(\?|$)/);

  await page.clock.install();

  // album-track-2への最初のplay()呼び出し（ハンドオフ自身）を保留しつつ、実際のネイティブ
  // play()も呼んで実際のSW経由のRangeリクエストを発生させる。401応答自体は、テスト側が
  // 明示的に指示するまで保留する（Route自体をこちらで制御する）。
  let releaseRangeRequest: (() => void) | undefined;
  await page.evaluate(() => {
    const originalPlay = HTMLMediaElement.prototype.play;
    let track2CallCount = 0;
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: function (this: HTMLMediaElement) {
        if (this.id === "audio-player" && this.src.includes("album-track-2")) {
          track2CallCount += 1;
          if (track2CallCount === 1) {
            originalPlay.call(this).catch(() => {});
            return new Promise<void>(() => {}); // 二度と解決しない
          }
        }
        return originalPlay.call(this);
      },
    });
  });

  await page.evaluate(() => {
    const audio = document.querySelector<HTMLAudioElement>("#audio-player")!;
    Object.defineProperty(audio, "duration", { value: 180, configurable: true });
    Object.defineProperty(audio, "paused", { value: false, configurable: true });
    audio.currentTime = 179.99;
    audio.dispatchEvent(new Event("timeupdate"));
  });
  await expect(page.locator("#audio-player-crossfade")).toHaveAttribute("src", /album-track-2(\?|$)/);
  await page.clock.runFor(100);

  let rangeRequestSeen = false;
  await context.route("**/drive/v3/files/album-track-2*", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("alt") === "media") {
      rangeRequestSeen = true;
      await new Promise<void>((resolve) => { releaseRangeRequest = resolve; });
      await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: { message: "revoked token" } }) });
      return;
    }
    await route.continue();
  });
  await expect.poll(() => rangeRequestSeen).toBe(true);

  // 401応答がまだ届いていない間に、独自シークバーでハンドオフを打ち切る。
  await page.evaluate(() => {
    const slider = document.querySelector<HTMLInputElement>("#seek-slider")!;
    slider.disabled = false;
    slider.max = "180";
    slider.value = "10";
    slider.dispatchEvent(new Event("input"));
    slider.dispatchEvent(new Event("change"));
  });

  // ここで初めて401応答を届ける。打ち切り後に遅れて届いた401のため、認証継続UIは
  // 表示されないはず。
  releaseRangeRequest?.();
  await page.waitForTimeout(200);
  await expect(page.getByRole("button", { name: "認証を更新して続行" })).not.toBeVisible();
});

// 2026-09-10、ChatGPTレビュー指摘（P1、"Invalidate the original handoff when resume is
// rejected"）の回帰防止。先読み対象が除外され`queue.resume()`がfalseを返した時点では、
// 元のattemptHandoff()自身が呼んだネイティブplay()（解決が保証されず、このテストでは
// 意図的に永久に保留する）はまだ無効化されていなかった。この元のplay()が後から遅れて
// 解決すると、除外されたはずの曲へそのままコミットしてしまっていた。
test("認証継続の対象曲が除外されてresume()が失敗した後、元のハンドオフ自身の保留中のplay()が遅れて解決しても、除外された曲へコミットしない（2026-09-10、ChatGPTレビュー指摘：P1）", async ({ context, page }) => {
  await installGoogleMocks(context, { albumCatalog: true }); await page.goto("/"); await login(page);
  await page.locator("#folder-id").fill("root"); await page.locator("#spreadsheet-id").fill("sheet");
  await page.getByRole("button", { name: "索引から曲一覧を読み込む" }).click();
  await expect(page.locator("#status")).toContainText("索引から4曲");

  await page.getByRole("checkbox", { name: "曲間をクロスフェードする" }).check();

  const symphony = page.locator("#album-list li").filter({ hasText: "Symphony（3曲）" });
  await symphony.getByRole("button", { name: "このアルバムを再生" }).click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-1(\?|$)/);
  await expect(page.locator("#now-playing")).toContainText("Opening");

  await page.clock.install();

  // album-track-2への最初のplay()呼び出し（ハンドオフ自身）だけを、テスト側から明示的に
  // 解放できる形で保留する。実際のネイティブplay()自体は呼んで実際のSW経由のRange
  // リクエストを発生させる。
  await page.evaluate(() => {
    const originalPlay = HTMLMediaElement.prototype.play;
    let track2CallCount = 0;
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: function (this: HTMLMediaElement) {
        if (this.id === "audio-player" && this.src.includes("album-track-2")) {
          track2CallCount += 1;
          if (track2CallCount === 1) {
            originalPlay.call(this).catch(() => {});
            return new Promise<void>((resolve) => {
              (window as any).__releaseOriginalHandoffPlay = resolve;
            });
          }
        }
        return originalPlay.call(this);
      },
    });
  });

  await page.evaluate(() => {
    const audio = document.querySelector<HTMLAudioElement>("#audio-player")!;
    Object.defineProperty(audio, "duration", { value: 180, configurable: true });
    Object.defineProperty(audio, "paused", { value: false, configurable: true });
    audio.currentTime = 179.99;
    audio.dispatchEvent(new Event("timeupdate"));
  });
  await expect(page.locator("#audio-player-crossfade")).toHaveAttribute("src", /album-track-2(\?|$)/);
  await page.clock.runFor(100);

  let rejectedOnce = false;
  await context.route("**/drive/v3/files/album-track-2*", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("alt") === "media" && !rejectedOnce) {
      rejectedOnce = true;
      await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: { message: "revoked token" } }) });
      return;
    }
    await route.continue();
  });
  await expect.poll(() => page.evaluate(() => document.querySelector("#audio-player")!.getAttribute("src"))).toMatch(/album-track-2/);
  await expect(page.getByRole("button", { name: "認証を更新して続行" })).toBeVisible();

  // 「認証を更新して続行」を押す前に、先読み対象（Scherzo=album-track-2）自体を除外する。
  const scherzoRow = page.locator("#catalog-list li").filter({ hasText: "Scherzo" });
  await scherzoRow.getByRole("checkbox").uncheck();

  await page.getByRole("button", { name: "認証を更新して続行" }).click();
  await expect.poll(() => page.evaluate(() => document.querySelector<HTMLAudioElement>("#audio-player")!.volume)).toBe(1);

  // ここで、元のattemptHandoff()自身が呼んだ最初のplay()呼び出しを遅れて解決させる。
  // 無効化されていれば、これが解決してもキューは無反応のまま（Opening=track1のまま）に
  // なるはず。無効化されていない場合、queue.tsのadvanceToPreviewedFile()自身が持つ
  // 「除外済みならフォールバック」ループが働くため除外された曲（Scherzo）へコミット
  // することは無い一方、代わりに要求していないフォールバック候補（Finale=album-track-3）
  // への新しいplay()を勝手に開始してしまう（ユーザーが除外操作で止めたつもりの遷移が、
  // 形を変えて裏で進行してしまう）。「Scherzoへ進まない」だけでは検出できないため、
  // 「そもそも一切進まない（Openingのまま）」ことを検証する。
  await page.waitForTimeout(200);
  await expect(page.locator("#now-playing")).toContainText("Opening");
  await page.evaluate(() => (window as any).__releaseOriginalHandoffPlay?.());
  await page.waitForTimeout(200);

  await expect(page.locator("#now-playing")).not.toContainText("Scherzo");
  await expect(page.locator("#now-playing")).toContainText("Opening");
});

// 2026-09-10、ChatGPTレビュー指摘（P1、"Clear the deferred authentication operation on
// cancellation"）の回帰防止。Drive 401がhandleStreamTokenRejected()へ既に届き認証通知が
// 表示された後（＝playbackAuthGate.pendingOperationにcontinuation.resume()を呼ぶクロージャが
// 保留された後）にシークでハンドオフを打ち切ると、レジストリ側のclear()だけでは
// playbackAuthGate側の保留操作自体は無効化されず、通知が表示されたまま残っていた
// （クリックするとisCurrent()を経由しない直接のcontinuation.resume()が呼ばれ、打ち切った
// はずの次の曲がそのまま始まってしまう）。
test("Drive 401で認証通知が表示された後にシークでハンドオフを打ち切ると、認証通知も消える（2026-09-10、ChatGPTレビュー指摘：P1）", async ({ context, page }) => {
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
    const originalPlay = HTMLMediaElement.prototype.play;
    let track2CallCount = 0;
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: function (this: HTMLMediaElement) {
        if (this.id === "audio-player" && this.src.includes("album-track-2")) {
          track2CallCount += 1;
          if (track2CallCount === 1) {
            originalPlay.call(this).catch(() => {});
            return new Promise<void>(() => {}); // 二度と解決しない
          }
        }
        return originalPlay.call(this);
      },
    });
  });

  await page.evaluate(() => {
    const audio = document.querySelector<HTMLAudioElement>("#audio-player")!;
    Object.defineProperty(audio, "duration", { value: 180, configurable: true });
    Object.defineProperty(audio, "paused", { value: false, configurable: true });
    audio.currentTime = 179.99;
    audio.dispatchEvent(new Event("timeupdate"));
  });
  await expect(page.locator("#audio-player-crossfade")).toHaveAttribute("src", /album-track-2(\?|$)/);
  await page.clock.runFor(100);

  let rejectedOnce = false;
  await context.route("**/drive/v3/files/album-track-2*", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("alt") === "media" && !rejectedOnce) {
      rejectedOnce = true;
      await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: { message: "revoked token" } }) });
      return;
    }
    await route.continue();
  });
  // 401が届き、認証通知が表示されるまで待つ（=playbackAuthGate.pendingOperationに
  // 継続のresume()が保留された状態）。
  await expect(page.getByRole("button", { name: "認証を更新して続行" })).toBeVisible();

  // この状態でシークし、ハンドオフを打ち切る。
  await page.evaluate(() => {
    const slider = document.querySelector<HTMLInputElement>("#seek-slider")!;
    slider.disabled = false;
    slider.max = "180";
    slider.value = "10";
    slider.dispatchEvent(new Event("input"));
    slider.dispatchEvent(new Event("change"));
  });

  // ハンドオフ自身の（打ち切られた）認証継続通知は一旦消える。ただし、401でDriveAuth側の
  // トークンが既にクリア済みのため、シーク自身が引き起こす退場側への再開（queue.
  // resumeCurrent()）も改めて認証を必要とし、通知が再表示される（2026-09-10、続けて
  // ChatGPTレビュー指摘：P1「committed handoffからのシーク復元が認証継続をバイパスして
  // います」の修正により、この復元も通常の認証継続経路〈handleQueuePlayback()〉に
  // 正しく乗るようになったため。旧実装〈`void queue?.resumeCurrent(...)`を直接呼ぶだけ〉
  // ではこの経路を素通りし、認証エラーが未処理のPromise rejectionとして黙って失敗していた
  // ため、この再表示自体が起きなかった＝バグを検出できていなかった）。
  await expect(page.getByRole("button", { name: "認証を更新して続行" })).toBeVisible();

  // 「認証を更新して続行」を押すと、退場側（album-track-1）がユーザーのシーク目標
  // （10秒）から正しく再開する。
  await page.getByRole("button", { name: "認証を更新して続行" }).click();
  await expect(page.getByRole("button", { name: "認証を更新して続行" })).not.toBeVisible();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-1(\?|$)/);
  await expect.poll(() => page.evaluate(() => document.querySelector<HTMLAudioElement>("#audio-player")!.currentTime)).toBeCloseTo(10, 0);
  await expect(page.locator("#catalog-list li.now-playing")).toContainText("Opening");
});

// 2026-09-10、ChatGPT再レビュー指摘（P1、「Restore the outgoing source when cancelling a
// committed handoff」）の回帰防止。ハンドオフが`audio.src`を次曲へ既にコミット済み（native
// play()の解決待ち中）の状態でシークすると、cancelPendingTransition()はgenerationを進める
// だけでaudio.srcは次曲を指したまま残っていた。この状態で保留中だった次曲のplay()が後から
// 解決すると、isSupersededの巻き戻り処理でそのまま一時停止してしまい、実機報告「シーク後に
// 再生ボタンを押さないと再生されない」の原因になっていた。退場側のfileId・位置をクロス
// フェード開始時点で記録しておき、この状況を検出したらqueue.resumeCurrent()で退場側を
// 明示的に再開させるよう修正。
test("ハンドオフがaudio.srcを次曲へ既にコミット済みの状態でシークすると、audio.srcが退場側の曲へ戻り再開する（再生ボタンを押す必要がない）（2026-09-10、ChatGPT再レビュー指摘：P1）", async ({ context, page }) => {
  await installGoogleMocks(context, { albumCatalog: true }); await page.goto("/"); await login(page);
  await page.locator("#folder-id").fill("root"); await page.locator("#spreadsheet-id").fill("sheet");
  await page.getByRole("button", { name: "索引から曲一覧を読み込む" }).click();
  await expect(page.locator("#status")).toContainText("索引から4曲");

  await page.getByRole("checkbox", { name: "曲間をクロスフェードする" }).check();

  const symphony = page.locator("#album-list li").filter({ hasText: "Symphony（3曲）" });
  await symphony.getByRole("button", { name: "このアルバムを再生" }).click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-1(\?|$)/);

  await page.clock.install();

  // album-track-2への最初のplay()呼び出し（ハンドオフ自身）だけを保留する。この時点で
  // 既にaudio.srcは次曲（album-track-2）へコミット済みという状態を再現する（PlaybackController
  // が`audio.src`を同期的に設定してからネイティブplay()をawaitする実装のため）。
  await page.evaluate(() => {
    const originalPlay = HTMLMediaElement.prototype.play;
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: function (this: HTMLMediaElement) {
        if (this.id === "audio-player" && this.src.includes("album-track-2")) {
          return new Promise<void>((resolve) => {
            (window as unknown as { __e2eReleaseHandoffPlay?: () => void }).__e2eReleaseHandoffPlay = resolve;
          });
        }
        return originalPlay.call(this);
      },
    });
  });

  await page.evaluate(() => {
    const audio = document.querySelector<HTMLAudioElement>("#audio-player")!;
    Object.defineProperty(audio, "duration", { value: 180, configurable: true });
    Object.defineProperty(audio, "paused", { value: false, configurable: true });
    audio.currentTime = 179.99;
    audio.dispatchEvent(new Event("timeupdate"));
  });
  await expect(page.locator("#audio-player-crossfade")).toHaveAttribute("src", /album-track-2(\?|$)/);
  await page.clock.runFor(100);
  // ハンドオフのplay()呼び出しが実行され保留状態になった＝audio.srcは既に次曲へコミット済み。
  await expect.poll(() => page.evaluate(() => Boolean((window as unknown as { __e2eReleaseHandoffPlay?: () => void }).__e2eReleaseHandoffPlay))).toBe(true);
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-2(\?|$)/);

  // この状態でシークし、ハンドオフを打ち切る。
  await page.evaluate(() => {
    const slider = document.querySelector<HTMLInputElement>("#seek-slider")!;
    slider.disabled = false;
    slider.max = "180";
    slider.value = "10";
    slider.dispatchEvent(new Event("input"));
    slider.dispatchEvent(new Event("change"));
  });

  // audio.srcが退場側（album-track-1）へ明示的に戻る（再生ボタンを押さずに再開できる）。
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-1(\?|$)/);
  await expect(page.locator("#catalog-list li.now-playing")).toContainText("Opening");
  // 退場側の再生位置はユーザーが指定したシーク目標（10秒）であり、クロスフェード開始時点の
  // 古い位置（179.99秒付近）ではないこと（2026-09-10、ChatGPT再レビュー指摘：P1続き。以前の
  // 実装はcancelCrossfadeIfActive()内でfire-and-forgetに古い位置からqueue.resumeCurrent()を
  // 呼んでおり、これが呼び出し元の同期的な`audioPlayer.currentTime = 目標値`より後に
  // PlaybackController.play()内部で古い位置へ上書きしてしまう競合があった）。
  await expect.poll(() => page.evaluate(() => document.querySelector<HTMLAudioElement>("#audio-player")!.currentTime)).toBeCloseTo(10, 0);

  // 保留していたハンドオフのplay()を今になって解決させても、既に上書きされた退場側の
  // srcを巻き戻さない（isSupersededのsrc一致確認ガードにより、既に別の正当なplay()に
  // 上書きされていれば何もしない）。
  await page.evaluate(() => (window as unknown as { __e2eReleaseHandoffPlay?: () => void }).__e2eReleaseHandoffPlay?.());
  await page.waitForTimeout(50);
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-1(\?|$)/);
  await expect(page.locator("#catalog-list li.now-playing")).toContainText("Opening");
});

// 2026-09-10、ChatGPT再レビュー指摘（P1、「退場側の非同期resumeがユーザー操作を後から
// 上書きします」）の回帰防止（一時停止の側）。旧実装はcancelCrossfadeIfActive()内で無条件に
// fire-and-forgetでqueue.resumeCurrent()を呼んでいたため、一時停止ボタンで止めた直後にこの
// 非同期resumeが実行され、PlaybackController.play()経由で退場側（album-track-1）へ2度目の
// ネイティブplay()呼び出しが発生し、止めたはずの曲が再び鳴り出してしまっていた
// （cancelCrossfadeIfActiveの復元は呼び出し元の意図と協調すべきで、一時停止の場合は
// 「何もしない」が正しい）。
test("ハンドオフがaudio.srcを次曲へ既にコミット済みの状態で一時停止しても、退場側の曲が再度play()されない（2026-09-10、ChatGPT再レビュー指摘：P1続き）", async ({ context, page }) => {
  await installGoogleMocks(context, { albumCatalog: true }); await page.goto("/"); await login(page);
  await page.locator("#folder-id").fill("root"); await page.locator("#spreadsheet-id").fill("sheet");
  await page.getByRole("button", { name: "索引から曲一覧を読み込む" }).click();
  await expect(page.locator("#status")).toContainText("索引から4曲");

  await page.getByRole("checkbox", { name: "曲間をクロスフェードする" }).check();

  const symphony = page.locator("#album-list li").filter({ hasText: "Symphony（3曲）" });
  await symphony.getByRole("button", { name: "このアルバムを再生" }).click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-1(\?|$)/);

  await page.clock.install();

  // album-track-1（退場側）へのplay()呼び出し回数を記録しつつ、album-track-2（ハンドオフ）
  // への最初の呼び出しだけを保留する。
  await page.evaluate(() => {
    const originalPlay = HTMLMediaElement.prototype.play;
    (window as unknown as { __e2eTrack1PlayCount: number }).__e2eTrack1PlayCount = 0;
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: function (this: HTMLMediaElement) {
        if (this.id === "audio-player" && this.src.includes("album-track-1")) {
          (window as unknown as { __e2eTrack1PlayCount: number }).__e2eTrack1PlayCount += 1;
        }
        if (this.id === "audio-player" && this.src.includes("album-track-2")) {
          return new Promise<void>((resolve) => {
            (window as unknown as { __e2eReleaseHandoffPlay?: () => void }).__e2eReleaseHandoffPlay = resolve;
          });
        }
        return originalPlay.call(this);
      },
    });
  });

  await page.evaluate(() => {
    const audio = document.querySelector<HTMLAudioElement>("#audio-player")!;
    Object.defineProperty(audio, "duration", { value: 180, configurable: true });
    Object.defineProperty(audio, "paused", { value: false, configurable: true });
    audio.currentTime = 179.99;
    audio.dispatchEvent(new Event("timeupdate"));
  });
  await expect(page.locator("#audio-player-crossfade")).toHaveAttribute("src", /album-track-2(\?|$)/);
  await page.clock.runFor(100);
  await expect.poll(() => page.evaluate(() => Boolean((window as unknown as { __e2eReleaseHandoffPlay?: () => void }).__e2eReleaseHandoffPlay))).toBe(true);
  const track1PlayCountBeforePause = await page.evaluate(() => (window as unknown as { __e2eTrack1PlayCount: number }).__e2eTrack1PlayCount);

  // ハンドオフがまだ解決していない状態で一時停止する。
  await page.getByRole("button", { name: "一時停止" }).click();

  // 保留していたハンドオフのplay()を今になって解決させる。
  await page.evaluate(() => (window as unknown as { __e2eReleaseHandoffPlay?: () => void }).__e2eReleaseHandoffPlay?.());
  await page.waitForTimeout(50);

  // 一時停止後、退場側（album-track-1）への追加のplay()呼び出しは発生していない
  // （＝止めたはずの曲が勝手に再び鳴り出していない）。
  const track1PlayCountAfterHandoffResolved = await page.evaluate(() => (window as unknown as { __e2eTrack1PlayCount: number }).__e2eTrack1PlayCount);
  expect(track1PlayCountAfterHandoffResolved).toBe(track1PlayCountBeforePause);
  await expect(page.locator("#catalog-list li.now-playing")).toContainText("Opening");
});

// 2026-09-10、続けてChatGPTレビュー指摘（P1、「Pause後にaudio sourceとqueue currentが食い違った
// まま残ります」）の回帰防止。committed handoff中に一時停止すると、audio要素は次曲のsrcを
// 保持したまま止まり、queue.currentFileIdは退場側のままという食い違いが残っていた。この状態で
// MediaSessionのネイティブPlay（audioPlayer.play()直呼び）を押すと、間違った曲（次曲）が
// 再開されてしまう。playback.loadPaused()により、pause完了時点でaudio.srcを退場側へ揃える
// よう修正した。
test("ハンドオフがaudio.srcを次曲へ既にコミット済みの状態で一時停止すると、audio.srcが退場側の曲へ戻る（食い違ったまま残らない）（2026-09-10、ChatGPT再レビュー指摘：P1）", async ({ context, page }) => {
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
    const originalPlay = HTMLMediaElement.prototype.play;
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: function (this: HTMLMediaElement) {
        if (this.id === "audio-player" && this.src.includes("album-track-2")) {
          return new Promise<void>((resolve) => {
            (window as unknown as { __e2eReleaseHandoffPlay?: () => void }).__e2eReleaseHandoffPlay = resolve;
          });
        }
        return originalPlay.call(this);
      },
    });
  });

  await page.evaluate(() => {
    const audio = document.querySelector<HTMLAudioElement>("#audio-player")!;
    Object.defineProperty(audio, "duration", { value: 180, configurable: true });
    Object.defineProperty(audio, "paused", { value: false, configurable: true });
    audio.currentTime = 179.99;
    audio.dispatchEvent(new Event("timeupdate"));
  });
  await expect(page.locator("#audio-player-crossfade")).toHaveAttribute("src", /album-track-2(\?|$)/);
  await page.clock.runFor(100);
  await expect.poll(() => page.evaluate(() => Boolean((window as unknown as { __e2eReleaseHandoffPlay?: () => void }).__e2eReleaseHandoffPlay))).toBe(true);
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-2(\?|$)/);

  await page.getByRole("button", { name: "一時停止" }).click();
  await page.evaluate(() => (window as unknown as { __e2eReleaseHandoffPlay?: () => void }).__e2eReleaseHandoffPlay?.());
  await page.waitForTimeout(50);

  // audio.srcがqueue.currentFileId（退場側=album-track-1）と一致する状態まで復元される。
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-1(\?|$)/);
  await expect(page.locator("#catalog-list li.now-playing")).toContainText("Opening");
});

// 2026-09-10、続けてChatGPTレビュー指摘（P1、「フェード付きPauseが別操作に追い越された後でも、
// 古い退場曲をloadPaused()してしまいます」）の回帰防止。committed handoff中にフェード付き
// 一時停止を開始し、そのフェードが完了する前に「次へ」で別の正当な再生へ追い越すと、追い越された
// pause()は中断されたにも関わらず、旧実装ではそのPromiseが解決した時点でloadPaused()が無条件に
// 呼ばれ、既に「次へ」がコミットした新しい状態（Finale）を古い退場曲（Opening）で上書きして
// しまっていた。pause()の戻り値をPromise<boolean>へ変更し、完了（true）の場合だけloadPaused()を
// 呼ぶよう修正した。
test("committed handoff中のフェード付き一時停止が「次へ」に追い越されても、古い退場曲で上書きされない（2026-09-10、ChatGPT再レビュー指摘：P1）", async ({ context, page }) => {
  await installGoogleMocks(context, { albumCatalog: true }); await page.goto("/"); await login(page);
  await page.locator("#folder-id").fill("root"); await page.locator("#spreadsheet-id").fill("sheet");
  await page.getByRole("button", { name: "索引から曲一覧を読み込む" }).click();
  await expect(page.locator("#status")).toContainText("索引から4曲");

  await page.getByRole("checkbox", { name: "曲間をクロスフェードする" }).check();
  await page.getByRole("checkbox", { name: "手動スキップ/一時停止時にフェードアウトする" }).check();

  const symphony = page.locator("#album-list li").filter({ hasText: "Symphony（3曲）" });
  await symphony.getByRole("button", { name: "このアルバムを再生" }).click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-1(\?|$)/);

  await page.clock.install();

  // album-track-2（ハンドオフ）への最初のplay()呼び出しだけを保留する。
  await page.evaluate(() => {
    const originalPlay = HTMLMediaElement.prototype.play;
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: function (this: HTMLMediaElement) {
        if (this.id === "audio-player" && this.src.includes("album-track-2")) {
          return new Promise<void>((resolve) => {
            (window as unknown as { __e2eReleaseHandoffPlay?: () => void }).__e2eReleaseHandoffPlay = resolve;
          });
        }
        return originalPlay.call(this);
      },
    });
  });

  await page.evaluate(() => {
    const audio = document.querySelector<HTMLAudioElement>("#audio-player")!;
    Object.defineProperty(audio, "duration", { value: 180, configurable: true });
    Object.defineProperty(audio, "paused", { value: false, configurable: true });
    audio.currentTime = 179.99;
    audio.dispatchEvent(new Event("timeupdate"));
  });
  await expect(page.locator("#audio-player-crossfade")).toHaveAttribute("src", /album-track-2(\?|$)/);
  await page.clock.runFor(100);
  // ハンドオフ（album-track-2への切り替え）がまだ解決していない時点で一時停止する
  // （この時点でaudio-player.srcは既にalbum-track-2へコミット済み、というcommitted
  // handoffの窓を再現する。既存の同種テストと同じ手順）。
  await expect.poll(() => page.evaluate(() => Boolean((window as unknown as { __e2eReleaseHandoffPlay?: () => void }).__e2eReleaseHandoffPlay))).toBe(true);
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-2(\?|$)/);

  // committed handoff済みの状態（退場側=album-track-1/Opening）からフェード付き一時停止を開始する
  // （outgoingRestoreがOpeningを指す状態で捕捉される）。
  await page.getByRole("button", { name: "一時停止" }).click();
  await page.clock.runFor(10); // フェード（E2Eでは50ms）の途中まで進める

  // フェードが完了しきる前に、キュー外の単曲試聴（album-track-3/Finale）で追い越す。
  await page.locator("#play-file-id").fill("album-track-3");
  await page.getByRole("button", { name: "この曲を再生" }).click();

  // 保留していたハンドオフ自身のplay()も遅れて解決させる（現実の非決定性を再現）。
  await page.evaluate(() => (window as unknown as { __e2eReleaseHandoffPlay?: () => void }).__e2eReleaseHandoffPlay?.());

  // 双方のフェード・play()が解決しきるまで仮想時刻を進める。
  await page.clock.runFor(200);
  await page.waitForTimeout(50);

  // 追い越した外部試聴がコミットしたFinaleのまま維持され、追い越されたpause()の
  // loadPaused(Opening)で上書きされていない。
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-3(\?|$)/);
});

// 2026-09-10、続けてChatGPTレビュー指摘（P1「committed handoff中のフェード付きPauseを連打すると、
// 退場曲の復元情報が失われます」）の回帰防止。1回目の一時停止クリックがcancelCrossfadeIfActive()
// からoutgoingRestore（退場側=Opening）を取得するが、そのフェードが完了する前に2回目の
// 一時停止クリック（連打）が発生すると、2回目のクリック時点ではcancelCrossfadeIfActive()は
// 既にnull（1回目のクリックで既にcrossfading=falseになっているため）を返す。以前はこの
// nullをそのまま使っていたため、2回目のpause()が最終的に完了してもloadPaused()が呼ばれず、
// audio.src（次曲のまま）とqueue.currentFileId（退場曲のまま）の食い違いが残っていた。
test("committed handoff中のフェード付き一時停止を連打しても、最終的に退場曲へ正しく復元される（2026-09-10、続けてChatGPTレビュー指摘：P1）", async ({ context, page }) => {
  await installGoogleMocks(context, { albumCatalog: true }); await page.goto("/"); await login(page);
  await page.locator("#folder-id").fill("root"); await page.locator("#spreadsheet-id").fill("sheet");
  await page.getByRole("button", { name: "索引から曲一覧を読み込む" }).click();
  await expect(page.locator("#status")).toContainText("索引から4曲");

  await page.getByRole("checkbox", { name: "曲間をクロスフェードする" }).check();
  await page.getByRole("checkbox", { name: "手動スキップ/一時停止時にフェードアウトする" }).check();

  const symphony = page.locator("#album-list li").filter({ hasText: "Symphony（3曲）" });
  await symphony.getByRole("button", { name: "このアルバムを再生" }).click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-1(\?|$)/);

  await page.clock.install();

  // album-track-2（ハンドオフ）への最初のplay()呼び出しだけを保留する。
  await page.evaluate(() => {
    const originalPlay = HTMLMediaElement.prototype.play;
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: function (this: HTMLMediaElement) {
        if (this.id === "audio-player" && this.src.includes("album-track-2")) {
          return new Promise<void>((resolve) => {
            (window as unknown as { __e2eReleaseHandoffPlay?: () => void }).__e2eReleaseHandoffPlay = resolve;
          });
        }
        return originalPlay.call(this);
      },
    });
  });

  await page.evaluate(() => {
    const audio = document.querySelector<HTMLAudioElement>("#audio-player")!;
    Object.defineProperty(audio, "duration", { value: 180, configurable: true });
    Object.defineProperty(audio, "paused", { value: false, configurable: true });
    audio.currentTime = 179.99;
    audio.dispatchEvent(new Event("timeupdate"));
  });
  await expect(page.locator("#audio-player-crossfade")).toHaveAttribute("src", /album-track-2(\?|$)/);
  await page.clock.runFor(100);
  await expect.poll(() => page.evaluate(() => Boolean((window as unknown as { __e2eReleaseHandoffPlay?: () => void }).__e2eReleaseHandoffPlay))).toBe(true);
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-2(\?|$)/);

  // committed handoff確認後、duration/currentTimeを曲末尾から離す（2026-09-10、テスト作成時に
  // 判明した注意点：loadPaused()はaudio.currentTimeへ退場側の位置＝179.99を書き戻すため、
  // このE2Eモック環境では`.paused`が固定false（実ブラウザと異なり.pause()呼び出しで連動しない）
  // のまま残り、この書き戻し自体がtimeupdateを発火させるとshouldStartCrossfade()の残り時間条件
  // を再び満たし、別の正当なクロスフェードが誤って再発火してしまう。crossfadeOutgoingPosition
  // はcrossfading=true時点で既に確定済みのため、ここでdurationを外しても本テストの検証対象
  // ＝outgoingRestore.positionには影響しない。
  await page.evaluate(() => {
    const audio = document.querySelector<HTMLAudioElement>("#audio-player")!;
    Object.defineProperty(audio, "duration", { value: NaN, configurable: true });
    audio.currentTime = 10;
  });

  // committed handoff済みの状態（退場側=album-track-1/Opening）から一時停止を連打する。
  await page.getByRole("button", { name: "一時停止" }).click(); // 1回目
  await page.clock.runFor(10); // 1回目のフェードの途中まで進める
  await page.getByRole("button", { name: "一時停止" }).click(); // 2回目、1回目を追い越す

  // 2回目のフェードが完了しきるまで仮想時刻を進める。
  await page.clock.runFor(200);
  // 保留していたハンドオフ自身のplay()も遅れて解決させる（現実の非決定性を再現）。
  await page.evaluate(() => (window as unknown as { __e2eReleaseHandoffPlay?: () => void }).__e2eReleaseHandoffPlay?.());
  await page.waitForTimeout(50);

  // audio.srcが退場側（album-track-1/Opening）へ正しく復元され、queueの現在曲表示も
  // 一致したまま（食い違ったまま残らない）。
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-1(\?|$)/);
  await expect(page.locator("#catalog-list li.now-playing")).toContainText("Opening");
});

// 2026-09-10、続けてCodexレビュー指摘（P1「Retain rollback state until navigation commits」）の
// 回帰防止。committed handoff中のフェード付き一時停止（1回目）→ その完了前に「次へ」→
// 「次へ」自身の完了前にもう一度一時停止（2回目）、という順序では、「次へ」はqueue.currentFileId
// がまだ退場曲（album-track-1）のままのため同じ先読み先（album-track-2）へ移動しようとするが、
// 2回目の一時停止に追い越されコミットしないまま終わる。この「次へ」がコミットせずに終わった
// 場合でも、1回目の一時停止が捕捉した退場曲の復元情報（pendingPauseOutgoingRestore）は
// 失われず、最終的に完了した2回目の一時停止がそれを使ってaudio.srcを正しく退場曲へ復元できる
// ことを検証する。
test("committed handoff中の一時停止→次へ→一時停止という順序でも、「次へ」がコミットせずに終われば退場曲へ正しく復元される（2026-09-10、続けてCodexレビュー指摘：P1）", async ({ context, page }) => {
  await installGoogleMocks(context, { albumCatalog: true }); await page.goto("/"); await login(page);
  await page.locator("#folder-id").fill("root"); await page.locator("#spreadsheet-id").fill("sheet");
  await page.getByRole("button", { name: "索引から曲一覧を読み込む" }).click();
  await expect(page.locator("#status")).toContainText("索引から4曲");

  await page.getByRole("checkbox", { name: "曲間をクロスフェードする" }).check();
  await page.getByRole("checkbox", { name: "手動スキップ/一時停止時にフェードアウトする" }).check();

  const symphony = page.locator("#album-list li").filter({ hasText: "Symphony（3曲）" });
  await symphony.getByRole("button", { name: "このアルバムを再生" }).click();
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-1(\?|$)/);

  await page.clock.install();

  // album-track-2への全てのplay()呼び出しを恒久的に保留する（ハンドオフ自身の呼び出しも
  // 「次へ」による2回目の呼び出しも、どちらも実際には解決しない想定でよい：このテストが
  // 検証したいのは「途中でコミットせず終わった操作が復元情報を失わせないこと」であり、
  // いずれの呼び出しも最終的に成功しない前提で構わない）。
  await page.evaluate(() => {
    const originalPlay = HTMLMediaElement.prototype.play;
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: function (this: HTMLMediaElement) {
        if (this.id === "audio-player" && this.src.includes("album-track-2")) {
          return new Promise<void>(() => {}); // 恒久的に未解決
        }
        return originalPlay.call(this);
      },
    });
  });

  await page.evaluate(() => {
    const audio = document.querySelector<HTMLAudioElement>("#audio-player")!;
    Object.defineProperty(audio, "duration", { value: 180, configurable: true });
    Object.defineProperty(audio, "paused", { value: false, configurable: true });
    audio.currentTime = 179.99;
    audio.dispatchEvent(new Event("timeupdate"));
  });
  await expect(page.locator("#audio-player-crossfade")).toHaveAttribute("src", /album-track-2(\?|$)/);
  await page.clock.runFor(100);
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-2(\?|$)/);

  // committed handoff確認後、duration/currentTimeを曲末尾から離す（既存の連打テストと同じ理由：
  // loadPaused()のcurrentTime書き戻しによる別クロスフェードの誤発火を防ぐ）。
  await page.evaluate(() => {
    const audio = document.querySelector<HTMLAudioElement>("#audio-player")!;
    Object.defineProperty(audio, "duration", { value: NaN, configurable: true });
    audio.currentTime = 10;
  });

  // 1回目の一時停止（退場曲=album-track-1/Openingの復元情報を捕捉）。
  await page.getByRole("button", { name: "一時停止" }).click();
  await page.clock.runFor(10); // フェードの途中まで進める

  // フェード完了前に「次へ」（queue.currentFileIdはまだOpeningのため、album-track-2への
  // 移動を試みるが、album-track-2のplay()は恒久的に未解決のため完了しない）。
  await page.getByRole("button", { name: "次へ" }).click();
  await page.clock.runFor(10); // 「次へ」自身のフェードの途中まで進める（1回目を追い越す）

  // 「次へ」自身も完了する前に2回目の一時停止（1回目が捕捉した復元情報を引き継ぐはず）。
  await page.getByRole("button", { name: "一時停止" }).click();

  // 2回目のフェードが完了しきるまで仮想時刻を進める。
  await page.clock.runFor(200);
  await page.waitForTimeout(50);

  // audio.srcが退場側（album-track-1/Opening）へ正しく復元され、queueの現在曲表示も
  // 一致したまま（「次へ」が復元情報を消してしまい、2回目の一時停止が復元先を失う
  // 回帰を防ぐ）。
  await expect(page.locator("#audio-player")).toHaveAttribute("src", /album-track-1(\?|$)/);
  await expect(page.locator("#catalog-list li.now-playing")).toContainText("Opening");
});
