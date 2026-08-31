// SWからの問い合わせではトークン更新を発火しない。再生開始前にページ側の
// PlaybackController が確認済みのトークンだけを返し、ポップアップ競合を防ぐ。
export type GetCurrentAccessToken = () => string | null | Promise<string | null>;

export interface ServiceWorkerMessageTarget {
  addEventListener(type: "message", listener: (event: MessageEvent) => void): void;
}

export type StreamTokenRejectedHandler = (fileId: string) => void;

// Service Workerはトークンを保持しない。各ストリーム要求について、その要求元タブだけに
// MessageChannelで問い合わせ、現在有効なトークンをその場で返す。
export function registerStreamAuthResponder(
  serviceWorker: ServiceWorkerMessageTarget,
  getCurrentAccessToken: GetCurrentAccessToken,
  onTokenRejected: StreamTokenRejectedHandler = () => {}
): void {
  serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type === "dusty-jukebox:stream-token-rejected" && typeof event.data.fileId === "string") {
      onTokenRejected(event.data.fileId);
      return;
    }
    if (event.data?.type !== "dusty-jukebox:get-token" || !event.ports[0]) return;

    void Promise.resolve(getCurrentAccessToken())
      .then((token) => event.ports[0].postMessage({ token }))
      .catch(() => event.ports[0].postMessage({ token: null }));
  });
}
