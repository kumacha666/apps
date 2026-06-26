import { initCanvas, drawBoard } from "./rendering";
import { initInput } from "./input";
import { startRun, showScreen } from "./game";
import { updateVFX, hasActiveVFX } from "./vfx";
const VERSION = "0.2.0";

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
    startRun();
  });

  document.getElementById("btn-retry")!.addEventListener("click", () => {
    startRun();
  });

  requestAnimationFrame(gameLoop);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
