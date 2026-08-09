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
  filterByRating,
  groupMovies,
  validateImportedState,
  RATINGS,
  UNRATED_FILTER,
  RATING_FILTER_OPTIONS,
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

test("filterByRating with no active filters returns everything unchanged", () => {
  assert.deepEqual(filterByRating(movies, {}, []), movies);
  assert.deepEqual(filterByRating(movies, {}, null), movies);
});

test("filterByRating matches any of multiple selected ratings (OR, not AND)", () => {
  const state = {
    a: { watched: false, rating: "◎" },
    b: { watched: false, rating: "〇" },
    c: { watched: false, rating: "△" },
  };
  const result = filterByRating(movies, state, ["◎", "〇"]);
  assert.deepEqual(
    result.map((m) => m.id),
    ["a", "b"]
  );
});

test("filterByRating treats a null rating as UNRATED_FILTER", () => {
  const state = { a: { watched: false, rating: "◎" } };
  // b, c, future all have no state entry at all -> getEntry defaults rating to null
  const result = filterByRating(movies, state, [UNRATED_FILTER]);
  assert.deepEqual(
    result.map((m) => m.id),
    ["b", "c", "future"]
  );
});

test("RATING_FILTER_OPTIONS is RATINGS plus the unrated sentinel, in order", () => {
  assert.deepEqual(RATING_FILTER_OPTIONS, ["◎", "〇", "△", "✕", UNRATED_FILTER]);
});

test("groupMovies preserves first-appearance group order and buckets correctly", () => {
  const groups = groupMovies(movies);
  assert.deepEqual(
    groups.map((g) => g.title),
    ["フェイズ1", "旧三部作", "フェイズ6"]
  );
  assert.equal(groups[0].items.length, 2);
});

test("groupMovies keeps group order stable across a display-only filter, using orderSource", () => {
  // Regression test mirroring the real bug: movies.json lists all MCU
  // *movies* first (establishing early group ranks for フェイズ1/フェイズ4),
  // then Sony, then the MCU *series* entries appended at the very end. As
  // long as a group's "anchor" movie is present, its rank looks fine — but
  // once that anchor is filtered out (e.g. marked watched) while only its
  // late-positioned series sibling remains, the OLD implementation (which
  // derived group order from the filtered list's own first-appearance)
  // would push フェイズ4 after ソニー, since the series entry physically
  // sits after the Sony movie in the source array.
  const orderSource = [
    { id: "mcu-phase1-movie", title: "Phase1 Movie", releaseDate: "2008-01-01", universe: "mcu", group: "フェイズ1" },
    { id: "mcu-phase4-anchor-movie", title: "Phase4 Anchor Movie", releaseDate: "2021-07-01", universe: "mcu", group: "フェイズ4" },
    { id: "sony-movie", title: "Sony Movie", releaseDate: "2002-01-01", universe: "sony", group: "旧三部作" },
    { id: "mcu-phase4-series", title: "Phase4 Series S1", releaseDate: "2021-01-01", universe: "mcu", group: "フェイズ4" },
  ];
  // Simulate "unwatched only": both MCU movies (フェイズ1 and the フェイズ4
  // anchor) were watched and filtered out, leaving only Sony's movie and
  // the フェイズ4 series unwatched.
  const displayList = orderSource.filter(
    (m) => m.id !== "mcu-phase1-movie" && m.id !== "mcu-phase4-anchor-movie"
  );

  const buggyGroupOrder = groupMovies(displayList); // orderSource defaults to displayList itself
  assert.deepEqual(
    buggyGroupOrder.map((g) => g.title),
    ["旧三部作", "フェイズ4"],
    "sanity check: without a stable orderSource, フェイズ4 does drift after 旧三部作"
  );

  const fixedGroupOrder = groupMovies(displayList, orderSource);
  assert.deepEqual(
    fixedGroupOrder.map((g) => g.title),
    ["フェイズ4", "旧三部作"],
    "with orderSource, フェイズ4 keeps its rank from the stable universe list"
  );
});

test("groupMovies sorts each group's items by release date, independent of input order", () => {
  // A movie and a TV series can share a phase group but be added to
  // movies.json in any order; display order must still follow release date.
  const outOfOrder = [
    { id: "later-series", title: "Later Series S1", releaseDate: "2022-06-01", universe: "mcu", group: "フェイズ4", type: "series" },
    { id: "earliest-movie", title: "Earliest Movie", releaseDate: "2021-01-01", universe: "mcu", group: "フェイズ4", type: "movie" },
    { id: "middle-series", title: "Middle Series S1", releaseDate: "2021-06-01", universe: "mcu", group: "フェイズ4", type: "series" },
  ];
  const groups = groupMovies(outOfOrder);
  assert.deepEqual(
    groups[0].items.map((m) => m.id),
    ["earliest-movie", "middle-series", "later-series"]
  );
});

test("validateImportedState rejects arrays and non-objects", () => {
  assert.equal(validateImportedState([]), null);
  assert.equal(validateImportedState(null), null);
  assert.equal(validateImportedState("nope"), null);
  assert.equal(validateImportedState(42), null);
});

test("validateImportedState normalizes a fully well-formed payload", () => {
  const result = validateImportedState({
    "iron-man": { watched: true, rating: "◎" },
    "thor": { watched: false, rating: null },
    "no-rating-field": { watched: true },
  });
  assert.deepEqual(result["iron-man"], { watched: true, rating: "◎" });
  assert.deepEqual(result["thor"], { watched: false, rating: null });
  assert.deepEqual(result["no-rating-field"], { watched: true, rating: null });
});

test("validateImportedState rejects the whole payload if any single entry is malformed", () => {
  // Regression test: an unrelated object like {"foo":"bar"} must not be
  // silently accepted as an empty-but-valid backup — that would replace the
  // user's real watch/rating data with nothing on import.
  assert.equal(validateImportedState({ foo: "bar" }), null);
  assert.equal(
    validateImportedState({ "iron-man": { watched: true, rating: "◎" }, "bad-rating": { watched: true, rating: "invalid" } }),
    null
  );
  assert.equal(validateImportedState({ "not-an-object": "nope" }), null);
  assert.equal(validateImportedState({ "array-entry": [] }), null);
  assert.equal(validateImportedState({ "missing-watched": { rating: "◎" } }), null);
});

test("RATINGS exposes exactly the four supported symbols", () => {
  assert.deepEqual(RATINGS, ["◎", "〇", "△", "✕"]);
});
