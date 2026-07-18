# combrawl — 開発コンテキスト

## 概要
カード×オートバトラー×構造変化型ローグライク。カードで駒を強化し、戦闘は自動進行、10層クリアが一区切りだが、そこから**エンドレスモード**に自分の意思で突入して「どこまで化け物じみたビルドに育てられるか」を自己ベストとして記録できる。設計の経緯・数値仕様は姉妹リポジトリ`ai-workspace`の`projects/combrawl/GAME_DESIGN.md`が一次情報（本リポジトリからは参照できないため、実装判断に必要な内容はこのCLAUDE.mdに転記する）。

## アーキテクチャ
`apps/CLAUDE.md`のB系（Vite+TypeScriptビルドアプリ）に準拠。`enblo`と同じ構成。

- `src/types.ts` / `src/units.ts` / `src/combat.ts` / `src/battle.ts` / `src/stats.ts` / `src/progress.ts` / `src/highscore.ts` / `src/speed.ts` / `src/visuals.ts` / `src/gallery.ts`：DOM非依存の純粋なゲームロジック。全てVitestでユニットテスト済み
- `src/data/cards.ts`：カード9種の定義（`apply(state, chosenUnit)`は状態を直接ミューテートする純粋関数寄りの設計。DOM操作は含まない）
- `src/data/enemies.ts`：敵編成生成。ラウンド数に上限を設けていないため、10層クリア後のエンドレスモードでも同じ式をそのまま延長適用できる
- `src/main.ts`：DOM描画・アニメーション・音・エンドレス突入UIなど、UIオーケストレーション層。ここだけはユニットテスト対象外（DOM操作のため）
- `src/style.css`：アニメーションは全て`@keyframes`ベース。Easingは`--ease-pop`（オーバーシュート系、カード・コンボ演出向け）と`--ease-out-smooth`（滑らかな減速、通常のトランジション向け）の2種類をCSS変数で使い分ける（7metch実装時にEasingが弱かった反省を踏まえた方針）

## ゲームルールの要点（実装時に必ず参照）

- **SCORE（累積スコア）は2026-07-16導入。コンボ演出スタッツは廃止済み**：`src/stats.ts`の`applyScoreGain`が、プレイヤーが与えたダメージ量をそのまま加算し、撃破ごとに固定ボーナス（+25）を上乗せする。反撃ヒットもプレイヤー由来のダメージとして加算するが、敵の攻撃（被ダメージ）はSCOREに一切影響しない。1ラン中はリセットされず、「最初から」した時だけ0に戻る。計算式は初版（案A：ダメージ加算+撃破ボーナス）で、今後プレイ感を見て重み付けを追加する可能性がある
- **全体攻撃化（AoE）は同一hitIndexの複数ターゲットを同時ヒットとして演出する**：`src/main.ts`の`animateHits`は`hits`を「同じ攻撃者・同じswingId・同じhitIndex」でグループ化し、グループ単位でアニメーションを再生する（1体ずつ順番に殴るのではなく、1回の振りで全体に同時ヒットする見た目にする。2026-07-16修正）。`swingId`（`HitResult`、`src/battle.ts`の`nextSwingId()`で採番）は「別々の攻撃アクション」を区別するための値で、hitIndexだけでは区別できない（例: 同じ反撃持ちユニットが複数回に分けて反撃した場合、各反撃は毎回hitIndex=0から始まるため、swingIdが無いと誤って1つの同時スイングとして描画されてしまう。2026-07-15、Codexレビュー指摘で追加）
- **全体攻撃化のヒット中は「全体化◯%」の常駐バッジを攻撃者の頭上に表示する（2026-07-17実装、GAME_DESIGN.md §2.3）**：`main.ts`の`popAoeBadge(attackerEl, level)`が、`animateHits`の各グループ再生時（`attacker.aoeLevel > 0`のときのみ）に1回呼ばれ、`aoePercentForLevel(level)`（`combat.ts`、実ダメージ計算・カード説明文と共通）から算出した%を`.aoe-hit-badge`として攻撃者の上に表示する。ダメージポップと同じ720msだけ表示して消える（常駐と言っても「そのヒットが出ている間だけ」の意味で、ずっと表示され続けるわけではない）。フォントサイズは連撃のNヒット表示と同じ`fontSizeForHitIndex(hitIndex)`（`combat.ts`に切り出し済み、`hitDampen`等と同じくDOM非依存の純粋関数でテスト済み）を`fontSizeForHitIndex(level - 1)`として流用し、Lvが高いほど大きく見せる。以前は常駐バッジ`🌀N`（Lv数字のみ）とカード取得時のトーストでしか%を確認できず、実戦闘中に威力を実感できなかった
- **反撃のヒット中も同様に「反撃◯%」バッジを表示する（2026-07-17実装）**：`main.ts`の`popRetaliateBadge(attackerEl, level)`が`popAoeBadge`と全く同じ実装パターンで、`retaliateMultFor(level)`（`combat.ts`）から算出した%を表示する。反撃持ちが同時に全体化も持っている場合、両方のバッジが攻撃者頭上の同じ座標を取り合って重なるため、`animateHits`の呼び出し側で`kind === "retaliate"`のときは反撃%バッジのみ、それ以外（通常の攻撃ターン）は従来通り全体化%バッジのみを出すよう分岐している。**反撃の威力%計算式は`combat.ts`の`retaliateMultFor`に一本化済み**：以前は`data/cards.ts`にカード説明文表示専用の同一ロジック`retaliateMultForDisplay`が重複定義されていたが、全体化の`aoePercentForLevel`統一と同じ理由（片方だけ直すと表示と実ダメージがズレる事故を防ぐため）で削除し、`data/cards.ts`・`main.ts`・`battle.ts`の全てが`combat.ts`の`retaliateMultFor`を参照するようにした
- **全体化%/反撃%/GUARD（挑発ブロック時表示）バッジの位置は`main.ts`の`badgeAnchorRect(unitEl)`で統一している（2026-07-17実装）**：常駐の特性バッジ`.unit-badges`（連撃⚡/全体化🌀/反撃↩/挑発🛡のいずれかを持つユニットなら必ずユニット直上に存在する）がユニットの真上を専有しているため、これらのヒット中バッジを素朴にユニット自身の真上に出すと常駐バッジと重なって読めなくなる（2026-07-17、ユーザー報告）。`badgeAnchorRect()`は`.unit-slot`内に`.unit-badges`があればその上端、無ければユニット自身の上端を返し、`popAoeBadge`/`popRetaliateBadge`/`popGuardBadge`/`popShieldShatter`は全てこの座標を基準にする。**新しくユニット頭上に浮かせる演出を追加する場合、`getBoundingClientRect()`をユニット要素へ直接呼ばずに、必ず`badgeAnchorRect()`を経由すること**（同じ罠を再発させないため）
- **GUARDバッジ（挑発ブロック時）は`popGuardBadge(targetEl)`で表示する**：以前は`popDamage(tEl, "GUARD", "#5ec8ff", null)`（通常のダメージポップと同じ、上に流れて消えるアニメーション）だったが、全体化%/反撃%バッジと表現が異なり一貫性が無く、かつ常駐バッジとも重なっていた（2026-07-17、ユーザー報告）。`popAoeBadge`/`popRetaliateBadge`と同じ`.aoe-hit-badge`クラス＋`badgeAnchorRect()`の位置・アニメーションに統一し、色だけ`.guard-hit-badge`（青白、`.guard-flash`と同系色）で差し替えている
- **1ターン最大ダメージ/最大キル数の集計もswingId単位で行う**：`src/stats.ts`の`applyHitsBySwing(stats, hits)`が、渡されたヒット配列をswingIdでグループ化してから、グループごとに`summarizeTurn`/`applyTurnStats`を適用する（純粋関数・テスト済み）。反撃フェーズのように複数の別々の攻撃アクションが1つの配列に混在するケースを、まとめて集計して1アクション分として水増ししないためのガード（2026-07-15、Codexレビュー指摘）。戻り値は`{ stats, damageRecordUpdated, killsRecordUpdated }`で、どちらの記録が更新されたかを個別に返す（2026-07-16、後述の演出変更に伴い単一の`recordUpdated`から分割）。`main.ts`側で新しい1ターン集計ロジックを独自実装しないこと
- **「巨大化」は廃止済み、「特大化」はHP専用（2026-07-16実装）**。「先鋭化」（ATK専用）・「硬質化」（DEF専用）を新設し、単体強化カードをHP/ATK/DEFで役割分担させた。詳細は下記「カード全面再設計」参照
- **1ターン最大ダメージ / 1ターン最大キル数**：プレイヤーの1回の攻撃アクション（連撃・全体攻撃込み）単位で集計する演出スタッツ。これらが更新された瞬間、戦闘中でも演出を出す（`sfxRecord`でファンファーレを鳴らす）
- **記録更新演出はHUDの該当数値自体を光らせる方式（2026-07-16、`showRecordBanner`廃止・`flashStatUpdate`に置き換え）**：以前はアリーナ中央に「RECORD UPDATE!!」というバナー（`.record-banner`）を出していたが、ユニットの上に文字が重なって読めない・どちらの記録（ダメージ/キル数）が更新されたか分からない、という2つのユーザー報告を受けて変更した。`applyHitsBySwing`が返す`damageRecordUpdated`/`killsRecordUpdated`をそれぞれ見て、更新された方のHUD要素（`#maxTurnDamage`/`#maxTurnKills`）に`flashStatUpdate(el)`で`.stat-flash`クラスを一瞬付与し、CSSアニメーション（拡大＋発光）で光らせる。同じ要素が連続更新されてもアニメーションが再生されるよう、クラスを一度剥がしてから`requestAnimationFrame`で付け直す実装になっている（同じクラスを連続で付けてもブラウザがアニメーションの再生を省略することがあるため）
- **プレイヤー・敵とも、毎ターン「生存ユニット全員」がそれぞれ攻撃する**（`src/battle.ts`の`playerAttackTurn`/`enemyAttackTurn`）。2026-07-16以前は「生存ユニットからランダムに1体だけ」が攻撃する実装だったが、これはプレイヤーの直感（体数が多いほど強いはず）と乖離した重大な不具合だった。カードなし・合計HP/ATK予算だけ固定して体数だけ変える比較シミュレーションで、体数8体は体数1体よりround7クリア率が99.3%→0%まで悪化することを確認し、修正した。**この変更単体で敵側の総火力も体数分（最大5体）増えるため、ゲーム全体の難易度が上がり、巨大化・特大化への依存度はむしろ強まった**（優先GT/ランダム戦略のクリア率比が1.44倍→1.78倍に悪化）。敵編成（`src/data/enemies.ts`のbaseHp/baseAtk・体数増加ペース）や巨大化・特大化・分裂・増援等のバランス調整は別途必要（`ai-workspace`の`projects/combrawl/GAME_DESIGN.md`のバランス議論を参照）
- **敵の強さは戦闘開始後にしか見せない**（事前提示なし。ラウンド2以降、裏で敵1体に連撃を自動付与する仕様も意図的に非公開）
- **通常クリア層数は10/15/20層から選択式（2026-07-16追加）**：タイトル画面（`#titleModeRow`）で選んだ層数が`GameState.finalRound`として1ラン中保持される。カードプールが9種しかないため10層固定だと大半のカード種を一巡した程度でランが終わり、「同じカードを重ねて育てる」快感が本格化する前に終わる、という指摘を受けて追加した。選択肢は`src/progress.ts`の`RUN_LENGTH_OPTIONS`（`[10, 15, 20]`）が単一の情報源で、タイトル画面のボタンはここから動的に生成される（選択肢を増減する場合はこの配列を変更するだけでよい）。`isEndless(round, finalRound)`/`roundLabel(round, finalRound)`は第2引数に`state.finalRound`を渡す（固定の`FINAL_ROUND`定数には依存しない）。`src/data/enemies.ts`の`FINAL_ROUND`定数は今も存在するが、これは敵編成式の連続性を検証するテスト専用の定数で、選択式の`finalRound`とは無関係（紛らわしいが混同しないこと）。「最初から」（`resetRun()`）は直前と同じ`finalRound`を維持する。バランス数値（敵編成`baseHp`/`baseAtk`等）は3モードとも共通で、モードごとの調整はまだ入れていない
- **10層クリア後のエンドレスモード**：`state.finalRound`到達後、プレイヤーが「エンドレスに挑戦」を選ぶと、同じ敵編成の式（`setupEnemies`）をそのまま延長適用してラウンドを続行する。バランス調整は不要という前提（`finalRound`層クリアできれば目的達成のため）
- **エンドレスの高速/超速自動周回**（2026-07-15追加）：ビルドが強くなりすぎるとエンドレスが自然に終わらなくなる問題への対策。10層クリアパネル、またはエンドレス中いつでも表示される`#endlessControls`バーから「高速に切替」「超速に切替」を選ぶと`speedMode`（`src/speed.ts`の`BattleSpeed`型）が切り替わり、以後はカード選択を挟まず`continueEndlessAuto()`で自動的に次ラウンドへ進み続ける（**一方通行**：一度切り替えたら通常速度・カード選択には戻せない仕様）。アニメーション遅延は`scaledDelay(baseMs, speedMode)`（純粋関数、`speed.test.ts`でテスト済み）で一律縮める。高速/超速中は`playTone`/`sfxDeath`を早期returnでミュートする（大量の効果音でオーディオノードが積み上がりパフォーマンスを圧迫するのを防ぐため）。`#finishEndlessBtn`（ここで終了）はエンドレス中いつでも押せる
- **敗北時・「ここで終了」時はリザルトパネルを表示してからタイトルへ戻す**（2026-07-16追加）：以前は`finishEndlessRun()`がトースト表示と同時に即座にタイトル画面へ戻していたが、ユーザー報告（エンドレスで500層近くまで育てたのに、結果を確認する間もなくタイトルに戻された）を受けて修正。`showResultPanel(title, best, scoreBest, recordSaved, scoreSaved)`が`cardArea`に到達ラウンド・SCORE・自己ベスト到達ラウンド・HIGH SCORE（更新時は🎉付き）を表示するパネルを描画し、ユーザーが「タイトルへ」を押すまでゲーム画面（戦闘終了時の盤面）に留まる。`finalizeRecord()`の戻り値に`recordSaved`/`scoreSaved`（自己ベスト更新の有無）を追加し、パネル側の表示に使う。`endBattle(false)`（敗北）・`finishEndlessRun()`（ここで終了）の両方から呼ぶ共通処理
- **`#endlessControls`のボタン（高速/超速切替・ここで終了）はindex.htmlに静的に配置し、onclickをモジュール末尾で一度だけバインドする。`renderEndlessControls()`では`hidden`/`textContent`の切り替えのみ行い、絶対に`innerHTML`で作り直さないこと**（2026-07-16、ユーザー報告で発覚した重大バグの再発防止）。`renderHud()`（延いてはこの関数）は1ヒットごとに呼ばれ、高速/超速モードでは1秒間に何十回も実行される。かつての実装は毎回ボタンDOMを`innerHTML`で破棄・再生成していたため、クリックのタイミングによっては「押した瞬間にボタンが差し替わって判定が消える」状態になり、超速では「ここで終了」がほぼ一度も押せずタブを強制終了するしかない、というプレイヤー体験を著しく損なう不具合になっていた
- **`.endless-controls`のような`display`プロパティを持つクラスを新設する場合、必ず対になる`.endless-controls[hidden] { display: none; }`をセットで書くこと**（2026-07-16、Codexレビュー指摘）。`[hidden]`属性はUAスタイルによる`display:none`だが、同じ要素に対して作者側CSSで`display: flex`等を指定すると、CSS詳細度の関係で`[hidden]`が上書きされてしまう。上記の「静的配置」修正でボタンをDOMに常駐させた際にこの罠を踏み、通常ラン開始直後（ラウンド1、エンドレスに入る前）からボタンが表示・クリック可能になっていた。同種の罠は`#titleScreen`/`#gameScreen`でも過去に発生済み（`.title-screen, .game-screen`の`[hidden]`ルール参照）。新しく`hidden`属性で出し分けるコンテナを追加するたびに、このパターンを踏んでいないか確認する
- **自己ベスト記録は2系統ある**：①到達ラウンドの自己ベスト（`localStorage`の`combrawl.bestRecord.v1`、`RunRecord`）、②SCOREだけの自己ベスト＝HIGH SCORE（`combrawl.bestScore.v1`）。ラウンド進行度とSCOREは別軸のため、両方を独立して保存・表示する（HUDの「自己ベスト到達ラウンド」と「HIGH SCORE」）。いずれもサーバー無し・「自分の中だけのランキング」で、バックエンドやランキング共有機能は意図的に作らない
- **単体強化カードで対象未選択（ランダム）の場合、`card.apply`の戻り値`appliedUnit`が実際に適用されたユニットを返す**（`src/data/cards.ts`）。`main.ts`側で「対象未選択なら最後のユニットに決め打ち」のような独自ロジックで再現しないこと（2026-07-16、Codexレビュー指摘: 独立した2つのランダム選択がズレて、光る対象と実際の強化対象が食い違うバグがあった）
- **タイトル画面（`#titleScreen`）は`index.html`にゲーム画面（`#gameScreen`）と並べて実装し、JS側でのhidden切り替えで遷移する**。「Honeypaw Lab. by kumacha.」のクレジット表記は`.title-credit`に固定表示。ゲームの初期化（`initRun()`）はタイトルの「はじめる」ボタン押下まで遅延させる

## カード全面再設計（2026-07-16〜17実装。全項目実装済み）

ai-workspace側`GAME_DESIGN.md`（§2.3・§2.4・§2.5・§2.6・§2.6.1・§2.8・§3・§3.1・§3.2・§7）で仕様が固まった大規模変更。DEF導入・特大化/先鋭化/硬質化・挑発の全面リワーク・反撃へのDEF適用・合体/分裂のDEF継承・全体攻撃化の上限撤廃・視覚システム（HP=サイズ/ATK=形/DEF=材質）・ギャラリー機能（メタ進行）まで全て実装済み（`types.ts`/`units.ts`/`combat.ts`/`battle.ts`/`data/cards.ts`/`visuals.ts`/`gallery.ts`/`main.ts`、テストは`units.test.ts`/`battle.test.ts`/`data/cards.test.ts`/`combat.test.ts`/`visuals.test.ts`/`gallery.test.ts`に追加）。

- **「巨大化」を廃止済み、「特大化」はHP専用**（`u.maxHp *= 3`、`u.hp = u.maxHp`同期は維持）。ATKは変化しない
- **「先鋭化」「硬質化」を実装済み**：単体選択、それぞれ`u.atk *= 3`／`u.def *= 3`のみ。硬質化は`u.dmgTakenMult`も同時に再計算する
- **`Unit`に`def`フィールドを追加済み**（既定値5）。被ダメ倍率は`combat.ts`の`dmgTakenMultForDef(def) = BASE_DEF / (BASE_DEF + def)`（`BASE_DEF=40`）で導出し、挑発とは完全に独立している。`units.ts`の`avgDef()`は「増援」カード（`reinforce`）の`apply()`内で新ユニットのDEF初期値として実際に使われている
- **`makeUnit(side, hp, atk, def)`は渡された`def`から`dmgTakenMult`を初期化する**（`dmgTakenMultForDef(def)`）。**新しく`def`を変更するコードを書く場合は、必ず同時に`u.dmgTakenMult = dmgTakenMultForDef(u.def)`も設定すること**（硬質化・合体・分裂は実装済み。今後`def`を扱う変更をするときは同じパターンを踏襲する）
- **反撃（`retaliatePhase()`）の被ダメ計算にも`target.dmgTakenMult`を適用済み**（`battle.ts`）
- **「挑発」を全面再設計（実装済み）**：被ダメ軽減%は廃止し、「1ラウンドにつきtauntLevel回ぶんダメージを完全無効化（0ダメージ）、ラウンドごとにリフィル」という新メカニクスに変更した。実装のポイント：
  - ブロック予算は`state.tauntBlockBudget`（`Map<unitId, number>`）に持たせ、`main.ts`の`startBattle()`が`state.enemyUnits = setupEnemies(state.round)`する箇所（戦闘開始時、ラウンドが変わるタイミング）で`battle.ts`の`initTauntBlockBudget(state)`を呼んで初期化する。`enemyAttackTurn()`は`battleTick()`のsetTimeoutループの都合で1戦闘中に複数回呼ばれるため、ここ以外でリフィルしてはいけない
  - `HitResult`に`blocked?: boolean`を追加した（`damage === 0`だけでは、DEFの軽減で自然に0へ丸められたヒットと区別できないため）
  - `main.ts`の`animateHits()`に`hit.blocked`専用の表示分岐を追加済み：通常のダメージポップの代わりに`popDamage(tEl, "GUARD", "#5ec8ff", null)`＋`.guard-flash`（`style.css`、青白い発光）を出す
  - **常駐🛡バッジ＋盾シャッター演出を実装済み（2026-07-17）**：GAME_DESIGN.md §2.5で検討されていたが長らく未実装だった演出。`main.ts`の`renderUnits()`は`u.tauntLevel > 0`のとき、固定のLv表示ではなく`state.tauntBlockBudget`の**残りブロック回数**を`🛡{remaining}`として動的に表示する（budgetにまだエントリが無い＝カードを取った直後で一度も`initTauntBlockBudget()`が走っていない場合は`u.tauntLevel`＝満タン扱いにフォールバック）。残数が0になったら`🛡✕`表示に切り替わる。`HitResult`に`blockRemainingAfter?: number`（そのヒットでブロック予算を消費した直後の残り回数、`battle.ts`の`resolveHits()`内で記録）を追加し、`animateHits()`が`hit.blocked && hit.blockRemainingAfter === 0`（＝ちょうどこのヒットで盾を使い切った瞬間）を検知したときだけ`popShieldShatter(tEl)`を呼ぶ。`state.tauntBlockBudget`はターン全体を解決し終えた後の最終値しか持たないため、「どのヒットで0になったか」を判定するにはこの専用フィールドが必要だった。`popShieldShatter`は🛡️を2枚重ねて表示し、それぞれ`clip-path`で左右半分だけ切り抜いてから逆方向に回転・フェードさせる（`.shield-shard`/`.shield-shard-left`/`.shield-shard-right`、`style.css`）ワンショットの演出要素（`popDamage`/`popAoeBadge`と同じパターンでarenaに追加してsetTimeoutで自動削除）
  - **挑発バッジの表示も、HP/生存状態と同様にアニメーション再生中は`DisplayOverride`（`animateHits()`内、`overrides: Map<unitId, DisplayOverride>`）経由の途中経過値を使うこと**（2026-07-17、Codexレビュー指摘）。`enemyAttackTurn()`はそのターンの全ヒット（複数回のブロックを含む）を一括で解決し終えてから`animateHits()`に渡すため、`state.tauntBlockBudget`は常にターン終了後の最終値しか持たない。これを`renderUnits()`が素朴に読むと、Lv3挑発が3連続ブロックしても1発目の再生時点で既に最終値（`🛡✕`）が表示されてしまい、`🛡3→🛡2→🛡1→🛡✕`のカウントダウンも盾シャッター演出のタイミングも崩れる。`DisplayOverride`に`tauntRemaining?: number`を追加し、`hit.blockRemainingAfter`から`hpAfter`と同じ要領で逆算・再生する。今後hp/alive以外の「戦闘中に変化する表示」を追加する場合も、`state`の最終値を直接読むのではなく同じ`overrides`パターンを踏襲すること
  - ブロックしたヒットも`HitResult`は必ず記録する（反撃側のコードへの追加変更は不要、`retaliatePhase`は`incomingHits`を無条件に処理する既存実装のまま反撃が発動する）
  - `battle.ts`の`resolveHits()`に`tauntBlockBudget`引数を追加し、対象選択（`selectTargets`）は「まだブロック予算が残っているtaunter」を優先するようにした（優先しないと予算が余ったまま被弾するバグになる）
- **「全体攻撃化」の威力%上限を撤廃済み（2026-07-17実装）**：`combat.ts`に`aoePercentForLevel(level)`を新設し、実ダメージ計算（旧`aoeMultFor`）とカード説明文表示（旧`data/cards.ts`の`aoeMultForDisplay`、重複定義だったため削除して統一）の両方から同じ関数を参照するようにした（片方だけ直すと表示と実ダメージがズレるため、Codexレビュー指摘を踏まえて最初から統一）
  - `base = 0.65 + 0.15 * min(level, 5)`（Lv1:80%→Lv2:95%→Lv3:110%→Lv4:125%→Lv5:140%、旧式と同じ伸び）
  - `level > 5`のとき：`base += 0.25 * log2(level - 4)`（Lv6:165%→Lv9:198%→Lv12:215%…上限なし、対数的に減衰しながら伸び続ける）
  - 係数（`0.65`/`0.15`/`0.25`）はすべて暫定値。実際のバランスは今後シミュレーションで調整する（次の作業候補）
- **「合体」「分裂」のDEF継承ルールを実装済み**：DEFはHP/ATKと同じ「肉体枠」として扱う（合体は合算×1.2、分裂は0.6倍・下限1）。`dmgTakenMult`は`makeUnit()`が`def`から自動的に導出するため、合体・分裂側で個別に合算・コピーする必要はない
- **見た目（HP=サイズ/ATK=形/DEF=材質、12段階）を実装済み（2026-07-17）**：
  - `src/visuals.ts`（DOM非依存の純粋関数、`visuals.test.ts`でテスト済み）に3チャンネル共通のしきい値計算`tierForValue(value, base)`を実装。「基準値から見て約2倍ごとに1段階、1〜12にクランプ」という同じロジックをHP/ATK/DEFで共有する
  - **HP→サイズ**：`hpTier(hp)`（基準値`HP_BASE=8`、実測の巨大化ビルドHP約99,360が丁度tier12に収まるよう校正済み）→`sizeForHpTier(tier)`で22px(tier1)〜140px(tier12)の12段階サイズを返す。旧`size = clamp(30, 96, 16 + sqrt(hp) * 7)`は廃止。tier12到達後もHPが伸び続けている場合は`isHpCapped(hp)`が真になり、`.hp-capped`クラス（紫の脈動グロー、`style.css`）でサイズ据え置きのまま「まだ伸びている」ことを示す
  - **ATK→形（トゲトゲ度）**：`atkTier(atk)`（基準値`ATK_BASE=2`）→`shapeForAtkTier(tier)`。tier1〜3は角の丸み（円形/丸角/四角、`border-radius`のみ）、tier4〜12は`starPolygonClipPath(points)`で生成する4〜12芒星（`clip-path: polygon()`、pointsはtierと一致）
  - **DEF→素材（色・質感）**：`defTier(def)`（基準値`DEF_BASE=2`）→`materialClassForDefTier(tier)`がtier1(`mat-none`)〜tier12(`mat-void`)のCSSクラス名を返す。`style.css`に12段階の`.unit-shape.mat-*`ルールを定義済み（なし・布は陣営色`--tone`ベース、木目以降は敵味方を問わず素材固有色）。木目以降は画像アセット不使用、CSSグラデーション・box-shadowの重ね掛けのみ。虹（`mat-aurora`）は`@property --spin`の回転グラデーション、漆黒（`mat-void`）は紫の発光
  - **形・素材（`border-radius`/`clip-path`/材質背景）は`.unit`自体ではなく専用のインナー要素`.unit-shape`（`position:absolute; inset:0`）にのみ適用すること（2026-07-17、Codexレビュー指摘・重要）**：`.unit`にclip-pathを直接かけると、その子である`.unit-badges`（`top:-13px`）や`.hp-bar-wrap`（`bottom:-7px`）まで一緒に切り取られてしまい、ATK tier4以上（星形）になった瞬間にトレイトバッジ・HPバーが欠ける不具合になる。`main.ts`の`renderUnits()`は`el.innerHTML`の先頭に`<div class="unit-shape ...">`を差し込み、`el.style.borderRadius`/`el.style.clipPath`ではなく`.unit-shape`側のstyle属性に形状を設定する。`.unit-hp`は`z-index:1`、`.hp-bar-wrap`は`z-index:2`、`.unit-shape`は`z-index:0`で、形状レイヤーが最背面になるようスタッキングを明示している
  - **基準値（`HP_BASE`/`ATK_BASE`/`DEF_BASE`）はすべて暫定値**：初期値（HP24/ATK4/DEF5）が最低段階（tier1）から始まるよう当たりをつけただけで、実際のカードスタック数・到達分布に基づくシミュレーション調整はまだ行っていない。調整する場合は`src/visuals.ts`の定数を変更するだけで済む
  - **1段階に必要な伸び幅（`STEP_LOG2`）を3に変更し、ギャラリー全解放をレア化した（2026-07-18、ユーザー要望）**：`tierForValue(value, base, stepLog2)`の`stepLog2`引数（既定1＝約2倍ごとに1段階）を3にすると「約8倍ごとに1段階」になる。単体強化カード（特大化/先鋭化/硬質化、いずれも対象ステータスを×3する）を1つの軸に集中して積み続けた場合、以前（`STEP_LOG2=1`）は約7回で最大段階(tier12)に到達していたが、変更後は約20〜21回必要になる計算（`3^N倍 >= 8^11倍`を解くと算出できる）。通常クリア（10〜20層）の範囲では埋まりきらず、エンドレスモードでの長期周回が前提の「エンドゲームでじっくり集める」難易度を意図している。全12段階のギャラリー解放しきい値を個別に調整したい場合（HP/ATK/DEFで別の重さにする等）は、`hpTier`/`atkTier`/`defTier`にそれぞれ別の`stepLog2`を渡すよう変更すればよい（現状は3チャンネルとも共通の`STEP_LOG2`定数）
  - **HPの数値表示（`.unit-hp`）は白文字+濃い縁取り(`text-shadow`)に固定した**：DEF素材によって背景の明暗（漆黒〜白銀）が大きく変わるため、単一の文字色ではどこかで読めなくなる。素材ごとの文字色出し分けはしていない
  - **ATK/DEFの実数値を`.unit-stats`としてユニット下に常時表示する（2026-07-18実装）**：`main.ts`の`renderUnits()`が`.unit-slot`の最後の子要素として`ATK:{値}<br>DEF:{値}`（`Math.round`済み）を追加する。段階解放をレア化（`STEP_LOG2`変更）したことで見た目が変わらないまま数値だけ積み上がる期間が長くなり、見た目だけでは実際の強さが判別しづらくなっていた（ユーザー報告）。常駐バッジ（`.unit-badges`）と違い特性の有無に関わらず全ユニットに表示するため、`.unit-slot`の`justify-content: flex-end`（バッジ有無によるユニット位置ズレ防止、本ファイル「特性バッジ」の項参照）の下端アンカーの役割もこの要素が引き継いでいる。**`.hp-bar-wrap`は`.unit`本体から`position:absolute; bottom:-7px`ではみ出しているため、`.unit-stats`の`margin-top`は最低でも8px程度確保すること**（それより狭いと1行目のATK表示がHPバーの背景と重なって読めなくなる。2026-07-18、実装時に自己発見・修正）
  - より詳細な検討経緯・デザインサンプルの参照先はai-workspace側`GAME_DESIGN.md`§2.6・§2.6.1に記載
- **特性バッジ（連撃⚡/全体化🌀/反撃↩/挑発🛡）の表示は`.unit-slot`（`main.ts`の`renderUnits()`）が土台（2026-07-17、複数回の見た目修正を経て現行仕様に到達）**：
  - `.unit`本体とバッジは兄弟要素として`.unit-slot`（`display:flex; flex-direction:column`）にまとめる。バッジの有無に関わらず**必ず**`.unit-slot`で包むこと（バッジ無しユニットだけ`.unit-slot`を省略すると、`.side`の`align-items:stretch`で行の高さが揃った際にバッジ有り無しでユニット本体の縦位置がズレる。`.unit-slot`は`justify-content: flex-end`でユニット本体を下端に揃えている）
  - バッジは絵文字+数字を1行にまとめた単一の帯（`.unit-badges`、背景+枠線1つのみ）として表示する。**以前は特性ごとに個別の`.badge-chip`（枠線付き）へ分けてflex-wrapさせていたが、複数特性が乗ったユニットでバッジが林立して見づらいというユーザー指摘を受けて2026-07-17に単一の帯へ作り直した**。今後バッジの見た目を変更する際は、個別チップ方式には戻さないこと（同じ指摘が再発する）
  - `dead`クラスは`.unit`だけでなく`.unit-slot`側にも付与する（`.unit.dead`のopacity:0はバッジ側=兄弟要素には効かないため、`.unit-slot.dead .unit-badges`に別途フェードを掛けている）
- **ギャラリー（メタ進行）を実装済み（2026-07-17）**：タイトル画面の「🖼 ギャラリー」ボタンから開ける、HP/ATK/DEFそれぞれ独立した12マスの到達record画面
  - `src/gallery.ts`（DOM非依存の純粋関数+localStorage永続化、`gallery.test.ts`でテスト済み）に`GalleryProgress { hp, atk, def }`（各軸1〜12、未到達は0）を持つ。`loadGalleryProgress()`/`saveGalleryProgress()`が`localStorage`の`combrawl.gallery.v2`キー（v1から変更、後述）を読み書きし、`mergeGalleryProgress(current, observed)`が観測したユニット群のtierと既存記録を突き合わせて各軸ごとの最大値を返す（下がることはない）
  - **見た目の段階解放しきい値をレア化した際、`localStorage`キーを`combrawl.gallery.v1`→`v2`に変更した（2026-07-18、Codexレビュー指摘）**：`mergeGalleryProgress`は記録が下がらない仕様のため、`STEP_LOG2`変更でtier算出基準が厳しくなっても、v1時代に「古い簡単な基準」で保存済みの記録をそのまま読むと解放済み扱いのまま残ってしまう。tierの意味そのものが変わる破壊的変更なので、**今後もHP/ATK/DEFのtier算出式（`visuals.ts`の`tierForValue`/`STEP_LOG2`/各`*_BASE`）を変更する場合は、同様にストレージキーのバージョンを上げて既存記録を無効化すること**
  - `main.ts`の`updateGalleryFromPlayerUnits(units)`が、`initRun()`（ラン開始時のベースライン登録）と`chooseCard()`（カード適用でステータスが伸びうるタイミング）の2箇所から呼ばれる。**ステータスが変化しうるのはカード適用時のみなので、戦闘中の毎フレーム呼び出しは不要**（`renderArena()`等の高頻度描画からは呼んでいない。挑発ブロック予算と同様、呼び出し頻度を絞ることでlocalStorageへの過剰な読み書きを避けている）
  - 未到達の段階は「？」で伏せて表示し、実際に到達すると解放される。各トラックのセル描画（`gallery-cell-shape`）は`visuals.ts`の`shapeForAtkTier`/`materialClassForDefTier`/`starPolygonClipPath`をそのまま再利用し、戦闘中のユニット表示とロジックを重複させていない。`style.css`の`.unit-shape.mat-*`セレクタは`.gallery-cell-shape.mat-*`も同時に対象にするよう拡張してあるため、DEF素材のグラデーション定義（12段階分）を二重に書いていない
  - `index.html`に`#galleryScreen`（`#titleScreen`/`#gameScreen`と同じ`[hidden]`属性による出し分けパターンを踏襲、CSSの罠は`apps/CLAUDE.md`「新しく`hidden`属性で出し分けるコンテナを追加するたび」の項を参照して回避済み）を新設
  - サーバー・共有機能は無し、自己ベスト記録・HIGH SCOREと同じ「自分だけの記録」という位置付け
  - **リセット機能を実装済み（2026-07-17）**：`gallery.ts`の`resetGalleryProgress(storage?)`が全軸0の記録を`localStorage`に保存して返す。`main.ts`側は`#galleryResetBtn`（ギャラリー画面ヘッダー右、`.gallery-reset`）のクリックで`confirm()`による確認を挟んでから呼び出す（localStorageを消す不可逆操作のため）。自己ベスト到達ラウンド・HIGH SCOREにはリセット機能が無いが、ギャラリーは「見た目の解放記録」でありゲーム進行上の実害が無いため対象外にしていない
- **分裂・合体後、見た目が新しいステータスに正しく反映されるか重点確認**：過去に類似の対象ズレバグが実際に起きている（本ファイル「単体強化カードで対象未選択」の項参照）。今回、`renderUnits()`の編集時に`el.className`/`el.dataset.id`の代入を誤って削除してしまい、全ユニットのクラス・data-id・クリックハンドラが丸ごと消える不具合を実装直後に自己発見・修正した実績がある（Playwrightでの実プレイ確認で発覚。ユニットテストだけでは検出できなかった）。DOM要素の`className`/`classList`を扱うコードを編集する際は、既存の代入行を消していないか特に注意する

## 変更時のチェックリスト

- ゲームロジック（`src/`直下・`src/data/`）を変更する前に、対応するテストが存在するか確認する。無ければ先にテストを書く
- カード効果を追加・変更する場合は`src/data/cards.ts`の`CARD_POOL`とテスト（`cards.test.ts`）を両方更新する
- SCORE・ダメージ計算式を変更する場合は、必ず「敵の攻撃（被ダメージ）はSCOREに影響しない」「1ラン中はリセットされない」という制約を壊していないか確認する
- 単体強化カードを追加する場合は、`apply`の戻り値に実際に適用したユニットを`appliedUnit`として必ず含める（`main.ts`側でハイライト対象を独自に推測させない）
- コミット前に`npm run deploy`を実行し、ビルド成果物（`game.js`/`style.css`/`manifest.json`/`index.html`）をルート直下に反映させる（`npm run build`は`scripts/build.mjs`が entry書き換え→テスト→vite build を一括で行い、失敗時も必ずindex.htmlを復元する。`npx vite build`を直接叩かないこと。2026-07-15、apps#298）
- **`npm run deploy`は`dist/index.html`をコピーした直後に`scripts/normalize-index.mjs`を必ず実行する**：Viteはビルド時、注入するscript/linkタグの前に大量の空白パディングを付与する。この生成物をそのまま次回ビルドの入力（=コミットされるindex.html）として使い回すと、ビルドのたびにViteが既存のパディングの上にさらにパディングを重ねてしまい、デプロイのたびにindex.htmlがほぼ倍々に肥大化し続ける不具合があった（2026-07-15、Codexレビュー指摘。実測: 7.9KB→14KB→…と倍増）。normalize-index.mjsは注入タグ直前の空白ランを1個の改行に正規化し、この複利的な肥大化を断つ。`deploy`スクリプトからこのステップを外さないこと
- **`npm run deploy`の後に`npm run dev`（や単体の`vite`起動）を実行すると、`predev`フックの`restore-entry.mjs`がルート直下`index.html`のエントリを再び`./game.js`→`./src/main.ts`に書き換え、スタイルシートのlink要素も失われる**。この状態のまま`git commit`すると、GitHub Pagesで配信される本番`index.html`が生のTypeScriptを読み込もうとして起動不能になる（2026-07-17、Codexレビュー指摘・実際に一度この状態でコミットしてしまった実績あり）。**Playwright等でビルド後の動作を実プレイ確認する際は、確認用に`npm run dev`を起動した後、コミット前に必ずもう一度`npm run deploy`を実行してエントリを`./game.js`に戻すこと**。コミット直前は`git diff combrawl/index.html`で`<script type="module" ... src="./game.js">`になっているか（`./src/main.ts`になっていないか）を必ず目視確認する

## プロトタイプ移植で得た教訓（2026-07-15、初回実装のCodexレビューで16件の指摘を受けた振り返り）

プロトタイプ（`ai-workspace/projects/combrawl/prototypes/combrawl_prototype.html`）は1ヒットずつ逐次処理する設計だったが、TS移植時に「連撃・全体攻撃を一括計算してからアニメーションで再生する」方式に変更した。この設計変更自体は妥当だったが、影響範囲を洗い出さずに進めたため、アニメーション表示・勝敗判定・反撃資格判定など「途中経過」を参照する箇所が軒並み「最終状態」を参照してしまうバグが連鎖的に発生した。

- **「逐次処理」→「まとめて計算してから再生」のような設計変更をする際は、着手前に「途中経過を参照する箇所」を洗い出す**（アニメーション表示、勝敗判定、スキル発動条件など）。1箇所直すたびに隣接箇所で同じパターンのバグが見つかる、といういたちごっこを避けるため
- **他アプリ（`enblo`等）のビルド/デプロイスクリプトパターンを流用する際は、その前提が本アプリでも成立するか個別に検証する**（`npm run build`/`npm run dev`を単体で叩いた場合の挙動、デプロイ対象ファイル一覧の過不足など）。流用元に同じ潜在バグがある可能性もあり、鵜呑みにしない

## 未着手・既知の課題（ロードマップは`ai-workspace`側GAME_DESIGN.md §14に集約）

- カード全面再設計（9→10種、DEF導入・挑発リワーク・全体攻撃化の上限撤廃・視覚システム・ギャラリー）は2026-07-16〜17実装済み。拡張候補（カウンタータンクのシナジー、回数制バリア持ちの敵）は`ai-workspace`側のGAME_DESIGN.md §11・§14を参照
- ドット絵化は未着手。着手時はHP連動の連続サイズ変化（`src/main.ts`の`renderUnits`内`size`計算）を廃し、HPバー＋スプライト差し替え方式に再設計する（GAME_DESIGN.md §14参照）
- **BGM追加・SE強化は未着手**（2026-07-15、ロードマップに追加）：現状SEは`playTone`ベースのWeb Audio API簡易合成音のみ、BGMは無し。着手時の検討事項はGAME_DESIGN.md §14参照。高速/超速自動周回中はSEをミュートする既存仕様（本ファイルの「エンドレスの高速/超速自動周回」参照）と矛盾しないよう、BGMの扱い（鳴らし続けるか等）も合わせて設計する
- `public/icon-192.png` / `icon-512.png`はプレースホルダー（`scripts/gen-icons.mjs`で生成した単色リング）。本番公開前に正式なアイコンに差し替える
- Playwright E2Eテストは未整備（`enblo`にはあるが本アプリはまだ導入していない）
