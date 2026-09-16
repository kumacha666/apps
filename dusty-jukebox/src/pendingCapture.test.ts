import { describe, expect, test, vi } from "vitest";
import { PendingCapture } from "./pendingCapture";

describe("PendingCapture", () => {
  test("consume()は設置済みのコールバックを値付きで呼び出し、スロットを空にする", () => {
    const slot = new PendingCapture<number>();
    const callback = vi.fn();
    slot.install(callback);
    slot.consume(42);
    expect(callback).toHaveBeenCalledExactlyOnceWith(42);
  });

  test("consume()は2回目以降は何もしない（1回消費すると空になる）", () => {
    const slot = new PendingCapture<number>();
    const callback = vi.fn();
    slot.install(callback);
    slot.consume(1);
    slot.consume(2);
    expect(callback).toHaveBeenCalledExactlyOnceWith(1);
  });

  test("consume()は何も設置されていない場合は何もしない", () => {
    const slot = new PendingCapture<number>();
    expect(() => slot.consume(1)).not.toThrow();
  });

  test("後発のinstall()が先発のコールバックを上書きし、consume()は後発のものだけを呼ぶ", () => {
    const slot = new PendingCapture<number>();
    const first = vi.fn();
    const second = vi.fn();
    slot.install(first);
    slot.install(second);
    slot.consume(7);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledExactlyOnceWith(7);
  });

  test("releaseIfOwnedBy()は自分自身が設置したコールバックがまだそこにある場合のみ解放する", () => {
    const slot = new PendingCapture<number>();
    const callback = vi.fn();
    slot.install(callback);
    slot.releaseIfOwnedBy(callback);
    // 解放済みのため、consume()は何も呼ばない。
    slot.consume(1);
    expect(callback).not.toHaveBeenCalled();
  });

  // 本ラウンドの回帰対象：先発の呼び出し（A）が失敗して後始末を行う時点で、後発の呼び出し
  // （B）が既に自分自身のコールバックへ上書きしていた場合、Aの後始末はBのコールバックを
  // 誤って解放してはならない。
  test("releaseIfOwnedBy()は既に別のコールバックへ差し替わっている場合は何もしない（先発Aの後始末が後発Bを誤って解放しない）", () => {
    const slot = new PendingCapture<number>();
    const captureA = vi.fn();
    const captureB = vi.fn();
    slot.install(captureA);
    slot.install(captureB); // Bが上書き（Aはまだ消費されていない）
    slot.releaseIfOwnedBy(captureA); // Aの後始末：Bを誤って解放してはならない
    // Bが依然として設置されたままであることをconsume()で確認する。
    slot.consume(99);
    expect(captureA).not.toHaveBeenCalled();
    expect(captureB).toHaveBeenCalledExactlyOnceWith(99);
  });

  test("releaseIfOwnedBy()は何も設置されていない場合は何もしない", () => {
    const slot = new PendingCapture<number>();
    const callback = vi.fn();
    expect(() => slot.releaseIfOwnedBy(callback)).not.toThrow();
  });

  test("releaseIfOwnedBy()は既に自分自身のコールバックがconsume()済みの場合は何もしない", () => {
    const slot = new PendingCapture<number>();
    const callback = vi.fn();
    slot.install(callback);
    slot.consume(1);
    // 既に消費済み（null）のため、この呼び出しは無害な no-op のはず。
    expect(() => slot.releaseIfOwnedBy(callback)).not.toThrow();
  });
});
