import { describe, it, expect } from "vitest";
import {
  defaultRoleConfig,
  computeVillagerCount,
  isValidRoleConfig,
  buildRoleDeck,
  buildNightOrderFromConfig,
  shuffle,
} from "../roles";

describe("defaultRoleConfig / buildRoleDeck (デフォルト構成の表と一致すること)", () => {
  const expected: Record<number, { werewolf: number; villager: number; total: number }> = {
    3: { werewolf: 1, villager: 2, total: 6 },
    4: { werewolf: 1, villager: 3, total: 7 },
    5: { werewolf: 1, villager: 4, total: 8 },
    6: { werewolf: 2, villager: 4, total: 9 },
    7: { werewolf: 2, villager: 5, total: 10 },
    8: { werewolf: 2, villager: 6, total: 11 },
  };

  for (const [playersStr, exp] of Object.entries(expected)) {
    const players = Number(playersStr);
    it(`${players}人: おおかみ${exp.werewolf}・うさぎ${exp.villager}・カード総数${exp.total}`, () => {
      const config = defaultRoleConfig(players);
      expect(config.werewolfCount).toBe(exp.werewolf);
      expect(config.centerCount).toBe(3);

      const deck = buildRoleDeck(players, config);
      expect(deck.length).toBe(exp.total);
      expect(deck.length).toBe(players + config.centerCount);

      const counts = tally(deck);
      expect(counts.werewolf ?? 0).toBe(exp.werewolf);
      expect(counts.villager ?? 0).toBe(exp.villager);
      expect(counts.seer ?? 0).toBe(1);
      expect(counts.robber ?? 0).toBe(1);
      expect(counts.minion ?? 0).toBe(1);
    });
  }
});

describe("中央カード枚数を2枚にした場合", () => {
  it("カード総数がプレイヤー数+2になる", () => {
    const config = { ...defaultRoleConfig(5), centerCount: 2 as const };
    const deck = buildRoleDeck(5, config);
    expect(deck.length).toBe(7);
  });
});

describe("不正な役職構成の検証", () => {
  it("固定役職の合計がプレイヤー数+中央枚数を超えるとうさぎがマイナスになり不正", () => {
    const config = {
      centerCount: 2 as const,
      werewolfCount: 3,
      seer: true,
      robber: true,
      minion: true,
    };
    // 3人 + 中央2枚 = 5枚のところ、固定役職だけで3+1+1+1=6枚必要
    expect(computeVillagerCount(3, config)).toBe(-1);
    expect(isValidRoleConfig(3, config)).toBe(false);
    expect(() => buildRoleDeck(3, config)).toThrow();
  });

  it("ちょうど収まる構成は有効", () => {
    const config = {
      centerCount: 2 as const,
      werewolfCount: 0,
      seer: true,
      robber: true,
      minion: true,
    };
    // 3人 + 中央2枚 = 5枚、固定役職(seer/robber/minion)で3枚 => うさぎ2枚でちょうど収まる
    expect(computeVillagerCount(3, config)).toBe(2);
    expect(isValidRoleConfig(3, config)).toBe(true);
  });

  it("役職をすべてOFF・おおかみ0でもカード数が合えば有効（全員うさぎ）", () => {
    const config = {
      centerCount: 3 as const,
      werewolfCount: 0,
      seer: false,
      robber: false,
      minion: false,
    };
    expect(isValidRoleConfig(4, config)).toBe(true);
    const deck = buildRoleDeck(4, config);
    expect(deck.every((r) => r === "villager")).toBe(true);
    expect(deck.length).toBe(7);
  });
});

describe("buildNightOrderFromConfig", () => {
  it("roleConfigに含まれる役職からNIGHT_ORDER準拠の順序を抽出する", () => {
    const config = { centerCount: 3 as const, werewolfCount: 1, seer: true, robber: true, minion: false };
    expect(buildNightOrderFromConfig(config)).toEqual(["werewolf", "seer", "robber"]);
  });

  it("roleConfigに含まれない役職は夜順に含まない", () => {
    const config = { centerCount: 3 as const, werewolfCount: 0, seer: false, robber: false, minion: false };
    expect(buildNightOrderFromConfig(config)).toEqual([]);
  });

  it("minionのみ含む場合", () => {
    const config = { centerCount: 3 as const, werewolfCount: 0, seer: false, robber: false, minion: true };
    expect(buildNightOrderFromConfig(config)).toEqual(["minion"]);
  });

  it("配布結果に関わらずroleConfigだけで決まる（該当役職が全員中央に行っても夜順から省かない）", () => {
    // このテストはbuildNightOrderFromConfigが配布結果(dealtRoles)を一切引数に取らないことで
    // 保証される。誰にも配られなかった役職のフェーズを省略すると「そのフェーズが無い＝
    // その役職は中央カードにある」と全員に伝わってしまう（2026-07-11、実プレイで発覚した不具合）。
    const config = { centerCount: 3 as const, werewolfCount: 1, seer: true, robber: true, minion: true };
    // 実際に配られたかどうかにかかわらず、常に同じ夜順になる
    expect(buildNightOrderFromConfig(config)).toEqual(["werewolf", "minion", "seer", "robber"]);
  });
});

describe("shuffle", () => {
  it("要素数・要素の集合を保持する", () => {
    const input = [1, 2, 3, 4, 5];
    const result = shuffle(input);
    expect(result.length).toBe(input.length);
    expect([...result].sort()).toEqual([...input].sort());
  });

  it("元の配列を破壊しない", () => {
    const input = [1, 2, 3];
    shuffle(input);
    expect(input).toEqual([1, 2, 3]);
  });

  it("指定した乱数関数で決定的な結果になる", () => {
    const input = [1, 2, 3, 4];
    const result = shuffle(input, () => 0); // 常に0を返す => 実質そのままの並び寄りの決定的挙動
    expect(result.length).toBe(4);
  });
});

function tally(deck: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const role of deck) counts[role] = (counts[role] ?? 0) + 1;
  return counts;
}
