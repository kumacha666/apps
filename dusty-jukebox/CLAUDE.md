# DustyJukebox — 開発ガイド

## 開発ルール

リポジトリルートの `CLAUDE.md` の「AI開発ルール」セクションを必ず参照すること。
以下は本プロジェクト固有のルール:

- 設計方針の全体像は非公開の姉妹リポジトリ `ai-workspace/projects/google-drive-music-player/CONCEPT.md` にある（本リポジトリからは参照不可）。メカニクス（絞り込み・除外・保存プレイリスト・文字化け対処等）に関わる変更をする際は、まず`ai-workspace`側のセッションでCONCEPT.mdと照合してから着手すること
- **2026-08-19、OAuth認証（トークンモデル）＋drive.readonlyでのファイル一覧取得を実装**。`src/auth.ts`（Google Identity Services `initTokenClient`の薄いラッパー、期限判定`isTokenValid`はユニットテスト対象）・`src/drive.ts`（フォルダ再帰走査＋拡張子ベースのファイル発見、Drive呼び出しをDIしてユニットテスト可能にした設計。`rangeTokenizer.ts`の`fetchRange`注入と同じ方針）を追加し、`src/main.ts`に最小限のログイン・スキャンUIを実装した。**Sheets索引書き込み・実Rangeフェッチ・絞り込み/再生UIはまだ未着手**
  - **同日、Codexレビュー指摘で計6件修正**：①`<script async>`で読み込むGoogle Identity Servicesの読み込み順序は保証されないため、`window`の`load`イベントを待ってから`auth.init()`を呼ぶようにした（`main.ts`の`whenPageLoaded`）。②GISはポップアップを閉じた・ブロックされた等の失敗を`callback`ではなく`error_callback`で通知するため、`error_callback`を登録し`requestAccessToken()`のPromiseが永遠にpendingのまま残らないようにした。同時に、前回の要求が完了しないうちの二重呼び出しも即座にrejectするガードを追加した（`auth.ts`の`pendingReject`）。③`listAudioFilesRecursive`は子フォルダの取得失敗を`failedFolders`に記録して継続する一方、**ルートフォルダ自体の取得失敗は例外としてそのまま呼び出し元に伝える**ようにした（フォルダID誤り・権限無し等を「0件」と誤表示しないため）。④兄弟フォルダの並行走査を導入（直列走査だと大規模ライブラリでレイテンシが積み上がる）した際の副作用として、⑤深い階層で401（トークン失効）が起きても子フォルダの失敗として握りつぶされていた問題を`DriveHttpError`でHTTPステータスを保持し401だけ走査全体を中断するよう修正、⑥並行走査で複数の`ensureAccessToken()`が同時に走ると最初の1件しか実際に更新されず残りが「進行中です」でrejectされ大量のフォルダが失敗扱いになる問題を、進行中の更新Promiseを共有する方式（`auth.ts`の`pendingEnsure`）で解消。あわせて、並行走査自体がAPIを大量同時発行しないよう`ConcurrencyLimiter`（`drive.ts`、既定6並行、暫定値）で全体の同時実行数を制限し、429/5xxおよびreasonが`rateLimitExceeded`/`userRateLimitExceeded`の403（Drive APIはクォータ超過をこの形でも返す）には指数バックオフでのリトライ（`createDriveListFn`内）を追加した。⑦さらに、401検知後も`ConcurrencyLimiter`のキューに残っていた他の兄弟フォルダの走査が無効なトークンのままAPIを叩き続けていた問題を、共有`AbortController`でキュー未消化のタスクを協調的に打ち切る方式（`listAudioFilesRecursive`内、既に発行済みのHTTPリクエストまでは止められない点は既知の限界）で修正した
  - **同日、さらにCodexレビュー指摘で計4件修正**：⑧`ensureAccessToken()`のサイレント再取得失敗（`auth.ts`の`AuthError`）はDriveHttpError(401)ではないため`isAuthError()`をすり抜け、走査中断につながらず子フォルダの一時失敗として握りつぶされていた問題を、`isAuthError()`が`AuthError`も判定するよう拡張して修正。⑨誤ったフォルダID・権限無しのIDを指定しても`files.list`はルート自体を検証せず単に空の子一覧（200）を返すため「フォルダが空」と「無効なID」を区別できない問題を、スキャン開始前に`files.get`でルートフォルダの存在・種別を確認する`validateRootFolder`（`main.ts`の`handleScan`から呼ぶ）で修正。⑩フォルダを指すショートカット（`shortcutDetails.targetId`）が走査対象外で参照先のサブツリーが丸ごと欠落していた問題を、ショートカットもフォルダとして再帰対象にすることで修正（ファイルを指すショートカットは対象外のまま。祖先フォルダを指す循環参照に対応するため、訪問済みフォルダIDを共有する`visited`セットも追加）。⑪共有ドライブ配下のフォルダをルートに指定すると`files.list`が既定でマイドライブのみを対象にし空のライブラリとして完了してしまう問題を、`supportsAllDrives`/`includeItemsFromAllDrives`パラメータの追加で修正
  - **同日、さらにCodexレビュー指摘で1件修正**：⑫リンク共有のセキュリティ更新が適用されたフォルダへのショートカットは、`shortcutDetails.targetId`だけでは参照先の解決に失敗（404）する。`shortcutDetails.targetResourceKey`を取得し、参照先フォルダへの以降のリクエストに`X-Goog-Drive-Resource-Keys`ヘッダーとして引き継ぐよう修正（`DriveListFn`のシグネチャに`resourceKey`引数を追加）
  - **同日、さらにCodexレビュー指摘で2件修正**：⑬`handleScan()`のcatchが401/AuthError検知時にエラー表示のみでキャッシュ済みトークン（`DriveAuth.state`）を残していたため、再スキャンしても同じ拒否済みトークンを使い続け必ず失敗する問題を、`DriveAuth.clearToken()`を追加し呼び出すことで修正。⑭`fetchDriveApiWithRetry`はHTTPレスポンスを受け取った場合しかリトライ対象にしておらず、`fetch()`自体が例外を投げる一時的な通信断（DNS障害等のTypeError）がそのまま子フォルダの失敗として確定していた問題を、同じリトライ予算で通信例外も扱うよう修正
  - **同日、さらにCodexレビュー指摘で1件修正・2件は見送り**：⑮スキャン失敗時に前回の結果（`result-list`）が残ったままだと、新しいフォルダのエラーと前回の件数が同時に表示され誤認しうる問題を、スキャン開始時に結果欄をクリアするよう修正。**見送った2件**（本アプリの実利用シナリオ＝所有者本人が自分のライブラリのルートフォルダIDを指定、では発生しにくいため）：ルートフォルダ自体がリンク共有のresource key保護対象・フォルダショートカットである場合は未対応（`validateRootFolder`/`createDriveGetFn`は素のフォルダIDのみを想定。配下のショートカット解決・resourceKey引き継ぎは対応済み）
  - **OAuthクライアントID未作成（2026-08-19時点）**：Google Cloud Consoleで「ウェブアプリケーション」種別のクライアントIDを新規作成し（`catalog-script`の「デスクトップアプリ」用とは別物）、承認済みJavaScript生成元に`https://honeypawlab.com`・`http://localhost:5173`を追加する必要がある。取得した値は`.env`の`VITE_GOOGLE_CLIENT_ID`に設定する（`.env.example`参照、`.gitignore`済み）。**未設定のままビルドすると、ログイン系コードはVite側のdead code eliminationでバンドルから丸ごと除去され、画面には「未設定」メッセージのみが表示される**（`dist/app.js`が数百バイトのみになるのはこのため。異常ではない）
- **PWA未対応**（`manifest.json`/`sw.js`なし）。Phase 1の認証付きストリーミング設計ではService WorkerをDriveストリーミングプロキシとして使う想定のため、PWA化とSW導入は同時に行う
- **2026-08-20、Sheets索引upsertの最小基盤を実装**（`src/sheets.ts`）。`CONCEPT.md` 4.3節のindexタブスキーマ（27列、`_override`列を含む）に合わせた`INDEX_SHEET_HEADER`/`buildIndexRow`と、fileId起点のupsert（`upsertIndexRows`：既存行があれば上書き・無ければ末尾に追記）を実装。Sheets APIへの実際のHTTP呼び出しは`SheetsIndexIO`としてDIし（`drive.ts`のDIと同じ方針）、`createSheetsIndexIO`が実実装を提供する。`auth.ts`に`SPREADSHEETS_SCOPE`を追加し、要求スコープを`drive.readonly`と`spreadsheets`の両方（`OAUTH_SCOPES`）にした
  - **このPRの範囲は最小基盤のみ**：`sync`タブ（`startPageToken`/`rootFolderId`/`initialScanCompletedAt`）の管理、重複行のマージ（4.3節）、文字化けの自動修復（`garbledSuspect`は検出するが`garbledResolved`は常にFALSE、4.4節）、巨大ファイルのタイムアウト救済（`extractionFailed`列は用意したが可変タイムアウト自体は未実装、5節）は未着手。`main.ts`のスキャンUIともまだ結線していない（テストデータでの検証のみ）
  - 次のステップ（`rangeTokenizer.ts`用の実Drive `fetchRange`実装、初回スキャンのバッチ処理・中断再開、`sync`タブ管理）に進む前に、実際のフォルダスキャン結果を`buildIndexRow`に渡して`main.ts`から呼び出す配線が必要

## 移植元

`ai-workspace/projects/google-drive-music-player/catalog-script/`（使い捨て検証スクリプト）からの移植:

- `src/lib.ts` ← `catalog-script/src/lib.js`：タグ解析・文字化け検出ロジック。`SHEET_HEADER`はcatalog-script実行時の列順のまま残しており、本体のスプレッドシート列（`CONCEPT.md` 4.3節、`_override`列等を含む実際のスキーマ）とは異なる。索引読み書きの実装時に本体スキーマへ合わせて作り直すこと
- `src/rangeTokenizer.ts` ← `catalog-script/src/rangeTokenizer.js`：strtok3の`ITokenizer`実装。Drive呼び出し部分（`fetchRange`関数）は未実装で、コンストラクタに渡す関数として外側から注入する設計のまま（catalog-scriptの`verify-range.js`にあった実際のDrive Range fetch実装はまだ移植していない）

## テスト

- **フレームワーク**: Vitest
- **テストファイル**: `src/lib.test.ts`, `src/rangeTokenizer.test.ts`（移植元の`node:test`ベーステストをVitestに書き換えたもの、内容は同一）、`src/auth.test.ts`（トークン期限判定に加え、フェイクの`window.google`でGISを模擬し`DriveAuth`の`error_callback`処理・多重呼び出しガード・`ensureAccessToken()`の並行共有を検証）、`src/drive.test.ts`（フェイクのフォルダツリーに対する再帰走査・拡張子フィルタ・ページング・子フォルダ失敗時の継続動作・401/AuthErrorでの走査中断・`ConcurrencyLimiter`の同時実行数制限・フォルダショートカットの解決と循環参照対策・`validateRootFolder`/`createDriveGetFn`）、`src/sheets.test.ts`（`buildIndexRow`の列数・`_override`列が常に空欄・文字化け検出・`extractionFailed`、フェイクの`SheetsIndexIO`に対する`upsertIndexRows`の更新/追記振り分け）
- **実行タイミング**: `npm run build` の prebuild で自動実行。テスト失敗時はビルドが中断される

## ビルド・デプロイ

- `npm run build` — テスト（prebuild）→ ビルド（tsc + vite build）
- `npm run deploy` — ビルド → `dist/app.js` をルート直下にコピー
- deploy 後にコミットするだけで GitHub Pages にデプロイされる（ただし非掲載・URL直踏み運用。`apps/CLAUDE.md`参照）
- vite.config.js の entry-rewrite プラグインが `dev` 実行時に root `index.html` の `./app.js` を `./src/main.ts` に書き換える（`7metch`/`7metch2`と同様の仕組み）

## 次の実装ステップ（着手順の目安）

1. ~~OAuth認証（トークンモデル、`initTokenClient`）＋`drive.readonly`でのファイル一覧取得~~（2026-08-19実装済み、上記参照）
2. ~~Sheets APIでの索引upsert最小基盤（スキーマ定義＋fileId起点upsert）~~（2026-08-20実装済み、上記参照。`sync`タブ管理・重複行マージは未実装のまま残っている）
3. `rangeTokenizer.ts`用の実Drive `fetchRange`実装、初回スキャンのバッチ処理・中断再開（`sync`タブでの`startPageToken`/`rootFolderId`/`initialScanCompletedAt`管理を含む）、`main.ts`のスキャンUIと`sheets.ts`の結線
4. 絞り込み・除外・再生UI、Service Workerストリーミングプロキシ
