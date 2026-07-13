# 7metch2 (ナナメッチ系列 新作) — 開発ガイド

## 開発ルール

リポジトリルートの `CLAUDE.md` の「AI開発ルール」セクションを必ず参照すること。
以下は本プロジェクト固有のルール:

- ゲームロジック（board.ts, game.ts, upgrades.ts）を変更する場合は、該当箇所のユニットテストを確認・更新してからコミットする
- 新しいアップグレード（`UpgradeId`）を追加する場合は、下記「変更時チェックリスト」を遵守する
- `G.animating` を操作する場合は、必ず try/finally パターンを使う（`doMove()` 参照）
- **開発中アプリにつきPWA未対応**（`manifest.json`/`sw.js`なし、CSSは`index.html`にインライン）。公開判断が出るまでは追加しない。公開時にはPWA化と`deploy`スクリプト拡充（manifest/SWコピー・SWバージョン自動更新）が必要（`apps/CLAUDE.md`参照）

## テスト

### ユニットテスト (`npm test`)

- **フレームワーク**: Vitest
- **テストファイル**: `src/__tests__/board.test.ts`, `src/__tests__/game-logic.test.ts`, `src/__tests__/upgrades.test.ts`
- **実行タイミング**: `npm run build` の prebuild で自動実行。テスト失敗時はビルドが中断される
- **対象**:
  - `board.ts`: `findAllMatches`（通常/2x2/match2ルール込み）, `applyGravity`, `activateSpecial`（bomb/line_h/line_v/line_d/rainbow/split）, `findSpecialCreations`, `swapPieces`, `isAdjacentAllowed`, `createBoard`
  - `game.ts` / ステージ進行式: `getStageTarget`, `getStageMoves`, `getStageBoardSize`, `getStageNumColors`
  - ルール系アップグレード（infection の連鎖上限、afterimage の消去挙動、スコア計算式）
  - `upgrades.ts`: `has()`
- **シミュレーションテスト**: 未整備（`7metch`にある`npm run sim`相当のスクリプトは無い）。難易度・アップグレードバランスの検証は現状ユニットテスト＋手動プレイに依存する
- **前提**: ゲームロジックを変更した場合は必ずテストを追加・更新すること

## ビルド・デプロイ

- `npm run build` — テスト（prebuild）→ ビルド（tsc + vite build）
- `npm run deploy` — ビルド → `dist/game.js` をルート直下にコピー（開発中のためこれのみ。manifest/SW/style.cssのコピーは無し）
- deploy 後にコミットするだけで GitHub Pages にデプロイされる
- vite.config.js の entry-rewrite プラグインが `dev` 実行時に root `index.html` の `./game.js` を `./src/main.ts` に書き換える（`7metch`と同様の仕組み）

## ステージ進行式 (game.ts)

- **クリア目標スコア**: `floor((200 + stage*150 + floor(stage^2*40)) * targetMultiplier)`
- **手数**: `max(8, baseMoves - floor(stage/3))`
- **盤面サイズ**: `cols = 7 + floor(stage/boardGrowthRate)`, `rows = 8 + floor(stage/boardGrowthRate)`
- **色数**: stage 0-7: 5色 / stage 8-14: 6色 / stage 15+: 7色
- `targetMultiplier` / `baseMoves` / `boardGrowthRate` は `G`（ラン設定）側のパラメータ。変更時はユニットテストの期待値も合わせて更新すること

## アップグレードシステム (upgrades.ts)

- `ALL_UPGRADES` にレアリティ（common/rare/epic/legendary）と前提条件（`requires`）を持つ定義を列挙。取得は `pickUpgradeChoices()` でレアリティ重み付き抽選（重み: common 40 / rare 30 / epic 20 / legendary 10）
- カテゴリ: Basic unlocks / Range / Chain / Rule-breaking（ルール自体を変える性質: match2, infection, split, afterimage, timed_bombs, resonance） / Chaos（盤面を大きく撹乱: blackhole, mirror, proliferation, meltdown）
- `UpgradeId` はunion型だが、追加時のコンパイルエラーによる網羅性チェック（`default: never`）は未導入。新規追加時は `ALL_UPGRADES` への登録漏れ・`has()`呼び出し箇所の対応漏れを手動で確認すること

## 変更時チェックリスト

### 新しいアップグレード（UpgradeId）を追加するとき

- [ ] `types.ts` の `UpgradeId` に追加
- [ ] `upgrades.ts` の `ALL_UPGRADES` に定義を追加（rarity, requires を適切に設定）
- [ ] 効果を実装する箇所（`board.ts`/`game.ts` の `has(G.run.upgrades, "...")` 分岐）を追加
- [ ] ルールを書き換える性質のアップグレードの場合、既存テストが新ルール下でも通るか確認（例: `match2`はマッチ最小数を変えるため`findAllMatches`のテストに影響しうる）
- [ ] ユニットテストを追加（最低: 効果が発動するケース・requires未達で選択肢に出ないケース）

### 新しい特殊ピース種（SpecialType）を追加するとき

- [ ] `types.ts` の `SpecialType` に追加
- [ ] `findSpecialCreations()` に生成条件を追加（board.ts）
- [ ] `activateSpecial()` に起爆効果を追加（board.ts）
- [ ] ユニットテストを追加（`findSpecialCreations`, `activateSpecial` の該当ケース）

### G.animating を操作する関数を追加/変更するとき

- [ ] `G.animating = true` の後を必ず `try { ... } finally { G.animating = false; }` で囲む（`doMove()` 参照）
