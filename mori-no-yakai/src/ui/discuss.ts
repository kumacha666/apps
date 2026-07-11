import type { AppContext } from "./context";
import { ROLE_META } from "../roles";

export function render(container: HTMLElement, ctx: AppContext): void {
  const self = ctx.members[ctx.memberId];
  const remainingSec = Math.max(0, Math.ceil((ctx.state.discussEndsAt - Date.now()) / 1000));
  const min = Math.floor(remainingSec / 60);
  const sec = remainingSec % 60;
  const role = self?.currentRole;

  container.innerHTML = `
    <h2>🗣️ 議論タイム</h2>
    <div class="discuss-timer">${min}:${String(sec).padStart(2, "0")}</div>
    ${
      role
        ? `<p class="role-reminder">あなたの最終的な役職は ${ROLE_META[role].emoji} ${ROLE_META[role].name}</p>`
        : ""
    }
    <p class="hint-text">声に出して話し合おう。うそをついてもOK！</p>
  `;
}
