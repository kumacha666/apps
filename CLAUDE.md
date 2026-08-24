# apps — 開発コンテキスト

## 概要
`kumacha666/apps`（public）は Honeypaw Lab. の公開アプリ置き場。GitHub Pages（カスタムドメイン `honeypawlab.com`、`CNAME` で設定）で各アプリをディレクトリ単位で公開する。
姉妹リポジトリ `kumacha666/ai-workspace`（private）でブレスト・設計を行い、本リポジトリで実装・公開する。設計・仕様検討の経緯は非公開の姉妹リポジトリ側にあり、本リポジトリからは参照できない。**本リポジトリのみにアクセスするAIエージェント（Codex等）は、本CLAUDE.mdと各アプリの`CLAUDE.md`だけで作業が完結する前提**で運用しており、AI開発ルール（テスト必須化・大規模リファクタリング手順・型システム活用等）は本ファイルの「AI開発ルール」セクションに記載する。

## リポジトリ構成
ルートはアプリのランディングページ（`index.html` + `logo.svg`）。各アプリは独立したトップレベルディレクトリに配置され、ビルド不要な静的PWAと、Vite+TypeScriptでビルドするアプリが混在する。

```
/index.html         ランディングページ（公開中のアプリのみカード表示）
/CNAME               GitHub Pages カスタムドメイン (honeypawlab.com)
/7metch/             パズルゲーム「ナナメッチ」— Vite+TS、ビルド有
/7metch2/            ナナメッチ系列の新作（開発中）— Vite+TS、ビルド有
/7metch-tools/       7metch用デバッグ・プレビュー用の単独HTMLツール群
/combrawl/           カード×オートバトラー・ローグライク「combrawl」（開発中）— Vite+TS、ビルド有
/dusty-jukebox/      Googleドライブ音楽プレイヤー「DustyJukebox」（開発中・雛形段階）— Vite+TS、ビルド有
/enblo/              ローグライクバトラー（開発中）— Vite+TS、ビルド有、Playwright e2e有
/enblo-classic/      enbloの大規模再設計前の完成形（試作品v1）を凍結・独立公開したもの — Vite+TS、ビルド有
/enblo-tools/        enblo用デバッグ・プレビュー用の単独HTMLツール群
/emoji-dm/           絵文字チャット — 静的PWA + Firebase (RTDB/Functions/FCM)
/lifelog/            ライフログ＋ライフコーチ — 静的PWA
/love-lab/           静的PWA
/marvel-checklist/   マーベル映画・ドラマチェックリスト（視聴済み管理＋見るべき度合い評価）— 静的PWA、JSONデータ駆動
/mhwilds-karikan/    モンハンワイルズ計算ツール — 静的PWA、JSONデータ駆動
/mori-no-yakai/      「森の夜会」ワンナイト人狼系アプリ — Vite+TS、ビルド有、Firebase RTDB
/tapu-neko/          シンプルな単独ウィジェット（PWA化なし）
```

- ランディングページ（`index.html`）に掲載されているのは現状 `7metch`・`emoji-dm`・`enblo-classic`・`LifeLog`・`marvel-checklist` のみ。他のアプリは未掲載／開発中で、URLを直接踏んで動作確認する運用。`marvel-checklist`のカードアイコンは`icon-192.png`ではなく`/marvel-checklist/icon.svg`を直接参照している（PNGアイコンを持たないため）。新しいアプリを公開する際は `index.html` の `.apps` セクションにカードを追加する。`mori-no-yakai` は実機での動作確認・機能実装が完了済みだが、**身内利用アプリのため意図的に非掲載**（不特定多数への公開を想定していない、2026-07-11判断。`mori-no-yakai/CLAUDE.md`参照）。著作権的な懸念もあり、部屋の新規作成（ホスト操作）は合言葉ゲートで管理者本人に限定している（2026-07-13、`mori-no-yakai/CLAUDE.md`の「部屋作成（ホスト）の合言葉ゲート」参照）。`enblo-classic` は専用PNGアイコン（`icon-192.png`/`icon-512.png`）が未整備のため、ランディングページのカードは絵文字（⚔️）ベースのdata URI SVGアイコンを使用している（LifeLogカードと同じ手法）。`combrawl` も開発中・有料化検討前段階のため`enblo`と同様に意図的に非掲載（URLを直接踏んで確認する運用）。
- `lifelog/` は2026-07-13、単独リポジトリ `kumacha666/lifelog`（`https://kumacha666.github.io/lifelog/`）から本リポジトリに移行したもの。旧リポジトリは開発終了・クローズ済みで、以後の変更は本ディレクトリ側で行う。データはlocalStorage保存のためoriginをまたいだ自動移行はできない（利用者本人がエクスポート/インポート機能で手動移行）。
- 各アプリディレクトリに固有の `CLAUDE.md` がある場合（例: `7metch/CLAUDE.md`）は、そのアプリを変更する際に必ず参照・遵守する。アプリ固有の開発ルール・テスト方針・チェックリストはそちらに記載されている。

## アプリ種別とアーキテクチャパターン

### A. 静的PWA（ビルド不要）
`emoji-dm`, `lifelog`, `love-lab`, `marvel-checklist`, `mhwilds-karikan` が該当。共通構成:
- `index.html` + `style.css` + `app.js`（バニラJS、フレームワーク無し）
- `manifest.json` + `sw.js`（PWA化、アイコン `icon-192.png` / `icon-512.png`）
- Service Worker はネットワーク優先設計（キャッシュはオフライン用フォールバック）。「新しいバージョンがあります」のような更新トースト通知は、ネットワーク優先では常に最新を取得するため不正確になりやすく、過去に削除された実績がある（`tapu-neko`/`mhwilds-karikan`/`love-lab` 一括追加コミット参照）
- 変更はファイルを直接編集してコミットするだけで GitHub Pages に反映される（ビルドステップなし）
- `tapu-neko` はPWA化されていない最小構成（`manifest.json`はあるが`sw.js`なし）
- `lifelog` はCSS/JSを分離せず、単一の`index.html`にインライン（`style.css`/`app.js`は無い）。アイコンは`manifest.json`内のSVGデータURI（📔）のみで`icon-192.png`/`icon-512.png`ファイルは無い
- `marvel-checklist` は`icon-192.png`/`icon-512.png`のPNGファイルを持たず、単一の`icon.svg`（`sizes: "any"`）を`manifest.json`から参照する方式（PNG生成不要でスケーラブル）。データは`data/movies.json`にMCU（フェイズ別、映画＋Disney+ドラマシリーズをシーズン単位で混在）・ソニー（サム・ライミ版／アメイジング・スパイダーマン／SSU）・フォックス（X-MEN系／ファンタスティック・フォー）・その他（ブレイド等）の作品を`type`（`movie`/`series`）・`releaseDate`付きで収録し、視聴済みフラグと見るべき度合い評価（◎〇△✕、任意項目）は`localStorage`（`marvel-checklist-state-v1`）に保存。未公開作品（`releaseDate`が未来）は視聴済みチェックを無効化しつつ評価のみ設定可能。共有リンク経由で友達のリストを自分の端末にローカル保存・手動編集できる「友達」機能（バックエンド無し・自動同期無し、`marvel-checklist-friends-v1`等に保存）、`data/characters.json`（登場キャラクターの出演作収録、2作品以上に登場するキャラのみ）に基づき各作品カードに「前提作品」（登場人物の理解に先に見ておきたい作品）を表示する機能も持つ。**A系の中で唯一ユニットテストを持つ例外**（ビルドステップは無いが、公開日判定・進捗集計・インポート検証などのロジックを`logic.js`に切り出しており、`npm test`（Node標準テストランナー、`test/logic.test.mjs`）で検証する。`app.js`はDOM描画のみを担当しESモジュールとして`logic.js`を読み込む）。詳細は`marvel-checklist/CLAUDE.md`参照

### B. Vite+TypeScriptビルドアプリ
`7metch`, `7metch2`, `enblo`, `enblo-classic`, `combrawl`, `dusty-jukebox` が該当。共通構成:
- `src/` 配下にTypeScript、`vite.config.js` でビルド設定
- `package.json` の `prebuild` フックで `npm test`（Vitest）を自動実行 → テスト失敗時はビルド自体が止まる
- `npm run deploy` で「ビルド → dist/ を所定の場所にコピー → SWバージョン自動更新」まで1コマンドで完結（手動コピー・手動バージョン更新はしない方針）
- ルート直下に存在する `game.js` / `style.css` / `sw.js` は **ビルド成果物のコピー**（dist/からコピーされたもの）。ソースは常に `src/` 配下を編集すること
- `enblo`/`enblo-classic`/`combrawl`/`7metch` は Playwright による E2E テスト（`e2e/`, `npm run test:e2e`）を持つ。画面遷移の疎通確認用で、ユニットテストの代替ではない（`combrawl`は加えて、特性バッジ等の見た目の重なりを座標で検証する回帰テストも持つ。詳細は各アプリの`CLAUDE.md`参照）。`7metch2`/`mori-no-yakai`は未整備
- **`enblo-classic`は凍結アプリ**。`enblo`の大規模再設計に着手する前の完成形をそのままコピーしたもので、以降は変更しない前提（バグ修正のみ最小対応）
- **`7metch2`は開発中につきPWA未対応**（`manifest.json`/`sw.js`なし、CSSは`index.html`にインライン）。`npm run deploy` は `dist/game.js` のコピーのみで現状の構成としては完結している。公開時にPWA化とdeployスクリプト拡充（manifest/SWコピー・SWバージョン自動更新）を行うこと
- **`dusty-jukebox`は実装初期段階**（`manifest.json`/`sw.js`なし、CSSは`index.html`にインライン、`npm run deploy` は `dist/app.js` のコピーのみ）。OAuth認証（トークンモデル、`drive.readonly`+`spreadsheets`スコープ）＋`drive.readonly`でのファイル一覧取得を実装済み（`src/auth.ts`/`src/drive.ts`）。Sheets索引upsertの最小基盤（スキーマ定義＋fileId起点upsert）も実装済み（`src/sheets.ts`）。実Drive `fetchRange`（`drive.ts`の`createDriveFetchRange`）＋タグ抽出（`src/tagExtraction.ts`、`music-metadata`依存）を`main.ts`のスキャンUIとSheets upsertに結線済みで、フォルダ指定→スキャン→タグ抽出→索引書き込みが一気通貫で動く。`index`/`sync`タブが無ければ自動作成する（`src/sheetsSetup.ts`）ため、事前のタブ手動作成は不要になった。`sync`タブ（`startPageToken`/`rootFolderId`/`initialScanCompletedAt`/`scanRunId`）の読み書き基盤も実装済み（`src/sync.ts`）で、CONCEPT.md所定のルート変更・初期化未完了時のトークン取り扱いルールに従う。初回スキャンはバッチ処理・中断再開に対応済み（200件単位でタグ抽出→書き込みを繰り返し、`scanRunId`（不透明なランダムID、複数デバイスの時計ずれに影響されない）をウォーターマークに中断前の処理済みファイルをスキップして再開する、2026-08-20実装・2026-08-21にscanRunStartedAt〈時刻〉からscanRunIdへ変更）。`changes.list`による実際の差分同期の消費・ルート変更後の旧ルート配下行の削除（リコンサイル）も2026-08-21実装済み（初回スキャン完了後は`main.ts`がフルスキャンでなく`changes.list`消費に切り替わる、`src/differentialSync.ts`）。絞り込み/再生UI・Service Workerストリーミングプロキシは引き続き未実装（索引upsertの重複行マージは2026-08-20実装済み）。`music-metadata`はフォーマットごとのパーサーを内部で`dynamic import()`するため、`vite.config.js`に`inlineDynamicImports: true`を設定し単一の`dist/app.js`に強制的にまとめている（このアプリの`npm run deploy`が`dist/app.js`1本のみをコピーする前提を壊さないため）。ログイン系機能を有効にするには`.env`に`VITE_GOOGLE_CLIENT_ID`（Web用OAuthクライアントID）の設定が必要（未設定時はビルドで自動的に除去され「未設定」表示になる）。詳細は`dusty-jukebox/CLAUDE.md`参照
- 詳細なテスト方針・難易度パラメータ・変更時チェックリストはアプリごとの `CLAUDE.md`（例: `7metch/CLAUDE.md`, `7metch2/CLAUDE.md`, `enblo/CLAUDE.md`, `enblo-classic/CLAUDE.md`, `combrawl/CLAUDE.md`）を参照

### C. 補助ツール
`7metch-tools`（7metch用）、`enblo-tools`（enblo用、音確認ツール等）は本体アプリのデバッグ・プレビュー用に単独で動作するHTMLファイル群。ビルド不要、ブラウザで直接開いて使う。

### D. Vite+TypeScriptビルド + Firebase RTDB（B系とemoji-dmのハイブリッド）
`mori-no-yakai` が該当。ゲームロジック（役職構成・投票集計・勝敗判定）を持つためB系と同じVite+TS+Vitest構成（`prebuild`でテスト自動実行）を採るが、リアルタイム同期は`emoji-dm`と同じFirebase Realtime Databaseを使う（認証・Cloud Functionsは無し、役職の秘密性は信頼ベース）。Firebaseプロジェクトの新規作成・`firebaseConfig`取得は人間の手作業が必要（詳細は`mori-no-yakai/CLAUDE.md`）。詳細は`mori-no-yakai/CLAUDE.md`を参照。

## emoji-dm の特記事項
- Firebase（Realtime Database / Cloud Functions v1 / Cloud Messaging）を使用するアプリ。フロントエンド (`app.js`, `sw.js`) は静的ホスティング（GitHub Pages）、バックエンド (`functions/index.js`) は別途 `firebase deploy` が必要（GitHub Pagesへのpushでは反映されない）
- `sw.js` 内にFirebase設定（apiKey等）がハードコードされているが、これはクライアント向け公開鍵であり機密情報ではない（Firebase Web SDKの仕様）
- プッシュ通知は `database.ref("/rooms/{roomId}/messages/{messageId}").onCreate` トリガーで送信者以外のメンバーにFCM送信。無効化されたトークンは自動的にDBから削除される
- `version.json` でアプリバージョンを管理し、SW更新確認に利用

## Codex実装運用

**appsリポジトリの実装コードはCodexが担い、Claude Codeは書かない**（設計と、実装指示文の作成、PRの最終チェックのみ担当。背景は`ai-workspace/CLAUDE.md`の「AIオーケストレーション」参照）。実装の起動はユーザーがClaude Codeの作った実装指示文をChatGPT Work経由でCodexに渡す形で行う（Claude Codeからの直接タスク割当APIは無いため）。

- appsの実装全般（新規機能・局所的なバグ修正・テスト追加・リファクタリング・CI修正）は Codex が担当する。新規・曖昧な仕様、認証/秘密情報、データ移行、セキュリティ、複数リポジトリの整合は Claude Code の設計判断を先に得てから Codex に渡す
- Codexへの実装指示文には、目的、対象/非対象、制約、受け入れ条件、実行すべきテスト、参照すべきアプリ固有CLAUDE.mdを含める。非公開の背景は実装に必要な最小限だけ handoff または実装指示文に渡す
- **実装指示文の冒頭には「GitHub連携済みのkumacha666/ai-workspace・kumacha666/appsを使い、ローカル作業フォルダへの事前接続を待たずGitHub上で直接確認する」旨を明記する**（経緯は`ai-workspace/CLAUDE.md`の「振り分けと引き継ぎ」・`projects/honeypaw-lab/RETROSPECTIVES.md`参照）
- Codexが作るブランチ名は `codex/<topic>`。`claude/<topic>`はClaude Codeが例外的にドキュメント修正等で直接コミットする場合のみ使う（通常の実装では使わない）。いずれも機能ごとに1PRへ絞る
- **PR作成後、テスト・ビルド・必要なUI検証の結果は最終HEADのSHAと対応付けてPR本文またはコメントに記録する**（本リポジトリはGitHub Actions等のCIが無く、これが無いと「最終HEADのテスト結果を確認する」というマージゲートの手順自体が検証できない）
- PR作成後の自動レビュー指摘のうち**軽微なもの**は、Codex自身の修正提案機能とユーザーの確認・適用で一次対応する。設計変更・アーキテクチャ判断が要る指摘はユーザーが適用ボタンを押さずClaude Codeへ相談する。修正pushへの再レビュー（自動で再トリガーされない場合は`@codex review`を依頼）が完了してから最終チェックに進む
- **既存PRへの追加対応依頼は、Claude CodeがPRコメントへ`@codex review`/`@codex address that feedback`を投稿する形で直接行える**（新規タスクの割り当てとは異なりChatGPT Workの中継は不要）。依頼コメントには失敗しているジョブ・レビュー指摘の内容と、期待する完了条件を明記する。Claude CodeがCodexのPRに関与するのは、①軽微な指摘そのものへの一次対応（ユーザーの確認・適用）には関与しない、②レビューコメントを伴わない通常のCI失敗、③設計判断を要しない実装上の重大な不具合（correctnessバグ等）はClaude Codeが`@codex address that feedback`等で直接Codexに再対応を依頼する、④Codex側の環境要因で対応できない場合の検知、⑤レビューが片付いた後の最終チェック。設計変更を伴う大きな指摘・アーキテクチャ判断はユーザーに戻す。**再対応依頼のpush後は、CIの再実行と最終HEADに対する再レビューの両方が完了するまで最終チェックへ進まない**
- **完了根拠はGitHub上の実体のみ**とする。対象PRブランチにコミットSHAと差分が実在することを確認してから完了扱いにする（Codexの自己申告・ローカル作業・未pushコミットは完了扱いにしない）。マージゲートは必ず最終HEADのSHA基準で判定し（最終HEADのレビュー結果／未解決のスレッド0件〈outdated化しても最終HEADでの解消根拠が無ければ未解決扱い〉／最終HEADに対応したテスト結果／ビルド成果物差分を確認）、古いコミットへのレビュー結果を流用しない（詳細な経緯・マージゲートの手順は`ai-workspace/CLAUDE.md`の「CodexのPR監視」参照）
- **ユーザーがClaude Codeの入力・判断待ちで先に進めなくなった時点（大きな指摘の判断依頼／要件の曖昧さ等の通常の設計相談／Codex側の環境要因のエスカレーション／マージゲート通過でユーザーのマージ待ちになった時／`/code-review`等AIが自分で起動できずユーザーの直接操作が要る時）は、チャット報告に加えて必ず`PushNotification`を送る**。進捗・完了報告・軽微な自律対応では送らない

## AI開発ルール

2026-06-25のインシデント（1日32PRの高速開発で9件のバグ修正PRが発生）を踏まえた開発ルール。

※本セクションのルール本文は姉妹リポジトリ `ai-workspace/CLAUDE.md` の「AI開発ルール」1〜6と同期管理している。片方を変更する場合は必ず両方を更新すること（両リポジトリにアクセスできるエージェントの責務）。

### 原則: 速度を落とすのではなく、速度に耐えるガードレールを先に構築する

### 1. テストなしの変更は禁止
- ゲームロジック・ビジネスロジックを変更する場合、**該当箇所のユニットテストが存在すること**を確認してから変更する
- テストが存在しない場合は、先にテストを書いてから変更する
- 「テスト通過」は品質の証明ではなく、**テスト範囲の証明**。未テスト領域の変更は特に注意する
- **時系列・順序が絡むロジック（誰が先に死んだか、判定の順序、途中で状態が変わる処理等）を「DOM操作を含むから」という理由だけでテスト対象外にしない**。UI描画と切り離せる部分は関数として切り出し、必ずテストする

### 2. 大規模リファクタリングのルール
- モジュール分割・言語移行などの大規模リファクタリングは、**テスト・ガードレールを先に構築してから**実施する
- 1PRに複数の大きな変更を詰め込まない
- リファクタリング後は必ずビルド成果物の動作確認（ビルドチェック・シミュレーション等）を行う

### 3. ビルド・デプロイは完全自動化
- 手動ステップは省略・ミスの原因になる。`npm run deploy` 等の1コマンドで完結させる
- ビルド前にテストを自動実行する（prebuild hook）
- 手動コピー・手動バージョン更新を残さない

### 4. 型システムをAIへのチェックリストとして活用
- union型の分岐は `default: never` で網羅性を保証する（exhaustive check）
- 新しい値を追加した際にコンパイルエラーで更新箇所を検出できるようにする
- AIはセッション間で記憶を持たないが、コンパイラエラーは毎回確実にチェックされる

### 5. CLAUDE.mdに暗黙知を明示する
- AIが参照できない暗黙知は存在しないのと同じ
- 新機能追加時のチェックリスト、依存関係、変更時の注意事項をCLAUDE.mdに記載する
- 変更時チェックリストが存在する場合は必ず参照・遵守する

### 6. AIの検証能力の限界を認識する
- AIは「テストが通る」コードを書けるが、「テストがない仕様が守られている」ことは保証できない
- AIはゲームを「プレイ」しない。ゲームバランスの確認にはシミュレーションテストを使う
- 「Playwrightで確認」「ビルド成功」は必要条件であって十分条件ではない
- **ハッピーパスの通しプレイ（例：最後までクリアできるか）だけでなく、境界ケース（同時死亡・相討ち・処理中に対象が入れ替わる等）を意図的に狙ったテストシナリオを別途用意する**。カード・ルールの説明文と実装を最後に突き合わせる確認も忘れない

## 開発ワークフロー
- ブランチ：機能ごとに切る（Claude Code: `claude/<topic>`、Codex: `codex/<topic>`）
- AIはPR作成までを行う。**mainへのマージは人間がレビューして実行する**（本リポジトリはpublicかつmainへのマージ=即本番デプロイのため）
- PR作成後、ドラフト状態のままにせずready for review状態に変換する（作成ツールがドラフトPRを作る場合）
- 例外: 軽微な修正（typo・ドキュメント・自明な小バグ修正等）に限り、**人間がそのPRを名指しでマージを指示した場合のみ**AIがsquash mergeしてよい。指示なしにAIが自発的にマージすることは禁止
- mainへのマージで GitHub Pages に自動デプロイ（**GitHub Actionsワークフローは存在しない** — Pages設定がmainブランチ直下を直接配信するシンプルな静的ホスティング構成のため、push即反映）
- ビルドが必要なアプリ（7metch, 7metch2, enblo, enblo-classic, combrawl, mori-no-yakai）は、コミット前に `npm run deploy` を実行してビルド成果物をルート直下に反映させてからコミットする
- **コードレビュー**：PR作成後はCodex自動レビューを確認し、最新コミットが未レビューなら `@codex review` を依頼する。appsの実装PRは基本的にCodexが作成するため、`/code-review`はClaude Codeが例外的に直接コミットした場合や高リスク変更の追加セルフレビューとしてのみ使う（通常のCodex実装PRはCodex自動レビュー＋Claude CodeのPR監視でカバーする）。実行した場合はPR本文のTest planに実行有無を明記する。実行を強制する仕組みは無いため、マージ判断をする人間がPR本文で確認する
  - `/code-review`を行う場合、AIは自分自身で起動できない（`disable-model-invocation`設定）。PR作成後、AIはユーザーに「プロンプト欄への直接入力」を依頼する（コピペでは起動しない）
  - 出力は英語になるため、AIは結果を日本語で要約してから対応方針を提示する
  - `--comment`はGitHub関連ツールにアクセスできず機能しないため付けない。PRへの反映は出力を見たAIが`mcp__github__`ツールで手動投稿する
- **視覚的なUI崩れの検証**：CSS/DOM構造/アニメーションに関わる変更を含むPRで、対象アプリにPlaywright E2Eがある場合は、境界ケース（要素の重なりが起きやすい状態）を実際にレンダリングして検証する。E2Eが無いアプリで見た目に関わる変更をした場合は、その旨をPR本文に明記する。**`enblo`/`enblo-classic`/`combrawl`/`7metch`は`npm run build`に`npm run test:e2e`が組み込み済み（`enblo`/`enblo-classic`/`combrawl`は2026-07-22〜23対応`scripts/build.mjs`経由、`7metch`は2026-07-24対応・`prebuild`スクリプト経由。いずれもテスト失敗時はビルドが止まる）。E2Eがまだ無いアプリ（`7metch2`, `mori-no-yakai`）は今後整備予定で、それまではPR本文に「E2E未整備」である旨を明記する**
- 1PRに複数アプリ・複数の大きな変更を詰め込まない（上記「AI開発ルール」参照）
- **新しいアプリディレクトリ（`apps/<name>/`）を追加したら、本CLAUDE.mdの「リポジトリ構成」「アプリ種別とアーキテクチャパターン」セクションに反映し、テスト・ビルド構成があればアプリ固有の`CLAUDE.md`を作成する**（`ai-workspace`の`save-tokens`スキル参照。過去にenblo追加時にこれを怠り、CLAUDE.mdが実態とズレた実績がある）

## コミュニケーション
- 日本語でやりとり
- 実装前の相談は相談として受け、勝手に実装しない
- 判断に迷う場合は選択肢を提示して確認する
