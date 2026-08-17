import { describe, it, expect } from "vitest";
import { StageStartQueue } from "./stageStartQueue";

describe("StageStartQueue", () => {
  it("実行中でない場合は直ちに開始できる", () => {
    const q = new StageStartQueue<number>();
    expect(q.requestStart(1, 0)).toBe(true);
    expect(q.isRunning()).toBe(true);
    expect(q.hasPending()).toBe(false);
  });

  it("実行中の場合は最新要求として保留される（呼び出し元にはfalseを返す）", () => {
    const q = new StageStartQueue<number>();
    q.requestStart(1, 0);
    expect(q.requestStart(2, 0)).toBe(false);
    expect(q.hasPending()).toBe(true);
  });

  it("複数要求では最後のindexとcontextが残る", () => {
    const q = new StageStartQueue<number>();
    q.requestStart(1, 0);
    q.requestStart(2, 1);
    q.requestStart(3, 2);
    expect(q.takeNextOrFinish()).toEqual({ index: 3, context: 2 });
  });

  it("先行処理完了後に保留要求が1回だけ実行される", () => {
    const q = new StageStartQueue<number>();
    q.requestStart(1, 0);
    q.requestStart(2, 0);
    expect(q.takeNextOrFinish()).toEqual({ index: 2, context: 0 });
    // 2回目はもう保留が無いのでnull（running解放）
    expect(q.takeNextOrFinish()).toBeNull();
    expect(q.isRunning()).toBe(false);
  });

  it("実行開始時に古い保留要求が残らない（takeNextOrFinish()直後はhasPending()がfalse）", () => {
    const q = new StageStartQueue<number>();
    q.requestStart(1, 0);
    q.requestStart(2, 0);
    q.takeNextOrFinish();
    expect(q.hasPending()).toBe(false);
  });

  it("処理中にさらに新しい要求が来た場合も最後の要求が優先される（多段のセッション）", () => {
    const q = new StageStartQueue<number>();
    q.requestStart(1, 0);
    // セッション1処理中に2, 3と連続要求
    q.requestStart(2, 0);
    q.requestStart(3, 0);
    expect(q.takeNextOrFinish()).toEqual({ index: 3, context: 0 }); // セッション2開始
    // セッション2処理中にさらに4が来る
    q.requestStart(4, 0);
    expect(q.takeNextOrFinish()).toEqual({ index: 4, context: 0 }); // セッション3開始
    expect(q.takeNextOrFinish()).toBeNull(); // もう保留無し
  });

  it("要求が発行された時点のcontextを保持する（実行開始時点の値で上書きしない）", () => {
    // 要求時のcontext（例: navigationEpoch）は、実際にキューから取り出されて
    // 実行されるまでの間に呼び出し元側の状態が変わっても、要求された瞬間の値の
    // ままであるべき（11巡目、/code-review指摘：「開始要求→画面遷移」の順序で、
    // 要求後に起きたナビゲーションを実行側が検知できるようにするため）
    const q = new StageStartQueue<number>();
    q.requestStart(1, 100); // epoch=100の時点で要求
    q.requestStart(2, 100); // 同じepochのまま2を要求（epochはまだ変わっていない）
    const next = q.takeNextOrFinish();
    expect(next).toEqual({ index: 2, context: 100 });
  });

  it("例外発生時にも次の保留要求を処理できる（reset()でrunning/pendingを強制クリア）", () => {
    const q = new StageStartQueue<number>();
    q.requestStart(1, 0);
    q.requestStart(2, 0);
    // 何らかの理由でtakeNextOrFinish()を経由せずに異常終了した想定
    q.reset();
    expect(q.isRunning()).toBe(false);
    expect(q.hasPending()).toBe(false);
    // 直後の新しい要求は正常に実行許可される
    expect(q.requestStart(5, 0)).toBe(true);
  });

  it("無限再帰や二重実行にならない（実行中は常にfalseを返し続ける）", () => {
    const q = new StageStartQueue<number>();
    q.requestStart(1, 0);
    expect(q.requestStart(2, 0)).toBe(false);
    expect(q.requestStart(3, 0)).toBe(false);
    expect(q.requestStart(4, 0)).toBe(false);
    // running状態のまま何度呼んでも実行許可(true)は二重に出ない
    expect(q.isRunning()).toBe(true);
    // 保留は常に最後の値のみ
    expect(q.takeNextOrFinish()).toEqual({ index: 4, context: 0 });
  });
});
