export const RATINGS = ["◎", "〇", "△", "✕"];
// Sentinel used in rating-filter selections to mean "no rating set yet".
// Never stored in state — entry.rating uses `null` for that; this is purely
// a UI-facing filter token so RATING_FILTER_OPTIONS can be a flat array.
export const UNRATED_FILTER = "unrated";
export const RATING_FILTER_OPTIONS = [...RATINGS, UNRATED_FILTER];
export const UNIVERSE_LABELS = { mcu: "MCU", sony: "ソニー", fox: "フォックス", other: "その他" };
export const DOOMSDAY_ID = "avengers-doomsday";

const VALID_RATINGS = new Set(RATINGS);

export function parseLocalDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function isReleased(movie, now = new Date()) {
  return parseLocalDate(movie.releaseDate) <= startOfDay(now);
}

export function daysUntil(dateStr, now = new Date()) {
  const target = parseLocalDate(dateStr);
  const today = startOfDay(now);
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

export function formatMonth(dateStr) {
  const d = parseLocalDate(dateStr);
  return `${d.getFullYear()}年${d.getMonth() + 1}月`;
}

export function getEntry(state, id) {
  return state[id] || { watched: false, rating: null };
}

export function computeProgress(movies, state, now = new Date()) {
  const released = movies.filter((m) => isReleased(m, now));
  const watchedCount = released.filter((m) => getEntry(state, m.id).watched).length;
  const total = released.length;
  const pct = total > 0 ? Math.round((watchedCount / total) * 100) : 0;
  return { total, watched: watchedCount, pct };
}

export function filterByUniverse(movies, universe) {
  if (universe === "all") return movies;
  return movies.filter((m) => m.universe === universe);
}

export function filterUnwatched(movies, state) {
  return movies.filter((m) => !getEntry(state, m.id).watched);
}

// `activeRatings` is a Set (or array) of RATINGS symbols and/or
// UNRATED_FILTER. Empty/falsy means "no rating filter applied" — return
// everything. A movie matches if its rating (or the UNRATED_FILTER
// sentinel, for unrated movies) is present in `activeRatings` — i.e.
// selecting multiple ratings is an OR, matching the "◎ and 〇 at once"
// requirement. Accepts a Set directly (as app.js's `activeRatingFilters`
// already is) to avoid a pointless Set→Array→Set round-trip on every render.
export function filterByRating(movies, state, activeRatings) {
  if (!activeRatings) return movies;
  const set = activeRatings instanceof Set ? activeRatings : new Set(activeRatings);
  if (set.size === 0) return movies;
  return movies.filter((m) => {
    const rating = getEntry(state, m.id).rating;
    return rating === null ? set.has(UNRATED_FILTER) : set.has(rating);
  });
}

// Buckets `list` by `group`, then sorts each bucket by release date (so
// movies and TV series sharing a phase group display in true chronological
// order regardless of where each entry sits in the source data file).
//
// Group *order* is derived from `orderSource` (defaults to `list` itself)
// rather than from `list`'s own first-appearance order. This matters
// because `list` is often a further-filtered view (e.g. "unwatched only")
// of a larger set: if group order tracked that filtered list directly, a
// group's position could jump around the page every time its watched items
// got hidden and a different group's item happened to lead. Callers that
// apply a display-only filter on top of a stable subset (e.g. universe
// selection) should pass that stable subset as `orderSource`.
export function groupMovies(list, orderSource = list) {
  const orderIndex = new Map();
  let nextIndex = 0;
  for (const m of orderSource) {
    if (!orderIndex.has(m.group)) orderIndex.set(m.group, nextIndex++);
  }

  const map = new Map();
  for (const m of list) {
    if (!map.has(m.group)) {
      map.set(m.group, { title: m.group, items: [] });
    }
    map.get(m.group).items.push(m);
  }

  const groups = [...map.values()];
  groups.sort((a, b) => {
    const ai = orderIndex.has(a.title) ? orderIndex.get(a.title) : nextIndex;
    const bi = orderIndex.has(b.title) ? orderIndex.get(b.title) : nextIndex;
    return ai - bi;
  });
  for (const g of groups) {
    g.items.sort((a, b) => parseLocalDate(a.releaseDate) - parseLocalDate(b.releaseDate));
  }
  return groups;
}

/**
 * Validates and normalizes an imported backup payload. Rejects the whole
 * payload (returns null) if it isn't an object, or if any entry isn't a
 * well-formed { watched, rating } record — a partially-garbage file must
 * not be silently accepted as "valid but mostly empty", since the caller
 * replaces the user's existing state with the result.
 */
export function validateImportedState(data) {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  const result = {};
  for (const [id, entry] of Object.entries(data)) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return null;
    if (typeof entry.watched !== "boolean") return null;
    const rating = entry.rating ?? null;
    if (rating !== null && !VALID_RATINGS.has(rating)) return null;
    result[id] = { watched: entry.watched, rating };
  }
  return result;
}

// --- Friend sharing -------------------------------------------------------
//
// A "friend" is a named, locally-stored snapshot of someone else's watch
// state, imported once via a share link and never auto-synced afterward.
// The link carries a stable per-sender `id` (generated once on the sender's
// device and reused across re-shares) so re-importing a later link from the
// same person updates the same local entry instead of creating a duplicate.

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isParsableDate(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

// The exact shape produced by crypto.randomUUID(), which is how app.js
// generates a sender's share id. Validating against this format (rather
// than just "non-empty string") rejects reserved/pathological values like
// "self" (the app's own-profile sentinel) or "__proto__"/"constructor" —
// any of which, if accepted as a friend id, would collide with either the
// own-profile switch in app.js or a built-in Object.prototype property when
// looked up as `friends[id]`.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function buildSharePayload({ id, exportedAt, state }) {
  return JSON.stringify({ id, exportedAt, state });
}

/**
 * Parses and validates a share-link payload string (the raw `share` query
 * param value). Returns null for anything malformed — same "reject the
 * whole thing" posture as validateImportedState, since a partially-garbage
 * link must not silently create/overwrite a friend entry with junk data.
 */
export function parseSharePayload(raw) {
  if (!raw) return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isPlainObject(parsed)) return null;
  if (typeof parsed.id !== "string" || !UUID_PATTERN.test(parsed.id)) return null;
  if (!isParsableDate(parsed.exportedAt)) return null;
  const state = validateImportedState(parsed.state);
  if (!state) return null;
  return { id: parsed.id, exportedAt: parsed.exportedAt, state };
}

export function buildShareUrl(baseUrl, payload) {
  const url = new URL(baseUrl);
  url.searchParams.set("share", buildSharePayload(payload));
  return url.toString();
}

export function extractShareParam(urlString) {
  return new URL(urlString).searchParams.get("share");
}

export function upsertFriend(friends, id, entry) {
  return { ...friends, [id]: { ...entry } };
}

export function removeFriend(friends, id) {
  const next = { ...friends };
  delete next[id];
  return next;
}

export function listFriends(friends) {
  return Object.entries(friends)
    .map(([id, f]) => ({ id, ...f }))
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

// --- Full backup (own state + all friends) ---------------------------------

export const BACKUP_VERSION = 2;

export function buildFullBackup({ own, friends, shareId, activeProfile }) {
  return { version: BACKUP_VERSION, own, friends, shareId: shareId ?? null, activeProfile: activeProfile ?? "self" };
}

/**
 * Validates a backup payload and normalizes it to { own, friends, shareId,
 * activeProfile }, or returns null if malformed. Understands two shapes:
 *
 * - Current (versioned): { version: 2, own, friends, shareId, activeProfile }
 * - Legacy (pre-friends-feature): a bare { [movieId]: {watched,rating} }
 *   object, i.e. exactly what validateImportedState already accepts — old
 *   exports never had a "version" key, so its absence is the discriminator.
 *   These restore as own-state-only with no friends, matching what such a
 *   file actually contained.
 *
 * As with validateImportedState, any single malformed piece (a bad friend
 * entry, a bad own-state entry) rejects the entire backup rather than
 * silently dropping data, since the caller replaces everything on restore.
 */
export function validateFullBackup(data) {
  if (!isPlainObject(data)) return null;

  if (!("version" in data)) {
    const own = validateImportedState(data);
    if (!own) return null;
    return { own, friends: {}, shareId: null, activeProfile: "self" };
  }

  if (data.version !== BACKUP_VERSION) return null;

  // `own` must actually be present — a real export always includes it, so
  // its absence means the file was truncated/corrupted. Treating a missing
  // `own` as "an empty own state" (via `data.own ?? {}`) would silently
  // wipe the caller's real watch history on restore instead of rejecting
  // the broken file.
  if (!("own" in data)) return null;
  const own = validateImportedState(data.own);
  if (!own) return null;

  // Same reasoning as `own`: a real v2 export always includes `friends`
  // (as `{}` when there are none), so its absence means corruption — must
  // not silently default to {} and overwrite every saved friend on restore.
  if (!("friends" in data)) return null;
  const friendsRaw = data.friends;
  if (!isPlainObject(friendsRaw)) return null;

  const friends = {};
  for (const [id, entry] of Object.entries(friendsRaw)) {
    // Same UUID-format check as parseSharePayload's `id`, and for the same
    // reason: a friend id of "self" (or "__proto__"/"constructor", which
    // would corrupt this very object when assigned via friends[id] = ...)
    // must never make it into the restored friends store, whether it
    // arrives via a share link or — as here — a hand-edited/corrupted
    // backup file.
    if (!UUID_PATTERN.test(id)) return null;
    if (!isPlainObject(entry)) return null;
    if (typeof entry.name !== "string" || entry.name.trim() === "") return null;
    // Same reasoning as `own` above: a real export always includes `state`
    // for every friend entry, so its absence means corruption, not "this
    // friend has watched nothing" — reject rather than silently emptying it.
    if (!("state" in entry)) return null;
    const friendState = validateImportedState(entry.state);
    if (!friendState) return null;
    if (!isParsableDate(entry.exportedAt)) return null;
    if (!isParsableDate(entry.importedAt)) return null;
    friends[id] = { name: entry.name, state: friendState, exportedAt: entry.exportedAt, importedAt: entry.importedAt };
  }

  // shareId isn't a security boundary like the friend ids above (it only
  // seeds this device's *own* future outgoing share links), so an invalid
  // value doesn't need to fail the whole restore — coercing it to null just
  // means getOwnShareId() mints a fresh valid UUID next time a link is
  // shared, instead of silently adopting a value that every recipient's
  // parseSharePayload() would reject anyway.
  const shareId = typeof data.shareId === "string" && UUID_PATTERN.test(data.shareId) ? data.shareId : null;
  const activeProfile = typeof data.activeProfile === "string" ? data.activeProfile : "self";

  return { own, friends, shareId, activeProfile };
}

// --- Character-based prerequisites ------------------------------------
//
// "To understand the characters in movie/series M, which other works
// should I have seen first?" — computed from `characters` (an array of
// { id, name, appearances: [{ movieId, role }] }, role is "main" | "sub").
//
// Only characters who play a MAIN role in M generate a recommendation
// (a "sub"/cameo appearance in M doesn't require prior context to enjoy
// M itself). For each such character, every one of their EARLIER "main"
// appearances (by release date) becomes a prerequisite — an earlier "sub"
// appearance is skipped, since a cameo elsewhere doesn't meaningfully
// build understanding of the character either. A character who is only
// ever "sub" everywhere never produces a prerequisite in either direction.
export function computePrerequisites(movieId, movies, characters) {
  const movieById = new Map(movies.map((m) => [m.id, m]));
  const target = movieById.get(movieId);
  if (!target) return [];
  const targetDate = parseLocalDate(target.releaseDate);

  const prereqIds = new Set();
  for (const character of characters) {
    const isMainHere = character.appearances.some((a) => a.movieId === movieId && a.role === "main");
    if (!isMainHere) continue;
    for (const appearance of character.appearances) {
      if (appearance.movieId === movieId || appearance.role !== "main") continue;
      const otherMovie = movieById.get(appearance.movieId);
      if (!otherMovie) continue;
      if (parseLocalDate(otherMovie.releaseDate) < targetDate) {
        prereqIds.add(appearance.movieId);
      }
    }
  }

  return [...prereqIds].map((id) => movieById.get(id)).sort((a, b) => parseLocalDate(a.releaseDate) - parseLocalDate(b.releaseDate));
}
