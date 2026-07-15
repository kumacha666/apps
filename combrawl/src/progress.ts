import { FINAL_ROUND } from "./data/enemies";

/** 10層クリア後、プレイヤーが自分の意思でエンドレスに進んだ状態かどうか */
export function isEndless(round: number): boolean {
  return round > FINAL_ROUND;
}

export function roundLabel(round: number): string {
  return round <= FINAL_ROUND ? `${round} / ${FINAL_ROUND}` : `${round}（エンドレス）`;
}
