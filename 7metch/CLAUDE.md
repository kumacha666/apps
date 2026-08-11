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
- **テストファイル**: `src/board.test.ts`, `src/game.test.ts`, `src/stages.test.ts`
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

- `showResult()`（game.ts）は `G.currentStage === G.STAGES.length - 1` で最終ステージクリアを判定し、通常の「クリア！」ではなく「🎉 全ステージ制覇！ 🎉」＋祝福メッセージを表示する（`isFinalStage`）。`STAGES.length` 基準のため、`buildStages()` のステージ数を将来変更（501面以降の追加等）しても自動的に新しい最終ステージに追従する
- `track("stage_clear", ...)` に `all_stages_cleared` フィールドを追加済み
- 501面以降のコンテンツ拡張自体は別途の設計課題（本対応はエンディング演出のみのスコープ）

### 既知の課題（2026-07-24調査）

- **300面以降、CDボム（カウントダウン爆弾）の影響でミッション全般が大幅に簡単になる**：CDボムは`countdown`が0になると自動的に爆発し（設置時8〜12ターン）、シミュレーション（`scripts/simulate.mjs`、有効な手＝マッチが成立するスワップのみをランダム選択）ではこの自動爆発だけで周囲を消去しスコア・消去数ミッションの進捗を稼ぐ。ミッション種を揃えてシミュレーションで比較すると、消去数ミッションは200〜299面平均クリア率11.3%→300〜399面平均84.3%、スコアミッションは22.7%→83.0%まで跳ね上がる（色消しは12.0%→32.6%とやや緩やか、色指定のため恩恵が小さい）。**なお実際のプレイ（`game.ts`の`doMove()`）ではCDボムと他の特殊ピースを隣接スワップすると、マッチを伴わずその場で即時起爆できる**（`p1.special === "countdown" || p2.special === "countdown"`の分岐）。この手動起爆パスはシミュレーターの`findValidMoves()`が候補に含めないため、上記の数値には反映されていない。ただし手動起爆も1手を消費し、早期に盤面を変えることで以降のマッチ・特殊ピース生成の機会に影響するため、必ずしも有利に働くとは限らない。実プレイでは意図的な早期起爆が可能であり、プレイヤーの手選択によって難易度がシミュレーション結果と異なりうる、という留保に留める。352/353面等のミッション難易度調査（350面以降special/chainのcountを`2`→`3`固定に修正、`buildStages()`参照）の過程で発覚した。**この「300面以降ずっと簡単」という傾向は350面のslotローテーション導入より前から存在する仕様**で、350〜499面の平均クリア率(約54%)はむしろ直前の300〜349面(約62%)より低い。CDボムの消去量を難易度パラメータとして考慮する設計変更は今のところ未着手
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

**Stage 1〜500は一切変更しない。** 新ギミック「オービットセル」＋新クリア条件「パターン消し」はStage 501以降（`buildStages()`の内部インデックス500以降）にのみ適用し、ゲート無しでStage 500クリア後に地続きで始まる。コイン・星・実績等のセーブデータはそのまま引き継ぐ（既存のセーブ形式・キーを変更しない）。

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
  - [ ] **4b. 「有効な1手」共有列挙＋手動シャッフル・自動デッドロック回復（新規）・シミュレーターへの配線**: `findHint()`・`scripts/simulate.mjs`の`findValidMoves()`・（新設する）合法手0件判定が、通常スワップ（`isSwapLegal`ベース）に加えてタップ起動可能な特殊ピース・スワップ起動系特殊ピース（レインボー・特殊ピース同士のコンボ）も「有効な1手」として共有列挙する形に統一する（4aで積み残した`findHint()`のタップ/スワップ起動系候補の欠落もここで解消）。`useShuffle()`にオービット下での品質基準（合法手1つ以上＋即座マッチなし、上限回数、失敗時は盤面変更せずキャンセル）を追加。**「自動デッドロック回復」は現在の実装に一切存在しない新規機能**（`countAvailableMoves()`は現状`createBoard()`の初期生成にしか使われておらず、プレイ中の再チェック・自動シャッフルの仕組みはStage 1〜500に無い）。オービット制約は既存の自由なマッチングでは起きなかった詰みを新たに生みうるため新設が必要だが、**Stage 1〜500のシミュレーション統計・挙動を一切変えないよう、`G.STAGES[G.currentStage].orbits.length > 0`のときのみ動作するようガードする**（Stage1〜500は既に詰みが実質発生しない設計のため、恒久的に無条件で有効化すると`npm run sim`の詰み率等の既存メトリクスが変わってしまうリスクがある）
  - [ ] **4c. `patternProgress`の配線**: `GameState`に追加してステージ開始時に初期化し、`recordClear`を共通の消去処理経路（通常マッチ・特殊ピース起動・アイテム使用）に配線する。`Mission`型に`"pattern"`のようなミッション種を追加し、`checkWinLose()`のクリア判定に組み込む
  - [ ] **4d. `createBoard()`/`countAvailableMoves()`の盤面品質チェック統合**: オービット制約を適用し、「オービット制約適用後の合法手数が2〜10の範囲」を満たす初期盤面を生成する
  - [ ] **4e. ステージ生成フローへの配線**: `generateOrbitLayout()`・`boardSizeForStage()`のパイロット範囲分岐（`500 <= index < 524`のみ固定7x8、Stage 525以降の盤面サイズは別途人間が判断）・`orbitCountForStage()`/`patternShapeForStage()`を`buildStages()`に接続。**このステップより前の時点ではStage 501はまだ`buildStages()`に追加しない**（ロジック・描画・クリア条件が全て揃うまで、実際にプレイ可能な形では公開しない。Phase 5のレンダリングが終わってから最後に1回で有効化する）
- [ ] **オービットPhase 5（新設、2026-08-11）**: 描画（オービットの見た目・パターン消しの盤面オーバーレイ）。Phase 4のロジック配線だけでは画面に何も表示されず機能が成立しないため、Phase 6（旧Phase5、チュートリアル）より前に必須で行う。
  - オービットセルに重力方向を示す矢印（`drawOrbitField()`相当）＋影響範囲（隣接8マス）の境界オーバーレイを描画する（`rendering.ts`）
  - パターン消しの各セルに達成状態を示すオーバーレイ（未達成/達成済み）を常時表示する
  - Playwright E2E（`e2e/screen-flow.spec.ts`）で境界ケース（要素の重なり）の視覚崩れが無いか確認する（リポジトリ共通のAI開発ルール「視覚的なUI崩れの検証」参照）
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
