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
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

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
  // btn-retryのクリックハンドラは必ず確認モーダルを開くため、表示チェックを挟まず
  // 直接クリックする(Playwrightのlocator.click()は要素が操作可能になるまで自動待機
  // するため、モーダル表示の非同期タイミングを気にする必要はない)
  await page.locator(".modal-btn-confirm").click();

  // リトライが効いていればステージが再生成され、手数はbaselineへ戻る
  // (旧実装では無視されるためbaseline+3のまま止まっていた)
  await expect(page.locator("#hud-moves")).toHaveText(movesBaseline);

  // 旧shuffleのawait sleep(300)明けの残処理(resolveBoard()/finishTurn())が、
  // 新しいステージの盤面へ実行されてしまう別の回帰があった(/code-review指摘、
  // PR #361・7巡目)。startStage()がG.animatingの解除を待ってから再初期化する
  // よう修正済みで、待ち時間分だけリトライ自体は遅れるが黙って無視はされない。
  // 300ms（旧shuffleの待機時間）を超えて待ってから、ゲームがまだ正常に応答する
  // こと（もう一度リトライが即座に効くこと）とコンソールエラーが無いことを確認する。
  // このサンドボックス環境ではタイマーが実時間より大幅に遅く進むことが実測で
  // 確認されている(300ms想定のsleepが800ms近くかかることがある)ため、
  // 余裕を持って3000ms待つ
  await page.waitForTimeout(3000);
  await page.click("#btn-retry");
  await page.locator(".modal-btn-confirm").click();
  await expect(page.locator("#hud-moves")).toHaveText(movesBaseline);

  // track()呼び出しのGAS/analyticsエンドポイントへのfetchはこのサンドボックス環境では
  // 到達できず失敗しうる（アプリロジックとは無関係のネットワーク起因のノイズ）ため、
  // 実際のJS例外(pageerror)のみを見る。console.errorの資源読み込み失敗は対象外
  expect(errors).toEqual([]);
});

// navigationEpochのスナップショットをG.animating待機ループの「後」で取ると、
// その待機中に「やめる」でタイトルへ遷移した場合、遷移後の値をスナップショット
// してしまい後続の比較で検知できず、待機完了後にゲーム画面へ引き戻されてしまう
// 回帰があった(PR #361・8巡目、/code-review指摘)。スナップショットを待機ループの
// 「前」に移動した修正の恒久的な回帰テスト
test("navigating away while waiting for an unrelated animation is not overridden by the stage start", async ({ page }) => {
  await page.goto("/");
  await page.click("#screen-splash");
  await expect(page.locator("#screen-title")).toHaveClass(/active/);

  for (let i = 0; i < 7; i++) await page.click("#version-info");
  await expect(page.locator("#debug-panel")).not.toHaveClass(/hidden/);
  await page.click("#btn-debug-close");

  await page.click("#btn-stage-select");
  await expect(page.locator("#screen-stage-select")).toHaveClass(/active/);
  await page.locator(".stage-btn:not(.locked)").first().click();
  await expect(page.locator("#screen-game")).toHaveClass(/active/);

  const tutorial = page.locator("#tutorial-overlay");
  if (await tutorial.isVisible()) await tutorial.click();

  // シャッフル演出(G.animating=true、300ms+)を発生させ、その解決を待たずリトライを
  // 確定する。startStage()はG.animatingの待機ループに入って足止めされる
  await page.click('[data-item="shuffle"]');
  await page.click("#btn-retry");
  await page.locator(".modal-btn-confirm").click();

  // startStage()がまだG.animating待機中の間に「やめる」でタイトルへ遷移する
  await page.click("#btn-quit");
  await page.locator(".modal-btn-confirm").click();
  await expect(page.locator("#screen-title")).toHaveClass(/active/);

  // シャッフルの300ms+待機・詰み回復チェックが完了するのを待っても、タイトル画面の
  // ままであること(旧実装ではゲーム画面へ引き戻されていた)を確認する。このサンドボックス
  // 環境ではタイマーが実時間より大幅に遅く進むことが実測で確認されているため、
  // 余裕を持って3000ms待つ
  await page.waitForTimeout(3000);
  await expect(page.locator("#screen-title")).toHaveClass(/active/);
});

// 上のテストと同じ状況（G.animating待機中に「やめる」でタイトルへ遷移）から、
// 直後に「はじめる」で新しくstartStage()を呼ぶと、古い呼び出しがまだ
// G.stageStartingを保持したままだと新しい呼び出しが無言で拒否され、
// ボタンを押しても何も起きないように見える回帰があった(PR #361・9巡目、
// /code-review指摘)。待機ループ内でもepochの変化を検知して即座に
// G.stageStartingを解放するようにした修正の恒久的な回帰テスト
test("starting a new stage right after navigating away is not silently dropped", async ({ page }) => {
  await page.goto("/");
  await page.click("#screen-splash");
  await expect(page.locator("#screen-title")).toHaveClass(/active/);

  for (let i = 0; i < 7; i++) await page.click("#version-info");
  await expect(page.locator("#debug-panel")).not.toHaveClass(/hidden/);
  await page.click("#btn-debug-close");

  await page.click("#btn-stage-select");
  await expect(page.locator("#screen-stage-select")).toHaveClass(/active/);
  await page.locator(".stage-btn:not(.locked)").first().click();
  await expect(page.locator("#screen-game")).toHaveClass(/active/);

  const tutorial = page.locator("#tutorial-overlay");
  if (await tutorial.isVisible()) await tutorial.click();

  await page.click('[data-item="shuffle"]');
  await page.click("#btn-retry");
  await page.locator(".modal-btn-confirm").click();

  await page.click("#btn-quit");
  await page.locator(".modal-btn-confirm").click();
  await expect(page.locator("#screen-title")).toHaveClass(/active/);

  // 古いstartStage()呼び出しがepochの変化に気づいてG.stageStartingを解放するまで
  // 短時間待ってから（旧shuffleの300ms+待機そのものを待つ必要はない）、
  // 「はじめる」で新しく開始する
  await page.waitForTimeout(200);
  await page.click("#btn-start");

  // 新しい開始要求が無言で拒否されていなければ、いずれゲーム画面に戻る
  // (旧実装ではタイトル画面のまま何も起きなかった)
  await expect(page.locator("#screen-game")).toHaveClass(/active/, { timeout: 5000 });
});
