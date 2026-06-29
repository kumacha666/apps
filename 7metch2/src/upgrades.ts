import type { UpgradeDef, UpgradeId } from "./types";
import { G } from "./state";

export const ALL_UPGRADES: UpgradeDef[] = [
  // Basic unlocks
  { id: "diagonal_move", name: "ナナメ移動", icon: "↗️", desc: "ナナメ方向にスワイプできる", rarity: "common" },
  { id: "match4_bomb", name: "4マッチ→ボム", icon: "💣", desc: "4つ並べるとボムが生まれる", rarity: "common" },
  { id: "match_lt_bomb", name: "L/T→ボム", icon: "🔲", desc: "L字・T字でボムが生まれる", rarity: "common" },
  { id: "match5_rainbow", name: "5マッチ→虹", icon: "🌈", desc: "5つ並べるとレインボーが生まれる", rarity: "rare", requires: ["match4_bomb"] },
  { id: "match_2x2", name: "2×2マッチ", icon: "⬜", desc: "2×2の正方形も消せる", rarity: "common" },

  // Range
  { id: "bomb_range_5", name: "ボム範囲+", icon: "💥", desc: "ボムの範囲が5×5に拡大", rarity: "rare", requires: ["match4_bomb"] },
  { id: "bomb_range_7", name: "ボム範囲++", icon: "🔥", desc: "ボムの範囲が7×7に拡大", rarity: "epic", requires: ["bomb_range_5"] },
  { id: "line_3", name: "3ライン消去", icon: "📏", desc: "ライン消去が3本同時に", rarity: "rare", requires: ["match4_bomb"] },
  { id: "line_cross", name: "十字消去", icon: "✚", desc: "ライン消去が十字になる", rarity: "epic", requires: ["line_3"] },
  { id: "line_x", name: "X字消去", icon: "✖️", desc: "ライン消去がX字になる", rarity: "epic", requires: ["line_cross"] },
  { id: "rainbow_bombs", name: "虹ボム", icon: "🌈💣", desc: "レインボー起爆で同色位置にボム設置", rarity: "epic", requires: ["match5_rainbow"] },

  // Chain
  { id: "auto_detonate", name: "自動起爆", icon: "⚡", desc: "特殊ピース同士が隣接すると自動起爆", rarity: "rare" },
  { id: "spawn_special", name: "特殊増殖", icon: "🧪", desc: "特殊ピースを消すと同種が1個湧く", rarity: "epic" },
  { id: "chain_bombs", name: "チェインボム", icon: "☄️", desc: "3連鎖以上でランダムにボムが降る", rarity: "rare" },

  // Rule-breaking
  { id: "match2", name: "2マッチ", icon: "👥", desc: "2個並びで消える。盤面が溶ける", rarity: "legendary" },
  { id: "infection", name: "感染", icon: "🦠", desc: "消したピースの色が隣に伝染してから消える", rarity: "epic" },
  { id: "split", name: "分裂", icon: "🔱", desc: "特殊ピース起爆時に小型特殊を2個撒く", rarity: "epic", requires: ["match4_bomb"] },
  { id: "afterimage", name: "残像", icon: "👻", desc: "スワイプ軌跡上のピースも全消し", rarity: "rare" },
  { id: "timed_bombs", name: "時限爆弾", icon: "⏱️", desc: "毎ターン時限爆弾が降ってくる", rarity: "rare" },
  { id: "resonance", name: "共鳴", icon: "🔔", desc: "同色を消すたび消去範囲+1ずつ永続拡大", rarity: "legendary" },

  // Chaos
  { id: "blackhole", name: "ブラックホール", icon: "🕳️", desc: "消した場所が周囲を吸い込む", rarity: "legendary" },
  { id: "mirror", name: "ミラー", icon: "🪞", desc: "右半分の操作が左半分にも同時発生", rarity: "epic" },
  { id: "proliferation", name: "増殖", icon: "🍄", desc: "消した色が次ターン2倍降ってくる", rarity: "epic" },
  { id: "meltdown", name: "メルトダウン", icon: "☢️", desc: "1手で10個以上消すと盤面が1段下がる", rarity: "legendary" },
];

export function getAvailableUpgrades(owned: UpgradeId[]): UpgradeDef[] {
  const ownedSet = new Set(owned);
  return ALL_UPGRADES.filter(u => {
    if (G.disabledUpgrades.has(u.id)) return false;
    if (ownedSet.has(u.id)) return false;
    if (u.requires && !u.requires.every(r => ownedSet.has(r))) return false;
    return true;
  });
}

export function pickUpgradeChoices(owned: UpgradeId[], count: number): UpgradeDef[] {
  const available = getAvailableUpgrades(owned);
  if (available.length <= count) return available;

  const weights: Record<string, number> = { common: 40, rare: 30, epic: 20, legendary: 10 };
  const weighted = available.map(u => ({ u, w: weights[u.rarity] }));

  const picked: UpgradeDef[] = [];
  const used = new Set<number>();
  while (picked.length < count && used.size < weighted.length) {
    const remainingW = weighted.reduce((s, x, i) => s + (used.has(i) ? 0 : x.w), 0);
    let roll = Math.random() * remainingW;
    for (let i = 0; i < weighted.length; i++) {
      if (used.has(i)) continue;
      roll -= weighted[i].w;
      if (roll <= 0) {
        picked.push(weighted[i].u);
        used.add(i);
        break;
      }
    }
  }
  return picked;
}

export function has(owned: UpgradeId[], id: UpgradeId): boolean {
  return owned.includes(id);
}
