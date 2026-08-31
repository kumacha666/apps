import { describe, expect, test } from "vitest";
import { PlaybackAuthenticationGate } from "./playbackAuthGate";

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  return { promise: new Promise<void>((nextResolve) => { resolve = nextResolve; }), resolve };
}

describe("PlaybackAuthenticationGate", () => {
  test("失効検知時点では認証更新を開始せず、明示的な続行操作でだけ開始する", async () => {
    let refreshCount = 0;
    let resumed = 0;
    const gate = new PlaybackAuthenticationGate(async () => { refreshCount += 1; });

    gate.defer(async () => { resumed += 1; });
    expect(refreshCount).toBe(0);
    expect(resumed).toBe(0);

    await gate.continueFromUserGesture();
    expect(refreshCount).toBe(1);
    expect(resumed).toBe(1);
    expect(gate.hasPendingOperation()).toBe(false);
  });

  test("複数の続行クリックは一つの認証更新に合流し、最後の再生操作だけを続行する", async () => {
    const refresh = deferred();
    let refreshCount = 0;
    const resumed: string[] = [];
    const gate = new PlaybackAuthenticationGate(async () => {
      refreshCount += 1;
      await refresh.promise;
    });

    gate.defer(async () => { resumed.push("first"); });
    const firstClick = gate.continueFromUserGesture();
    gate.defer(async () => { resumed.push("latest"); });
    const secondClick = gate.continueFromUserGesture();
    expect(refreshCount).toBe(1);

    refresh.resolve();
    await Promise.all([firstClick, secondClick]);
    expect(refreshCount).toBe(1);
    expect(resumed).toEqual(["latest"]);
  });

  test("新しい再生が成功したら古い保留操作を破棄できる", async () => {
    const resumed: string[] = [];
    const gate = new PlaybackAuthenticationGate(async () => {});

    gate.defer(async () => { resumed.push("old"); });
    gate.clear();
    await gate.continueFromUserGesture();

    expect(resumed).toEqual([]);
    expect(gate.hasPendingOperation()).toBe(false);
  });
});
