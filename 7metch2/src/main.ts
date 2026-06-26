import { initCanvas } from "./rendering";
import { initInput } from "./input";
import { startRun, showScreen } from "./game";

function init(): void {
  initCanvas();
  initInput();

  showScreen("title");

  document.getElementById("btn-start")!.addEventListener("click", () => {
    startRun();
  });

  document.getElementById("btn-retry")!.addEventListener("click", () => {
    startRun();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
