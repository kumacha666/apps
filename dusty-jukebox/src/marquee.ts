// 長い名前の横スクロール（Android版と同じ考え方：枠に収まらない名前だけを、少し待ってから流し、3回で止める）。
// 一覧は1万行になりうるので、画面に見えている行だけを測って流す（IntersectionObserver）。
// 止まっている間・動きを減らす設定（prefers-reduced-motion）のときは、従来どおり「…」で省略する。

/** 流す速さ（px/秒）。Android版（Composeの`basicMarquee`の既定）と同じ。 */
export const MARQUEE_SPEED_PX_PER_SEC = 30;
/** 流し始める前と、流し終えた後に止まる時間。 */
export const MARQUEE_PAUSE_MS = 1200;
/** 流す回数（Android版の既定と同じ）。 */
export const MARQUEE_ITERATIONS = 3;
/** はみ出しがこれ以下なら流さない（端数の測定誤差で流れ出さないように）。 */
const MIN_OVERFLOW_PX = 2;

/** 流す必要がある要素の、1回分の動き。 */
export interface MarqueePlan {
  /** 1回分の長さ（止まる時間を含む）。 */
  durationMs: number;
  /** 動き（`offset`は0〜1の位置、`translateX`はpx）。止まる→流す→止まる、の順。 */
  keyframes: { offset: number; translateX: number }[];
}

/** 枠の幅と中身の幅から、流し方を決める。収まっていれば（流す必要が無ければ）null。 */
export function planMarquee(scrollWidth: number, clientWidth: number): MarqueePlan | null {
  if (!(clientWidth > 0)) return null; // まだ描かれていない・見えていない
  const overflow = Math.ceil(scrollWidth - clientWidth);
  if (!(overflow > MIN_OVERFLOW_PX)) return null;
  const travelMs = (overflow / MARQUEE_SPEED_PX_PER_SEC) * 1000;
  const durationMs = MARQUEE_PAUSE_MS + travelMs + MARQUEE_PAUSE_MS;
  return {
    durationMs,
    keyframes: [
      { offset: 0, translateX: 0 },
      { offset: MARQUEE_PAUSE_MS / durationMs, translateX: 0 },
      { offset: (MARQUEE_PAUSE_MS + travelMs) / durationMs, translateX: -overflow },
      { offset: 1, translateX: -overflow },
    ],
  };
}

/** 流す対象の要素に付けるクラス。中身は`MARQUEE_INNER_CLASS`の要素1つで包む（[marqueeText]）。 */
export const MARQUEE_CLASS = "mq";
const MARQUEE_INNER_CLASS = "mq-inner";
/** 流している間だけ付くクラス（「…」をやめ、中身を動かせる形にする）。 */
export const MARQUEE_ACTIVE_CLASS = "mq-on";

/** 文字を、流せる形（`.mq > .mq-inner`）で[target]に入れる。 */
export function marqueeText(target: HTMLElement, text: string): HTMLElement {
  target.classList.add(MARQUEE_CLASS);
  const inner = document.createElement("span");
  inner.className = MARQUEE_INNER_CLASS;
  inner.textContent = text;
  target.replaceChildren(inner);
  return target;
}

/**
 * ページ内の`.mq`要素を見張り、見えている間だけ流す。行が描き直されたら（`.mq`が足された）見張り直す。
 * 描き直しのたびに行を取り替える作りなので、見張り直すときは一度すべて外す（取り除かれた行を抱え込まない）。
 */
export function startMarquee(root: HTMLElement = document.body): void {
  if (typeof IntersectionObserver === "undefined" || typeof MutationObserver === "undefined") return;
  const reducedMotion = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
  const running = new WeakMap<Element, Animation>();

  const stop = (target: Element): void => {
    running.get(target)?.cancel();
    running.delete(target);
    target.classList.remove(MARQUEE_ACTIVE_CLASS);
  };
  const start = (target: Element): void => {
    stop(target);
    if (reducedMotion?.matches) return;
    const inner = target.firstElementChild as HTMLElement | null;
    if (!inner || typeof inner.animate !== "function") return;
    const plan = planMarquee(target.scrollWidth, target.clientWidth);
    if (!plan) return;
    target.classList.add(MARQUEE_ACTIVE_CLASS);
    const animation = inner.animate(
      plan.keyframes.map((k) => ({ offset: k.offset, transform: `translateX(${k.translateX}px)` })),
      { duration: plan.durationMs, iterations: MARQUEE_ITERATIONS },
    );
    running.set(target, animation);
    // 流し終えたら、止まった状態（「…」で省略）へ戻す
    animation.onfinish = () => { if (running.get(target) === animation) stop(target); };
  };

  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) start(entry.target);
      else stop(entry.target);
    }
  });
  let scheduled = false;
  const rescan = (): void => {
    scheduled = false;
    io.disconnect(); // 取り除かれた行の見張りも、ここで外れる
    for (const target of root.querySelectorAll(`.${MARQUEE_CLASS}`)) io.observe(target); // 見張り始めると、見えているものはすぐ通知が来る
  };
  const scheduleRescan = (): void => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(rescan);
  };
  // `.mq`を含む行が足されたときだけ見張り直す（再生位置の表示など、頻繁に書き換わる所では何もしない）
  new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node instanceof Element && (node.classList.contains(MARQUEE_CLASS) || node.querySelector(`.${MARQUEE_CLASS}`))) {
          scheduleRescan();
          return;
        }
      }
    }
  }).observe(root, { childList: true, subtree: true });
  // 画面の幅が変わったら、はみ出し方も変わるので測り直す
  let resizeTimer: ReturnType<typeof setTimeout> | undefined;
  addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(scheduleRescan, 200);
  });
  reducedMotion?.addEventListener?.("change", scheduleRescan);
  scheduleRescan();
}
