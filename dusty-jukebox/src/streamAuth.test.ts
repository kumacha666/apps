import { describe, expect, test } from "vitest";
import { registerStreamAuthResponder, type ServiceWorkerMessageTarget } from "./streamAuth";

function createServiceWorkerTarget(): { target: ServiceWorkerMessageTarget; dispatch: (event: MessageEvent) => void } {
  let listener: ((event: MessageEvent) => void) | undefined;
  return {
    target: { addEventListener: (_type, nextListener) => { listener = nextListener; } },
    dispatch: (event) => listener?.(event),
  };
}

describe("registerStreamAuthResponder", () => {
  test("SWからのトークン要求へ、更新を発火しない現在のトークンを返す", async () => {
    const { target, dispatch } = createServiceWorkerTarget();
    const messages: unknown[] = [];
    const issued: unknown[] = [];
    registerStreamAuthResponder(target, async () => "access-token", () => {}, (...args) => issued.push(args));

    dispatch({ data: { type: "dusty-jukebox:get-token", fileId: "song-a", requestId: "request-a", playbackGeneration: 3 }, ports: [{ postMessage: (message: unknown) => messages.push(message) }] } as unknown as MessageEvent);
    await Promise.resolve();

    expect(messages).toEqual([{ token: "access-token" }]);
    expect(issued).toEqual([["song-a", "request-a", "access-token", 3]]);
  });

  test("有効なトークンが無い時はnullを返し、認証更新を試みない", async () => {
    const { target, dispatch } = createServiceWorkerTarget();
    const messages: unknown[] = [];
    const issued: unknown[] = [];
    registerStreamAuthResponder(target, () => null, () => {}, (...args) => issued.push(args));

    dispatch({ data: { type: "dusty-jukebox:get-token", fileId: "song-a", requestId: "request-a", playbackGeneration: 3 }, ports: [{ postMessage: (message: unknown) => messages.push(message) }] } as unknown as MessageEvent);
    await Promise.resolve();
    await Promise.resolve();

    expect(messages).toEqual([{ token: null }]);
    expect(issued).toEqual([["song-a", "request-a", null, 3]]);
  });

  test("SWが通知したDriveの401をページ側の無効化処理へ渡す", () => {
    const { target, dispatch } = createServiceWorkerTarget();
    const rejected: string[] = [];
    registerStreamAuthResponder(target, () => "access-token", (fileId) => rejected.push(fileId));

    dispatch({ data: { type: "dusty-jukebox:stream-token-rejected", fileId: "revoked-file", requestId: "request-a" }, ports: [] } as unknown as MessageEvent);

    expect(rejected).toEqual(["revoked-file"]);
  });
});
