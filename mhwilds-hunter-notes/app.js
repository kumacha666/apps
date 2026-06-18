const WEAPONS = [
  { id: "insect-glaive", name: "操虫棍" },
  { id: "sword-and-shield", name: "片手剣" }
];
const MONSTERS = [
  { id: "chatacabra", name: "チャタカブラ" },
  { id: "doshaguma", name: "ドシャグマ" },
  { id: "rathalos", name: "リオレウス" }
];
const ELEMENT_LABEL = { fire: "火", water: "水", thunder: "雷", ice: "氷", dragon: "龍" };
const ELEMENT_ORDER = ["fire", "water", "thunder", "ice", "dragon"];
const TYPE_LABEL = { slash: "斬", blunt: "打", shot: "弾" };

let weaponData = null;
let monsterData = null;

const $ = (s) => document.querySelector(s);

function showScreen(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  $(`#${id}`).classList.add("active");
}

function populateSelectors() {
  const ws = $("#weapon-select");
  WEAPONS.forEach((w) => {
    const o = document.createElement("option");
    o.value = w.id; o.textContent = w.name;
    ws.appendChild(o);
  });
  const ms = $("#monster-select");
  MONSTERS.forEach((m) => {
    const o = document.createElement("option");
    o.value = m.id; o.textContent = m.name;
    ms.appendChild(o);
  });
}

function updateButtons() {
  const w = $("#weapon-select").value;
  const m = $("#monster-select").value;
  $("#btn-quest").disabled = !(w && m);
  $("#btn-prep").disabled = !m;
}

async function loadJSON(path) {
  return (await fetch(path)).json();
}

async function loadData() {
  const wId = $("#weapon-select").value;
  const mId = $("#monster-select").value;
  if (wId) weaponData = await loadJSON(`data/weapons/${wId}.json`);
  if (mId) monsterData = await loadJSON(`data/monsters/${mId}.json`);
}

function getTopElements(monsterData, n) {
  const el = monsterData.hitzone.element;
  if (!el || el.length === 0) return [];
  const avgByElement = {};
  ELEMENT_ORDER.forEach((key) => {
    const sum = el.reduce((acc, row) => acc + (row[key] || 0), 0);
    avgByElement[key] = Math.round(sum / el.length);
  });
  return ELEMENT_ORDER
    .filter((k) => avgByElement[k] > 0)
    .sort((a, b) => avgByElement[b] - avgByElement[a])
    .slice(0, n);
}

// === クエスト中モード ===
function renderTactics() {
  const ol = $("#tactics-list");
  ol.innerHTML = "";
  if (!weaponData) return;
  weaponData.tactics.forEach((t) => {
    const li = document.createElement("li");
    let html = `<div class="tactic-title">${t.title}</div>`;
    if (t.combo) {
      html += `<div class="tactic-combo">${t.combo.map((c) => `<span class="input-btn">${c}</span>`).join('<span class="combo-arrow">→</span>')}</div>`;
    }
    html += `<div class="tactic-desc">${t.description}</div>`;
    li.innerHTML = html;
    ol.appendChild(li);
  });
}

function renderCautions() {
  const ul = $("#cautions-list");
  ul.innerHTML = "";
  if (!monsterData) return;
  monsterData.cautions.forEach((c) => {
    const li = document.createElement("li");
    li.textContent = c.text;
    ul.appendChild(li);
  });
}

function renderHitzoneSummary() {
  const container = $("#hitzone-summary");
  container.innerHTML = "";
  if (!monsterData || !weaponData) return;

  const type = weaponData.type;
  const zones = monsterData.hitzone[type];
  if (!zones) return;

  const sorted = [...zones].sort((a, b) => b.value - a.value);
  const top3 = sorted.slice(0, 3);

  // 物理肉質TOP3
  let html = `<div class="hitzone-label">${TYPE_LABEL[type]}肉質 TOP3</div>`;
  top3.forEach((z, i) => {
    html += `<div class="hitzone-row rank-${i + 1}"><span class="hitzone-part">${z.part}</span><span class="hitzone-value">${z.value}</span></div>`;
  });

  // 属性肉質TOP2
  const topElements = getTopElements(monsterData, 2);
  const elData = monsterData.hitzone.element;

  topElements.forEach((elKey) => {
    const elSorted = [...elData].sort((a, b) => (b[elKey] || 0) - (a[elKey] || 0));
    const elTop3 = elSorted.slice(0, 3);
    html += `<div class="hitzone-label element-${elKey}">${ELEMENT_LABEL[elKey]}属性 TOP3</div>`;
    elTop3.forEach((z, i) => {
      html += `<div class="hitzone-row rank-${i + 1}"><span class="hitzone-part">${z.part}</span><span class="hitzone-value">${z[elKey]}</span></div>`;
    });
  });

  container.innerHTML = html;
}

function renderFullHitzoneTable() {
  const wrapper = $("#hitzone-full-wrapper");
  wrapper.innerHTML = "";
  if (!monsterData || !weaponData) return;

  const type = weaponData.type;
  const topElements = getTopElements(monsterData, 2);
  const parts = monsterData.hitzone[type].map((z) => z.part);

  const btn = document.createElement("button");
  btn.className = "show-all-btn";
  btn.textContent = "全部位を表示";
  wrapper.appendChild(btn);

  const fullDiv = document.createElement("div");
  fullDiv.className = "hitzone-full";

  const cols = [TYPE_LABEL[type], ...topElements.map((k) => ELEMENT_LABEL[k])];
  let tableHtml = `<table><thead><tr><th>部位</th>${cols.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>`;

  parts.forEach((p) => {
    const phys = monsterData.hitzone[type].find((z) => z.part === p)?.value ?? "-";
    const elCells = topElements.map((k) => {
      const row = monsterData.hitzone.element.find((z) => z.part === p);
      return row ? (row[k] ?? "-") : "-";
    });
    tableHtml += `<tr><td>${p}</td><td>${phys}</td>${elCells.map((v) => `<td>${v}</td>`).join("")}</tr>`;
  });

  tableHtml += "</tbody></table>";
  fullDiv.innerHTML = tableHtml;
  wrapper.appendChild(fullDiv);

  btn.addEventListener("click", () => {
    const isOpen = fullDiv.classList.toggle("open");
    btn.textContent = isOpen ? "閉じる" : "全部位を表示";
  });
}

function renderWeaponExtra() {
  const container = $("#weapon-extra");
  container.innerHTML = "";
  if (!weaponData || !weaponData.extra) return;
  const e = weaponData.extra;
  container.innerHTML = `<div class="extra-note"><span class="extra-label">${e.label}：</span>${e.note}</div>`;
}

function renderQuestScreen() {
  $("#quest-weapon-name").textContent = weaponData?.name ?? "";
  $("#quest-monster-name").textContent = monsterData?.name ?? "";
  renderTactics();
  renderCautions();
  renderHitzoneSummary();
  renderWeaponExtra();
  renderFullHitzoneTable();
}

// === 出発前モード ===
function renderElementWeakness() {
  const container = $("#element-weakness");
  container.innerHTML = "";
  if (!monsterData) return;

  const el = monsterData.hitzone.element;
  if (!el || el.length === 0) return;

  const avgByElement = {};
  ELEMENT_ORDER.forEach((key) => {
    const sum = el.reduce((acc, row) => acc + (row[key] || 0), 0);
    avgByElement[key] = Math.round(sum / el.length);
  });

  const maxVal = 40;
  const barsDiv = document.createElement("div");
  barsDiv.className = "element-bars";

  ELEMENT_ORDER.forEach((key) => {
    const val = avgByElement[key];
    const pct = Math.min((val / maxVal) * 100, 100);
    const row = document.createElement("div");
    row.className = "element-row";
    row.innerHTML = `
      <span class="element-label">${ELEMENT_LABEL[key]}</span>
      <div class="element-bar-bg"><div class="element-bar-fill ${key}" style="width:${pct}%"></div></div>
      <span class="element-value">${val}</span>`;
    barsDiv.appendChild(row);
  });

  container.appendChild(barsDiv);

  if (monsterData.element_weakness) {
    const hint = document.createElement("div");
    hint.style.cssText = "font-size:0.75rem;color:var(--text-muted);margin-top:0.3rem;";
    hint.textContent = `おすすめ属性: ${monsterData.element_weakness.join(" > ")}`;
    container.appendChild(hint);
  }
}

function renderRequiredSkills() {
  const container = $("#required-skills");
  const skills = monsterData?.prep?.required_skills;
  if (!skills || skills.length === 0) {
    container.innerHTML = '<span class="no-data">特になし</span>';
    return;
  }
  container.innerHTML = `<div class="skill-tags">${skills.map((s) => `<span class="skill-tag">${s}</span>`).join("")}</div>`;
}

function renderTrapInfo() {
  if (!monsterData?.prep) return;
  const p = monsterData.prep;
  const items = [
    { label: "捕獲", value: p.capturable, icon: "🪤" },
    { label: "落とし穴", value: p.pitfall_trap, icon: "🕳️" },
    { label: "シビレ罠", value: p.shock_trap, icon: "⚡" },
    { label: "閃光", value: p.flash_effective, icon: "💡" }
  ];
  $("#trap-info").innerHTML = `<div class="trap-grid">${items.map((it) =>
    `<div class="trap-item"><span>${it.icon}</span><span>${it.label}</span><span class="trap-status ${it.value ? "yes" : "no"}">${it.value ? "○" : "×"}</span></div>`
  ).join("")}</div>`;
}

function renderPrepScreen() {
  $("#prep-weapon-name").textContent = weaponData?.name ?? "";
  $("#prep-monster-name").textContent = monsterData?.name ?? "";
  renderElementWeakness();
  renderRequiredSkills();
  renderTrapInfo();
  $("#prep-notes").textContent = monsterData?.prep?.notes ?? "";
}

// === イベント ===
$("#weapon-select").addEventListener("change", updateButtons);
$("#monster-select").addEventListener("change", updateButtons);

$("#btn-quest").addEventListener("click", async () => { await loadData(); renderQuestScreen(); showScreen("quest-screen"); });
$("#btn-prep").addEventListener("click", async () => { await loadData(); renderPrepScreen(); showScreen("prep-screen"); });
$("#btn-back-quest").addEventListener("click", () => showScreen("selector-screen"));
$("#btn-back-prep").addEventListener("click", () => showScreen("selector-screen"));
$("#btn-to-prep").addEventListener("click", async () => { await loadData(); renderPrepScreen(); showScreen("prep-screen"); });
$("#btn-to-quest").addEventListener("click", async () => { await loadData(); renderQuestScreen(); showScreen("quest-screen"); });

populateSelectors();
