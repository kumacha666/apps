import type { AppContext } from "./context";
import { participants, myKnownRoleBanner, mySeerRevealBanner, myWolfRevealBanner } from "./context";
import { ROLE_META } from "../roles";
import { markDiscussReady } from "../roomSync";
import { renderForceResetButton, wireForceResetButton } from "./hostControls";

interface DiscussUiState {
  roomId: string;
  memberId: string;
  round: number;
  readyTapped?: boolean;
  /** 「画面をかくす」トグルの状態。ラウンドが変わるたびに表示状態へ戻す。 */
  hidden?: boolean;
}

let uiState: DiscussUiState = { roomId: "", memberId: "", round: -1 };

export function render(container: HTMLElement, ctx: AppContext): void {
  const roundNumber = ctx.state.roundNumber;
  // roomId/memberIdも比較する。「トップに戻る」で別の部屋（または同じ部屋への入り直しで
  // 新しいmemberId）へ移った際に、たまたまroundNumberが一致していると前の部屋の
  // readyTapped/hiddenを引き継いでしまうため（2026-09-14、レビュー指摘）。
  if (uiState.roomId !== ctx.roomId || uiState.memberId !== ctx.memberId || uiState.round !== roundNumber) {
    uiState = { roomId: ctx.roomId, memberId: ctx.memberId, round: roundNumber };
  }

  const self = ctx.members[ctx.memberId];
  const remainingSec = Math.max(0, Math.ceil((ctx.state.discussEndsAt - Date.now()) / 1000));
  const min = Math.floor(remainingSec / 60);
  const sec = remainingSec % 60;
  const role = self?.knownRole ?? self?.originalRole;
  const alreadyReady = uiState.readyTapped || self?.discussReadyRound === roundNumber;

  // 早期進行の判定（isDiscussComplete）と同じ集合（配札済み全員、オンライン状態は問わない）
  // を表示に使う（2026-08-16、night.tsと同じ理由）
  const dealt = participants(ctx);
  const readyCount = dealt.filter((m) => m.discussReadyRound === roundNumber).length;

  // 話し合い中は端末の画面を他人に覗かれると役職がバレてしまうため、ボタン1つで
  // 役職を表示しない「かくす」表示に切り替えられるようにする（ローカルのUI状態のみ、
  // 他プレイヤーやRTDBには一切影響しない。2026-09-14、実プレイでの要望）。
  // タイマー・準備完了ボタン自体は役職を明かさないため、かくした状態でも操作を続けられる。
  const roleArea = uiState.hidden
    ? `<p class="hint-text seer-memo">🙈 画面をかくしています</p>`
    : `
      ${myKnownRoleBanner(ctx)}
      ${mySeerRevealBanner(ctx)}
      ${myWolfRevealBanner(ctx)}
      ${role ? `<p class="role-description">${ROLE_META[role].description}</p>` : ""}
    `;

  container.innerHTML = `
    <h2>🗣️ 議論タイム</h2>
    <button id="btn-leave-room" class="btn-link">← トップに戻る</button>
    ${roleArea}
    <div class="discuss-timer">${min}:${String(sec).padStart(2, "0")}</div>
    <p class="hint-text">声に出して話し合おう。うそをついてもOK！</p>
    <button id="btn-toggle-hide" class="btn-secondary">${uiState.hidden ? "👀 表示に戻す" : "🙈 画面をかくす"}</button>
    <button id="btn-discuss-ready" class="btn-primary" ${alreadyReady ? "disabled" : ""}>
      ${alreadyReady ? "投票を待っています…" : "話し合いおわり・投票へ"}
    </button>
    <p class="hint-text">準備完了 ${readyCount}/${dealt.length}人</p>
    ${renderForceResetButton(ctx)}
  `;

  container.querySelector("#btn-discuss-ready")?.addEventListener("click", () => {
    if (uiState.readyTapped) return;
    uiState.readyTapped = true;
    render(container, ctx);
    void markDiscussReady(ctx.roomId, ctx.memberId, roundNumber);
  });

  container.querySelector("#btn-toggle-hide")?.addEventListener("click", () => {
    uiState.hidden = !uiState.hidden;
    render(container, ctx);
  });

  container.querySelector("#btn-leave-room")?.addEventListener("click", () => {
    ctx.requestLeaveRoom();
  });
  wireForceResetButton(container, ctx);
}
