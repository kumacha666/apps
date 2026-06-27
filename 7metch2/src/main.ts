import { initCanvas, drawBoard } from "./rendering";
import { initInput } from "./input";
import { startRun, showScreen } from "./game";
import { initAudio } from "./audio";
import { updateVFX, hasActiveVFX } from "./vfx";
declare const __APP_VERSION__: string;
const VERSION = __APP_VERSION__;

function gameLoop(): void {
  if (hasActiveVFX()) {
    updateVFX();
    drawBoard();
  }
  requestAnimationFrame(gameLoop);
}

function init(): void {
  initCanvas();
  initInput();

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

  requestAnimationFrame(gameLoop);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
