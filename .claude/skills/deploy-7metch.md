# /deploy-7metch — 7metchビルド＆デプロイ

7metchのビルドからGitHub Pagesデプロイまでを一括実行するスキル。

## 前提

- カレントブランチに未コミットの変更がある状態で実行する
- `npm run build` はテスト（Vitest）→ ビルド → ポインタイベントチェックを含む

## 手順

1. **ビルド**: `cd /home/user/apps/7metch && npm run build` を実行。失敗したら中断して原因を報告する

2. **成果物コピー**: `dist/index.html`, `dist/style.css`, `dist/game.js` をルート (`/home/user/apps/7metch/`) にコピー

3. **SWキャッシュバージョン更新**: `sw.js` と `public/sw.js` の両方の `CACHE_NAME` のバージョンをインクリメントする（パッチバージョン +1）

4. **コミット**: 変更ファイルをすべて `git add` してコミットする。コミットメッセージは変更内容に応じて適切に作成する

5. **プッシュ**: `git push -u origin <現在のブランチ名>` でプッシュ。失敗時は最大4回リトライ（2s, 4s, 8s, 16s）

6. **PR作成**: GitHub MCP tools (`mcp__github__create_pull_request`) で PR を作成する。base は `main`

7. **マージコンフリクト対応**: マージに失敗した場合：
   - `git fetch origin main && git merge origin/main --no-edit`
   - ビルド成果物 (`game.js`, `index.html`, `style.css`) と SW ファイルのコンフリクトは `--ours` で解消
   - ソースファイルのコンフリクトは内容を確認して手動解消
   - 再コミット → 再プッシュ → 再マージ

8. **squash merge**: `mcp__github__merge_pull_request` で `merge_method: "squash"` を指定

9. **デプロイ確認**: `mcp__github__actions_get` で workflow run のステータスを確認。`completed` + `success` になるまで待機して結果を報告する

## 注意事項

- PR作成前にユーザーの確認は不要（このスキルが呼ばれた時点で承認済み）
- デプロイ確認はバックグラウンドで待機し、完了したら報告する
- 全ステップのうち1つでも想定外のエラーが出た場合は中断してユーザーに報告する
