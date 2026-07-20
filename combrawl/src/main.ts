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
import {
  atkThresholdForTier,
  atkTier,
  defThresholdForTier,
  defTier,
  hpThresholdForTier,
  hpTier,
  isHpCapped,
  materialClassForDefTier,
  shapeForAtkTier,
  sizeForHpTier,
  starPolygonClipPath,
} from "./visuals";
import { isGalleryProgressAdvanced, loadGalleryProgress, mergeGalleryProgress, resetGalleryProgress, saveGalleryProgress, type GalleryProgress } from "./gallery";
import { attackBadgeInfo, fontSizeForHitIndex, type AttackBadgeInfo } from "./combat";

const titleScreen = document.getElementById("titleScreen") as HTMLElement;
const gameScreen = document.getElementById("gameScreen") as HTMLElement;
const titleModeRow = document.getElementById("titleModeRow") as HTMLElement;
const galleryScreen = document.getElementById("galleryScreen") as HTMLElement;
const openGalleryBtn = document.getElementById("openGalleryBtn") as HTMLButtonElement;
const galleryBackBtn = document.getElementById("galleryBackBtn") as HTMLButtonElement;
const galleryResetBtn = document.getElementById("galleryResetBtn") as HTMLButtonElement;
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

interface DisplayOverride {
  hp: number;
  alive: boolean;
  /** アニメーション再生中、そのユニットの挑発バッジに表示すべき「残りブロック回数」の
   * 上書き値。stateはそのターンの全ヒットを解決済み（最終値）で、hp/aliveと同じ理由で
   * 再生の途中経過を表せないため、hpAfter方式と同様にblockRemainingAfterから逆算する
   * （2026-07-17、Codexレビュー指摘: Lv3挑発が3連続でブロックした際、アニメーション上は
   * 1発目の時点で既に🛡✕（最終値）になってしまい、🛡3→🛡2→🛡1→🛡✕のカウントダウンが
   * 見えず、盾シャッター演出もバッジが空になった後に発火しているように見えていた） */
  tauntRemaining?: number;
}

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
    if (u.tauntLevel > 0) {
      // 挑発は「Lv（1ラウンドの最大ブロック回数）」の固定表示ではなく、そのラウンド中の
      // 残りブロック回数を動的に表示する。budgetにまだエントリが無い場合（カードを取った直後、
      // まだ一度もinitTauntBlockBudget()が走っていない）はtauntLevelそのもの＝満タン扱いにする
      // （2026-07-17、ユーザー要望：見た目だけでは「ちゃんと盾が減っているか」分からなかった）。
      // アニメーション再生中はoverride.tauntRemainingを優先する：state.tauntBlockBudgetは
      // そのターンの全ヒットを解決済み（最終値）を持つため、そのまま読むと1発目の再生時点で
      // 既に最終値（例: 🛡✕）になってしまい、カウントダウンが見えなくなる
      // （2026-07-17、Codexレビュー指摘）
      const remaining =
        override?.tauntRemaining !== undefined
          ? override.tauntRemaining
          : state.tauntBlockBudget.has(u.id)
            ? state.tauntBlockBudget.get(u.id)!
            : u.tauntLevel;
      badgeList.push(remaining > 0 ? `🛡${remaining}` : `🛡✕`);
    }
    // 特性ごとに枠線付きの個別チップへ分けると、複数特性が乗ったユニットでバッジが林立して
    // ごちゃつく（2026-07-17、ユーザー報告：「以前のほうがまだスマート」）。枠線を持つのは
    // .unit-badges1個だけにし、中身は絵文字+数字を1行に並べたシンプルな帯にする
    const badges = badgeList.length
      ? `<div class="unit-badges">${badgeList.join(" ")}</div>`
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
    // 正しく参加するようにした。
    // バッジの有無に関わらず必ず.unit-slotで包むこと：バッジ有りユニットだけ.unit-slot
    // 経由にすると、.sideのalign-items:stretchで各slotの縦サイズが行内最大まで伸びる一方、
    // .unit-slot無しのバッジ無しユニットは自身の固定height分しか伸びず上詰めのまま残るため、
    // バッジの有無で横一列のユニット本体の位置がズレて見える不具合になる（2026-07-17、ユーザー報告）
    const slot = document.createElement("div");
    // バッジが.unitの子から兄弟(.unit-slot内)に移ったため、.unit.deadのopacity:0が
    // バッジ側には効かなくなり、死亡ユニットのバッジだけ画面に浮いたまま残ってしまう
    // （2026-07-17、Codexレビュー指摘）。deadクラスをslot側にも付与し、CSS側で
    // 揃って消えるようにする
    slot.className = "unit-slot" + (u.alive ? "" : " dead");
    slot.innerHTML = badges;
    slot.appendChild(el);
    // ATK/DEFは見た目（形のトゲトゲ度・素材）だけでは実際の数値が分からない。
    // 段階解放をレア化した（STEP_LOG2 1→3）ことで、見た目が変わらないまま数値だけ
    // 積み上がる期間が長くなり、余計に判別しづらくなったというユーザー指摘を受けて追加
    // （2026-07-18）。ユニットの下に常時表示する（常駐バッジと違い、特性の有無に関わらず
    // 全ユニットに表示する）
    const stats = document.createElement("div");
    stats.className = "unit-stats";
    stats.innerHTML = `ATK:${Math.round(u.atk)}<br>DEF:${Math.round(u.def)}`;
    slot.appendChild(stats);
    container.appendChild(slot);
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

/** 大きな数値をK/M/B/T単位で短縮表示する。ギャラリーの未到達セルは高tierになるほど
 * しきい値が桁違いに大きくなる（例: HP tier12のしきい値は約687億）ため、通常の
 * toLocaleString()（他のスコア表示で使っている桁区切り）では横幅わずか約63pxの
 * セルに収まらない（2026-07-18） */
function formatCompactNumber(n: number): string {
  const units: Array<[number, string]> = [
    [1e12, "T"],
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  for (const [threshold, suffix] of units) {
    if (n >= threshold) {
      const v = n / threshold;
      return (v >= 100 ? v.toFixed(0) : v.toFixed(1).replace(/\.0$/, "")) + suffix;
    }
  }
  return String(Math.round(n));
}

function buildGalleryTrack(
  container: HTMLElement,
  countEl: HTMLElement,
  unlockedTier: number,
  renderShape: (tier: number) => HTMLElement,
  thresholdForTier: (tier: number) => number
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
      // 「？」本体としきい値の目安を縦に並べるため、.gallery-cell（横方向center揃え）とは別に
      // 縦積み用のラッパーで包む
      const locked = document.createElement("div");
      locked.className = "gallery-cell-locked";
      const q = document.createElement("div");
      q.className = "gallery-cell-locked-mark";
      q.textContent = "？";
      locked.appendChild(q);
      // 未到達でも目指すべき数値の目安を出す（2026-07-18、ユーザー要望：
      // 「それぞれHP、ATK、DEFがいくつ以上でその見た目になるのか、？状態でも出してほしい」）
      const threshold = document.createElement("div");
      threshold.className = "gallery-cell-threshold";
      threshold.textContent = formatCompactNumber(thresholdForTier(tier)) + "〜";
      locked.appendChild(threshold);
      cell.appendChild(locked);
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
  }, hpThresholdForTier);

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
  }, atkThresholdForTier);

  buildGalleryTrack(defTrack, defTrackCount, def, (tier) => {
    const d = document.createElement("div");
    d.className = "gallery-cell-shape " + materialClassForDefTier(tier);
    d.style.width = "34px";
    d.style.height = "34px";
    d.style.borderRadius = "6%";
    return d;
  }, defThresholdForTier);
}

/** ユニットの真上に浮かせる系の演出（全体化%/反撃%バッジ、GUARD表示、盾シャッター）が
 * 基準にすべき座標を返す。常駐の特性バッジ(.unit-badges)が既にユニット直上を専有しているため
 * （連撃⚡/全体化🌀/反撃↩/挑発🛡のいずれかを持つユニットなら必ず存在する）、単純に
 * ユニット自身の上端を基準にすると常駐バッジと同じ位置に重なってしまう
 * （2026-07-17、ユーザー報告）。常駐バッジがあればその上端、無ければユニット自身の上端を返す */
function badgeAnchorRect(unitEl: Element): { left: number; top: number; width: number } {
  const slot = unitEl.closest(".unit-slot");
  const persistentBadge = slot?.querySelector(".unit-badges");
  const rect = (persistentBadge ?? unitEl).getBoundingClientRect();
  return { left: rect.left, top: rect.top, width: rect.width };
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

/** 全体化%・反撃%のうち、そのヒットで実際に効いているものを攻撃者の頭上にまとめて表示する。
 * `combat.ts`の`attackBadgeInfo`（実ダメージ計算と同じ式を使う純粋関数）が返した内容をそのまま
 * 描画するだけで、どちらか一方しか表示しない・実際の倍率とズレる、といったことが起きないようにする
 * （2026-07-20、ユーザー報告：以前は反撃ターン中は反撃%を優先表示し、同時に効いている全体化%が
 * 消えてしまっていた）。両方同時に有効な場合（反撃ターンに全体化持ちが反撃するケース）は、
 * 内訳（掛け算のまま）を薄く小さく上段に、実際の合計（基準100%からの増分）を通常サイズで下段に出す */
function popAttackBadge(attackerEl: Element, info: AttackBadgeInfo, attacker: Unit) {
  const rect = badgeAnchorRect(attackerEl);
  const arenaRect = arena.getBoundingClientRect();
  const left = rect.left - arenaRect.left + rect.width / 2;
  const top = rect.top - arenaRect.top;

  const spawn = (text: string, extraClass: string, fontSize: number, topOffset: number) => {
    const badge = document.createElement("div");
    badge.className = extraClass ? `aoe-hit-badge ${extraClass}` : "aoe-hit-badge";
    badge.style.fontSize = fontSize + "px";
    badge.textContent = text;
    badge.style.left = left + "px";
    badge.style.top = top + topOffset + "px";
    arena.appendChild(badge);
    setTimeout(() => badge.remove(), 720);
  };

  if (info.comboDeltaPercent !== undefined) {
    // 内訳は上段（アンカーから離れる方向）に少し浮かせ、合計はいつもの位置に出す
    spawn(`反撃${info.retaliatePercent}%×全体化${info.aoePercent}%`, "attack-badge-breakdown", 11, -16);
    const level = Math.max(attacker.aoeLevel, attacker.retaliateLevel);
    spawn(`攻撃力+${info.comboDeltaPercent}%`, "", fontSizeForHitIndex(level - 1), 0);
    return;
  }
  if (info.retaliatePercent !== undefined) {
    spawn(`反撃${info.retaliatePercent}%`, "", fontSizeForHitIndex(attacker.retaliateLevel - 1), 0);
    return;
  }
  if (info.aoePercent !== undefined) {
    spawn(`全体化${info.aoePercent}%`, "", fontSizeForHitIndex(attacker.aoeLevel - 1), 0);
  }
}

/** 挑発でダメージを完全無効化した瞬間に表示する「GUARD」バッジ。popAoeBadge/popRetaliateBadge
 * と全く同じ見た目・アンカー位置（badgeAnchorRect、常駐バッジの上）にすることで、全体化%・
 * 反撃%と一貫した「ヒット中に一瞬出て消える」表現に揃えた（2026-07-17、ユーザー報告：
 * 以前はダメージポップと同じ上に流れていく演出だったため、常駐バッジと重なって見づらかった） */
function popGuardBadge(targetEl: Element) {
  const badge = document.createElement("div");
  badge.className = "aoe-hit-badge guard-hit-badge";
  badge.textContent = "GUARD";
  const rect = badgeAnchorRect(targetEl);
  const arenaRect = arena.getBoundingClientRect();
  badge.style.left = rect.left - arenaRect.left + rect.width / 2 + "px";
  badge.style.top = rect.top - arenaRect.top + "px";
  arena.appendChild(badge);
  setTimeout(() => badge.remove(), 720);
}

/** 挑発のブロック予算をちょうど使い切った瞬間（blockRemainingAfter===0）に、盾が左右に
 * 真っ二つに割れる演出を出す。左右2枚のspanで同じ🛡️を重ねて表示し、それぞれをclip-pathで
 * 半分だけ切り抜いてから逆方向に吹き飛ばすことで「割れて破片が飛ぶ」見た目にする
 * （GAME_DESIGN.md §2.5で検討されていたが未実装だった演出。2026-07-17実装） */
function popShieldShatter(targetEl: Element) {
  const rect = badgeAnchorRect(targetEl);
  const arenaRect = arena.getBoundingClientRect();
  const left = rect.left - arenaRect.left + rect.width / 2;
  const top = rect.top - arenaRect.top;

  const halves: Array<{ cls: string; clip: string }> = [
    { cls: "shield-shard-left", clip: "polygon(0 0, 50% 0, 50% 100%, 0 100%)" },
    { cls: "shield-shard-right", clip: "polygon(50% 0, 100% 0, 100% 100%, 50% 100%)" },
  ];
  for (const half of halves) {
    const shard = document.createElement("div");
    shard.className = "shield-shard " + half.cls;
    shard.style.clipPath = half.clip;
    shard.style.left = left + "px";
    shard.style.top = top + "px";
    shard.textContent = "🛡️";
    arena.appendChild(shard);
    setTimeout(() => shard.remove(), 560);
  }
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
    // 挑発バッジも同じ理由で「このヒットより前＝blockRemainingAfter+1」の残数から逆算する。
    // その対象について最初に出てくるヒットだけを見れば十分（挑発ユニットは予算が残っている間
    // 優先的に狙われるため、ブロックされたヒットは常にそのターンの先頭側に来る）
    if (hit.blocked && hit.blockRemainingAfter !== undefined) {
      const existing = overrides.get(hit.target.id)!;
      if (existing.tauntRemaining === undefined) {
        existing.tauntRemaining = hit.blockRemainingAfter + 1;
      }
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
        const prevTauntRemaining = overrides.get(hit.target.id)?.tauntRemaining;
        overrides.set(hit.target.id, {
          hp: hit.hpAfter,
          alive: !hit.wasKilled,
          // ブロックされたヒットなら、このヒットで消費した後の残数に更新する。
          // それ以外（挑発と無関係のヒット、あるいはこの対象が同グループ内で複数回
          // 登場しない限り通常は1回のみ）は直前の値をそのまま引き継ぐ
          tauntRemaining: hit.blocked ? hit.blockRemainingAfter : prevTauntRemaining,
        });
      }
      renderArena(overrides);

      const aEl = attackerContainer.querySelector(`[data-id="${group[0].attacker.id}"]`);
      if (aEl) {
        aEl.classList.add("attacking");
        setTimeout(() => aEl.classList.remove("attacking"), 200);
        const badgeInfo = attackBadgeInfo({
          aoeLevel: group[0].attacker.aoeLevel,
          retaliateLevel: group[0].attacker.retaliateLevel,
          isRetaliateSwing: kind === "retaliate",
        });
        if (badgeInfo) popAttackBadge(aEl, badgeInfo, group[0].attacker);
      }

      for (const hit of group) {
        const tEl = targetContainer.querySelector(`[data-id="${hit.target.id}"]`);
        if (tEl) {
          if (hit.blocked) {
            // damage===0だけでは「挑発でブロックされた」のか「DEF軽減で自然に0になった」のか
            // 見分けがつかないため、専用のGUARD表示にする（通常のダメージポップは出さない）
            popGuardBadge(tEl);
            tEl.classList.add("guard-flash");
            setTimeout(() => tEl.classList.remove("guard-flash"), 260);
            // ちょうどこのヒットでブロック予算を使い切った（blockRemainingAfter===0）瞬間だけ、
            // 盾が左右に真っ二つに割れる演出を出す（2026-07-17実装、GAME_DESIGN.md §2.5で
            // 検討されていたが未実装だった演出。ユーザー要望で今回追加）
            if (hit.blockRemainingAfter === 0) popShieldShatter(tEl);
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
      // 挑発の残ブロック数もここでリセットする（次のinitTauntBlockBudget()までの間、
      // renderUnits()が前ラウンド終了時点の使い切った値（例: 🛡✕）を読んでしまい、
      // カード選択画面で挑発をさらに取ってtauntLevelが増えても表示が更新されない
      // 不具合があった。2026-07-19、ユーザー報告）
      state.tauntBlockBudget = new Map();
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
    state.tauntBlockBudget = new Map();
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
  state.tauntBlockBudget = new Map();
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
galleryResetBtn.onclick = () => {
  // localStorageを消す破壊的操作かつ元に戻せないため、必ず確認を挟む
  if (!confirm("ギャラリーの記録（HP/ATK/DEFの到達段階）を全てリセットします。よろしいですか？")) return;
  galleryProgress = resetGalleryProgress();
  renderGalleryScreen();
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
