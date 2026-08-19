# DustyJukebox — 開発ガイド

## 開発ルール

リポジトリルートの `CLAUDE.md` の「AI開発ルール」セクションを必ず参照すること。
以下は本プロジェクト固有のルール:

- 設計方針の全体像は非公開の姉妹リポジトリ `ai-workspace/projects/google-drive-music-player/CONCEPT.md` にある（本リポジトリからは参照不可）。メカニクス（絞り込み・除外・保存プレイリスト・文字化け対処等）に関わる変更をする際は、まず`ai-workspace`側のセッションでCONCEPT.mdと照合してから着手すること
- **現在は雛形段階**：認証（OAuth）・Drive索引スキャン・プレイヤーUIはまだ実装していない。`src/lib.ts`（タグ解析・文字化け検出）と`src/rangeTokenizer.ts`（HTTP Rangeリクエストによるランダムアクセストークナイザー）のみが、検証済みロジックの移植として存在する
- **PWA未対応**（`manifest.json`/`sw.js`なし）。Phase 1の認証付きストリーミング設計ではService WorkerをDriveストリーミングプロキシとして使う想定のため、PWA化とSW導入は同時に行う

## 移植元

`ai-workspace/projects/google-drive-music-player/catalog-script/`（使い捨て検証スクリプト）からの移植:

- `src/lib.ts` ← `catalog-script/src/lib.js`：タグ解析・文字化け検出ロジック。`SHEET_HEADER`はcatalog-script実行時の列順のまま残しており、本体のスプレッドシート列（`CONCEPT.md` 4.3節、`_override`列等を含む実際のスキーマ）とは異なる。索引読み書きの実装時に本体スキーマへ合わせて作り直すこと
- `src/rangeTokenizer.ts` ← `catalog-script/src/rangeTokenizer.js`：strtok3の`ITokenizer`実装。Drive呼び出し部分（`fetchRange`関数）は未実装で、コンストラクタに渡す関数として外側から注入する設計のまま（catalog-scriptの`verify-range.js`にあった実際のDrive Range fetch実装はまだ移植していない）

## テスト

- **フレームワーク**: Vitest
- **テストファイル**: `src/lib.test.ts`, `src/rangeTokenizer.test.ts`（移植元の`node:test`ベーステストをVitestに書き換えたもの、内容は同一）
- **実行タイミング**: `npm run build` の prebuild で自動実行。テスト失敗時はビルドが中断される

## ビルド・デプロイ

- `npm run build` — テスト（prebuild）→ ビルド（tsc + vite build）
- `npm run deploy` — ビルド → `dist/app.js` をルート直下にコピー
- deploy 後にコミットするだけで GitHub Pages にデプロイされる（ただし非掲載・URL直踏み運用。`apps/CLAUDE.md`参照）
- vite.config.js の entry-rewrite プラグインが `dev` 実行時に root `index.html` の `./app.js` を `./src/main.ts` に書き換える（`7metch`/`7metch2`と同様の仕組み）

## 次の実装ステップ（着手順の目安）

1. OAuth認証（トークンモデル、`initTokenClient`）＋`drive.readonly`でのファイル一覧取得
2. Sheets APIでの索引upsert（`CONCEPT.md` 4.3節のスキーマに合わせて`lib.ts`のSHEET_HEADER/buildRowを作り直す）
3. `rangeTokenizer.ts`用の実Drive `fetchRange`実装、初回スキャンのバッチ処理・中断再開
4. 絞り込み・除外・再生UI、Service Workerストリーミングプロキシ
