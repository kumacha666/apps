import type { RoleId, RoleMeta, RoleConfig } from "./types";

export const ROLE_META: Record<RoleId, RoleMeta> = {
  villager: {
    id: "villager",
    name: "うさぎ",
    emoji: "🐰",
    team: "forest",
    description: "夜は何もせず眠っています。",
  },
  werewolf: {
    id: "werewolf",
    name: "おおかみ",
    emoji: "🐺",
    team: "wolf",
    description: "夜、仲間のおおかみと顔を見合わせます。1匹だけなら中央カードを1枚見られます。",
  },
  seer: {
    id: "seer",
    name: "ふくろう",
    emoji: "🦉",
    team: "forest",
    description: "夜、他の1人のカード、または中央カード2枚のどちらかを見られます。",
  },
  robber: {
    id: "robber",
    name: "きつね",
    emoji: "🦊",
    team: "forest",
    description: "夜、他の1人と自分のカードを交換し、新しい役職を確認します。",
  },
  minion: {
    id: "minion",
    name: "子狼",
    emoji: "🐾",
    team: "wolf",
    description: "夜、おおかみが誰かを確認します（自分の正体はおおかみ側には明かされません）。",
  },
};

/** 夜の行動順（固定）。実際に登場する役職だけを抽出して使う。 */
export const NIGHT_ORDER: RoleId[] = ["werewolf", "minion", "seer", "robber"];

export function defaultRoleConfig(playerCount: number): RoleConfig {
  return {
    centerCount: 3,
    werewolfCount: playerCount <= 5 ? 1 : 2,
    seer: true,
    robber: true,
    minion: true,
  };
}

/** roleConfigとプレイヤー数から、うさぎの数を算出する。マイナスなら不正な構成。 */
export function computeVillagerCount(playerCount: number, config: RoleConfig): number {
  const fixedCount =
    config.werewolfCount +
    (config.seer ? 1 : 0) +
    (config.robber ? 1 : 0) +
    (config.minion ? 1 : 0);
  const totalCards = playerCount + config.centerCount;
  return totalCards - fixedCount;
}

export function isValidRoleConfig(playerCount: number, config: RoleConfig): boolean {
  if (config.werewolfCount < 0) return false;
  return computeVillagerCount(playerCount, config) >= 0;
}

/** 役職構成から未シャッフルのカード配列（プレイヤー数+中央枚数）を作る。不正な構成の場合は例外を投げる。 */
export function buildRoleDeck(playerCount: number, config: RoleConfig): RoleId[] {
  const villagerCount = computeVillagerCount(playerCount, config);
  if (villagerCount < 0) {
    throw new Error("役職構成が不正です（うさぎの数がマイナスになります）");
  }
  const deck: RoleId[] = [];
  for (let i = 0; i < config.werewolfCount; i++) deck.push("werewolf");
  if (config.seer) deck.push("seer");
  if (config.robber) deck.push("robber");
  if (config.minion) deck.push("minion");
  for (let i = 0; i < villagerCount; i++) deck.push("villager");
  return deck;
}

/**
 * 役職構成（roleConfig）から、そのゲームで実施する夜順を抽出する。
 *
 * **配布結果（dealtRoles）ではなく、必ずroleConfigから決めること。** 例えば
 * 「ふくろう・きつねを含む構成」でおおかみが中央カードに行った（誰にも配られなかった）
 * 場合でも、おおかみのフェーズ自体は実施しなければならない（該当者がいないので誰も行動せず
 * 待機画面のまま次に進むだけ）。配布結果を見て「誰にも配られなかった役職のフェーズを省略する」
 * と、フェーズがスキップされたこと自体から「その役職は中央カードにある」と全員に伝わって
 * しまい、正体隠匿ゲームとして致命的な情報漏洩になる（2026-07-11、実プレイで発覚）。
 */
export function buildNightOrderFromConfig(config: RoleConfig): RoleId[] {
  const present = new Set<RoleId>();
  if (config.werewolfCount > 0) present.add("werewolf");
  if (config.minion) present.add("minion");
  if (config.seer) present.add("seer");
  if (config.robber) present.add("robber");
  return NIGHT_ORDER.filter((role) => present.has(role));
}

export function shuffle<T>(items: T[], random: () => number = Math.random): T[] {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
