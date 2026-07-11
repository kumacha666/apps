import type { AppContext } from "./context";
import { participants, onlineMembers, myKnownRoleBanner } from "./context";
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
  robberPending?: boolean;
  robberTargetId?: string;
  robberResult?: RoleId;
  /** centerCardsは別リスナーで届くため一時的に空配列で再描画されることがある。
   *  一度受信できた値をこのラウンド内で固定し、後続の描画がその値を使い続けることで
   *  中央カードのボタンが出たり消えたりするちらつきを防ぐ。 */
  centerCardsSnapshot?: RoleId[];
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
  // 一度受信できたcenterCardsはラウンド中は不変なので、初回受信時点でスナップショットを
  // 固定する。以降の描画では常にこのスナップショットを使い、centerCardsリスナーの
  // タイミングのズレによる再空配列化の影響を受けないようにする。
  if (!uiState.centerCardsSnapshot && ctx.centerCards.length > 0) {
    uiState.centerCardsSnapshot = ctx.centerCards;
  }

  const currentRoleId = ctx.state.nightOrder[stepIndex];
  const self = ctx.members[ctx.memberId];
  const remainingSec = Math.max(0, Math.ceil((ctx.state.nightStepEndsAt - Date.now()) / 1000));
  const isMyTurn = self?.originalRole === currentRoleId;
  const alreadyReady = uiState.readyTapped || (self?.nightReadyStep ?? -1) >= stepIndex;
  // きつねの交換（robberSwap）は非同期でRTDBに書き込む。書き込み中に「つぎへ」を押せてしまうと、
  // 他の全員が先に準備完了して夜フェーズを抜けた後にcurrentRoleの書き込みが完了し、
  // 議論開始後に役職が変わってしまう恐れがあるため、交換の完了まではボタンを無効化する。
  const readyDisabled = alreadyReady || uiState.robberPending === true;

  const header = `
    <h2>🌙 夜がふけていく…</h2>
    ${myKnownRoleBanner(ctx)}
    <div class="night-timer">${remainingSec}秒</div>
  `;

  // 「つぎへ」タップ後もアクションボタンを押せるままにすると、既に他の全員が
  // 準備完了で夜フェーズを抜けた後にきつねの交換などが実行されてしまう恐れがあるため、
  // タップ後は読み取り専用の表示に切り替え、ボタンは配線しない。
  const body = isMyTurn
    ? alreadyReady
      ? renderReadOnly(currentRoleId, ctx)
      : renderActionFor(currentRoleId, ctx)
    : `
      <p class="waiting-text">${ROLE_META[currentRoleId].emoji} だれかが行動中…しずかに待とう</p>
      <p class="role-description">${ROLE_META[currentRoleId].name}：${ROLE_META[currentRoleId].description}</p>
    `;

  const online = onlineMembers(ctx).filter((m) => m.originalRole);
  const readyCount = online.filter((m) => (m.nightReadyStep ?? -1) >= stepIndex).length;

  container.innerHTML = `
    ${header}
    ${body}
    <button id="btn-night-ready" class="btn-primary" ${readyDisabled ? "disabled" : ""}>
      ${alreadyReady ? "つぎを待っています…" : uiState.robberPending ? "交換中…" : "つぎへ"}
    </button>
    <p class="hint-text">準備完了 ${readyCount}/${online.length}人</p>
    <p class="hint-text">全員がタップすると次に進みます（役職と関係なく全員タップしてください）</p>
  `;

  if (isMyTurn && !alreadyReady) wireActions(container, currentRoleId, ctx);

  container.querySelector("#btn-night-ready")?.addEventListener("click", () => {
    if (uiState.readyTapped || uiState.robberPending) return;
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
      return `
        <p>${ROLE_META.villager.emoji} あなたはうさぎ。することはありません。</p>
        <p class="role-description">${ROLE_META.villager.description}</p>
      `;
  }
}

function renderWerewolf(ctx: AppContext): string {
  const wolves = participants(ctx).filter((m) => m.originalRole === "werewolf");
  const others = wolves.filter((m) => m.id !== ctx.memberId);
  const description = `<p class="role-description">${ROLE_META.werewolf.description}</p>`;

  if (wolves.length >= 2) {
    return `
      <p>${ROLE_META.werewolf.emoji} あなたはおおかみ。仲間は…</p>
      <ul class="member-list">${others.map((m) => `<li>${escapeHtml(m.name)}</li>`).join("")}</ul>
      ${description}
    `;
  }
  const centerCards = uiState.centerCardsSnapshot ?? ctx.centerCards;
  if (uiState.wolfPeekIndex !== undefined) {
    const role = centerCards[uiState.wolfPeekIndex];
    return `
      <p>${ROLE_META.werewolf.emoji} あなたは一匹狼。仲間はいません。</p>
      <p>中央カード${uiState.wolfPeekIndex + 1}は ${ROLE_META[role].emoji} ${ROLE_META[role].name}</p>
      ${description}
    `;
  }
  // centerCardsはRTDBの別リスナーから届くため、state（phase="night"）より一瞬遅れて
  // 到着することがある。到着前にボタンを描画すると枚数が0→2/3と変化してちらつくため、
  // 読み込み中はボタンを出さない（centerCardsSnapshotで一度受信した値をラウンド中固定する）。
  if (centerCards.length === 0) {
    return `
      <p>${ROLE_META.werewolf.emoji} あなたは一匹狼。仲間はいません。</p>
      <p class="hint-text">中央カードを読み込み中…</p>
      ${description}
    `;
  }
  return `
    <p>${ROLE_META.werewolf.emoji} あなたは一匹狼。仲間はいません。</p>
    <p>中央カードを1枚だけ見られます。</p>
    <div class="center-card-row">
      ${centerCards.map((_, i) => `<button data-center-peek="${i}" class="btn-card">中央${i + 1}</button>`).join("")}
    </div>
    ${description}
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
    <p class="role-description">${ROLE_META.minion.description}</p>
  `;
}

function renderSeer(ctx: AppContext): string {
  const description = `<p class="role-description">${ROLE_META.seer.description}</p>`;
  const centerCards = uiState.centerCardsSnapshot ?? ctx.centerCards;

  if (uiState.seerChoice === "player" && uiState.seerTargetId) {
    const target = ctx.members[uiState.seerTargetId];
    return `<p>${escapeHtml(target.name)}の役職は ${ROLE_META[target.currentRole!].emoji} ${ROLE_META[target.currentRole!].name}</p>${description}`;
  }
  if (uiState.seerChoice === "center") {
    const indexes = centerCards.map((_, i) => i).slice(0, 2);
    return `<p>中央カードは ${indexes
      .map((i) => `${ROLE_META[centerCards[i]].emoji} ${ROLE_META[centerCards[i]].name}`)
      .join(" と ")}</p>${description}`;
  }
  if (uiState.seerChoice === "skip") {
    return `<p>何も見ませんでした。</p>${description}`;
  }

  const others = participants(ctx).filter((m) => m.id !== ctx.memberId);
  // centerCardsが届く前は「中央2枚を見る」ボタンを出さない（ちらつき防止）
  const centerButton =
    centerCards.length > 0
      ? `<button data-seer-center class="btn-card">中央2枚を見る</button>`
      : `<span class="hint-text">中央カードを読み込み中…</span>`;
  return `
    <p>${ROLE_META.seer.emoji} あなたはふくろう。何を見ますか？</p>
    <p class="hint-text">他の1人 か 中央カード2枚、どちらか片方だけ見られます。</p>
    <div class="member-list">
      ${others
        .map((m) => `<button data-seer-player="${m.id}" class="btn-card">${escapeHtml(m.name)}</button>`)
        .join("")}
    </div>
    <div class="center-card-row">
      ${centerButton}
    </div>
    <button data-seer-skip class="btn-link">何も見ない</button>
    ${description}
  `;
}

function renderRobber(ctx: AppContext): string {
  const description = `<p class="role-description">${ROLE_META.robber.description}</p>`;

  if (uiState.robberResult) {
    return `<p>${ROLE_META.robber.emoji} 交換後、あなたの役職は ${ROLE_META[uiState.robberResult].emoji} ${ROLE_META[uiState.robberResult].name}</p>${description}`;
  }
  if (uiState.robberPending) {
    return `<p>${ROLE_META.robber.emoji} 交換中…</p>${description}`;
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
    ${description}
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
        if (uiState.seerChoice) return;
        uiState.seerChoice = "player";
        uiState.seerTargetId = btn.dataset.seerPlayer;
        render(container, ctx);
      });
    });
    container.querySelector("[data-seer-center]")?.addEventListener("click", () => {
      if (uiState.seerChoice) return;
      uiState.seerChoice = "center";
      render(container, ctx);
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
          uiState.robberPending = false;
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
