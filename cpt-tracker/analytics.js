// GA4（gtag.js）の薄いラッパー。測定IDが未設定・不正なら何もしない（画面の動作に一切影響させない）。
// 計測するのはページ表示とUI操作のみで、個人情報は送らない（選手名は公開情報）。

let enabled = false;

export function isValidMeasurementId(id) {
  return typeof id === "string" && /^G-[A-Z0-9]{6,}$/.test(id);
}

/** 測定IDが妥当ならgtag.jsを読み込んで計測を有効にする。有効にしたらtrue。 */
export function initAnalytics(id, win = globalThis.window, doc = globalThis.document) {
  if (enabled || !win || !doc || !isValidMeasurementId(id)) return enabled;
  try {
    win.dataLayer = win.dataLayer || [];
    win.gtag = function gtag() { win.dataLayer.push(arguments); };
    win.gtag("js", new Date());
    win.gtag("config", id);
    const s = doc.createElement("script");
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
    doc.head.appendChild(s);
    enabled = true;
  } catch {
    enabled = false;
  }
  return enabled;
}

/** カスタムイベントを送る。未初期化や失敗は黙って無視する。 */
export function track(name, params = {}, win = globalThis.window) {
  if (!enabled || !win || typeof win.gtag !== "function") return;
  try { win.gtag("event", name, params); } catch { /* 計測失敗は無視 */ }
}

/** テスト用: 状態を初期化 */
export function _resetAnalyticsForTest() { enabled = false; }
