import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LANGS, detectLang, t, placeLabel, dictKeys } from "../i18n.js";
import { phaseLabel, friendlyLiveError, changeEvents, recentResults, createChangeTracker } from "../logic.js";

const config = JSON.parse(readFileSync(new URL("../data/config.json", import.meta.url)));

test("辞書: 日本語と英語でキーが完全に揃っている（片方だけ訳し忘れない）", () => {
  const ja = dictKeys("ja").sort();
  const en = dictKeys("en").sort();
  assert.deepEqual(en, ja);
  assert.deepEqual(LANGS, ["ja", "en"]);
});

test("辞書: 置換される{名前}が両言語で一致する", () => {
  const vars = (s) => (typeof s === "string" ? [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",") : "");
  for (const k of dictKeys("ja")) {
    const jaV = t("ja", k);
    const enV = t("en", k);
    if (typeof jaV === "string") assert.equal(vars(enV), vars(jaV), `placeholder mismatch: ${k}`);
    else assert.equal(enV.length, jaV.length, `notes length mismatch: ${k}`);
  }
});

test("辞書: HTMLを含む文言は、リンクとタグの数が両言語で同じ", () => {
  const count = (s, re) => (s.match(re) || []).length;
  const html = [t("ja", "legal"), t("en", "legal"), ...t("ja", "notes"), ...t("en", "notes")];
  assert.equal(count(html[0], /<a /g), count(html[1], /<a /g));
  assert.equal(count(html[0], /<br>/g), count(html[1], /<br>/g));
  t("ja", "notes").forEach((jaLi, i) => {
    const enLi = t("en", "notes")[i];
    for (const re of [/<a /g, /<b>/g, /<i>/g]) assert.equal(count(enLi, re), count(jaLi, re), `notes[${i}] ${re}`);
  });
});

test("detectLang: URL ＞ 保存済み ＞ ブラウザ言語（日本語以外は英語）", () => {
  assert.equal(detectLang({ search: "?lang=en", stored: "ja", navLang: "ja-JP" }), "en");
  assert.equal(detectLang({ search: "?lang=ja", stored: "en", navLang: "en-US" }), "ja");
  assert.equal(detectLang({ search: "", stored: "en", navLang: "ja-JP" }), "en");
  assert.equal(detectLang({ search: "", stored: null, navLang: "ja" }), "ja");
  assert.equal(detectLang({ search: "", stored: null, navLang: "fr-FR" }), "en");
  assert.equal(detectLang({ search: "?lang=xx", stored: "zz", navLang: "en-US" }), "en"); // 不正値は無視
  assert.equal(detectLang({}), "en");
});

test("t / placeLabel: 置換・未定義キー・順位の序数", () => {
  assert.equal(t("en", "stAlive", { n: 8 }), "8 alive");
  assert.equal(t("ja", "stAlive", { n: 8 }), "生存 8人");
  assert.equal(t("xx", "stAlive", { n: 1 }), "生存 1人"); // 未知の言語は日本語
  assert.equal(t("en", "noSuchKey"), "noSuchKey");
  assert.equal(placeLabel("ja", 9), "9位");
  const ord = [1, 2, 3, 4, 5, 7, 9, 11, 12, 13, 17, 21, 22, 23, 25, 33].map((n) => placeLabel("en", n));
  assert.deepEqual(ord, ["1st", "2nd", "3rd", "4th", "5th", "7th", "9th", "11th", "12th", "13th", "17th", "21st", "22nd", "23rd", "25th", "33rd"]);
});

test("logic.js の文言が言語で切り替わる（進行表示・エラー・速報・直近の出来事）", () => {
  const live = { eventState: "ACTIVE", phases: [{ name: "TOP 24", state: "COMPLETED" }, { name: "TOP 8", state: "CREATED" }] };
  assert.equal(phaseLabel(live), "TOP 8 開始前");
  assert.equal(phaseLabel(live, "en"), "TOP 8 not started");
  assert.equal(phaseLabel({ ...live, eventState: "COMPLETED" }, "en"), "Event finished");
  assert.equal(friendlyLiveError(true, "en").startsWith("Couldn't fetch"), true);
  assert.equal(friendlyLiveError(false), "データを一時的に取得できませんでした。自動で再試行します。");

  const p = { name: "X", evoState: "alive", placement: 7, points: 0, safety: "contested", qualifiedBy: null, manual: false };
  const out = { ...p, evoState: "final", points: 100, safety: "eliminated" };
  assert.deepEqual(changeEvents(p, out, "en"), ["X eliminated: 7th, 100 pts locked", "X is out of the points slots"]);
  assert.deepEqual(changeEvents(p, out), ["X 敗退 → 7位 100pt確定", "X ポイント枠は圏外確定"]);

  // 速報のフォールバックは、日本語と英語の両方の文言を持つ（言語を切り替えても出し直さなくてよい）
  const tr = createChangeTracker();
  const snap = (s) => new Map([["x", s]]);
  tr.update(snap(p), "t1");
  tr.update(snap(out), "t2");
  const ev = tr.update(snap(out), "t3");
  assert.equal(ev[0].text, "X 敗退 → 7位 100pt確定");
  assert.equal(ev[0].en, "X eliminated: 7th, 100 pts locked");

  const rlive = {
    eventState: "ACTIVE", aliveCount: 7, aliveIds: ["1"],
    standings: [{ id: 1, tag: "A", name: "A", placement: 5 }, { id: 3, tag: "C", name: "C", placement: 7 }],
    recentSets: [{ at: 100, round: "Losers Round 1", winnerId: "1", a: { id: "1", name: "T | A" }, b: { id: "3", name: "T | C" } }],
  };
  const en = recentResults(rlive, config.rules, 6, "en")[0];
  assert.equal(en.text, "A beat C");
  assert.equal(en.note, "C: 7th, 100 pts locked");
  const ja = recentResults(rlive, config.rules)[0];
  assert.equal(ja.text, "A が C に勝利");
  assert.equal(ja.note, "C 7位 100pt確定");
});
