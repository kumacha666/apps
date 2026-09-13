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

// ページ側（main.tsが渡すgetCurrentAccessToken、実体はauth.getAccessToken()）が
// 現在保持している確認済みトークンを、問い合わせのたびにその場でそのまま返すだけで、
// これを契機にトークン更新は発火しない。Service Worker側は2026-09-13、
// (clientId, fileId, playbackGeneration)単位の上限付き・時間無制限ではない
// in-memoryキャッシュ（`sw.js`の`tokenCache`、LRUで上限32件）を持つようになり、
// 同じ3つ組への連続したストリーム要求はこの問い合わせをキャッシュヒット時はスキップする
// （Drive側の401でキャッシュは即座に破棄され、次の要求では改めてこの問い合わせが発生する。
// 詳細はdusty-jukebox/CLAUDE.mdのクロスフェード節・sw.jsのtokenCacheコメント参照）。
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
