import "./style.css";
import type { GameState, HitResult, Unit } from "./types";
import { makeUnit } from "./units";
import { setupEnemies, FINAL_ROUND } from "./data/enemies";
import { CARD_POOL } from "./data/cards";
import { playerAttackTurn, enemyAttackTurn, retaliatePhase, isPlayerWiped, isEnemyWiped } from "./battle";
import { applyComboGain, applyComboDecay, summarizeTurn, applyTurnStats, initialStats } from "./stats";
import { isEndless, roundLabel } from "./progress";
import { loadBestRecord, saveRecordIfBetter } from "./highscore";

const arena = document.getElementById("arena") as HTMLElement;
const playerSide = document.getElementById("playerSide") as HTMLElement;
const enemySide = document.getElementById("enemySide") as HTMLElement;
const comboNum = document.getElementById("comboNum") as HTMLElement;
const statusLine = document.getElementById("statusLine") as HTMLElement;
const startBtn = document.getElementById("startBtn") as HTMLButtonElement;
const resetBtn = document.getElementById("resetBtn") as HTMLButtonElement;
const cardArea = document.getElementById("cardArea") as HTMLElement;
const roundEl = document.getElementById("round") as HTMLElement;
const maxComboEl = document.getElementById("maxCombo") as HTMLElement;
const cardCountEl = document.getElementById("cardCount") as HTMLElement;
const maxTurnDamageEl = document.getElementById("maxTurnDamage") as HTMLElement;
const maxTurnKillsEl = document.getElementById("maxTurnKills") as HTMLElement;
const bestRoundEl = document.getElementById("bestRound") as HTMLElement;
const deckStrip = document.getElementById("deckStrip") as HTMLElement;

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

// --- ゲーム状態 ---
let state: GameState;
let battleActive = false;
let battleTimer: ReturnType<typeof setTimeout> | null = null;
let battleGen = 0;
let unitSelectionMode = false;
let selectedTargetId: string | null = null;
let lastMilestone = 1;
let awaitingEndlessChoice = false;

const HIT_STAGGER = 190;

function initRun() {
  if (battleTimer) clearTimeout(battleTimer);
  battleActive = false;
  battleGen++;
  unitSelectionMode = false;
  selectedTargetId = null;
  lastMilestone = 1;
  awaitingEndlessChoice = false;
  state = {
    round: 1,
    playerUnits: [makeUnit("player", 24, 4), makeUnit("player", 24, 4)],
    enemyUnits: setupEnemies(1),
    deck: [],
    combo: 1,
    stats: initialStats(),
  };
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
  roundEl.textContent = roundLabel(state.round);
  maxComboEl.textContent = state.stats.maxCombo.toFixed(1);
  cardCountEl.textContent = String(state.deck.length);
  maxTurnDamageEl.textContent = String(state.stats.maxTurnDamage);
  maxTurnKillsEl.textContent = String(state.stats.maxTurnKills);
  comboNum.textContent = "×" + state.combo.toFixed(1);
  deckStrip.innerHTML = state.deck.map((c) => `<div class="chip">${c.name}</div>`).join("");
  const best = loadBestRecord();
  bestRoundEl.textContent = best ? String(best.endlessRound) : "-";
}

function renderArena() {
  renderUnits(playerSide, state.playerUnits, "player-unit");
  renderUnits(enemySide, state.enemyUnits, "enemy-unit");
}

function renderUnits(container: HTMLElement, units: Unit[], cls: "player-unit" | "enemy-unit") {
  container.innerHTML = "";
  units.forEach((u) => {
    const el = document.createElement("div");
    let className = "unit " + cls + (u.alive ? "" : " dead");
    if (unitSelectionMode && cls === "player-unit" && u.alive) {
      className += " selectable";
      if (u.id === selectedTargetId) className += " selected-target";
    }
    el.className = className;
    el.dataset.id = u.id;
    const size = Math.max(30, Math.min(96, 16 + Math.sqrt(Math.max(0, u.hp)) * 7));
    el.style.width = size + "px";
    el.style.height = size + "px";

    const badgeList: string[] = [];
    if (u.attackCount > 1) badgeList.push(`⚡${u.attackCount}`);
    if (u.aoeLevel > 0) badgeList.push(`🌀${u.aoeLevel > 1 ? u.aoeLevel : ""}`);
    if (u.retaliateLevel > 0) badgeList.push(`↩${u.retaliateLevel > 1 ? u.retaliateLevel : ""}`);
    if (u.tauntLevel > 0) badgeList.push(`🛡${u.tauntLevel > 1 ? u.tauntLevel : ""}`);
    const badges = badgeList.length ? `<div class="unit-badges">${badgeList.join(" ")}</div>` : "";

    el.innerHTML = `${badges}<div class="unit-hp">${Math.max(0, Math.round(u.hp))}</div>
      <div class="hp-bar-wrap"><div class="hp-bar" style="width:${Math.max(0, (u.hp / u.maxHp) * 100)}%; background:${cls === "player-unit" ? "#4fd1c5" : "#e63950"}"></div></div>`;

    if (unitSelectionMode && cls === "player-unit" && u.alive) {
      el.onclick = () => {
        selectedTargetId = selectedTargetId === u.id ? null : u.id;
        renderArena();
      };
    }
    container.appendChild(el);
  });
}

function popDamage(targetEl: Element, text: string, color: string, hitIndex: number | null) {
  const pop = document.createElement("div");
  pop.className = "dmg-pop";
  pop.style.color = color;
  const hitBoost = hitIndex ? Math.min(hitIndex, 6) * 3 : 0;
  pop.style.fontSize = 16 + Math.min(state.combo, 15) * 3 + hitBoost + "px";
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

function hitLabelFor(hitIndex: number): string {
  const n = hitIndex + 1;
  const bangs = "！".repeat(Math.min(hitIndex, 5));
  return `${n}ヒット${bangs}`;
}

function pulseCombo() {
  comboNum.classList.add("pulse");
  setTimeout(() => comboNum.classList.remove("pulse"), 160);
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

function checkMilestone() {
  const milestones = [3, 5, 8, 12, 20, 30, 50];
  for (const m of milestones) {
    if (state.combo >= m && lastMilestone < m) {
      lastMilestone = m;
      showMilestoneBanner(m);
      break;
    }
  }
}

function showMilestoneBanner(m: number) {
  const b = document.createElement("div");
  b.className = "milestone-banner";
  b.textContent = `COMBO ×${m}!!`;
  arena.appendChild(b);
  arena.classList.add("shake");
  setTimeout(() => arena.classList.remove("shake"), 300);
  setTimeout(() => b.remove(), 900);
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
  startBtn.disabled = true;
  cardArea.innerHTML = "";
  statusLine.textContent = "戦闘中…";
  battleTimer = setTimeout(() => battleTick(gen), 150);
}

function battleTick(gen: number) {
  if (!battleActive || gen !== battleGen) return;

  if (isPlayerWiped(state)) { endBattle(false); return; }
  if (isEnemyWiped(state)) { endBattle(true); return; }

  const playerTurn = playerAttackTurn(state);
  if (!playerTurn) { endBattle(false); return; }

  animateHits(playerSide, enemySide, playerTurn.hits, "player", gen, () => {
    if (!battleActive || gen !== battleGen) return;

    const turn = summarizeTurn(playerTurn.hits);
    state.stats = applyTurnStats(state.stats, turn);
    const gain = applyComboGain(state.combo, playerTurn.hits.length, state.stats.maxCombo);
    state.combo = gain.combo;
    state.stats.maxCombo = gain.maxCombo;
    if (playerTurn.hits.length > 0) {
      pulseCombo();
      checkMilestone();
    }
    renderHud();

    if (isEnemyWiped(state)) { endBattle(true); return; }
    if (isPlayerWiped(state)) { endBattle(false); return; }

    const enemyTurn = enemyAttackTurn(state);
    if (!enemyTurn) { endBattle(true); return; }

    animateHits(enemySide, playerSide, enemyTurn.hits, "enemy", gen, () => {
      if (!battleActive || gen !== battleGen) return;
      if (isEnemyWiped(state)) { endBattle(true); return; }
      if (isPlayerWiped(state)) { endBattle(false); return; }

      // 「被弾するたびに反撃」の仕様通り、被弾イベントの数だけ渡す（連撃で複数回被弾したユニットは複数回反撃する）
      const damagedUnits = enemyTurn.hits.map((h) => h.target);
      const retaliateHits = retaliatePhase(state, damagedUnits);
      const finishEnemyPhase = () => {
        if (!battleActive || gen !== battleGen) return;
        state.combo = applyComboDecay(state.combo);
        renderHud();

        if (isPlayerWiped(state)) { endBattle(false); return; }
        if (isEnemyWiped(state)) { endBattle(true); return; }

        battleTimer = setTimeout(() => battleTick(gen), 130);
      };

      if (retaliateHits.length > 0) {
        animateHits(playerSide, enemySide, retaliateHits, "retaliate", gen, () => {
          const retaliateTurn = summarizeTurn(retaliateHits);
          state.stats = applyTurnStats(state.stats, retaliateTurn);
          const rGain = applyComboGain(state.combo, retaliateHits.length, state.stats.maxCombo);
          state.combo = rGain.combo;
          state.stats.maxCombo = rGain.maxCombo;
          pulseCombo();
          checkMilestone();
          renderHud();
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
  const attacker = hits[0].attacker;
  const showsHitIndex = attacker.attackCount > 1;
  let anyKilled = false;

  hits.forEach((hit, i) => {
    setTimeout(() => {
      if (!battleActive || gen !== battleGen) return;
      renderArena();

      const aEl = attackerContainer.querySelector(`[data-id="${hit.attacker.id}"]`);
      if (aEl) {
        aEl.classList.add("attacking");
        setTimeout(() => aEl.classList.remove("attacking"), 200);
      }
      const tEl = targetContainer.querySelector(`[data-id="${hit.target.id}"]`);
      if (tEl) {
        const color = kind === "player" ? (hit.isCrit ? "#f4b942" : "#ffffff") : kind === "retaliate" ? "#4fd1c5" : "#e63950";
        const prefix = kind === "enemy" ? "-" : kind === "retaliate" ? "↩" : hit.isCrit ? "CRIT! " : "";
        popDamage(tEl, prefix + hit.damage, color, showsHitIndex ? hit.hitIndex : null);
        if (!hit.wasKilled) flashHit(tEl);
      }
      if (hit.wasKilled) anyKilled = true;

      if (kind === "player" || kind === "retaliate") sfxHit(hit.isCrit);
      else sfxHurt();

      if (i === hits.length - 1) {
        if (anyKilled) sfxDeath();
        setTimeout(() => {
          if (!battleActive || gen !== battleGen) return;
          onDone();
        }, 140);
      }
    }, i * HIT_STAGGER);
  });
}

function endBattle(won: boolean) {
  if (battleTimer) clearTimeout(battleTimer);
  battleActive = false;

  if (won) {
    if (state.round >= FINAL_ROUND && !isEndless(state.round)) {
      showTenFloorClearPanel();
      sfxVictory();
    } else {
      state.playerUnits.forEach((u) => { u.hp = u.maxHp; u.alive = true; });
      const label = isEndless(state.round) ? `エンドレス ${state.round}層 突破！` : `ラウンド ${state.round} 勝利！`;
      statusLine.textContent = `${label} カードを1枚選んでください`;
      showCardChoices();
      sfxVictory();
    }
  } else {
    // エンドレス中の敗北は、その前段の10層クリアが既に成立している
    finalizeRecord(isEndless(state.round));
    statusLine.textContent = `敗北… 最大コンボ ×${state.stats.maxCombo.toFixed(1)} / 到達ラウンド ${state.round}`;
    startBtn.disabled = true;
    sfxDefeat();
  }
  renderAll();
}

function showTenFloorClearPanel() {
  awaitingEndlessChoice = true;
  cardArea.innerHTML = "";
  statusLine.textContent = "";
  startBtn.disabled = true;

  const best = finalizeRecord(true);

  const panel = document.createElement("div");
  panel.className = "clear-panel";
  panel.innerHTML = `
    <h2>🏆 10層クリア！</h2>
    <p>ここで終了してもよし、そのままエンドレスに挑戦して<br>どこまで化け物じみたビルドに育てられるか試してもよし。<br>自己ベスト到達ラウンド：<b>${best.endlessRound}</b></p>
    <div class="btn-row">
      <button class="btn secondary" id="endBtn">ここで終了</button>
      <button class="btn" id="endlessBtn">エンドレスに挑戦</button>
    </div>
  `;
  cardArea.appendChild(panel);

  (panel.querySelector("#endBtn") as HTMLButtonElement).onclick = () => {
    awaitingEndlessChoice = false;
    cardArea.innerHTML = "";
    statusLine.textContent = `10層クリア！ お疲れ様でした（自己ベスト到達ラウンド：${best.endlessRound}）`;
  };
  (panel.querySelector("#endlessBtn") as HTMLButtonElement).onclick = () => {
    awaitingEndlessChoice = false;
    state.playerUnits.forEach((u) => { u.hp = u.maxHp; u.alive = true; });
    statusLine.textContent = "エンドレス突入！ カードを1枚選んでください";
    showCardChoices();
  };
}

function finalizeRecord(clearedTenFloors: boolean) {
  const record = {
    endlessRound: state.round,
    maxCombo: state.stats.maxCombo,
    maxTurnDamage: state.stats.maxTurnDamage,
    maxTurnKills: state.stats.maxTurnKills,
    clearedTenFloors,
    achievedAt: new Date().toISOString(),
  };
  const { best } = saveRecordIfBetter(record);
  renderHud();
  return best;
}

function showCardChoices() {
  const options = [...CARD_POOL].sort(() => Math.random() - 0.5).slice(0, 3);
  cardArea.innerHTML = "";

  selectedTargetId = null;
  const alivePlayerCount = state.playerUnits.filter((u) => u.alive).length;
  unitSelectionMode = options.some((c) => c.singleTarget) && alivePlayerCount > 1;
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

  const appliedUnit = chosenUnit || (card.singleTarget ? state.playerUnits[state.playerUnits.length - 1] : null);

  unitSelectionMode = false;
  selectedTargetId = null;
  state.round += 1;
  lastMilestone = 1;
  state.combo = 1;
  state.enemyUnits = setupEnemies(state.round);
  cardArea.innerHTML = "";
  showToast(`${card.name}：${result.message}`);
  statusLine.textContent = `${roundLabel(state.round)}: 戦闘開始を押してください`;
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

startBtn.onclick = startBattle;
resetBtn.onclick = initRun;

initRun();
