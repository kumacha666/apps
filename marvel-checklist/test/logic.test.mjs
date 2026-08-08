import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseLocalDate,
  isReleased,
  daysUntil,
  formatMonth,
  computeProgress,
  filterByUniverse,
  filterUnwatched,
  groupMovies,
  validateImportedState,
  RATINGS,
} from "../logic.js";

const movies = [
  { id: "a", title: "A", releaseDate: "2020-01-01", universe: "mcu", group: "フェイズ1" },
  { id: "b", title: "B", releaseDate: "2021-06-15", universe: "mcu", group: "フェイズ1" },
  { id: "c", title: "C", releaseDate: "2022-03-10", universe: "sony", group: "旧三部作" },
  { id: "future", title: "Future", releaseDate: "2099-12-31", universe: "mcu", group: "フェイズ6" },
];

test("parseLocalDate builds a local-timezone date, not UTC", () => {
  const d = parseLocalDate("2026-12-18");
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 11);
  assert.equal(d.getDate(), 18);
});

test("isReleased treats the release day itself as released, regardless of local time-of-day", () => {
  const releaseDay = new Date(2026, 11, 18, 0, 5); // just after local midnight
  assert.equal(isReleased({ releaseDate: "2026-12-18" }, releaseDay), true);
  const dayBefore = new Date(2026, 11, 17, 23, 55);
  assert.equal(isReleased({ releaseDate: "2026-12-18" }, dayBefore), false);
});

test("daysUntil counts whole calendar days, ignoring time-of-day", () => {
  const now = new Date(2026, 7, 8, 23, 59);
  assert.equal(daysUntil("2026-08-10", now), 2);
  assert.equal(daysUntil("2026-08-08", now), 0);
  assert.equal(daysUntil("2026-08-07", now), -1);
});

test("formatMonth renders the year/month in Japanese without UTC drift", () => {
  assert.equal(formatMonth("2026-01-01"), "2026年1月");
});

test("computeProgress counts only released movies and ignores unrelated list narrowing", () => {
  const now = new Date(2023, 0, 1);
  const state = { a: { watched: true, rating: "◎" }, b: { watched: false, rating: null } };
  const progress = computeProgress(movies, state, now);
  // "future" (2099) is not released yet, so only a/b/c count toward the total.
  assert.equal(progress.total, 3);
  assert.equal(progress.watched, 1);
  assert.equal(progress.pct, 33);
});

test("computeProgress on an unwatched-only subset still reports the true watched count for that subset", () => {
  // Regression test for the "unwatched filter zeroes out progress" bug:
  // progress must be computed from the universe-filtered list, not the
  // unwatched-filtered display list, so callers must not accidentally feed
  // computeProgress the post-unwatched-filter array. Here we simulate the
  // *correct* call site behavior directly.
  const now = new Date(2023, 0, 1);
  const state = { a: { watched: true, rating: null }, b: { watched: false, rating: null } };
  const universeFiltered = filterByUniverse(movies, "mcu");
  const progress = computeProgress(universeFiltered, state, now);
  assert.equal(progress.watched, 1);
  assert.equal(progress.total, 2);
});

test("filterByUniverse", () => {
  assert.deepEqual(filterByUniverse(movies, "sony").map((m) => m.id), ["c"]);
  assert.equal(filterByUniverse(movies, "all").length, movies.length);
});

test("filterUnwatched excludes movies marked watched", () => {
  const state = { a: { watched: true, rating: null } };
  const result = filterUnwatched(movies, state);
  assert.ok(!result.some((m) => m.id === "a"));
  assert.equal(result.length, movies.length - 1);
});

test("groupMovies preserves first-appearance group order and buckets correctly", () => {
  const groups = groupMovies(movies);
  assert.deepEqual(
    groups.map((g) => g.title),
    ["フェイズ1", "旧三部作", "フェイズ6"]
  );
  assert.equal(groups[0].items.length, 2);
});

test("validateImportedState rejects arrays and non-objects", () => {
  assert.equal(validateImportedState([]), null);
  assert.equal(validateImportedState(null), null);
  assert.equal(validateImportedState("nope"), null);
  assert.equal(validateImportedState(42), null);
});

test("validateImportedState drops malformed entries and normalizes valid ones", () => {
  const result = validateImportedState({
    "iron-man": { watched: true, rating: "◎" },
    "bad-rating": { watched: true, rating: "invalid" },
    "not-an-object": "nope",
    "array-entry": [],
    "missing-fields": {},
  });
  assert.deepEqual(result["iron-man"], { watched: true, rating: "◎" });
  assert.deepEqual(result["bad-rating"], { watched: true, rating: null });
  assert.equal(result["not-an-object"], undefined);
  assert.equal(result["array-entry"], undefined);
  assert.deepEqual(result["missing-fields"], { watched: false, rating: null });
});

test("RATINGS exposes exactly the four supported symbols", () => {
  assert.deepEqual(RATINGS, ["◎", "〇", "△", "✕"]);
});
