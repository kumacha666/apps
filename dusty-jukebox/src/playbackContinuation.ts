export interface PlaybackContinuation {
  fileId: string;
  streamId: number;
  resume: (position: number) => Promise<boolean>;
  position: number;
}

interface StreamTokenRequest {
  fileId: string;
  streamId: number;
  token: string | null;
}

// ロールスワップ再設計（2026-09-14〜、PR2）：以前は「現在アクティブな継続は常に1件」という
// 前提で単一フィールド（active）を持っていたが、A/B2つのPlaybackControllerが同時に
// ストリーミングしうる設計では、この前提は成り立たない（例：Aが再生中のままBが先読み中に
// Bだけが401を受ける、といったケースを正しく扱えない）。streamId（SW送信URLの
// playbackGeneration、createSharedStreamIdAllocator()で発行される限りA/B間で衝突しない一意な
// 値）をキーとするMapへ変更した。これにより「どちらのスロットの要求か」を、その時点の
// active/inactiveポインタで推測するのではなく、要求自身が持つstreamIdから直接・一意に
// ルーティングできる（ChatGPTレビュー指摘）。
//
// 旧`continuationGeneration()`（「predicted generation」をplay()呼び出し直後の
// currentStreamGeneration()で補正する関数）は廃止した。この補正は「play()呼び出し直後、まだ
// 最初のawaitを終える前のタイミングでは、streamGenerationはまだ古いストリームを指したまま」
// という事実（play()内部でtoken確認等のawaitを経てからstreamIdを確定するため）を前提にした
// 苦肉の策で、単一コントローラ・単一allocator（allocateStreamId未指定時の既定
// `() => this.generation`）でしか正しく機能しない。共有stream-idアロケータをA/B両方で使う
// PR2以降は、`this.generation`から次のstream-idを予測する設計そのものを廃止し、
// PlaybackController.play()がstream-idを実際に確定した瞬間（audio.src設定より前）に
// `PlayOptions.onStreamIdAllocated`コールバックで通知される正確な値をそのまま使う
// （playback.ts参照）。
export class PlaybackContinuationRegistry {
  private readonly continuations = new Map<number, PlaybackContinuation>();
  private readonly tokenRequests = new Map<string, StreamTokenRequest>();

  register(continuation: Omit<PlaybackContinuation, "position">): PlaybackContinuation {
    const full: PlaybackContinuation = { ...continuation, position: 0 };
    this.continuations.set(continuation.streamId, full);
    return full;
  }

  isCurrent(continuation: PlaybackContinuation): boolean {
    return this.continuations.get(continuation.streamId) === continuation;
  }

  // 特定のstreamIdの継続だけを無効化する。呼び出し元がそのstreamIdの遷移が打ち切られた
  // （本物の割り込みで置き換えられた）ことを知っている場合に使う。他のstreamId（例：もう
  // 一方のスロットの継続）には一切影響しない。
  clearStreamId(streamId: number): void {
    this.continuations.delete(streamId);
  }

  recordTokenRequest(requestId: string, fileId: string, streamId: number, token: string | null): void {
    this.tokenRequests.set(requestId, { fileId, streamId, token });
    // Range requests can be numerous for long tracks. Keep only the recent
    // bounded history needed to correlate a late 401.
    while (this.tokenRequests.size > 32) {
      const oldest = this.tokenRequests.keys().next().value;
      if (typeof oldest !== "string") break;
      this.tokenRequests.delete(oldest);
    }
  }

  acceptTokenRejection(
    requestId: string,
    fileId: string,
    currentToken: string | null
  ): PlaybackContinuation | null {
    const request = this.tokenRequests.get(requestId);
    this.tokenRequests.delete(requestId);
    if (!request) return null;
    // A null current token can mean another 401 path already cleared the token;
    // only a different non-null token proves this request was superseded.
    if ((currentToken !== null && request.token !== currentToken) || request.fileId !== fileId) return null;
    const continuation = this.continuations.get(request.streamId);
    if (!continuation || continuation.fileId !== fileId) return null;
    return continuation;
  }
}
