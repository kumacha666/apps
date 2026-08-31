export interface PlaybackContinuation {
  fileId: string;
  generation: number;
  resume: (position: number) => Promise<boolean>;
  position: number;
}

// PlaybackController increments its generation before awaiting a token, while
// currentStreamGeneration still describes the old audio.src until that await
// completes. Never replace the predicted generation with that older stream.
export function continuationGeneration(
  predictedGeneration: number,
  streamGeneration: number | null
): number {
  return streamGeneration === predictedGeneration ? streamGeneration : predictedGeneration;
}

interface StreamTokenRequest {
  fileId: string;
  generation: number;
  token: string | null;
}

// Keeps the page-side identity of a stream request.  The Service Worker only
// returns the opaque request id, never the bearer token, when it reports a
// rejection.  A delayed rejection can therefore be accepted only while it
// still belongs to the active playback generation and current token.
export class PlaybackContinuationRegistry {
  private active: PlaybackContinuation | null = null;
  private readonly tokenRequests = new Map<string, StreamTokenRequest>();

  register(continuation: Omit<PlaybackContinuation, "position">): PlaybackContinuation {
    const active: PlaybackContinuation = { ...continuation, position: 0 };
    this.active = active;
    return active;
  }

  isCurrent(continuation: PlaybackContinuation): boolean {
    return this.active === continuation;
  }

  clear(): void {
    this.active = null;
  }

  recordTokenRequest(requestId: string, fileId: string, generation: number, token: string | null): void {
    this.tokenRequests.set(requestId, { fileId, generation, token });
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
    const active = this.active;
    if (!request || !active) return null;
    // A null current token can mean another 401 path already cleared the token;
    // only a different non-null token proves this request was superseded.
    if ((currentToken !== null && request.token !== currentToken) || request.fileId !== fileId) return null;
    if (active.fileId !== fileId || active.generation !== request.generation) return null;
    return active;
  }
}
