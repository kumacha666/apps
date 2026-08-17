import { describe, it, expect } from "vitest";
import { StageStartQueue } from "./stageStartQueue";

describe("StageStartQueue", () => {
  it("実行中でない場合は直ちに開始できる", () => {
    const q = new StageStartQueue();
    expect(q.requestStart(1)).toBe(true);
    expect(q.isRunning()).toBe(true);
    expect(q.hasPending()).toBe(false);
  });

  it("実行中の場合は最新要求として保留される（呼び出し元にはfalseを返す）", () => {
    const q = new StageStartQueue();
    q.requestStart(1);
    expect(q.requestStart(2)).toBe(false);
    expect(q.hasPending()).toBe(true);
  });

  it("複数要求では最後のindexが残る（上書き）", () => {
    const q = new StageStartQueue();
    q.requestStart(1);
    q.requestStart(2);
    q.requestStart(3);
    expect(q.takeNextOrFinish()).toBe(3);
  });

  it("先行処理完了後に保留要求が1回だけ実行される", () => {
    const q = new StageStartQueue();
    q.requestStart(1);
    q.requestStart(2);
    expect(q.takeNextOrFinish()).toBe(2);
    // 2回目はもう保留が無いのでnull（running解放）
    expect(q.takeNextOrFinish()).toBeNull();
    expect(q.isRunning()).toBe(false);
  });

  it("実行開始時に古い保留要求が残らない（takeNextOrFinish()直後はhasPending()がfalse）", () => {
    const q = new StageStartQueue();
    q.requestStart(1);
    q.requestStart(2);
    q.takeNextOrFinish();
    expect(q.hasPending()).toBe(false);
  });

  it("処理中にさらに新しい要求が来た場合も最後の要求が優先される（多段のセッション）", () => {
    const q = new StageStartQueue();
    q.requestStart(1);
    // セッション1処理中に2, 3と連続要求
    q.requestStart(2);
    q.requestStart(3);
    expect(q.takeNextOrFinish()).toBe(3); // セッション2開始（indexは3）
    // セッション2処理中にさらに4が来る
    q.requestStart(4);
    expect(q.takeNextOrFinish()).toBe(4); // セッション3開始（indexは4）
    expect(q.takeNextOrFinish()).toBeNull(); // もう保留無し
  });

  it("例外発生時にも次の保留要求を処理できる（reset()でrunning/pendingを強制クリア）", () => {
    const q = new StageStartQueue();
    q.requestStart(1);
    q.requestStart(2);
    // 何らかの理由でtakeNextOrFinish()を経由せずに異常終了した想定
    q.reset();
    expect(q.isRunning()).toBe(false);
    expect(q.hasPending()).toBe(false);
    // 直後の新しい要求は正常に実行許可される
    expect(q.requestStart(5)).toBe(true);
  });

  it("無限再帰や二重実行にならない（実行中は常にfalseを返し続ける）", () => {
    const q = new StageStartQueue();
    q.requestStart(1);
    expect(q.requestStart(2)).toBe(false);
    expect(q.requestStart(3)).toBe(false);
    expect(q.requestStart(4)).toBe(false);
    // running状態のまま何度呼んでも実行許可(true)は二重に出ない
    expect(q.isRunning()).toBe(true);
    // 保留は常に最後の値のみ
    expect(q.takeNextOrFinish()).toBe(4);
  });
});
