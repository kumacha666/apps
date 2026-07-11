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
lobby → night（役職ごとに複数ステップ） → discuss → vote → result → (もう一度あそぶ) → lobby
```

- **すべてのフェーズ遷移用トランザクションは部屋ルート（`rooms/{roomId}`）に統一すること。** `state`単体を対象にしたトランザクション（例: 旧`maybeAdvancePhase`）を混在させると、RTDBは異なるパスに対するトランザクション同士の排他性を保証しないため、`startGame`/`resetToLobby`等の部屋ルート・トランザクションと競合し、フェーズが巻き戻る・メンバー情報が消えるといった不整合が起きる（2026-07-11、3人プレイで1人切断後の再戦時にホストから他プレイヤーが見えなくなる不具合として実際に発生）
- 遷移はCloud Functionsを使わず、各クライアントが1秒ごとに `maybeAdvancePhase()`（`src/roomSync.ts`、部屋ルート・トランザクション）を呼び、RTDB上の期限タイムスタンプ（`nightStepEndsAt`/`discussEndsAt`/`voteEndsAt`）が過ぎていれば進める。トランザクションなので複数クライアントが同時に呼んでも二重遷移しない。実際のフェーズ遷移ロジックは `advanceNightState`/`advanceDiscussState`/`advanceVoteState`（`src/gameLogic.ts`、純粋関数・ユニットテスト対象）に切り出し、タイマー経路と早期締切経路の両方から共用する
- ゲーム開始（役職シャッフル・配布）は `startGame()` が部屋ルート全体をトランザクションで一括更新する。**配札対象はオンラインのメンバーのみ**（切断した幽霊メンバーには配らない）。**RTDBはトランザクション結果に`undefined`を含む値を拒否する**ため、フィールドのクリアは代入ではなく`delete`で行うこと（`startGame`/`resetToLobby`参照）
- **夜アクションの制限時間はロビーでホスト調整可能**（`state.nightStepDurationMs`、既定30秒、`NIGHT_STEP_DURATION_OPTIONS_MS`）。デフォルトが短すぎて操作できないまま次に進んでしまう問題があったため、初期実装の固定8秒から変更した。この設定の追加前に作られた部屋データには`nightStepDurationMs`が存在しないため、読み取り側（`advanceNightState`/`startGame`）は必ず`?? DEFAULT_NIGHT_STEP_DURATION_MS`でフォールバックすること（欠けたまま`Date.now() + undefined`を書き込もうとするとNaNになり、RTDBがトランザクション結果を拒否してゲームが進行不能になる）
- `state.roundNumber` は `startGame()` のたびにインクリメントする。夜フェーズのUI（`src/ui/night.ts`）はローカルの操作状態（つぎへタップ済みフラグ等）を`nightStepIndex`だけでなく`roundNumber`とのペアでリセットする。片方だけで判定すると、前の対局が最初の夜ステップ（index 0）のみで終わり、次の対局も最初のステップがindex 0になるケースでリセットされず、タップ済み状態が誤って持ち越されてしまう
- 夜の各ステップは、時間切れに加えて**オンラインの参加者全員が「つぎへ」をタップしたら早期に次へ進む**（`markNightReady()`→`maybeCloseNightStepEarly()`、判定は純粋関数`isNightStepComplete()`）。**該当役職の人だけがタップできる設計にすると、タップの有無・タイミングで誰が何の役職か推測できてしまう**ため、待機中の人も含めた全員に同じ「つぎへ」ボタンを表示し、全員のタップを揃えてから進む。**「つぎへ」タップ後は役職アクションのボタンを配線しない**（読み取り専用表示に切り替える）。配線したままだと、他の全員が先に準備完了して夜フェーズを抜けた後にきつねの交換などが実行され、議論開始後に役職が変わってしまう恐れがある
- 投票は `submitVote()` が部屋ルートのトランザクションで**フェーズがvoteであることを検証してから**書き込む（締切後の遅延票が確定済みの結果を覆さないため）。タイムアウトに加え、配札済みかつオンラインの全員が投票済みなら `maybeCloseVoteEarly()` で早期に締め切る
- 勝敗判定・投票集計は `src/gameLogic.ts` の `tallyVotes` / `determineWinner`（**currentRole基準**。きつねの交換後の役職で判定する）。**誰も2票以上を得なければ誰も脱落しない（平和村ルール）**。おおかみ不在時は「誰も脱落しない」または「唯一のおおかみ陣営である子狼が脱落」で森陣営の勝利
- 集計・結果表示・投票対象は**配札されたプレイヤー（`originalRole`を持つメンバー、`participants()`）**を基準にする。オンライン状態を基準にすると、切断しただけで集計や勝敗が変わってしまうため
- ホスト（`state.hostId`）がオフラインの間は、`effectiveHostId()`（`src/gameLogic.ts`）により最古参のオンラインメンバーがホスト権限（ゲーム開始・設定変更・再戦）を引き継ぐ。全クライアントが同じ入力から決定的に同じ結果を得るため、RTDBへの書き込みは不要
- リロード・再入室時（`joinRoom()`）は既存メンバーの `originalRole`/`currentRole`/`vote` を保持し、プロフィール・プレゼンスのみ更新する（`set`で上書きしない）
- **スマホのスリープ・タブのバックグラウンド化からの復帰時**は、WebSocket切断で`onDisconnect`が発火し`online:false`になったままになる（復帰しても自動では`online:true`に戻らない）。`main.ts`で`visibilitychange`/`pageshow`/`online`イベントから`markOnline()`（`src/roomSync.ts`）を呼び、プレゼンスと`onDisconnect`ハンドラを再登録すること

## 役職の秘密性について（重要）

**認証・DBルールによる厳密な隠蔽はしていない**（身内向けの信頼ベース、`apps/emoji-dm`と同方針）。RTDBの `/rooms` 以下は誰でも読み書き可能（`database.rules.json`）。UI上は「自分の役職しか表示しない」ことで実質的に守られる設計。ブラウザの開発者ツールを意図的に開けば他人の役職を見ることは理論上可能だが、これは意図した設計判断（実装規模とのトレードオフ、`ai-workspace/projects/mori-no-yakai/SPEC.md` 参照）。厳密な隠蔽が必要になった場合は匿名認証+DBルール+Cloud Functionsでの役職割当が必要になり、実装規模が大きく変わるため、着手前に姉妹リポジトリ側の設計ドキュメントを更新すること。

## Firebaseセットアップ（完了済み）

Firebaseプロジェクト `mori-no-yakai`（AI学習用アカウント、Realtime Database: `asia-southeast1`）を作成・Realtime Database有効化・`src/firebase.ts`への実設定反映・DBルール（`database.rules.json`の内容をコンソールに直接貼り付け）まで完了済み（2026-07-11）。GitHub Pagesへのpushではこのバックエンド設定は反映されない（`apps/emoji-dm`と同様、静的ホスティングとFirebase設定は別工程）ため、今後Firebase側の設定を変更する場合はコンソールでの作業が別途必要になる点に注意。

ランディングページ（リポジトリルートの`index.html`）へのアプリカード掲載は、実機での動作確認が完了してから別途行う。

## テスト・ビルド・デプロイ

Vite + TypeScript構成（`7metch`/`enblo`と同様）。

- `npm test`: Vitestでユニットテスト実行。`src/roles.ts`（役職構成アルゴリズム、3〜8人の内訳・中央2/3枚・不正構成の検証）と `src/gameLogic.ts`（投票集計・勝敗判定・夜ステップ全員タップ判定・フェーズ遷移の純粋関数）が対象。**ゲームロジックを変更する場合は必ず対応するテストも更新すること**（`apps/CLAUDE.md` AI開発ルール1）
- `npm run build`: `prebuild`フックで自動的に`npm test`が走る。Vite entry rewriteプラグイン（`vite.config.js`）で `index.html` の `./game.js` 参照を `./src/main.ts` に差し替えてビルドする点に注意（他アプリと同じ7metchパターン）
- `npm run deploy`: **先に**`scripts/update-sw-version.mjs`でバージョン自動更新（`package.json`のパッチバージョンをインクリメントし、`sw.js`のキャッシュ名と`version.json`を同期）→ビルド→`dist/game.js`/`style.css`/`manifest.json`をルート直下にコピー。**この順序は変えないこと**：ビルドは`package.json`のバージョンを`__APP_VERSION__`として`game.js`に焼き込むため、ビルド後にバージョンを上げると`game.js`と`version.json`が恒久的に食い違い、全クライアントが`checkForUpdate()`で無限リロードループに陥る
- アイコン（`icon-192.png`/`icon-512.png`）は依存パッケージなしで`scripts/generate-icons.mjs`が生成する三日月アイコン。デザインを変更する場合はこのスクリプトを編集して再生成する

## 実装メモ

- `src/roomSync.ts` はRTDB I/Oのラッパーで、純粋なゲームロジック（`roles.ts`/`gameLogic.ts`）を呼び出す形にしている。RTDB自体のユニットテストはしていない（emoji-dmの`app.js`と同様、I/O層はテスト対象外）
- 部屋コード生成（5文字、`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`）は`apps/emoji-dm`のパターンを踏襲
- **プレイヤーのアバター選択は廃止し、名前のみ表示する**（2026-07-11）。役職自体が動物モチーフ（🐰🐺🦉🦊🐾）のため、プレイヤーの見た目も動物絵文字にすると「役職の絵文字」と「その人が選んだ見た目」が混同され紛らわしいという実プレイのフィードバックによる。`Member`型に`avatar`フィールドは無い
- v1では未実装: アプリ内チャット・音声、拡張役職（Doppelganger/Mason/Troublemaker/Drunk/Insomniac相当）、リロード後の完全な状態復元、観戦モード
