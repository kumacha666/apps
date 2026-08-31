// SWからの問い合わせではトークン更新を発火しない。再生開始前にページ側の
// PlaybackController が確認済みのトークンだけを返し、ポップアップ競合を防ぐ。
export type GetCurrentAccessToken = () => string | null | Promise<string | null>;

export interface ServiceWorkerMessageTarget {
  addEventListener(type: "message", listener: (event: MessageEvent) => void): void;
}

export type StreamTokenRejectedHandler = (fileId: string, requestId: string) => void;
// The request identity is needed even when the page has no usable token: the
// Service Worker will return 401 and the page must correlate that response to
// the pending playback continuation.
export type StreamTokenIssuedHandler = (fileId: string, requestId: string, token: string | null, playbackGeneration: number) => void;

// Service Workerはトークンを保持しない。各ストリーム要求について、その要求元タブだけに
// MessageChannelで問い合わせ、現在有効なトークンをその場で返す。
export function registerStreamAuthResponder(
  serviceWorker: ServiceWorkerMessageTarget,
  getCurrentAccessToken: GetCurrentAccessToken,
  onTokenRejected: StreamTokenRejectedHandler = () => {},
  onTokenIssued: StreamTokenIssuedHandler = () => {}
): void {
  serviceWorker.addEventListener("message", (event) => {
    if (
      event.data?.type === "dusty-jukebox:stream-token-rejected" &&
      typeof event.data.fileId === "string" &&
      typeof event.data.requestId === "string"
    ) {
      onTokenRejected(event.data.fileId, event.data.requestId);
      return;
    }
    if (
      event.data?.type !== "dusty-jukebox:get-token" ||
      typeof event.data.fileId !== "string" ||
      typeof event.data.requestId !== "string" ||
      !Number.isInteger(event.data.playbackGeneration) ||
      !event.ports[0]
    ) return;

    void Promise.resolve(getCurrentAccessToken())
      .then((token) => {
        onTokenIssued(event.data.fileId, event.data.requestId, token, event.data.playbackGeneration);
        event.ports[0].postMessage({ token });
      })
      .catch(() => event.ports[0].postMessage({ token: null }));
  });
}
