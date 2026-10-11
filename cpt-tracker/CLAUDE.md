# cpt-tracker — 開発ガイド

CAPCOM Pro Tour 2026 の **Premierポイントランキング**（公式 `https://sf.esports.capcom.com/cpt/jp/pp-rankings/`）を、進行中のPremier大会（2026-10-10〜11の **EVO France 2026 SF6**、Premier 8/8）の結果に合わせてリアルタイム更新するトラッカー。公式ページは大会終了まで更新されないため、start.ggの進行から8列目を埋め、Capcom Cup 13のPremierポイント枠（上位8名）の確定・圏外確定を判定する。**非公式ファンツール**。2026-10-10にトップページ（`/index.html`）の先頭へ掲載（期間限定。EVO France終了後に掲載を外す／凍結するかを判断する）。ページ下部に権利表記（カプコン商標・非公式・データ出典）とスタジオ名「© Honeypaw Lab. by kumacha.」を文字で置く（`7metch`のクレジットと同じ表記。ロゴ画像は使わない）。

## 構成（ビルド不要の静的PWA。`marvel-checklist`と同じA系パターン）
- `logic.js`: 純ロジック（ポイント表、名前マッチング、タイブレーク、ライブ評価、枠判定）。**テスト対象は全部ここ**
- `app.js`: DOM描画・イベント配線・ポーリング・手動上書きUIのみ。判定ロジックを書かない
- `analytics.js`: GA4のラッパー（`test/analytics.test.mjs`）
- `data/config.json`: ポイント表・出場権保持者・start.ggイベントID・`apiUrl`（GASのURL）・エイリアス
- `data/baseline.json`: EVO France前の公式ランキング（117人、Premier 1〜7のポイント）。公式ページから手動転記済み
- `gas/Code.gs` + `gas/SETUP.md`: start.ggトークンを預かる中継（Google Apps Script）。**トークンはリポジトリに書かない**（スクリプトプロパティ）
- `test/logic.test.mjs`: `npm test`（Node標準テストランナー）

## 判定ロジックの要点（変更時は必ず `test/logic.test.mjs` を更新）
- ポイント表は `config.rules`（2位300/3位250/4位200/5位タイ150/7位タイ100/9位タイ50/13位タイ30/17位タイ20/25位タイ10、33位以下0、**1位はポイント無しで出場権**）。公式規定2.3
- 累計は全8大会の合計（WWの「上位3大会」上限は無い）。同点は公式規定2.3.1（最高順位→入賞回数→次点…）。**ポイント値と順位は1対1**（double eliminationのタイ順位なので）。`compareTiebreak`は順位の昇順配列の辞書式比較で、規定①②③と等価
- Premierポイント枠（Capcom Cup 13の出場権8）は**既に出場権を持つ選手を除いた**上位8名。優勝者が既に出場権保持なら、出場権は準優勝者以下へ繰り下がり（規定5.2。`buildRows`の`premierDecided`）
- start.ggの標準順位は進行中は信頼できないため、**「生存者」を未終了Setのスロットから計算**し（`gas/Code.gs`）、`evaluateEntrants`が「生存者ではなく、順位が生存者数より下」の選手だけを確定扱いにする（誤確定防止）
- **決勝のリセット戦待ち**: 負け側が決勝1試合目に勝つとリセット戦が作られるが、作成までの一瞬は生存者0人・フェーズ進行中になる。この間（`evaluateEntrants`の`betweenSets`）は1位・2位を確定扱いにしない（誤って優勝確定→出場権の繰り下がりが動くのを防ぐ）。3位以下は決勝で動かないので従来どおり確定
- **枠のボーダー表示と「直近の出来事」**（2026-10-11追加、画面表示のみで判定ロジックは変えない）: `borderInfo`が、出場権保持者を除いた枠の最後の1人と次点・差を返す（表の上の黄色い帯。表示切替の合計に連動）。「直近の出来事」は**中継(GAS)の`recentSets`**（直近に終了した試合。`fetchRecentSets_`が`filters.updatedAfter`で直近24時間に更新された終了済みSetを全ページ読み、`completedAt`の新しい順に並べ直す。**start.ggのSet一覧の並び順は終了時刻順ではない（実データで確認）ので、並び順には頼らない**）を`recentResults`が画面用にする。誰がいつ開いても同じ内容で、負け側が敗退確定済みなら順位とポイントを添える。**中継が未更新（`recentSets`が無い）／取得失敗のときだけ**、`createChangeTracker`による「この画面で見た変化」の速報にフォールバックする（同じ変化が別々の2回の取得で続いたときだけ出す。メモリ上のみ）。**GASを更新（新バージョンで再デプロイ）しないと`recentSets`は出ない**（`gas/SETUP.md`）。recentSetsのクエリが失敗しても本体の応答（順位・生存者）は壊さない（`test/gas.test.mjs`）
- 生存者の幅: 最低保証=`tiedStart(生存者数)`位のポイント、最大=2位(300)。優勝は0ptだが出場権を得て枠から外れる
- `safety`: `locked`（確定圏内）＝自分の最低合計以上になり得る他者が枠数-1人以下。`eliminated`（圏外確定）＝自分の最大より上の他者が、枠を空け得る1名を差し引いても枠数以上。**同点はタイブレークで解決できる場合のみ有利/不利に数える**
- **名簿(`roster`)に居ない選手は`absent`（0pt扱い・8列目に薄い「0」）**。名前の照合ミスで確定判定を誤らないよう、baseline合計200pt以上でabsentの選手の警告を出す（開発者向けの文言なので**URLに`?debug=1`を付けたときだけ**表示。公開の画面・SNS用のスクショには出さない）。直すには `config.aliases.map`（start.ggタグ→baselineタグ）に追記
- GAS中継は**stale-while-refresh**: 新しい応答(60秒)とは別に前回応答を6時間保管し、更新担当（ロックを取れた1人）以外・start.gg障害時はそれを`stale:true`で即返す（`gas/Code.gs`の`doGet`。`test/gas.test.mjs`にGASサービスのモックで挙動テストあり）。画面は`liveFreshness`でデータの古さを表示し、取得間隔は`nextRefreshDelayMs`で±10秒ばらす
- **アクセス解析（GA4）**: `analytics.js`（`gtag.js`の薄いラッパー。`config.analyticsId`が空・不正なら何もしない）。測定IDはトップページと共用の`G-Q962ZC0PJH`（2026-10-10決定: 期間限定ツールなので専用IDは作らない。他アプリはアプリごとに別ID: 7metch/LifeLog等。GA4ではページのパス`/cpt-tracker/`で絞って見る。専用IDにしたくなったら`config.json`の`analyticsId`を差し替えるだけ）。送るイベントは`view_change`/`filter_change`/`open_player`/`refresh_click`/`manual_save`のみで個人情報は送らない（`open_player`の選手名は公開情報）。フッターに利用の旨を明記。SNS等の流入元を見るにはURLに`?utm_source=x&utm_medium=social&utm_campaign=evo-france-2026`を付ける
- ライブ未取得（`apiUrl`空・取得失敗）のときは、上振れ余地を最大(300)とみなして確定判定を出し過ぎない

## 運用メモ
- **出場権保持者の初期値**（`config.qualified.players`）は公式ランキング表のアイコン読み取り＋大会結果報道。2026-10-10にユーザーが全員（Craime/Fuudo/Leshar/Sahara./DAIGO含む）の保持を確認済み。新たに判明したら`config.json`に追記する（画面の行タップでも端末内だけ修正できる）
- EVO France終了後は公式ページが更新される。更新後は`baseline.json`を差し替えるか、アプリを役目終了として凍結する
- start.ggのAPIは2026-10-10にEVO France SF6の実データで検証済み（ROUND 3〜TOP 24：生存者数の推移、TOP 24の25位タイ敗退による10pt確定、名簿との照合）。**未検証**: TOP 24途中〜決勝での「次の試合がまだ作られていない一瞬」の挙動、優勝決着後の準優勝者への出場権繰り下がり（ユニットテストのみ）。本番で表示と実際の対戦表がずれたら、`/exec`のJSON（`aliveIds`/`standings`/`phases`）を保存して原因を調べる
- deployスクリプト無し（静的ファイルのコミット＝公開）。`sw.js`はネットワーク優先で、`ASSETS`にファイルを足したら`CACHE_NAME`を上げる。**`fetch(..., { cache: "no-cache" })`で毎回サーバーに更新確認する**（GitHub Pagesは`max-age=600`なので、これが無いと修正をデプロイしても利用者の画面が最大10分古いまま。旧版では実際にそうなった）。事前保存も`cache:"reload"`。`ASSETS`には新しいJS（`analytics.js`等）を必ず含める（無いとオフライン時にimportが失敗する）。`test/sw.test.mjs`にSW APIのモックでテストあり
