# enblo — 開発ガイド

## 開発ルール

リポジトリルートの `CLAUDE.md` の「AI開発ルール」セクションを必ず参照すること。
以下は本プロジェクト固有のルール:

- ゲームロジック（combat.ts, run.ts, save.ts, data/*.ts）を変更する場合は、該当箇所のユニットテストを確認・更新してからコミットする
- 現在、戦闘システムの大規模再設計が進行中（下記「進行中の再設計」参照）。`combat.ts`/`types.ts` を触る前に、変更が旧仕様（現行実装）向けか新設計向けかを確認する

## 進行中の再設計（重要な暗黙知）

`ai-workspace/projects/enblo/` 配下のブレストドキュメント（非公開の姉妹リポジトリ。本リポジトリからは参照できない）で、戦闘システムの再設計が検討済み・実装待ちの状態。詳細は `ai-workspace/projects/enblo/REMAINING_TASKS.md` を参照。**姉妹リポジトリを読めない環境では、以下の要点だけを前提に作業し、再設計に関わる設計判断を伴う変更は行わないこと。** 要点:

- 現行の `Stats`（`types.ts`）は `hp/atk/def/spd/hit/crit` の6項目だが、再設計後は `hit` を削除し5ステータス＋導出値（命中率・回避率等を式から算出）に変更予定
- ダメージ式・命中/回避/会心の導出式、溜め機構、状態異常スタック、恒常特性（層2）の離散3段階化などが未実装の設計タスクとして残っている
- 実装に着手する際は `CLASS_IDENTITY_FOUNDATION.md`, `UPGRADE_POOL_BRAINSTORM.md`, `UPGRADE_SYNERGY_ARCHETYPES.md`, `GLOSSARY.md` を参照
- **現状の `src/` はこの再設計より前の実装**。何も知らずに現行コードを読むと旧仕様を前提にした変更をしてしまうので注意
- 大改修着手前の完成形（試作品v1）は `enblo-classic/` として独立公開済み。当初は `enblo-v1-prototype-snapshot` ブランチにも同内容を保存していたが、`enblo-classic/` が正式な保存先として機能するため冗長と判断し、2026-07-15に削除方針に変更（ブランチ自体の削除はGitHub側で別途実施）

## テスト

### ユニットテスト (`npm test`)

- **フレームワーク**: Vitest
- **テストファイル**: `src/combat.test.ts`, `src/run.test.ts`, `src/save.test.ts`, `src/data/classes.test.ts`, `src/data/enemies.test.ts`, `src/data/upgrades.test.ts`, `src/data/permanentUpgrades.test.ts`
- **実行タイミング**: `npm run build`（`scripts/build.mjs`）が内部で実行。テスト失敗時はビルドが中断される（後述）
- **前提**: `combat.ts`（ダメージ計算）や `data/*.ts`（クラス・敵・強化・血統データ）を変更した場合は必ずテストを追加・更新すること

### シミュレーションテスト (`npm run sim`)

- **スクリプト**: `scripts/simulate.mjs`
- 描画なしでヘッドレス実行し、統計を収集する（7metchの `npm run sim` と同様の位置づけ）
- ダメージ式・係数（K定数等）を変更した場合は必ず実行して妥当性を確認する。REMAINING_TASKS.mdにも記載の通り、既存のK定数（sim_v9でK=15）は弱すぎることが判明済みで再チューニングが必要

### E2Eテスト (`npm run test:e2e`)

- **フレームワーク**: Playwright（`e2e/screen-flow.spec.ts`, `playwright.config.ts`）
- 起動→クラス選択→戦闘→強化選択→…→ゲームオーバーまでの画面遷移が通ることを確認する疎通テスト。ユニットテストの代替ではない
- 大きな画面遷移・状態遷移の変更をした場合に実施。旧仕様前提のテストなので、再設計を実装した際は更新が必要

## ビルド・デプロイ

- `npm run build` — テスト → ビルド
- `npm run deploy` — ビルド → dist/ を `game.js`/`style.css`/`manifest.json`/`index.html` としてルート直下にコピー → SW バージョン自動更新（1コマンドで完結）
- `npm run build` は `scripts/build.mjs` を実行する。このスクリプトが `restore-entry.mjs`（root index.htmlの`./game.js`参照を`./src/main.ts`に書き換え）→ `npm test` → `vite build` → `reset-entry.mjs`（index.htmlを元に戻す、try/finallyで失敗時も必ず実行）を1つのNodeスクリプトとしてオーケストレーションする（2026-07-15、prebuild/build/postbuildの3スクリプト分割だと失敗時にpostbuildが走らず書き換え後のindex.htmlが残ってしまう問題があったため統合。旧prebuild/predeploy方式の記述はここで置き換え）。index.html の手動編集は不要。デプロイ後は `dist/index.html` がroot index.htmlを上書きするため、書き換えは毎回一時的なもの

## 変更時チェックリスト

### 新しいクラス（ClassDef）を追加するとき

- [ ] `data/classes.ts` に追加
- [ ] `data/classes.test.ts` にテストケースを追加
- [ ] クラス制限のある強化（`UpgradeOption.classRestriction`）が影響を受けないか確認

### 新しい強化候補（UpgradeOption）/ レリック（Relic）/ 血統強化（PermanentUpgrade）を追加するとき

- [ ] 該当する `data/upgrades.ts` / `data/relics.ts` / `data/permanentUpgrades.ts` に追加
- [ ] 対応するテストファイルにケースを追加
- [ ] `apply()` が既存の `Stats` の他フィールドを壊さないか確認（再設計中は特に `hit` の扱いに注意）

### 新しい敵（enemies.ts）を追加するとき

- [ ] `data/enemies.ts` に追加、`data/enemies.test.ts` にテストケースを追加
- [ ] `npm run sim` で難易度への影響を確認

## 現在のタスク

- 戦闘システム再設計の実装着手（「進行中の再設計」参照）。詳細・優先順位は `ai-workspace/projects/enblo/REMAINING_TASKS.md` を参照
- グラフィック刷新（PixelLab.ai採用決定、ドット絵アニメーションへの移行）は別途対応、実装が詰まってから着手方針
