import {
  RATINGS,
  UNIVERSE_LABELS,
  DOOMSDAY_ID,
  isReleased,
  daysUntil,
  formatMonth,
  getEntry,
  computeProgress,
  filterByUniverse,
  filterUnwatched,
  groupMovies,
  validateImportedState,
} from "./logic.js";

const STORAGE_KEY = "marvel-checklist-state-v1";

let movies = [];
let state = loadState();
let currentUniverse = "all";
let unwatchedOnly = false;
let pendingFocus = null; // { movieId, control } to restore focus after a re-render

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function setWatched(id, watched) {
  const entry = getEntry(state, id);
  state[id] = { ...entry, watched };
  saveState();
}

function setRating(id, rating) {
  const entry = getEntry(state, id);
  state[id] = { ...entry, rating: entry.rating === rating ? null : rating };
  saveState();
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
  const { total, watched, pct } = computeProgress(universeFiltered, state);
  document.getElementById("progress-fill").style.width = `${pct}%`;
  document.getElementById("progress-text").textContent =
    total > 0 ? `視聴済み ${watched} / ${total} 本（${pct}%）` : "対象の映画がありません";
}

function renderList() {
  const universeFiltered = filterByUniverse(movies, currentUniverse);
  renderProgress(universeFiltered);

  const displayList = unwatchedOnly ? filterUnwatched(universeFiltered, state) : universeFiltered;

  const listEl = document.getElementById("movie-list");
  listEl.innerHTML = "";

  if (displayList.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "該当する映画がありません";
    listEl.appendChild(empty);
    return;
  }

  for (const group of groupMovies(displayList)) {
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

  restoreFocus();
}

function restoreFocus() {
  if (!pendingFocus) return;
  const { movieId, control } = pendingFocus;
  pendingFocus = null;
  const selector =
    control === "check"
      ? `.movie-check[data-movie-id="${movieId}"]`
      : `.rating-btn[data-movie-id="${movieId}"][data-rating="${control}"]`;
  const el = document.querySelector(selector);
  if (el) el.focus();
}

function renderMovieCard(movie) {
  const entry = getEntry(state, movie.id);
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
  metaEl.innerHTML = `<span>${UNIVERSE_LABELS[movie.universe]}</span><span>${formatMonth(movie.releaseDate)}</span>`;
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

function setupBackup() {
  document.getElementById("btn-export").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
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
      const validated = parsed === undefined ? null : validateImportedState(parsed);
      if (!validated) {
        alert("読み込みに失敗しました。正しいバックアップファイルを選択してください。");
      } else {
        state = validated;
        saveState();
        renderCountdown();
        renderList();
      }
      fileInput.value = "";
    };
    reader.readAsText(file);
  });
}

async function init() {
  const res = await fetch("data/movies.json");
  movies = await res.json();
  setupTabs();
  setupUnwatchedToggle();
  setupBackup();
  renderCountdown();
  renderList();
}

init();
