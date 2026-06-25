import { G, loadSave, loadOptions } from "./state.js";
import { buildStages } from "./stages.js";
import { initUI, showScreen } from "./ui.js";

G.canvas = document.getElementById("game-canvas");
G.ctx = G.canvas.getContext("2d");
G.screens = {
  splash: document.getElementById("screen-splash"),
  title: document.getElementById("screen-title"),
  stageSelect: document.getElementById("screen-stage-select"),
  help: document.getElementById("screen-help"),
  game: document.getElementById("screen-game"),
  result: document.getElementById("screen-result"),
  options: document.getElementById("screen-options"),
};
G.STAGES = buildStages();
G.options = loadOptions();
G.saveData = loadSave();

initUI();
showScreen("splash");
