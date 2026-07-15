import { describe, expect, it } from "vitest";
import {
  loadBestRecord,
  loadBestScore,
  saveBestScoreIfBetter,
  saveRecordIfBetter,
  type RunRecord,
  type StorageLike,
} from "./highscore";

function makeFakeStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
  };
}

function makeRecord(endlessRound: number, clearedTenFloors = endlessRound >= 10): RunRecord {
  return {
    endlessRound,
    score: 300,
    maxTurnDamage: 100,
    maxTurnKills: 2,
    clearedTenFloors,
    achievedAt: new Date().toISOString(),
  };
}

describe("highscore（自分の中だけの記録）", () => {
  it("記録がまだ無ければ何を渡しても保存される", () => {
    const storage = makeFakeStorage();
    expect(loadBestRecord(storage)).toBeNull();
    const { saved, best } = saveRecordIfBetter(makeRecord(5), storage);
    expect(saved).toBe(true);
    expect(best.endlessRound).toBe(5);
    expect(loadBestRecord(storage)?.endlessRound).toBe(5);
  });

  it("既存の記録を上回った場合のみ更新される", () => {
    const storage = makeFakeStorage();
    saveRecordIfBetter(makeRecord(5), storage);
    const worse = saveRecordIfBetter(makeRecord(3), storage);
    expect(worse.saved).toBe(false);
    expect(worse.best.endlessRound).toBe(5);

    const better = saveRecordIfBetter(makeRecord(12), storage);
    expect(better.saved).toBe(true);
    expect(loadBestRecord(storage)?.endlessRound).toBe(12);
  });

  it("同じ到達ラウンドでも、後から10層クリア達成の記録が来たら上書きする（先に10層目で敗北していた場合）", () => {
    const storage = makeFakeStorage();
    saveRecordIfBetter(makeRecord(10, false), storage); // 10層目で敗北
    const cleared = saveRecordIfBetter(makeRecord(10, true), storage); // 別のランで10層クリア
    expect(cleared.saved).toBe(true);
    expect(loadBestRecord(storage)?.clearedTenFloors).toBe(true);
  });

  it("既に10層クリア済みの記録を、同ラウンドの未クリア記録で上書きしない", () => {
    const storage = makeFakeStorage();
    saveRecordIfBetter(makeRecord(10, true), storage);
    const worse = saveRecordIfBetter(makeRecord(10, false), storage);
    expect(worse.saved).toBe(false);
    expect(loadBestRecord(storage)?.clearedTenFloors).toBe(true);
  });

  it("storageへのアクセスが例外を投げても、loadBestRecordはクラッシュせずnullを返す", () => {
    const throwingStorage: StorageLike = {
      getItem: () => { throw new Error("SecurityError: storage disabled"); },
      setItem: () => { throw new Error("SecurityError: storage disabled"); },
    };
    expect(() => loadBestRecord(throwingStorage)).not.toThrow();
    expect(loadBestRecord(throwingStorage)).toBeNull();
  });

  it("storageへの保存が例外を投げても、saveRecordIfBetterはクラッシュせず今回の記録を返す（永続化はされないが表示用には使える）", () => {
    const throwingStorage: StorageLike = {
      getItem: () => { throw new Error("SecurityError: storage disabled"); },
      setItem: () => { throw new Error("SecurityError: storage disabled"); },
    };
    const record = makeRecord(7);
    expect(() => saveRecordIfBetter(record, throwingStorage)).not.toThrow();
    const { saved, best } = saveRecordIfBetter(record, throwingStorage);
    expect(saved).toBe(true);
    expect(best.endlessRound).toBe(7);
  });
});

describe("HIGH SCORE（到達ラウンドとは別軸の、累積SCOREだけの自己ベスト）", () => {
  it("記録がまだ無ければ0、初回は渡した値がそのまま保存される", () => {
    const storage = makeFakeStorage();
    expect(loadBestScore(storage)).toBe(0);
    const { saved, best } = saveBestScoreIfBetter(1200, storage);
    expect(saved).toBe(true);
    expect(best).toBe(1200);
    expect(loadBestScore(storage)).toBe(1200);
  });

  it("既存の記録を上回った場合のみ更新される", () => {
    const storage = makeFakeStorage();
    saveBestScoreIfBetter(1200, storage);
    const worse = saveBestScoreIfBetter(800, storage);
    expect(worse.saved).toBe(false);
    expect(worse.best).toBe(1200);

    const better = saveBestScoreIfBetter(2000, storage);
    expect(better.saved).toBe(true);
    expect(loadBestScore(storage)).toBe(2000);
  });

  it("storageへのアクセスが例外を投げても、loadBestScoreはクラッシュせず0を返す", () => {
    const throwingStorage: StorageLike = {
      getItem: () => { throw new Error("SecurityError: storage disabled"); },
      setItem: () => { throw new Error("SecurityError: storage disabled"); },
    };
    expect(() => loadBestScore(throwingStorage)).not.toThrow();
    expect(loadBestScore(throwingStorage)).toBe(0);
  });

  it("storageへの保存が例外を投げても、saveBestScoreIfBetterはクラッシュせず今回のスコアを返す", () => {
    const throwingStorage: StorageLike = {
      getItem: () => { throw new Error("SecurityError: storage disabled"); },
      setItem: () => { throw new Error("SecurityError: storage disabled"); },
    };
    expect(() => saveBestScoreIfBetter(500, throwingStorage)).not.toThrow();
    const { saved, best } = saveBestScoreIfBetter(500, throwingStorage);
    expect(saved).toBe(true);
    expect(best).toBe(500);
  });
});
