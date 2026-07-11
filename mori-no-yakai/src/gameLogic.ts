import type { Member } from "./types";

export const NIGHT_STEP_DURATION_MS = 8000;
export const VOTE_DURATION_MS = 60000;
export const DISCUSS_DURATION_OPTIONS_MS = [3 * 60000, 5 * 60000, 8 * 60000];
export const DEFAULT_DISCUSS_DURATION_MS = 5 * 60000;

export interface VoteTally {
  counts: Record<string, number>;
  eliminatedIds: string[];
}

/**
 * 投票を集計し、最多得票者（複数なら同数全員）を脱落者とする。
 * 誰も2票以上を得なかった場合（全員の票が割れた場合）は誰も脱落しない（平和村ルール）。
 * この救済がないと投票完了時に必ず誰かが脱落し、おおかみ不在時の森陣営勝利が到達不能になる。
 */
export function tallyVotes(members: Pick<Member, "id" | "vote">[]): VoteTally {
  const counts: Record<string, number> = {};
  for (const m of members) counts[m.id] = 0;
  for (const m of members) {
    if (m.vote && m.vote in counts) {
      counts[m.vote] += 1;
    }
  }
  const maxVotes = Math.max(0, ...Object.values(counts));
  const eliminatedIds =
    maxVotes >= 2 ? Object.entries(counts).filter(([, c]) => c === maxVotes).map(([id]) => id) : [];
  return { counts, eliminatedIds };
}

export type WinningTeam = "forest" | "wolf";

/**
 * currentRole（きつね交換後の実際の役職）基準で勝敗を判定する。
 * - 脱落者に「おおかみ」が1人でもいれば森陣営の勝利
 * - 場に「おおかみ」が1匹も存在しない場合: 誰も脱落しなければ森陣営の勝利。
 *   また唯一のおおかみ陣営である「子狼」が脱落した場合も森陣営の勝利
 * - それ以外はおおかみ陣営の勝利
 */
export function determineWinner(
  members: Pick<Member, "id" | "currentRole">[],
  eliminatedIds: string[]
): WinningTeam {
  const eliminatedSet = new Set(eliminatedIds);
  const werewolfEliminated = members.some(
    (m) => eliminatedSet.has(m.id) && m.currentRole === "werewolf"
  );
  if (werewolfEliminated) return "forest";

  const werewolfInPlay = members.some((m) => m.currentRole === "werewolf");
  if (!werewolfInPlay) {
    if (eliminatedIds.length === 0) return "forest";
    const minionEliminated = members.some(
      (m) => eliminatedSet.has(m.id) && m.currentRole === "minion"
    );
    if (minionEliminated) return "forest";
  }

  return "wolf";
}

/**
 * 表示・操作上のホストを決める。state.hostIdのプレイヤーがオフラインの間は、
 * オンラインの中で最も早く入室したプレイヤーがホスト権限を引き継ぐ
 * （全クライアントが同じ入力から決定的に同じ結果を得るので、書き込み不要）。
 */
export function effectiveHostId(
  members: Pick<Member, "id" | "online" | "joinedAt">[],
  hostId: string
): string {
  const host = members.find((m) => m.id === hostId);
  if (host?.online) return hostId;
  const online = members
    .filter((m) => m.online)
    .sort((a, b) => a.joinedAt - b.joinedAt);
  return online.length > 0 ? online[0].id : hostId;
}
