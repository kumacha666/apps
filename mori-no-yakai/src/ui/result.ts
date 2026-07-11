import type { AppContext } from "./context";
import { isHost, participants, myFinalRoleBanner } from "./context";
import { ROLE_META } from "../roles";
import { tallyVotes, determineWinner } from "../gameLogic";
import { resetToLobby } from "../roomSync";

export function render(container: HTMLElement, ctx: AppContext): void {
  // 配札された全プレイヤーで集計する（切断してもゲームからは消えない）
  const members = participants(ctx);
  const { counts, eliminatedIds } = tallyVotes(members);
  const winner = determineWinner(members, eliminatedIds);
  const eliminatedSet = new Set(eliminatedIds);

  container.innerHTML = `
    <h2>${winner === "forest" ? "🌳 森陣営の勝利！" : "🐺 おおかみ陣営の勝利！"}</h2>
    ${myFinalRoleBanner(ctx)}
    <p class="hint-text">${
      eliminatedIds.length > 0
        ? `脱落したのは ${eliminatedIds.map((id) => escapeHtml(ctx.members[id]?.name ?? "?")).join("、")}`
        : "誰も脱落しませんでした"
    }</p>

    <h3>みんなの最終役職</h3>
    <ul class="member-list result-list">
      ${members
        .map((m) => {
          const role = m.currentRole;
          const meta = role ? ROLE_META[role] : undefined;
          return `<li class="${eliminatedSet.has(m.id) ? "eliminated" : ""}">
            ${escapeHtml(m.name)}
            — ${meta ? `${meta.emoji} ${meta.name}` : "?"}
            <span class="vote-count">(${counts[m.id] ?? 0}票)</span>
          </li>`;
        })
        .join("")}
    </ul>

    ${
      isHost(ctx)
        ? `<button id="btn-play-again" class="btn-primary">もう一度あそぶ</button>`
        : `<p class="waiting-text">ホストが「もう一度あそぶ」を押すのを待っています…</p>`
    }
    <button id="btn-leave-room" class="btn-link">トップに戻る</button>
  `;

  container.querySelector("#btn-play-again")?.addEventListener("click", () => {
    void resetToLobby(ctx.roomId);
  });
  container.querySelector("#btn-leave-room")?.addEventListener("click", () => {
    ctx.requestLeaveRoom();
  });
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
