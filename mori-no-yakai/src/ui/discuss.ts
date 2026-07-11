import type { AppContext } from "./context";
import { onlineMembers } from "./context";
import { ROLE_META } from "../roles";
import { markDiscussReady } from "../roomSync";

interface DiscussUiState {
  round: number;
  readyTapped?: boolean;
}

let uiState: DiscussUiState = { round: -1 };

export function render(container: HTMLElement, ctx: AppContext): void {
  const roundNumber = ctx.state.roundNumber;
  if (uiState.round !== roundNumber) {
    uiState = { round: roundNumber };
  }

  const self = ctx.members[ctx.memberId];
  const remainingSec = Math.max(0, Math.ceil((ctx.state.discussEndsAt - Date.now()) / 1000));
  const min = Math.floor(remainingSec / 60);
  const sec = remainingSec % 60;
  const role = self?.currentRole;
  const alreadyReady = uiState.readyTapped || self?.discussReadyRound === roundNumber;

  const online = onlineMembers(ctx).filter((m) => m.originalRole);
  const readyCount = online.filter((m) => m.discussReadyRound === roundNumber).length;

  container.innerHTML = `
    <h2>🗣️ 議論タイム</h2>
    <div class="discuss-timer">${min}:${String(sec).padStart(2, "0")}</div>
    ${
      role
        ? `<p class="role-reminder">あなたの最終的な役職は ${ROLE_META[role].emoji} ${ROLE_META[role].name}</p>
           <p class="role-description">${ROLE_META[role].description}</p>`
        : ""
    }
    <p class="hint-text">声に出して話し合おう。うそをついてもOK！</p>
    <button id="btn-discuss-ready" class="btn-primary" ${alreadyReady ? "disabled" : ""}>
      ${alreadyReady ? "投票を待っています…" : "話し合いおわり・投票へ"}
    </button>
    <p class="hint-text">準備完了 ${readyCount}/${online.length}人</p>
  `;

  container.querySelector("#btn-discuss-ready")?.addEventListener("click", () => {
    if (uiState.readyTapped) return;
    uiState.readyTapped = true;
    render(container, ctx);
    void markDiscussReady(ctx.roomId, ctx.memberId, roundNumber);
  });
}
