import type { AppContext } from "./context";
import { isHost, onlineMembers } from "./context";
import { ROLE_META } from "../roles";
import { computeVillagerCount, isValidRoleConfig } from "../roles";
import { DISCUSS_DURATION_OPTIONS_MS } from "../gameLogic";
import { updateRoleConfig, updateDiscussDuration, resetRoleConfigToDefault, startGame } from "../roomSync";
import type { RoleConfig } from "../types";

export function render(container: HTMLElement, ctx: AppContext): void {
  const host = isHost(ctx);
  const members = onlineMembers(ctx);
  const config = ctx.state.roleConfig;
  const discussDurationMs = ctx.state.discussDurationMs;
  const villagerCount = computeVillagerCount(members.length, config);
  const valid = isValidRoleConfig(members.length, config) && members.length >= 3;

  container.innerHTML = `
    <h2>🌙 森の夜会</h2>
    <div class="room-code-box">
      部屋コード
      <div class="room-code">${ctx.roomId}</div>
    </div>

    <h3>参加者（${members.length}人）</h3>
    <ul class="member-list">
      ${members
        .map(
          (m) =>
            `<li>${m.avatar} ${escapeHtml(m.name)}${m.id === ctx.state.hostId ? " 👑" : ""}</li>`
        )
        .join("")}
    </ul>

    ${
      host
        ? renderHostSettings(config, villagerCount, discussDurationMs)
        : `<p class="waiting-text">ホストの開始を待っています…</p>`
    }

    ${
      host
        ? `<button id="btn-start-game" class="btn-primary" ${valid ? "" : "disabled"}>ゲーム開始</button>
           ${members.length < 3 ? '<p class="error-text">3人以上で開始できます</p>' : ""}
           ${!isValidRoleConfig(members.length, config) ? '<p class="error-text">役職の合計枚数が多すぎます。うさぎの数がマイナスになっています。</p>' : ""}`
        : ""
    }
  `;

  if (host) {
    wireHostControls(container, ctx, config, members.length);
    container.querySelector<HTMLButtonElement>("#btn-start-game")?.addEventListener("click", () => {
      void startGame(ctx.roomId);
    });
  }
}

function renderHostSettings(
  config: RoleConfig,
  villagerCount: number,
  discussDurationMs: number
): string {
  return `
    <div class="lobby-settings">
      <h3>役職構成</h3>
      <div class="setting-row">
        <span>${ROLE_META.werewolf.emoji} おおかみ</span>
        <div class="stepper">
          <button data-action="wolf-dec" class="btn-step">-</button>
          <span>${config.werewolfCount}</span>
          <button data-action="wolf-inc" class="btn-step">+</button>
        </div>
      </div>
      ${toggleRow("seer", config.seer)}
      ${toggleRow("robber", config.robber)}
      ${toggleRow("minion", config.minion)}
      <div class="setting-row">
        <span>🐰 うさぎ（自動）</span>
        <span class="${villagerCount < 0 ? "error-text" : ""}">${villagerCount}</span>
      </div>
      <div class="setting-row">
        <span>中央カード</span>
        <div class="stepper">
          <button data-center="2" class="btn-toggle ${config.centerCount === 2 ? "active" : ""}">2枚</button>
          <button data-center="3" class="btn-toggle ${config.centerCount === 3 ? "active" : ""}">3枚</button>
        </div>
      </div>
      <button id="btn-reset-config" class="btn-link">人数に合わせて初期化</button>

      <h3>議論タイマー</h3>
      <div class="setting-row">
        ${DISCUSS_DURATION_OPTIONS_MS.map(
          (ms) =>
            `<button data-discuss="${ms}" class="btn-toggle ${
              ms === discussDurationMs ? "active" : ""
            }">${ms / 60000}分</button>`
        ).join("")}
      </div>
    </div>
  `;
}

function toggleRow(key: "seer" | "robber" | "minion", enabled: boolean): string {
  const meta = ROLE_META[key];
  return `
    <div class="setting-row">
      <span>${meta.emoji} ${meta.name}</span>
      <label class="toggle-switch">
        <input type="checkbox" data-role-toggle="${key}" ${enabled ? "checked" : ""} />
        <span class="toggle-slider"></span>
      </label>
    </div>
  `;
}

function wireHostControls(
  container: HTMLElement,
  ctx: AppContext,
  config: RoleConfig,
  playerCount: number
): void {
  const push = (next: RoleConfig) => void updateRoleConfig(ctx.roomId, next);

  container.querySelector('[data-action="wolf-inc"]')?.addEventListener("click", () => {
    push({ ...config, werewolfCount: config.werewolfCount + 1 });
  });
  container.querySelector('[data-action="wolf-dec"]')?.addEventListener("click", () => {
    push({ ...config, werewolfCount: Math.max(0, config.werewolfCount - 1) });
  });

  (["seer", "robber", "minion"] as const).forEach((key) => {
    container
      .querySelector<HTMLInputElement>(`[data-role-toggle="${key}"]`)
      ?.addEventListener("change", (e) => {
        const checked = (e.target as HTMLInputElement).checked;
        push({ ...config, [key]: checked });
      });
  });

  container.querySelectorAll<HTMLButtonElement>("[data-center]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const centerCount = Number(btn.dataset.center) as 2 | 3;
      push({ ...config, centerCount });
    });
  });

  container.querySelectorAll<HTMLButtonElement>("[data-discuss]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const ms = Number(btn.dataset.discuss);
      void updateDiscussDuration(ctx.roomId, ms);
    });
  });

  container.querySelector("#btn-reset-config")?.addEventListener("click", () => {
    push(resetRoleConfigToDefault(playerCount));
  });
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
