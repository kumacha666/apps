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
/enblo/              ローグライクバトラー（開発中）— Vite+TS、ビルド有、Playwright e2e有
/enblo-classic/      enbloの大規模再設計前の完成形（試作品v1）を凍結・独立公開したもの — Vite+TS、ビルド有
/enblo-tools/        enblo用デバッグ・プレビュー用の単独HTMLツール群
/emoji-dm/           絵文字チャット — 静的PWA + Firebase (RTDB/Functions/FCM)
/love-lab/           静的PWA
/mhwilds-karikan/    モンハンワイルズ計算ツール — 静的PWA、JSONデータ駆動
/mori-no-yakai/      「森の夜会」ワンナイト人狼系アプリ — Vite+TS、ビルド有、Firebase RTDB
/tapu-neko/          シンプルな単独ウィジェット（PWA化なし）
```

- ランディングページ（`index.html`）に掲載されているのは現状 `7metch` と `emoji-dm` と `mori-no-yakai` のみ。他のアプリは未掲載／開発中で、URLを直接踏んで動作確認する運用。新しいアプリを公開する際は `index.html` の `.apps` セクションにカードを追加する。
- 各アプリディレクトリに固有の `CLAUDE.md` がある場合（例: `7metch/CLAUDE.md`）は、そのアプリを変更する際に必ず参照・遵守する。アプリ固有の開発ルール・テスト方針・チェックリストはそちらに記載されている。

## アプリ種別とアーキテクチャパターン

### A. 静的PWA（ビルド不要）
`emoji-dm`, `love-lab`, `mhwilds-karikan` が該当。共通構成:
- `index.html` + `style.css` + `app.js`（バニラJS、フレームワーク無し）
- `manifest.json` + `sw.js`（PWA化、アイコン `icon-192.png` / `icon-512.png`）
- Service Worker はネットワーク優先設計（キャッシュはオフライン用フォールバック）。「新しいバージョンがあります」のような更新トースト通知は、ネットワーク優先では常に最新を取得するため不正確になりやすく、過去に削除された実績がある（`tapu-neko`/`mhwilds-karikan`/`love-lab` 一括追加コミット参照）
- 変更はファイルを直接編集してコミットするだけで GitHub Pages に反映される（ビルドステップなし）
- `tapu-neko` はPWA化されていない最小構成（`manifest.json`はあるが`sw.js`なし）

### B. Vite+TypeScriptビルドアプリ
`7metch`, `7metch2`, `enblo`, `enblo-classic` が該当。共通構成:
- `src/` 配下にTypeScript、`vite.config.js` でビルド設定
- `package.json` の `prebuild` フックで `npm test`（Vitest）を自動実行 → テスト失敗時はビルド自体が止まる
- `npm run deploy` で「ビルド → dist/ を所定の場所にコピー → SWバージョン自動更新」まで1コマンドで完結（手動コピー・手動バージョン更新はしない方針）
- ルート直下に存在する `game.js` / `style.css` / `sw.js` は **ビルド成果物のコピー**（dist/からコピーされたもの）。ソースは常に `src/` 配下を編集すること
- `enblo`/`enblo-classic` のみ Playwright による E2E テスト（`e2e/`, `npm run test:e2e`）を持つ。画面遷移（起動→クラス選択→戦闘→強化選択→…→ゲームオーバー）の疎通確認用で、ユニットテストの代替ではない
- **`enblo-classic`は凍結アプリ**。`enblo`の大規模再設計に着手する前の完成形をそのままコピーしたもので、以降は変更しない前提（バグ修正のみ最小対応）
- **`7metch2`は開発中につきPWA未対応**（`manifest.json`/`sw.js`なし、CSSは`index.html`にインライン）。`npm run deploy` は `dist/game.js` のコピーのみで現状の構成としては完結している。公開時にPWA化とdeployスクリプト拡充（manifest/SWコピー・SWバージョン自動更新）を行うこと
- 詳細なテスト方針・難易度パラメータ・変更時チェックリストはアプリごとの `CLAUDE.md`（例: `7metch/CLAUDE.md`, `enblo/CLAUDE.md`, `enblo-classic/CLAUDE.md`）を参照

### C. 補助ツール
`7metch-tools`（7metch用）、`enblo-tools`（enblo用、音確認ツール等）は本体アプリのデバッグ・プレビュー用に単独で動作するHTMLファイル群。ビルド不要、ブラウザで直接開いて使う。

### D. Vite+TypeScriptビルド + Firebase RTDB（B系とemoji-dmのハイブリッド）
`mori-no-yakai` が該当。ゲームロジック（役職構成・投票集計・勝敗判定）を持つためB系と同じVite+TS+Vitest構成（`prebuild`でテスト自動実行）を採るが、リアルタイム同期は`emoji-dm`と同じFirebase Realtime Databaseを使う（認証・Cloud Functionsは無し、役職の秘密性は信頼ベース）。Firebaseプロジェクトの新規作成・`firebaseConfig`取得は人間の手作業が必要（詳細は`mori-no-yakai/CLAUDE.md`）。詳細は`mori-no-yakai/CLAUDE.md`を参照。

## emoji-dm の特記事項
- Firebase（Realtime Database / Cloud Functions v1 / Cloud Messaging）を使用するアプリ。フロントエンド (`app.js`, `sw.js`) は静的ホスティング（GitHub Pages）、バックエンド (`functions/index.js`) は別途 `firebase deploy` が必要（GitHub Pagesへのpushでは反映されない）
- `sw.js` 内にFirebase設定（apiKey等）がハードコードされているが、これはクライアント向け公開鍵であり機密情報ではない（Firebase Web SDKの仕様）
- プッシュ通知は `database.ref("/rooms/{roomId}/messages/{messageId}").onCreate` トリガーで送信者以外のメンバーにFCM送信。無効化されたトークンは自動的にDBから削除される
- `version.json` でアプリバージョンを管理し、SW更新確認に利用

## AI開発ルール

2026-06-25のインシデント（1日32PRの高速開発で9件のバグ修正PRが発生）を踏まえた開発ルール。

※本セクションのルール本文は姉妹リポジトリ `ai-workspace/CLAUDE.md` の「AI開発ルール」1〜6と同期管理している。片方を変更する場合は必ず両方を更新すること（両リポジトリにアクセスできるエージェントの責務）。

### 原則: 速度を落とすのではなく、速度に耐えるガードレールを先に構築する

### 1. テストなしの変更は禁止
- ゲームロジック・ビジネスロジックを変更する場合、**該当箇所のユニットテストが存在すること**を確認してから変更する
- テストが存在しない場合は、先にテストを書いてから変更する
- 「テスト通過」は品質の証明ではなく、**テスト範囲の証明**。未テスト領域の変更は特に注意する

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

## 開発ワークフロー
- ブランチ：機能ごとにブランチを切る（命名例: `claude/<topic>-<id>`）
- AIはPR作成までを行う。**mainへのマージは人間がレビューして実行する**（本リポジトリはpublicかつmainへのマージ=即本番デプロイのため）
- 例外: 軽微な修正（typo・ドキュメント・自明な小バグ修正等）に限り、**人間がそのPRを名指しでマージを指示した場合のみ**AIがsquash mergeしてよい。指示なしにAIが自発的にマージすることは禁止
- mainへのマージで GitHub Pages に自動デプロイ（**GitHub Actionsワークフローは存在しない** — Pages設定がmainブランチ直下を直接配信するシンプルな静的ホスティング構成のため、push即反映）
- ビルドが必要なアプリ（7metch, 7metch2, enblo）は、コミット前に `npm run deploy` を実行してビルド成果物をルート直下に反映させてからコミットする
- 1PRに複数アプリ・複数の大きな変更を詰め込まない（上記「AI開発ルール」参照）
- **新しいアプリディレクトリ（`apps/<name>/`）を追加したら、本CLAUDE.mdの「リポジトリ構成」「アプリ種別とアーキテクチャパターン」セクションに反映し、テスト・ビルド構成があればアプリ固有の`CLAUDE.md`を作成する**（`ai-workspace`の`save-tokens`スキル参照。過去にenblo追加時にこれを怠り、CLAUDE.mdが実態とズレた実績がある）

## コミュニケーション
- 日本語でやりとり
- 実装前の相談は相談として受け、勝手に実装しない
- 判断に迷う場合は選択肢を提示して確認する
