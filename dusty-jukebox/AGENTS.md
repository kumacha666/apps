# AGENTS.md — dusty-jukebox 固有ルール

apps/AGENTS.md（共通Execution Contract）を前提とし、本ファイルはdusty-jukebox固有の実行・検証ルールのみを記載する。

## コマンド
- 依存インストール：npm install
- ユニットテスト：npm test（Vitest）
- ビルド：npm run build（prebuildフックでnpm testとE2Eゲートが自動実行される。テスト失敗時はビルドが止まる）
- E2E単体実行：npm run test:e2e（Playwright）
- デプロイ相当：npm run deploy（ビルド→dist/コピー→SWバージョン更新）。実クライアントID（VITE_GOOGLE_CLIENT_ID）はCodex Cloud Environmentの環境変数として設定済み（2026-09-02〜）のため、他のビルドアプリと同様、毎回npm run deployを実行しdist/app.js等の成果物もコミットに含める。万一VITE_GOOGLE_CLIENT_IDが未設定の環境で実行すると、公開中のビルド成果物を劣化ビルド（ログイン系機能が丸ごと除去されたもの）で上書きしてしまうため、環境変数が確認できない場合はnpm run deployを実行せず、その旨とビルド差分の確認結果をPR本文に明記する

## Environment evidence（本アプリでの具体項目）
apps/AGENTS.md「7. 環境依存能力（preflight）」および「8. E2E（実ブラウザ）テスト」を参照する。本アプリはpackage.jsonに`test:e2e`を持つE2E対応アプリであり、共通ルールで定めるChromium・OS依存ライブラリ・E2E結果のEnvironment evidenceを重複なく適用する。加えて、`npm test`および`npm run build`の結果を記録する。

## Chromium / Playwright
- Codex Cloud上で`npm run test:e2e`を実行し、結果を報告してよい。実行不能時のnot runの扱いと記録内容は、apps/AGENTS.md「8. E2E（実ブラウザ）テスト」に従う。
- apps/CLAUDE.mdの既存の独立検証方針により、Claude Codeが別途独立して再検証する場合がある。

## モック境界（e2e/google-mocks.ts）
- Google Identity Services（GIS）、Drive API、Sheets APIはモックする。Service Worker自体（sw.js）は本物のブラウザ機構をそのまま使い、無効化・モック化しない。
- モックのスキーマ・定数（INDEX_SHEET_HEADER等）は本体のsrc/から直接importする。手で転記して二重管理しない。
- 「〜がSheetsに書き込まれた」ことを検証するテストは、書き込み対象のタブ名（index/sync）と内容まで区別して検証する。書き込みの有無だけでは不十分（reconcileIndexAgainstRoot等、目的の書き込みと無関係な書き込みが発生しうるため）。この種の書き込み検証テストは偽陽性リスクがあるため、apps/AGENTS.mdの「テスト・検証」記載の無効化確認（対象コードを一時的に無効化してテストが失敗することを確認）の対象とする。

## 環境変数
- VITE_GOOGLE_CLIENT_IDが未設定の場合、ログイン系機能はビルド時に自動的に除去され「未設定」表示になる（想定通りの挙動であり、E2E用にはplaywright.config.ts側でVITE_E2E等のテスト用環境変数を設定する）。
- Codex Cloud Environmentの環境変数として実クライアントIDが設定済み（2026-09-02〜）。この値は秘密情報ではない（クライアント側に埋め込まれる前提のOAuthクライアントIDであり、GitHub PATのような機密とは性質が異なる）ため、PR本文・コミットメッセージに含めても問題ないが、無関係な出力に混入させない一般的な注意は払うこと。

## 既知の制限（対応不要・再指摘不要）
- PR #387時点の既知のP2事項（stale-AbortErrorの表示、単曲再生とキュー移動の競合時の上書き挙動）はCLAUDE.md記載の通りKnown Limitationとして扱う。新規タスクで再指摘・再修正を求められない限り対応不要。
