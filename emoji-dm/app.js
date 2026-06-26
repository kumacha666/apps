import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js';
import {
  getDatabase, ref, push, onChildAdded, onValue, set, serverTimestamp, onDisconnect
} from 'https://www.gstatic.com/firebasejs/11.1.0/firebase-database.js';

// ── Firebase Config ──
// Replace with your own Firebase project config
const firebaseConfig = {
  apiKey: "AIzaSyBEcJVfrNeK_q5pf1tGTJDosGn-Fw7dvq4",
  authDomain: "emoji-dm.firebaseapp.com",
  databaseURL: "https://emoji-dm-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "emoji-dm",
  storageBucket: "emoji-dm.firebasestorage.app",
  messagingSenderId: "125384370581",
  appId: "1:125384370581:web:6a23a3b5e83442af106e9c"
};

let db;
let currentRoom = null;
let myId = null;
let myAvatar = '🐱';
let partnerAvatar = '';
let unsubscribers = [];

// ── Emoji Data ──
const CATEGORIES = [
  { icon: '😀', label: 'かお', emojis: ['😀','😂','🤣','😊','😍','🥰','😘','😗','😙','😚','🤗','🤩','🤔','🤨','😐','😑','😶','🙄','😏','😣','😥','😮','🤐','😯','😪','😫','😴','😌','😛','😜','😝','🤤','😒','😓','😔','😕','🙃','🤑','😲','🙁','😖','😞','😟','😤','😢','😭','😦','😧','😨','😩','🤯','😬','😰','😱','🥵','🥶','😳','🤪','😵','🥴','😠','😡','🤬','😷','🤒','🤕','🤢','🤮','🥺','🥹','😇'] },
  { icon: '❤️', label: 'きもち', emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','♥️','🩷','🩵','🩶','😻','💌','💋','👄','🫶','🫀','❤️‍🔥','❤️‍🩹'] },
  { icon: '👋', label: 'て', emojis: ['👋','🤚','🖐️','✋','🖖','👌','🤌','🤏','✌️','🤞','🫰','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','🫶','👐','🤲','🙏','💪','🫱','🫲','🫳','🫴','🫵'] },
  { icon: '🐱', label: 'どうぶつ', emojis: ['🐱','🐶','🐭','🐹','🐰','🦊','🐻','🐼','🐻‍❄️','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐔','🐧','🐦','🐤','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🐛','🦋','🐌','🐞','🐜','🪲','🐢','🐍','🦎','🐙','🦑','🦀','🐡','🐠','🐟','🐬','🐳','🐋','🦈','🐊'] },
  { icon: '🍕', label: 'たべもの', emojis: ['🍕','🍔','🍟','🌭','🍿','🧂','🥓','🥚','🍳','🧇','🥞','🧈','🍞','🥐','🥨','🥯','🥖','🫓','🧀','🥗','🥙','🥪','🌮','🌯','🫔','🥘','🍝','🍜','🍲','🍛','🍣','🍱','🍤','🍙','🍚','🍘','🍥','🥮','🍢','🍡','🍧','🍨','🍦','🥧','🧁','🍰','🎂','🍮','🍭','🍬','🍫','🍩','🍪','☕','🍵','🧋','🥤','🍺','🍻','🥂','🍷','🍸','🍹','🧃','🍶'] },
  { icon: '⚽', label: 'あそび', emojis: ['⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🪀','🏓','🏸','🏒','🥍','🏏','🪃','🥅','⛳','🪁','🏹','🎣','🤿','🥊','🥋','🎽','🛹','🛼','🛷','⛸️','🥌','🎿','⛷️','🏂','🎮','🕹️','🎲','🎯','🎳','🎪'] },
  { icon: '🌟', label: 'そのほか', emojis: ['🌟','⭐','🌙','☀️','🌈','🔥','💧','❄️','🌸','🌺','🌻','🌹','🌷','🍀','🌿','🍁','🍂','💐','🎁','🎉','🎊','🎈','🎀','🏠','🚗','✈️','🚀','⏰','💡','📱','💻','🎵','🎶','🎤','🎧','📷','🎬','📚','✏️','💰','🔑','💎','🪄','🫧','✨','💫','🌀','🃏','🎭'] },
];

const AVATAR_OPTIONS = ['🐱','🐶','🐰','🐻','🦊','🐼','🐸','🐧','🦄','🐯','🐮','🐷'];

// ── DOM ──
const $ = (s) => document.querySelector(s);
const setupScreen = $('#setup-screen');
const chatScreen = $('#chat-screen');
const messagesEl = $('#messages');
const avatarGrid = $('#avatar-options');
const categoryTabs = $('#category-tabs');
const emojiGrid = $('#emoji-grid');
const waitingBanner = $('#waiting-banner');
const partnerAvatarEl = $('#partner-avatar');
const roomIdDisplay = $('#room-id-display');

// ── Init ──
function init() {
  myId = localStorage.getItem('emoji-dm-id') || crypto.randomUUID();
  localStorage.setItem('emoji-dm-id', myId);

  myAvatar = localStorage.getItem('emoji-dm-avatar') || '🐱';

  renderAvatarPicker();
  renderEmojiBar();
  bindEvents();
  registerSW();
}

function renderAvatarPicker() {
  avatarGrid.innerHTML = '';
  AVATAR_OPTIONS.forEach(a => {
    const btn = document.createElement('button');
    btn.className = 'avatar-option' + (a === myAvatar ? ' selected' : '');
    btn.textContent = a;
    btn.addEventListener('click', () => {
      myAvatar = a;
      localStorage.setItem('emoji-dm-avatar', a);
      avatarGrid.querySelectorAll('.avatar-option').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
    avatarGrid.appendChild(btn);
  });
}

function renderEmojiBar() {
  categoryTabs.innerHTML = '';
  CATEGORIES.forEach((cat, i) => {
    const tab = document.createElement('button');
    tab.className = 'cat-tab' + (i === 0 ? ' active' : '');
    tab.textContent = cat.icon;
    tab.addEventListener('click', () => {
      categoryTabs.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderEmojis(i);
    });
    categoryTabs.appendChild(tab);
  });
  renderEmojis(0);
}

function renderEmojis(catIndex) {
  emojiGrid.innerHTML = '';
  CATEGORIES[catIndex].emojis.forEach(e => {
    const btn = document.createElement('button');
    btn.className = 'emoji-btn';
    btn.textContent = e;
    btn.addEventListener('click', () => sendEmoji(e));
    emojiGrid.appendChild(btn);
  });
  emojiGrid.scrollTop = 0;
}

function bindEvents() {
  $('#btn-create').addEventListener('click', createRoom);
  $('#btn-join').addEventListener('click', () => {
    const code = $('#room-input').value.trim().toUpperCase();
    if (code.length >= 4) joinRoom(code);
  });
  $('#btn-back').addEventListener('click', leaveRoom);
  $('#btn-copy-room').addEventListener('click', copyRoomId);
}

// ── Room ──
function generateRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 5; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function createRoom() {
  const roomId = generateRoomId();
  joinRoom(roomId);
}

function joinRoom(roomId) {
  try {
    const app = initializeApp(firebaseConfig);
    db = getDatabase(app);
  } catch (e) {
    // Already initialized
    db = getDatabase();
  }

  currentRoom = roomId;

  // Set my presence
  const memberRef = ref(db, `rooms/${roomId}/members/${myId}`);
  set(memberRef, { avatar: myAvatar, joinedAt: serverTimestamp() });
  onDisconnect(memberRef).remove();

  switchToChat();
  listenMessages();
  listenMembers();
}

function leaveRoom() {
  unsubscribers.forEach(fn => { if (typeof fn === 'function') fn(); });
  unsubscribers = [];
  currentRoom = null;
  switchToSetup();
}

// ── Screens ──
function switchToChat() {
  setupScreen.classList.remove('active');
  chatScreen.classList.add('active');
  roomIdDisplay.textContent = currentRoom;
  messagesEl.innerHTML = '';
  waitingBanner.classList.remove('hidden');
}

function switchToSetup() {
  chatScreen.classList.remove('active');
  setupScreen.classList.add('active');
}

// ── Messages ──
function sendEmoji(emoji) {
  if (!currentRoom || !db) return;
  const msgRef = ref(db, `rooms/${currentRoom}/messages`);
  push(msgRef, {
    sender: myId,
    emoji,
    avatar: myAvatar,
    ts: serverTimestamp()
  });

  showStampPreview(emoji);
}

function listenMessages() {
  const msgRef = ref(db, `rooms/${currentRoom}/messages`);
  const unsub = onChildAdded(msgRef, (snap) => {
    const msg = snap.val();
    renderMessage(msg);
  });
  unsubscribers.push(unsub);
}

function renderMessage(msg) {
  const isMine = msg.sender === myId;
  const div = document.createElement('div');
  const emojiCount = [...msg.emoji].filter(c => /\p{Emoji}/u.test(c)).length;
  div.className = `msg ${isMine ? 'msg-mine' : 'msg-theirs'}${emojiCount > 3 ? ' msg-multi' : ''}`;

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.textContent = msg.emoji;

  const time = document.createElement('div');
  time.className = 'msg-time';
  const d = msg.ts ? new Date(msg.ts) : new Date();
  time.textContent = d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

  div.appendChild(bubble);
  div.appendChild(time);
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;

  if (!isMine) showStampPreview(msg.emoji);
}

function listenMembers() {
  const membersRef = ref(db, `rooms/${currentRoom}/members`);
  const unsub = onValue(membersRef, (snap) => {
    const members = snap.val() || {};
    const others = Object.entries(members).filter(([id]) => id !== myId);
    if (others.length > 0) {
      const [, data] = others[0];
      partnerAvatar = data.avatar || '❓';
      partnerAvatarEl.textContent = partnerAvatar;
      waitingBanner.classList.add('hidden');
    } else {
      partnerAvatarEl.textContent = '…';
      waitingBanner.classList.remove('hidden');
    }
  });
  unsubscribers.push(unsub);
}

// ── Effects ──
function showStampPreview(emoji) {
  const el = document.createElement('div');
  el.className = 'stamp-preview';
  el.textContent = emoji;
  document.body.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

function copyRoomId() {
  if (!currentRoom) return;
  navigator.clipboard.writeText(currentRoom).then(() => toast('ルームIDをコピーしました'));
}

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init();
