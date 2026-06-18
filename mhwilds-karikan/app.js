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
const ELEMENT_COLOR = { fire: "#e74c3c", water: "#3498db", thunder: "#f1c40f", ice: "#74b9ff", dragon: "#9b59b6" };
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

function getTopElements(n) {
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
  $("#tactics-title").innerHTML = `<span class="header-weapon">${weaponData.name}</span>の基本戦法`;
  const ol = $("#tactics-list");
  ol.innerHTML = "";
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
  $("#cautions-title").innerHTML = `<span class="header-monster">${monsterData.name}</span>の注意点`;
  const ul = $("#cautions-list");
  ul.innerHTML = "";
  monsterData.cautions.forEach((c) => {
    const li = document.createElement("li");
    li.textContent = c.text;
    ul.appendChild(li);
  });
}

function renderHitzoneTable() {
  const wrapper = $("#hitzone-table-wrapper");
  wrapper.innerHTML = "";
  if (!monsterData || !weaponData) return;

  const type = weaponData.type;
  const topElements = getTopElements(2);
  const parts = monsterData.hitzone[type].map((z) => z.part);
  const elData = monsterData.hitzone.element;

  // 各属性の最大値を求める（1位=highlight, 2位=green）
  const elMax = {};
  topElements.forEach((k) => {
    const vals = elData.map((z) => z[k] || 0).sort((a, b) => b - a);
    elMax[k] = { first: vals[0] || 0, second: vals[1] || 0 };
  });

  const showExtract = weaponData.id === "insect-glaive" && monsterData.insect_extract;

  // ヘッダー: 物理 + 属性（属性名に色付き） + エキス
  const elHeaders = topElements.map((k) =>
    `<th style="color:${ELEMENT_COLOR[k]}">${ELEMENT_LABEL[k]}</th>`
  ).join("");
  const extractHeader = showExtract ? '<th class="extract-header">エキス</th>' : "";
  let html = `<table class="hitzone-table"><thead><tr><th>部位</th><th>${TYPE_LABEL[type]}</th>${elHeaders}${extractHeader}</tr></thead><tbody>`;

  parts.forEach((p) => {
    const physVal = monsterData.hitzone[type].find((z) => z.part === p)?.value ?? 0;
    const physClass = physVal >= 45 ? ' class="phys-weak"' : "";

    const elCells = topElements.map((k) => {
      const row = elData.find((z) => z.part === p);
      const val = row ? (row[k] || 0) : 0;
      let cls = "";
      if (val > 0 && val === elMax[k].first) cls = "el-rank1";
      else if (val > 0 && val === elMax[k].second) cls = "el-rank2";
      return `<td${cls ? ` class="${cls}"` : ""}>${val}</td>`;
    }).join("");

    const extractCell = showExtract
      ? `<td class="extract-${monsterData.insect_extract[p] || ""}">${monsterData.insect_extract[p] || "-"}</td>`
      : "";

    html += `<tr><td>${p}</td><td${physClass}>${physVal}</td>${elCells}${extractCell}</tr>`;
  });

  html += "</tbody></table>";
  html += '<div class="hitzone-hint"><span class="phys-weak">赤字</span>の部位は弱点特効が発動します（肉質45以上）</div>';
  wrapper.innerHTML = html;
}

function renderWeaponExtra() {
  const container = $("#weapon-extra");
  container.innerHTML = "";
  if (!weaponData || !weaponData.extra) return;
  if (weaponData.id === "insect-glaive" && monsterData?.insect_extract) return;
  const e = weaponData.extra;
  container.innerHTML = `<div class="extra-note"><span class="extra-label">${e.label}：</span>${e.note}</div>`;
}

function renderQuestScreen() {
  $("#quest-weapon-name").textContent = weaponData?.name ?? "";
  $("#quest-monster-name").textContent = monsterData?.name ?? "";
  renderTactics();
  renderCautions();
  renderHitzoneTable();
  renderWeaponExtra();
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
      <span class="element-label" style="color:${ELEMENT_COLOR[key]}">${ELEMENT_LABEL[key]}</span>
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

function renderSkillList(container, skills) {
  if (!skills || skills.length === 0) {
    container.innerHTML = '<span class="no-data">特になし</span>';
    return;
  }
  container.innerHTML = `<div class="skill-list">${skills.map((s) =>
    `<div class="skill-item"><span class="skill-name">${s.name}</span>${s.note ? `<span class="skill-note">${s.note}</span>` : ""}</div>`
  ).join("")}</div>`;
}

function renderCountermeasures() {
  $("#countermeasure-title").innerHTML = `<span class="header-monster">${monsterData.name}</span>の対策スキル`;
  renderSkillList($("#countermeasure-skills"), monsterData?.prep?.countermeasures);
}

function renderAttackSkills() {
  $("#attack-skills-title").innerHTML = `<span class="header-weapon">${weaponData.name}</span>の汎用攻撃スキル`;
  renderSkillList($("#attack-skills"), weaponData?.skills?.attack);
}

function renderUtilitySkills() {
  $("#utility-skills-title").innerHTML = `<span class="header-weapon">${weaponData.name}</span>のあると便利なスキル`;
  renderSkillList($("#utility-skills"), weaponData?.skills?.utility);
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
  renderCountermeasures();
  renderAttackSkills();
  renderUtilitySkills();
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
