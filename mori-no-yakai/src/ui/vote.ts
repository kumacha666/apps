import type { AppContext } from "./context";
import { onlineMembers } from "./context";
import { submitVote, maybeCloseVoteEarly } from "../roomSync";

export function render(container: HTMLElement, ctx: AppContext): void {
  const self = ctx.members[ctx.memberId];
  const others = onlineMembers(ctx).filter((m) => m.id !== ctx.memberId);
  const remainingSec = Math.max(0, Math.ceil((ctx.state.voteEndsAt - Date.now()) / 1000));
  const votedCount = onlineMembers(ctx).filter((m) => m.vote).length;

  container.innerHTML = `
    <h2>🗳️ 投票</h2>
    <div class="vote-timer">${remainingSec}秒</div>
    <p class="hint-text">あやしいと思う相手に1人投票しよう（${votedCount}/${onlineMembers(ctx).length}人 投票済み）</p>
    <div class="member-list vote-list">
      ${others
        .map(
          (m) =>
            `<button data-vote-target="${m.id}" class="btn-card ${self?.vote === m.id ? "active" : ""}">${m.avatar} ${escapeHtml(
              m.name
            )}</button>`
        )
        .join("")}
    </div>
  `;

  container.querySelectorAll<HTMLButtonElement>("[data-vote-target]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const targetId = btn.dataset.voteTarget!;
      await submitVote(ctx.roomId, ctx.memberId, targetId);
      await maybeCloseVoteEarly(ctx.roomId);
    });
  });
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
