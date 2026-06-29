import { initCanvas, drawBoard } from "./rendering";
import { initInput } from "./input";
import { startRun, showScreen } from "./game";
import { initAudio } from "./audio";
import { updateVFX, hasActiveVFX } from "./vfx";
import { G } from "./state";
import { ALL_UPGRADES } from "./upgrades";
declare const __APP_VERSION__: string;
const VERSION = __APP_VERSION__;

function buildSettingsList(): void {
  const container = document.getElementById("settings-list")!;
  container.innerHTML = "";
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
