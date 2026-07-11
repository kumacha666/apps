import type { AppContext } from "./ui/context";
import type { Member, RoomState, Phase, CenterCardsData } from "./types";
import {
  generateRoomId,
  generateMemberId,
  joinRoom,
  leaveRoom,
  markOnline,
  listenRoomState,
  listenMembers,
  listenCenterCards,
  maybeAdvancePhase,
} from "./roomSync";
import * as lobbyUi from "./ui/lobby";
import * as nightUi from "./ui/night";
import * as discussUi from "./ui/discuss";
import * as voteUi from "./ui/vote";
import * as resultUi from "./ui/result";

const STORAGE_KEY = "mori-no-yakai-session";
declare const __APP_VERSION__: string;

async function checkForUpdate(): Promise<void> {
  try {
    const res = await fetch("version.json?t=" + Date.now());
    const data = await res.json();
    if (data.version !== __APP_VERSION__) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((name) => caches.delete(name)));
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) await reg.unregister();
      window.location.reload();
    }
  } catch {
    // オフライン等では更新チェックをスキップ
  }
}

let currentRoomId: string | null = null;
let currentMemberId: string | null = null;
let latestState: RoomState | null = null;
let latestMembers: Record<string, Member> = {};
let latestCenterCardsData: CenterCardsData | null = null;
let unsubscribers: Array<() => void> = [];
let tickInterval: ReturnType<typeof setInterval> | null = null;

function screens(): Record<Phase | "home", HTMLElement> {
  return {
    home: document.getElementById("screen-home")!,
    lobby: document.getElementById("screen-lobby")!,
    night: document.getElementById("screen-night")!,
    discuss: document.getElementById("screen-discuss")!,
    vote: document.getElementById("screen-vote")!,
    result: document.getElementById("screen-result")!,
  };
}

function showScreen(name: Phase | "home"): void {
  const all = screens();
  for (const key of Object.keys(all) as Array<Phase | "home">) {
    all[key].classList.toggle("active", key === name);
  }
}

async function enterRoom(roomId: string, name: string): Promise<void> {
  const errorEl = document.getElementById("home-error")!;
  errorEl.textContent = "";
  if (!name.trim()) {
    errorEl.textContent = "なまえを入力してください";
    return;
  }

  const memberId = generateMemberId();
  try {
    await joinRoom(roomId, memberId, name.trim());
  } catch (e) {
    errorEl.textContent = "入室に失敗しました。部屋コードを確認してください。";
    return;
  }

  currentRoomId = roomId;
  currentMemberId = memberId;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ roomId, memberId, name: name.trim() }));

  startListening();
}

function stopListening(): void {
  unsubscribers.forEach((unsub) => unsub());
  unsubscribers = [];
  if (tickInterval !== null) {
    clearInterval(tickInterval);
    tickInterval = null;
  }
}

function startListening(): void {
  if (!currentRoomId || !currentMemberId) return;
  const roomId = currentRoomId;

  stopListening(); // 前の部屋のリスナー・タイマーが残っていれば止める

  unsubscribers.push(
    listenRoomState(roomId, (state) => {
      latestState = state;
      renderCurrentPhase();
    })
  );
  unsubscribers.push(
    listenMembers(roomId, (members) => {
      latestMembers = members;
      renderCurrentPhase();
    })
  );
  unsubscribers.push(
    listenCenterCards(roomId, (data) => {
      latestCenterCardsData = data;
      renderCurrentPhase();
    })
  );

  tickInterval = setInterval(() => {
    if (currentRoomId) void maybeAdvancePhase(currentRoomId);
    renderCurrentPhase(); // タイマー表示の更新のため
  }, 1000);
}

/**
 * スマホのスリープ・タブのバックグラウンド化からの復帰時に呼ぶ。
 * WebSocket切断でonDisconnectが発火しoffline化していても、復帰時に
 * 明示的にonline:trueへ書き戻さないと他プレイヤーからは退室したまま見えてしまう。
 */
function reconnectPresence(): void {
  if (currentRoomId && currentMemberId) {
    void markOnline(currentRoomId, currentMemberId);
  }
}

/** ロビーの「トップに戻る」から呼ばれる。退室してホーム画面に戻り、名前を入力し直せるようにする。 */
function leaveCurrentRoom(): void {
  if (currentRoomId && currentMemberId) {
    void leaveRoom(currentRoomId, currentMemberId);
  }
  stopListening();
  currentRoomId = null;
  currentMemberId = null;
  latestState = null;
  latestMembers = {};
  latestCenterCardsData = null;
  localStorage.removeItem(STORAGE_KEY);
  showScreen("home");
}

function renderCurrentPhase(): void {
  if (!latestState || !currentRoomId || !currentMemberId) return;
  if (!latestMembers[currentMemberId]) return; // 自分のmember情報がまだ来ていない

  // centerCardsとstateは別々のFirebaseリスナーで届くため、届いたcenterCardsが
  // 現在のroundNumberのものとは限らない（前ラウンドの残りが一時的に見えることがある）。
  // roundNumberが一致する場合のみ採用し、一致しなければ「まだ届いていない」として扱う。
  const centerCards =
    latestCenterCardsData?.round === latestState.roundNumber ? latestCenterCardsData.cards : [];

  const ctx: AppContext = {
    roomId: currentRoomId,
    memberId: currentMemberId,
    state: latestState,
    members: latestMembers,
    centerCards,
    requestLeaveRoom: leaveCurrentRoom,
  };

  showScreen(latestState.phase);
  const target = screens()[latestState.phase];

  switch (latestState.phase) {
    case "lobby":
      lobbyUi.render(target, ctx);
      break;
    case "night":
      nightUi.render(target, ctx);
      break;
    case "discuss":
      discussUi.render(target, ctx);
      break;
    case "vote":
      voteUi.render(target, ctx);
      break;
    case "result":
      resultUi.render(target, ctx);
      break;
  }
}

function init(): void {
  document.getElementById("btn-create-room")?.addEventListener("click", () => {
    const name = (document.getElementById("input-name") as HTMLInputElement).value;
    void enterRoom(generateRoomId(), name);
  });

  document.getElementById("btn-join-room")?.addEventListener("click", () => {
    const name = (document.getElementById("input-name") as HTMLInputElement).value;
    const code = (document.getElementById("input-room-code") as HTMLInputElement).value.trim().toUpperCase();
    if (!code) {
      document.getElementById("home-error")!.textContent = "部屋コードを入力してください";
      return;
    }
    void enterRoom(code, name);
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") reconnectPresence();
  });
  window.addEventListener("pageshow", reconnectPresence);
  window.addEventListener("online", reconnectPresence);

  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const session = JSON.parse(saved);
      (document.getElementById("input-name") as HTMLInputElement).value = session.name ?? "";
      if (session.roomId && session.memberId) {
        currentRoomId = session.roomId;
        currentMemberId = session.memberId;
        void joinRoom(session.roomId, session.memberId, session.name).then(() => {
          startListening();
        });
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }
}

init();
void checkForUpdate();
