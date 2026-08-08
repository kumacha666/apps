export const RATINGS = ["◎", "〇", "△", "✕"];
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

export function groupMovies(list) {
  const groups = [];
  const map = new Map();
  for (const m of list) {
    if (!map.has(m.group)) {
      const g = { title: m.group, items: [] };
      map.set(m.group, g);
      groups.push(g);
    }
    map.get(m.group).items.push(m);
  }
  return groups;
}

/**
 * Validates and normalizes an imported backup payload. Rejects arrays and
 * non-object payloads outright, and drops any entry that isn't a well-formed
 * { watched, rating } record rather than trusting it as-is.
 */
export function validateImportedState(data) {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  const result = {};
  for (const [id, entry] of Object.entries(data)) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) continue;
    const watched = entry.watched === true;
    const rating = VALID_RATINGS.has(entry.rating) ? entry.rating : null;
    result[id] = { watched, rating };
  }
  return result;
}
