/** タイトル画面で選べるラン長さ（通常クリアまでの層数）。2026-07-16追加：
 * 10層固定だとカードプール（9種）を一巡した程度でランが終わり、
 * 同じカードを重ねて育てる快感が本格化する前に終わってしまうという指摘を受けて選択式にした */
export const RUN_LENGTH_OPTIONS = [10, 15, 20] as const;

/** 通常クリア層数を超えて、プレイヤーが自分の意思でエンドレスに進んだ状態かどうか */
export function isEndless(round: number, finalRound: number): boolean {
  return round > finalRound;
}

export function roundLabel(round: number, finalRound: number): string {
  return round <= finalRound ? `${round} / ${finalRound}` : `${round}（エンドレス）`;
}
