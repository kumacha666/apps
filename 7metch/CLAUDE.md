# 7metch (ナナメッチ) — 開発ガイド

## 開発ルール

リポジトリルートの `CLAUDE.md` の「AI開発ルール」セクションを必ず参照すること。
以下は本プロジェクト固有のルール:

- ゲームロジック（board.ts, game.ts, stages.ts）を変更する場合は、該当箇所のユニットテストを確認・更新してからコミットする
- 難易度パラメータ（stages.ts）を変更した場合は、シミュレーションテスト（`npm run sim`）で難易度カーブを確認する
- 新しいピース種・ミッション種を追加する場合は、下記「変更時チェックリスト」を遵守する
- `G.animating` を操作する場合は、必ず try/finally パターンを使う
- **重力の仕様（誤解注意）**: 岩（rock）・穴（hole）は、上にあるピースが**素通りして下まで落下する**のが正しい仕様（リリース済み挙動、`applyGravityData()`）。「ブロッカーが落下を堰き止める」挙動への変更はバグ修正ではなく仕様変更なので行わないこと（過去にバグと誤認して修正PRが作られた実績あり: PR #275）。この仕様は `board.test.ts` の applyGravityData テストで固定されている

## テスト

### ユニットテスト (`npm test`)

- **フレームワーク**: Vitest (vite.config.js で設定)
- **テストファイル**: `src/board.test.ts`, `src/game.test.ts`, `src/stages.test.ts`, `scripts/simulate.test.mjs`（`vite.config.js`の`test.exclude`が`e2e/**`のみのため、`scripts/`配下も`npm test`の対象に自動的に含まれる）
- **モック**: `src/__mocks__/` — audio, animations, rendering, vfx, tracking, ui を no-op に差し替え (DOM/Canvas/AudioContext 非依存化)
- **実行タイミング**: `npm run build` の prebuild で自動実行。テスト失敗時はビルドが中断される
- **対象**: board.ts (isMatchable, findAllMatches, damageIce, getComboType, tickCountdowns), game.ts (doMove, activateByTap, checkWinLose, updateHUD), stages.ts (getMissionText, buildStages, boardSizeForStage, isStageUnlocked)
- **前提**: ゲームロジックを変更した場合は必ずテストを追加・更新すること。特に isMatchable の判定条件を変えた場合はテストケースの追加が必須

### シミュレーションテスト (`npm run sim`)

- **スクリプト**: `scripts/simulate.mjs`
- **仕組み**: 描画なしでゲームロジックをヘッドレス実行。毎ターン有効な手からランダムに選択し、ステージごとの統計を収集する
- **収集指標**: クリア率、平均残り手数、平均スコア、平均消去数、詰み率、氷解除率、最大チェイン数
- **実行タイミング**: 任意。難易度調整やステージパラメータ変更後に実施する
- **オプション**:
  - `npm run sim` — デフォルト (主要18ステージ × 50回)
  - `npm run sim -- --stages 100-110` — ステージ範囲指定
  - `npm run sim -- --stages 100,200,300` — カンマ区切り
  - `npm run sim -- --runs 200` — 試行回数変更
  - `npm run sim -- --verbose` — 各ゲームの詳細出力
- **判定基準** (ランダムプレイ基準、人間はこれより大幅に上手い):
  - ✗ 極難: クリア率 5%未満
  - △ 難: クリア率 5-15%
  - ○ やや難: クリア率 15-30%
  - ◎: クリア率 30-80%
  - ○ 易: クリア率 80%超
  - ⚠詰: 詰み率 10%超
- **前提**: ランダムプレイの結果なので絶対値ではなく相対的なパターン (難易度カーブの滑らかさ、ステージ間の不連続) を重視する。全ステージで「✗ 極難」が出ないことが正常範囲の目安

### E2Eテスト (`npm run test:e2e`、2026-07-24整備)

- **フレームワーク**: Playwright（`e2e/screen-flow.spec.ts`, `playwright.config.ts`）。devサーバーは他アプリ（enblo:5183 / enblo-classic:5185 / combrawl:5189）と重複しないポート5187を使用
- `e2e/screen-flow.spec.ts`：splash→title→ステージ選択→ゲーム画面、title→あそびかた画面→title、という基本的な画面遷移の疎通確認。ユニットテスト・シミュレーションテストの代替ではない（実際のマッチ3ゲームプレイの検証は対象外）
- 7metchは本番ビルド時にindex.htmlを一切書き換えない構成（上記「ビルド・デプロイ」参照）のため、enblo/enblo-classic/combrawlのようなrestore/reset処理を伴うカスタム`scripts/build.mjs`は不要。`playwright.config.ts`の`webServer`が`npx vite --port 5187`を起動するだけで、`dev-entry-rewrite`プラグイン（`command === "serve"`限定）が自動的にsrc/main.tsを配信する
- **`npm run build`の`prebuild`に組み込み済み**：`npm test && node scripts/ensure-playwright-chromium.mjs && npm run test:e2e`の順で自動実行され、E2E失敗時はビルドが止まる。Playwrightのchromiumが見つからない環境では`ensure-playwright-chromium.mjs`が`npx playwright install chromium`で自動インストールしてから実行する（enblo/enblo-classic/combrawlと同じ方針：見つからない場合に黙ってスキップしてビルドを成功させると、視覚崩れ検知という目的を満たせなくなるため）
- Vitestが`e2e/*.spec.ts`をユニットテストとして誤検出しないよう、`vite.config.js`の`test.exclude`に`"e2e/**"`を指定済み（enblo/combrawlと同じ設定）
- 新しい画面・ボタンを追加した場合、既存のscreen-flowテストが壊れていないか確認する。マッチ3の実プレイ（swipe/tap操作）を検証するE2Eは現状無く、必要になれば別途追加を検討する

## ビルド・デプロイ

- `npm run build` — テスト → E2E → ビルド → ポインタイベントチェック
- `npm run deploy` — ビルド → dist/ コピー → SW バージョン自動更新（1コマンドで完結）
- deploy 後にコミットするだけで GitHub Pages にデプロイされる
- **重要**: Viteの本番ビルドentryは `vite.config.js` の `build.rollupOptions.input` で `src/main.ts` を直接指定している（2026-07-15修正）。root `index.html` は本番配信用に `./game.js`（ビルド成果物のコピー）を直接参照する静的HTMLとして維持し、本番ビルドではVite側で一切参照・加工しない。CSS（`style.css`）は `src/main.ts` 内の `import "../style.css"` でJSモジュールグラフに含めてバンドルし、`manifest.json` は `public/manifest.json` をソースとして`publicDir`経由でコピーする
  - `npm run dev` 時のみ、`dev-entry-rewrite`プラグイン（`transformIndexHtml`、`command === "serve"`限定）が root `index.html` の `./game.js` 参照を `./src/main.ts` に一時的に書き換えて、devサーバーがTypeScriptソースを直接配信できるようにしている。本番ビルドのentry検出には一切関与しない
  - `dist/` に `index.html` は生成されない（entryが `src/main.ts` のためVite標準のHTML出力対象外）ので `vite preview`（`npm run preview`）は使えない。本番相当の確認をしたい場合は `npm run deploy` 後、root直下を `npx serve .` 等の任意の静的サーバーで配信して確認する
  - `*.css` のside-effect importをTypeScriptに認識させるため `tsconfig.json` の `types` に `"vite/client"` を追加済み
  - **旧方式（廃止）**: 以前は `entry-rewrite` という独自プラグインで、本番ビルド時にも `index.html` の `<script src="./game.js">` を `transformIndexHtml` フックで `./src/main.ts` に書き換え、Viteにそれをentryとして検出させる方式だった。Vite 6.4系ではこの書き換えがRollupのentry検出に反映されず、`npm run build`/`npm run deploy`が成功表示のまま実際には`src/*.ts`の変更を一切バンドルせず、root直下の古い`game.js`をそのまま再パッケージするだけの状態になっていた（`dist/game.js`が`src`の変更に関わらずMD5ハッシュ完全一致になることで発覚。2026-07-15時点で`enblo`/`enblo-classic`/`combrawl`も同型の未検証のentry検出＝同じ症状を確認済み、別途修正予定）。`package-lock.json`は`.gitignore`対象でVersion固定されていないため、fresh installで再発しうる。ビルド後は必ず`dist/game.js`または本番同等の配信で対象の変更点（新規追加した文字列・要素ID等）が実際に含まれているかを確認すること（`grep`や実機/E2E確認、`Build check passed`の表示だけでは不十分）

## 難易度パラメータ (stages.js)

- **手数**: `max(14, 22 - tier)` + 氷ボーナス(+2, stage 100+) + CDボーナス(+1, stage 295+)
- **氷セル**: `1 + floor(progress * 3)` (最大4個、stage 100+)
- **岩セル**: `1 + floor(progress * 2)` (最大3個、stage 150+)
- **CDボム**: `1 + floor(progress * 1)` (最大2個、stage 300+)
- **ミッション倍率**:
  - クリア: `min(4.5, 2.5 + i * 0.01)` per move
  - スコア: `min(55, 30 + i * 0.2)` per move
  - 色消し: `min(0.8, 0.4 + i * 0.005)` per move
- パラメータを変更した場合はシミュレーションテストで難易度カーブを確認すること

## 最終ステージクリア時の演出（2026-08-10追加）

- `showResult()`（game.ts）は `G.currentStage === G.STAGES!.length - 1` で最終ステージクリアを判定し、通常の「クリア！」ではなく「🎉 全ステージ制覇！ 🎉」＋祝福メッセージを表示する（`isFinalStage`）。**2026-08-13のデバッグプレビュー機構リファクタ（下記オービットPhase 5節参照）で`G.STAGES`は起動後決して変更しない設計になったため、`G.STAGES!.length`は常に「本編の実ステージ数」を指す不変条件が成立する**（デバッグジャンプでStage 501〜524プレビューへジャンプしても、プレビューステージは別配列`G.debugPreviewStages`に積まれるだけで`G.STAGES`自体は伸びない。旧`G.baseStageCount`——起動時`G.STAGES.length`を別途スナップショットしていた値——はこのリファクタで完全に廃止済み）。`buildStages()` が返すステージ数自体を将来変更（501面以降の正式追加等）すれば、その時点の`G.STAGES!.length`がそのまま新しい最終ステージに追従する
- `track("stage_clear", ...)` に `all_stages_cleared` フィールドを追加済み
- 501面以降のコンテンツ拡張自体は別途の設計課題（本対応はエンディング演出のみのスコープ）

### 既知の課題（2026-07-24調査）

- **300面以降、CDボム（カウントダウン爆弾）の影響でミッション全般が大幅に簡単になる**：CDボムは`countdown`が0になると自動的に爆発し（設置時8〜12ターン）、この自動爆発だけで周囲を消去しスコア・消去数ミッションの進捗を稼ぐ。ミッション種を揃えてシミュレーションで比較すると、消去数ミッションは200〜299面平均クリア率11.3%→300〜399面平均84.3%、スコアミッションは22.7%→83.0%まで跳ね上がる（色消しは12.0%→32.6%とやや緩やか、色指定のため恩恵が小さい）。352/353面等のミッション難易度調査（350面以降special/chainのcountを`2`→`3`固定に修正、`buildStages()`参照）の過程で発覚した。**この「300面以降ずっと簡単」という傾向は350面のslotローテーション導入より前から存在する仕様**で、350〜499面の平均クリア率(約54%)はむしろ直前の300〜349面(約62%)より低い。CDボムの消去量を難易度パラメータとして考慮する設計変更は今のところ未着手。**上記の数値は旧シミュレーター（オービットPhase 4b-2b以前）による計測値**：実際のプレイ（`game.ts`の`doMove()`）ではCDボムと他の特殊ピースを隣接スワップすると、マッチを伴わずその場で即時起爆できる（`p1.special === "countdown" || p2.special === "countdown"`の分岐）が、当時の`scripts/simulate.mjs`の`findValidMoves()`はマッチが成立するスワップしか候補にしておらずこの手動起爆パスを反映していなかった。4b-2bで`findValidMoves()`を`hasAnyLegalMove()`と同じ「有効な1手」定義（タップ起動・スワップ起動系特殊ピースを含む）に揃えたため、CDボムと他の特殊ピースの隣接スワップも候補に含まれるようになった（`doMoveSync()`が本編の`doMove()`と同じ分岐で実行する）。この修正はシミュレーターの計測精度の改善であり、Stage 1〜500の実際の盤面生成・難易度自体は変更していない。上記の具体的なクリア率の数値を再計測する場合は、この変更を踏まえて`npm run sim`を再実行すること
- **350面以降、7つのミッションslot（`i % 7`、`i`は0始まり）のうちspecial/chainの4slot（slot1・2・5・6）はcountが完全に固定値（3）**。残る3slotのうちscore（slot3）・clear（slot4）も実質定数だが値は3ではない（Math.min上限に350面より前から到達済みのため）。color（slot0）は`colorIndex = i % colors`が周期的に変わるため定数ではない。special/chain（slot1/2/5/6）は他に変動要素が無いため、**同じslot・同じhole配置（`i % 5`）になる`lcm(5,7)=35`面ごとにステージ構成が完全に一致する**（例: 表示ステージ352・387・422・457・492面＝内部インデックス351・386・421・456・491は全てslot1のspecial、count3、hole variant `i%5=1`で共通、プレイ上区別がつかない。color系slot0は`colorIndex`が35面周期とズレるため厳密には対象外）。special/chainのcountをさらに大きくする対応を試したが、シミュレーションでcount=4以上は盤面のhole配置次第でクリア率が5%を割るステージが15〜20%程度の頻度で発生することが判明し、安全な固定値3に留めた（`POST_350_SPECIAL_CHAIN_COUNT`、apps#329参照）。350〜499面のコンテンツ多様化は別途の設計課題として残っている
- シミュレーション用の難易度カーブグラフ（1〜500面）を作成した実績あり。**サンプリング間隔は対象範囲のミッション判定周期と互いに素にすること**：350面より前は`i % 5 === 0`（色消し）・`i % 3 === 0`（スコア）の周期があるため3・5の倍数を避ける、350面以降は`i % 7`のslotローテーション周期があるため7の倍数も避ける。全区間を単一の間隔で調べる場合は3・5・7すべてと互いに素な値（11等）を使うか、slotごとの層化サンプリングにすること（5面おきサンプリングで色消しミッションだけを拾って区間の難易度を実態より高く見せてしまった実績、および7面おきサンプリングだと350面以降で同一slotばかり拾ってしまう問題を、いずれもレビューで指摘され修正した）

## 変更時チェックリスト

### 新しいピース種（SpecialType）を追加するとき

- [ ] `isMatchable()` に判定を追加（board.ts）
- [ ] `getComboType()` に正規化ルールを追加/除外（board.ts）
- [ ] `getMissionText()` に表示対応を追加（該当する場合）（stages.ts）
- [ ] `findHint()` のハイライト対象を更新（board.ts）
- [ ] `TAP_ACTIVATE_SPECIALS` への追加要否を確認（board.ts）
- [ ] ユニットテストを追加（最低: isMatchable, getComboType の該当ケース）
- [ ] シミュレーションテストで難易度カーブを確認

### 新しいミッション種（MissionType）を追加するとき

- [ ] `getMissionText()` に表示処理を追加（stages.ts）
- [ ] `checkWinLose()` に達成判定を追加（game.ts）
- [ ] `updateHUD()` に進捗表示を追加（game.ts）
- [ ] 進捗カウンターを `G` に追加し、適切な箇所でインクリメント
- [ ] ユニットテストを追加（getMissionText, 達成判定）
- [ ] シミュレーションテストで該当ミッションを含むステージの難易度確認

### G.animating を操作する関数を追加/変更するとき

- [ ] `G.animating = true` の後を必ず `try { ... } finally { G.animating = false; startHintTimer(); }` で囲む
- [ ] 関数内に `G.animating = false` が try/finally 外に散在していないことを確認

## 第1章「軌道系」（オービット、Stage 501〜、実装中）

**Stage 1〜500は一切変更しない。** 新ギミック「オービットセル」＋新クリア条件「パターン消し」はStage 501以降（`buildStages()`の内部インデックス500以降）にのみ適用し、ゲート無しでStage 500クリア後に地続きで始まる。コイン・星・実績等のセーブデータはそのまま引き継ぐ（既存のセーブ形式・キーを変更しない）。**例外**: `buildStages()`が生成するステージ定義（ミッション・手数・色数等のパラメータ）自体は変更しないが、Phase 4dで`createBoard()`の盤面品質チェックにバグ修正（下記PR #356の`countdownBombs`関連の項目）を入れており、これはStage 300〜500の**内部の盤面生成アルゴリズムの正しさ**を修正するものであって、ステージ定義や難易度設計を変更するものではない（`/code-review`指摘、2026-08-12）。

設計の詳細な経緯・レビュー記録は非公開の姉妹リポジトリ `ai-workspace/projects/7metch/GIMMICK_REDESIGN.md` にあり、本リポジトリ単独では参照できない。以下は本リポジトリだけで実装を継続できるように要点を落とし込んだもの。

### 用語・判定ロジック（`src/orbit.ts`、Phase 1で実装済み）

- **オービットセル**: 盤面上の固定セル。8方向のいずれか1つを「重力方向」として持つ（`OrbitCell.dir`、`types.ts`の`OrbitDirection`型で8方向以外は型エラーになる）
- **影響範囲**: オービットセルを中心としたチェビシェフ距離1以内（3x3、盤端で欠ける）。`inInfluenceArea()`で判定
- **進入判定（唯一の効果）**: 影響範囲に外から入ってくるスワップは、進入元→進入先の変位が重力方向と一致する場合のみ合法。範囲内部だけで完結するスワップ・範囲から出るだけのスワップは無制限。`isSwapLegal(r1,c1,r2,c2,orbits)`で判定し、**引数の順序に依存しない**（実体ベースで判定）
- **配置バリデーション**: オービット同士の影響範囲は重複も隣接も禁止し、最低1マスの間隔を空ける。隣接判定はチェビシェフ距離（斜め接触も隣接扱い）。`orbitsHaveRequiredGap()`で判定
- **進入元セル存在チェック**: 重力方向は、影響範囲の外側にあり1マス進むと範囲内に入る「進入元セル」が盤内に実在する方向からのみ選ぶ。`hasEntrySource()`で判定
- **特殊ピースとの関係**: 実際に起動が発生するスワップ（ダブルタップ直接起動、特殊ピース同士のコンボ、レインボー×他ピース）のみ進入判定の対象外。非起動の特殊×通常ピーススワップは通常のスワップと同じく進入判定を受ける
- 「合法手0件」判定・ヒント・自動シャッフル抑制・シミュレーターは、通常スワップ（`isSwapLegal()`ベース、特殊ピース起動を伴わない全スワップ）＋タップ起動＋スワップ起動系特殊ピースの3種類をすべて「有効な1手」として共有する。個別に実装すると判定がずれるため、必ず共有関数を経由すること

### 実装フェーズ（進捗チェックリスト）

- [x] **オービットPhase 1**: 判定ロジック＋ユニットテスト（`src/orbit.ts`, `src/orbit.test.ts`）。既存のゲームループには未配線 — PR #342
- [x] **オービットPhase 2**: パターン消し判定ロジック＋ユニットテスト（`src/patternClear.ts`, `src/patternClear.test.ts`）。パターン座標定義（外周/中央十字/対角線/四隅3x3）、進捗の累積判定、リカバリー処理・手動シャッフルアイテム由来の除去の除外、特殊ピース生成マスの計上（呼び出し側がclearedCellsに含めれば計上される設計）。**Phase 1と同じ方針で、既存のゲームループ・`GameState`には未配線**（`patternProgress`の`GameState`への追加・共通消去フックへの実配線はPhase 4で行う。当初この配線までPhase 2の完了条件としていたが、Phase 1と同じ「ロジック＋テストを先に固める」段階に統一するため、配線をPhase 4に切り出した）
- [x] **オービットPhase 3**: オービット配置レイアウトの生成ロジック＋ユニットテスト（`src/orbitStageGen.ts`, `src/orbitStageGen.test.ts`）。シード付き擬似乱数（`mulberry32`、ステージ番号相当のseedから決定的にレイアウトを導出、リトライガチャ防止）、一括生成→一括検証→NGなら全体を破棄して再抽選（上限100回）、事前検証済みの固定レイアウトへのフォールバック（`getFallbackOrbitLayout`、未整備の組み合わせは個数を減らさずエラーを投げる）、パイロットのステージパラメータ導出（`orbitCountForStage`: 章内相対Stage1-8/9-16/17-24で1/2/3個、`patternShapeForStage`: 4パターンを`% 4`でローテーション）。**Phase 1・2と同じ方針で、既存の`createBoard()`（実際のピース配置生成）には未配線**。「オービット制約適用後の合法手数が2〜10の範囲」という盤面品質チェックは、実際のボード生成ロジック（`board.ts`の`createBoard()`/`countAvailableMoves()`）と密結合するためPhase 4に含める（Phase 2で「配線込み」を完了条件にして指摘を受けた反省を踏まえ、最初から配線をPhase 4に明示的に切り出した）
- **オービットPhase 4**: `GameState`への統合・実配線。ここで初めてStage 501以降の実プレイに反映される。規模が大きいため複数PRに分割する（各ステップでStage 1〜500の既存138件超のテストが全件パスすることを確認しながら進める）。
  - [x] **4a. `isSwapLegal`を入力受付・ヒント（既存の通常スワップ候補のみ）に配線**: `doMove()`（プレイヤー起点のスワップ操作すべて。ドラッグ/スワイプ・タップ選択どちらも`doMove()`経由なのでここ1箇所で両方カバーされる）に進入判定ゲートを追加し、不正なスワップは`SFX.invalidSwap()`+`flashInvalid()`で無効フィードバックのみ返す（手数を消費しない）。`findHint()`が**既に**列挙している通常マッチ成立スワップの候補にも同じ判定を追加。実際に起動が発生するスワップ（特殊ピース同士のコンボ・レインボー起動）を判定する`isActivatingSwap()`を新設し、方向拘束の対象外として除外（`board.ts`の`isSwapLegalForCurrentStage()`/`isActivatingSwap()`、`game.ts`の`doMove()`）。`orbits: OrbitCell[]`を`StageConfig`に追加（Stage 1〜500は常に`[]`、`isSwapLegal`が無条件でtrueを返すため既存動作に一切影響しない。回帰テストで確認済み）。**注意**: `findHint()`はこの時点でもまだタップ起動・スワップ起動系特殊ピースを候補として列挙しておらず（既存の`findHint()`の元々の限界。オービット関与ではなくStage 1〜500にも当てはまりうる潜在ギャップ、`/code-review`指摘・2026-08-11）、「通常マッチ候補がオービットで全滅・かつタップ/スワップ起動系特殊ピースだけが有効」という盤面ではまだ`null`を返してしまう。これは4bで解消する
  - [x] **4b-1. 「有効な1手」共有列挙の基盤＋`findHint()`の完全化**: `findTapActivatableSpecialCell()`（タップ起動可能な特殊ピースを1つ探す）・`findActivatingSwapPair()`（スワップ起動系特殊ピース＝レインボー・特殊ピース同士のコンボの組を1つ探す）・`hasAnyLegalMove()`（通常スワップ〈オービット対応〉＋タップ起動＋スワップ起動系のいずれかが存在するかの高速判定）を`board.ts`に新設。`findHint()`が、通常マッチ成立スワップの候補（4aで対応済み）が無い場合にタップ起動・スワップ起動系特殊ピースもヒントとして提示するようにし、4aで積み残していた欠落（`/code-review`指摘）を解消した。15件のユニットテストを追加（判定ロジックを一時的に無効化して実際にテストが落ちることを確認済み）。**この`findHint()`フォールバックはオービット制約の有無を問わず全ステージ（Stage 1〜500含む）に適用される**（元々Codexが指摘した欠落は「タップ起動できる手があるのにヒントが出ない」という一般的なヒント機能のバグで、オービット固有ではなかったため）。「Stage 1〜500は一切変更しない」方針との関係は`/code-review`（2026-08-12、8並列）で指摘され、ユーザー判断で意図的に全ステージ適用のまま維持することを確認済み（ゲームロジック・クリア条件・難易度には影響せず、ヒントの親切さが増すのみのバグ修正として扱う）。同じ`/code-review`で「隣接ペア列挙ロジックが`countAvailableMoves()`/`findHint()`/`findActivatingSwapPair()`/`hasAnyLegalMove()`の4箇所で重複・微妙に形が異なる」との指摘が複数の観点から独立に上がったため、共有イテレータ`forEachAdjacentPlayablePair()`に一本化（挙動は不変、202件のテスト全件パス・`tsc --noEmit`クリーンで確認済み）
  - [x] **4b-2. 手動シャッフル・自動デッドロック回復（新規）**: `useShuffle()`にオービット下での品質基準（`shuffleWithQualityGate()`ベース、`hasAnyLegalMove()`＋即座マッチなしを満たす並べ替えを上限10回まで再試行、失敗時は盤面を変更せずアイテム使用そのものをキャンセル・コストも消費しない）を追加。**「自動デッドロック回復」は元々現在の実装に一切存在しなかった新規機能**（`countAvailableMoves()`は`createBoard()`の初期生成にしか使われておらず、プレイ中の再チェック・自動シャッフルの仕組みはStage 1〜500に無かった）。`game.ts`に共通の`finishTurn()`（`resolveBoard()`の全呼び出し箇所8箇所が経由する）を新設し、`G.STAGES[G.currentStage].orbits.length > 0`のときのみ`hasAnyLegalMove()`を再チェックし、falseなら`recoverFromDeadlock()`（並べ替え→ダメなら`regenerateBoardForDeadlock()`で盤面を作り直すフォールバック、既存の特殊ピースは失われるがプレイヤー操作を介さない自動処理のため許容）を実行する。**Stage 1〜500（orbits: []）はこの新設ロジックが一切呼ばれないため挙動・シミュレーション統計に影響しない**（回帰テストで確認済み）。`checkWinLose()`の戻り値を`void`から`boolean`（ステージが終了したか）に変更し、`finishTurn()`が終了時は回復チェックをスキップする根拠にしている。テスト: `board.test.ts`に`shuffleWithQualityGate`/`regenerateBoardForDeadlock`/`cloneBoard`、`game.test.ts`に`finishTurn`/`useShuffle`/`checkWinLose`の戻り値の各テストケースを追加（Math.randomを固定してFisher-Yatesの結果を決定的に検証するケースを含む）
  - [x] **4b-2b. シミュレーターへの配線**: `scripts/simulate.mjs`の`findValidMoves()`を、共有の「有効な1手」定義（タップ起動可能な特殊ピース・スワップ起動系特殊ピース〈オービットの方向拘束を無視〉・オービット制約適用後にマッチが成立する通常スワップ）に揃えた（board.tsの`hasAnyLegalMove()`と同じ`isSwapBlockedByOrbit`/`isActivatingSwap`/`TAP_ACTIVATE_SPECIALS`を直接importして使用、判定ロジック自体の二重実装は無い）。実際に手を実行する側も、`game.ts`の`activateByTap()`/`doMove()`（コンボ判定・カウントダウン連動・レインボー起動・通常マッチの全分岐）をアニメーション・SFX・track無しで同期移植した`tapActivateSync()`/`doMoveSync()`（内部で`activateComboSync()`も移植）を新設し、実際にコンボ・レインボー・タップ起動を盤面に反映するようにした。合法手0件を検出した時点で即座に詰み扱いにせず、`finishTurn()`と同じ回復フロー（`shuffleWithQualityGate()`→ダメなら`regenerateBoardForDeadlock()`→それでもダメならもう一度`shuffleWithQualityGate()`、を`recoverFromDeadlockSync()`として移植）を試し、回復できればそのまま続行、できなければ初めて「詰み」として終了する（`playGame()`に新設、`runOneGame()`から分離してテストから直接呼べるようにした）。**この変更はStage 1〜500の実際の盤面生成・難易度自体には影響しない**（`orbits: []`のステージでは回復フローが一切呼ばれず、旧実装と同じく合法手0件で即詰み終了。回帰テストで確認済み）。**一方、タップ起動・スワップ起動系特殊ピースの実行が新たにシミュレーターに追加されたため、Stage 1〜500を含む全ステージの計測統計（クリア率等）は変わりうる**（CDボムと他の特殊ピースの隣接スワップ等、従来シミュレーターが候補にしていなかった手が新たに選択されるようになったため。「既知の課題」セクションの該当記述を更新済み）。テスト: `scripts/simulate.test.mjs`を新設（`findValidMoves`/`tapActivateSync`/`doMoveSync`/`recoverFromDeadlockSync`/`playGame`、14件。判定ロジックを一時的に無効化して実際にテストが落ちることを確認済み）。テスト側からimportした際にCLI本体（`runSimulation()`）が実行されないよう、`process.env.VITEST`でガードした（vitestが自動設定する環境変数）。**PR #354の`/code-review`（2026-08-12）を受けて追加修正**：①`playGame()`が`recoverFromDeadlockSync()`の戻り値だけで詰み判定していたのを、戻り値に関わらず常に`checkMissionComplete()`/`hasAnyLegalMove()`で実際の状態を再判定する方式に修正（回復内部の最後の`resolveMatchesSync()`がミッション達成や合法手発生を引き起こしても見逃さないように）。②独自の`activateComboSync()`（手動コピー）を廃止し、`game.ts`の`activateCombo()`（既にexport済み・純粋関数）を直接importして使うよう変更、重複コードとその分岐のテスト未網羅リスクを解消（`game.test.ts`に7種のコンボタイプ全てを直接検証する`describe("activateCombo")`を追加）。③`findValidMoves()`の隣接ペア列挙を、独自の8方向ループから`board.ts`の共有イテレータ`forEachAdjacentPlayablePair()`（新規export）経由に統一。④`tapActivateSync`/`doMoveSync`の3分岐に重複していた「クリア確定処理」6行を`finalizeClears()`ヘルパーに集約。⑤カウントダウンボム+特殊ピースの独立起動分岐（従来テスト未カバー）のテストを追加（重力補充後のカスケードがMath.random依存で非決定的なため、`activateSpecial()`の呼び出し引数を`vi.spyOn`で直接検証する方式を採用）
  - [x] **4c. `patternProgress`の配線**: `GameState`に`patternProgress: Set<string>`を追加（`state.ts`で初期化、`ui.ts`の`startStage()`でステージ開始時にリセット）。`Mission`型に`"pattern"`（`patternShape: PatternShape`を伴う）を追加し、`checkWinLose()`/`updateHUD()`/`stages.ts`の`getMissionText()`のswitchに`case "pattern"`を追加（いずれも`default: { const _exhaustive: never = m.type; ... }`で網羅性チェック済み。AI開発ルール4「型システムをAIへのチェックリストとして活用」）。`game.ts`の`trackClears()`に、消去の発生原因を表す`cause: ClearCause | ExcludedClearCause`引数を追加し、`patternClear.ts`の`recordClear()`へ橋渡しする（対象セルは`patternTargetCells()`ヘルパーがステージのmissionから都度導出、`"pattern"`ミッションでなければ何もしない）。既存の7箇所の`trackClears()`呼び出し全てに、呼び出し文脈に応じた正しいcauseを指定（`activateByTap`/`doMove`のコンボ・カウントダウン・レインボー分岐/`handleCountdownExplosions`は`"special_activate"`、`resolveMatches()`のメイン消去は`"match"`、`usePinpoint`/`useColorBomb`は`"item"`）。`resolveMatches()`自体は`cause`引数（デフォルト`"match"`）を追加してこれを`trackClears`へ伝播し、`recoverFromDeadlock()`内部の呼び出しだけ`"recovery_shuffle"`を明示的に渡すことで、詰み回復由来の未解決マッチ解決がパターン進捗に計上されないようにした（`isCountedCause()`により計上対象外、パターン進捗の計上/除外ロジック自体は既存の`patternClear.test.ts`で検証済み）。テスト: `game.test.ts`に`checkWinLose`/`updateHUD`のpatternミッションケース、および新設した`describe("パターン進捗の計上 (patternProgress)")`で`doMove`/`activateByTap`/`usePinpoint`/`resolveMatches`（デフォルト・`"recovery_shuffle"`明示指定の両方）の計7ケースを追加、`stages.test.ts`に`getMissionText`の4形状ケースを追加。全ケースをサボタージュ検証済み（causeを固定値に差し替えて実際にテストが落ちることを確認）。**既知の残存ギャップ**: `recoverFromDeadlock()`内部での`resolveMatches("recovery_shuffle")`呼び出し自体（1行の変更）は目視確認のみで、自動テストでは直接カバーしていない — 詰み回復フローが`Math.random()`依存の`shuffleWithQualityGate()`/`regenerateBoardForDeadlock()`を経由するため、「回復処理の結果として実際にマッチが残る」状況を決定的に再現するテストが組みづらい（PR #354のカウントダウンボムテストで直面したのと同種の非決定性）。`resolveMatches()`自体のcause引数の配線は直接呼び出しで決定的に検証済みなので、リスクは限定的と判断した。また、`scripts/simulate.mjs`側（`checkMissionComplete()`/`trackClears()`）は今回`"pattern"`ミッションに未対応のまま（Stage 501以降はPhase 4eまで`buildStages()`に追加されないため実害無し）。Phase 4eでStage 501〜524を追加する際、シミュレーターにも同様の対応が必要になる点を忘れないこと

**PR #355の`/code-review`（Codex、2026-08-12）を受けて追加修正**：①`Mission`型をフラットなinterface（全フィールド任意）から判別可能なunion（typeごとに必須フィールドが異なる）に変更し、`"pattern"`ミッションで`patternShape`の設定を忘れてもコンパイルが通ってしまう抜け穴を型で塞いだ（`checkWinLose()`/`updateHUD()`/`getMissionText()`のexhaustive checkも、narrowingの効果を正しく検出できるよう`const _exhaustive: never = m.type`から`const _exhaustive: never = m`に修正。前者は各caseで`m`自体が`never`まで絞り込まれた後に`.type`へアクセスしてしまい、`never`上のプロパティアクセスとして型エラーになる）。②`showResult()`が手数切れ失敗時に呼ぶ`getFailureProgress()`に`"pattern"`のcaseが丸ごと欠けており、パターンミッションで手数切れになると結果画面の残り進捗表示が空文字になっていた欠落を修正（この関数はどのミッション種についても元々テストが無かったため、修正と同時に全6種のテストを新設）。③シャッフルアイテム経由の`tickCountdowns()`によるカウントダウン自動爆発を`"special_activate"`として計上している点について「`manual_shuffle`除外の趣旨に反するのでは」との指摘を受けたが、検証の結果**意図した挙動として維持**することにした：`useShuffle()`は手数を消費せず（コインのみ消費）、それでも`resolveBoard()`経由で`tickCountdowns()`が呼ばれる（＝シャッフル連打でカウントダウンボムを手数を使わず起爆できる）のはPhase 4c以前から存在する挙動で、score/clear/color/specialの全ミッション種も既に同じ理由でシャッフル起因の爆発を計上している。パターンミッションだけ除外すると他のミッション種との一貫性が崩れるため、除外はしない（この「シャッフル連打でカウントダウンを消費できる」仕組み自体の是非は本PRのスコープ外の設計判断）
  - [x] **4d. `createBoard()`/`countAvailableMoves()`の盤面品質チェック統合**: `countAvailableMoves()`に、`hasAnyLegalMove()`/`findHint()`と同じ`isSwapBlockedByOrbit()`によるオービット拒否チェックを追加した。`createBoard()`自身はminMoves(2)/maxMoves(`max(10, floor(rows*cols*0.15))`)の判定を`countAvailableMoves()`に委譲しているだけなので、**この一箇所の変更だけで`createBoard()`のオービット対応が完結する**（`createBoard()`自体にコード変更は無い）。パイロットの固定7x8盤面では`maxMoves=max(10, floor(56*0.15))=10`となり、GIMMICK_REDESIGN.mdの「オービット制約適用後の合法手数が2〜10の範囲」と数値が一致する。**Stage 1〜500（orbits: []）は`isSwapBlockedByOrbit()`が常にfalseを返すため挙動不変**（回帰テストで確認済み）。`regenerateBoardForDeadlock()`（詰み回復の盤面作り直しフォールバック）は`countAvailableMoves()`ではなく既存の`hasAnyLegalMove()`（既にオービット対応済み、Phase 4b-1）を品質基準に使っており、本来「合法手が1つ以上あればよい」という緩い基準（2〜10の範囲までは要求しない、GIMMICK_REDESIGN.md参照）のため対応不要だった。テスト: `board.test.ts`に`countAvailableMoves`（doMoveのオービットテストと同じ座標関係を使い、進入方向の一致/不一致で合法手カウントが1↔0に変わることを確認、判定用の一時スワップが必ず元に戻ることの確認を含め計4件）と`createBoard`（オービット有無それぞれで生成直後に即座マッチ・2x2スクエアが残らないことを確認する統合テスト2件）を新設。オービット拒否チェックを一時的に外して実際にテストが落ちることをサボタージュ検証済み。`npm run sim`（代表ステージ）で難易度カーブに異常が無いことも確認

**PR #356の`/code-review`（Codex、2026-08-12）を受けて追加修正**：カウントダウンボム配置（`countdownBombs > 0`、Stage 300〜500に既存）が品質チェックの**後**に行われていたため、`isMatchable()`がspecial:"countdown"のセルをマッチ対象から除外する仕様と組み合わさって、判定時には数えられていた合法手をボム配置が事後的に塞いでしまい、最終盤面が実際にはminMoves/maxMovesの範囲を満たさなくなりうる欠落を指摘された（**オービット固有ではなく、countdownBombsを持つStage 300〜500に元々存在していた欠落**。本PRの「2〜10の範囲を保証する」という主張が、これを新たに顕在化させた形）。`placeCountdownBombs()`をcreateBoard()の品質チェックループの**内側**（`fillBoardUntilStable()`の直後、`countAvailableMoves()`の直前）に移動し、判定と実際の最終盤面を常に一致させるよう修正。テスト: `board.test.ts`に`placeCountdownBombs`（唯一の合法手を作っているセルへボムを狙って配置すると合法手数が0になることを、`Math.random()`を2回分モックして決定的に検証。ボムは「スワップ元」ではなく「スワップでマッチ判定対象セルへ移動する側」に置かないと意味が無い点に注意）、`createBoard`（1x8の1行盤面で独立した2つの合法手を用意し、片方をボムで潰すシナリオを`Math.random()`の呼び出し回数で検証：旧実装なら1回目の試行の生成8回+ボム配置3回=ちょうど11回で完了してしまう〈品質チェック時点ではボム未配置のため合法手2件で即採用〉のに対し、新実装は11回目の判定でボム込みの合法手が1件に落ちたことを検知して2回目の試行に進むため11回を超える）を追加。いずれも一時的に旧実装（ボム配置をループ外＝チェックの後に戻す）へ差し替えて実際にテストが落ちることをサボタージュ検証済み。`npm run sim`をcountdownBombsを持つStage 300〜500の範囲（301〜497、11ステージ）で再実行し、詰み率・クリア率に異常が無いことを確認

上記修正で`placeCountdownBombs()`が品質チェックループの内側に移動した結果、`countAvailableMoves()`が「隣接する2個のカウントダウンボム」を含む盤面を初めて見る可能性が生じたことに対する**2回目の追加指摘**も反映：`isMatchable()`によりカウントダウンボムはマッチに参加できないが、`hasAnyLegalMove()`/`doMove()`の定義では隣接する2個の特殊ピース同士のスワップは`isActivatingSwap()`によりマッチ成立を伴わずとも「有効な1手」として扱われる。`countAvailableMoves()`は`findAllMatches()`ベースの判定しか持たず、このボム同士のペアを合法手として数えていなかったため、maxMoves上限（10）を実際には超える盤面を「範囲内」として誤って採用しうる欠落があった。`countAvailableMoves()`の各ペア判定に`isActivatingSwap()`チェックを追加し、該当ペアもカウントするよう修正（`hasAnyLegalMove()`と同じ「有効な1手」の定義に揃える）。テスト: `board.test.ts`に、2x2盤面（`MATCH_MIN=3`のためどのスワップをしても通常マッチは原理的に成立しない）で隣接する2個のカウントダウンボムだけが合法手としてカウントされることを検証するケースを追加。一時的にこの分岐を外して実際にテストが落ちることをサボタージュ検証済み。`npm run sim`をcountdownBombsを持つStage 300〜500の範囲で再実行し、異常が無いことを再確認

**7並列`/code-review`（2026-08-12）で追加検出・意図的に見送った2件**（いずれも現時点では到達不能なコードパスで、無理に対応すると検証できない変更になるため見送り。将来Phase 4eでオービットステージの生成を配線する際に再検討すること）：
- `countAvailableMoves()`は`findTapActivatableSpecialCell()`相当のタップ起動系ピース（bomb/line_h/line_v/line_d）を判定しない。`createBoard()`が生成した直後の盤面には`placeCountdownBombs()`由来の`"countdown"`（タップ起動不可）以外の特殊ピースは存在しないため現状は問題ないが、この不変条件はコード上で強制されておらずコメントのみに依存している。将来`createBoard()`側でタップ起動系ピースを生成する変更が入った場合、`countAvailableMoves()`が黙って過小カウントする恐れがある
- `regenerateBoardForDeadlock()`（詰み回復の盤面作り直しフォールバック）は`placeCountdownBombs()`を呼ばない。`orbits.length > 0`のステージでのみ呼ばれるが、現状`orbits`を持つステージ（Stage 501〜、未配線）と`countdownBombs`を持つステージ（Stage 300〜500）は重複しないため到達不能。**Phase 4eでパイロット（Stage 501〜524）は`countdownBombs: 0`固定にすることを人間と相談の上で決定した**（下記4e参照）ため、この重複は当面発生しない。将来オービットステージにCDボムを組み合わせる設計にする場合は、`createBoard()`と同様に`placeCountdownBombs()`の配線が必要になる点を忘れないこと
  - [x] **4e. ステージ生成フローへの配線**: `boardSizeForStage()`に`500 <= i < 524`の分岐（固定7x8、Stage 525以降は別途人間が判断として`i<500`と同じ9x10のプレースホルダのまま）を追加。`generateOrbitLayout()`・`orbitCountForStage()`・`patternShapeForStage()`を使って第1章パイロット（Stage 501〜524、章内相対インデックス0〜23）の`StageConfig`一覧を生成する`buildOrbitPilotStages()`を`stages.ts`に新設した。**パラメータ設計は人間と相談の上で決定**（2026-08-12）：手数・色数はStage 1〜500の計算式（`movesAndColorsForStage()`として共通ヘルパーに切り出し、`buildStages()`もこれを使うようリファクタ。tierが頭打ちのため全パイロットステージでmoves=17・colors=8固定）をそのまま継続する一方、**氷・岩・カウントダウンボム・穴は一切付けない**（`iceCells`/`rockCells`/`countdownBombs`は常に0、`holePattern`は常に`null`）。理由は、オービット×パターン消しという新ギミック単体の完成度を先に固めるため（既存ギミックとの組み合わせは相互作用未検証で、「1PRに複数の大きな変更を詰め込まない」というAI開発ルールにも反する）。オービットのレイアウト生成seedには章内相対インデックス（0〜23）をそのまま使用（Phase 3のテストで seed 0〜299・count1〜3の全組み合わせがフォールバックに陥らないことを検証済みの範囲に収まるため）。**`buildOrbitPilotStages()`はまだ`buildStages()`から呼ばれていない**（Phase 4e単体のスコープは生成関数の実装・テストまでで、`buildStages()`が返すステージ数は引き続き500のまま。Stage 501〜524を実際に公開するタイミングは下記「Stage 501〜524の実公開タイミング」の決定通り、Phase 5・6完成後にまとめて行う）。テスト: `stages.test.ts`に`boardSizeForStage`のパイロット範囲分岐、`buildOrbitPilotStages`（24ステージ生成・ステージ名・盤面サイズ・氷岩CDボム穴の不在・patternミッションのローテーション・オービット個数のtier・オービット配置の妥当性〈進入元セル・間隔条件〉・moves/colors継続・star2/3moves・決定性・`buildStages()`への非干渉、計13件）を新設。盤面サイズ分岐・ミッション/オービット個数/ギミック除外の各配線をそれぞれ一時的に壊して実際にテストが落ちることをサボタージュ検証済み。`npm run sim`（代表ステージ）でStage 1〜500への影響が無いことも確認
- [x] **オービットPhase 5**: 描画（オービットの見た目・パターン消しの盤面オーバーレイ）。`rendering.ts`に`drawOrbitInfluenceZone()`（影響範囲3x3の外周のみを縁取る境界線。セル1つずつ隣接4方向を見て、影響範囲外〈盤外含む〉に接する辺だけを描画することで内部のマス目線は引かない）・`drawOrbitArrow()`（重力方向を示す半透明の矢印、ピースを完全に隠さないサイズ）・`drawPatternCellOverlay()`（パターン消し対象セルの達成状態オーバーレイ、未達成=黄色破線／達成済み=緑実線、常時表示）を追加。`drawBoard()`から`G.STAGES[G.currentStage].orbits.length > 0`／`mission.type === "pattern"`のときだけ呼び出すガード付きで配線（Stage 1〜500は`orbits: []`・`"pattern"`ミッション無しのため常にfalseで、既存の見た目に一切影響しない）。ジオメトリ判定は既存のテスト済みロジック（`orbit.ts`の`inInfluenceArea()`、`patternClear.ts`の`getPatternCells()`/`cellKey()`）をそのまま再利用し、rendering.ts側は「どう描くか」だけを持つ。
  - **`rendering.ts`は7metch内の既存の慣例（リポジトリ共通のルールではない）によりユニットテスト対象外**（`rendering.test.ts`は存在せず、他の全テストファイルで`__mocks__/rendering.ts`によりno-op化されている。他アプリのCLAUDE.mdにはこれと同じ「rendering.ts除外」規約は存在せず、あくまで7metch単体の既存踏襲——`/code-review`指摘、2026-08-12）。今回も新規ユニットテストは追加していない（既存の慣例通り）。境界チェック等の純粋ロジックが新たに増えた場合は、AI開発ルール1に沿って`rendering.ts`から切り出してテストする（本PRでは`neighborInInfluenceArea()`の盤外判定を`board.ts`の既存テスト済み`inBounds()`に委譲する形で対応した）
  - **視覚確認**: Stage 501以降は`buildStages()`未配線のため通常プレイでは到達不能。デバッグパネルのステージジャンプ（`ui.ts`の`btn-debug-jump`ハンドラ）に、要求ステージが現在の`G.STAGES`長を超えかつ524以下の場合のみ`buildOrbitPilotStages()`を遅延生成する分岐を追加し、デバッグ専用の到達経路を確保した（Stage 501〜524が正式に`buildStages()`へ追加されたら自然に使われなくなる、自己陳腐化する仕組み。**2026-08-13のデバッグプレビュー機構リファクタ以降、生成結果は`G.STAGES`へ追記せず別配列`G.debugPreviewStages`に積む設計になっている。詳細は本節末尾の「altitude角度の指摘を受けた設計変更」参照**）。この経路でPlaywright（`chromium-cli`相当、`@playwright/test`の`chromium`を直接起動）を使い実際にdevサーバーを起動してブラウザを操作し、スプラッシュ→タイトル→`version-info`7タップ→デバッグパネル→Stage 501/517/524（オービット1個/3個/3個）にジャンプしてスクリーンショットを取得・目視確認した。矢印が正しい重力方向を向いていること、3x3境界線が盤端で正しくクリップされること、複数オービットの境界線・矢印が重なっても崩れないこと、パターン消しの破線オーバーレイがオービット境界線と共存しても視覚的に破綻しないこと、コンソールに例外が出ていないことを確認済み
  - **`e2e/screen-flow.spec.ts`への追加は見送った**: 既存のE2Eはスクリーン遷移（DOMのactiveクラス）のみを検証するスモークテストで、canvas内の描画ピクセルは元々検証対象外（rendering.ts全般がユニットテスト対象外なのと同じ理由）。加えてStage 501〜524はデバッグジャンプ経由でしか到達できず、通常のステージ選択フロー（既存E2Eの`.stage-btn:not(.locked)`クリック）では到達しないため、恒久的なE2Eに組み込むと「デバッグ専用機能をテストするテスト」になってしまう。上記の使い捨てPlaywrightスクリプトによる目視確認で代替した
  - **PR #358へのCodexレビュー（3件、いずれもP2）を受けて追加修正**（2026-08-12）:
    1. `inInfluenceArea()`はチェビシェフ距離のみで判定し盤サイズを考慮しないため、盤端のオービットでは盤外座標が名目上「範囲内」と誤判定され、影響範囲3x3の外周線が盤端で欠けていた。`rendering.ts`に盤外を無条件で「範囲外」扱いする`neighborInInfluenceArea()`を追加し、`drawOrbitInfluenceZone()`はこちらを使うよう修正（`orbit.ts`の`inInfluenceArea()`自体は進入判定など他の用途でも使われる共有ロジックのため変更せず、描画側だけで盤端を考慮した）
    2. 新レイヤー（影響範囲境界線・矢印・パターン枠）は`drawBoard()`にしか配線しておらず、`animations.ts`の`animateSwap()`/`animateDrop()`は毎フレーム`drawBoardBase()`を直接呼んでピースを独自描画するため、スワップ中・落下中はこれらのレイヤーが消え、アニメ終了時に再表示される見た目のちらつきがあった。`rendering.ts`に`drawOrbitInfluenceZones()`/`drawOrbitArrows()`/`drawPatternCellOverlays()`（`drawBoard()`のガード条件をそのまま関数化した薄いラッパー）を追加し、`drawBoard()`・`animateSwap()`・`animateDrop()`の3箇所すべてから同じ順序（`drawBoardBase()`→影響範囲境界線→パターン枠→ピース→矢印）で呼ぶよう統一した
    3. パターン消しの達成済みセルの緑枠と、通常ピース選択時の白い選択枠が同じ矩形・線幅で描かれており、`drawBoard()`内でパターン枠がピースループ（選択枠を含む）より後に描かれていたため、達成済みセルにあるピースを選択すると選択枠が完全に上書きされ見えなくなっていた。パターン枠をピースループより前（影響範囲境界線の直後）に描く順序へ変更し、選択枠が常に最前面に来るようにした
    - 対応後、`tsc --noEmit`・`npm test`（280件）・`npm run deploy`（Vitest→Playwright E2E→ビルド→ビルドチェック→SWバージョン更新）が通ることを再確認。視覚確認は上記と同じ使い捨てPlaywrightスクリプトでStage 501の盤端オービット（左端の影響範囲境界線が閉じて描画されることを確認、修正前は左辺が欠けていた）を再スクリーンショットで確認。アニメ中のレイヤー消失・パターン枠と選択枠の重なりについては、`animateSwap()`/`animateDrop()`側の呼び出し順序を`drawBoard()`と完全に同一パターンにする機械的な変更（既存の検証済みヘルパー関数をそのまま再利用するだけ）であり、かつ実際のゲーム内操作でスワップアニメ中の一瞬〈約160ms〉のフレームを狙ってスクリーンショットするのはツール制約上再現性が低かったため、コードレベルの描画順序確認（このヘルパーが`drawBoard()`と全く同じ関数・同じ順序で呼ばれていることの目視コードレビュー）で代替した
  - **`/code-review`（人間が実行）を受けた追加修正**（2026-08-12）: デバッグジャンプ（`ui.ts`の`btn-debug-jump`ハンドラ）が`G.STAGES!.push(...buildOrbitPilotStages())`で共有配列`G.STAGES`を**セッション中永続的に**伸ばすため、7タップでデバッグモードを開けるのは本番ビルドでも同じ（開発者専用ビルドではない）ことから、一度でもStage 501〜524へジャンプすると以後のセッション全体で「本編ステージ数」を`G.STAGES!.length`から求めていた箇所が軒並み壊れる指摘（`isFinalStageClear()`・全ステージ制覇メッセージ・nextボタン表示）。調査の結果、指摘された箇所に加えて`buildStageSelect()`のステージ一覧ループ（`ui.ts`、パイロットステージがロック済みタイルとしてステージ選択に混入しうる）とタイトル画面の「つづきから」ステージ計算（`ui.ts`、本編制覇後にcontinueが誤ってStage 501へ飛ぶ）も同種の欠落があることが分かった。`G.baseStageCount`（起動時`G.STAGES.length`をmain.tsで一度だけ記録、以後不変）を新設し、本編プレイヤー向けの境界判定5箇所（`game.ts`の`isFinalStageClear()`・全ステージ制覇メッセージ・nextボタン表示、`ui.ts`のステージ選択ループ・つづきから計算・nextボタンハンドラの境界チェック）を`G.STAGES!.length`から`G.baseStageCount`へ置き換え。デバッグジャンプ自身の範囲チェックとデバッグ専用の全解放ボタンは意図的に`G.STAGES!.length`のまま（パイロットステージも含めて操作したいデバッグ機能のため）。回帰テストを`game.test.ts`に2件追加（`G.STAGES`が`baseStageCount`より長い状態でも本編最終ステージの制覇判定・nextボタン表示が正しいことを検証）し、`isFinalStageClear()`等を旧実装に戻すサボタージュ検証で実際にテストが落ちることを確認済み
  - **Codexレビュー（commit 7cdd9ee、2件）を受けた追加修正**（2026-08-12）:
    1. **盤面ガイドをピースより後に描画する**: `drawOrbitInfluenceZones()`/`drawPatternCellOverlays()`がピース描画ループより前に呼ばれていたため、土星のリングなどセル境界まで広がる描画がガイドを上書きし、常時表示すべき境界線・パターン枠が部分的に欠けていた。`drawBoard()`を「ピース+氷オーバーレイの描画」→「盤面ガイド（影響範囲境界線・パターン枠）」→「選択枠」→「矢印」の順に並べ替え、選択枠は新設の`drawSelectionOutline()`ヘルパーに切り出した（元はピースループ内に埋め込まれていたが、ガイドより後・ピースループとは独立に描く必要があったため）。`animateSwap()`/`animateDrop()`も同じ並び順（ピース→ガイド→矢印）に揃えた
    2. **プレビュー面のクリア履歴を通常進行から除外する**: デバッグジャンプでStage 501〜524（プレビュー）をクリアすると`G.saveData.cleared`に`baseStageCount`以上のキーが永続保存されるが、`buildStageSelect()`の`lastClearedIdx`計算と、タイトル画面「つづきから」（`btn-start`ハンドラ）の`next`計算がどちらも全キーの最大値を無条件に使っていたため、一度でもプレビュー面をクリアすると本編のゲート停止条件・表示範囲・つづきから遷移先がすべて壊れる（本編の実際の進捗に関わらず、ステージ選択に大量のロック済みタイルが表示されたり、つづきからが常に本編最終ステージへ飛んだりする）。この2箇所は同じ計算をほぼ複製していたため、`stages.ts`に共有ヘルパー`lastClearedRealStageIdx()`（`G.saveData.cleared`のキーを`G.baseStageCount`未満に絞ってから最大値を取る）を新設し、両方から呼ぶよう統一（`getTotalStars()`/`isStageUnlocked()`/`getGateFor()`と同じく、`stages.ts`に置くことで`ui.ts`から切り離してユニットテスト可能にした。`ui.ts`自体はDOM操作中心でユニットテスト対象外という7metchの既存踏襲（リポジトリ共通のルールではない、他アプリのCLAUDE.mdに同名の規約は存在しない——`/code-review`指摘、2026-08-12）だが、DOM操作を理由に一律除外するのではなく、AI開発ルール1の「UI描画と切り離せる部分は関数として切り出し、必ずテストする」に沿って、この判定ロジック自体は`stages.ts`側の純粋関数として切り出した上でテストしている）
    - `stages.test.ts`に`lastClearedRealStageIdx`のテストを4件追加（クリア無し/本編クリア/プレビュー面混在/プレビュー面のみ、の各ケース）し、フィルタを外すサボタージュ検証で実際にテストが落ちることを確認済み。`tsc --noEmit`・`npm test`（286件）・`npm run deploy`が通ることを再確認。視覚確認は使い捨てPlaywrightスクリプトでStage 501の土星リングが境界線を上書きしないこと、選択枠がパターン枠・ガイドの上に正しく表示されることをスクリーンショットで確認済み
  - **Codexレビュー（commit ae606ad、追加1件）を受けた追加修正**（2026-08-12）: `lastClearedRealStageIdx()`で`cleared`は本編範囲に絞ったが、`getTotalStars()`は`G.saveData.bestStars`の全キーを合算したままだった。`finishTurn()`（`game.ts`）のクリア処理はステージ番号に関わらず`bestStars[G.currentStage]`へ無条件で星を書き込むため、デバッグジャンプでStage 501〜524（プレビュー、本番ビルドでも7タップで開けるため実プレイヤーでも起こりうる）をクリアすると、プレビュー24面分（最大72個）の星がスターゲート判定（`isStageUnlocked()`）・ステージ選択画面の合計表示に混入し、本編のスターゲートを本来より早く解除できてしまう欠落だった。`getTotalStars()`を`lastClearedRealStageIdx()`と同じ`G.baseStageCount`未満フィルタを適用するよう修正。`stages.test.ts`に回帰テスト2件（プレビュー面の星が合計に含まれないこと・プレビュー面の星だけでは本編ゲートを解除できないこと）を追加し、フィルタを外すサボタージュ検証で実際にテストが落ちることを確認済み（既存の`isStageUnlocked`テストスイートが`G.baseStageCount`を設定していなかったため、`beforeEach`にも追加）。`tsc --noEmit`・`npm test`（288件）・`npm run deploy`が通ることを再確認
  - **`/code-review`（人間実行、5並列: line-by-line・removed-behavior・cross-file tracer・reuse・conventions）を受けた追加修正**（2026-08-12）:
    1. **Nextボタンがデバッグプレビュー面内で進行不能になっていた**: `G.baseStageCount`への一律置き換え（前々回の修正）で、`isFinalStageClear()`等の本編境界判定は正しくなった一方、副作用として`showResult()`のNextボタン表示（`game.ts`）と`btn-next`ハンドラの境界チェック（`ui.ts`）もどちらも`G.baseStageCount`を使うようになり、Stage 501〜524（デバッグプレビュー）内でクリアするたびNextボタンが常に非表示・押しても強制的にステージ選択へ戻るようになっていた（line-by-line・removed-behavior・cross-file tracerの3角度が独立に収束）。デバッグジャンプでのパイロットステージ連続確認（Phase 5視覚確認で実際に使った手段）が機能しなくなっていたということ。`stages.ts`に`nextStageBoundary()`を新設（`currentStage < baseStageCount`＝本編プレイ中は`baseStageCount`を、`currentStage >= baseStageCount`＝プレビュー範囲内では`G.STAGES!.length`を返す）し、`game.ts`/`ui.ts`の該当2箇所をこちらに置き換え。本編最終ステージの制覇判定（`isFinalStageClear()`自体）は影響を受けない（`baseStageCount`のまま）。`stages.test.ts`に3件、`game.test.ts`に2件の回帰テストを追加し、フィルタを外すサボタージュ検証で実際にテストが落ちることを確認済み
    2. **reuse指摘4件**: `neighborInInfluenceArea()`が`board.ts`の既存テスト済み`inBounds()`を再実装していた／`drawOrbitArrow()`が`vfx.ts`の既存`cellCenter()`と同じピクセル座標計算を再実装していた／`lastClearedRealStageIdx()`と`getTotalStars()`が「`baseStageCount`未満に絞ってから集計」というほぼ同じ処理を重複して持っていた／`drawPatternCellOverlays()`・`drawSelectionOutline()`が`board.ts`の既存`isPlayable()`を`isHole||isRock`で再実装していた。いずれも既存の再利用可能な関数・ヘルパーに置き換え（`stages.ts`は新設の`realStageEntries<T>()`に集約）。挙動は不変（全テストパス）
    3. **CLAUDE.md記述の不正確さ2箇所**（conventions角度）: 「`rendering.ts`/`ui.ts`はリポジトリ共通の慣例によりユニットテスト対象外」という記述が、実際には他アプリ（enblo/enblo-classic/combrawl）のCLAUDE.mdに同名の規約が存在しない、7metch単体の既存踏襲だった（唯一近い例はcombrawlの`main.ts`除外だが、こちらは「ここだけは」とcombrawl内で明示的にスコープされている）。「リポジトリ共通」という誤った権威付けは、apps側単体で動くAIエージェント（Codex等）が本CLAUDE.mdを鵜呑みにして将来同種のテスト欠落を広げるリスクがあるため、「7metch内の既存踏襲（リポジトリ共通ではない）」と明記するよう修正
    4. **テスト用モックの乖離**（removed-behavior角度）: `animations.ts`が新たに`drawOrbitInfluenceZones`/`drawOrbitArrows`/`drawPatternCellOverlays`を`rendering.ts`からimportするようになったが、`__mocks__/rendering.ts`（Vitestのテスト時にrendering.ts全体をno-op化する）にこの3関数が追加されていなかった。現状は`animations.ts`自体も`__mocks__/animations.ts`で完全に置き換えられているため実害は無い（`vite.config.js`の`test.alias`経由、実際の`animations.ts`はテスト中一度も読み込まれない）が、将来アニメーションロジックを直接テストする際に備えてモックを実際のexportに追従させた
    - 見送った指摘: (a) `drawSelectionOutline()`が旧実装にあった暗黙の盤内チェックを失っている点（`G.selected`は`startStage()`で必ずリセットされる既存の不変条件があり、到達不能なガードを追加するのは「起こり得ないケースの検証を増やさない」という開発方針に反するため見送り）。(b) タップ起動系ピース選択時のパルス枠（gold、offset1/size-2）がパターン枠（offset2/size-4）を完全には覆わない1px未満のズレ（既存の選択枠デザイン自体がオービット機能より前からのもので、Stage 1〜500にも影響する共通コードのため、この場限りでサイズを変えるとPRの「既存の見た目に影響しない」という原則に反する。未達成/達成済みパターン枠とタップ起動系ピースが重なるのはまだ未公開のStage 501〜524のみで実害は極小と判断）。(c) `buildStageSelect()`内の`lastClearedIdx === visibleUpTo - 6 + 5`という条件（`visibleUpTo = lastClearedIdx + 6`なので代数的に恒偽、オートスクロールの一部ケースが無効化されている）は本PR以前から存在する不具合で、本PRが触った箇所に隣接してはいるが原因・スコープが異なるため別対応とし、本PRでは修正しない
    - `tsc --noEmit`・`npm test`（293件）・`npm run deploy`（Vitest→Playwright E2E→ビルド→ビルドチェック→SWバージョン更新）が通ることを再確認
  - **Codexレビュー（commit 3db1c82、追加1件）を受けた追加修正**（2026-08-12）: **プレビュー進捗を本編のセーブ領域から分離する**——`checkWinLose()`（`game.ts`）はステージ番号に関わらず`G.saveData.cleared[G.currentStage]`/`bestStars[G.currentStage]`へ無条件で書き込んでいたため、デバッグジャンプでStage 501〜524（プレビュー、本番ビルドでも7タップで開けるため実プレイヤーでも起こりうる）を実際にクリアすると、そのクリア履歴がlocalStorageに永続保存される。現状は`G.baseStageCount === 500`のフィルタ（前回までの修正）で本編の集計からは隠れているが、**将来Stage 501〜524が正式に`buildStages()`へ追加され`baseStageCount`が524に伸びた時点で、過去のデバッグクリア履歴が本編の正規クリア・星として突然認識されてしまう**（「つづきから」が公式に未プレイの内容を飛ばす等）という将来時点の欠落だった。`checkWinLose()`のクリア処理を`if (G.currentStage < G.baseStageCount)`で囲み、プレビュー面のクリアは`cleared`/`bestStars`へ一切書き込まない（コイン報酬・結果画面表示自体はデバッグ体験として維持、永続保存だけをスキップ）よう修正。**恒久的な対応であり、Stage 501〜524公式追加時に別途マイグレーションを設計する必要はなくなった**（デバッグ専用パスは最初から本編セーブ領域に触れない設計にしたため）。`game.test.ts`に回帰テスト2件（プレビュー面はcleared/bestStarsに保存されないこと・本編ステージは従来通り保存されること）を追加し、ガードを外すサボタージュ検証で実際にテストが落ちることを確認済み。`tsc --noEmit`・`npm test`（295件）・`npm run deploy`が通ることを再確認
  - **Codexレビュー（commit e141652、追加1件）を受けた追加修正**（2026-08-12）: 前回の「プレビュー進捗を永続保存しない」修正の副作用で、Stage 501をデバッグジャンプでクリアしてNextを押しても常にステージ選択へ戻され、Stage 502以降へ連続進行できなくなっていた（Codex自身の指摘: 「現在のテストはNextボタンの表示までしか検証しておらず、このクリック経路を通していない」）。原因は`btn-next`ハンドラの`isStageUnlocked(next)`判定——`cleared[i-1]`の永続データを前提とする——が、もはや永続保存されないプレビュー面の`cleared`を常にfalseとして読み、`next`を毎回ブロックしていたため。`stages.ts`に`isRealCampaignStage(i)`（`i < baseStageCount`）を新設し、`btn-next`ハンドラのゲート/アンロック判定全体（`getGateFor`/`isStageUnlocked`）を`isRealCampaignStage(next)`がtrueの間だけ実行するよう変更（本編スターゲートは元々Stage 450までしか定義されておらず、プレビュー範囲でこれらの判定を丸ごとスキップしても本編側の挙動には影響しない）。`stages.test.ts`に回帰テスト2件を追加し、`isRealCampaignStage()`を常にtrueに戻すサボタージュ検証で実際にテストが落ちることを確認済み。**Codexが指摘した「クリック経路自体を通すテストが無い」点は未解消のまま**——`btn-next`ハンドラはDOMイベントハンドラで7metchの既存慣例上ユニットテスト対象外であり、実際のゲームプレイをPlaywrightで自動化してクリアさせるには盤面のランダム生成に対応した合法手の自動探索が必要でコストが高いと判断し、境界判定ロジック自体（`isRealCampaignStage()`）を`stages.ts`に切り出してテストする対応で代替した。この一帯（`G.baseStageCount`関連の境界条件）は本セッション内で都合4回連続でCodexに指摘されており、関連コードを変更する際は特に注意すること。`tsc --noEmit`・`npm test`（297件）・`npm run deploy`が通ることを再確認
  - **Codexレビュー（commit c82e4bc、追加1件）を受けた追加修正**（2026-08-12）: **全解放でもプレビュー進捗を保存しない**——デバッグパネルの「全ステージ解放」ボタン（`btn-debug-unlock-all`）は`for (let i = 0; i < G.STAGES!.length; i++)`で`cleared`/`bestStars`を書き込んでいたが、デバッグジャンプでプレビュー分が`G.STAGES`へ追記された後にこのボタンを押すと、`i`がプレビュー範囲（500〜523）にも及び、`checkWinLose()`と同じ理由（将来Stage 501〜524が正式追加された時点で過去の履歴が本編進捗として復活する）で永続化されてしまう欠落だった。ループの上限を`G.STAGES!.length`から`G.baseStageCount`に変更。**この変更で機能的な後退は無い**——デバッグジャンプ（`btn-debug-jump`）自体が`isStageUnlocked()`判定を経由せず直接ステージへ飛ぶ設計のため、「全解放」はそもそもプレビュー面へのアクセスに必要なかった。この関数はDOMイベントハンドラで既存慣例上ユニットテスト対象外のため、`tsc --noEmit`・目視でのロジック確認・`npm test`（297件、既存テストに回帰無し）・`npm run deploy`で対応を確認
  - **`/code-review`（人間実行、8並列: efficiency・simplification・reuse・altitude・cross-file tracer・conventions・removed-behavior・line-by-line）を受けた追加修正**（2026-08-12）:
    1. **描画ガイド呼び出しの3箇所重複を解消**（simplification・reuse角度が独立に収束）: `drawOrbitInfluenceZones(ctx); drawPatternCellOverlays(ctx);`の2行が`drawBoard()`・`animateSwap()`・`animateDrop()`の3箇所に個別にコピーされていた。この描画順序自体が過去に複数回のバグ（ガイドがピース/アニメで上書きされる）の原因になっており、3箇所で個別に順序を維持し続けるのはドリフトのリスクが高いとの指摘。`rendering.ts`に`drawBoardGuides(ctx)`を新設し、3箇所すべてから呼ぶよう統一（`drawOrbitArrows(ctx)`は元々1関数呼び出しのみで重複が無いためそのまま維持、`drawSelectionOutline(ctx)`は`drawBoard()`にしか無い処理のため引き続き個別に呼ぶ）。`__mocks__/rendering.ts`も追従（`drawOrbitInfluenceZones`/`drawPatternCellOverlays`の個別exportは`animations.ts`から参照されなくなったため`drawBoardGuides`に置き換え）
    2. **`nextStageBoundary()`/`isRealCampaignStage()`の重複比較を解消**（simplification角度）: 両関数がそれぞれ独立に`baseStageCount`との比較を再実装していた（`currentStage >= baseStageCount` vs `i < baseStageCount`）。`isRealCampaignStage()`を「本編/プレビュー」判定の単一の真実源とし、`nextStageBoundary()`はこれに委譲するよう変更（`isRealCampaignStage(G.currentStage) ? G.baseStageCount : G.STAGES!.length`）。挙動は不変（既存の全回帰テストがそのままパス）
    - 見送った指摘: (a) efficiency角度が挙げた2件（3つのdraw*Sラッパー関数のさらなる統合、`getPatternCells()`の結果キャッシュ）はどちらも「ブロックするほどではない」と自己申告されており、盤面が最大9x10・オービット最大3個程度の規模では測定可能な差にならないため見送り。(b) reuse角度が挙げた`forEachOrbit(cb)`ヘルパー・`cellInsetRect()`ヘルパーはどちらも影響範囲が小さく（各2〜4箇所）、後述のaltitude角度の指摘次第でこのコード自体の設計が変わりうるため、先に大きい設計判断を待ってから検討する
    - **altitude角度による指摘**: 根本原因は`G.STAGES`をランタイムでミューテートする設計自体にあり、デバッグジャンプでプレビューステージを追記するのではなく最初から別配列（例: `G.debugPreviewStages`）に分離していれば、`G.baseStageCount`・`nextStageBoundary()`・`isRealCampaignStage()`のいずれも不要だった、という指摘。実際、本PRはこの一帯の境界条件だけで10ラウンド近いレビューを要しており（本ドキュメントの一連の「Codexレビューを受けた追加修正」参照）、うち2回は最初のガード自体が引き起こした回帰の後始末だった。**ユーザー承認を得て、別PR（`claude/nanmatch-debug-preview-refactor-c25upd`、本PRのブランチから分岐したスタックPR）として着手・完了**。詳細は次項参照
    - `tsc --noEmit`・`npm test`（297件）・`npm run deploy`が通ることを再確認。視覚確認は使い捨てPlaywrightスクリプトでStage 517（オービット3個）の描画に崩れが無いことをスクリーンショットで再確認（純粋なリファクタのため低リスクと判断しつつ実施）
  - **altitude角度の指摘を受けた設計変更（デバッグプレビュー機構のリファクタ、別PR）**（2026-08-13）: `G.STAGES`をランタイムで`push()`する旧方式（デバッグジャンプでStage 501〜524プレビューを追記）を廃止し、`G.STAGES`は起動後（`main.ts`で`buildStages()`を代入した後）決して変更しない設計に作り直した。プレビューステージは新設の`G.debugPreviewStages: StageConfig[] | null`（デバッグジャンプ時に一度だけ遅延生成）に分離し、`stages.ts`に新設した`stageConfigAt(i)`（`i < G.STAGES!.length`なら`G.STAGES![i]`、そうでなければ`G.debugPreviewStages![i - G.STAGES!.length]`を返す統合アクセサ）経由でステージ定義を取得する方式に統一。**これにより`G.STAGES!.length`は常に「本編の実ステージ数」を指すという不変条件がセッション全体で常に成立するようになり、旧`G.baseStageCount`（起動時のスナップショット値）が完全に不要になった**（削除済み）。`nextStageBoundary()`/`isRealCampaignStage()`/`realStageEntries()`（`getTotalStars()`/`lastClearedRealStageIdx()`が使う共有フィルタ）はいずれも`G.baseStageCount`ではなく`G.STAGES!.length`を直接参照するよう置き換え。新設`totalReachableStageCount()`（本編+プレビューの合計、`G.STAGES!.length + (G.debugPreviewStages?.length ?? 0)`）を`nextStageBoundary()`のプレビュー範囲側と`btn-debug-jump`ハンドラの範囲チェックで共有
    - `board.ts`/`game.ts`/`ui.ts`/`rendering.ts`にあった`G.STAGES![G.currentStage]`等の直接インデックスアクセス（計24箇所）を全て`stageConfigAt(...)`経由に置き換え。これにより「本編かプレビューか」をゲームロジック側が意識する必要が無くなった
    - `btn-debug-unlock-all`（全ステージ解放）のループ上限は`G.STAGES!.length`のまま（この値自体がもう不変条件により常に正しい本編数を指すため、以前のように`G.baseStageCount`へ置き換える対応は不要になった）
    - テスト: `stages.test.ts`に`stageConfigAt`/`totalReachableStageCount`の新規テスト3件を追加。既存の`nextStageBoundary`/`isRealCampaignStage`/`lastClearedRealStageIdx`のテスト群は「`G.STAGES`を意図的に本編より長くする」旧方式から「`G.STAGES`は本編サイズのまま、`G.debugPreviewStages`にプレビュー分を積む」新方式に全面的に書き換え。`game.test.ts`のプレビュー面関連テスト（`checkWinLose`の永続保存ガード・`showResult`のNextボタン表示）も同様に書き換え。`stageConfigAt()`のプレビュー分岐を無効化するサボタージュ検証で実際にテストが落ちることを確認済み。`tsc --noEmit`・`npm test`（300件）・`npm run deploy`が通ることを再確認。視覚確認は使い捨てPlaywrightスクリプトで、通常フロー（タイトル→ステージ選択→Stage1プレイ）とデバッグフロー（7タップ→Stage 501/517/524へのジャンプ→再ジャンプ）の両方をスクリーンショットで確認し、コンソールエラーが無いことも確認した（既知のGA4ネットワーク制限ノイズのみ）
- [ ] **オービットPhase 6（旧Phase5）**: チュートリアル（Stage 501初出時、既存の`tutorialDone`マップにキー500を追加するだけでよい。独立フラグは不要）・あそびかた画面への追加（既存の旧ギミック説明は残したまま追加）
- [ ] **オービットPhase 7（旧Phase6、優先度: 低・任意）**: 分析基盤対応。`projects/7metch-analytics/`（非公開の姉妹リポジトリ）はStage 1〜500分のペイロード・レポートは変更せず、Stage 501以降専用のフィールド・分岐を追加する。**`stage-analyzer.js`（同じく非公開の姉妹リポジトリ内、`TOTAL_STAGES=350`のハードコードによりStage 351〜500は元々分析できない状態）は対応不要**（2026-08-11決定。Stage 1〜500は現状維持でよく、このツールでStage 351〜500を見られるようにする必要は無い。Stage 501以降の分析が必要になったタイミングでそのときだけ新体系用の分岐を追加すればよい）。新ステージ（Stage 501以降）のバランス検証は本来`npm run sim`を使う想定で、この分析ツールに実装が依存することはない

**Stage 501〜524の実公開タイミング（2026-08-11、人間の最終確認により決定）**: Phase 4e（ステージ生成配線）・Phase 5（描画）・Phase 6（チュートリアル・あそびかた画面）が全て完成してから、`buildStages()`にStage 501〜524を追加して1回で公開する。ロジックだけ・描画だけが先行してStage 501が中途半端な状態でプレイ可能になることを避ける（現在Stage 500クリア時は「🎉 全ステージ制覇！ 🎉」演出が既にあるため、Stage 501が無くても現状は破綻しない。急いで前倒しで公開する必要は無い）。

各フェーズは1PRで完結させ、テストなしでゲームロジックを変更しない（リポジトリ共通のAI開発ルール参照）。

## 現在のタスク

### Phase 6: コイン過剰問題の解決

- コインの消費先を追加する（具体的な施策は別途検討）
- ステージ追加・ギミック追加は別途検討
- ゲーム性の大幅拡張（ローグライク要素等）は別プロジェクト（ローグライクナナメッチ）で行う
- 詳細は `ai-workspace/projects/7metch/IMPROVEMENT_PLAN.md` Phase 6 を参照（非公開の姉妹リポジトリ。本リポジトリからは参照できないため、読めない環境ではこの箇条書きの範囲だけを前提に作業する）

## 完了済み

- Phase G: ガードレール構築 完了（try/finally, テスト109件, exhaustive check, deploy自動化）
- TypeScript 移行完了（strict: true、全14ファイル変換済み）— PR #182
- Phase 0-5 完了 — PR #151-#177
