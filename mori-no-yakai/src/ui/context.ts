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
 * 自分の「最終的な本当の役職」を常に画面の一番上に固定表示するバナーHTML
 * （currentRole基準）。**result画面専用**。役職未確定なら空文字を返す。
 *
 * 公式ルール上、夜が明けた後は誰も自分のカードを見返さないため、きつねに
 * 交換された側は投票が終わるまで自分が交換されたことに気づかない。
 * currentRoleは勝敗判定・最終結果表示専用の「本当の役職」なので、
 * night/discuss/vote画面では使わず`myKnownRoleBanner()`を使うこと
 * （2026-07-11、公式ルールに基づく指摘で`myRoleBanner`から改名）。
 */
export function myFinalRoleBanner(ctx: AppContext): string {
  return roleBannerFor(ctx.members[ctx.memberId]?.currentRole);
}

/**
 * night/discuss/vote画面共通の役職バナー。**knownRole基準**（本人が自分の役職だと
 * 認識している値、無ければoriginalRoleにフォールバック）で表示する。
 * currentRoleを使うと、きつねの交換が完了した瞬間に交換された側のバナーが
 * 書き換わってしまい、公式ルールでは夜が明けた後は誰も自分のカードを
 * 見返さない（＝投票が終わるまで交換に気づかない）という前提に反する
 * （2026-07-11）。交換を行った本人はknownRoleが更新されるので、
 * きつねの行動画面で見た新しい役職がそのままdiscuss/voteでも表示される。
 */
export function myKnownRoleBanner(ctx: AppContext): string {
  const self = ctx.members[ctx.memberId];
  return roleBannerFor(self?.knownRole ?? self?.originalRole);
}

function roleBannerFor(role: RoleId | undefined): string {
  if (!role) return "";
  const meta = ROLE_META[role];
  return `<p class="role-reminder">${meta.emoji} あなたは ${meta.name}</p>`;
}
