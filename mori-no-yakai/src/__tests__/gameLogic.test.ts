import { describe, it, expect } from "vitest";
import { tallyVotes, determineWinner } from "../gameLogic";

describe("tallyVotes", () => {
  it("最多得票の1人だけが脱落する", () => {
    const members = [
      { id: "a", vote: "b" },
      { id: "b", vote: "c" },
      { id: "c", vote: "b" },
    ];
    const result = tallyVotes(members);
    expect(result.counts).toEqual({ a: 0, b: 2, c: 1 });
    expect(result.eliminatedIds).toEqual(["b"]);
  });

  it("同数投票の場合は複数人が脱落する", () => {
    const members = [
      { id: "a", vote: "b" },
      { id: "b", vote: "a" },
      { id: "c", vote: "a" },
      { id: "d", vote: "b" },
    ];
    const result = tallyVotes(members);
    expect(result.counts).toEqual({ a: 2, b: 2, c: 0, d: 0 });
    expect(result.eliminatedIds.sort()).toEqual(["a", "b"]);
  });

  it("誰も投票しなければ脱落者はいない", () => {
    const members = [{ id: "a" }, { id: "b" }];
    const result = tallyVotes(members);
    expect(result.eliminatedIds).toEqual([]);
  });

  it("存在しないIDへの投票は無視する", () => {
    const members = [
      { id: "a", vote: "ghost" },
      { id: "b", vote: "a" },
    ];
    const result = tallyVotes(members);
    expect(result.counts).toEqual({ a: 1, b: 0 });
    expect(result.eliminatedIds).toEqual(["a"]);
  });
});

describe("determineWinner", () => {
  it("おおかみが脱落したら森陣営の勝利", () => {
    const members = [
      { id: "a", currentRole: "werewolf" as const },
      { id: "b", currentRole: "villager" as const },
    ];
    expect(determineWinner(members, ["a"])).toBe("forest");
  });

  it("おおかみが生存していれば（脱落なし）おおかみ陣営の勝利", () => {
    const members = [
      { id: "a", currentRole: "werewolf" as const },
      { id: "b", currentRole: "villager" as const },
    ];
    expect(determineWinner(members, [])).toBe("wolf");
  });

  it("おおかみが生存していれば（別の人が脱落）おおかみ陣営の勝利", () => {
    const members = [
      { id: "a", currentRole: "werewolf" as const },
      { id: "b", currentRole: "seer" as const },
    ];
    expect(determineWinner(members, ["b"])).toBe("wolf");
  });

  it("場におおかみが1匹もおらず誰も脱落しなければ森陣営の勝利", () => {
    const members = [
      { id: "a", currentRole: "villager" as const },
      { id: "b", currentRole: "seer" as const },
    ];
    expect(determineWinner(members, [])).toBe("forest");
  });

  it("場におおかみが1匹もいなくても誰かが脱落した場合はおおかみ陣営の勝利", () => {
    const members = [
      { id: "a", currentRole: "villager" as const },
      { id: "b", currentRole: "seer" as const },
    ];
    expect(determineWinner(members, ["b"])).toBe("wolf");
  });

  it("きつねの交換でおおかみになったプレイヤーが脱落した場合も森陣営の勝利（currentRole基準）", () => {
    // originalRoleはrobberだったが交換でwerewolfになったケースを想定
    const members = [
      { id: "a", currentRole: "werewolf" as const },
      { id: "b", currentRole: "robber" as const },
    ];
    expect(determineWinner(members, ["a"])).toBe("forest");
  });
});
