# AGENTS.md — dusty-jukebox 固有ルール

apps/AGENTS.md（共通Execution Contract）を前提とし、本ファイルはdusty-jukebox固有の実行・検証ルールのみを記載する。

## コマンド
- 依存インストール：npm install
- ユニットテスト：npm test（Vitest）
- ビルド：npm run build（prebuildフックでnpm testとE2Eゲートが自動実行される。テスト失敗時はビルドが止まる）
- E2E単体実行：npm run test:e2e（Playwright）
- デプロイ相当：npm run deploy（ビルド→dist/コピー→SWバージョン更新。実クライアントID（VITE_GOOGLE_CLIENT_ID）が.envに無い環境で実行すると、公開中のビルド成果物を劣化ビルドで上書きするため、.envが無い・ダミーの環境ではnpm run deployを実行しない）

## Environment evidence（本アプリでの具体項目）
apps/AGENTS.md「7. 環境依存能力（preflight）」の「適用可能なtest/build/E2E結果」は、本アプリでは以下を指す：
- npm testの結果（passed・failed・not runのいずれか）
- npm buildの結果（passed・failed・not runのいずれか）
- Chromiumの有無（available・unavailable）
- npm run test:e2e（またはビルド組み込みのE2Eゲート）の結果（passed・failed・not runのいずれか）

## Chromium / Playwright
- このサンドボックスで実Chromiumが利用できるとは限らない。npm run test:e2e（またはビルド組み込みのE2Eゲート）が実行できない場合は、その旨と原因（例：Chromiumインストール不可）を最終報告に明記し、「not run」として扱う。実行できなかったことを理由にコード変更自体を止めない。
- 実ブラウザでの最終検証はClaude Code側の環境で別途行われる前提。E2Eのコード（e2e/配下）は書くが、自己の実行成功をもって「E2E確認済み」と報告しない。

## モック境界（e2e/google-mocks.ts）
- Google Identity Services（GIS）、Drive API、Sheets APIはモックする。Service Worker自体（sw.js）は本物のブラウザ機構をそのまま使い、無効化・モック化しない。
- モックのスキーマ・定数（INDEX_SHEET_HEADER等）は本体のsrc/から直接importする。手で転記して二重管理しない。
- 「〜がSheetsに書き込まれた」ことを検証するテストは、書き込み対象のタブ名（index/sync）と内容まで区別して検証する。書き込みの有無だけでは不十分（reconcileIndexAgainstRoot等、目的の書き込みと無関係な書き込みが発生しうるため）。この種の書き込み検証テストは偽陽性リスクがあるため、apps/AGENTS.mdの「テスト・検証」記載の無効化確認（対象コードを一時的に無効化してテストが失敗することを確認）の対象とする。

## 環境変数
- VITE_GOOGLE_CLIENT_IDが未設定の場合、ログイン系機能はビルド時に自動的に除去され「未設定」表示になる（想定通りの挙動であり、E2E用にはplaywright.config.ts側でVITE_E2E等のテスト用環境変数を設定する）。

## 既知の制限（対応不要・再指摘不要）
- PR #387時点の既知のP2事項（stale-AbortErrorの表示、単曲再生とキュー移動の競合時の上書き挙動）はCLAUDE.md記載の通りKnown Limitationとして扱う。新規タスクで再指摘・再修正を求められない限り対応不要。
