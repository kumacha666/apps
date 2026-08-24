import { describe, expect, test, vi } from "vitest";
import { build410ResetExpected, commitInitialChangeReplay, handleTokenExpiryReset } from "./initialChangeReplay";

function makeOps() {
  const calls: string[] = [];
  return {
    calls,
    ops: {
      advanceStartPageToken: vi.fn(async () => { calls.push("advance"); return true; }),
      markInitialScanCompleted: vi.fn(async () => { calls.push("mark"); return true; }),
      clearScanRunId: vi.fn(async () => { calls.push("clear"); return true; }),
    },
  };
}

describe("commitInitialChangeReplay", () => {
  test("差分再生成功後にトークン更新、初回完了記録、ウォーターマーク消去の順で確定する", async () => {
    const { calls, ops } = makeOps();

    await expect(commitInitialChangeReplay(true, ops)).resolves.toBe(true);

    expect(calls).toEqual(["advance", "mark", "clear"]);
  });

  test("差分再生が未完了なら状態を一切進めず、次回の初回スキャン再開に委ねる", async () => {
    const { calls, ops } = makeOps();

    await expect(commitInitialChangeReplay(false, ops)).resolves.toBe(false);

    expect(calls).toEqual([]);
  });

  test("トークン更新に失敗した場合、完了記録とウォーターマーク消去を行わない", async () => {
    const { calls, ops } = makeOps();
    ops.advanceStartPageToken.mockImplementationOnce(async () => {
      calls.push("advance");
      throw new Error("token write failed");
    });

    await expect(commitInitialChangeReplay(true, ops)).rejects.toThrow("token write failed");

    expect(calls).toEqual(["advance"]);
  });

  test("初回完了記録に失敗した場合、ウォーターマークを消去しない", async () => {
    const { calls, ops } = makeOps();
    ops.markInitialScanCompleted.mockImplementationOnce(async () => {
      calls.push("mark");
      throw new Error("completion write failed");
    });

    await expect(commitInitialChangeReplay(true, ops)).rejects.toThrow("completion write failed");

    expect(calls).toEqual(["advance", "mark"]);
  });

  // 2026-08-24 Codexレビュー指摘：P1。所有権を失った実行（同じルート・同じ初期化未完了中に
  // 別デバイスが並行して初回スキャンを開始し、scanRunIdが不一致になったケース）では、
  // sync.ts側の条件付き書き込みが例外を投げず静かにfalseを返す。この場合に後続処理へ
  // 進んだり、無条件でtrueを返したりしないことを検証する。
  test("トークン更新が所有権喪失でfalseを返した場合、完了記録・ウォーターマーク消去へ進まずfalseを返す", async () => {
    const { calls, ops } = makeOps();
    ops.advanceStartPageToken.mockImplementationOnce(async () => {
      calls.push("advance");
      return false;
    });

    await expect(commitInitialChangeReplay(true, ops)).resolves.toBe(false);

    expect(calls).toEqual(["advance"]);
    expect(ops.markInitialScanCompleted).not.toHaveBeenCalled();
    expect(ops.clearScanRunId).not.toHaveBeenCalled();
  });

  test("初回完了記録が所有権喪失でfalseを返した場合、ウォーターマーク消去へ進まずfalseを返す", async () => {
    const { calls, ops } = makeOps();
    ops.markInitialScanCompleted.mockImplementationOnce(async () => {
      calls.push("mark");
      return false;
    });

    await expect(commitInitialChangeReplay(true, ops)).resolves.toBe(false);

    expect(calls).toEqual(["advance", "mark"]);
    expect(ops.clearScanRunId).not.toHaveBeenCalled();
  });

  test("ウォーターマーク消去が所有権喪失でfalseを返した場合、全体としてfalseを返す", async () => {
    const { calls, ops } = makeOps();
    ops.clearScanRunId.mockImplementationOnce(async () => {
      calls.push("clear");
      return false;
    });

    await expect(commitInitialChangeReplay(true, ops)).resolves.toBe(false);

    expect(calls).toEqual(["advance", "mark", "clear"]);
  });
});

// 2026-08-24 Codexレビュー指摘：P1。410 Gone復旧のresetForFullRescan呼び出しにscanRunIdを
// 渡し忘れても（scanRunIdは省略可能な引数のため）型検査は通過してしまい、所有権を失った初回
// 実行が別デバイスの正当な状態をリセットする回帰を検出できない。main.tsの410 catchから
// この判定ロジックを切り出し、初回再生ではscanRunIdあり・通常差分同期では従来どおり省略される
// ことをここで固定する。
describe("build410ResetExpected", () => {
  test("初回差分再生中（initialScanRunId指定）はscanRunIdを含める", () => {
    expect(build410ResetExpected("root1", "T0", "run-A")).toEqual({
      rootFolderId: "root1",
      startPageToken: "T0",
      scanRunId: "run-A",
    });
  });

  test("通常の差分同期（initialScanRunId省略）はscanRunIdを含めない", () => {
    expect(build410ResetExpected("root1", "T0")).toEqual({
      rootFolderId: "root1",
      startPageToken: "T0",
    });
    expect(build410ResetExpected("root1", "T0", undefined)).toEqual({
      rootFolderId: "root1",
      startPageToken: "T0",
    });
  });
});

// 2026-08-24 Codexレビュー指摘：P1。build410ResetExpectedを純粋関数として切り出しても、
// main.tsの410 catch自体が実際にこの関数を正しく呼んでいる（第3引数を渡し忘れていない）かは
// テストで担保されない、という新しい指摘。410 catch処理そのもの（handleTokenExpiryReset）を
// フェイクのresetForFullRescanで駆動し、初回モードではscanRunIdがresetForFullRescanまで
// 実際に届くこと・通常同期では省略されることを、この境界で直接検証する。
describe("handleTokenExpiryReset", () => {
  test("initialScanRunIdを指定した場合、resetForFullRescanにscanRunId込みのexpectedが渡る", async () => {
    const resetForFullRescan = vi.fn(async () => {});
    await handleTokenExpiryReset(
      { resetForFullRescan },
      { rootFolderId: "root1", startPageToken: "T0", initialScanRunId: "run-A" }
    );
    expect(resetForFullRescan).toHaveBeenCalledWith({
      rootFolderId: "root1",
      startPageToken: "T0",
      scanRunId: "run-A",
    });
  });

  test("initialScanRunIdを省略した場合、resetForFullRescanにscanRunIdを含めずに渡る", async () => {
    const resetForFullRescan = vi.fn(async () => {});
    await handleTokenExpiryReset({ resetForFullRescan }, { rootFolderId: "root1", startPageToken: "T0" });
    expect(resetForFullRescan).toHaveBeenCalledWith({
      rootFolderId: "root1",
      startPageToken: "T0",
    });
  });
});
