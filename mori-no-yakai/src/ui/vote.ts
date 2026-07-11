import type { AppContext } from "./context";
import { participants } from "./context";
import { submitVote, maybeCloseVoteEarly } from "../roomSync";

export function render(container: HTMLElement, ctx: AppContext): void {
  const self = ctx.members[ctx.memberId];
  const dealt = participants(ctx);
  const others = dealt.filter((m) => m.id !== ctx.memberId);
  const remainingSec = Math.max(0, Math.ceil((ctx.state.voteEndsAt - Date.now()) / 1000));
  const votedCount = dealt.filter((m) => m.vote).length;

  if (!self?.originalRole) {
    container.innerHTML = `
      <h2>🗳️ 投票</h2>
      <p class="waiting-text">このゲームには参加していません。結果を待ちましょう。</p>
    `;
    return;
  }

  container.innerHTML = `
    <h2>🗳️ 投票</h2>
    <div class="vote-timer">${remainingSec}秒</div>
    <p class="hint-text">あやしいと思う相手に1人投票しよう（${votedCount}/${dealt.length}人 投票済み）</p>
    <p class="hint-text">誰も2票以上を集めなければ、誰も脱落しません。</p>
    <div class="member-list vote-list">
      ${others
        .map(
          (m) =>
            `<button data-vote-target="${m.id}" class="btn-card ${self?.vote === m.id ? "active" : ""}">${escapeHtml(
              m.name
            )}${m.online ? "" : "（切断中）"}</button>`
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
