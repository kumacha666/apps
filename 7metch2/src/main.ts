import { initCanvas, drawBoard } from "./rendering";
import { initInput } from "./input";
import { startRun, showScreen } from "./game";
import { initAudio } from "./audio";
import { updateVFX, hasActiveVFX } from "./vfx";
import { G } from "./state";
import { ALL_UPGRADES } from "./upgrades";
declare const __APP_VERSION__: string;
const VERSION = __APP_VERSION__;

interface TuningParam {
  key: keyof typeof TUNING_DEFAULTS;
  label: string;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
}

const TUNING_DEFAULTS = {
  debrisRate: 1.0,
  scoreDiminish: 3,
  boardGrowthRate: 3,
  baseMoves: 20,
  targetMultiplier: 1.0,
};

const TUNING_PARAMS: TuningParam[] = [
  { key: "debrisRate", label: "デブリ発生率", min: 0, max: 3, step: 0.1, format: v => `×${v.toFixed(1)}` },
  { key: "scoreDiminish", label: "スコア減衰（連鎖毎の減点）", min: 0, max: 10, step: 1, format: v => `${v}/連鎖` },
  { key: "boardGrowthRate", label: "盤面拡大（Nステージ毎）", min: 1, max: 10, step: 1, format: v => `${v}ステージ毎` },
  { key: "baseMoves", label: "初期手数", min: 5, max: 50, step: 1, format: v => `${v}手` },
  { key: "targetMultiplier", label: "目標スコア倍率", min: 0.1, max: 5, step: 0.1, format: v => `×${v.toFixed(1)}` },
];

function saveTuning(): void {
  const data: Record<string, number> = {};
  for (const p of TUNING_PARAMS) {
    data[p.key] = G[p.key] as number;
  }
  localStorage.setItem("tuningParams", JSON.stringify(data));
}

function loadTuning(): void {
  const saved = localStorage.getItem("tuningParams");
  if (!saved) return;
  const data = JSON.parse(saved);
  for (const p of TUNING_PARAMS) {
    if (p.key in data) {
      (G as unknown as Record<string, unknown>)[p.key] = data[p.key];
    }
  }
}

function buildSettingsList(): void {
  const container = document.getElementById("settings-list")!;
  container.innerHTML = "";

  // Tuning parameters section
  const tuningHeader = document.createElement("div");
  tuningHeader.className = "settings-section-header";
  tuningHeader.textContent = "バランス調整";
  container.appendChild(tuningHeader);

  for (const p of TUNING_PARAMS) {
    const item = document.createElement("div");
    item.className = "settings-item settings-slider-item";
    const currentVal = G[p.key] as number;
    const isDefault = currentVal === TUNING_DEFAULTS[p.key];
    item.innerHTML = `
      <div class="settings-slider-row">
        <div class="settings-item-label">
          <div class="name">${p.label}</div>
          <div class="settings-value">${p.format(currentVal)}${isDefault ? "" : " ✏️"}</div>
        </div>
        <input type="range" min="${p.min}" max="${p.max}" step="${p.step}" value="${currentVal}" class="settings-range">
      </div>`;
    const range = item.querySelector("input")! as HTMLInputElement;
    const valueEl = item.querySelector(".settings-value")!;
    range.addEventListener("input", () => {
      const v = parseFloat(range.value);
      (G as unknown as Record<string, unknown>)[p.key] = v;
      const changed = v !== TUNING_DEFAULTS[p.key];
      valueEl.textContent = `${p.format(v)}${changed ? " ✏️" : ""}`;
      saveTuning();
    });
    container.appendChild(item);
  }

  // Reset button
  const resetBtn = document.createElement("button");
  resetBtn.className = "btn-settings";
  resetBtn.textContent = "バランスをリセット";
  resetBtn.style.marginBottom = "24px";
  resetBtn.addEventListener("click", () => {
    for (const p of TUNING_PARAMS) {
      (G as unknown as Record<string, unknown>)[p.key] = TUNING_DEFAULTS[p.key];
    }
    saveTuning();
    buildSettingsList();
  });
  container.appendChild(resetBtn);

  // Upgrade toggles section
  const upgradeHeader = document.createElement("div");
  upgradeHeader.className = "settings-section-header";
  upgradeHeader.textContent = "アップグレードON/OFF";
  container.appendChild(upgradeHeader);

  for (const u of ALL_UPGRADES) {
    const item = document.createElement("div");
    item.className = "settings-item";
    const enabled = !G.disabledUpgrades.has(u.id);
    item.innerHTML = `
      <div class="settings-item-label">
        <span class="icon">${u.icon}</span>
        <div>
          <div class="name">${u.name}</div>
          <div class="desc">${u.desc}</div>
        </div>
      </div>
      <label class="toggle">
        <input type="checkbox" ${enabled ? "checked" : ""} data-upgrade-id="${u.id}">
        <span class="slider"></span>
      </label>`;
    const checkbox = item.querySelector("input")!;
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        G.disabledUpgrades.delete(u.id);
      } else {
        G.disabledUpgrades.add(u.id);
      }
      localStorage.setItem("disabledUpgrades", JSON.stringify([...G.disabledUpgrades]));
    });
    container.appendChild(item);
  }
}

function gameLoop(): void {
  if (!G.animating && (hasActiveVFX() || G.activeChainLabel)) {
    updateVFX();
    drawBoard();
  }
  requestAnimationFrame(gameLoop);
}

function init(): void {
  initCanvas();
  initInput();

  const saved = localStorage.getItem("disabledUpgrades");
  if (saved) {
    for (const id of JSON.parse(saved)) G.disabledUpgrades.add(id);
  }
  loadTuning();

  const subtitle = document.querySelector("#title-screen .subtitle") as HTMLElement;
  if (subtitle) subtitle.textContent = `ぶっ壊れ3マッチローグライク v${VERSION}`;

  showScreen("title");

  document.getElementById("btn-start")!.addEventListener("click", () => {
    initAudio();
    startRun();
  });

  document.getElementById("btn-retry")!.addEventListener("click", () => {
    initAudio();
    startRun();
  });

  document.getElementById("btn-open-settings")!.addEventListener("click", () => {
    buildSettingsList();
    showScreen("settings");
  });

  document.getElementById("btn-close-settings")!.addEventListener("click", () => {
    showScreen("title");
  });

  requestAnimationFrame(gameLoop);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
