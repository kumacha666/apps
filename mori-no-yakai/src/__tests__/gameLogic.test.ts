import { describe, it, expect } from "vitest";
import {
  tallyVotes,
  determineWinner,
  isNightStepComplete,
  isNightStepMinElapsed,
  isDiscussComplete,
  advanceNightState,
  advanceDiscussState,
  advanceVoteState,
  DEFAULT_NIGHT_STEP_DURATION_MS,
  NIGHT_STEP_MIN_DURATION_MS,
} from "../gameLogic";
import type { RoomState } from "../types";

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

  it("誰も2票以上を得なければ誰も脱落しない（平和村ルール）", () => {
    // 3人が互いに別々の相手へ投票 → 全員1票ずつ
    const members = [
      { id: "a", vote: "b" },
      { id: "b", vote: "c" },
      { id: "c", vote: "a" },
    ];
    const result = tallyVotes(members);
    expect(result.counts).toEqual({ a: 1, b: 1, c: 1 });
    expect(result.eliminatedIds).toEqual([]);
  });

  it("存在しないIDへの投票は無視する（有効票が1票のみなら平和村ルールで脱落なし）", () => {
    const members = [
      { id: "a", vote: "ghost" },
      { id: "b", vote: "a" },
    ];
    const result = tallyVotes(members);
    expect(result.counts).toEqual({ a: 1, b: 0 });
    expect(result.eliminatedIds).toEqual([]);
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

  it("場におおかみ不在で唯一のおおかみ陣営「子狼」が脱落したら森陣営の勝利", () => {
    const members = [
      { id: "a", currentRole: "minion" as const },
      { id: "b", currentRole: "villager" as const },
      { id: "c", currentRole: "seer" as const },
    ];
    expect(determineWinner(members, ["a"])).toBe("forest");
  });

  it("場におおかみ不在・子狼生存で別の人が脱落した場合はおおかみ陣営（子狼）の勝利", () => {
    const members = [
      { id: "a", currentRole: "minion" as const },
      { id: "b", currentRole: "villager" as const },
    ];
    expect(determineWinner(members, ["b"])).toBe("wolf");
  });

  it("おおかみが場にいる場合、子狼が脱落してもおおかみ陣営の勝利", () => {
    const members = [
      { id: "a", currentRole: "werewolf" as const },
      { id: "b", currentRole: "minion" as const },
    ];
    expect(determineWinner(members, ["b"])).toBe("wolf");
  });
});

describe("isNightStepComplete", () => {
  it("オンラインの参加者全員が現在のステップ以上にタップ済みならtrue", () => {
    const members = [
      { id: "a", online: true, nightReadyStep: 2 },
      { id: "b", online: true, nightReadyStep: 3 },
    ];
    expect(isNightStepComplete(members, 2)).toBe(true);
  });

  it("1人でも未タップならfalse", () => {
    const members = [
      { id: "a", online: true, nightReadyStep: 2 },
      { id: "b", online: true, nightReadyStep: 1 },
    ];
    expect(isNightStepComplete(members, 2)).toBe(false);
  });

  it("nightReadyStep未設定（一度もタップしていない）ならfalse扱い", () => {
    const members = [{ id: "a", online: true }];
    expect(isNightStepComplete(members, 0)).toBe(false);
  });

  it("オフラインの参加者はタップ判定から除外する", () => {
    const members = [
      { id: "a", online: true, nightReadyStep: 2 },
      { id: "b", online: false },
    ];
    expect(isNightStepComplete(members, 2)).toBe(true);
  });

  it("オンラインの参加者が誰もいなければfalse", () => {
    expect(isNightStepComplete([{ id: "a", online: false }], 0)).toBe(false);
  });
});

describe("isNightStepMinElapsed", () => {
  it("ステップ開始からNIGHT_STEP_MIN_DURATION_MS未満ならfalse", () => {
    // ステップ開始 = nightStepEndsAt(1000+30000) - nightStepDurationMs(30000) = 1000
    const state = { nightStepEndsAt: 31000, nightStepDurationMs: 30000 };
    expect(isNightStepMinElapsed(state, 1000 + NIGHT_STEP_MIN_DURATION_MS - 1)).toBe(false);
  });

  it("ステップ開始からNIGHT_STEP_MIN_DURATION_MS以上経過していればtrue", () => {
    const state = { nightStepEndsAt: 31000, nightStepDurationMs: 30000 };
    expect(isNightStepMinElapsed(state, 1000 + NIGHT_STEP_MIN_DURATION_MS)).toBe(true);
  });

  it("該当役職がおらず全員が即タップしても、最短経過時間までは早期進行しない（情報漏洩対策）", () => {
    // ホストが30秒設定でも、全員タップ直後（経過1秒）ではまだ進めない
    const state = { nightStepEndsAt: 30000, nightStepDurationMs: 30000 };
    expect(isNightStepMinElapsed(state, 1000)).toBe(false);
    expect(isNightStepMinElapsed(state, NIGHT_STEP_MIN_DURATION_MS)).toBe(true);
  });

  it("nightStepDurationMsが欠けている（設定追加前の部屋データ）場合もデフォルト値でフォールバックする", () => {
    const state = { nightStepEndsAt: DEFAULT_NIGHT_STEP_DURATION_MS } as {
      nightStepEndsAt: number;
      nightStepDurationMs?: number;
    };
    expect(isNightStepMinElapsed(state, NIGHT_STEP_MIN_DURATION_MS - 1)).toBe(false);
    expect(isNightStepMinElapsed(state, NIGHT_STEP_MIN_DURATION_MS)).toBe(true);
  });
});

describe("isDiscussComplete", () => {
  it("オンラインの参加者全員が現在のroundNumberでタップ済みならtrue", () => {
    const members = [
      { id: "a", online: true, discussReadyRound: 3 },
      { id: "b", online: true, discussReadyRound: 3 },
    ];
    expect(isDiscussComplete(members, 3)).toBe(true);
  });

  it("1人でも未タップならfalse", () => {
    const members = [
      { id: "a", online: true, discussReadyRound: 3 },
      { id: "b", online: true, discussReadyRound: undefined },
    ];
    expect(isDiscussComplete(members, 3)).toBe(false);
  });

  it("前のラウンドのタップは今回のラウンドではカウントしない", () => {
    const members = [{ id: "a", online: true, discussReadyRound: 2 }];
    expect(isDiscussComplete(members, 3)).toBe(false);
  });

  it("オフラインの参加者はタップ判定から除外する", () => {
    const members = [
      { id: "a", online: true, discussReadyRound: 3 },
      { id: "b", online: false, discussReadyRound: undefined },
    ];
    expect(isDiscussComplete(members, 3)).toBe(true);
  });

  it("オンラインの参加者が誰もいなければfalse", () => {
    expect(isDiscussComplete([{ id: "a", online: false }], 0)).toBe(false);
  });
});

describe("advanceNightState / advanceDiscussState / advanceVoteState", () => {
  const baseState: RoomState = {
    phase: "night",
    hostId: "host",
    createdAt: 0,
    roleConfig: { centerCount: 3, werewolfCount: 1, seer: true, robber: true, minion: true },
    nightOrder: ["werewolf", "seer", "robber"],
    nightStepIndex: 0,
    nightStepDurationMs: 30000,
    nightStepEndsAt: 1000,
    discussDurationMs: 300000,
    discussEndsAt: 0,
    voteEndsAt: 0,
    roundNumber: 1,
  };

  it("次の夜ステップがあれば進めてタイマーをリセットする", () => {
    const next = advanceNightState(baseState, 5000);
    expect(next.phase).toBe("night");
    expect(next.nightStepIndex).toBe(1);
    expect(next.nightStepEndsAt).toBe(5000 + baseState.nightStepDurationMs);
  });

  it("nightStepDurationMsが欠けている（設定追加前の部屋データ）場合はデフォルトにフォールバックする", () => {
    // RTDBから読み込んだ古い部屋データにはnightStepDurationMsが存在しない可能性がある。
    // フォールバックしないとDate.now()+undefinedがNaNになり、RTDBがトランザクションを拒否する。
    const { nightStepDurationMs, ...rest } = baseState;
    const legacyState = rest as RoomState;
    const next = advanceNightState(legacyState, 5000);
    expect(Number.isFinite(next.nightStepEndsAt)).toBe(true);
    expect(next.nightStepEndsAt).toBe(5000 + DEFAULT_NIGHT_STEP_DURATION_MS);
  });

  it("最終ステップなら議論フェーズへ進む", () => {
    const state = { ...baseState, nightStepIndex: 2 };
    const next = advanceNightState(state, 5000);
    expect(next.phase).toBe("discuss");
    expect(next.discussEndsAt).toBe(5000 + baseState.discussDurationMs);
  });

  it("議論フェーズから投票フェーズへ進む", () => {
    const state = { ...baseState, phase: "discuss" as const };
    const next = advanceDiscussState(state, 10000);
    expect(next.phase).toBe("vote");
    expect(next.voteEndsAt).toBeGreaterThan(10000);
  });

  it("投票フェーズから結果フェーズへ進む", () => {
    const state = { ...baseState, phase: "vote" as const };
    const next = advanceVoteState(state);
    expect(next.phase).toBe("result");
  });
});
