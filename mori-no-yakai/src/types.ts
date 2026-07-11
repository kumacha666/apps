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

/**
 * 中央カードはroundNumberと一緒に保存する。stateとcenterCardsは別々のFirebase
 * リスナーで届くため、値だけでは「前ラウンドの残り」か「今ラウンドの新しいデータ」かを
 * クライアント側で判別できない。roundを紐付けることで、読み取り側がstate.roundNumberと
 * 突き合わせて古いデータを弾けるようにする。
 */
export interface CenterCardsData {
  round: number;
  cards: RoleId[];
}

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
  /** 議論フェーズで「つぎへ」をタップしたときのroundNumber。全員が現在のroundNumberに追いつくと早期に次へ進む。 */
  discussReadyRound?: number;
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
  /** startGame()が呼ばれるたびにインクリメントする。夜ステップUIの状態を「新しい対局」として
   *  正しくリセットするために使う（同じstepIndex=0で始まる対局が連続すると区別できないため）。 */
  roundNumber: number;
}
