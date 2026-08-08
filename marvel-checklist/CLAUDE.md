# marvel-checklist — 開発ガイド

## 開発ルール

リポジトリルートの `CLAUDE.md` の「AI開発ルール」セクションを必ず参照すること。
以下は本プロジェクト固有のルール:

- ビルド不要の静的PWAだが、`logic.js` に切り出した状態ロジック（公開日判定・進捗集計・グループ化・インポート検証）を変更する場合は、必ず `test/logic.test.mjs` を確認・更新してからコミットする（A系の静的PWAの中で唯一テスト構成を持つ例外）
- `app.js` はDOM描画とイベント配線のみを担当する。判定・集計・検証など「テストできるロジック」を新たに書く場合は `logic.js` 側に置き、`app.js` からは呼び出すだけにする
- 日付比較は必ず `logic.js` の `parseLocalDate` / `isReleased` / `daysUntil` 経由で行う。`new Date("YYYY-MM-DD")` を直接使うとUTC解釈されタイムゾーンによって公開日当日の判定がズレるため禁止（2026-08-08、Codexレビュー指摘で修正済み）
- `data/movies.json` の `group` フィールドはUIのグループ見出し。`groupMovies()` は配列内での**初出順**でグループの表示順を決めるため、新しい作品を追加する際は同じグループの既存作品の近くに挿入すること（順序がバラバラだと同じグループ見出しが複数箇所に分裂して表示される）
- 新しい映画を追加する際のチェックリスト:
  - `id`（英語スラッグ、重複不可）・`title`（邦題）・`releaseDate`（`YYYY-MM-DD`）・`universe`（`mcu`/`sony`/`fox`/`other`）・`group`（表示グループ名）を設定する
  - 未公開作品（フライング公開日を含む）には `"tentative": true` を付ける
  - MCUのフェイズ分類は作品追加のたびに公式発表と突き合わせる（過去に『ファンタスティック・フォー：ファースト・ステップ』をフェイズ5と誤記していた実績あり、2026-08-08修正）

## テスト

### ユニットテスト (`npm test`)

- **フレームワーク**: Node標準テストランナー（`node --test`）。Vitest等の追加依存は無い
- **テストファイル**: `test/logic.test.mjs`
- **対象**: `logic.js` の `parseLocalDate`, `isReleased`, `daysUntil`, `formatMonth`, `computeProgress`, `filterByUniverse`, `filterUnwatched`, `groupMovies`, `validateImportedState`
- **前提**: `app.js`（DOM操作）は対象外。UI側の回帰確認はPlaywrightでの手動スモークテストで代替する（E2Eスイートは本アプリには未整備）

### 手動確認（E2E未整備のため）

CSS/DOM構造に関わる変更をした場合は、Playwrightで以下を最低限確認する:
- 視聴済みチェック・評価ボタンの状態が `localStorage`（`marvel-checklist-state-v1`）にリロード後も保持される
- 「未視聴のみ表示」トグル使用時、進捗表示（視聴済み数）がユニバース全体を母集団に計算されていること（未視聴フィルターに巻き込まれて0にならないこと）
- チェック/評価ボタン操作後もキーボードフォーカスが失われないこと（対象が一覧から消える場合は次の要素に移ること）

## Service Worker (`sw.js`)

- キャッシュ名は `marvel-checklist-` プレフィックス固定。`activate` でのキャッシュ削除は必ずこのプレフィックスに限定すること（GitHub Pagesは全アプリが同一オリジン `honeypawlab.com` でCacheStorageを共有するため、プレフィックス無しで削除すると他アプリのオフラインキャッシュを巻き込んで消してしまう）
- キャッシュへの書き込みは成功レスポンス（`res.ok`）のみ対象。404/5xx をキャッシュすると、オフライン時に壊れたレスポンスがフォールバックされる
- `ASSETS` に新しい静的ファイルを追加した場合は忘れずにここにも追記する
- バージョンを上げる際は `CACHE_NAME` の末尾（`v1` など）をインクリメントする
