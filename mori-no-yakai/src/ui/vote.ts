import type { AppContext } from "./context";
import { participants, myKnownRoleBanner } from "./context";
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
    ${myKnownRoleBanner(ctx)}
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

    <h3>勝利条件</h3>
    <ul class="role-legend">
      <li>
        <strong>🌳 森陣営（うさぎ・ふくろう・きつね）</strong>
        <span class="hint-text">おおかみを1人でも脱落させれば勝利。場におおかみが1匹もいなければ、誰も脱落させないか、子狼を脱落させれば勝利。</span>
      </li>
      <li>
        <strong>🐺 おおかみ陣営（おおかみ・子狼）</strong>
        <span class="hint-text">上の森陣営の条件を満たせなければ勝利（例: おおかみが生き残る。場におおかみがいない場合は子狼以外の誰かが脱落する）。</span>
      </li>
    </ul>
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
