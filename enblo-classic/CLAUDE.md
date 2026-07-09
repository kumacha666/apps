# enblo-classic — 開発ガイド

## このアプリについて

`apps/enblo/` の戦闘システム大規模再設計（`ai-workspace/projects/enblo/`配下のブレスト参照 — 非公開の姉妹リポジトリ）に着手する前の完成形（試作品v1）を、独立したアプリとして凍結・公開したもの。

- 旧6ステータス（HP/ATK/DEF/SPD/HIT/CRIT）・旧ダメージ式（`max(1, ATK-DEF)`）・血統システム（共通血統+血統の極意）・タイムアウト=引き分け仕様を含む、再設計前の完成した一つの形
- **今後このディレクトリには機能追加・仕様変更を行わない**（凍結）。バグ修正のみ最小限で対応する
- 再設計後の新しいenbloは `apps/enblo/` で開発を継続する
- コミット単位でも `enblo-v1-prototype-snapshot` ブランチに同内容が保存されている

## テスト・ビルド・デプロイ

`apps/enblo/CLAUDE.md`と同じ構成（Vitest / Playwright E2E / `npm run deploy`）。凍結アプリなので、通常は変更・再デプロイの必要はない。
