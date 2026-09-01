export type PlaybackStatusEvent = "play" | "pause";

export function playbackStatusForEvent(eventType: PlaybackStatusEvent): string {
  switch (eventType) {
    case "play":
      return "再生中";
    case "pause":
      return "一時停止中";
    default: {
      const exhaustiveCheck: never = eventType;
      return exhaustiveCheck;
    }
  }
}
