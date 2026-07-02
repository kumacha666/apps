import "./style.css";
import type { CombatUnit, Stats, WeaponType } from "./types";
import { basicClasses, advancedClasses, getClassById } from "./data/classes";
import { generateEnemyStats, enemyName, isBossStage } from "./data/enemies";
import { rollUpgradeChoices } from "./data/upgrades";
import { rollRelicChoices } from "./data/relics";
import { PERMANENT_UPGRADE_POOL, applyPermanentUpgrades, applyStatBoosts, STAT_BOOST_COST, STAT_BOOST_LABELS } from "./data/permanentUpgrades";
import { simulateCombat } from "./combat";
import { goldForStage } from "./run";
import { loadSave, writeSave, addGold, recordRunEnd, deleteSave, slotExists, totalStatBoostCount, purchasePermanentUpgrade, purchaseStatBoost, resetStatBoosts, getStatBoosts, unlockDifficulty, unlockClass, SLOT_COUNT } from "./save";
import type { StatBoosts } from "./types";
import { SFX, BGM, AudioControl } from "./audio";
import type { AttackEvent } from "./types";

let currentSlot = 0;
let save = loadSave(0);

interface RunState {
  classId: string;
  stats: Stats;
  stage: number;
  goldEarned: number;
}

let run: RunState | null = null;

const WEAPON_ICON: Record<WeaponType, string> = {
  sword: "⚔️",
  lance: "🔱",
  bow: "🏹",
  tome: "📖",
};
const ENEMY_ICON = "👹";

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el;
}

const SCREENS_WITHOUT_STATS = new Set(["screen-slot", "screen-title", "screen-class-select", "screen-result", "screen-settings"]);

function showScreen(id: string): void {
  document.querySelectorAll(".screen").forEach((el) => el.classList.remove("active"));
  $(id).classList.add("active");
  if (SCREENS_WITHOUT_STATS.has(id)) hideStatsBar();
}

function renderSlotSelect(): void {
  const list = $("slot-list");
  list.innerHTML = "";
  for (let i = 0; i < SLOT_COUNT; i++) {
    const exists = slotExists(i);
    const slotSave = exists ? loadSave(i) : null;

    const card = document.createElement("div");
    card.className = "option-card";
    card.style.cssText = "display:flex;justify-content:space-between;align-items:center;gap:0.5rem;";

    const info = document.createElement("div");
    info.style.flex = "1";
    const slotLabel = document.createElement("div");
    slotLabel.style.cssText = "font-weight:bold;margin-bottom:0.3rem;";
    slotLabel.textContent = `スロット ${i + 1}`;
    info.appendChild(slotLabel);

    if (slotSave) {
      const boostCount = totalStatBoostCount(slotSave);
      const detail = document.createElement("div");
      detail.style.cssText = "font-size:0.8rem;color:#aaa;line-height:1.6;";
      detail.innerHTML =
        `所持金: ${slotSave.totalGold}G　血統強化: ${boostCount}回（${boostCount * 100}G相当）<br>` +
        `プレイ: ${slotSave.playCount}回　最高: ${slotSave.bestFloor}層`;
      info.appendChild(detail);
    } else {
      const empty = document.createElement("div");
      empty.style.cssText = "font-size:0.8rem;color:#555;";
      empty.textContent = "（空き）";
      info.appendChild(empty);
    }

    card.appendChild(info);
    card.addEventListener("click", () => {
      SFX.select();
      currentSlot = i;
      save = loadSave(i);
      renderTitle();
    });

    if (slotSave) {
      const delBtn = document.createElement("button");
      delBtn.className = "btn-secondary btn-small";
      delBtn.textContent = "削除";
      delBtn.style.cssText = "font-size:0.75rem;padding:0.3rem 0.6rem;flex-shrink:0;";
      delBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!confirm(`スロット ${i + 1} のデータを削除しますか？`)) return;
        deleteSave(i);
        renderSlotSelect();
      });
      card.appendChild(delBtn);
    }

    list.appendChild(card);
  }
  showScreen("screen-slot");
}

function renderTitle(): void {
  $("gold-display").textContent = `所持ゴールド: ${save.totalGold}　[スロット ${currentSlot + 1}]`;
  BGM.play("title");
  showScreen("screen-title");
}

function renderClassSelect(): void {
  const grid = $("class-grid");
  grid.innerHTML = "";
  const classes = basicClasses();
  for (const c of classes) {
    const boosted = applyStatBoosts(applyPermanentUpgrades(c.baseStats, save.purchasedPermanentUpgrades), getStatBoosts(save, c.id));
    const hasBoost = JSON.stringify(c.baseStats) !== JSON.stringify(boosted);

    const card = document.createElement("div");
    card.className = "option-card";

    const nameEl = document.createElement("div");
    nameEl.style.cssText = "font-weight:bold;margin-bottom:0.4rem;";
    nameEl.textContent = c.name;
    card.appendChild(nameEl);

    const baseRow = document.createElement("div");
    baseRow.style.cssText = "font-size:0.8rem;color:#888;";
    baseRow.textContent = `初期　HP${c.baseStats.hp} 攻${c.baseStats.atk} 防${c.baseStats.def} 速${c.baseStats.spd} 命${c.baseStats.hit} 会${c.baseStats.crit}`;
    card.appendChild(baseRow);

    if (hasBoost) {
      const boostedRow = document.createElement("div");
      boostedRow.style.cssText = "font-size:0.85rem;color:#e8d5a0;margin-top:0.2rem;";
      boostedRow.textContent = `現在　HP${boosted.hp} 攻${boosted.atk} 防${boosted.def} 速${boosted.spd} 命${boosted.hit} 会${boosted.crit}`;
      card.appendChild(boostedRow);
    }

    card.addEventListener("click", () => {
      SFX.select();
      startRun(c.id);
    });
    grid.appendChild(card);
  }
  showScreen("screen-class-select");
}

function startRun(classId: string): void {
  const classDef = getClassById(classId);
  const stats = applyStatBoosts(applyPermanentUpgrades(classDef.baseStats, save.purchasedPermanentUpgrades), getStatBoosts(save, classId));
  run = { classId, stats, stage: 1, goldEarned: 0 };
  startCombat();
}

function renderUnitSprite(containerId: string, icon: string, name: string, maxHp: number): void {
  const container = $(containerId);
  container.querySelector(".unit-icon")!.textContent = icon;
  container.querySelector(".unit-name")!.textContent = name;
  (container.querySelector(".unit-hpbar-inner") as HTMLElement).style.width = "100%";
  (container.querySelector(".unit-hpbar-inner") as HTMLElement).style.background = "#4caf50";
  container.querySelector(".unit-hptext")!.textContent = `HP ${maxHp}/${maxHp}`;
}

function updateUnitHp(containerId: string, hp: number, maxHp: number): void {
  const container = $(containerId);
  const pct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
  const bar = container.querySelector(".unit-hpbar-inner") as HTMLElement;
  bar.style.width = `${pct}%`;
  bar.style.background = pct <= 25 ? "#e53935" : pct <= 50 ? "#fbc02d" : "#4caf50";
  container.querySelector(".unit-hptext")!.textContent = `HP ${Math.max(0, hp)}/${maxHp}`;
}

function showDamagePopup(containerId: string, text: string, variant: "" | "crit" | "miss"): void {
  const container = $(containerId);
  const popup = document.createElement("div");
  popup.className = `dmg-popup ${variant}`.trim();
  popup.textContent = text;
  container.appendChild(popup);
  setTimeout(() => popup.remove(), 650);
}

function playAttackAnimation(attackerId: string, defenderId: string, attackerSide: "player" | "enemy", ev: AttackEvent): void {
  const attackerSprite = $(attackerId).querySelector(".unit-sprite") as HTMLElement;
  const defenderSprite = $(defenderId).querySelector(".unit-sprite") as HTMLElement;
  const lungeClass = attackerSide === "player" ? "lunge-right" : "lunge-left";
  attackerSprite.classList.add(lungeClass);
  setTimeout(() => attackerSprite.classList.remove(lungeClass), 230);

  if (ev.hit) {
    const flashClass = ev.crit ? "crit-flash" : "hit-flash";
    defenderSprite.classList.add(flashClass);
    setTimeout(() => defenderSprite.classList.remove(flashClass), 330);
    if (ev.crit) {
      $("screen-combat").classList.add("shake");
      setTimeout(() => $("screen-combat").classList.remove("shake"), 230);
    }
    showDamagePopup(defenderId, ev.crit ? `会心 ${ev.damage}!` : `${ev.damage}`, ev.crit ? "crit" : "");
  } else {
    defenderSprite.classList.add("dodge");
    setTimeout(() => defenderSprite.classList.remove("dodge"), 230);
    showDamagePopup(defenderId, "MISS", "miss");
  }
}

function renderStatsBar(stats: Stats): void {
  const el = $("global-stats-bar");
  const entries: [string, number][] = [
    ["HP",   stats.hp],
    ["攻撃", stats.atk],
    ["防御", stats.def],
    ["速度", stats.spd],
    ["命中", stats.hit],
    ["会心", stats.crit],
  ];
  el.innerHTML = entries.map(([label, val]) =>
    `<div class="stat-cell"><span class="stat-label">${label}</span><span class="stat-value">${val}</span></div>`
  ).join("");
  el.classList.remove("hidden");
}

function hideStatsBar(): void {
  $("global-stats-bar").classList.add("hidden");
}

function startCombat(): void {
  if (!run) return;
  const classDef = getClassById(run.classId);
  const enemyStats = generateEnemyStats(run.stage);
  const player: CombatUnit = { classId: run.classId, name: classDef.name, stats: run.stats };
  const enemy: CombatUnit = { classId: "enemy", name: enemyName(run.stage), stats: enemyStats };

  renderUnitSprite("combat-player", WEAPON_ICON[classDef.weaponType], player.name, player.stats.hp);
  renderUnitSprite("combat-enemy", ENEMY_ICON, enemy.name, enemy.stats.hp);
  renderStatsBar(run.stats);
  $("combat-log").textContent = "";
  $("btn-combat-next").classList.add("hidden");
  BGM.play(isBossStage(run.stage) ? "boss" : "battle");
  showScreen("screen-combat");

  const result = simulateCombat(player, enemy, Math.random);
  playLog(player.name, player.stats.hp, enemy.stats.hp, result.log, classDef.weaponType, () => {
    if (result.winner === "player") {
      onCombatWin();
    } else {
      onCombatLose();
    }
  });
}

function playLog(playerName: string, playerMaxHp: number, enemyMaxHp: number, log: AttackEvent[], weaponType: WeaponType, onDone: () => void): void {
  const logEl = $("combat-log");
  let i = 0;
  const step = () => {
    if (i >= log.length) {
      onDone();
      return;
    }
    const ev = log[i];
    const attackerIsPlayer = ev.attackerName === playerName;
    const attackerId = attackerIsPlayer ? "combat-player" : "combat-enemy";
    const defenderId = attackerIsPlayer ? "combat-enemy" : "combat-player";
    const defenderMaxHp = attackerIsPlayer ? enemyMaxHp : playerMaxHp;

    const line = ev.hit
      ? `${ev.attackerName}の攻撃！${ev.crit ? "会心の一撃！ " : ""}ダメージ${ev.damage}（残りHP ${ev.defenderHpAfter}）`
      : `${ev.attackerName}の攻撃は外れた`;
    logEl.textContent += line + "\n";
    logEl.scrollTop = logEl.scrollHeight;

    playAttackAnimation(attackerId, defenderId, attackerIsPlayer ? "player" : "enemy", ev);
    if (ev.hit) {
      updateUnitHp(defenderId, ev.defenderHpAfter, defenderMaxHp);
      const wt = attackerIsPlayer ? weaponType : undefined;
      ev.crit ? SFX.crit(wt) : SFX.hit(wt);
    } else {
      SFX.miss();
    }
    i += 1;
    setTimeout(step, 420);
  };
  step();
}

function onCombatWin(): void {
  if (!run) return;
  SFX.win();
  run.goldEarned += goldForStage(run.stage);

  if (isBossStage(run.stage)) {
    renderRelicSelect();
  } else {
    renderUpgradeSelect();
  }
}

function onCombatLose(): void {
  if (!run) return;
  SFX.lose();
  save = recordRunEnd(save, run.stage);
  writeSave(save, currentSlot);
  BGM.play("lose");
  $("result-title").textContent = "戦闘不能…";
  $("result-details").textContent = `到達: 第${run.stage}層 / 獲得ゴールド: ${run.goldEarned}G（没収）`;
  showScreen("screen-result");
}

function onFlee(): void {
  if (!run) return;
  SFX.win();
  save = addGold(save, run.goldEarned);
  save = recordRunEnd(save, run.stage);
  writeSave(save, currentSlot);
  BGM.play("lose");
  $("result-title").textContent = "逃走成功";
  $("result-details").textContent = `到達: 第${run.stage}層 / 獲得ゴールド: +${run.goldEarned}G`;
  showScreen("screen-result");
}

function addFleeButton(container: HTMLElement): void {
  if (!run) return;
  const btn = document.createElement("button");
  btn.className = "btn-secondary";
  btn.textContent = `逃走する（${run.goldEarned}G を持って帰る）`;
  btn.style.cssText = "margin-top:1rem;width:100%;max-width:480px;";
  btn.addEventListener("click", () => {
    SFX.select();
    onFlee();
  });
  container.appendChild(btn);
}

function renderUpgradeSelect(): void {
  if (!run) return;
  $("upgrade-title").textContent = "強化を選択";
  renderStatsBar(run.stats);
  const container = $("upgrade-options");
  container.innerHTML = "";
  const choices = rollUpgradeChoices(3, run.classId, Math.random);
  for (const choice of choices) {
    const card = document.createElement("div");
    card.className = "option-card";
    card.textContent = `${choice.name}（${choice.rarity}） — ${choice.description}`;
    card.addEventListener("click", () => {
      if (!run) return;
      SFX.select();
      run.stats = choice.apply(run.stats);
      run.stage += 1;
      startCombat();
    });
    container.appendChild(card);
  }
  addFleeButton(container);
  showScreen("screen-upgrade");
}

function renderRelicSelect(): void {
  if (!run) return;
  $("upgrade-title").textContent = "レリックを選択（ボス報酬）";
  renderStatsBar(run.stats);
  const container = $("upgrade-options");
  container.innerHTML = "";
  const choices = rollRelicChoices(3, Math.random);
  for (const choice of choices) {
    const card = document.createElement("div");
    card.className = "option-card";
    card.textContent = `${choice.name} — ${choice.description}`;
    card.addEventListener("click", () => {
      if (!run) return;
      SFX.select();
      run.stats = choice.apply(run.stats);
      if (!save.unlockedDifficulties.includes("hard")) {
        save = unlockDifficulty(save, "hard");
        for (const adv of advancedClasses()) {
          save = unlockClass(save, adv.id);
        }
        writeSave(save, currentSlot);
      }
      run.stage += 1;
      startCombat();
    });
    container.appendChild(card);
  }
  addFleeButton(container);
  showScreen("screen-upgrade");
}

let permanentSelectedClass = "";

function renderPermanentScreen(classId?: string): void {
  // クラス選択の初期値：引数 → 前回選択 → 基本クラスの先頭
  if (classId) permanentSelectedClass = classId;
  if (!permanentSelectedClass) permanentSelectedClass = basicClasses()[0].id;

  $("permanent-gold").textContent = `所持ゴールド: ${save.totalGold}`;

  // 選択中クラスの永続強化込みステータスを表示
  const classDef = getClassById(permanentSelectedClass);
  const permanentStats = applyStatBoosts(
    applyPermanentUpgrades(classDef.baseStats, save.purchasedPermanentUpgrades),
    getStatBoosts(save, permanentSelectedClass)
  );
  renderStatsBar(permanentStats);

  const container = $("permanent-options");
  container.innerHTML = "";

  for (const upgrade of PERMANENT_UPGRADE_POOL) {
    const owned = save.purchasedPermanentUpgrades.includes(upgrade.id);
    const card = document.createElement("div");
    card.className = "option-card";
    card.textContent = owned
      ? `${upgrade.name}（取得済み） — ${upgrade.description}`
      : `${upgrade.name}（${upgrade.cost}G） — ${upgrade.description}`;
    if (!owned) {
      card.addEventListener("click", () => {
        SFX.select();
        save = purchasePermanentUpgrade(save, upgrade.id, upgrade.cost);
        writeSave(save, currentSlot);
        renderPermanentScreen();
      });
    }
    container.appendChild(card);
  }

  const allPurchased = PERMANENT_UPGRADE_POOL.every(u => save.purchasedPermanentUpgrades.includes(u.id));
  if (allPurchased) {
    const heading = document.createElement("h3");
    heading.textContent = "── 血統の極意（クラスごと・上限なし・各100G）──";
    heading.style.cssText = "color:#c0392b;margin-top:1.5rem;margin-bottom:0.5rem;font-size:0.95rem;text-align:center;";
    container.appendChild(heading);

    // クラス選択タブ
    const allClasses = [...basicClasses(), ...advancedClasses().filter(c => save.unlockedClasses.includes(c.id))];
    const tabRow = document.createElement("div");
    tabRow.style.cssText = "display:flex;gap:0.5rem;flex-wrap:wrap;justify-content:center;margin-bottom:0.75rem;";
    for (const c of allClasses) {
      const btn = document.createElement("button");
      btn.textContent = c.name;
      btn.className = permanentSelectedClass === c.id ? "btn-primary" : "btn-secondary";
      btn.style.cssText = "font-size:0.85rem;padding:0.4rem 0.75rem;margin:0;";
      btn.addEventListener("click", () => {
        SFX.select();
        renderPermanentScreen(c.id);
      });
      tabRow.appendChild(btn);
    }
    container.appendChild(tabRow);

    const goldLabel = document.createElement("div");
    goldLabel.textContent = `所持ゴールド: ${save.totalGold}`;
    goldLabel.style.cssText = "text-align:center;color:#e8d5a0;font-size:0.9rem;margin-bottom:0.5rem;";
    container.appendChild(goldLabel);

    const boosts = getStatBoosts(save, permanentSelectedClass);
    for (const stat of Object.keys(STAT_BOOST_LABELS) as (keyof StatBoosts)[]) {
      const card = document.createElement("div");
      card.className = "option-card";
      card.textContent = `${STAT_BOOST_LABELS[stat]} +1（${STAT_BOOST_COST}G）　現在の積み上げ: +${boosts[stat]}`;
      card.addEventListener("click", () => {
        SFX.select();
        save = purchaseStatBoost(save, permanentSelectedClass, stat, STAT_BOOST_COST);
        writeSave(save, currentSlot);
        renderPermanentScreen();
      });
      container.appendChild(card);
    }

    const totalBoosts = (Object.values(boosts) as number[]).reduce((s, v) => s + v, 0);
    if (totalBoosts > 0) {
      const refundBtn = document.createElement("button");
      refundBtn.className = "btn-secondary";
      refundBtn.textContent = `血統をリセット（${totalBoosts * STAT_BOOST_COST}G 払い戻し）`;
      refundBtn.style.cssText = "margin-top:1rem;width:100%;";
      refundBtn.addEventListener("click", () => {
        SFX.select();
        save = resetStatBoosts(save, permanentSelectedClass, STAT_BOOST_COST);
        writeSave(save, currentSlot);
        renderPermanentScreen();
      });
      container.appendChild(refundBtn);
    }
  }

  showScreen("screen-permanent");
}

function renderSettings(fromScreen: string): void {
  const s = AudioControl.getSettings();

  const banner = $("settings-mute-banner");
  banner.style.display = s.muted ? "block" : "none";

  const bgmSlider = $("settings-bgm") as HTMLInputElement;
  const sfxSlider = $("settings-sfx") as HTMLInputElement;
  bgmSlider.value = String(Math.round(s.bgmVolume * 100));
  sfxSlider.value = String(Math.round(s.sfxVolume * 100));
  $("settings-bgm-val").textContent = bgmSlider.value;
  $("settings-sfx-val").textContent = sfxSlider.value;

  ($("btn-settings-unmute") as HTMLButtonElement).onclick = () => {
    AudioControl.toggleMute();
    updateMuteButton();
    banner.style.display = "none";
    SFX.select();
  };

  bgmSlider.oninput = () => {
    AudioControl.setSettings({ bgmVolume: Number(bgmSlider.value) / 100 });
    $("settings-bgm-val").textContent = bgmSlider.value;
  };
  sfxSlider.oninput = () => {
    AudioControl.setSettings({ sfxVolume: Number(sfxSlider.value) / 100 });
    $("settings-sfx-val").textContent = sfxSlider.value;
    SFX.select();
  };

  ($("btn-settings-back") as HTMLButtonElement).onclick = () => {
    SFX.select();
    showScreen(fromScreen);
    if (fromScreen === "screen-title") hideStatsBar();
  };

  showScreen("screen-settings");
}

function updateMuteButton(): void {
  const muted = AudioControl.getSettings().muted;
  $("btn-mute").textContent = muted ? "🔇 消音中" : "🔊 音あり";
}

function init(): void {
  $("btn-start").addEventListener("click", () => {
    SFX.select();
    renderClassSelect();
  });
  $("btn-permanent").addEventListener("click", () => {
    SFX.select();
    renderPermanentScreen();
  });
  $("btn-class-back").addEventListener("click", () => {
    SFX.select();
    renderTitle();
  });
  $("btn-result-permanent").addEventListener("click", () => {
    SFX.select();
    renderPermanentScreen(run?.classId);
  });
  $("btn-result-title").addEventListener("click", () => {
    SFX.select();
    renderTitle();
  });
  $("btn-permanent-back").addEventListener("click", () => {
    SFX.select();
    renderTitle();
  });
  $("btn-mute").addEventListener("click", () => {
    AudioControl.toggleMute();
    updateMuteButton();
  });
  $("btn-settings-title").addEventListener("click", () => {
    SFX.select();
    renderSettings("screen-title");
  });
  $("btn-settings-combat").addEventListener("click", () => {
    SFX.select();
    renderSettings("screen-combat");
  });
  $("btn-slot-change").addEventListener("click", () => {
    SFX.select();
    renderSlotSelect();
  });
  updateMuteButton();
  renderSlotSelect();
}

init();
