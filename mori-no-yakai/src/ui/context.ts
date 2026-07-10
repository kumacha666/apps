import type { Member, RoomState, RoleId } from "../types";
import { effectiveHostId } from "../gameLogic";

export interface AppContext {
  roomId: string;
  memberId: string;
  state: RoomState;
  members: Record<string, Member>;
  centerCards: RoleId[];
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
