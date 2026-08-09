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
  buildSharePayload,
  parseSharePayload,
  buildShareUrl,
  extractShareParam,
  upsertFriend,
  removeFriend,
  listFriends,
  buildFullBackup,
  validateFullBackup,
  BACKUP_VERSION,
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

// --- Friend sharing ---------------------------------------------------

const SAMPLE_UUID = "b3b7f6a0-1c2d-4e5f-8a9b-0123456789ab";
const SAMPLE_UUID_2 = "11111111-2222-4333-8444-555555555555";

test("parseSharePayload round-trips through buildSharePayload", () => {
  const payload = { id: SAMPLE_UUID, exportedAt: "2026-08-09T12:00:00.000Z", state: { "iron-man": { watched: true, rating: "◎" } } };
  const raw = buildSharePayload(payload);
  assert.deepEqual(parseSharePayload(raw), payload);
});

test("parseSharePayload rejects malformed payloads", () => {
  assert.equal(parseSharePayload(""), null);
  assert.equal(parseSharePayload(null), null);
  assert.equal(parseSharePayload("not json"), null);
  assert.equal(parseSharePayload(JSON.stringify([1, 2, 3])), null);
  assert.equal(parseSharePayload(JSON.stringify({ exportedAt: "2026-08-09", state: {} })), null, "missing id");
  assert.equal(parseSharePayload(JSON.stringify({ id: "", exportedAt: "2026-08-09", state: {} })), null, "empty id");
  assert.equal(
    parseSharePayload(JSON.stringify({ id: SAMPLE_UUID, exportedAt: "not-a-date", state: {} })),
    null,
    "bad date"
  );
  assert.equal(
    parseSharePayload(JSON.stringify({ id: SAMPLE_UUID, exportedAt: "2026-08-09", state: { a: { watched: "yes" } } })),
    null,
    "malformed nested state is rejected (delegates to validateImportedState)"
  );
});

test("parseSharePayload rejects ids that aren't the generator's UUID format, including reserved/pathological values", () => {
  // Regression test (Codex review, PR #338): a crafted link with id:"self"
  // would collide with the app's own-profile sentinel, making the imported
  // friend's data unreachable through the profile switcher. "__proto__" and
  // "constructor" are rejected too since `friends[id]` on a plain object
  // would resolve to an inherited Object.prototype value instead of
  // undefined for those keys, corrupting the "does this friend already
  // exist" check in app.js.
  for (const badId of ["self", "__proto__", "constructor", "prototype", "not-a-uuid", "123", ""]) {
    assert.equal(
      parseSharePayload(JSON.stringify({ id: badId, exportedAt: "2026-08-09T00:00:00.000Z", state: {} })),
      null,
      `id "${badId}" must be rejected`
    );
  }
});

test("buildShareUrl / extractShareParam round-trip, including unicode names in state", () => {
  const payload = { id: SAMPLE_UUID_2, exportedAt: "2026-08-09T00:00:00.000Z", state: { "loki-s2": { watched: true, rating: "〇" } } };
  const url = buildShareUrl("https://honeypawlab.com/marvel-checklist/", payload);
  assert.ok(url.startsWith("https://honeypawlab.com/marvel-checklist/?share="));
  const extracted = extractShareParam(url);
  assert.deepEqual(parseSharePayload(extracted), payload);
});

test("upsertFriend adds/replaces an entry without mutating the input", () => {
  const friends = { a: { name: "Aさん", state: {}, exportedAt: "2026-01-01", importedAt: "2026-01-01" } };
  const updated = upsertFriend(friends, "b", { name: "Bさん", state: {}, exportedAt: "2026-02-01", importedAt: "2026-02-01" });
  assert.deepEqual(Object.keys(updated).sort(), ["a", "b"]);
  assert.ok(!("b" in friends), "original object is not mutated");
});

test("removeFriend removes only the targeted entry without mutating the input", () => {
  const friends = {
    a: { name: "A", state: {}, exportedAt: "x", importedAt: "x" },
    b: { name: "B", state: {}, exportedAt: "x", importedAt: "x" },
  };
  const updated = removeFriend(friends, "a");
  assert.deepEqual(Object.keys(updated), ["b"]);
  assert.ok("a" in friends, "original object is not mutated");
});

test("listFriends returns id-tagged entries sorted by name", () => {
  const friends = {
    z: { name: "ジロー", state: {}, exportedAt: "x", importedAt: "x" },
    a: { name: "アキラ", state: {}, exportedAt: "x", importedAt: "x" },
  };
  const list = listFriends(friends);
  assert.deepEqual(
    list.map((f) => f.id),
    ["a", "z"]
  );
  assert.equal(list[0].name, "アキラ");
});

// --- Full backup --------------------------------------------------------

test("validateFullBackup round-trips through buildFullBackup", () => {
  const backup = buildFullBackup({
    own: { "iron-man": { watched: true, rating: "◎" } },
    friends: { f1: { name: "友人A", state: { thor: { watched: false, rating: null } }, exportedAt: "2026-01-01T00:00:00.000Z", importedAt: "2026-01-02T00:00:00.000Z" } },
    shareId: "my-share-id",
    activeProfile: "f1",
  });
  assert.equal(backup.version, BACKUP_VERSION);
  assert.deepEqual(validateFullBackup(backup), {
    own: { "iron-man": { watched: true, rating: "◎" } },
    friends: { f1: { name: "友人A", state: { thor: { watched: false, rating: null } }, exportedAt: "2026-01-01T00:00:00.000Z", importedAt: "2026-01-02T00:00:00.000Z" } },
    shareId: "my-share-id",
    activeProfile: "f1",
  });
});

test("validateFullBackup treats a version-less payload as a legacy own-state-only export", () => {
  const legacy = { "iron-man": { watched: true, rating: "◎" } };
  assert.deepEqual(validateFullBackup(legacy), { own: legacy, friends: {}, shareId: null, activeProfile: "self" });
});

test("validateFullBackup rejects malformed backups, including a bad friend entry", () => {
  assert.equal(validateFullBackup(null), null);
  assert.equal(validateFullBackup([]), null);
  assert.equal(validateFullBackup({ version: 999, own: {} }), null, "unknown version");
  assert.equal(validateFullBackup({ version: BACKUP_VERSION, own: { a: { watched: "not-a-bool" } } }), null, "bad own state");
  assert.equal(
    validateFullBackup({
      version: BACKUP_VERSION,
      own: {},
      friends: { f1: { name: "", state: {}, exportedAt: "2026-01-01", importedAt: "2026-01-01" } },
    }),
    null,
    "blank friend name"
  );
  assert.equal(
    validateFullBackup({
      version: BACKUP_VERSION,
      own: {},
      friends: { f1: { name: "友人", state: { x: { watched: "nope" } }, exportedAt: "2026-01-01", importedAt: "2026-01-01" } },
    }),
    null,
    "malformed nested friend state"
  );
  assert.equal(
    validateFullBackup({
      version: BACKUP_VERSION,
      own: {},
      friends: { f1: { name: "友人", state: {}, exportedAt: "not-a-date", importedAt: "2026-01-01" } },
    }),
    null,
    "unparsable exportedAt"
  );
});

test("validateFullBackup defaults missing friends/shareId/activeProfile", () => {
  const result = validateFullBackup({ version: BACKUP_VERSION, own: {} });
  assert.deepEqual(result, { own: {}, friends: {}, shareId: null, activeProfile: "self" });
});
