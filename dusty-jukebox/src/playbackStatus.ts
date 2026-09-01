export type PlaybackStatusEvent = "playing" | "pause";

export interface PlaybackStatusState {
  hasAuthenticationNotice: boolean;
  hasMediaError: boolean;
  hasEnded: boolean;
}

export function playbackStatusForEvent(
  eventType: PlaybackStatusEvent,
  state: PlaybackStatusState
): string | null {
  if (state.hasAuthenticationNotice || state.hasMediaError) return null;

  switch (eventType) {
    case "playing":
      return "再生中";
    case "pause":
      return state.hasEnded ? null : "一時停止中";
    default: {
      const exhaustiveCheck: never = eventType;
      return exhaustiveCheck;
    }
  }
}
