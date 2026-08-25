export type EnsureAccessToken = () => Promise<string>;

export interface ServiceWorkerMessageTarget {
  addEventListener(type: "message", listener: (event: MessageEvent) => void): void;
}

// Service Workerはトークンを保持しない。各ストリーム要求について、その要求元タブだけに
// MessageChannelで問い合わせ、現在有効なトークンをその場で返す。
export function registerStreamAuthResponder(
  serviceWorker: ServiceWorkerMessageTarget,
  ensureAccessToken: EnsureAccessToken
): void {
  serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type !== "dusty-jukebox:get-token" || !event.ports[0]) return;

    void ensureAccessToken()
      .then((token) => event.ports[0].postMessage({ token }))
      .catch(() => event.ports[0].postMessage({ token: null }));
  });
}
