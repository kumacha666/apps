# DustyJukebox — 開発ガイド

## 開発ルール

リポジトリルートの `CLAUDE.md` の「AI開発ルール」セクションを必ず参照すること。
以下は本プロジェクト固有のルール:

- 設計方針の全体像は非公開の姉妹リポジトリ `ai-workspace/projects/google-drive-music-player/CONCEPT.md` にある（本リポジトリからは参照不可）。メカニクス（絞り込み・除外・保存プレイリスト・文字化け対処等）に関わる変更をする際は、まず`ai-workspace`側のセッションでCONCEPT.mdと照合してから着手すること
- **2026-08-19、OAuth認証（トークンモデル）＋drive.readonlyでのファイル一覧取得を実装**。`src/auth.ts`（Google Identity Services `initTokenClient`の薄いラッパー、期限判定`isTokenValid`はユニットテスト対象）・`src/drive.ts`（フォルダ再帰走査＋拡張子ベースのファイル発見、Drive呼び出しをDIしてユニットテスト可能にした設計。`rangeTokenizer.ts`の`fetchRange`注入と同じ方針）を追加し、`src/main.ts`に最小限のログイン・スキャンUIを実装した。**Sheets索引書き込み・実Rangeフェッチ・絞り込み/再生UIはまだ未着手**
  - **同日、Codexレビュー指摘で計6件修正**：①`<script async>`で読み込むGoogle Identity Servicesの読み込み順序は保証されないため、`window`の`load`イベントを待ってから`auth.init()`を呼ぶようにした（`main.ts`の`whenPageLoaded`）。②GISはポップアップを閉じた・ブロックされた等の失敗を`callback`ではなく`error_callback`で通知するため、`error_callback`を登録し`requestAccessToken()`のPromiseが永遠にpendingのまま残らないようにした。同時に、前回の要求が完了しないうちの二重呼び出しも即座にrejectするガードを追加した（`auth.ts`の`pendingReject`）。③`listAudioFilesRecursive`は子フォルダの取得失敗を`failedFolders`に記録して継続する一方、**ルートフォルダ自体の取得失敗は例外としてそのまま呼び出し元に伝える**ようにした（フォルダID誤り・権限無し等を「0件」と誤表示しないため）。④兄弟フォルダの並行走査を導入（直列走査だと大規模ライブラリでレイテンシが積み上がる）した際の副作用として、⑤深い階層で401（トークン失効）が起きても子フォルダの失敗として握りつぶされていた問題を`DriveHttpError`でHTTPステータスを保持し401だけ走査全体を中断するよう修正、⑥並行走査で複数の`ensureAccessToken()`が同時に走ると最初の1件しか実際に更新されず残りが「進行中です」でrejectされ大量のフォルダが失敗扱いになる問題を、進行中の更新Promiseを共有する方式（`auth.ts`の`pendingEnsure`）で解消。あわせて、並行走査自体がAPIを大量同時発行しないよう`ConcurrencyLimiter`（`drive.ts`、既定6並行、暫定値）で全体の同時実行数を制限し、429/5xxには指数バックオフでのリトライ（`createDriveListFn`内）を追加した
  - **OAuthクライアントID未作成（2026-08-19時点）**：Google Cloud Consoleで「ウェブアプリケーション」種別のクライアントIDを新規作成し（`catalog-script`の「デスクトップアプリ」用とは別物）、承認済みJavaScript生成元に`https://honeypawlab.com`・`http://localhost:5173`を追加する必要がある。取得した値は`.env`の`VITE_GOOGLE_CLIENT_ID`に設定する（`.env.example`参照、`.gitignore`済み）。**未設定のままビルドすると、ログイン系コードはVite側のdead code eliminationでバンドルから丸ごと除去され、画面には「未設定」メッセージのみが表示される**（`dist/app.js`が数百バイトのみになるのはこのため。異常ではない）
- **PWA未対応**（`manifest.json`/`sw.js`なし）。Phase 1の認証付きストリーミング設計ではService WorkerをDriveストリーミングプロキシとして使う想定のため、PWA化とSW導入は同時に行う

## 移植元

`ai-workspace/projects/google-drive-music-player/catalog-script/`（使い捨て検証スクリプト）からの移植:

- `src/lib.ts` ← `catalog-script/src/lib.js`：タグ解析・文字化け検出ロジック。`SHEET_HEADER`はcatalog-script実行時の列順のまま残しており、本体のスプレッドシート列（`CONCEPT.md` 4.3節、`_override`列等を含む実際のスキーマ）とは異なる。索引読み書きの実装時に本体スキーマへ合わせて作り直すこと
- `src/rangeTokenizer.ts` ← `catalog-script/src/rangeTokenizer.js`：strtok3の`ITokenizer`実装。Drive呼び出し部分（`fetchRange`関数）は未実装で、コンストラクタに渡す関数として外側から注入する設計のまま（catalog-scriptの`verify-range.js`にあった実際のDrive Range fetch実装はまだ移植していない）

## テスト

- **フレームワーク**: Vitest
- **テストファイル**: `src/lib.test.ts`, `src/rangeTokenizer.test.ts`（移植元の`node:test`ベーステストをVitestに書き換えたもの、内容は同一）、`src/auth.test.ts`（トークン期限判定に加え、フェイクの`window.google`でGISを模擬し`DriveAuth`の`error_callback`処理・多重呼び出しガード・`ensureAccessToken()`の並行共有を検証）、`src/drive.test.ts`（フェイクのフォルダツリーに対する再帰走査・拡張子フィルタ・ページング・子フォルダ失敗時の継続動作・401での走査中断・`ConcurrencyLimiter`の同時実行数制限）
- **実行タイミング**: `npm run build` の prebuild で自動実行。テスト失敗時はビルドが中断される

## ビルド・デプロイ

- `npm run build` — テスト（prebuild）→ ビルド（tsc + vite build）
- `npm run deploy` — ビルド → `dist/app.js` をルート直下にコピー
- deploy 後にコミットするだけで GitHub Pages にデプロイされる（ただし非掲載・URL直踏み運用。`apps/CLAUDE.md`参照）
- vite.config.js の entry-rewrite プラグインが `dev` 実行時に root `index.html` の `./app.js` を `./src/main.ts` に書き換える（`7metch`/`7metch2`と同様の仕組み）

## 次の実装ステップ（着手順の目安）

1. ~~OAuth認証（トークンモデル、`initTokenClient`）＋`drive.readonly`でのファイル一覧取得~~（2026-08-19実装済み、上記参照）
2. Sheets APIでの索引upsert（`CONCEPT.md` 4.3節のスキーマに合わせて`lib.ts`のSHEET_HEADER/buildRowを作り直す）。`spreadsheets`スコープの追加、`sync`タブでの`startPageToken`/`rootFolderId`/`initialScanCompletedAt`管理も含む
3. `rangeTokenizer.ts`用の実Drive `fetchRange`実装、初回スキャンのバッチ処理・中断再開
4. 絞り込み・除外・再生UI、Service Workerストリーミングプロキシ
