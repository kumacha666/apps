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
// 直後に「はじめる」で新しくstartStage()を呼ぶと、古い呼び出しの処理が完了する
// までは新しい呼び出しが無言で拒否され、ボタンを押しても何も起きないように見える
// 回帰があった(PR #361・9巡目、/code-review指摘)。待機ループ内でもepochの変化を
// 検知して即座に古い試行を諦めるようにした修正の恒久的な回帰テスト
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

// 上の2件は「他の操作(シャッフル等)の完了待ちG.animating」区間で新しい開始要求を
// 取りこぼす回帰だったが、startStage()自身が開始するensurePlayableBoard()の
// 詰み回復待機中に同じことが起きるケースは別の欠落として残っていた(PR #361・10巡目、
// /code-review指摘)。実際の初期詰みは確率的で決定的なテストにしづらいため、
// window.__test_stageStartDelayMs（DEVビルドのみ有効なテスト専用フック、本番では
// import.meta.env.DEVの静的評価によりデッドコード除去される）でensurePlayableBoard()
// 直後の待機を人為的に引き延ばし、その間の「別画面へ遷移→直後に別ステージを要求」を
// 決定的に再現する。StageStartQueueによる直列化・最新要求優先の修正で、この新しい
// 要求（デバッグジャンプでStage 3を指定）が無言で破棄されず、かつ最終的に反映される
// のがretryの対象だった元のStage 1ではなくStage 3であることまで確認する
test("a start request made while startStage()'s own recovery wait is pending reflects the latest request, not the stale one", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

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
  await expect(page.locator("#hud-stage")).toHaveText("Stage 1");

  const tutorial = page.locator("#tutorial-overlay");
  if (await tutorial.isVisible()) await tutorial.click();

  // ensurePlayableBoard()直後の待機を人為的に2500ms引き延ばす
  await page.evaluate(() => { window.__test_stageStartDelayMs = 2500; });

  // リトライ(Stage 1を再度要求)。createBoard()/ensurePlayableBoard()自体は速いが、
  // 直後のテスト専用フックで2500ms足止めされる
  await page.click("#btn-retry");
  await page.locator(".modal-btn-confirm").click();

  // 足止めされている間に「やめる」でタイトルへ遷移する
  await page.click("#btn-quit");
  await page.locator(".modal-btn-confirm").click();
  await expect(page.locator("#screen-title")).toHaveClass(/active/);

  // 引き延ばされた待機がまだ終わっていないうちに、デバッグジャンプでStage 3への
  // 開始要求を新たに発行する（retryの対象＝Stage 1とは異なる、最終結果を明確に
  // 区別するため）。#btn-debug-openは#screen-game内にしかないため、タイトル画面
  // からは7タップで改めてデバッグパネルを開く（G.debugModeは既にtrueなので冪等）
  for (let i = 0; i < 7; i++) await page.click("#version-info");
  await expect(page.locator("#debug-panel")).not.toHaveClass(/hidden/);
  await page.fill("#debug-stage-num", "3");
  await page.click("#btn-debug-jump");

  // 新しい要求が無言で破棄されていなければ、引き延ばした待機が終わり次第
  // ゲーム画面に戻る。最終的にG.currentStageが一致すべきは最後に要求した
  // Stage 3であり、古いリトライが対象にしていたStage 1ではない
  await expect(page.locator("#screen-game")).toHaveClass(/active/, { timeout: 5000 });
  await expect(page.locator("#hud-stage")).toHaveText("Stage 3");

  // 引き延ばした古い試行(Stage 1向け)が後から解決しても、Stage 3の盤面・HUDを
  // 書き換えないことを確認する(2500ms分は既に消化済みだが、念のため猶予を見て待つ)
  await page.waitForTimeout(500);
  await expect(page.locator("#hud-stage")).toHaveText("Stage 3");
  await expect(page.locator("#screen-game")).toHaveClass(/active/);

  expect(errors).toEqual([]);
});

// 上のテストはナビゲーション(「やめる」)を伴うケースだが、レビューで要求された
// 「複数の開始要求が連続した場合は最後の要求を反映する」（StageStartQueueの
// 保留上書きロジック）は、ナビゲーションを介さずゲーム画面に留まったまま連続で
// デバッグジャンプした場合にも成り立つ必要がある。この場合navigationEpochは
// 変化しないため、StageStartQueue.hasPending()による早期打ち切りが無いと
// 検知できない（PR #361・10巡目、/code-review指摘の要件6）
test("consecutive start requests without any navigation reflect only the last one", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto("/");
  await page.click("#screen-splash");
  await expect(page.locator("#screen-title")).toHaveClass(/active/);

  for (let i = 0; i < 7; i++) await page.click("#version-info");
  await expect(page.locator("#debug-panel")).not.toHaveClass(/hidden/);
  await page.click("#btn-debug-close");

  await page.click("#btn-stage-select");
  await page.locator(".stage-btn:not(.locked)").first().click();
  await expect(page.locator("#screen-game")).toHaveClass(/active/);
  await expect(page.locator("#hud-stage")).toHaveText("Stage 1");

  const tutorial = page.locator("#tutorial-overlay");
  if (await tutorial.isVisible()) await tutorial.click();

  await page.evaluate(() => { window.__test_stageStartDelayMs = 2500; });

  // Stage 2への切り替えを要求（#screen-gameから離れないため#btn-debug-openが使える）
  await page.click("#btn-debug-open");
  await page.fill("#debug-stage-num", "2");
  await page.click("#btn-debug-jump");

  // 最初の要求(Stage 2)がまだテスト専用フックで足止めされている間に、
  // Stage 3への切り替えを重ねて要求する（画面遷移は一切しない）
  await page.click("#btn-debug-open");
  await page.fill("#debug-stage-num", "3");
  await page.click("#btn-debug-jump");

  // 最終的に反映されるのは最後に要求したStage 3であり、途中のStage 2ではない
  await expect(page.locator("#hud-stage")).toHaveText("Stage 3", { timeout: 5000 });
  await page.waitForTimeout(500);
  await expect(page.locator("#hud-stage")).toHaveText("Stage 3");
  await expect(page.locator("#screen-game")).toHaveClass(/active/);

  expect(errors).toEqual([]);
});

// 上の「reflects the latest request」テストは「画面遷移→開始要求」の順序
// （やめる→デバッグジャンプ）だったが、逆順「開始要求→画面遷移」（デバッグジャンプ→
// やめる）では別の欠落が残っていた（PR #361・11巡目、/code-review指摘）。
// runStageStart()が要求ごとにnavigationEpochを新たに取り直していたため、保留要求
// （Stage 3）が実際に実行される時点で改めてepochを取得すると、既に起きていた
// 「やめる」によるナビゲーションを「実行開始前からの既定値」として扱ってしまい
// 検知できず、結果的にタイトルへ戻ったはずなのにStage 3のゲーム画面へ引き戻されて
// しまっていた。要求が発行された瞬間のepochをStageStartQueueが保持し、それを
// 基準に比較するよう修正した恒久的な回帰テスト
test("a request queued before navigating away does not override the navigation once it finally runs", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto("/");
  await page.click("#screen-splash");
  await expect(page.locator("#screen-title")).toHaveClass(/active/);

  for (let i = 0; i < 7; i++) await page.click("#version-info");
  await expect(page.locator("#debug-panel")).not.toHaveClass(/hidden/);
  await page.click("#btn-debug-close");

  await page.click("#btn-stage-select");
  await page.locator(".stage-btn:not(.locked)").first().click();
  await expect(page.locator("#screen-game")).toHaveClass(/active/);
  await expect(page.locator("#hud-stage")).toHaveText("Stage 1");

  const tutorial = page.locator("#tutorial-overlay");
  if (await tutorial.isVisible()) await tutorial.click();

  // ensurePlayableBoard()直後の待機を人為的に2500ms引き延ばす
  await page.evaluate(() => { window.__test_stageStartDelayMs = 2500; });

  // リトライ(Stage 1)。直後のテスト専用フックで2500ms足止めされる
  await page.click("#btn-retry");
  await page.locator(".modal-btn-confirm").click();

  // 足止めされている間に、まずStage 3への開始要求を発行する（この時点では
  // まだ画面遷移していない）
  await page.click("#btn-debug-open");
  await page.fill("#debug-stage-num", "3");
  await page.click("#btn-debug-jump");

  // その後、Stage 3の要求より後に「やめる」でタイトルへ遷移する。ユーザーの
  // 最後の意思表示は「タイトルへ戻る」であり、その前に出したStage 3の要求が
  // 後から実行されても、タイトルへ戻った操作を上書きすべきではない
  await page.click("#btn-quit");
  await page.locator(".modal-btn-confirm").click();
  await expect(page.locator("#screen-title")).toHaveClass(/active/);

  // 引き延ばした待機が終わり、保留していたStage 3の要求が処理された後も、
  // タイトル画面のままであること（ゲーム画面へ引き戻されないこと）を確認する
  await page.waitForTimeout(3000);
  await expect(page.locator("#screen-title")).toHaveClass(/active/);

  expect(errors).toEqual([]);
});
