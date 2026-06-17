const WEAPONS = [
  { id: "insect-glaive", name: "操虫棍" },
  { id: "sword-and-shield", name: "片手剣" }
];

const MONSTERS = [
  { id: "chatacabra", name: "チャタカブラ" },
  { id: "doshaguma", name: "ドシャグマ" },
  { id: "rathalos", name: "リオレウス" }
];

const WEAPON_TYPE_LABEL = { slash: "斬", blunt: "打", shot: "弾" };
const ELEMENT_LABEL = { fire: "火", water: "水", thunder: "雷", ice: "氷", dragon: "龍" };
const ELEMENT_ORDER = ["fire", "water", "thunder", "ice", "dragon"];

let weaponData = null;
let monsterData = null;
let currentWeaponId = "";
let currentMonsterId = "";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function showScreen(id) {
  $$(".screen").forEach((s) => s.classList.remove("active"));
  $(`#${id}`).classList.add("active");
}

function populateSelectors() {
  const ws = $("#weapon-select");
  WEAPONS.forEach((w) => {
    const opt = document.createElement("option");
    opt.value = w.id;
    opt.textContent = w.name;
    ws.appendChild(opt);
  });

  const ms = $("#monster-select");
  MONSTERS.forEach((m) => {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = m.name;
    ms.appendChild(opt);
  });
}

function updateButtons() {
  const w = $("#weapon-select").value;
  const m = $("#monster-select").value;
  $("#btn-quest").disabled = !w;
  $("#btn-prep").disabled = !m;
}

async function loadJSON(path) {
  const res = await fetch(path);
  return res.json();
}

async function loadData() {
  const wId = $("#weapon-select").value;
  const mId = $("#monster-select").value;

  if (wId && wId !== currentWeaponId) {
    weaponData = await loadJSON(`data/weapons/${wId}.json`);
    currentWeaponId = wId;
  }
  if (mId && mId !== currentMonsterId) {
    monsterData = await loadJSON(`data/monsters/${mId}.json`);
    currentMonsterId = mId;
  }
}

function renderHitzone() {
  if (!monsterData || !weaponData) return;
  const type = weaponData.type;
  $("#hitzone-type-label").textContent = WEAPON_TYPE_LABEL[type];

  const tbody = $("#hitzone-table tbody");
  tbody.innerHTML = "";

  const zones = monsterData.hitzone[type];
  if (!zones) return;

  const maxVal = Math.max(...zones.map((z) => z.value));
  const sorted = [...zones].sort((a, b) => b.value - a.value);

  sorted.forEach((z, i) => {
    const tr = document.createElement("tr");
    if (i === 0) tr.className = "best";
    else if (z.value >= 45) tr.className = "good";

    tr.innerHTML = `<td>${z.part}</td><td>${z.value}</td>`;
    tbody.appendChild(tr);
  });
}

function renderCombos() {
  if (!weaponData) return;
  const list = $("#combo-list");
  list.innerHTML = "";

  weaponData.combos.forEach((combo) => {
    const div = document.createElement("div");
    div.className = "combo-item";

    const inputs = combo.inputs
      .map((inp) => `<span class="input-btn">${inp}</span>`)
      .join('<span class="combo-arrow">→</span>');

    div.innerHTML = `
      <div class="combo-name">${combo.name}</div>
      <div class="combo-inputs">${inputs}</div>
      <div class="combo-note">${combo.note}</div>
    `;
    list.appendChild(div);
  });
}

function renderCounter() {
  if (!weaponData) return;
  const c = weaponData.counter;
  const inputs = c.inputs
    .map((inp) => `<span class="input-btn">${inp}</span>`)
    .join('<span class="combo-arrow">→</span>');

  $("#counter-info").innerHTML = `
    <div class="info-block">
      <div class="combo-name">${c.name}</div>
      <div class="info-inputs combo-inputs">${inputs}</div>
      <div class="info-note">${c.note}</div>
    </div>
  `;
}

function renderResource() {
  if (!weaponData) return;
  const r = weaponData.resource;
  const rules = r.rules.map((rule) => `<li>${rule}</li>`).join("");

  $("#resource-info").innerHTML = `
    <div class="combo-name">${r.name}</div>
    <ul class="resource-rules">${rules}</ul>
  `;
}

function renderFocus() {
  if (!weaponData) return;
  const f = weaponData.focus_mode;
  const inputs = f.inputs
    .map((inp) => `<span class="input-btn">${inp}</span>`)
    .join("");

  $("#focus-info").innerHTML = `
    <div class="info-block">
      <div class="info-inputs combo-inputs">${inputs}</div>
      <div class="info-note">${f.note}</div>
    </div>
  `;
}

function renderMonsterNotes(targetId) {
  if (!monsterData) return;
  $(targetId).textContent = monsterData.notes || "特になし";
}

function renderElementWeakness() {
  if (!monsterData) return;
  const el = monsterData.element_weakness;
  const container = $("#element-weakness");
  container.innerHTML = "";

  const maxVal = 40;

  ELEMENT_ORDER.forEach((key) => {
    const val = el[key] || 0;
    const pct = Math.min((val / maxVal) * 100, 100);
    const row = document.createElement("div");
    row.className = "element-row";
    row.innerHTML = `
      <span class="element-label">${ELEMENT_LABEL[key]}</span>
      <div class="element-bar-bg">
        <div class="element-bar-fill ${key}" style="width:${pct}%"></div>
      </div>
      <span class="element-value">${val}</span>
    `;
    container.appendChild(row);
  });
}

function renderRequiredSkills() {
  const container = $("#required-skills");
  if (!monsterData || !monsterData.required_skills || monsterData.required_skills.length === 0) {
    container.innerHTML = '<span class="no-data">特になし</span>';
    return;
  }

  container.innerHTML = `
    <div class="skill-tags">
      ${monsterData.required_skills.map((s) => `<span class="skill-tag">${s}</span>`).join("")}
    </div>
  `;
}

function renderTrapInfo() {
  if (!monsterData) return;

  const items = [
    { label: "捕獲", value: monsterData.capturable, icon: "🪤" },
    { label: "落とし穴", value: monsterData.pitfall_trap, icon: "🕳️" },
    { label: "シビレ罠", value: monsterData.shock_trap, icon: "⚡" },
    { label: "閃光", value: monsterData.flash_effective, icon: "💡" }
  ];

  $("#trap-info").innerHTML = `
    <div class="trap-grid">
      ${items
        .map(
          (item) => `
        <div class="trap-item">
          <span class="trap-icon">${item.icon}</span>
          <span>${item.label}</span>
          <span class="trap-status ${item.value ? "yes" : "no"}">${item.value ? "○" : "×"}</span>
        </div>
      `
        )
        .join("")}
    </div>
  `;
}

function renderQuestScreen() {
  $("#quest-weapon-name").textContent = weaponData ? weaponData.name : "";
  $("#quest-monster-name").textContent = monsterData ? monsterData.name : "";

  renderHitzone();
  renderCombos();
  renderCounter();
  renderResource();
  renderFocus();
  renderMonsterNotes("#monster-notes-text");
}

function renderPrepScreen() {
  $("#prep-weapon-name").textContent = weaponData ? weaponData.name : "";
  $("#prep-monster-name").textContent = monsterData ? monsterData.name : "";

  renderElementWeakness();
  renderRequiredSkills();
  renderTrapInfo();
  renderMonsterNotes("#prep-notes-text");
}

// === イベント ===
$("#weapon-select").addEventListener("change", updateButtons);
$("#monster-select").addEventListener("change", updateButtons);

$("#btn-quest").addEventListener("click", async () => {
  await loadData();
  renderQuestScreen();
  showScreen("quest-screen");
});

$("#btn-prep").addEventListener("click", async () => {
  await loadData();
  renderPrepScreen();
  showScreen("prep-screen");
});

$("#btn-back-quest").addEventListener("click", () => showScreen("selector-screen"));
$("#btn-back-prep").addEventListener("click", () => showScreen("selector-screen"));

$("#btn-to-prep").addEventListener("click", async () => {
  await loadData();
  renderPrepScreen();
  showScreen("prep-screen");
});

$("#btn-to-quest").addEventListener("click", async () => {
  await loadData();
  renderQuestScreen();
  showScreen("quest-screen");
});

// === 初期化 ===
populateSelectors();
