import type { Member } from "./types";

export const NIGHT_STEP_DURATION_MS = 8000;
export const VOTE_DURATION_MS = 60000;
export const DISCUSS_DURATION_OPTIONS_MS = [3 * 60000, 5 * 60000, 8 * 60000];
export const DEFAULT_DISCUSS_DURATION_MS = 5 * 60000;

export interface VoteTally {
  counts: Record<string, number>;
  eliminatedIds: string[];
}

/** 投票を集計し、最多得票者（複数なら同数全員）を脱落者とする。誰も投票しなければ脱落者なし。 */
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
    maxVotes > 0 ? Object.entries(counts).filter(([, c]) => c === maxVotes).map(([id]) => id) : [];
  return { counts, eliminatedIds };
}

export type WinningTeam = "forest" | "wolf";

/**
 * currentRole（きつね交換後の実際の役職）基準で勝敗を判定する。
 * - 脱落者に「おおかみ」が1人でもいれば森陣営の勝利
 * - 場に「おおかみ」が1匹も存在しない（全員分のcurrentRoleにwerewolfがない）まま誰も脱落しなかった場合も森陣営の勝利
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
  if (!werewolfInPlay && eliminatedIds.length === 0) return "forest";

  return "wolf";
}
