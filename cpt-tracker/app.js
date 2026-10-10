// DOM描画とイベント配線のみ。判定・集計は logic.js（テスト済み）に置く。
import { buildRows, judge, baselineRankMap, pointsForPlacement } from "./logic.js";

const STORE_KEY = "cpt-tracker-v1";
const VIEW_HELP = {
  confirmed: "確定した結果だけを足した合計。生存中の選手の8列目は未加算。",
  floor: "生存中の選手は「今負けた場合の順位」のポイントを加算した合計（最低保証）。",
  ceil: "生存中の選手は準優勝（300pt）まで進んだ場合の合計（最大）。優勝すると出場権を得てポイント枠から外れる。",
};
const PLACEMENT_CHOICES = [
  [1, "1位（優勝・ポイント無し）"], [2, "2位（300）"], [3, "3位（250）"], [4, "4位（200）"],
  [5, "5位タイ（150）"], [7, "7位タイ（100）"], [9, "9位タイ（50）"], [13, "13位タイ（30）"],
  [17, "17位タイ（20）"], [25, "25位タイ（10）"], [33, "33位以下（0）"],
];

const $ = (id) => document.getElementById(id);
const h = (tag, props = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
  return el;
};

// ---- 永続設定（端末内のみ。壊れていても動く） -----------------------
function loadStore() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
    return { view: "floor", filter: "all", overrides: {}, qualifiedExtra: {}, ...s };
  } catch {
    return { view: "floor", filter: "all", overrides: {}, qualifiedExtra: {} };
  }
}
function saveStore() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state.store)); } catch { /* 保存できなくても表示には影響しない */ }
}

const state = {
  config: null,
  baseline: null,
  live: null,
  liveError: null,
  lastOkAt: null,
  loading: false,
  store: loadStore(),
  current: null, // { rows(ranked), meta }
  editingKey: null,
};

// ---- 取得 ------------------------------------------------------------
async function fetchLive() {
  const url = state.config.apiUrl;
  if (!url) return;
  state.loading = true;
  renderStatus();
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "取得に失敗しました");
    state.live = data;
    state.liveError = null;
    state.lastOkAt = new Date();
  } catch (e) {
    state.liveError = String(e.message || e);
  } finally {
    state.loading = false;
    recompute();
  }
}

// ---- 計算→描画 --------------------------------------------------------
function recompute() {
  const { baseline, config, live, store } = state;
  const built = buildRows({ baseline, config, live, overrides: store.overrides, qualifiedExtra: store.qualifiedExtra });
  const ranked = judge(built.rows, config, store.view, { premierDecided: built.premierDecided });
  const baseRanks = baselineRankMap(built.rows, config.rules);
  state.current = { rows: ranked, built, baseRanks };
  render();
}

function render() {
  renderStatus();
  renderBanners();
  renderSummary();
  renderControls();
  renderTable();
}

function fmtTime(d) {
  return d ? d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Tokyo" }) : "";
}

function phaseLabel(live) {
  if (!live) return "";
  const ev = String(live.eventState || "").toUpperCase();
  if (ev === "COMPLETED") return "大会終了";
  const active = (live.phases || []).filter((p) => String(p.state).toUpperCase() === "ACTIVE");
  const last = active[active.length - 1] || (live.phases || [])[0];
  return last ? `${last.name} 進行中` : "進行中";
}

function renderStatus() {
  const el = $("status");
  el.replaceChildren();
  const { config, live } = state;
  if (!config.apiUrl) {
    el.append(h("span", { class: "pill warn", text: "ライブ取得 未設定（手動入力モード）" }));
    return;
  }
  if (live) {
    el.append(h("span", { class: "pill live", text: phaseLabel(live) }));
    const alive = live.aliveCount;
    if (alive != null && String(live.eventState).toUpperCase() !== "COMPLETED") el.append(h("span", { class: "pill", text: `生存 ${alive}人` }));
  }
  if (state.loading) el.append(h("span", { class: "pill", text: "更新中…" }));
  else if (state.lastOkAt) el.append(h("span", { class: "pill", text: `最終更新 ${fmtTime(state.lastOkAt)}` }));
  if (state.liveError) el.append(h("span", { class: "pill err", text: state.lastOkAt ? "再取得に失敗（前回データを表示中）" : "取得に失敗" }));
}

function renderBanners() {
  const box = $("banners");
  box.replaceChildren();
  const { config, liveError, current, live } = state;
  if (!config.apiUrl) {
    box.append(h("div", { class: "banner" }, "start.ggからの自動取得はまだ設定されていません（セットアップ: gas/SETUP.md）。行をタップすると、EVO Franceの結果を手動で入力して計算できます。"));
  }
  if (liveError) box.append(h("div", { class: "banner err" }, `ライブ取得エラー: ${liveError}`));
  if (live && current) {
    const absent = current.rows
      .filter((r) => r.evo.state === "absent" && !r.qualified && r.baseTotal >= 200)
      .map((r) => r.name);
    if (absent.length) {
      box.append(h("div", { class: "banner" },
        `start.ggの参加者に見つからない選手（不参加なら問題なし／別のタグで出場しているなら data/config.json の aliases に登録）: ${absent.join(" / ")}`));
    }
  }
}

function renderSummary() {
  const box = $("summary");
  box.replaceChildren();
  const cur = state.current;
  if (!cur) return;
  const pool = cur.rows.filter((r) => !r.qualified);
  const slots = state.config.cupSlots;
  const count = (k) => pool.filter((r) => r.safety === k).length;
  const locked = count("locked");
  const elim = count("eliminated");
  const winonly = count("winonly");
  const contested = count("contested");
  const open = Math.max(slots - locked, 0);
  box.append(
    h("div", { class: "card ok" }, h("b", { text: String(locked) }), h("span", { text: `確定圏内（残り${open}枠）` })),
    h("div", { class: "card" }, h("b", { text: String(contested) }), h("span", { text: "争い中" })),
    h("div", { class: "card warn", title: "ポイント枠は絶望だが、優勝（または既に出場権を持つ人が優勝した場合の準優勝以下への繰り下がり）で出場権を得られる" }, h("b", { text: String(winonly) }), h("span", { text: "優勝のみ" })),
    h("div", { class: "card ng" }, h("b", { text: String(elim) }), h("span", { text: "圏外確定" })),
  );
}

function renderControls() {
  for (const b of document.querySelectorAll("[data-view]")) b.setAttribute("aria-pressed", String(b.dataset.view === state.store.view));
  for (const b of document.querySelectorAll("[data-filter]")) b.setAttribute("aria-pressed", String(b.dataset.filter === state.store.filter));
  $("viewHelp").textContent = VIEW_HELP[state.store.view];
}

const SAFETY_LABEL = {
  qualified: ["出場権", "q"],
  locked: ["確定圏内", "ok"],
  winonly: ["優勝のみ", "mid"],
  eliminated: ["圏外確定", "ng"],
  contested: ["争い中", "mid"],
};

function evoCell(r, config) {
  const evo = r.evo;
  if (evo.state === "final") {
    const pts = r.evoPoints;
    const place = evo.placement;
    const cell = h("td", { class: "num evo " + (pts > 0 ? "got" : "zero") });
    if (place === 1) {
      cell.append(h("span", { class: "win", text: "優勝" }));
    } else {
      cell.append(String(pts));
      if (place != null && place <= config.rules.lastPlace) cell.append(h("small", { text: `${place}位` }));
    }
    return cell;
  }
  if (evo.state === "alive") {
    const range = r.evoFloor === r.evoCeil ? String(r.evoFloor) : `${r.evoFloor}〜${r.evoCeil}`;
    return h("td", { class: "num evo alive", title: "進行中: 最低保証〜最大" }, h("span", { class: "range", text: range }));
  }
  if (evo.state === "absent") return h("td", { class: "num evo zero absent", title: "start.ggの名簿に見つかりません（欠場とみなして0）", text: "0" });
  return h("td", { class: "num evo none", text: "–" });
}

// "チーム | タグ" をタグ強調で描画（スマホでは2段表示にして固定列の幅を節約する）
function nameParts(name) {
  const i = name.lastIndexOf("|");
  if (i < 0) return h("span", { class: "tg", text: name });
  return [h("span", { class: "tm", text: name.slice(0, i).trim() }), h("span", { class: "tg", text: name.slice(i + 1).trim() })];
}

function renderTable() {
  const { config, baseline } = state;
  const cur = state.current;
  const thead = $("thead");
  const tbody = $("tbody");
  thead.replaceChildren();
  tbody.replaceChildren();
  if (!cur) return;

  const labels = baseline.events;
  thead.append(
    h("tr", {},
      h("th", { class: "c-rank", rowspan: "2", text: "順位" }),
      h("th", { class: "c-name", rowspan: "2", text: "選手" }),
      h("th", { colspan: String(labels.length), text: "Premierポイント" }),
      h("th", { class: "c-total", rowspan: "2", text: "合計" }),
      h("th", { class: "c-state", rowspan: "2", text: "Cup13" }),
    ),
    h("tr", {}, labels.map((l, i) => h("th", { class: "c-ev" + (i === config.liveEvent.premierIndex ? " live" : ""), title: l, text: String(i + 1) }))),
  );

  const view = state.store.view;
  let poolCount = 0;
  let lineDrawn = false;
  for (const r of cur.rows) {
    const inPool = !r.qualified;
    if (inPool) poolCount += 1;
    const filtered = state.store.filter === "contest" && !(r.safety === "contested" || r.safety === "locked");
    // 8枠の区切り線は、表示フィルタに関係なく枠の8人目の直後に引く
    const afterLine = inPool && poolCount === config.cupSlots + 1 && !lineDrawn;
    if (afterLine) {
      lineDrawn = true;
      tbody.append(h("tr", { class: "line" }, h("td", { colspan: String(labels.length + 4), text: `▲ ここまでが Premierポイント枠（出場権保持者を除く上位${config.cupSlots}名）` })));
    }
    if (filtered) continue;

    const delta = r.baseRank != null ? (cur.baseRanks.get(r.key) ?? r.rank) - r.rank : null;
    const deltaEl = delta ? h("small", { class: delta > 0 ? "up" : "down", text: (delta > 0 ? "▲" : "▼") + Math.abs(delta) }) : null;
    const [label, cls] = SAFETY_LABEL[r.safety];
    const tr = h("tr", { class: `row ${cls}` + (r.isNew ? " newp" : ""), tabindex: "0", "data-key": r.key });
    tr.append(
      h("td", { class: "c-rank num" }, String(r.rank), r.rankTied ? h("small", { class: "tie", title: "同率（CAPCOM抽選）", text: "同率" }) : null, deltaEl),
      h("td", { class: "c-name" }, nameParts(r.name), r.isNew ? h("small", { class: "tag", text: "NEW" }) : null, r.evo.manual ? h("small", { class: "tag", text: "手動" }) : null),
    );
    r.events.forEach((p, i) => {
      if (i === config.liveEvent.premierIndex) tr.append(evoCell(r, config));
      else tr.append(h("td", { class: "num ev" }, p ? String(p) : ""));
    });
    tr.append(
      h("td", { class: "num c-total" }, h("b", { text: String(r.totals[view]) }),
        view !== "confirmed" && r.totals[view] !== r.totals.confirmed ? h("small", { text: `確定 ${r.totals.confirmed}` }) : null),
      h("td", { class: "c-state" }, h("span", { class: `badge ${cls}`, title: r.safety === "winonly" ? "ポイント枠は圏外。優勝（または既に出場権を持つ人が優勝した場合の準優勝以下への繰り下がり）のみ出場権の可能性あり" : null, text: label + (r.safety === "qualified" && r.qualifiedBy === "premier" ? "（今大会）" : "") })),
    );
    const open = () => openDetail(r.key);
    tr.addEventListener("click", open);
    tr.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
    tbody.append(tr);
  }
}

// ---- 詳細ダイアログ（手動入力） -----------------------------------------
function openDetail(key) {
  const cur = state.current;
  const r = cur.rows.find((x) => x.key === key);
  if (!r) return;
  state.editingKey = key;
  const { baseline, config } = state;
  $("dTitle").textContent = r.name;
  $("dSummary").textContent = `事前の合計 ${r.baseTotal}pt ／ 現在の見込み 確定 ${r.totals.confirmed}・最低保証 ${r.totals.floor}・最大 ${r.totals.ceil}`;

  const t = $("dEvents");
  t.replaceChildren(
    h("tr", {}, baseline.events.map((_, i) => h("th", { text: String(i + 1) }))),
    h("tr", {}, r.events.map((p, i) => h("td", { class: "num" }, i === config.liveEvent.premierIndex ? (r.evo.state === "final" ? String(r.evoPoints) : r.evo.state === "alive" ? `${r.evoFloor}〜${r.evoCeil}` : "") : p ? String(p) : ""))),
  );

  const sel = $("dPlacement");
  sel.replaceChildren(h("option", { value: "auto", text: "自動（start.ggの結果）" }), ...PLACEMENT_CHOICES.map(([v, l]) => h("option", { value: String(v), text: l })));
  const ov = state.store.overrides[key];
  sel.value = Number.isFinite(ov) ? String(ov) : "auto";

  const q = state.store.qualifiedExtra[key];
  $("dQualified").value = q === true ? "yes" : q === false ? "no" : "auto";
  $("detail").showModal();
}

function applyDetail() {
  const key = state.editingKey;
  if (!key) return;
  const p = $("dPlacement").value;
  if (p === "auto") delete state.store.overrides[key];
  else state.store.overrides[key] = Number(p);
  const q = $("dQualified").value;
  if (q === "auto") delete state.store.qualifiedExtra[key];
  else state.store.qualifiedExtra[key] = q === "yes";
  saveStore();
  recompute();
}

// ---- 起動 -----------------------------------------------------------
async function init() {
  const [config, baseline] = await Promise.all([
    fetch("data/config.json").then((r) => r.json()),
    fetch("data/baseline.json").then((r) => r.json()),
  ]);
  state.config = config;
  state.baseline = baseline;
  $("title").textContent = config.title;
  $("subtitle").textContent = `${config.liveEvent.label} の結果を反映 ／ 基準: ${baseline.asOf}時点のCAPCOM公式ランキング`;

  for (const b of document.querySelectorAll("[data-view]")) {
    b.addEventListener("click", () => { state.store.view = b.dataset.view; saveStore(); recompute(); });
  }
  for (const b of document.querySelectorAll("[data-filter]")) {
    b.addEventListener("click", () => { state.store.filter = b.dataset.filter; saveStore(); render(); });
  }
  $("refresh").addEventListener("click", () => fetchLive());
  $("dCancel").addEventListener("click", () => $("detail").close());
  $("dReset").addEventListener("click", () => {
    delete state.store.overrides[state.editingKey];
    delete state.store.qualifiedExtra[state.editingKey];
    saveStore();
    $("detail").close();
    recompute();
  });
  $("detailForm").addEventListener("submit", () => applyDetail());

  recompute();
  await fetchLive();
  setInterval(() => { if (!document.hidden) fetchLive(); }, Math.max(config.refreshSec || 60, 20) * 1000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) fetchLive(); });

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
}

init().catch((e) => {
  $("status").replaceChildren(h("span", { class: "pill err", text: `起動に失敗しました: ${e.message}` }));
});
