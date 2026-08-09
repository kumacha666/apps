import {
  RATINGS,
  UNRATED_FILTER,
  RATING_FILTER_OPTIONS,
  UNIVERSE_LABELS,
  DOOMSDAY_ID,
  isReleased,
  daysUntil,
  formatMonth,
  getEntry,
  computeProgress,
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
let pendingFocus = null; // { movieId, control } to restore focus after a re-render
let openPrereqMovieIds = new Set(); // one-shot: which "前提作品" <details> to re-open after a render, then cleared

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

function saveOwnState() {
  localStorage.setItem(OWN_STATE_KEY, JSON.stringify(ownState));
}

function saveFriends() {
  localStorage.setItem(FRIENDS_KEY, JSON.stringify(friends));
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

// `movieId` is the single entry that was just edited. For a friend profile,
// only that one entry is merged into the latest persisted friend record —
// not the whole friend object or its whole `state` — so that a *different*
// movie edited for the same friend in another tab isn't clobbered by this
// tab's stale in-memory copy of the rest of that friend's state.
function saveActiveState(movieId) {
  if (activeProfileId === SELF || !isViewingValidFriend()) {
    saveOwnState();
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
  const editedEntry = friends[activeProfileId].state[movieId];
  latestFriends[activeProfileId] = {
    ...latestFriends[activeProfileId],
    state: { ...latestFriends[activeProfileId].state, [movieId]: editedEntry },
  };
  friends = latestFriends;
  saveFriends();
}

function setWatched(id, watched) {
  const store = getActiveStateStore();
  const entry = getEntry(store, id);
  store[id] = { ...entry, watched };
  saveActiveState(id);
}

function setRating(id, rating) {
  const store = getActiveStateStore();
  const entry = getEntry(store, id);
  store[id] = { ...entry, rating: entry.rating === rating ? null : rating };
  saveActiveState(id);
}

function getOwnShareId() {
  let id = localStorage.getItem(SHARE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SHARE_ID_KEY, id);
  }
  return id;
}

function renderCountdown() {
  const doomsday = movies.find((m) => m.id === DOOMSDAY_ID);
  const el = document.getElementById("countdown");
  if (!doomsday) {
    el.textContent = "";
    return;
  }
  const diffDays = daysUntil(doomsday.releaseDate);
  if (diffDays > 0) {
    el.innerHTML = `『${doomsday.title}』公開まで <strong>あと${diffDays}日</strong>`;
  } else if (diffDays === 0) {
    el.innerHTML = `『${doomsday.title}』本日公開！`;
  } else {
    el.textContent = "";
  }
}

function renderProgress(universeFiltered) {
  const { total, watched, pct } = computeProgress(universeFiltered, getActiveStateStore());
  document.getElementById("progress-fill").style.width = `${pct}%`;
  document.getElementById("progress-text").textContent =
    total > 0 ? `視聴済み ${watched} / ${total} 作品（${pct}%）` : "対象の作品がありません";
}

function renderList() {
  const activeState = getActiveStateStore();
  const universeFiltered = filterByUniverse(movies, currentUniverse);
  renderProgress(universeFiltered);

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
      groupEl.appendChild(renderMovieCard(movie));
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
function restoreFocus(emptyStateEl) {
  if (!pendingFocus) return;
  const { movieId, control } = pendingFocus;
  pendingFocus = null;

  const selector =
    control === "check"
      ? `.movie-check[data-movie-id="${movieId}"]`
      : `.rating-btn[data-movie-id="${movieId}"][data-rating="${control}"]`;
  const exact = document.querySelector(selector);
  if (exact) {
    exact.focus();
    return;
  }

  // The exact control is gone; fall back to any other focusable control in
  // the current view. A disabled checkbox (an unreleased movie) can't
  // actually receive focus, so skip those and try a rating button next —
  // rating buttons are never disabled.
  const fallback =
    document.querySelector(".movie-check:not(:disabled)") || document.querySelector(".rating-btn");
  if (fallback) {
    fallback.focus();
    return;
  }

  if (emptyStateEl) emptyStateEl.focus();
}

function renderMovieCard(movie) {
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
    pendingFocus = { movieId: movie.id, control: "check" };
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
      pendingFocus = { movieId: movie.id, control: symbol };
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

  if (unwatched.length === 0) {
    wrapper.classList.add("prereq-all-watched");
    wrapper.textContent = "✓ 前提作品はすべて視聴済み";
    return wrapper;
  }

  const details = document.createElement("details");
  details.className = "prereq-details";
  details.dataset.movieId = movie.id;
  if (openPrereqMovieIds.has(movie.id)) details.open = true;
  const summary = document.createElement("summary");
  summary.textContent = `🔗 前提作品：${unwatched.length}件未視聴（全${prereqs.length}件）`;
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
    // Read the latest persisted own/friends state rather than this tab's
    // possibly-stale in-memory copies — otherwise edits made in another tab
    // since this tab's own load would be missing from the exported backup.
    const backup = buildFullBackup({
      own: loadJSON(OWN_STATE_KEY, {}),
      friends: loadJSON(FRIENDS_KEY, {}),
      shareId: localStorage.getItem(SHARE_ID_KEY),
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
    activeProfileId = select.value;
    saveActiveProfile();
    updateFriendViewIndicators();
    renderList();
  });
}

function setupShareButton() {
  document.getElementById("btn-share").addEventListener("click", async () => {
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
      return;
    }
    // Read the latest persisted own state rather than this tab's possibly-
    // stale in-memory ownState, so edits made in another tab since this
    // tab's own load aren't missing from the generated link.
    const latestOwnState = loadJSON(OWN_STATE_KEY, {});
    const payload = { id: shareId, exportedAt: new Date().toISOString(), state: latestOwnState };
    const url = buildShareUrl(location.origin + location.pathname, payload);
    try {
      await navigator.clipboard.writeText(url);
      alert("共有リンクをコピーしました。友達に送ってください。");
    } catch (e) {
      prompt("このリンクをコピーして友達に送ってください。", url);
    }
  });
}

function setupFriendRemoval() {
  document.getElementById("btn-remove-friend").addEventListener("click", () => {
    if (!isViewingValidFriend()) return;
    const name = friends[activeProfileId].name;
    if (!confirm(`「${name}」さんのリストを削除しますか？この操作は取り消せません。`)) return;
    // Base the removal on the latest persisted friends list (see
    // saveActiveState()'s comment) so a friend added in another tab isn't
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

// Handles a `?share=...` link generated by another device's "共有リンクを
// 作成" button. Never auto-syncs afterward — this is a one-time snapshot the
// user can keep editing locally (e.g. checking off a movie a friend
// mentioned watching), independent of the sender's own list going forward.
function handleIncomingShareLink() {
  const raw = extractShareParam(location.href);
  if (!raw) return;
  const payload = parseSharePayload(raw);
  // Clean the URL regardless of outcome so a reload doesn't reprocess it.
  history.replaceState(null, "", location.pathname);
  if (!payload) {
    alert("共有リンクの読み込みに失敗しました。リンクが壊れている可能性があります。");
    return;
  }

  // Re-read the currently persisted friends list rather than trusting the
  // module-level `friends` this tab loaded back at its own init() time —
  // e.g. another tab may have imported a different friend since then, and
  // merging into a stale in-memory copy would silently drop that friend
  // when this tab overwrites FRIENDS_KEY below.
  const latestFriends = loadJSON(FRIENDS_KEY, {});

  const existing = latestFriends[payload.id];
  let name;
  if (existing) {
    const existingDate = new Date(existing.exportedAt).toLocaleString("ja-JP");
    const incomingDate = new Date(payload.exportedAt).toLocaleString("ja-JP");
    const ok = confirm(
      `「${existing.name}」さんのデータは既に保存されています。\n\n保存済みデータの共有日時: ${existingDate}\n今回のリンクの共有日時: ${incomingDate}\n\n上書きしますか？（自分で手動編集した内容は失われます）`
    );
    if (!ok) return;
    name = existing.name;
  } else {
    const entered = prompt("この友達の名前を入力してください");
    if (!entered || !entered.trim()) return;
    name = entered.trim();
  }

  const nextFriends = upsertFriend(latestFriends, payload.id, {
    name,
    state: payload.state,
    exportedAt: payload.exportedAt,
    importedAt: new Date().toISOString(),
  });
  // This runs synchronously during init(), before setupTabs()/renderList()/etc.
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
  handleIncomingShareLink();
  setupTabs();
  setupUnwatchedToggle();
  setupRatingFilter();
  setupBackup();
  setupProfileSwitcher();
  setupShareButton();
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
function loadCharactersInBackground() {
  fetch("data/characters.json")
    .then((res) => (res.ok ? res.json() : []))
    .then((data) => {
      characters = Array.isArray(data) ? data : [];
      if (characters.length > 0) {
        // This re-render happens on whatever schedule the network delivers
        // characters.json, possibly while the user already has a checkbox/
        // rating button focused or a "前提作品" <details> open. renderList()
        // rebuilds every card's DOM, so without this, focus would drop to
        // <body> and any open prereq panel would silently close.
        captureInteractionStateForRerender();
        renderList();
        openPrereqMovieIds = new Set(); // one-shot — don't affect later, unrelated renders
      }
    })
    .catch(() => {
      characters = [];
    });
}

function captureInteractionStateForRerender() {
  const active = document.activeElement;
  if (active && active.classList.contains("movie-check")) {
    pendingFocus = { movieId: active.dataset.movieId, control: "check" };
  } else if (active && active.classList.contains("rating-btn")) {
    pendingFocus = { movieId: active.dataset.movieId, control: active.dataset.rating };
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
