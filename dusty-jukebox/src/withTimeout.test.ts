import { describe, expect, test, vi } from "vitest";
import { TimeoutError, withTimeout } from "./withTimeout";

// setTimeout/clearTimeoutを実時間に依存しないフェイクへ差し替える（fade.test.tsの
// waitインジェクションと同じ方針）。callbackを手動で保持し、テスト側で任意のタイミングで
// 発火させられるようにする。
function fakeScheduler() {
  let stored: (() => void) | null = null;
  const clearedHandles = new Set<unknown>();
  let nextHandle = 1;
  const scheduler = {
    setTimeout: vi.fn((callback: () => void) => {
      stored = callback;
      return nextHandle++;
    }),
    clearTimeout: vi.fn((handle: unknown) => { clearedHandles.add(handle); }),
  };
  return { scheduler, fire: () => stored?.(), clearedHandles };
}

describe("withTimeout", () => {
  test("promiseがタイムアウト前に解決すればその値をそのまま返し、タイマーを解除する", async () => {
    const { scheduler, clearedHandles } = fakeScheduler();
    const result = await withTimeout(Promise.resolve("ok"), 1000, "timed out", scheduler);
    expect(result).toBe("ok");
    expect(clearedHandles.size).toBe(1);
  });

  test("promiseがタイムアウト前に拒否すれば元のエラーをそのまま伝える（TimeoutErrorで上書きしない）", async () => {
    const { scheduler } = fakeScheduler();
    const original = new Error("original failure");
    await expect(withTimeout(Promise.reject(original), 1000, "timed out", scheduler)).rejects.toBe(original);
  });

  test("promiseが解決しないままタイマーが発火すると、指定したメッセージのTimeoutErrorで拒否する", async () => {
    const { scheduler, fire } = fakeScheduler();
    const neverSettles = new Promise<string>(() => {});
    const result = withTimeout(neverSettles, 1000, "タイムアウトしました", scheduler);
    fire();
    await expect(result).rejects.toBeInstanceOf(TimeoutError);
    await expect(result).rejects.toThrow("タイムアウトしました");
  });

  test("タイムアウト発火後に元のpromiseが解決しても、既に確定した結果は変わらない", async () => {
    const { scheduler, fire } = fakeScheduler();
    let resolveOriginal!: (value: string) => void;
    const original = new Promise<string>((resolve) => { resolveOriginal = resolve; });
    const result = withTimeout(original, 1000, "timed out", scheduler);
    fire();
    await expect(result).rejects.toBeInstanceOf(TimeoutError);
    // 後から元のpromiseが解決しても、resultは既にタイムアウトで確定済みのまま
    // （Promiseは一度確定すると再確定しない仕様通り、後続のresolveは無視される）。
    resolveOriginal("late");
    await expect(result).rejects.toBeInstanceOf(TimeoutError);
  });
});
