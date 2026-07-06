# apps — 開発コンテキスト

## 概要
`kumacha666/apps`（public）は Honeypaw Lab. の公開アプリ置き場。GitHub Pages（カスタムドメイン `honeypawlab.com`、`CNAME` で設定）で各アプリをディレクトリ単位で公開する。
姉妹リポジトリ `kumacha666/ai-workspace`（private）でブレスト・設計を行い、本リポジトリで実装・公開する。詳細なAI開発ルール（テスト必須化・大規模リファクタリング手順・型システム活用等）は `ai-workspace/CLAUDE.md` の「AI開発ルール」セクションを必ず参照すること。

## リポジトリ構成
ルートはアプリのランディングページ（`index.html` + `logo.svg`）。各アプリは独立したトップレベルディレクトリに配置され、ビルド不要な静的PWAと、Vite+TypeScriptでビルドするアプリが混在する。

```
/index.html         ランディングページ（公開中のアプリのみカード表示）
/CNAME               GitHub Pages カスタムドメイン (honeypawlab.com)
/7metch/             パズルゲーム「ナナメッチ」— Vite+TS、ビルド有
/7metch2/            ナナメッチ系列の新作（開発中）— Vite+TS、ビルド有
/7metch-tools/       7metch用デバッグ・プレビュー用の単独HTMLツール群
/enblo/              ローグライクバトラー（開発中）— Vite+TS、ビルド有、Playwright e2e有
/enblo-tools/        enblo用デバッグ・プレビュー用の単独HTMLツール群
/emoji-dm/           絵文字チャット — 静的PWA + Firebase (RTDB/Functions/FCM)
/love-lab/           静的PWA
/mhwilds-karikan/    モンハンワイルズ計算ツール — 静的PWA、JSONデータ駆動
/tapu-neko/          シンプルな単独ウィジェット（PWA化なし）
```

- ランディングページ（`index.html`）に掲載されているのは現状 `7metch` と `emoji-dm` のみ。他のアプリは未掲載／開発中で、URLを直接踏んで動作確認する運用。新しいアプリを公開する際は `index.html` の `.apps` セクションにカードを追加する。
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
`7metch`, `7metch2`, `enblo` が該当。共通構成:
- `src/` 配下にTypeScript、`vite.config.js` でビルド設定
- `package.json` の `prebuild` フックで `npm test`（Vitest）を自動実行 → テスト失敗時はビルド自体が止まる
- `npm run deploy` で「ビルド → dist/ を所定の場所にコピー → SWバージョン自動更新」まで1コマンドで完結（手動コピー・手動バージョン更新はしない方針）
- ルート直下に存在する `game.js` / `style.css` / `sw.js` は **ビルド成果物のコピー**（dist/からコピーされたもの）。ソースは常に `src/` 配下を編集すること
- `enblo` のみ Playwright による E2E テスト（`e2e/`, `npm run test:e2e`）を持つ。画面遷移（起動→クラス選択→戦闘→強化選択→…→ゲームオーバー）の疎通確認用で、ユニットテストの代替ではない
- 詳細なテスト方針・難易度パラメータ・変更時チェックリストはアプリごとの `CLAUDE.md`（例: `7metch/CLAUDE.md`, `enblo/CLAUDE.md`）を参照

### C. 補助ツール
`7metch-tools`（7metch用）、`enblo-tools`（enblo用、音確認ツール等）は本体アプリのデバッグ・プレビュー用に単独で動作するHTMLファイル群。ビルド不要、ブラウザで直接開いて使う。

## emoji-dm の特記事項
- Firebase（Realtime Database / Cloud Functions v1 / Cloud Messaging）を使用するアプリ。フロントエンド (`app.js`, `sw.js`) は静的ホスティング（GitHub Pages）、バックエンド (`functions/index.js`) は別途 `firebase deploy` が必要（GitHub Pagesへのpushでは反映されない）
- `sw.js` 内にFirebase設定（apiKey等）がハードコードされているが、これはクライアント向け公開鍵であり機密情報ではない（Firebase Web SDKの仕様）
- プッシュ通知は `database.ref("/rooms/{roomId}/messages/{messageId}").onCreate` トリガーで送信者以外のメンバーにFCM送信。無効化されたトークンは自動的にDBから削除される
- `version.json` でアプリバージョンを管理し、SW更新確認に利用

## 開発ワークフロー
- ブランチ：機能ごとにブランチを切る（命名例: `claude/<topic>-<id>`）
- PR作成後、squash mergeでmainにマージ
- mainへのマージで GitHub Pages に自動デプロイ（**GitHub Actionsワークフローは存在しない** — Pages設定がmainブランチ直下を直接配信するシンプルな静的ホスティング構成のため、push即反映）
- ビルドが必要なアプリ（7metch, 7metch2, enblo）は、コミット前に `npm run deploy` を実行してビルド成果物をルート直下に反映させてからコミットする
- 1PRに複数アプリ・複数の大きな変更を詰め込まない（`ai-workspace/CLAUDE.md` のAI開発ルール参照）

## コミュニケーション
- 日本語でやりとり
- 実装前の相談は相談として受け、勝手に実装しない
- 判断に迷う場合は選択肢を提示して確認する
