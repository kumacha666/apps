# DustyJukebox Tools — 開発ガイド

## 概要

`dusty-jukebox`（Googleドライブ音楽プレイヤー）本体のカタログ補正機能（表記ゆれ統一・文字化け修復）を分離した、必要な時だけ起動する管理ツール。2026-09-06、開発体制#41で表記ゆれ統一に続けて文字化け修復に着手したところ、修復に必要な`encoding-japanese`ライブラリ（CP932変換テーブルを内包、圧縮前で約230KB）の追加で本体の`app.js`が約270kB→499kBへ倍増する見込みとなった（本体は`music-metadata`の都合で`vite.config.js`に`inlineDynamicImports: true`を設定しており、遅延読み込みができない制約があるため）。カタログ補正系機能は普段使わない機能のため、ユーザーとの相談の結果、本体プレイヤーアプリのバンドルから完全に切り離し、この独立アプリへ分離した。

- スキャン・タグ抽出・再生機能は一切持たない。既存の索引スプレッドシート（`index`タブ）を読み書きするだけの単機能ツール
- OAuthクライアントIDは本体`dusty-jukebox`と共用する（Google Identity Servicesのトークンモデルは「承認済みJavaScript生成元」＝オリジン単位で認可するため、同一ドメイン配下の別パス`honeypawlab.com/dusty-jukebox-tools/`は追加のGoogle Cloud Console設定なしで共用できる）。要求スコープは本体と異なり`spreadsheets`のみ（`drive.readonly`は要求しない。音源ファイルには一切アクセスしないため最小権限にした）
- ランディングページには非掲載・URL直踏み運用（本体`dusty-jukebox`や`enblo`/`combrawl`と同じ理由。管理者本人が必要な時だけ使うツールのため）

**現在の状態（2026-09-06）**：初版をPR #423としてマージ済み（`main` `9015d50`）。ChatGPTレビュー1件（P2: `garbledResolved`列を意図的に未使用とする方針の明記、下記「文字化け修復」節参照）に対応済み。**実ブラウザでの動作確認・Playwright E2Eはまだ実施していない**（新規アプリのため）。次回このアプリを触るセッションでまず実機確認を行うこと。

## 移植元

`dusty-jukebox`本体から以下を移植（apps全体の方針「アプリ間のコード共有はしない」に沿い、コピー＋必要な差分を適用したもの。列を追加・変更する場合は本体の`sheets.ts`と両方を更新する必要がある）：

- `src/auth.ts` ← 本体の`src/auth.ts`。トークンモデル・GISの`error_callback`処理・多重呼び出しガード等は同じ設計。要求スコープのみ`SPREADSHEETS_SCOPE`単独に変更（本体は`drive.readonly`+`spreadsheets`）
- `src/lib.ts` ← 本体の`src/lib.ts`から`sheetRange`・`detectGarbled`のみ移植（文字化け判定ロジック自体は無変更）。新規追加として`repairGarbledText`を実装
- `src/sheets.ts` ← 本体の`src/sheets.ts`から、`INDEX_SHEET_HEADER`（27+18+1=46列、本体と完全に同じ列順）・`SheetsHttpError`・`isValidIndexHeader`・`WRITE_BATCH_SIZE`・`createSheetsFetch`・`createSheetsIndexIO`・`columnLetter`のみを移植したサブセット。upsert・重複行マージ・削除・リコンサイル等、スキャン・差分同期に関わるロジックは対象外（本体のみが担当）。`updateRows`（行全体書き込み）・`appendRows`（追記）も実装していない：このアプリは対象`<field>_override`セル1つだけをピンポイント更新する設計のため
- `src/caseNormalization.ts`/`caseNormalization.test.ts` ← 本体で開発体制#41として実装・3ラウンドのレビュー対応を経て実機確認済みだったものをそのまま移植（ロジック自体は無変更）

## 文字化け修復（新規実装）

**文字化けの実際の発生経路**（本体`dusty-jukebox`で実測・確認済み。ai-workspace CONCEPT.md 4.4節の当初の想定〈Shift_JISをLatin1/CP1252に誤読〉とは逆方向）：UTF-8でエンコードされた日本語テキストのバイト列が、何らかの過去の処理でShift_JIS/CP932として誤デコードされた。修復は「その逆をたどる」：文字化けした文字列を再びShift_JIS/CP932のバイト列としてエンコードし直し、それをUTF-8としてデコードすれば元のテキストが復元できる（`repairGarbledText`、`encoding-japanese`ライブラリ使用）。

- **既知の制限（構造的なもの、対応不可）**：一部の文字列は、元の誤デコード時点でUTF-8の2〜3バイト文字の境界とSJIS 2バイト文字の境界がずれ、末尾に中途半端なリードバイトが残ることがある。この場合、誤デコードを行った側（生成元）のデコーダ自身が既に情報を破棄している（不完全な2バイト文字を`?`や置換文字に変換して1文字分の情報を失っている）ため、理論上どのような修復ロジックを使っても元の文字列を復元できない。`repairGarbledText`はこのケースを検出して`null`を返す（誤った値を書き込むより、修復候補に出さず保留する方が安全）。実例は`src/lib.test.ts`参照（「世界が終るまでは」は往復できるが「負けないで」はできない、という違いは入力の文字種・バイト列の並びに依存し、事前に見分ける簡単な方法は無い）。この制限があるため、文字化けと判定された曲のうち一部は修復候補に出てこない（後述「カタログ補正機能の残り」の欠落フィールド一括見直しUI等、人力での修正に委ねる）
- 対象フィールドはtitle/artist/albumArtist/album/composer（本体の`buildIndexRow`が`garbledSuspect`判定に使うのと同じ5フィールド）。Genre（" / "区切りの多値フィールド）は表記ゆれ統一と同じ理由で対象外
- 設計は表記ゆれ統一（`caseNormalization.ts`）と全く同じ安全パターンをそのまま踏襲する（複数ラウンドのレビューで検証済みの設計を独自に再設計しない方針）：対象`<field>_override`セルだけをピンポイント更新、チャンク（200件）ごとに索引を読み直してから書き込み、書き込み直前に元の値（`expectedSourceValue`）が変わっていないか確認、「元に戻す」は一度不一致を観測したエントリを`lastApplied`から永久に除去する
- 表記ゆれ統一と異なり曲同士のグルーピングは無い（1曲＝1候補、合意形成不要）。UIでは候補ごとにチェックボックスで適用対象から個別に除外できる（`planGarbledRepair`の`acceptedKeys`）
- **`garbledSuspect`/`garbledResolved`列は意図的に書き込まない**（2026-09-06、ChatGPTレビュー指摘を受けて検討・確定した方針）。理由：①本体の`buildIndexRow()`はこの2列を`_override`とは異なる「タグ抽出値列」として扱い、フルスキャン（初回スキャン・410 Gone復旧時）で再抽出に成功するたびに無条件で再計算・上書きする（`_override`列だけがこの上書きから保護される）。このアプリが`garbledResolved`にTRUEを書いても、次のフルスキャンで静かにFALSEへ引き戻される。②仮に書き込めたとしても、「どのフィールドが解決済みか」という情報は`<field>_override`の非空判定だけで完全に導出できるため、別列で二重管理する意味が薄い。列自体をスキーマから削除する判断（既存データとの互換性、ai-workspaceのCONCEPT.md更新を伴う）はこのアプリの範囲を超えるため、まずは「このアプリからは触らない」方針をここに明記するにとどめる（列自体の廃止判断は今後、非公開ai-workspace側の設計セッションで改めて検討する）

## UI

`index.html`単一ページ。ログイン（スプレッドシートIDへの`spreadsheets`スコープ）→「表記ゆれ統一」「文字化け修復」の2セクションで、それぞれチェック→適用→元に戻す、の流れ。2機能は同じ`index`タブを読み書きするため、単純な排他フラグ（`operationInProgress`、本体の`CatalogOperationGate`ほど複雑な調整は不要なため簡略化）で同時実行を防ぐ。

## テスト

- **フレームワーク**: Vitest（本体と同じ）
- `src/auth.test.ts`：本体から移植・スコープ変更に合わせて調整
- `src/lib.test.ts`：`detectGarbled`（本体と同じ）、`repairGarbledText`（往復可能な実例・往復不可能な実例〈上記「既知の制限」〉・正常テキストでnullを返すこと・空文字でnullを返すこと）
- `src/sheets.ts`：本体のサブセットのため`createSheetsIndexIO`（リトライ・`readHeaderRow`の`1:1`記法・`updateCells`の単一セル更新）・`isValidIndexHeader`・`columnLetter`をテスト
- `src/caseNormalization.test.ts`：本体からそのまま移植（グルーピング・書き込み直前の鮮度チェック・チャンク単位の再読み込みとセル単位書き込み・stale通知と書き込み成否の分離、いずれも本体で複数ラウンドのレビューを経て検証済みの内容）
- `src/garbledRepair.test.ts`：`caseNormalization.test.ts`と同じ観点（チャンク直前の再読み込み、stale判定の永久除去、書き込み失敗時でもstale通知が失われないこと）を文字化け修復向けに再現
- **実ブラウザでの動作確認・Playwright E2Eはまだ整備していない**（このアプリの初版のため。ユニットテストのみで検証済み）

## ビルド・デプロイ

- `npm run build` — テスト（prebuild）→ ビルド（tsc + vite build）。本体と異なりPlaywright E2Eは無いため`prebuild`はユニットテストのみ
- `npm run deploy` — ビルド → `scripts/copy-dist-app.mjs`で`dist/app.js`をルート直下にコピー（本体と同じくWindows対応のためNode標準の`fs.copyFileSync`を使用、`cp`コマンドは使わない）
- PWA化していない（`manifest.json`/`sw.js`なし）。管理者本人がその場で開いて使うツールのため、オフライン対応・ホーム画面追加は不要と判断
- `app.js`は246.32kB（本体の499kB見込みから、必要な時しか読み込まれないこのアプリへ完全に分離できた）
- 環境変数`VITE_GOOGLE_CLIENT_ID`は本体`dusty-jukebox`と同じ値を使う（Codex Cloud Environment・Claude Code実行セッションのいずれにも既に設定済み、`apps/CLAUDE.md`「dusty-jukebox」節参照）

## 次の実装ステップ

カタログ補正機能の残り（CONCEPT.md 4.4節、`apps/CLAUDE.md`「dusty-jukebox」節参照）：
- 欠落フィールドの一括見直しUI（未着手・仕様未確定）
- Genreの表記ゆれ（表記ゆれ統一・文字化け修復ともに、多値フィールドのトークン分解が必要なため次回以降に据え置いた）
- 外部LLM/Web検索による補完（ユーザーとの相談で、まずローカル情報のみで解決できる範囲〈表記ゆれ・文字化け〉を優先し、この種の機能は別途改めて設計相談することで合意済み）
