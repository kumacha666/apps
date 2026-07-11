import type { AppContext } from "./context";
import { participants, onlineMembers } from "./context";
import { ROLE_META } from "../roles";
import { robberSwap, markNightReady } from "../roomSync";
import type { RoleId } from "../types";

interface NightUiState {
  step: number;
  round: number;
  readyTapped?: boolean;
  wolfPeekIndex?: number;
  seerChoice?: "player" | "center" | "skip";
  seerTargetId?: string;
  seerPicked?: number[];
  seerCenterIndexes?: number[];
  robberPending?: boolean;
  robberTargetId?: string;
  robberResult?: RoleId;
}

let uiState: NightUiState = { step: -1, round: -1 };

export function render(container: HTMLElement, ctx: AppContext): void {
  const stepIndex = ctx.state.nightStepIndex;
  const roundNumber = ctx.state.roundNumber;
  // stepIndexだけを見て比較すると、対局を跨いで両方とも最初のステップが0の場合に
  // リセットされず、前回の対局でタップ済みのローカル状態が残ってしまう（サーバー側は
  // startGame()でnightReadyStepを消しているのにボタンが押せないままになる）ため、
  // roundNumberも合わせて比較する。
  if (uiState.step !== stepIndex || uiState.round !== roundNumber) {
    uiState = { step: stepIndex, round: roundNumber };
  }

  const currentRoleId = ctx.state.nightOrder[stepIndex];
  const self = ctx.members[ctx.memberId];
  const remainingSec = Math.max(0, Math.ceil((ctx.state.nightStepEndsAt - Date.now()) / 1000));
  const isMyTurn = self?.originalRole === currentRoleId;
  const alreadyReady = uiState.readyTapped || (self?.nightReadyStep ?? -1) >= stepIndex;

  const header = `
    <h2>🌙 夜がふけていく…</h2>
    <div class="night-timer">${remainingSec}秒</div>
  `;

  // 「つぎへ」タップ後もアクションボタンを押せるままにすると、既に他の全員が
  // 準備完了で夜フェーズを抜けた後にきつねの交換などが実行されてしまう恐れがあるため、
  // タップ後は読み取り専用の表示に切り替え、ボタンは配線しない。
  const body = isMyTurn
    ? alreadyReady
      ? renderReadOnly(currentRoleId, ctx)
      : renderActionFor(currentRoleId, ctx)
    : `<p class="waiting-text">${ROLE_META[currentRoleId].emoji} だれかが行動中…しずかに待とう</p>`;

  const online = onlineMembers(ctx).filter((m) => m.originalRole);
  const readyCount = online.filter((m) => (m.nightReadyStep ?? -1) >= stepIndex).length;

  container.innerHTML = `
    ${header}
    ${body}
    <button id="btn-night-ready" class="btn-primary" ${alreadyReady ? "disabled" : ""}>
      ${alreadyReady ? "つぎを待っています…" : "つぎへ"}
    </button>
    <p class="hint-text">準備完了 ${readyCount}/${online.length}人</p>
    <p class="hint-text">全員がタップすると次に進みます（役職と関係なく全員タップしてください）</p>
  `;

  if (isMyTurn && !alreadyReady) wireActions(container, currentRoleId, ctx);

  container.querySelector("#btn-night-ready")?.addEventListener("click", () => {
    if (uiState.readyTapped) return;
    uiState.readyTapped = true;
    render(container, ctx);
    void markNightReady(ctx.roomId, ctx.memberId, stepIndex);
  });
}

/** 「つぎへ」タップ後の読み取り専用表示。すでに決めた結果があればそれを見せ、なければ何もしなかった旨を表示する。 */
function renderReadOnly(roleId: RoleId, ctx: AppContext): string {
  switch (roleId) {
    case "werewolf": {
      const wolves = participants(ctx).filter((m) => m.originalRole === "werewolf");
      if (wolves.length >= 2 || uiState.wolfPeekIndex !== undefined) return renderWerewolf(ctx);
      return `<p>${ROLE_META.werewolf.emoji} 中央カードは見ませんでした。</p>`;
    }
    case "minion":
      return renderMinion(ctx);
    case "seer":
      if (uiState.seerChoice) return renderSeer(ctx);
      return `<p>${ROLE_META.seer.emoji} 何も見ませんでした。</p>`;
    case "robber":
      if (uiState.robberResult) return renderRobber(ctx);
      return `<p>${ROLE_META.robber.emoji} 誰とも交換しませんでした。</p>`;
    case "villager":
      return `<p>あなたはうさぎ。することはありません。</p>`;
  }
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
  const wolves = participants(ctx).filter((m) => m.originalRole === "werewolf");
  const others = wolves.filter((m) => m.id !== ctx.memberId);
  if (wolves.length >= 2) {
    return `
      <p>${ROLE_META.werewolf.emoji} あなたはおおかみ。仲間は…</p>
      <ul class="member-list">${others.map((m) => `<li>${escapeHtml(m.name)}</li>`).join("")}</ul>
    `;
  }
  if (uiState.wolfPeekIndex !== undefined) {
    const role = ctx.centerCards[uiState.wolfPeekIndex];
    return `
      <p>${ROLE_META.werewolf.emoji} あなたは一匹狼。仲間はいません。</p>
      <p>中央カード${uiState.wolfPeekIndex + 1}は ${ROLE_META[role].emoji} ${ROLE_META[role].name}</p>
    `;
  }
  return `
    <p>${ROLE_META.werewolf.emoji} あなたは一匹狼。仲間はいません。</p>
    <p>中央カードを1枚だけ見られます。</p>
    <div class="center-card-row">
      ${ctx.centerCards.map((_, i) => `<button data-center-peek="${i}" class="btn-card">中央${i + 1}</button>`).join("")}
    </div>
  `;
}

function renderMinion(ctx: AppContext): string {
  const wolves = participants(ctx).filter((m) => m.originalRole === "werewolf");
  return `
    <p>${ROLE_META.minion.emoji} あなたは子狼。おおかみ陣営の仲間は…</p>
    ${
      wolves.length > 0
        ? `<ul class="member-list">${wolves.map((m) => `<li>${escapeHtml(m.name)}</li>`).join("")}</ul>`
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

  const others = participants(ctx).filter((m) => m.id !== ctx.memberId);
  const picked = uiState.seerPicked ?? [];
  return `
    <p>${ROLE_META.seer.emoji} あなたはふくろう。何を見ますか？</p>
    <p class="hint-text">他の1人 か 中央カード2枚、どちらか片方だけ見られます。</p>
    <div class="member-list">
      ${others
        .map((m) => `<button data-seer-player="${m.id}" class="btn-card" ${picked.length > 0 ? "disabled" : ""}>${escapeHtml(m.name)}</button>`)
        .join("")}
    </div>
    <div class="center-card-row">
      ${ctx.centerCards.map((_, i) => `<button data-seer-center="${i}" class="btn-card ${picked.includes(i) ? "active" : ""}">中央${i + 1}</button>`).join("")}
    </div>
    <button data-seer-skip class="btn-link">何も見ない</button>
  `;
}

function renderRobber(ctx: AppContext): string {
  if (uiState.robberResult) {
    return `<p>${ROLE_META.robber.emoji} 交換後、あなたの役職は ${ROLE_META[uiState.robberResult].emoji} ${ROLE_META[uiState.robberResult].name}</p>`;
  }
  if (uiState.robberPending) {
    return `<p>${ROLE_META.robber.emoji} 交換中…</p>`;
  }
  const others = participants(ctx).filter((m) => m.id !== ctx.memberId);
  return `
    <p>${ROLE_META.robber.emoji} あなたはきつね。誰かと役職を交換しますか？</p>
    <div class="member-list">
      ${others
        .map((m) => `<button data-robber-target="${m.id}" class="btn-card">${escapeHtml(m.name)}</button>`)
        .join("")}
    </div>
    <button data-robber-skip class="btn-link">だれとも交換しない</button>
  `;
}

function wireActions(container: HTMLElement, roleId: RoleId, ctx: AppContext): void {
  if (roleId === "werewolf") {
    container.querySelectorAll<HTMLButtonElement>("[data-center-peek]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (uiState.wolfPeekIndex !== undefined) return; // 1枚だけ
        uiState.wolfPeekIndex = Number(btn.dataset.centerPeek);
        render(container, ctx);
      });
    });
  }

  if (roleId === "seer") {
    container.querySelectorAll<HTMLButtonElement>("[data-seer-player]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (uiState.seerChoice || (uiState.seerPicked?.length ?? 0) > 0) return;
        uiState.seerChoice = "player";
        uiState.seerTargetId = btn.dataset.seerPlayer;
        render(container, ctx);
      });
    });
    container.querySelectorAll<HTMLButtonElement>("[data-seer-center]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (uiState.seerChoice) return;
        const index = Number(btn.dataset.seerCenter);
        const picked = (uiState.seerPicked ??= []);
        if (!picked.includes(index)) picked.push(index);
        if (picked.length >= 2) {
          uiState.seerChoice = "center";
          uiState.seerCenterIndexes = picked.slice(0, 2);
        }
        render(container, ctx);
      });
    });
    container.querySelector("[data-seer-skip]")?.addEventListener("click", () => {
      if (uiState.seerChoice) return;
      uiState.seerChoice = "skip";
      render(container, ctx);
    });
  }

  if (roleId === "robber") {
    container.querySelectorAll<HTMLButtonElement>("[data-robber-target]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (uiState.robberPending || uiState.robberResult) return; // 多重交換ガード
        uiState.robberPending = true;
        const targetId = btn.dataset.robberTarget!;
        render(container, ctx);
        void robberSwap(ctx.roomId, ctx.memberId, targetId).then((newRole) => {
          uiState.robberResult = newRole;
          render(container, ctx);
        });
      });
    });
    container.querySelector("[data-robber-skip]")?.addEventListener("click", () => {
      if (uiState.robberPending || uiState.robberResult) return;
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
