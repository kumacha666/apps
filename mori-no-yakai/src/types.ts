export type RoleId = "villager" | "werewolf" | "seer" | "robber" | "minion";

export interface RoleMeta {
  id: RoleId;
  name: string;
  emoji: string;
  team: "forest" | "wolf";
  description: string;
}

export interface RoleConfig {
  centerCount: 2 | 3;
  werewolfCount: number;
  seer: boolean;
  robber: boolean;
  minion: boolean;
}

export type Phase = "lobby" | "night" | "discuss" | "vote" | "result";

export interface Member {
  id: string;
  name: string;
  online: boolean;
  joinedAt: number;
  originalRole?: RoleId;
  currentRole?: RoleId;
  vote?: string;
  /** 直近でタップ済みの夜ステップindex。全員が現在のステップに追いつくと早期に次へ進む。 */
  nightReadyStep?: number;
}

export interface RoomState {
  phase: Phase;
  hostId: string;
  createdAt: number;
  roleConfig: RoleConfig;
  nightOrder: RoleId[];
  nightStepIndex: number;
  nightStepDurationMs: number;
  nightStepEndsAt: number;
  discussDurationMs: number;
  discussEndsAt: number;
  voteEndsAt: number;
}
