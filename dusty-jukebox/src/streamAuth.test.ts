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
  test("SWからのトークン要求へensureAccessToken()の結果を返す", async () => {
    const { target, dispatch } = createServiceWorkerTarget();
    const messages: unknown[] = [];
    registerStreamAuthResponder(target, async () => "access-token");

    dispatch({ data: { type: "dusty-jukebox:get-token" }, ports: [{ postMessage: (message: unknown) => messages.push(message) }] } as unknown as MessageEvent);
    await Promise.resolve();

    expect(messages).toEqual([{ token: "access-token" }]);
  });

  test("未ログイン等で取得できない時はnullを返す", async () => {
    const { target, dispatch } = createServiceWorkerTarget();
    const messages: unknown[] = [];
    registerStreamAuthResponder(target, async () => { throw new Error("not signed in"); });

    dispatch({ data: { type: "dusty-jukebox:get-token" }, ports: [{ postMessage: (message: unknown) => messages.push(message) }] } as unknown as MessageEvent);
    await Promise.resolve();
    await Promise.resolve();

    expect(messages).toEqual([{ token: null }]);
  });
});
