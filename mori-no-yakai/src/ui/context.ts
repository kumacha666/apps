import type { Member, RoomState, RoleId } from "../types";
import { effectiveHostId } from "../gameLogic";
import { ROLE_META } from "../roles";

export interface AppContext {
  roomId: string;
  memberId: string;
  state: RoomState;
  members: Record<string, Member>;
  centerCards: RoleId[];
  /** ロビーの「トップに戻る」ボタンから呼ぶ。main.ts側で退室処理とホーム画面への遷移を行う。 */
  requestLeaveRoom: () => void;
}

/** 表示・操作上のホストID。元のホストがオフラインの間は最古参のオンラインメンバーが引き継ぐ。 */
export function currentHostId(ctx: AppContext): string {
  return effectiveHostId(Object.values(ctx.members), ctx.state.hostId);
}

export function isHost(ctx: AppContext): boolean {
  return currentHostId(ctx) === ctx.memberId;
}

export function onlineMembers(ctx: AppContext): Member[] {
  return Object.values(ctx.members).filter((m) => m.online);
}

/** 配札されたプレイヤー（ゲーム参加者）。切断してもゲームからは消えない。 */
export function participants(ctx: AppContext): Member[] {
  return Object.values(ctx.members).filter((m) => m.originalRole);
}

export function otherMembers(ctx: AppContext): Member[] {
  return onlineMembers(ctx).filter((m) => m.id !== ctx.memberId);
}

/**
 * 自分の役職を常に画面の一番上に固定表示するためのバナーHTML。
 * 役職未確定（ロビー・配札前・不参加）なら空文字を返す。
 * night/discuss/vote/resultの各画面はこれを他のコンテンツより前に置くこと。
 */
export function myRoleBanner(ctx: AppContext): string {
  const role = ctx.members[ctx.memberId]?.currentRole;
  if (!role) return "";
  const meta = ROLE_META[role];
  return `<p class="role-reminder">${meta.emoji} あなたは ${meta.name}</p>`;
}
