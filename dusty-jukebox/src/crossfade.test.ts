import { describe, expect, it, vi } from "vitest";
import {
  CROSSFADE_DURATION_OPTIONS_SEC,
  DEFAULT_CROSSFADE_DURATION_SEC,
  crossfadeDurationMsForSeconds,
  crossfadeVolumes,
  isCrossfadeDurationSec,
  isPositionBuffered,
  runCrossfade,
  shouldBeginCrossfadeRamp,
  shouldStartCrossfadePreparation,
} from "./crossfade";

// 2026-09-11、ユーザー提案（クロスフェードON/OFFの隣に3/5/7/10秒から選べる設定を置く）による
// クロスフェード長の秒数選択式化。
describe("crossfadeDurationMsForSeconds", () => {
  it("秒数をms換算する（このテスト実行環境はVITE_E2E未設定＝本番相当のため、秒×1000）", () => {
    for (const sec of CROSSFADE_DURATION_OPTIONS_SEC) {
      expect(crossfadeDurationMsForSeconds(sec)).toBe(sec * 1000);
    }
  });

  it("既定値（3秒）は既存の固定値と一致する", () => {
    expect(crossfadeDurationMsForSeconds(DEFAULT_CROSSFADE_DURATION_SEC)).toBe(3000);
  });
});

describe("isCrossfadeDurationSec", () => {
  it("選択肢に含まれる値はtrue", () => {
    for (const sec of CROSSFADE_DURATION_OPTIONS_SEC) {
      expect(isCrossfadeDurationSec(sec)).toBe(true);
    }
  });

  it("選択肢に含まれない値（DOM改変等の想定外の状態）はfalse", () => {
    expect(isCrossfadeDurationSec(4)).toBe(false);
    expect(isCrossfadeDurationSec(0)).toBe(false);
    expect(isCrossfadeDurationSec(NaN)).toBe(false);
  });
});

describe("crossfadeVolumes", () => {
  it("進行度に応じて退場側/入場側の音量を線形に計算する", () => {
    expect(crossfadeVolumes(0)).toEqual({ outgoing: 1, incoming: 0 });
    expect(crossfadeVolumes(0.5)).toEqual({ outgoing: 0.5, incoming: 0.5 });
    expect(crossfadeVolumes(1)).toEqual({ outgoing: 0, incoming: 1 });
  });

  it("範囲外の進行度は0〜1へクランプする", () => {
    expect(crossfadeVolumes(-1)).toEqual({ outgoing: 1, incoming: 0 });
    expect(crossfadeVolumes(2)).toEqual({ outgoing: 0, incoming: 1 });
  });
});

describe("runCrossfade", () => {
  it("段階的に退場側を1→0、入場側を0→1へランプする", async () => {
    const outgoing = { volume: 1 };
    const incoming = { volume: 0 };
    const wait = vi.fn().mockResolvedValue(undefined);
    await runCrossfade(outgoing, incoming, 300, { steps: 3, wait });
    expect(wait).toHaveBeenCalledTimes(3);
    expect(outgoing.volume).toBe(0);
    expect(incoming.volume).toBe(1);
  });

  it("durationMsが0以下なら即座に完了値へ設定する", async () => {
    const outgoing = { volume: 1 };
    const incoming = { volume: 0 };
    await runCrossfade(outgoing, incoming, 0);
    expect(outgoing.volume).toBe(0);
    expect(incoming.volume).toBe(1);
  });

  it("isCancelledがtrueを返すと以後のvolume更新を中断する", async () => {
    const outgoing = { volume: 1 };
    const incoming = { volume: 0 };
    const wait = vi.fn().mockResolvedValue(undefined);
    let cancelled = false;
    await runCrossfade(outgoing, incoming, 400, {
      steps: 4,
      wait,
      isCancelled: () => cancelled,
    });
    // 全ステップ完了しているはず（キャンセルしていないため）。
    expect(outgoing.volume).toBe(0);
    // 途中でキャンセルした場合は、それ以降volumeが更新されないことを別途検証する。
    cancelled = false;
    const outgoing2 = { volume: 1 };
    const incoming2 = { volume: 0 };
    let callCount = 0;
    const cancelAfterTwoSteps = () => {
      callCount += 1;
      return callCount > 2;
    };
    await runCrossfade(outgoing2, incoming2, 400, { steps: 4, wait, isCancelled: cancelAfterTwoSteps });
    // 2ステップ分（0.5進行度）まで反映され、以降は更新されないため0.5のまま。
    expect(outgoing2.volume).toBe(0.5);
    expect(incoming2.volume).toBe(0.5);
  });

  // 2026-09-10、Codexレビュー指摘：P2。次の曲（incoming）自体がクロスフェード長より短く、
  // ランプ完了前に自然終了した場合、isCancelledと違い「完了扱い」として最終値まで進めてから
  // 終了する必要がある（isCancelledは中間値のまま放置するため、入場側が無音のまま残ってしまう）。
  it("shouldFinishEarlyがtrueを返すと直ちに完了値へ設定して終了する", async () => {
    const outgoing = { volume: 1 };
    const incoming = { volume: 0 };
    const wait = vi.fn().mockResolvedValue(undefined);
    let callCount = 0;
    const finishAfterTwoSteps = () => {
      callCount += 1;
      return callCount > 2;
    };
    await runCrossfade(outgoing, incoming, 400, { steps: 4, wait, shouldFinishEarly: finishAfterTwoSteps });
    // isCancelledとは異なり、中間値（0.5）ではなく完了値まで進んでいる。
    expect(outgoing.volume).toBe(0);
    expect(incoming.volume).toBe(1);
    // 3ステップ目でshouldFinishEarlyがtrueになり終了するため、4ステップ目のwaitは呼ばれない。
    expect(wait).toHaveBeenCalledTimes(3);
  });
});

// 2026-09-10、実機フィードバック（マージ後）による再設計：「開始判定」を「準備（第二audio
// 要素の接続確立）を始めるべきか」と「実際に音量ランプを開始してよいか」の2段階に分離した。
describe("shouldStartCrossfadePreparation", () => {
  const baseParams = {
    crossfadeEnabled: true,
    isPreparing: false,
    isCrossfading: false,
    hasNextSong: true,
    duration: 180,
    currentTime: 172,
    prepareThresholdMs: 8000,
    audioPaused: false,
    manualTransitionInFlight: false,
  };

  it("残り時間が準備しきい値以下ならtrue", () => {
    expect(shouldStartCrossfadePreparation(baseParams)).toBe(true);
  });

  it("残り時間が準備しきい値より長ければfalse", () => {
    expect(shouldStartCrossfadePreparation({ ...baseParams, currentTime: 100 })).toBe(false);
  });

  it("クロスフェードが無効ならfalse", () => {
    expect(shouldStartCrossfadePreparation({ ...baseParams, crossfadeEnabled: false })).toBe(false);
  });

  it("既に準備中ならfalse（多重起動防止）", () => {
    expect(shouldStartCrossfadePreparation({ ...baseParams, isPreparing: true })).toBe(false);
  });

  it("既にランプ中ならfalse（多重起動防止）", () => {
    expect(shouldStartCrossfadePreparation({ ...baseParams, isCrossfading: true })).toBe(false);
  });

  it("次の曲が無ければfalse", () => {
    expect(shouldStartCrossfadePreparation({ ...baseParams, hasNextSong: false })).toBe(false);
  });

  it("durationがNaN/Infinity/0以下（メタデータ未確定）ならfalse", () => {
    expect(shouldStartCrossfadePreparation({ ...baseParams, duration: NaN })).toBe(false);
    expect(shouldStartCrossfadePreparation({ ...baseParams, duration: Infinity })).toBe(false);
    expect(shouldStartCrossfadePreparation({ ...baseParams, duration: 0 })).toBe(false);
  });

  it("既に曲の末尾を過ぎている（残り時間が0以下）場合はfalse", () => {
    expect(shouldStartCrossfadePreparation({ ...baseParams, currentTime: 181 })).toBe(false);
  });

  it("主audio要素が一時停止中ならfalse", () => {
    expect(shouldStartCrossfadePreparation({ ...baseParams, audioPaused: true })).toBe(false);
  });

  it("明示的な手動遷移（フェード待機中を含む）が進行中ならfalse", () => {
    expect(shouldStartCrossfadePreparation({ ...baseParams, manualTransitionInFlight: true })).toBe(false);
  });
});

describe("shouldBeginCrossfadeRamp", () => {
  const baseParams = {
    crossfadeEnabled: true,
    isPreparing: true,
    isCrossfading: false,
    hasNextSong: true,
    duration: 180,
    currentTime: 178,
    crossfadeDurationMs: 3000,
    audioPaused: false,
    audioEnded: false,
    manualTransitionInFlight: false,
    previewReady: true,
  };

  it("残り時間がクロスフェード長以下ならtrue", () => {
    expect(shouldBeginCrossfadeRamp(baseParams)).toBe(true);
  });

  it("残り時間がクロスフェード長より長ければfalse（準備は完了済みだがまだランプは始めない）", () => {
    expect(shouldBeginCrossfadeRamp({ ...baseParams, currentTime: 100 })).toBe(false);
  });

  it("まだ準備中でなければfalse", () => {
    expect(shouldBeginCrossfadeRamp({ ...baseParams, isPreparing: false })).toBe(false);
  });

  it("クロスフェードが無効ならfalse", () => {
    expect(shouldBeginCrossfadeRamp({ ...baseParams, crossfadeEnabled: false })).toBe(false);
  });

  it("既にランプ中ならfalse（多重起動防止）", () => {
    expect(shouldBeginCrossfadeRamp({ ...baseParams, isCrossfading: true })).toBe(false);
  });

  it("次の曲が無ければfalse", () => {
    expect(shouldBeginCrossfadeRamp({ ...baseParams, hasNextSong: false })).toBe(false);
  });

  it("明示的な手動遷移が進行中ならfalse", () => {
    expect(shouldBeginCrossfadeRamp({ ...baseParams, manualTransitionInFlight: true })).toBe(false);
  });

  // 2026-09-10、実機フィードバックによる再設計時に追加：接続確立が長引き、準備中のうちに
  // 退場側が先に自然終了してしまった場合、audioPausedはended時ネイティブにtrueになるが、
  // それに関わらず直ちにランプを開始すべき（そうしないと準備済みのまま永久に取り残される）。
  it("退場側が既に自然終了していれば、一時停止中の判定より優先してtrue", () => {
    expect(shouldBeginCrossfadeRamp({ ...baseParams, audioEnded: true, audioPaused: true, currentTime: 180 })).toBe(true);
  });

  it("自然終了していない場合、主audio要素が一時停止中ならfalse", () => {
    expect(shouldBeginCrossfadeRamp({ ...baseParams, audioPaused: true })).toBe(false);
  });

  it("durationがNaN/Infinity/0以下（メタデータ未確定）で、自然終了もしていなければfalse", () => {
    expect(shouldBeginCrossfadeRamp({ ...baseParams, duration: NaN })).toBe(false);
    expect(shouldBeginCrossfadeRamp({ ...baseParams, duration: Infinity })).toBe(false);
    expect(shouldBeginCrossfadeRamp({ ...baseParams, duration: 0 })).toBe(false);
  });

  // 2026-09-10、ChatGPTレビュー指摘：P1（Finding 2）。第二audio要素の先読み再生がまだ実際に
  // 開始していない（play()未解決）間は、通常の残り時間トリガーはもちろん、退場側の自然終了
  // バイパスであってもランプを始めてはならない（未確立のままハンドオフする不具合の再現を防ぐ）。
  it("先読み再生がまだ準備完了していなければfalse（残り時間が閾値以内でも）", () => {
    expect(shouldBeginCrossfadeRamp({ ...baseParams, previewReady: false })).toBe(false);
  });

  it("先読み再生がまだ準備完了していなければfalse（退場側が既に自然終了していても）", () => {
    expect(
      shouldBeginCrossfadeRamp({ ...baseParams, previewReady: false, audioEnded: true, audioPaused: true, currentTime: 180 })
    ).toBe(false);
  });
});

// 2026-09-11、実機フィードバック「クロスフェードで曲が切り替わった瞬間に一瞬音飛みする」。
// finishCrossfadeHandoff()のハンドオフ最終位置合わせが、まだバッファされていない位置への
// 再シーク（＝新しいRange要求を伴いうる）を無条件に行っていたことが原因。
describe("isPositionBuffered", () => {
  function ranges(pairs: [number, number][]) {
    return {
      length: pairs.length,
      start: (i: number) => pairs[i][0],
      end: (i: number) => pairs[i][1],
    };
  }

  it("バッファ範囲内の位置はtrue", () => {
    expect(isPositionBuffered(ranges([[0, 10]]), 5)).toBe(true);
  });

  it("バッファ範囲外の位置はfalse", () => {
    expect(isPositionBuffered(ranges([[0, 10]]), 15)).toBe(false);
  });

  it("複数のバッファ範囲のうち、いずれかに含まれていればtrue", () => {
    const buffered = ranges([
      [0, 5],
      [20, 30],
    ]);
    expect(isPositionBuffered(buffered, 25)).toBe(true);
    expect(isPositionBuffered(buffered, 10)).toBe(false);
  });

  it("バッファ範囲が無い（length: 0）場合は常にfalse", () => {
    expect(isPositionBuffered(ranges([]), 0)).toBe(false);
  });

  it("境界付近は許容誤差（既定0.25秒）内ならtrue", () => {
    const buffered = ranges([[0, 10]]);
    expect(isPositionBuffered(buffered, 10.2)).toBe(true);
    expect(isPositionBuffered(buffered, 10.3)).toBe(false);
  });

  it("許容誤差を明示的に指定できる", () => {
    const buffered = ranges([[0, 10]]);
    expect(isPositionBuffered(buffered, 10.05, 0)).toBe(false);
    expect(isPositionBuffered(buffered, 10, 0)).toBe(true);
  });
});
