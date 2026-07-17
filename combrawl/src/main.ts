import "./style.css";
import type { GameState, HitResult, Unit } from "./types";
import { makeUnit } from "./units";
import { setupEnemies } from "./data/enemies";
import { CARD_POOL } from "./data/cards";
import { playerAttackTurn, enemyAttackTurn, retaliatePhase, isPlayerWiped, isEnemyWiped, initTauntBlockBudget } from "./battle";
import { applyHitsBySwing, applyScoreGain, initialStats } from "./stats";
import { isEndless, roundLabel, RUN_LENGTH_OPTIONS } from "./progress";
import { loadBestRecord, loadBestScore, saveBestScoreIfBetter, saveRecordIfBetter, type RunRecord } from "./highscore";
import { scaledDelay, type BattleSpeed } from "./speed";
import { atkTier, defTier, hpTier, isHpCapped, materialClassForDefTier, shapeForAtkTier, sizeForHpTier, starPolygonClipPath } from "./visuals";
import { isGalleryProgressAdvanced, loadGalleryProgress, mergeGalleryProgress, saveGalleryProgress, type GalleryProgress } from "./gallery";
import { aoePercentForLevel, fontSizeForHitIndex } from "./combat";

const titleScreen = document.getElementById("titleScreen") as HTMLElement;
const gameScreen = document.getElementById("gameScreen") as HTMLElement;
const titleModeRow = document.getElementById("titleModeRow") as HTMLElement;
const galleryScreen = document.getElementById("galleryScreen") as HTMLElement;
const openGalleryBtn = document.getElementById("openGalleryBtn") as HTMLButtonElement;
const galleryBackBtn = document.getElementById("galleryBackBtn") as HTMLButtonElement;
const hpTrack = document.getElementById("hpTrack") as HTMLElement;
const atkTrack = document.getElementById("atkTrack") as HTMLElement;
const defTrack = document.getElementById("defTrack") as HTMLElement;
const hpSummaryValue = document.getElementById("hpSummaryValue") as HTMLElement;
const atkSummaryValue = document.getElementById("atkSummaryValue") as HTMLElement;
const defSummaryValue = document.getElementById("defSummaryValue") as HTMLElement;
const hpSummaryBar = document.getElementById("hpSummaryBar") as HTMLElement;
const atkSummaryBar = document.getElementById("atkSummaryBar") as HTMLElement;
const defSummaryBar = document.getElementById("defSummaryBar") as HTMLElement;
const hpTrackCount = document.getElementById("hpTrackCount") as HTMLElement;
const atkTrackCount = document.getElementById("atkTrackCount") as HTMLElement;
const defTrackCount = document.getElementById("defTrackCount") as HTMLElement;

const arena = document.getElementById("arena") as HTMLElement;
const playerSide = document.getElementById("playerSide") as HTMLElement;
const enemySide = document.getElementById("enemySide") as HTMLElement;
const scoreNum = document.getElementById("scoreNum") as HTMLElement;
const statusLine = document.getElementById("statusLine") as HTMLElement;
const startBtn = document.getElementById("startBtn") as HTMLButtonElement;
const resetBtn = document.getElementById("resetBtn") as HTMLButtonElement;
const cardArea = document.getElementById("cardArea") as HTMLElement;
const roundEl = document.getElementById("round") as HTMLElement;
const cardCountEl = document.getElementById("cardCount") as HTMLElement;
const maxTurnDamageEl = document.getElementById("maxTurnDamage") as HTMLElement;
const maxTurnKillsEl = document.getElementById("maxTurnKills") as HTMLElement;
const bestRoundEl = document.getElementById("bestRound") as HTMLElement;
const highScoreEl = document.getElementById("highScore") as HTMLElement;
const deckStrip = document.getElementById("deckStrip") as HTMLElement;
const endlessControls = document.getElementById("endlessControls") as HTMLElement;
const switchFastBtn = document.getElementById("switchFastBtn") as HTMLButtonElement;
const switchUltraBtn = document.getElementById("switchUltraBtn") as HTMLButtonElement;
const finishEndlessBtn = document.getElementById("finishEndlessBtn") as HTMLButtonElement;

// --- 効果音（Web Audio APIで生成、外部ファイル不要） ---
let audioCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function playTone(freq: number, duration: number, type: OscillatorType, volume = 0.18, delay = 0) {
  // 高速/超速の自動周回中は、大量の効果音が短時間に重なって鳴り続ける
  // （オーディオノードが積み上がりパフォーマンスを圧迫する）のを避けるためミュートする
  if (speedMode !== "normal") return;
  try {
    const ctx = getAudioCtx();
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  } catch (e) {
    /* オーディオ非対応環境は無視 */
  }
}

function sfxHit(isCrit: boolean) {
  if (isCrit) {
    playTone(880, 0.12, "square", 0.16);
    playTone(1320, 0.1, "square", 0.12, 0.03);
  } else {
    playTone(320, 0.08, "square", 0.13);
  }
}
function sfxHurt() { playTone(150, 0.1, "sawtooth", 0.14); }
function sfxDeath() {
  if (speedMode !== "normal") return;
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(380, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.16, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.32);
  } catch (e) {
    /* noop */
  }
}
function sfxVictory() { [523, 659, 784, 1047].forEach((f, i) => playTone(f, 0.22, "square", 0.15, i * 0.11)); }
function sfxDefeat() { [400, 300, 220, 160].forEach((f, i) => playTone(f, 0.3, "sawtooth", 0.15, i * 0.14)); }
function sfxRecord() { [660, 880, 1108, 1320].forEach((f, i) => playTone(f, 0.16, "square", 0.17, i * 0.08)); }

// --- ゲーム状態 ---
let state: GameState;
let hasRunStarted = false;
let battleActive = false;
let battleTimer: ReturnType<typeof setTimeout> | null = null;
let battleGen = 0;
let unitSelectionMode = false;
let selectedTargetId: string | null = null;
/** エンドレスでビルドが強くなりすぎて終わらなくなる問題への対策（2026-07-15追加）。
 * 一度normal以外に切り替えたら、そのラン中は元に戻せない（一方通行。UI上も戻すボタンは出さない） */
let speedMode: BattleSpeed = "normal";

const HIT_STAGGER_BASE = 190;

function setSelectionMode(v: boolean) {
  unitSelectionMode = v;
  arena.classList.toggle("selecting", v);
}

function initRun(finalRound: number) {
  if (battleTimer) clearTimeout(battleTimer);
  battleActive = false;
  hasRunStarted = true;
  battleGen++;
  setSelectionMode(false);
  selectedTargetId = null;
  speedMode = "normal";
  state = {
    round: 1,
    playerUnits: [makeUnit("player", 24, 4), makeUnit("player", 24, 4)],
    // 敵の強さ・裏で付与される連撃は戦闘開始後にしか見せない仕様（combrawl/CLAUDE.md参照）
    // なので、実際の生成はstartBattle()まで遅らせる
    enemyUnits: [],
    deck: [],
    score: 0,
    stats: initialStats(),
    finalRound,
    tauntBlockBudget: new Map(),
  };
  updateGalleryFromPlayerUnits(state.playerUnits);
  renderAll();
  statusLine.textContent = "戦闘開始を押してください";
  startBtn.disabled = false;
  cardArea.innerHTML = "";
}

function renderAll() {
  renderHud();
  renderArena();
}

function renderHud() {
  roundEl.textContent = roundLabel(state.round, state.finalRound);
  cardCountEl.textContent = String(state.deck.length);
  maxTurnDamageEl.textContent = String(state.stats.maxTurnDamage);
  maxTurnKillsEl.textContent = String(state.stats.maxTurnKills);
  scoreNum.textContent = "SCORE " + state.score.toLocaleString();
  deckStrip.innerHTML = state.deck.map((c) => `<div class="chip">${c.name}</div>`).join("");
  const best = loadBestRecord();
  bestRoundEl.textContent = best ? String(best.endlessRound) : "-";
  highScoreEl.textContent = loadBestScore().toLocaleString();
  renderEndlessControls();
}

interface DisplayOverride { hp: number; alive: boolean }

function renderArena(overrides?: Map<string, DisplayOverride>) {
  renderUnits(playerSide, state.playerUnits, "player-unit", overrides);
  renderUnits(enemySide, state.enemyUnits, "enemy-unit", overrides);
}

function renderUnits(
  container: HTMLElement,
  units: Unit[],
  cls: "player-unit" | "enemy-unit",
  overrides?: Map<string, DisplayOverride>
) {
  container.innerHTML = "";
  units.forEach((unit) => {
    // アニメーション中は、そのユニットが「今何ヒット目まで見せ終えたか」に応じたHP/生存状態を表示する。
    // stateは連撃・全体攻撃の全ヒットを解決済みの最終値を持っているため、そのまま描画すると
    // 1コマ目から最終状態（途中で倒れたユニットは即座に死亡表示）になってしまうのを防ぐ
    const override = overrides?.get(unit.id);
    const u = override ? { ...unit, hp: override.hp, alive: override.alive } : unit;

    const el = document.createElement("div");
    let className = "unit " + cls + (u.alive ? "" : " dead");
    if (unitSelectionMode && cls === "player-unit" && u.alive) {
      className += " selectable";
      if (u.id === selectedTargetId) className += " selected-target";
    }
    el.className = className;
    el.dataset.id = u.id;
    // HP=サイズ／ATK=形（トゲトゲ度）／DEF=素材、の3チャンネルで見た目を分離する（GAME_DESIGN.md §2.6）
    const size = sizeForHpTier(hpTier(u.hp));
    el.style.width = size + "px";
    el.style.height = size + "px";
    if (isHpCapped(u.hp)) el.classList.add("hp-capped");

    // 形・素材（clip-path/材質背景）は専用のインナー要素(.unit-shape)にのみ適用する。
    // .unit自体にclip-pathをかけると、その子であるバッジ(top:-13px)やHPバー(bottom:-7px)まで
    // 一緒に切り取られてしまう（星形になった瞬間にトレイトバッジ・HPバーが欠ける不具合。
    // 2026-07-17、Codexレビュー指摘）
    const shape = shapeForAtkTier(atkTier(u.atk));
    const shapeStyle =
      shape.kind === "rounded"
        ? `border-radius:${shape.borderRadiusPercent}%; clip-path:none;`
        : `border-radius:0; clip-path:${starPolygonClipPath(shape.points)};`;
    const shapeClass = "unit-shape " + materialClassForDefTier(defTier(u.def));

    const badgeList: string[] = [];
    if (u.attackCount > 1) badgeList.push(`⚡${u.attackCount}`);
    if (u.aoeLevel > 0) badgeList.push(`🌀${u.aoeLevel > 1 ? u.aoeLevel : ""}`);
    if (u.retaliateLevel > 0) badgeList.push(`↩${u.retaliateLevel > 1 ? u.retaliateLevel : ""}`);
    if (u.tauntLevel > 0) badgeList.push(`🛡${u.tauntLevel > 1 ? u.tauntLevel : ""}`);
    // 特性を1本の長いピルで繋げると、連撃+全体攻撃化+反撃+挑発が全部乗ったユニットで
    // 横幅が伸びすぎて隣のユニット・バッジと衝突し読めなくなる（2026-07-17、ユーザー報告）。
    // 個別の小さなチップに分けてflex-wrapさせ、横幅を一定以内に収める
    const badges = badgeList.length
      ? `<div class="unit-badges">${badgeList.map((b) => `<span class="badge-chip">${b}</span>`).join("")}</div>`
      : "";

    el.innerHTML = `<div class="${shapeClass}" style="${shapeStyle}"></div><div class="unit-hp">${Math.max(0, Math.round(u.hp))}</div>
      <div class="hp-bar-wrap"><div class="hp-bar" style="width:${Math.max(0, (u.hp / u.maxHp) * 100)}%; background:${cls === "player-unit" ? "#4fd1c5" : "#e63950"}"></div></div>`;

    if (unitSelectionMode && cls === "player-unit" && u.alive) {
      el.onclick = () => {
        selectedTargetId = selectedTargetId === u.id ? null : u.id;
        renderArena();
      };
    }

    // バッジをposition:absoluteでユニットに重ねる方式だと、レイアウト上は幅0扱いになり
    // .sideのflex-wrapがバッジの実サイズを一切考慮してくれない。そのため小さいユニットが
    // 密集する序盤ではバッジが隣のユニットへ横方向にはみ出し、増援等で複数行に折り返す場面では
    // 下の行のバッジが上の行のユニットへ縦方向にはみ出す、という2種類の重なりが発生していた
    // （2026-07-17、Codexレビュー指摘）。バッジを.unit-slotという通常フローのラッパーに
    // ユニットと並べて入れることで、バッジの実サイズがflex-wrapのレイアウト計算に
    // 正しく参加するようにした
    if (badges) {
      const slot = document.createElement("div");
      // バッジが.unitの子から兄弟(.unit-slot内)に移ったため、.unit.deadのopacity:0が
      // バッジ側には効かなくなり、死亡ユニットのバッジだけ画面に浮いたまま残ってしまう
      // （2026-07-17、Codexレビュー指摘）。deadクラスをslot側にも付与し、CSS側で
      // 揃って消えるようにする
      slot.className = "unit-slot" + (u.alive ? "" : " dead");
      slot.innerHTML = badges;
      slot.appendChild(el);
      container.appendChild(slot);
    } else {
      container.appendChild(el);
    }
  });
}

/** タイトル画面の「ギャラリー」で見られるHP/ATK/DEF到達記録（localStorageで永続化）。
 * 起動時に読み込み、カード適用でステータスが伸びるたびに更新する */
let galleryProgress: GalleryProgress = loadGalleryProgress();

/** プレイヤーユニットの現在のtierを観測し、ギャラリーの記録を更新する（伸びていた場合のみ保存） */
function updateGalleryFromPlayerUnits(units: Unit[]) {
  const observed = units.map((u) => ({ hp: hpTier(u.hp), atk: atkTier(u.atk), def: defTier(u.def) }));
  const merged = mergeGalleryProgress(galleryProgress, observed);
  if (isGalleryProgressAdvanced(galleryProgress, merged)) {
    galleryProgress = merged;
    saveGalleryProgress(galleryProgress);
  }
}

function buildGalleryTrack(
  container: HTMLElement,
  countEl: HTMLElement,
  unlockedTier: number,
  renderShape: (tier: number) => HTMLElement
) {
  container.innerHTML = "";
  for (let tier = 1; tier <= 12; tier++) {
    const cell = document.createElement("div");
    const unlocked = tier <= unlockedTier;
    cell.className = "gallery-cell" + (tier === unlockedTier ? " current" : "");
    const num = document.createElement("div");
    num.className = "tier-num";
    num.textContent = String(tier);
    cell.appendChild(num);
    if (unlocked) {
      cell.appendChild(renderShape(tier));
    } else {
      const q = document.createElement("div");
      q.className = "gallery-cell-locked-mark";
      q.textContent = "？";
      cell.appendChild(q);
    }
    container.appendChild(cell);
  }
  countEl.textContent = `${unlockedTier} / 12 解放`;
}

function renderGalleryScreen() {
  const { hp, atk, def } = galleryProgress;

  hpSummaryValue.textContent = `${hp} / 12`;
  atkSummaryValue.textContent = `${atk} / 12`;
  defSummaryValue.textContent = `${def} / 12`;
  hpSummaryBar.style.width = (hp / 12) * 100 + "%";
  atkSummaryBar.style.width = (atk / 12) * 100 + "%";
  defSummaryBar.style.width = (def / 12) * 100 + "%";

  buildGalleryTrack(hpTrack, hpTrackCount, hp, (tier) => {
    const d = document.createElement("div");
    d.className = "gallery-cell-shape mat-iron";
    // タイル内に収まるよう実寸の半分で表示しつつ、高tier(最大140px)でもセル幅を超えないよう
    // ATK/DEFトラックと同じ34pxを上限にクランプする（2026-07-17、Codexレビュー指摘：
    // sizeForHpTier(12)*0.5=70pxは6列グリッドのセル幅(約63px)を超えて隣のセルに溢れていた）
    const size = Math.min(sizeForHpTier(tier) * 0.5, 34);
    d.style.width = size + "px";
    d.style.height = size + "px";
    d.style.borderRadius = "6%";
    return d;
  });

  buildGalleryTrack(atkTrack, atkTrackCount, atk, (tier) => {
    const d = document.createElement("div");
    d.className = "gallery-cell-shape mat-iron";
    d.style.width = "34px";
    d.style.height = "34px";
    const shape = shapeForAtkTier(tier);
    if (shape.kind === "rounded") {
      d.style.borderRadius = shape.borderRadiusPercent + "%";
    } else {
      d.style.clipPath = starPolygonClipPath(shape.points);
    }
    return d;
  });

  buildGalleryTrack(defTrack, defTrackCount, def, (tier) => {
    const d = document.createElement("div");
    d.className = "gallery-cell-shape " + materialClassForDefTier(tier);
    d.style.width = "34px";
    d.style.height = "34px";
    d.style.borderRadius = "6%";
    return d;
  });
}

function popDamage(targetEl: Element, text: string, color: string, hitIndex: number | null) {
  const pop = document.createElement("div");
  pop.className = "dmg-pop";
  pop.style.color = color;
  pop.style.fontSize = fontSizeForHitIndex(hitIndex ?? 0) + "px";
  if (hitIndex !== null) {
    pop.innerHTML = `<span class="hit-index-tag">${hitLabelFor(hitIndex)}</span>${text}`;
  } else {
    pop.textContent = text;
  }
  const rect = targetEl.getBoundingClientRect();
  const arenaRect = arena.getBoundingClientRect();
  pop.style.left = rect.left - arenaRect.left + rect.width / 2 - 14 + "px";
  pop.style.top = rect.top - arenaRect.top + "px";
  arena.appendChild(pop);
  setTimeout(() => pop.remove(), 720);
}

/** 全体攻撃化のヒット中だけ表示する「全体化◯%」常駐バッジ。攻撃者の上に、ダメージポップと
 * 同じ間だけ表示する（フォントサイズは連撃のNヒット表示と同じ式を流用し、
 * fontSizeForHitIndex(level - 1)で計算することでLvが高いほど大きく見せる。GAME_DESIGN.md §2.3） */
function popAoeBadge(attackerEl: Element, level: number) {
  const percent = Math.round(aoePercentForLevel(level) * 100);
  const badge = document.createElement("div");
  badge.className = "aoe-hit-badge";
  badge.style.fontSize = fontSizeForHitIndex(level - 1) + "px";
  badge.textContent = `全体化${percent}%`;
  const rect = attackerEl.getBoundingClientRect();
  const arenaRect = arena.getBoundingClientRect();
  badge.style.left = rect.left - arenaRect.left + rect.width / 2 + "px";
  badge.style.top = rect.top - arenaRect.top + "px";
  arena.appendChild(badge);
  setTimeout(() => badge.remove(), 720);
}

function hitLabelFor(hitIndex: number): string {
  const n = hitIndex + 1;
  const bangs = "！".repeat(Math.min(hitIndex, 5));
  return `${n}ヒット${bangs}`;
}

function pulseScore() {
  scoreNum.classList.add("pulse");
  setTimeout(() => scoreNum.classList.remove("pulse"), 160);
}

function showToast(msg: string) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add("show"));
  setTimeout(() => {
    t.classList.remove("show");
    setTimeout(() => t.remove(), 300);
  }, 2200);
}

/** 1ターン最大ダメージ/最大キル数が更新された瞬間、HUDのその数値自体を光らせる。
 * 以前は"RECORD UPDATE!!"というバナーをアリーナ中央に出していたが、ユニットの上に文字が
 * 重なって読めない、どちらの記録が更新されたのか分からない、という2つの問題があった
 * （2026-07-16、ユーザー報告）。更新された当のHUD数値をハイライトすれば両方解決する */
function flashStatUpdate(el: HTMLElement) {
  el.classList.remove("stat-flash");
  // 同じ要素に連続してクラスを付け直してもアニメーションが再生されるよう、一度剥がしてから
  // 次のフレームで付け直す（既にstat-flash中に連続更新された場合の再生保証）
  requestAnimationFrame(() => el.classList.add("stat-flash"));
  setTimeout(() => el.classList.remove("stat-flash"), 600);
}

function flashHit(el: Element) {
  el.classList.add("hit-flash");
  setTimeout(() => el.classList.remove("hit-flash"), 260);
}

function startBattle() {
  if (battleActive) return;
  battleActive = true;
  battleGen++;
  const gen = battleGen;
  // 敵編成（裏で付与される連撃を含む）はここで初めて確定・表示する
  state.enemyUnits = setupEnemies(state.round);
  // 挑発のブロック予算はここ（戦闘開始・ラウンド確定のタイミング）でのみリフィルする
  initTauntBlockBudget(state);
  startBtn.disabled = true;
  cardArea.innerHTML = "";
  statusLine.textContent = "戦闘中…";
  renderArena();
  battleTimer = setTimeout(() => battleTick(gen), scaledDelay(150, speedMode));
}

/** ヒット群を集計してSCORE・演出用スタッツに反映し、新記録が出た瞬間は演出する */
function applyHitsToRun(hits: HitResult[]) {
  if (hits.length === 0) return;

  state.score = applyScoreGain(state.score, hits);
  pulseScore();

  const { stats, damageRecordUpdated, killsRecordUpdated } = applyHitsBySwing(state.stats, hits);
  state.stats = stats;
  renderHud();
  if (damageRecordUpdated) flashStatUpdate(maxTurnDamageEl);
  if (killsRecordUpdated) flashStatUpdate(maxTurnKillsEl);
  if (damageRecordUpdated || killsRecordUpdated) sfxRecord();
}

function battleTick(gen: number) {
  if (!battleActive || gen !== battleGen) return;

  if (isPlayerWiped(state)) { endBattle(false); return; }
  if (isEnemyWiped(state)) { endBattle(true); return; }

  const playerTurn = playerAttackTurn(state);
  if (!playerTurn) { endBattle(false); return; }

  animateHits(playerSide, enemySide, playerTurn.hits, "player", gen, () => {
    if (!battleActive || gen !== battleGen) return;

    applyHitsToRun(playerTurn.hits);

    if (isEnemyWiped(state)) { endBattle(true); return; }
    if (isPlayerWiped(state)) { endBattle(false); return; }

    const enemyTurn = enemyAttackTurn(state);
    if (!enemyTurn) { endBattle(true); return; }

    animateHits(enemySide, playerSide, enemyTurn.hits, "enemy", gen, () => {
      if (!battleActive || gen !== battleGen) return;

      // 敵ターンで力尽きたユニットがいても、それより前に発生した被弾に対する反撃は
      // 有効なので、プレイヤー全滅判定より先に反撃を解決する（反撃で敵を返り討ちに
      // できる可能性もある）
      const retaliateHits = retaliatePhase(state, enemyTurn.hits);
      const finishEnemyPhase = () => {
        if (!battleActive || gen !== battleGen) return;
        renderHud();

        // 反撃で相討みになった場合は勝利を優先する（反撃で敵を全滅させたなら
        // その後にプレイヤー側が力尽きていても「返り討ち」が成立している）
        if (isEnemyWiped(state)) { endBattle(true); return; }
        if (isPlayerWiped(state)) { endBattle(false); return; }

        battleTimer = setTimeout(() => battleTick(gen), scaledDelay(130, speedMode));
      };

      if (retaliateHits.length > 0) {
        animateHits(playerSide, enemySide, retaliateHits, "retaliate", gen, () => {
          applyHitsToRun(retaliateHits);
          finishEnemyPhase();
        });
      } else {
        finishEnemyPhase();
      }
    });
  });
}

type TurnKind = "player" | "enemy" | "retaliate";

function animateHits(
  attackerContainer: HTMLElement,
  targetContainer: HTMLElement,
  hits: HitResult[],
  kind: TurnKind,
  gen: number,
  onDone: () => void
) {
  if (hits.length === 0) {
    onDone();
    return;
  }
  let anyKilled = false;

  // stateはこのターンの全ヒットを解決済み（最終値）なので、そのまま描画すると1コマ目から
  // 最終状態になってしまう。各対象について「このアニメーション開始前＝1発目のダメージが
  // 乗る前」のHPをhpAfter+damageで逆算し、ヒットを再生するたびに1体ずつ更新していく
  const overrides = new Map<string, DisplayOverride>();
  for (const hit of hits) {
    if (!overrides.has(hit.target.id)) {
      overrides.set(hit.target.id, { hp: hit.hpAfter + hit.damage, alive: true });
    }
  }
  renderArena(overrides);

  // 同じ攻撃者・同じ攻撃アクション（swingId）・同じhitIndexのヒットは「1回の振りで全体に同時ヒット」
  // なので、まとめて同じタイミングで再生する（全体攻撃化カードの見た目を裏付ける）。
  // swingIdも見るのは、同じ攻撃者が別々のタイミングで複数回攻撃（例: 反撃持ちが複数回反撃）した場合、
  // hitIndexだけでは「別々の攻撃がたまたま同じhitIndexになった」ケースと区別できないため
  // （2026-07-15、Codexレビュー指摘）
  const groups: HitResult[][] = [];
  for (const hit of hits) {
    const lastGroup = groups[groups.length - 1];
    const lastHit = lastGroup?.[0];
    if (
      lastHit &&
      lastHit.hitIndex === hit.hitIndex &&
      lastHit.attacker.id === hit.attacker.id &&
      lastHit.swingId === hit.swingId
    ) {
      lastGroup.push(hit);
    } else {
      groups.push([hit]);
    }
  }

  groups.forEach((group, gi) => {
    setTimeout(() => {
      if (!battleActive || gen !== battleGen) return;

      for (const hit of group) {
        overrides.set(hit.target.id, { hp: hit.hpAfter, alive: !hit.wasKilled });
      }
      renderArena(overrides);

      const aEl = attackerContainer.querySelector(`[data-id="${group[0].attacker.id}"]`);
      if (aEl) {
        aEl.classList.add("attacking");
        setTimeout(() => aEl.classList.remove("attacking"), 200);
        if (group[0].attacker.aoeLevel > 0) popAoeBadge(aEl, group[0].attacker.aoeLevel);
      }

      for (const hit of group) {
        const tEl = targetContainer.querySelector(`[data-id="${hit.target.id}"]`);
        if (tEl) {
          if (hit.blocked) {
            // damage===0だけでは「挑発でブロックされた」のか「DEF軽減で自然に0になった」のか
            // 見分けがつかないため、専用のGUARD表示にする（通常のダメージポップは出さない）
            popDamage(tEl, "GUARD", "#5ec8ff", null);
            tEl.classList.add("guard-flash");
            setTimeout(() => tEl.classList.remove("guard-flash"), 260);
          } else {
            const color = kind === "player" ? (hit.isCrit ? "#f4b942" : "#ffffff") : kind === "retaliate" ? "#4fd1c5" : "#e63950";
            const prefix = kind === "enemy" ? "-" : kind === "retaliate" ? "↩" : hit.isCrit ? "CRIT! " : "";
            const showsHitIndex = hit.attacker.attackCount > 1;
            popDamage(tEl, prefix + hit.damage, color, showsHitIndex ? hit.hitIndex : null);
            if (!hit.wasKilled) flashHit(tEl);
          }
        }
        if (hit.wasKilled) anyKilled = true;
      }

      if (kind === "player" || kind === "retaliate") sfxHit(group.some((h) => h.isCrit));
      else sfxHurt();

      if (gi === groups.length - 1) {
        if (anyKilled) sfxDeath();
        setTimeout(() => {
          if (!battleActive || gen !== battleGen) return;
          onDone();
        }, scaledDelay(140, speedMode));
      }
    }, gi * scaledDelay(HIT_STAGGER_BASE, speedMode));
  });
}

function endBattle(won: boolean) {
  if (battleTimer) clearTimeout(battleTimer);
  battleActive = false;

  if (won) {
    if (state.round >= state.finalRound && !isEndless(state.round, state.finalRound)) {
      showTenFloorClearPanel();
      sfxVictory();
    } else {
      state.playerUnits.forEach((u) => { u.hp = u.maxHp; u.alive = true; });
      const endless = isEndless(state.round, state.finalRound);
      if (endless) {
        // エンドレス継続中の各勝利ごとに自己ベストを更新する
        // （リセットやページを閉じた場合でも、直前まで到達した層数を記録として残すため）
        finalizeRecord(true);
      }
      if (endless && speedMode !== "normal") {
        // 高速/超速モードでは、勝利のたびにカード選択を挟まず自動で次のラウンドへ進む
        // （「それ以降の強化はなし、どこまで伸ばせるかを見届ける」仕様）
        continueEndlessAuto();
      } else {
        const label = endless ? `エンドレス ${state.round}層 突破！` : `ラウンド ${state.round} 勝利！`;
        statusLine.textContent = `${label} カードを1枚選んでください`;
        showCardChoices();
      }
      sfxVictory();
    }
    renderAll();
  } else {
    // エンドレス中の敗北は、その前段の通常クリアが既に成立している
    const record = finalizeRecord(isEndless(state.round, state.finalRound));
    sfxDefeat();
    renderAll();
    showResultPanel("敗北…", record.best, record.scoreBest, record.recordSaved, record.scoreSaved);
  }
}

function showTenFloorClearPanel() {
  cardArea.innerHTML = "";
  statusLine.textContent = "";
  startBtn.disabled = true;

  const { best } = finalizeRecord(true);

  const panel = document.createElement("div");
  panel.className = "clear-panel";
  panel.innerHTML = `
    <h2>🏆 ${state.finalRound}層クリア！</h2>
    <p>ここで終了してもよし、そのままエンドレスに挑戦して<br>どこまで化け物じみたビルドに育てられるか試してもよし。<br>自己ベスト到達ラウンド：<b>${best.endlessRound}</b></p>
    <div class="btn-row">
      <button class="btn secondary" id="endBtn">ここで終了</button>
      <button class="btn" id="endlessBtn">エンドレスに挑戦</button>
    </div>
    <div class="btn-row">
      <button class="btn secondary" id="endlessFastBtn">高速で自動周回</button>
      <button class="btn secondary" id="endlessUltraBtn">超速で自動周回</button>
    </div>
    <p class="clear-panel-note">高速/超速は、以後カード強化なしで死ぬまで自動継続します（いつでも「ここで終了」で切り上げ可）</p>
  `;
  cardArea.appendChild(panel);

  (panel.querySelector("#endBtn") as HTMLButtonElement).onclick = () => {
    cardArea.innerHTML = "";
    statusLine.textContent = `${state.finalRound}層クリア！ お疲れ様でした（自己ベスト到達ラウンド：${best.endlessRound}）`;
  };
  (panel.querySelector("#endlessBtn") as HTMLButtonElement).onclick = () => {
    state.playerUnits.forEach((u) => { u.hp = u.maxHp; u.alive = true; });
    statusLine.textContent = "エンドレス突入！ カードを1枚選んでください";
    showCardChoices();
  };
  (panel.querySelector("#endlessFastBtn") as HTMLButtonElement).onclick = () => enterAutoEndless("fast");
  (panel.querySelector("#endlessUltraBtn") as HTMLButtonElement).onclick = () => enterAutoEndless("ultra");
}

/**
 * 10層クリアパネルから、カード選択を挟まず直接エンドレスの自動周回（高速/超速）へ入る。
 * 通常の「エンドレスに挑戦」は1枚カードを選んでから次ラウンドへ進むが、
 * 「それ以降の強化はなし」の仕様通り、ここでは最初の1枚も選ばせずラウンドを進める
 */
function enterAutoEndless(speed: "fast" | "ultra") {
  speedMode = speed;
  state.playerUnits.forEach((u) => { u.hp = u.maxHp; u.alive = true; });
  state.round += 1;
  state.enemyUnits = [];
  cardArea.innerHTML = "";
  renderAll();
  startBattle();
}

/**
 * 既にエンドレス中（カード選択画面 or 戦闘中）に高速/超速へ切り替える。
 * カード選択画面が出ている場合はそれを飛ばして即座に次の戦闘を開始する
 * （戦闘中に押した場合は、現在の戦闘には影響せず次ラウンド以降から速度が反映される）
 */
function setAutoSpeed(speed: "fast" | "ultra") {
  speedMode = speed;
  if (cardArea.querySelector(".card-row")) {
    // このカード選択画面は「直前に勝ったラウンド」の報酬なので、選ばずに飛ばす場合も
    // chooseCard()/continueEndlessAuto()と同様にラウンドを進めてから次の戦闘へ入る。
    // これを怠ると、同じラウンド番号の敵ともう一度戦うことになってしまう
    // （2026-07-15、Codexレビュー指摘: 既にクリア済みのフロアの分だけSCORE/記録が水増しされていた）
    setSelectionMode(false);
    state.round += 1;
    state.enemyUnits = [];
    cardArea.innerHTML = "";
    renderAll();
    startBattle();
  }
  renderHud();
}

function continueEndlessAuto() {
  state.round += 1;
  state.enemyUnits = [];
  cardArea.innerHTML = "";
  renderAll();
  startBattle();
}

/** エンドレス中、ビルドが強くなりすぎて自然に終わらない場合の脱出ボタン。記録を確定してタイトルに戻る */
function finishEndlessRun() {
  if (battleTimer) clearTimeout(battleTimer);
  battleActive = false;
  battleGen++;
  const record = finalizeRecord(true);
  renderAll();
  showResultPanel("お疲れ様でした！", record.best, record.scoreBest, record.recordSaved, record.scoreSaved);
}

/**
 * ボタン要素は index.html に静的に配置し、onclickもモジュール末尾で一度だけバインドする
 * （下記の startBtn.onclick 等と同じ並び）。ここでは表示/非表示とラベルの切り替えだけ行う。
 *
 * 以前はここで毎回 innerHTML を作り直してボタンを再生成・onclick を再バインドしていたが、
 * renderHud()（延いてはこの関数）は1ヒットごとに呼ばれるため、高速/超速モードでは
 * 1秒間に何十回も呼ばれる。そのたびにボタンDOMを破棄→再生成していたため、
 * クリックのタイミングによっては「押した瞬間にボタンが差し替わって判定が消える」という
 * 状態になり、「ここで終了」がほぼ押せなくなる不具合があった
 * （2026-07-16、ユーザー報告: 超速で最後まで終了ボタンが押せずタブを強制終了する事態に）
 */
function renderEndlessControls() {
  if (!hasRunStarted || !isEndless(state.round, state.finalRound)) {
    endlessControls.hidden = true;
    return;
  }
  endlessControls.hidden = false;
  switchFastBtn.hidden = speedMode !== "normal";
  switchUltraBtn.hidden = speedMode === "ultra";
  switchUltraBtn.textContent = speedMode === "fast" ? "超速に上げる" : "超速に切替";
}

function finalizeRecord(clearedTenFloors: boolean) {
  const record = {
    endlessRound: state.round,
    score: state.score,
    maxTurnDamage: state.stats.maxTurnDamage,
    maxTurnKills: state.stats.maxTurnKills,
    clearedTenFloors,
    achievedAt: new Date().toISOString(),
  };
  const { saved: recordSaved, best } = saveRecordIfBetter(record);
  const { saved: scoreSaved, best: scoreBest } = saveBestScoreIfBetter(state.score);
  renderHud();
  if (recordSaved || scoreSaved) {
    showToast("🎉 自己ベスト更新！");
    sfxRecord();
  }
  return { best, scoreBest, recordSaved, scoreSaved };
}

/** エンドレスの「ここで終了」・敗北時に、タイトルへ戻る前に成果を確認できるリザルト画面を出す。
 * 2026-07-16、ユーザー報告：500層近くまで育てたエンドレスを「ここで終了」で切り上げたら、
 * トースト表示だけで即座にタイトル画面へ戻されてしまい、結果をゆっくり確認できなかった。
 * 以後はゲーム画面に留まったままcardAreaへパネルを表示し、ボタン操作でタイトルへ戻す */
function showResultPanel(title: string, best: RunRecord, scoreBest: number, recordSaved: boolean, scoreSaved: boolean) {
  cardArea.innerHTML = "";
  statusLine.textContent = "";
  startBtn.disabled = true;
  endlessControls.hidden = true;

  const panel = document.createElement("div");
  panel.className = "clear-panel";
  panel.innerHTML = `
    <h2>${title}</h2>
    <p>
      到達ラウンド：<b>${state.round}</b><br>
      SCORE：<b>${state.score.toLocaleString()}</b><br>
      自己ベスト到達ラウンド：<b>${best.endlessRound}</b>${recordSaved ? "　🎉更新！" : ""}<br>
      HIGH SCORE：<b>${scoreBest.toLocaleString()}</b>${scoreSaved ? "　🎉更新！" : ""}
    </p>
    <div class="btn-row">
      <button class="btn secondary" id="resultRestartBtn">最初から</button>
      <button class="btn" id="resultTitleBtn">タイトルへ</button>
    </div>
  `;
  cardArea.appendChild(panel);

  (panel.querySelector("#resultRestartBtn") as HTMLButtonElement).onclick = resetRun;
  (panel.querySelector("#resultTitleBtn") as HTMLButtonElement).onclick = () => {
    gameScreen.hidden = true;
    titleScreen.hidden = false;
  };
}

function showCardChoices() {
  const options = [...CARD_POOL].sort(() => Math.random() - 0.5).slice(0, 3);
  cardArea.innerHTML = "";

  selectedTargetId = null;
  const alivePlayerCount = state.playerUnits.filter((u) => u.alive).length;
  setSelectionMode(options.some((c) => c.singleTarget) && alivePlayerCount > 1);
  renderArena();

  if (unitSelectionMode) {
    const hint = document.createElement("div");
    hint.className = "select-hint";
    hint.textContent = "💡 単体強化カードの対象にしたいユニットをタップ（任意・未選択ならランダム）";
    cardArea.appendChild(hint);
  }

  const row = document.createElement("div");
  row.className = "card-row";
  options.forEach((card) => {
    const el = document.createElement("div");
    el.className = "card";
    el.innerHTML = `<div class="card-title">${card.name}</div><div class="card-desc">${card.desc}</div>`;
    el.onclick = () => chooseCard(card);
    row.appendChild(el);
  });
  cardArea.appendChild(row);
}

function chooseCard(card: (typeof CARD_POOL)[number]) {
  state.deck.push(card);

  let chosenUnit: Unit | null = null;
  if (card.singleTarget && selectedTargetId) {
    chosenUnit = state.playerUnits.find((u) => u.id === selectedTargetId && u.alive) || null;
  }
  const result = card.apply(state, chosenUnit);
  // 未選択でランダムに対象が決まった場合も、card.apply側が実際に適用したユニットを
  // そのままハイライト対象にする（以前は「最後のユニット」に決め打ちしていたため、
  // ランダム選択された実際の対象とズレることがあった）
  const appliedUnit = result.appliedUnit ?? null;

  setSelectionMode(false);
  selectedTargetId = null;
  state.round += 1;
  // 次ラウンドの敵編成はここでは生成しない（戦闘開始まで非公開にするため、startBattle()で生成する）
  state.enemyUnits = [];
  // カードでHP/ATK/DEFが伸びたタイミングでギャラリー記録を更新する
  // （ステータスが変化しうるのはカード適用時のみなので、ここで十分）
  updateGalleryFromPlayerUnits(state.playerUnits);
  cardArea.innerHTML = "";
  showToast(`${card.name}：${result.message}`);
  statusLine.textContent = `${roundLabel(state.round, state.finalRound)}: 戦闘開始を押してください`;
  startBtn.disabled = false;
  renderAll();

  if (appliedUnit) {
    const el = playerSide.querySelector(`[data-id="${appliedUnit.id}"]`);
    if (el) {
      el.classList.add("card-applied");
      setTimeout(() => el.classList.remove("card-applied"), 500);
    }
  }
}

/**
 * 「最初から」は、そのランのSCOREがまだfinalizeRecord（敗北・10層クリア・エンドレス勝利）を
 * 経ていない場合でも、リセットで失われる前にHIGH SCORE自己ベストとしては確定させておく
 * （2026-07-15、Codexレビュー指摘: 自己ベストを更新した直後に「最初から」を押すと、
 *   そのスコアがどこにも保存されないまま消えてしまっていた）
 */
function resetRun() {
  if (hasRunStarted) saveBestScoreIfBetter(state.score);
  initRun(state.finalRound);
}

openGalleryBtn.onclick = () => {
  renderGalleryScreen();
  titleScreen.hidden = true;
  galleryScreen.hidden = false;
};
galleryBackBtn.onclick = () => {
  galleryScreen.hidden = true;
  titleScreen.hidden = false;
};

startBtn.onclick = startBattle;
resetBtn.onclick = resetRun;
switchFastBtn.onclick = () => setAutoSpeed("fast");
switchUltraBtn.onclick = () => setAutoSpeed("ultra");
finishEndlessBtn.onclick = finishEndlessRun;

RUN_LENGTH_OPTIONS.forEach((floors) => {
  const btn = document.createElement("button");
  btn.className = "btn";
  btn.textContent = `${floors}層ラン`;
  btn.onclick = () => {
    titleScreen.hidden = true;
    gameScreen.hidden = false;
    initRun(floors);
  };
  titleModeRow.appendChild(btn);
});
