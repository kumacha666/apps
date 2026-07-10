import type { AppContext } from "./context";
import { onlineMembers } from "./context";
import { ROLE_META } from "../roles";
import { robberSwap } from "../roomSync";
import type { RoleId } from "../types";

interface NightUiState {
  step: number;
  seerChoice?: "player" | "center" | "skip";
  seerTargetId?: string;
  seerCenterIndexes?: number[];
  robberTargetId?: string;
  robberResult?: RoleId;
}

let uiState: NightUiState = { step: -1 };

export function render(container: HTMLElement, ctx: AppContext): void {
  const stepIndex = ctx.state.nightStepIndex;
  if (uiState.step !== stepIndex) {
    uiState = { step: stepIndex };
  }

  const currentRoleId = ctx.state.nightOrder[stepIndex];
  const self = ctx.members[ctx.memberId];
  const remainingSec = Math.max(0, Math.ceil((ctx.state.nightStepEndsAt - Date.now()) / 1000));
  const isMyTurn = self?.originalRole === currentRoleId;

  const header = `
    <h2>🌙 夜がふけていく…</h2>
    <div class="night-timer">${remainingSec}秒</div>
  `;

  if (!isMyTurn) {
    container.innerHTML = `
      ${header}
      <p class="waiting-text">${ROLE_META[currentRoleId].emoji} だれかが行動中…しずかに待とう</p>
    `;
    return;
  }

  container.innerHTML = `${header}${renderActionFor(currentRoleId, ctx)}`;
  wireActions(container, currentRoleId, ctx);
}

function renderActionFor(roleId: RoleId, ctx: AppContext): string {
  switch (roleId) {
    case "werewolf":
      return renderWerewolf(ctx);
    case "minion":
      return renderMinion(ctx);
    case "seer":
      return renderSeer(ctx);
    case "robber":
      return renderRobber(ctx);
    case "villager":
      return `<p>あなたはうさぎ。することはありません。</p>`;
  }
}

function renderWerewolf(ctx: AppContext): string {
  const wolves = onlineMembers(ctx).filter((m) => m.originalRole === "werewolf");
  const others = wolves.filter((m) => m.id !== ctx.memberId);
  if (wolves.length >= 2) {
    return `
      <p>${ROLE_META.werewolf.emoji} あなたはおおかみ。仲間は…</p>
      <ul class="member-list">${others.map((m) => `<li>${m.avatar} ${escapeHtml(m.name)}</li>`).join("")}</ul>
    `;
  }
  const center = ctx.centerCards;
  return `
    <p>${ROLE_META.werewolf.emoji} あなたは一匹狼。仲間はいません。</p>
    <p>中央カードを1枚だけ見られます。</p>
    <div class="center-card-row">
      ${center.map((_, i) => `<button data-center-peek="${i}" class="btn-card">?</button>`).join("")}
    </div>
    <div id="peek-result"></div>
  `;
}

function renderMinion(ctx: AppContext): string {
  const wolves = onlineMembers(ctx).filter((m) => m.originalRole === "werewolf");
  return `
    <p>${ROLE_META.minion.emoji} あなたは子狼。おおかみ陣営の仲間は…</p>
    ${
      wolves.length > 0
        ? `<ul class="member-list">${wolves.map((m) => `<li>${m.avatar} ${escapeHtml(m.name)}</li>`).join("")}</ul>`
        : `<p>場にはおおかみがいません。あなただけがおおかみ陣営です。</p>`
    }
  `;
}

function renderSeer(ctx: AppContext): string {
  if (uiState.seerChoice === "player" && uiState.seerTargetId) {
    const target = ctx.members[uiState.seerTargetId];
    return `<p>${escapeHtml(target.name)}の役職は ${ROLE_META[target.currentRole!].emoji} ${ROLE_META[target.currentRole!].name}</p>`;
  }
  if (uiState.seerChoice === "center" && uiState.seerCenterIndexes) {
    return `<p>中央カードは ${uiState.seerCenterIndexes
      .map((i) => `${ROLE_META[ctx.centerCards[i]].emoji} ${ROLE_META[ctx.centerCards[i]].name}`)
      .join(" と ")}</p>`;
  }
  if (uiState.seerChoice === "skip") {
    return `<p>何も見ませんでした。</p>`;
  }

  const others = onlineMembers(ctx).filter((m) => m.id !== ctx.memberId);
  return `
    <p>${ROLE_META.seer.emoji} あなたはふくろう。何を見ますか？</p>
    <p class="hint-text">他の1人 か 中央カード2枚、どちらか片方だけ見られます。</p>
    <div class="member-list">
      ${others
        .map((m) => `<button data-seer-player="${m.id}" class="btn-card">${m.avatar} ${escapeHtml(m.name)}</button>`)
        .join("")}
    </div>
    <div class="center-card-row">
      ${ctx.centerCards.map((_, i) => `<button data-seer-center="${i}" class="btn-card">中央${i + 1}</button>`).join("")}
    </div>
    <button data-seer-skip class="btn-link">何も見ない</button>
  `;
}

function renderRobber(ctx: AppContext): string {
  if (uiState.robberResult) {
    return `<p>${ROLE_META.robber.emoji} 交換後、あなたの役職は ${ROLE_META[uiState.robberResult].emoji} ${ROLE_META[uiState.robberResult].name}</p>`;
  }
  const others = onlineMembers(ctx).filter((m) => m.id !== ctx.memberId);
  return `
    <p>${ROLE_META.robber.emoji} あなたはきつね。誰かと役職を交換しますか？</p>
    <div class="member-list">
      ${others
        .map((m) => `<button data-robber-target="${m.id}" class="btn-card">${m.avatar} ${escapeHtml(m.name)}</button>`)
        .join("")}
    </div>
    <button data-robber-skip class="btn-link">だれとも交換しない</button>
  `;
}

function wireActions(container: HTMLElement, roleId: RoleId, ctx: AppContext): void {
  if (roleId === "werewolf") {
    container.querySelectorAll<HTMLButtonElement>("[data-center-peek]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const index = Number(btn.dataset.centerPeek);
        const role = ctx.centerCards[index];
        const box = container.querySelector("#peek-result");
        if (box) box.innerHTML = `<p>${ROLE_META[role].emoji} ${ROLE_META[role].name}</p>`;
      });
    });
  }

  if (roleId === "seer") {
    container.querySelectorAll<HTMLButtonElement>("[data-seer-player]").forEach((btn) => {
      btn.addEventListener("click", () => {
        uiState.seerChoice = "player";
        uiState.seerTargetId = btn.dataset.seerPlayer;
        render(container, ctx);
      });
    });
    const centerButtons = Array.from(
      container.querySelectorAll<HTMLButtonElement>("[data-seer-center]")
    );
    const picked: number[] = [];
    centerButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const index = Number(btn.dataset.seerCenter);
        if (!picked.includes(index)) picked.push(index);
        if (picked.length >= 2) {
          uiState.seerChoice = "center";
          uiState.seerCenterIndexes = picked.slice(0, 2);
          render(container, ctx);
        } else {
          btn.classList.add("active");
        }
      });
    });
    container.querySelector("[data-seer-skip]")?.addEventListener("click", () => {
      uiState.seerChoice = "skip";
      render(container, ctx);
    });
  }

  if (roleId === "robber") {
    container.querySelectorAll<HTMLButtonElement>("[data-robber-target]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const targetId = btn.dataset.robberTarget!;
        void robberSwap(ctx.roomId, ctx.memberId, targetId).then((newRole) => {
          uiState.robberResult = newRole;
          render(container, ctx);
        });
      });
    });
    container.querySelector("[data-robber-skip]")?.addEventListener("click", () => {
      uiState.robberResult = ctx.members[ctx.memberId].currentRole;
      render(container, ctx);
    });
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
