# mori-no-yakai（森の夜会）— 開発ガイド

## このアプリについて

身内でスマホを使ってリアルタイムに遊べる正体隠匿ゲーム（ワンナイト人狼系）。商標配慮のため独自の動物モチーフにリネームしている。設計の経緯・意思決定は非公開の姉妹リポジトリ `ai-workspace/projects/mori-no-yakai/SPEC.md` を参照（本リポジトリのみのAIエージェントからは読めないため、以下に実装に必要な情報を転記する）。

## 役職マッピング

| 名称 | 絵文字 | 陣営 | 元ネタ | 夜アクション |
|---|---|---|---|---|
| うさぎ | 🐰 | 森 | 村人 | なし |
| おおかみ | 🐺 | おおかみ | 人狼 | 2匹以上→お互いを確認。1匹（一匹狼）→中央カード1枚を見られる |
| ふくろう | 🦉 | 森 | 占い師 | 他プレイヤー1人 or 中央2枚のどちらかを見る |
| きつね | 🦊 | 森 | 怪盗 | 他プレイヤー1人と自分のカードを交換し、新しい役職を確認 |
| 子狼 | 🐾 | おおかみ | 人狼騙し(Minion) | おおかみが誰かを確認（自分の正体はおおかみ側には明かされない） |

夜の進行順（固定）: `おおかみ → 子狼 → ふくろう → きつね`（`src/roles.ts` の `NIGHT_ORDER`）

## 役職構成（ロビーでホストが調整可能）

固定アルゴリズムではなく、ロビー画面でホストが以下を自由に設定できる（`src/roles.ts`）。

- 中央カード枚数: 2枚 or 3枚
- おおかみの数: 0〜（+/-で調整）
- ふくろう・きつね・子狼: それぞれON/OFF
- うさぎの数は「プレイヤー数+中央枚数−他の役職合計」で自動算出（マイナスになる構成は不正、`isValidRoleConfig`でブロック）

デフォルト値（`defaultRoleConfig`）: おおかみは5人以下なら1・6人以上なら2、ふくろう/きつね/子狼は全てON、中央3枚。**この構成を変更する場合は `src/__tests__/roles.test.ts` の期待値も合わせて更新すること。**

## フェーズ状態遷移

```
lobby → night → discuss → vote → result → (もう一度あそぶ) → lobby
```

- 遷移はCloud Functionsを使わず、各クライアントが1秒ごとに `maybeAdvancePhase()`（`src/roomSync.ts`）を呼び、RTDB上の期限タイムスタンプ（`nightStepEndsAt`/`discussEndsAt`/`voteEndsAt`）が過ぎていれば `runTransaction()` で進める。トランザクションなので複数クライアントが同時に呼んでも二重遷移しない
- ゲーム開始（役職シャッフル・配布）は `startGame()` が部屋ルート（`rooms/{roomId}`）全体をトランザクションで一括更新する。`state` と `members` を同時に読んで書く必要があるため、`state`単体ではなく部屋ルートを対象にしている
- 投票フェーズはタイムアウトに加え、オンライン全員が投票済みなら `maybeCloseVoteEarly()` で早期に締め切る
- 勝敗判定・投票集計は `src/gameLogic.ts` の `tallyVotes` / `determineWinner`（**currentRole基準**。きつねの交換後の役職で判定する）

## 役職の秘密性について（重要）

**認証・DBルールによる厳密な隠蔽はしていない**（身内向けの信頼ベース、`apps/emoji-dm`と同方針）。RTDBの `/rooms` 以下は誰でも読み書き可能（`database.rules.json`）。UI上は「自分の役職しか表示しない」ことで実質的に守られる設計。ブラウザの開発者ツールを意図的に開けば他人の役職を見ることは理論上可能だが、これは意図した設計判断（実装規模とのトレードオフ、`ai-workspace/projects/mori-no-yakai/SPEC.md` 参照）。厳密な隠蔽が必要になった場合は匿名認証+DBルール+Cloud Functionsでの役職割当が必要になり、実装規模が大きく変わるため、着手前に姉妹リポジトリ側の設計ドキュメントを更新すること。

## Firebaseセットアップ（人間の手作業が必要・未実施）

このアプリはFirebase Realtime Databaseを使うが、**Firebaseプロジェクトはまだ作成されていない**（AIエージェントにはFirebase CLI・認証情報がないため作成できない）。実際にスマホ間で動かすには以下を1回だけ人間が行う必要がある。

1. [Firebaseコンソール](https://console.firebase.google.com/)（AI学習用アカウント）で新規プロジェクトを作成（プロジェクトIDは `.firebaserc` の `mori-no-yakai` に合わせるか、取れなければ別名にして `.firebaserc` も更新する）
2. Realtime Database を有効化（ロケーションは他アプリに合わせて `asia-southeast1` 推奨、テストモードで可。認証は使わない）
3. プロジェクト設定でWebアプリを登録し、表示された `firebaseConfig`（apiKey・databaseURL等）を `src/firebase.ts` のプレースホルダーと置き換える
4. `firebase deploy --only database`（Firebase CLIログイン後）でルール（`database.rules.json`）を反映。または Realtime Database のコンソール画面で直接貼り付けてもよい

GitHub Pagesへのpushではこのバックエンド設定は反映されない（`apps/emoji-dm`と同様、静的ホスティングとFirebase設定は別工程）。

## テスト・ビルド・デプロイ

Vite + TypeScript構成（`7metch`/`enblo`と同様）。

- `npm test`: Vitestでユニットテスト実行。`src/roles.ts`（役職構成アルゴリズム、3〜8人の内訳・中央2/3枚・不正構成の検証）と `src/gameLogic.ts`（投票集計・勝敗判定）が対象。**ゲームロジックを変更する場合は必ず対応するテストも更新すること**（`apps/CLAUDE.md` AI開発ルール1）
- `npm run build`: `prebuild`フックで自動的に`npm test`が走る。Vite entry rewriteプラグイン（`vite.config.js`）で `index.html` の `./game.js` 参照を `./src/main.ts` に差し替えてビルドする点に注意（他アプリと同じ7metchパターン）
- `npm run deploy`: ビルド→`dist/game.js`/`style.css`/`manifest.json`をルート直下にコピー→`scripts/update-sw-version.mjs`でバージョン自動更新（`package.json`のパッチバージョンをインクリメントし、`sw.js`のキャッシュ名と`version.json`を同期）
- アイコン（`icon-192.png`/`icon-512.png`）は依存パッケージなしで`scripts/generate-icons.mjs`が生成する三日月アイコン。デザインを変更する場合はこのスクリプトを編集して再生成する

## 実装メモ

- `src/roomSync.ts` はRTDB I/Oのラッパーで、純粋なゲームロジック（`roles.ts`/`gameLogic.ts`）を呼び出す形にしている。RTDB自体のユニットテストはしていない（emoji-dmの`app.js`と同様、I/O層はテスト対象外）
- 部屋コード生成（5文字、`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`）は`apps/emoji-dm`のパターンを踏襲
- v1では未実装: アプリ内チャット・音声、拡張役職（Doppelganger/Mason/Troublemaker/Drunk/Insomniac相当）、リロード後の完全な状態復元、観戦モード
