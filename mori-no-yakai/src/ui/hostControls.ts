import type { AppContext } from "./context";
import { isHost } from "./context";
import { resetToLobby } from "../roomSync";

/**
 * ホストが進行中のゲームを強制的にロビーへ戻すための緊急ボタン。night/discuss/vote/result
 * のどの画面からも呼べるようにする。resetToLobby()はフェーズを問わず呼び出せる既存関数
 * （もう一度あそぶボタンと同じ処理）なので、新しいロジックは追加せずUI導線だけを増やす。
 *
 * 全員が退室してしまった・誰かの端末が操作不能になった等でフェーズが自然に進まなくなった
 * 場合の復旧手段として追加した（2026-09-14、実プレイで4人が抜けた後に部屋が動かなくなり
 * 対話フェーズのタイムアウトを待つしかなかった、という報告を受けて）。
 */
export function renderForceResetButton(ctx: AppContext): string {
  if (!isHost(ctx)) return "";
  return `<button id="btn-force-reset" class="btn-danger">🚨 強制的にロビーへ戻す</button>`;
}

export function wireForceResetButton(container: HTMLElement, ctx: AppContext): void {
  container.querySelector("#btn-force-reset")?.addEventListener("click", () => {
    const ok = window.confirm(
      "進行中のゲームを終了し、全員を強制的にロビーへ戻します。よろしいですか？"
    );
    if (!ok) return;
    void resetToLobby(ctx.roomId);
  });
}
