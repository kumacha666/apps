import {
  RATINGS,
  UNRATED_FILTER,
  RATING_FILTER_OPTIONS,
  UNIVERSE_LABELS,
  isReleased,
  daysUntil,
  formatMonth,
  findNextMcuMovieCountdown,
  getEntry,
  computeProgress,
  computeProgressBreakdown,
  filterByUniverse,
  filterUnwatched,
  filterByRating,
  groupMovies,
  parseSharePayload,
  buildShareUrl,
  extractShareParam,
  upsertFriend,
  removeFriend,
  listFriends,
  buildFullBackup,
  validateFullBackup,
  computePrerequisites,
  computeRecommendedNext,
} from "./logic.js";

const OWN_STATE_KEY = "marvel-checklist-state-v1";
const FRIENDS_KEY = "marvel-checklist-friends-v1";
const SHARE_ID_KEY = "marvel-checklist-share-id-v1";
const ACTIVE_PROFILE_KEY = "marvel-checklist-active-profile-v1";
const SELF = "self";

let movies = [];
let characters = [];
let ownState = loadJSON(OWN_STATE_KEY, {});
let friends = loadJSON(FRIENDS_KEY, {});
let activeProfileId = loadString(ACTIVE_PROFILE_KEY, SELF);
let currentUniverse = "all";
let unwatchedOnly = false;
let activeRatingFilters = new Set(); // display-only filter, like unwatchedOnly — never affects progress or group order
let pendingFocus = null; // { movieId, control, context } to restore focus after a re-render
let openPrereqMovieIds = new Set(); // one-shot: which "前提作品" <details> to re-open after a render, then cleared
// Becomes true only once characters.json has successfully loaded. Until then
// (or if the fetch fails), computePrerequisites() has nothing to work with
// and would report every unwatched work as prerequisite-free — the "次に見る
// べき作品" section stays hidden rather than risk over-recommending sequels
// whose real prerequisites just haven't loaded yet (see PR #344 Codex review).
let charactersLoaded = false;

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

// localStorage.getItem() can itself throw (e.g. SecurityError when storage
// is disabled/blocked by browser settings). The three `let` initializers
// above run at module top-level during ES module evaluation, so an
// uncaught exception here — unlike one inside init() — would abort module
// evaluation entirely and the app would never even call init().
function loadString(key, fallback) {
  try {
    return localStorage.getItem(key) || fallback;
  } catch (e) {
    return fallback;
  }
}

function saveActiveProfile() {
  localStorage.setItem(ACTIVE_PROFILE_KEY, activeProfileId);
}

// If activeProfileId points at a friend that no longer exists (e.g. it was
// deleted, or came from a stale localStorage value), fall back to "self"
// rather than rendering against an undefined state.
function isViewingValidFriend() {
  return activeProfileId !== SELF && Object.prototype.hasOwnProperty.call(friends, activeProfileId);
}

function getActiveStateStore() {
  if (activeProfileId === SELF || !isViewingValidFriend()) return ownState;
  return friends[activeProfileId].state;
}

// Applies a single-field edit (watched or rating) for `movieId` in the
// active profile's state, and persists it.
//
// For a friend profile, this reads the latest persisted FRIENDS_KEY right
// before merging and writes back only that one `{ watched, rating }` field
// for that one movie — not the whole friend record, and not even the whole
// per-movie entry — so that a *different* tab's concurrent edit to a
// different field (e.g. this tab changes `watched` while another tab is
// mid-edit on `rating` for the very same movie/friend) survives.
//
// Either branch only commits the change to in-memory `ownState`/`friends`
// after `localStorage.setItem()` succeeds. A failed write (e.g.
// QuotaExceededError) leaves both storage and in-memory state exactly as
// they were, with a failure alert, instead of a change that looks applied
// on screen (because some earlier code already mutated the live state
// object) but silently reverts on the next reload with no explanation.
function applyStateChange(movieId, field, value) {
  if (activeProfileId === SELF || !isViewingValidFriend()) {
    // Same reasoning as the friend branch below: read the latest persisted
    // OWN_STATE_KEY right before merging, not this tab's possibly-stale
    // in-memory `ownState` — otherwise a different movie edited in another
    // tab since this tab's own load would be silently overwritten here.
    const latestOwnState = loadJSON(OWN_STATE_KEY, {});
    const latestEntry = getEntry(latestOwnState, movieId);
    const nextOwnState = { ...latestOwnState, [movieId]: { ...latestEntry, [field]: value } };
    try {
      localStorage.setItem(OWN_STATE_KEY, JSON.stringify(nextOwnState));
    } catch (e) {
      alert("視聴状況の保存に失敗しました（保存容量が不足している可能性があります）。変更は取り消されました。");
      return;
    }
    ownState = nextOwnState;
    return;
  }

  const latestFriends = loadJSON(FRIENDS_KEY, {});
  if (!Object.prototype.hasOwnProperty.call(latestFriends, activeProfileId)) {
    // The friend was removed (in another tab, or via this one) since this
    // tab's own `friends` snapshot was taken. Don't resurrect a deleted
    // friend just because this tab still had it in memory — fall back to
    // viewing "自分" instead, matching what actually exists in storage.
    friends = latestFriends;
    activeProfileId = SELF;
    saveActiveProfile();
    alert("表示中の友達データは削除されています。自分のリストを表示します。");
    renderProfileSwitcher();
    return;
  }
  const latestEntry = getEntry(latestFriends[activeProfileId].state, movieId);
  const nextFriends = {
    ...latestFriends,
    [activeProfileId]: {
      ...latestFriends[activeProfileId],
      state: { ...latestFriends[activeProfileId].state, [movieId]: { ...latestEntry, [field]: value } },
    },
  };
  try {
    localStorage.setItem(FRIENDS_KEY, JSON.stringify(nextFriends));
  } catch (e) {
    alert("友達データの保存に失敗しました（保存容量が不足している可能性があります）。変更は取り消されました。");
    return;
  }
  friends = nextFriends;
}

function setWatched(id, watched) {
  applyStateChange(id, "watched", watched);
}

function setRating(id, rating) {
  const entry = getEntry(getActiveStateStore(), id);
  applyStateChange(id, "rating", entry.rating === rating ? null : rating);
}

function getOwnShareId() {
  let id = localStorage.getItem(SHARE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SHARE_ID_KEY, id);
  }
  return id;
}

// Counts down to whichever MCU movie (type: "movie", universe: "mcu") is
// releasing next — see findNextMcuMovieCountdown()'s doc comment for why TV
// series and non-MCU-studio works never qualify, and how the target rolls
// over automatically once one release day has passed.
function renderCountdown() {
  const target = findNextMcuMovieCountdown(movies);
  const el = document.getElementById("countdown");
  if (!target) {
    el.textContent = "";
    return;
  }
  const diffDays = daysUntil(target.releaseDate);
  if (diffDays > 0) {
    el.innerHTML = `『${target.title}』公開まで <strong>あと${diffDays}日</strong>`;
  } else {
    el.innerHTML = `『${target.title}』本日公開！`;
  }
}

function renderProgress(universeFiltered) {
  const { total, watched, pct } = computeProgress(universeFiltered, getActiveStateStore());
  document.getElementById("progress-fill").style.width = `${pct}%`;
  document.getElementById("progress-text").textContent =
    total > 0 ? `視聴済み ${watched} / ${total} 作品（${pct}%）` : "対象の作品がありません";
}

// Renders the collapsible "フェイズ／ユニバース別の内訳" — always over the
// FULL catalog (not `universeFiltered`/tab-scoped), since the whole point is
// to compare universes/phases against each other regardless of which tab is
// active (same rationale as renderRecommendedNext's full-catalog computation
// just above). Only the inner content div is rebuilt on each render; the
// outer <details> element itself lives in index.html and is never touched
// here, so its open/closed state survives re-renders for free (unlike the
// per-card "前提作品" <details>, which need explicit open-state tracking
// because they're recreated from scratch on every render).
//
// `container` can legitimately be null: the service worker is network-first
// with a cache fallback, so on a flaky connection it's possible for the
// *navigation* to fall back to a stale cached index.html (predating this
// element) while the separately-fetched app.js still resolves to the latest
// version. Skipping silently here — rather than letting `.innerHTML = ""`
// throw on null — keeps the rest of renderList() (the actual movie list)
// from being aborted by an element that simply hasn't caught up yet.
function renderProgressBreakdown() {
  const container = document.getElementById("progress-breakdown-content");
  if (!container) return;

  const activeState = getActiveStateStore();
  const breakdown = computeProgressBreakdown(movies, activeState);
  container.innerHTML = "";

  for (const u of breakdown) {
    if (u.total === 0) continue; // no released works in this universe yet

    const universeEl = document.createElement("div");
    universeEl.className = "breakdown-universe";

    const titleEl = document.createElement("p");
    titleEl.className = "breakdown-universe-title";
    titleEl.textContent = `${UNIVERSE_LABELS[u.universe]}　${u.watched} / ${u.total}（${u.pct}%）`;
    universeEl.appendChild(titleEl);

    const barEl = document.createElement("div");
    barEl.className = "breakdown-bar";
    const fillEl = document.createElement("div");
    fillEl.className = "breakdown-bar-fill";
    fillEl.style.width = `${u.pct}%`;
    barEl.appendChild(fillEl);
    universeEl.appendChild(barEl);

    const groupsEl = document.createElement("div");
    groupsEl.className = "breakdown-groups";
    for (const g of u.groups) {
      if (g.total === 0) continue; // this phase/franchise hasn't started releasing yet
      const rowEl = document.createElement("div");
      rowEl.className = "breakdown-group-row";
      const labelEl = document.createElement("span");
      labelEl.className = "breakdown-group-label";
      labelEl.textContent = g.group;
      const valueEl = document.createElement("span");
      valueEl.className = "breakdown-group-value";
      valueEl.textContent = `${g.watched} / ${g.total}（${g.pct}%）`;
      rowEl.appendChild(labelEl);
      rowEl.appendChild(valueEl);
      groupsEl.appendChild(rowEl);
    }
    universeEl.appendChild(groupsEl);

    container.appendChild(universeEl);
  }
}

// Prerequisites are computed against the FULL catalog (not `universeFiltered`)
// so a recommendation is never falsely "unblocked" just because a
// cross-universe prerequisite happens to be outside the current tab — this
// keeps it consistent with each card's own "前提作品" section, which also
// always considers every universe. The active universe tab is applied only
// as a final display filter, after the correctness-critical computation.
function renderRecommendedNext(universeFiltered) {
  const section = document.getElementById("recommended-next-section");
  const listEl = document.getElementById("recommended-next-list");

  if (!charactersLoaded) {
    listEl.innerHTML = "";
    section.hidden = true;
    return;
  }

  const activeState = getActiveStateStore();
  const universeFilteredIds = new Set(universeFiltered.map((m) => m.id));
  const recommended = computeRecommendedNext(movies, characters, activeState).filter((m) =>
    universeFilteredIds.has(m.id)
  );

  listEl.innerHTML = "";
  section.hidden = recommended.length === 0;
  for (const movie of recommended) {
    listEl.appendChild(renderMovieCard(movie, "recommended"));
  }
}

function renderList() {
  const activeState = getActiveStateStore();
  const universeFiltered = filterByUniverse(movies, currentUniverse);
  renderProgress(universeFiltered);
  renderProgressBreakdown();
  renderRecommendedNext(universeFiltered);

  let displayList = unwatchedOnly ? filterUnwatched(universeFiltered, activeState) : universeFiltered;
  displayList = filterByRating(displayList, activeState, activeRatingFilters);

  const listEl = document.getElementById("movie-list");
  listEl.innerHTML = "";

  if (displayList.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "該当する作品がありません";
    empty.tabIndex = -1;
    listEl.appendChild(empty);
    restoreFocus(empty);
    return;
  }

  for (const group of groupMovies(displayList, universeFiltered)) {
    const groupEl = document.createElement("div");
    groupEl.className = "group";

    const titleEl = document.createElement("p");
    titleEl.className = "group-title";
    titleEl.textContent = group.title;
    groupEl.appendChild(titleEl);

    for (const movie of group.items) {
      groupEl.appendChild(renderMovieCard(movie, "main"));
    }
    listEl.appendChild(groupEl);
  }

  restoreFocus(null);
}

// Restores keyboard focus to the control the user just interacted with.
// When that control's movie no longer appears in the current view (e.g. it
// was just marked watched while "unwatched only" is active), focus falls
// back to the next visible checkbox, or to the empty-state message if the
// list is now empty, rather than being silently dropped to <body>.
//
// A movie can be rendered twice at once — once in the "次に見るべき作品"
// section and once in the normal list — so `pendingFocus.context` records
// which of the two the user actually clicked in. Without it, restoreFocus()
// would always match the first `data-movie-id` in DOM order (the
// recommended-section copy, which is rendered first), yanking focus there
// even when the user interacted with the normal-list copy (see PR #344
// Codex review).
function restoreFocus(emptyStateEl) {
  if (!pendingFocus) return;
  const { movieId, control, context } = pendingFocus;
  pendingFocus = null;

  const selector =
    control === "check"
      ? `.movie-check[data-movie-id="${movieId}"]`
      : `.rating-btn[data-movie-id="${movieId}"][data-rating="${control}"]`;

  const originContainerId = context === "recommended" ? "recommended-next-list" : "movie-list";
  const originContainer = document.getElementById(originContainerId);
  const withinOrigin = originContainer && originContainer.querySelector(selector);
  if (withinOrigin) {
    withinOrigin.focus();
    return;
  }

  // The card is gone from its origin context (e.g. checking it off removed
  // it from that section/list on re-render) — its other copy, if any, is a
  // reasonable next-best match before falling back further.
  const anywhere = document.querySelector(selector);
  if (anywhere) {
    anywhere.focus();
    return;
  }

  // No copy of this control survived at all; fall back to any other
  // focusable control in the current view. A disabled checkbox (an
  // unreleased movie) can't actually receive focus, so skip those and try a
  // rating button next — rating buttons are never disabled.
  const fallback =
    document.querySelector(".movie-check:not(:disabled)") || document.querySelector(".rating-btn");
  if (fallback) {
    fallback.focus();
    return;
  }

  if (emptyStateEl) emptyStateEl.focus();
}

function renderMovieCard(movie, context) {
  const entry = getEntry(getActiveStateStore(), movie.id);
  const released = isReleased(movie);

  const card = document.createElement("div");
  card.className = "movie-card" + (entry.watched ? " watched" : "");

  const main = document.createElement("label");
  main.className = "movie-main";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "movie-check";
  checkbox.dataset.movieId = movie.id;
  checkbox.checked = entry.watched;
  checkbox.disabled = !released;
  checkbox.addEventListener("change", () => {
    pendingFocus = { movieId: movie.id, control: "check", context };
    setWatched(movie.id, checkbox.checked);
    renderCountdown();
    renderList();
  });

  const info = document.createElement("div");
  info.className = "movie-info";

  const titleEl = document.createElement("p");
  titleEl.className = "movie-title";
  titleEl.textContent = movie.title;

  const metaEl = document.createElement("p");
  metaEl.className = "movie-meta";
  const typeLabel = movie.type === "series" ? "📺 シリーズ" : "🎬 映画";
  metaEl.innerHTML = `<span class="type-badge">${typeLabel}</span><span>${UNIVERSE_LABELS[movie.universe]}</span><span>${formatMonth(movie.releaseDate)}</span>`;
  if (!released) {
    const badge = document.createElement("span");
    badge.className = "badge-upcoming";
    badge.textContent = movie.tentative ? "公開予定（未定含む）" : "公開予定";
    metaEl.appendChild(badge);
  }

  info.appendChild(titleEl);
  info.appendChild(metaEl);
  main.appendChild(checkbox);
  main.appendChild(info);
  card.appendChild(main);

  const ratingRow = document.createElement("div");
  ratingRow.className = "rating-row";
  ratingRow.setAttribute("role", "group");
  ratingRow.setAttribute("aria-label", `${movie.title}の見るべき度合い`);
  for (const symbol of RATINGS) {
    const selected = entry.rating === symbol;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "rating-btn" + (selected ? " selected" : "");
    btn.textContent = symbol;
    btn.dataset.movieId = movie.id;
    btn.dataset.rating = symbol;
    btn.setAttribute("aria-pressed", String(selected));
    btn.addEventListener("click", () => {
      pendingFocus = { movieId: movie.id, control: symbol, context };
      setRating(movie.id, symbol);
      renderList();
    });
    ratingRow.appendChild(btn);
  }
  card.appendChild(ratingRow);

  const prereqEl = renderPrerequisites(movie);
  if (prereqEl) card.appendChild(prereqEl);

  return card;
}

// Shows which other works you should have seen first to understand this
// movie/series's characters, based on computePrerequisites(). Watched state
// reflects whichever profile (self or a friend) is currently active, same
// as the rest of the card. Returns null (nothing rendered) when there are
// no prerequisites at all, to keep standalone films' cards uncluttered.
function renderPrerequisites(movie) {
  const prereqs = computePrerequisites(movie.id, movies, characters);
  if (prereqs.length === 0) return null;

  const activeState = getActiveStateStore();
  const unwatched = prereqs.filter((m) => !getEntry(activeState, m.id).watched);

  const wrapper = document.createElement("div");
  wrapper.className = "prereq-section";

  const details = document.createElement("details");
  details.className = "prereq-details";
  if (unwatched.length === 0) details.classList.add("prereq-all-watched");
  details.dataset.movieId = movie.id;
  if (openPrereqMovieIds.has(movie.id)) details.open = true;
  const summary = document.createElement("summary");
  summary.textContent =
    unwatched.length === 0
      ? `✓ 前提作品：全${prereqs.length}件視聴済み`
      : `🔗 前提作品：${unwatched.length}件未視聴（全${prereqs.length}件）`;
  details.appendChild(summary);

  const list = document.createElement("ul");
  list.className = "prereq-list";
  for (const prereqMovie of prereqs) {
    const watched = getEntry(activeState, prereqMovie.id).watched;
    const li = document.createElement("li");
    li.className = watched ? "prereq-watched" : "prereq-unwatched";
    li.textContent = `${watched ? "✓" : "○"} ${prereqMovie.title}`;
    list.appendChild(li);
  }
  details.appendChild(list);
  wrapper.appendChild(details);
  return wrapper;
}

function setupTabs() {
  const tabs = document.querySelectorAll("#universe-tabs .tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => {
        t.classList.remove("active");
        t.setAttribute("aria-pressed", "false");
      });
      tab.classList.add("active");
      tab.setAttribute("aria-pressed", "true");
      currentUniverse = tab.dataset.universe;
      renderList();
    });
  });
}

function setupUnwatchedToggle() {
  const checkbox = document.getElementById("unwatched-only");
  checkbox.addEventListener("change", () => {
    unwatchedOnly = checkbox.checked;
    renderList();
  });
}

function setupRatingFilter() {
  const container = document.getElementById("rating-filter");
  for (const option of RATING_FILTER_OPTIONS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "rating-filter-btn";
    btn.textContent = option === UNRATED_FILTER ? "未評価" : option;
    btn.setAttribute("aria-pressed", "false");
    btn.addEventListener("click", () => {
      const nowActive = !activeRatingFilters.has(option);
      if (nowActive) {
        activeRatingFilters.add(option);
      } else {
        activeRatingFilters.delete(option);
      }
      btn.classList.toggle("active", nowActive);
      btn.setAttribute("aria-pressed", String(nowActive));
      renderList();
    });
    container.appendChild(btn);
  }
}

function setLocalStorageItem(key, raw) {
  if (raw === null) {
    localStorage.removeItem(key);
  } else {
    localStorage.setItem(key, raw);
  }
}

// Persists a validated full backup across all four localStorage keys and
// commits it to in-memory state, or leaves everything untouched on failure.
// A naive sequential write (own, then friends, then...) risks a partial
// restore if e.g. localStorage fills up partway through (GitHub Pages apps
// share one origin's quota) — this device would end up with new own data
// but stale friends data, silently. So every previous raw value is captured
// first, and any write failure rolls all four keys back to those values
// before returning false.
//
// A validated `shareId` of null must actively clear any existing
// SHARE_ID_KEY (not just leave it alone) — otherwise restoring someone
// else's backup (or one predating any share) would keep this device
// impersonating its old share identity, so a future share link would still
// look, to a friend's device, like an update from the *previous* identity
// rather than the (possibly different) restored one.
const BACKUP_KEYS = [OWN_STATE_KEY, FRIENDS_KEY, ACTIVE_PROFILE_KEY, SHARE_ID_KEY];

// Writes `next[key]` for every key in `keys`, or leaves localStorage exactly
// as it was before the call — used any time more than one localStorage key
// must change together (a full-backup restore, or a share-link import that
// touches both FRIENDS_KEY and ACTIVE_PROFILE_KEY).
//
// Both the write and the rollback-on-failure clear every targeted key first
// rather than overwriting in place. That matters because old and new values
// don't all grow/shrink together — e.g. a restore where the old `own` was
// larger than the new one but the new `friends` is larger than the old one
// — so writing (or rolling back) in place can throw partway through even
// though the total new (or total old) footprint would fit on its own.
function persistLocalStorageAtomically(keys, next) {
  let previous = {};
  try {
    for (const key of keys) previous[key] = localStorage.getItem(key);
    for (const key of keys) localStorage.removeItem(key);
    for (const key of keys) setLocalStorageItem(key, next[key]);
    return true;
  } catch (e) {
    try {
      for (const key of keys) localStorage.removeItem(key);
      for (const key of keys) setLocalStorageItem(key, previous[key]);
    } catch (e2) {
      // Storage is exhausted even for the pre-call values (e.g. another app
      // on the same origin has since consumed the remaining quota) —
      // nothing more can be safely persisted here.
    }
    return false;
  }
}

function restoreFullBackup(validated) {
  const nextActiveProfile =
    validated.activeProfile === SELF || Object.prototype.hasOwnProperty.call(validated.friends, validated.activeProfile)
      ? validated.activeProfile
      : SELF;

  const persisted = persistLocalStorageAtomically(BACKUP_KEYS, {
    [OWN_STATE_KEY]: JSON.stringify(validated.own),
    [FRIENDS_KEY]: JSON.stringify(validated.friends),
    [ACTIVE_PROFILE_KEY]: nextActiveProfile,
    [SHARE_ID_KEY]: validated.shareId,
  });
  if (!persisted) return false;

  ownState = validated.own;
  friends = validated.friends;
  activeProfileId = nextActiveProfile;
  return true;
}

// Full backup covers everything (own list + all saved friends' lists), so
// restoring on a new device/browser brings back the whole picture — not
// just whichever profile happened to be selected when exporting.
function setupBackup() {
  document.getElementById("btn-export").addEventListener("click", () => {
    // Unlike OWN_STATE_KEY/FRIENDS_KEY below (read via loadJSON(), which
    // already catches its own exceptions), a raw localStorage.getItem() can
    // still throw (e.g. SecurityError if storage access was revoked after
    // page load) — left unguarded, that would abort this click handler with
    // no downloaded file and no failure notice.
    let shareId;
    try {
      shareId = localStorage.getItem(SHARE_ID_KEY);
    } catch (e) {
      alert("バックアップの書き出しに失敗しました（ストレージにアクセスできません）。");
      return;
    }
    // Read the latest persisted own/friends state rather than this tab's
    // possibly-stale in-memory copies — otherwise edits made in another tab
    // since this tab's own load would be missing from the exported backup.
    const backup = buildFullBackup({
      own: loadJSON(OWN_STATE_KEY, {}),
      friends: loadJSON(FRIENDS_KEY, {}),
      shareId,
      activeProfile: activeProfileId,
    });
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "marvel-checklist-backup.json";
    a.click();
    URL.revokeObjectURL(url);
  });

  const fileInput = document.getElementById("import-file");
  document.getElementById("btn-import").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let parsed;
      try {
        parsed = JSON.parse(reader.result);
      } catch (e) {
        parsed = undefined;
      }
      const validated = parsed === undefined ? null : validateFullBackup(parsed);
      if (!validated) {
        alert("読み込みに失敗しました。正しいバックアップファイルを選択してください。");
      } else if (!restoreFullBackup(validated)) {
        alert("データの復元に失敗しました（保存容量が不足している可能性があります）。変更は取り消されました。");
      } else {
        renderProfileSwitcher();
        renderCountdown();
        renderList();
      }
      fileInput.value = "";
    };
    reader.readAsText(file);
  });
}

function renderProfileSwitcher() {
  const select = document.getElementById("profile-switcher");
  select.innerHTML = "";
  select.appendChild(new Option("自分", SELF));
  for (const friend of listFriends(friends)) {
    select.appendChild(new Option(friend.name, friend.id));
  }
  if (!isViewingValidFriend() && activeProfileId !== SELF) {
    // activeProfileId pointed at a friend that no longer exists (e.g. deleted).
    activeProfileId = SELF;
    saveActiveProfile();
  }
  select.value = activeProfileId;
  updateFriendViewIndicators();
}

function updateFriendViewIndicators() {
  const viewingFriend = isViewingValidFriend();
  document.getElementById("btn-share").hidden = viewingFriend;
  document.getElementById("btn-remove-friend").hidden = !viewingFriend;
  const label = document.getElementById("friend-view-label");
  if (viewingFriend) {
    label.textContent = `「${friends[activeProfileId].name}」さんのリストを表示中（自分のリストとは別に保存されます）`;
    label.hidden = false;
  } else {
    label.hidden = true;
  }
}

function setupProfileSwitcher() {
  const select = document.getElementById("profile-switcher");
  select.addEventListener("change", () => {
    const previousProfileId = activeProfileId;
    const nextProfileId = select.value;
    try {
      localStorage.setItem(ACTIVE_PROFILE_KEY, nextProfileId);
    } catch (e) {
      // Revert the dropdown's own selection too — otherwise it would show
      // the friend the user picked while the label/list (driven by
      // `activeProfileId`, left unchanged below) still show "自分", and any
      // card edit made in that inconsistent state would save to the wrong
      // profile's storage key.
      select.value = previousProfileId;
      alert("表示切り替えの保存に失敗しました（保存容量が不足している可能性があります）。");
      return;
    }
    activeProfileId = nextProfileId;
    updateFriendViewIndicators();
    renderList();
  });
}

function setupShareButton() {
  const shareBtn = document.getElementById("btn-share");
  shareBtn.addEventListener("click", async () => {
    // Guards against a rapid double-click starting two overlapping share
    // flows: getOwnShareId()/buildShareUrl()/showQrModal() all await, so a
    // second click before the first finishes would otherwise run a second,
    // concurrent copy of this whole sequence — each rebuilding the QR
    // modal's contents independently and racing to set qrModalReturnFocusEl
    // (see showQrModal()), corrupting which element focus returns to when
    // the modal closes.
    if (shareBtn.disabled) return;
    // Captured before disabling the button below: disabling the currently-
    // focused element synchronously blurs it (moves document.activeElement
    // to <body>), so capturing this any later would make showQrModal()'s
    // "return focus to whatever had it" logic restore focus to <body>
    // instead of back to this button.
    const returnFocusEl = document.activeElement;
    shareBtn.disabled = true;
    try {
      let shareId;
      try {
        shareId = getOwnShareId();
      } catch (e) {
        // getItem()/setItem() inside getOwnShareId() can throw (SecurityError
        // when storage is blocked, QuotaExceededError when persisting a
        // freshly-generated id for the first time). Left uncaught, this async
        // handler would abort silently — no copy, no fallback prompt, no
        // error message at all.
        alert("共有リンクの作成に失敗しました（保存容量が不足している可能性があります）。");
        // Disabling this button above (synchronously, before this catch)
        // blurred it to <body> if it was the focused element — restore
        // focus now that we're bailing out without ever reaching
        // showQrModal() (which would otherwise have handled this). Must
        // re-enable the button FIRST: .focus() on a still-disabled element
        // is a silent no-op (disabled elements can't receive focus), and
        // the outer `finally` below only re-enables it AFTER this `return`
        // — too late for a .focus() call made here to have any effect.
        shareBtn.disabled = false;
        returnFocusEl.focus();
        return;
      }
      // Read the latest persisted own state rather than this tab's possibly-
      // stale in-memory ownState, so edits made in another tab since this
      // tab's own load aren't missing from the generated link.
      const latestOwnState = loadJSON(OWN_STATE_KEY, {});
      const payload = { id: shareId, exportedAt: new Date().toISOString(), state: latestOwnState };
      let url;
      try {
        url = await buildShareUrl(location.origin + location.pathname, payload);
      } catch (e) {
        // buildShareUrl() uses CompressionStream, which some older browsers/
        // WebViews don't implement — that constructor throws synchronously.
        // Left unguarded, this async handler would abort with no copy, no
        // fallback prompt, and no error message at all.
        alert("共有リンクの作成に失敗しました（このブラウザでは利用できない機能が含まれている可能性があります）。");
        shareBtn.disabled = false; // must precede .focus() — see the getOwnShareId() catch above
        returnFocusEl.focus();
        return;
      }
      await showQrModal(url, returnFocusEl);
    } finally {
      shareBtn.disabled = false;
    }
  });
}

// Pre-QR-modal fallback: copy to clipboard if possible, otherwise fall back
// to prompt() so the link is still visible/selectable. Used when the
// modal's own DOM elements are missing entirely (see showQrModal()) — the
// modal itself has its own separate, textarea-based clipboard-failure path
// once it's open (see setupQrModal()'s copy handler).
async function shareUrlFallback(url) {
  try {
    await navigator.clipboard.writeText(url);
    alert("共有リンクをコピーしました。友達に送ってください。");
  } catch (e) {
    prompt("このリンクをコピーして友達に送ってください。", url);
  }
}

// Restores focus to whatever had it before the modal opened (the "共有リン
// クを作成" button), same reasoning as restoreFocus() elsewhere in this
// file — a modal opened via keyboard/screen-reader shouldn't strand focus
// on <body> when it closes.
let qrModalReturnFocusEl = null;

// Invalidates a showQrModal() call's in-flight QR generation (the dynamic
// import + qr.make()) once it's no longer the current one. The share
// button re-enables as soon as the modal opens (see showQrModal()), so a
// user can close this modal and open a new one (a different share, e.g.
// after checking off more movies) before the first call's QR work
// finishes — without this token, the stale call's `container.innerHTML`
// write would land on whatever modal happens to be open when it resolves,
// possibly overwriting a newer, already-displayed QR code with the wrong
// one. Bumped both when a new modal opens (invalidating the previous
// request) and when a modal closes (invalidating its own, in case it never
// gets superseded by a new open).
let qrRequestToken = 0;

// `returnFocusEl` is captured by the caller (setupShareButton()) BEFORE it
// disables the share button — not read from document.activeElement in here.
// Two reasons it can't be captured locally at the top of this function
// instead: (1) disabling a focused button synchronously blurs it to <body>,
// so by the time this function runs the button is no longer
// document.activeElement; (2) this function itself awaits a dynamic import
// that can take a while (first use, flaky connection), during which the
// user could tab/click elsewhere, making a locally-captured value stale
// regardless of point (1).
async function showQrModal(url, returnFocusEl) {
  const modal = document.getElementById("qr-modal");
  const container = document.getElementById("qr-code-container");
  const urlField = document.getElementById("qr-modal-url");
  const closeBtn = document.getElementById("qr-modal-close");
  // Looked up here (rather than only later, in the success path) so the
  // fallback branch below can also reach it — see its comment.
  const shareBtn = document.getElementById("btn-share");

  // The service worker is network-first per request, so a flaky connection
  // can serve a stale cached index.html (predating this modal) alongside a
  // freshly-fetched app.js — same failure mode as PR #346's finding on the
  // progress-breakdown section. Fall back to the pre-QR-modal share flow
  // instead of throwing on a null element.
  if (!modal || !container || !urlField || !closeBtn) {
    await shareUrlFallback(url);
    // Same reasoning as the catch blocks in setupShareButton(): this exits
    // without ever showing the modal (whose own close-button focus / later
    // hideQrModal() restore would otherwise handle this), so it must
    // restore focus itself. Must re-enable the button FIRST — .focus() on a
    // still-disabled element (the caller disabled it before calling this
    // function) is a silent no-op, and the caller's own re-enable only
    // happens in its `finally`, after this function's promise resolves.
    if (shareBtn) shareBtn.disabled = false;
    returnFocusEl.focus();
    return;
  }

  // The link itself is already fully generated by this point (the caller
  // built it before calling showQrModal) and needs no QR library to be
  // usable — show the modal and the copyable link immediately, rather than
  // making them wait behind the QR library's fetch/generation below. On a
  // slow connection (especially the QR library's first-ever, uncached
  // fetch), gating the whole modal on that would leave an already-ready
  // link inaccessible for no reason.
  container.innerHTML = "QRコードを生成しています…";
  urlField.value = url;
  qrModalReturnFocusEl = returnFocusEl;
  // `#qr-modal` itself lives outside `#app` in index.html specifically so
  // that making `#app` inert here doesn't also inert the modal's own
  // buttons. Without this, Tab/Shift+Tab could cycle keyboard focus straight
  // through the modal into the checklist "behind" it, letting a keyboard
  // user edit checkboxes/ratings that are visually hidden under the overlay.
  // `#app` is a core structural element present since this app's very first
  // version (unlike the qr-modal elements above, which are new in this PR
  // and so need a stale-cache null-check) — guarded anyway for consistency
  // and because a null here would otherwise throw after the QR/URL content
  // is already committed but before the modal is actually shown.
  const appEl = document.getElementById("app");
  if (appEl) appEl.inert = true;
  modal.hidden = false;
  closeBtn.focus();

  // Re-enable the share button as soon as the modal is actually open, rather
  // than waiting for the QR fetch/generation below to finish — it's already
  // inert (a descendant of #app) at this point, so re-enabling it can't
  // reopen the double-click race the disabled state was guarding against.
  // Leaving it disabled until this whole function resolves would instead
  // break hideQrModal()'s focus restore: if the user closes the modal
  // (Escape/close button) while the QR is still loading, .focus() on a
  // still-disabled button is a silent no-op, and nothing re-attempts it
  // once the button re-enables later — keyboard focus would be stranded on
  // <body> even after the share flow fully settles.
  if (shareBtn) shareBtn.disabled = false;

  // Claims this call as the current QR request. Since the share button is
  // already re-enabled above, the user can close this modal and open a new
  // one (e.g. after checking off another movie) before the import/generation
  // below finishes — the two writes to container.innerHTML further down are
  // each gated on this token still matching qrRequestToken, so a stale call
  // from a modal that's since been closed or superseded can't overwrite a
  // newer one's QR code.
  const myQrToken = ++qrRequestToken;

  try {
    // Dynamically imported (rather than a static top-level import) so that
    // a failed fetch of this file — e.g. an old service-worker cache that
    // predates it, on a connection too flaky to fetch it fresh — can't stop
    // app.js's module graph from resolving at all. A static `import ... from
    // "./vendor/qrcode.js"` failing would abort the ENTIRE module, taking
    // down the whole checklist (not just the share/QR feature) with it.
    const { default: qrcode } = await import("./vendor/qrcode.js");
    const qr = qrcode(0, "M"); // typeNumber 0 = auto-select the smallest size that fits
    qr.addData(url);
    qr.make();
    const moduleCount = qr.getModuleCount();
    // The vendored library's quiet zone (the blank border required around
    // any QR code for scanners to lock onto it) defaults to `margin:
    // cellSize * 4` — i.e. 4 module-widths on each side, 8 module-widths
    // total. An earlier version of this code rendered with `createSvgTag({
    // scalable: true })` (an unsized SVG, viewBox = (moduleCount*2+16)
    // units) and then CSS-scaled the whole thing to `moduleCount * cellPx`
    // px via inline style — but that ignores the quiet zone's own share of
    // the viewBox, so the actual per-module size ends up LESS than cellPx
    // and non-integer (e.g. 137 modules at a nominal cellPx=1 rendered at
    // ~0.945px/module, not 1px), undoing the whole point of this
    // calculation. Including the quiet zone in the unit count here, and
    // passing that same cellPx as both `cellSize` and (scaled) `margin` to
    // createSvgTag, makes the library emit an SVG with explicit `width`/
    // `height` attributes that are already an exact integer multiple of
    // cellPx — no separate CSS/inline-style scaling step needed at all.
    const quietZoneUnits = 8;
    const totalUnits = moduleCount + quietZoneUnits;
    // The budget is measured from the container's OWN actual rendered width
    // (`clientWidth`, meaningful now that `.qr-code-container` has
    // `width: 100%` — see that rule's comment) rather than a hardcoded
    // constant, so it adapts to genuinely narrow phones (e.g. 320px wide)
    // where `.qr-modal`/`.qr-modal-content`'s own padding leaves much less
    // room than a desktop-oriented constant would assume.
    // container.clientWidth already includes this container's own 12px
    // padding on each side (box-sizing: border-box, global reset), so that's
    // subtracted back out to get the space actually available to the SVG.
    const availableWidth = container.clientWidth - 24;
    // Fitting inside `availableWidth` is the hard constraint the upper
    // Math.min bound serves, capped at 8px/unit so short-history codes
    // don't render needlessly huge when there's plenty of room. The lower
    // Math.max bound is only 1 (never 0 or negative) — NOT a "readable
    // minimum" of 2, which would override the fit constraint and overflow
    // the container on a dense code in a narrow viewport.
    const cellPx = Math.max(1, Math.min(8, Math.floor(availableWidth / totalUnits)));
    // No `scalable: true` here and no CSS/inline width or height override —
    // `.qr-code-container svg` intentionally has no fixed size in CSS (see
    // that rule) so this element's own `width`/`height` attributes, set
    // below to an exact integer multiple of cellPx, are what the browser
    // actually renders at.
    const svgMarkup = qr.createSvgTag({ cellSize: cellPx, margin: cellPx * (quietZoneUnits / 2) });
    if (myQrToken !== qrRequestToken) return; // superseded by a newer/closed modal — see qrRequestToken's comment
    container.innerHTML = svgMarkup;
  } catch (e) {
    if (myQrToken !== qrRequestToken) return; // same reasoning as above
    // Either the dynamic import failed (see above) or a share payload from
    // a very large watch history exceeded the QR format's maximum data
    // capacity (even at the lowest error-correction level, a QR code tops
    // out around ~2.9KB). The link itself is still valid and copyable
    // below, so degrade to "no QR code" rather than blocking the modal —
    // which is already open with the link showing by this point.
    container.textContent = "QRコードを生成できませんでした（リンクが長すぎる可能性があります）。下のリンクをコピーしてください。";
  }
}

function hideQrModal() {
  document.getElementById("qr-modal").hidden = true;
  const appEl = document.getElementById("app");
  if (appEl) appEl.inert = false;
  // Invalidates this modal's own in-flight QR request (if any) — see
  // qrRequestToken's comment. Not strictly needed when the user immediately
  // opens a new modal afterward (that call bumps the token itself), but
  // matters if they just close and don't reopen: without this, a
  // still-pending request from this now-closed modal could write into the
  // (hidden but still-live) #qr-code-container whenever it finally resolves.
  qrRequestToken++;
  if (qrModalReturnFocusEl) {
    qrModalReturnFocusEl.focus();
    qrModalReturnFocusEl = null;
  }
}

function setupQrModal() {
  const modal = document.getElementById("qr-modal");
  const urlField = document.getElementById("qr-modal-url");
  const closeBtn = document.getElementById("qr-modal-close");
  const copyBtn = document.getElementById("qr-modal-copy");
  // Same stale-cached-HTML scenario as showQrModal()'s null-check: if any of
  // these elements are missing, don't throw here — this is called from
  // init() BEFORE renderList(), so an uncaught exception here would abort
  // init() entirely and the movie list itself would never render, not just
  // the QR/share feature. showQrModal() already falls back to
  // shareUrlFallback() when these elements are missing, so there's simply
  // nothing to wire up here in that case.
  if (!modal || !urlField || !closeBtn || !copyBtn) return;

  closeBtn.addEventListener("click", hideQrModal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) hideQrModal(); // click on the backdrop, not the dialog content
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.hidden) hideQrModal();
  });
  // `#qr-modal-url` is a readonly <textarea> (not a <p>) specifically so
  // keyboard-only users can Tab to it and copy manually — select its full
  // text on focus, mirroring the old prompt()-based fallback's built-in
  // pre-selected text.
  urlField.addEventListener("focus", () => urlField.select());
  copyBtn.addEventListener("click", async () => {
    const url = urlField.value;
    try {
      await navigator.clipboard.writeText(url);
      alert("リンクをコピーしました。");
    } catch (e) {
      // Clipboard API unavailable/blocked — select the link text so a
      // keyboard user can immediately Ctrl+C it as a manual-copy fallback,
      // without needing a mouse or long-press.
      alert("コピーに失敗しました。表示されているリンクを選択してコピーしてください。");
      urlField.focus();
    }
  });
}

function setupFriendRemoval() {
  document.getElementById("btn-remove-friend").addEventListener("click", () => {
    if (!isViewingValidFriend()) return;
    const name = friends[activeProfileId].name;
    if (!confirm(`「${name}」さんのリストを削除しますか？この操作は取り消せません。`)) return;
    // Base the removal on the latest persisted friends list (see
    // applyStateChange()'s comment) so a friend added in another tab isn't
    // silently wiped out by this tab's stale in-memory `friends`. Persist
    // FRIENDS_KEY and ACTIVE_PROFILE_KEY together so a failure partway
    // through can't leave ACTIVE_PROFILE_KEY pointing at the now-deleted
    // friend (with in-memory state already showing "自分" but storage
    // disagreeing) or abort this handler before the profile switcher/list
    // are refreshed.
    const nextFriends = removeFriend(loadJSON(FRIENDS_KEY, {}), activeProfileId);
    const persisted = persistLocalStorageAtomically([FRIENDS_KEY, ACTIVE_PROFILE_KEY], {
      [FRIENDS_KEY]: JSON.stringify(nextFriends),
      [ACTIVE_PROFILE_KEY]: SELF,
    });
    if (!persisted) {
      alert("友達データの削除に失敗しました（保存容量が不足している可能性があります）。");
      return;
    }
    friends = nextFriends;
    activeProfileId = SELF;
    renderProfileSwitcher();
    renderList();
  });
}

function confirmFriendOverwrite(existingFriend, payload) {
  const existingDate = new Date(existingFriend.exportedAt).toLocaleString("ja-JP");
  const incomingDate = new Date(payload.exportedAt).toLocaleString("ja-JP");
  return confirm(
    `「${existingFriend.name}」さんのデータは既に保存されています。\n\n保存済みデータの共有日時: ${existingDate}\n今回のリンクの共有日時: ${incomingDate}\n\n上書きしますか？（自分で手動編集した内容は失われます）`
  );
}

// Handles a `?share=...` link generated by another device's "共有リンクを
// 作成" button. Never auto-syncs afterward — this is a one-time snapshot the
// user can keep editing locally (e.g. checking off a movie a friend
// mentioned watching), independent of the sender's own list going forward.
async function handleIncomingShareLink() {
  const raw = extractShareParam(location.href);
  if (!raw) return;
  const payload = await parseSharePayload(raw);
  // Clean the URL regardless of outcome so a reload doesn't reprocess it.
  history.replaceState(null, "", location.pathname);
  if (!payload) {
    alert("共有リンクの読み込みに失敗しました。リンクが壊れている可能性があります。");
    return;
  }

  // Read the currently persisted friends list (not the module-level
  // `friends` this tab loaded back at its own init() time) just to decide
  // which dialog to show. confirm()/prompt() block this tab's own JS while
  // open, but NOT other tabs — another tab can freely write FRIENDS_KEY
  // during that wait, so this snapshot is re-read again below, right before
  // the actual merge, rather than reused across the dialog.
  const existing = loadJSON(FRIENDS_KEY, {})[payload.id];
  let name;
  if (existing) {
    if (!confirmFriendOverwrite(existing, payload)) return;
    name = existing.name;
  } else {
    const entered = prompt("この友達の名前を入力してください");
    if (!entered || !entered.trim()) return;
    name = entered.trim();
  }

  // Re-read again here, after the blocking dialog(s) above, so a friend
  // another tab added/updated/removed while this tab was waiting on user
  // input isn't silently dropped when this tab overwrites FRIENDS_KEY below.
  const latestFriends = loadJSON(FRIENDS_KEY, {});
  const raceExisting = latestFriends[payload.id];
  if (raceExisting && !existing) {
    // Another tab imported the very same sender's link while THIS tab's
    // name prompt was open (existing was undefined back then, so the user
    // was never asked to confirm an overwrite). Now that a record for this
    // id exists after all, re-run the same overwrite confirmation instead
    // of silently clobbering whatever that other tab just saved (including
    // its own name and any manual edits already made against it).
    if (!confirmFriendOverwrite(raceExisting, payload)) return;
    name = raceExisting.name;
  }
  const nextFriends = upsertFriend(latestFriends, payload.id, {
    name,
    state: payload.state,
    exportedAt: payload.exportedAt,
    importedAt: new Date().toISOString(),
  });
  // This runs (awaited) during init(), before setupTabs()/renderList()/etc.
  // are wired up. If localStorage.setItem() throws (e.g. QuotaExceededError),
  // an uncaught exception here would propagate out of init() itself, leaving
  // the whole checklist blank. persistLocalStorageAtomically() also guards
  // against a partial write (FRIENDS_KEY saved but ACTIVE_PROFILE_KEY failing)
  // leaving the two keys inconsistent with each other.
  const persisted = persistLocalStorageAtomically([FRIENDS_KEY, ACTIVE_PROFILE_KEY], {
    [FRIENDS_KEY]: JSON.stringify(nextFriends),
    [ACTIVE_PROFILE_KEY]: payload.id,
  });
  if (!persisted) {
    alert("友達データの保存に失敗しました（保存容量が不足している可能性があります）。");
    return;
  }
  friends = nextFriends;
  activeProfileId = payload.id;
}

async function init() {
  try {
    const res = await fetch("data/movies.json");
    if (!res.ok) throw new Error(`movies.json fetch failed: ${res.status}`);
    movies = await res.json();
  } catch (e) {
    document.getElementById("movie-list").innerHTML =
      '<p class="empty-state">作品データを読み込めませんでした。通信環境を確認して再読み込みしてください。</p>';
    return;
  }
  await handleIncomingShareLink();
  setupTabs();
  setupUnwatchedToggle();
  setupRatingFilter();
  setupBackup();
  setupProfileSwitcher();
  setupShareButton();
  setupQrModal();
  setupFriendRemoval();
  renderProfileSwitcher();
  renderCountdown();
  renderList();
  setupDateRolloverRefresh();
  loadCharactersInBackground();
}

// Character/prerequisite data is supplementary, so it's fetched *after* the
// core checklist has already rendered rather than awaited in init() — a
// slow or hanging request for it must never delay showing movies.json data
// that's already in hand. Once it resolves, re-render to pick up any
// prerequisite badges.
//
// `charactersLoaded` only flips to true on a *successful* fetch. A failed
// fetch (network error, non-OK response) leaves it false and `characters`
// empty, permanently hiding the "次に見るべき作品" section for this page
// load instead of falling back to "no prerequisites found" — which would
// look identical to "no prerequisites exist" but actually means "couldn't
// check" (see PR #344 Codex review).
function loadCharactersInBackground() {
  fetch("data/characters.json")
    .then((res) => {
      if (!res.ok) throw new Error(`characters.json fetch failed: ${res.status}`);
      return res.json();
    })
    .then((data) => {
      characters = Array.isArray(data) ? data : [];
      charactersLoaded = true;
      // This re-render happens on whatever schedule the network delivers
      // characters.json, possibly while the user already has a checkbox/
      // rating button focused or a "前提作品" <details> open. renderList()
      // rebuilds every card's DOM, so without this, focus would drop to
      // <body> and any open prereq panel would silently close.
      captureInteractionStateForRerender();
      renderList();
      openPrereqMovieIds = new Set(); // one-shot — don't affect later, unrelated renders
    })
    .catch(() => {
      characters = [];
    });
}

function captureInteractionStateForRerender() {
  const active = document.activeElement;
  const context = active && active.closest("#recommended-next-list") ? "recommended" : "main";
  if (active && active.classList.contains("movie-check")) {
    pendingFocus = { movieId: active.dataset.movieId, control: "check", context };
  } else if (active && active.classList.contains("rating-btn")) {
    pendingFocus = { movieId: active.dataset.movieId, control: active.dataset.rating, context };
  }
  openPrereqMovieIds = new Set(
    [...document.querySelectorAll(".prereq-details[open]")].map((el) => el.dataset.movieId)
  );
}

// Countdown text and release-date gating are only computed at render time,
// so a PWA left open across midnight (or resumed from background the next
// day) would keep showing yesterday's countdown and disabled checkboxes for
// movies that released overnight. Re-render whenever the tab regains
// visibility or the calendar date actually changes while foregrounded.
function setupDateRolloverRefresh() {
  let lastDateKey = new Date().toDateString();
  const refreshIfDateChanged = () => {
    const key = new Date().toDateString();
    if (key !== lastDateKey) {
      lastDateKey = key;
      renderCountdown();
      renderList();
    }
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refreshIfDateChanged();
  });
  setInterval(refreshIfDateChanged, 60 * 1000);
}

init();
