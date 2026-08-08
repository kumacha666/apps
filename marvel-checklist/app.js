const STORAGE_KEY = "marvel-checklist-state-v1";
const RATINGS = ["◎", "〇", "△", "✕"];
const UNIVERSE_LABELS = { mcu: "MCU", sony: "ソニー", fox: "フォックス", other: "その他" };
const DOOMSDAY_ID = "avengers-doomsday";

let movies = [];
let state = loadState();
let currentUniverse = "all";
let unwatchedOnly = false;

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

function getEntry(id) {
  return state[id] || { watched: false, rating: null };
}

function setWatched(id, watched) {
  const entry = getEntry(id);
  entry.watched = watched;
  state[id] = entry;
  saveState();
}

function setRating(id, rating) {
  const entry = getEntry(id);
  entry.rating = entry.rating === rating ? null : rating;
  state[id] = entry;
  saveState();
}

function isReleased(movie) {
  return new Date(movie.releaseDate) <= new Date();
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}年${d.getMonth() + 1}月`;
}

function renderCountdown() {
  const doomsday = movies.find((m) => m.id === DOOMSDAY_ID);
  const el = document.getElementById("countdown");
  if (!doomsday) {
    el.textContent = "";
    return;
  }
  const today = new Date();
  const target = new Date(doomsday.releaseDate);
  const diffDays = Math.ceil((target - today) / (1000 * 60 * 60 * 24));
  if (diffDays > 0) {
    el.innerHTML = `『${doomsday.title}』公開まで <strong>あと${diffDays}日</strong>`;
  } else if (diffDays === 0) {
    el.innerHTML = `『${doomsday.title}』本日公開！`;
  } else {
    el.textContent = "";
  }
}

function renderProgress(filtered) {
  const total = filtered.filter(isReleased).length;
  const watched = filtered.filter((m) => isReleased(m) && getEntry(m.id).watched).length;
  const pct = total > 0 ? Math.round((watched / total) * 100) : 0;
  document.getElementById("progress-fill").style.width = `${pct}%`;
  document.getElementById("progress-text").textContent =
    total > 0 ? `視聴済み ${watched} / ${total} 本（${pct}%）` : "対象の映画がありません";
}

function filteredMovies() {
  return movies.filter((m) => {
    if (currentUniverse !== "all" && m.universe !== currentUniverse) return false;
    if (unwatchedOnly && getEntry(m.id).watched) return false;
    return true;
  });
}

function groupMovies(list) {
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

function renderList() {
  const filtered = filteredMovies();
  renderProgress(filtered);
  const listEl = document.getElementById("movie-list");
  listEl.innerHTML = "";

  if (filtered.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "該当する映画がありません";
    listEl.appendChild(empty);
    return;
  }

  const groups = groupMovies(filtered);
  for (const group of groups) {
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
}

function renderMovieCard(movie) {
  const entry = getEntry(movie.id);
  const released = isReleased(movie);

  const card = document.createElement("div");
  card.className = "movie-card" + (entry.watched ? " watched" : "");

  const main = document.createElement("label");
  main.className = "movie-main";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "movie-check";
  checkbox.checked = entry.watched;
  checkbox.disabled = !released;
  checkbox.addEventListener("change", () => {
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
  metaEl.innerHTML = `<span>${UNIVERSE_LABELS[movie.universe]}</span><span>${formatDate(movie.releaseDate)}</span>`;
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
  for (const symbol of RATINGS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "rating-btn" + (entry.rating === symbol ? " selected" : "");
    btn.textContent = symbol;
    btn.addEventListener("click", () => {
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
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
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
      try {
        const imported = JSON.parse(reader.result);
        if (typeof imported !== "object" || imported === null) throw new Error("invalid");
        state = imported;
        saveState();
        renderCountdown();
        renderList();
      } catch (e) {
        alert("読み込みに失敗しました。正しいバックアップファイルを選択してください。");
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
