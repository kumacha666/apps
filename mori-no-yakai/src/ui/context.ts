import type { Member, RoomState, RoleId } from "../types";

export interface AppContext {
  roomId: string;
  memberId: string;
  state: RoomState;
  members: Record<string, Member>;
  centerCards: RoleId[];
}

export function isHost(ctx: AppContext): boolean {
  return ctx.state.hostId === ctx.memberId;
}

export function onlineMembers(ctx: AppContext): Member[] {
  return Object.values(ctx.members).filter((m) => m.online);
}

export function otherMembers(ctx: AppContext): Member[] {
  return onlineMembers(ctx).filter((m) => m.id !== ctx.memberId);
}
