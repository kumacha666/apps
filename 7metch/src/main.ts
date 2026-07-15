import "../style.css";
import type { GameScreens, GameDom } from "./types";
import { G, loadSave, loadOptions } from "./state";
import { buildStages } from "./stages";
import { initUI, showScreen } from "./ui";

G.canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
G.ctx = G.canvas.getContext("2d");
G.screens = {
  splash: document.getElementById("screen-splash")!,
  title: document.getElementById("screen-title")!,
  stageSelect: document.getElementById("screen-stage-select")!,
  help: document.getElementById("screen-help")!,
  game: document.getElementById("screen-game")!,
  result: document.getElementById("screen-result")!,
  options: document.getElementById("screen-options")!,
} as GameScreens;
G.dom = {
  hudStage: document.getElementById("hud-stage")!,
  hudMoves: document.getElementById("hud-moves")!,
  hudMissionLabel: document.getElementById("hud-mission-label")!,
  hudMissionProgress: document.getElementById("hud-mission-progress")!,
  hudStars: document.getElementById("hud-stars")!,
  resultTitle: document.getElementById("result-title")!,
  resultStars: document.getElementById("result-stars")!,
  resultDetails: document.getElementById("result-details")!,
  btnNext: document.getElementById("btn-next")!,
  btnRescue: document.getElementById("btn-rescue")!,
  itemCoinCount: document.getElementById("item-coin-count")!,
} as GameDom;
G.STAGES = buildStages();
G.options = loadOptions();
G.saveData = loadSave();

declare const __APP_VERSION__: string;
document.getElementById("version-info")!.textContent = `v${__APP_VERSION__}`;

initUI();
showScreen("splash");
