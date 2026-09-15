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

/**
 * ふくろう（占い師）が夜に見た内容のスナップショット。実プレイで「自分が何を見たか
 * 忘れてしまう」ケースが報告されたため、見た瞬間の役職を保存し、以後discuss/vote/result
 * でも本人にだけ表示し続けられるようにする（2026-09-14）。currentRoleへの参照だけを
 * 保存すると、その後の交換（きつね）で値が変わりうるため、見た瞬間の役職名を直接保存する。
 */
export interface SeerReveal {
  kind: "player" | "center" | "skip";
  /** kind==="player"のときの対象メンバーID・名前（表示用に見た瞬間の名前もスナップショット）。 */
  targetId?: string;
  targetName?: string;
  /** kind==="player"なら長さ1、kind==="center"なら長さ2。kind==="skip"では無し。 */
  roles?: RoleId[];
}

/**
 * 一匹狼（おおかみが1人だけの場合）が夜に見た中央カード1枚のスナップショット。
 * ふくろうのSeerRevealと同じ理由（見た内容を忘れてしまう）で、見た瞬間の役職を
 * 保存し、以後discuss/vote/resultでも本人にだけ表示し続けられるようにする（2026-09-15）。
 */
export interface WolfCenterReveal {
  centerIndex: number;
  role: RoleId;
}

export interface Member {
  id: string;
  name: string;
  online: boolean;
  joinedAt: number;
  originalRole?: RoleId;
  currentRole?: RoleId;
  /**
   * 本人が「自分の役職だ」と認識している役職。公式ルール上、夜が明けたあとは
   * 誰も自分のカードを見返さないため、怪盗に交換された側は自分が交換されたことに
   * 気づかない。そのためcurrentRole（勝敗判定・最終結果表示に使う「本当の役職」）とは
   * 別に、朝〜投票フェーズで本人に見せる役職はこちらを使う。デフォルトはoriginalRoleと
   * 同じで、怪盗として交換を実行した本人の分だけ交換後の役職に更新される
   * （交換された側のknownRoleは更新しない）。
   */
  knownRole?: RoleId;
  vote?: string;
  /**
   * 「トップに戻る」で明示的に退室したかどうか。スマホの画面ロック等による
   * 一時的な切断（online:falseだがleftはfalseのまま）とは区別する。leftがtrueの
   * メンバーは配札対象（startGame）から除外する（selectDealTargets参照）。
   */
  left?: boolean;
  /** 直近でタップ済みの夜ステップindex。全員が現在のステップに追いつくと早期に次へ進む。 */
  nightReadyStep?: number;
  /** 議論フェーズで「つぎへ」をタップしたときのroundNumber。全員が現在のroundNumberに追いつくと早期に次へ進む。 */
  discussReadyRound?: number;
  /** ふくろうが夜に見た内容のスナップショット。SeerReveal参照。 */
  seerReveal?: SeerReveal;
  /** 一匹狼が夜に見た中央カード1枚のスナップショット。WolfCenterReveal参照。 */
  wolfReveal?: WolfCenterReveal;
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
