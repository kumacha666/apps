import test from "node:test";
import assert from "node:assert/strict";
import { initAnalytics, track, isValidMeasurementId, _resetAnalyticsForTest } from "../analytics.js";

function fakeEnv() {
  const appended = [];
  const win = {};
  const doc = { createElement: () => ({}), head: { appendChild: (el) => appended.push(el) } };
  return { win, doc, appended };
}

test("測定IDの形式チェック", () => {
  assert.equal(isValidMeasurementId("G-Q962ZC0PJH"), true);
  for (const bad of ["", null, undefined, "UA-12345-1", "G-", "G-abc", "G-Q96 2ZC0PJH", "G-Q962ZC0PJH<script>"]) {
    assert.equal(isValidMeasurementId(bad), false, String(bad));
  }
});

test("未設定・不正なIDでは何も読み込まず、trackも何もしない", () => {
  _resetAnalyticsForTest();
  const e = fakeEnv();
  assert.equal(initAnalytics("", e.win, e.doc), false);
  assert.equal(initAnalytics("G-bad", e.win, e.doc), false);
  assert.equal(e.appended.length, 0);
  assert.equal(e.win.dataLayer, undefined);
  track("x", {}, e.win); // 例外を出さない
});

test("妥当なIDならgtag.jsを1回だけ読み込み、configとイベントをdataLayerへ積む", () => {
  _resetAnalyticsForTest();
  const e = fakeEnv();
  assert.equal(initAnalytics("G-Q962ZC0PJH", e.win, e.doc), true);
  assert.equal(initAnalytics("G-Q962ZC0PJH", e.win, e.doc), true); // 二重初期化しても読み込みは1回
  assert.equal(e.appended.length, 1);
  assert.match(e.appended[0].src, /googletagmanager\.com\/gtag\/js\?id=G-Q962ZC0PJH$/);
  track("view_change", { view: "floor" }, e.win);
  const events = e.win.dataLayer.map((a) => Array.from(a));
  assert.deepEqual(events.map((a) => a[0]), ["js", "config", "event"]);
  assert.deepEqual(events[1].slice(1), ["G-Q962ZC0PJH"]);
  assert.deepEqual(events[2].slice(1), ["view_change", { view: "floor" }]);
});

test("gtagが例外を投げても呼び出し側には伝えない", () => {
  _resetAnalyticsForTest();
  const e = fakeEnv();
  initAnalytics("G-Q962ZC0PJH", e.win, e.doc);
  e.win.gtag = () => { throw new Error("blocked"); };
  assert.doesNotThrow(() => track("x", {}, e.win));
});
