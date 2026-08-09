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
} from "./logic.js";

const OWN_STATE_KEY = "marvel-checklist-state-v1";
const FRIENDS_KEY = "marvel-checklist-friends-v1";
const SHARE_ID_KEY = "marvel-checklist-share-id-v1";
const ACTIVE_PROFILE_KEY = "marvel-checklist-active-profile-v1";
const SELF = "self";

let movies = [];
let ownState = loadJSON(OWN_STATE_KEY, {});
let friends = loadJSON(FRIENDS_KEY, {});
let activeProfileId = localStorage.getItem(ACTIVE_PROFILE_KEY) || SELF;
let currentUniverse = "all";
let unwatchedOnly = false;
let activeRatingFilters = new Set(); // display-only filter, like unwatchedOnly — never affects progress or group order
let pendingFocus = null; // { movieId, control } to restore focus after a re-render

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
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

function saveActiveState() {
  if (activeProfileId === SELF || !isViewingValidFriend()) {
    saveOwnState();
  } else {
    saveFriends();
  }
}

function setWatched(id, watched) {
  const store = getActiveStateStore();
  const entry = getEntry(store, id);
  store[id] = { ...entry, watched };
  saveActiveState();
}

function setRating(id, rating) {
  const store = getActiveStateStore();
  const entry = getEntry(store, id);
  store[id] = { ...entry, rating: entry.rating === rating ? null : rating };
  saveActiveState();
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

  return card;
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

// Full backup covers everything (own list + all saved friends' lists), so
// restoring on a new device/browser brings back the whole picture — not
// just whichever profile happened to be selected when exporting.
function setupBackup() {
  document.getElementById("btn-export").addEventListener("click", () => {
    const backup = buildFullBackup({
      own: ownState,
      friends,
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
      } else {
        ownState = validated.own;
        friends = validated.friends;
        activeProfileId =
          validated.activeProfile === SELF || Object.prototype.hasOwnProperty.call(friends, validated.activeProfile)
            ? validated.activeProfile
            : SELF;
        saveOwnState();
        saveFriends();
        saveActiveProfile();
        if (validated.shareId) localStorage.setItem(SHARE_ID_KEY, validated.shareId);
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
    const payload = { id: getOwnShareId(), exportedAt: new Date().toISOString(), state: ownState };
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
    friends = removeFriend(friends, activeProfileId);
    saveFriends();
    activeProfileId = SELF;
    saveActiveProfile();
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

  const existing = friends[payload.id];
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

  friends = upsertFriend(friends, payload.id, {
    name,
    state: payload.state,
    exportedAt: payload.exportedAt,
    importedAt: new Date().toISOString(),
  });
  saveFriends();
  activeProfileId = payload.id;
  saveActiveProfile();
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
