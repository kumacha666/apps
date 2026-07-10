import {
  ref,
  set,
  update,
  get,
  onValue,
  onDisconnect,
  runTransaction,
  type Unsubscribe,
} from "firebase/database";
import { db } from "./firebase";
import type { Member, RoomState, RoleConfig, RoleId } from "./types";
import { buildRoleDeck, buildNightOrder, shuffle, defaultRoleConfig } from "./roles";
import {
  NIGHT_STEP_DURATION_MS,
  VOTE_DURATION_MS,
  DEFAULT_DISCUSS_DURATION_MS,
} from "./gameLogic";

const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateRoomId(): string {
  let id = "";
  for (let i = 0; i < 5; i++) {
    id += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  }
  return id;
}

export function generateMemberId(): string {
  return crypto.randomUUID();
}

/** 部屋に入室する。まだ部屋が存在しなければロビー状態として初期化する。 */
export async function joinRoom(
  roomId: string,
  memberId: string,
  name: string,
  avatar: string
): Promise<void> {
  const memberRef = ref(db, `rooms/${roomId}/members/${memberId}`);
  const stateRef = ref(db, `rooms/${roomId}/state`);

  const stateSnap = await get(stateRef);
  if (!stateSnap.exists()) {
    const initialState: RoomState = {
      phase: "lobby",
      hostId: memberId,
      createdAt: Date.now(),
      roleConfig: defaultRoleConfig(1),
      nightOrder: [],
      nightStepIndex: 0,
      nightStepEndsAt: 0,
      discussDurationMs: DEFAULT_DISCUSS_DURATION_MS,
      discussEndsAt: 0,
      voteEndsAt: 0,
    };
    await set(stateRef, initialState);
  }

  const member: Member = {
    id: memberId,
    name,
    avatar,
    online: true,
    joinedAt: Date.now(),
  };
  await set(memberRef, member);
  onDisconnect(ref(db, `rooms/${roomId}/members/${memberId}/online`)).set(false);
}

export function listenRoomState(roomId: string, cb: (state: RoomState | null) => void): Unsubscribe {
  return onValue(ref(db, `rooms/${roomId}/state`), (snap) => cb(snap.val()));
}

export function listenMembers(
  roomId: string,
  cb: (members: Record<string, Member>) => void
): Unsubscribe {
  return onValue(ref(db, `rooms/${roomId}/members`), (snap) => cb(snap.val() ?? {}));
}

export function listenCenterCards(
  roomId: string,
  cb: (cards: RoleId[]) => void
): Unsubscribe {
  return onValue(ref(db, `rooms/${roomId}/centerCards`), (snap) => cb(snap.val() ?? []));
}

/** ホストがロビーで役職構成を変更する。 */
export async function updateRoleConfig(roomId: string, config: RoleConfig): Promise<void> {
  await update(ref(db, `rooms/${roomId}/state`), { roleConfig: config });
}

/** ホストがロビーで議論タイマーの長さを変更する。 */
export async function updateDiscussDuration(roomId: string, discussDurationMs: number): Promise<void> {
  await update(ref(db, `rooms/${roomId}/state`), { discussDurationMs });
}

/** ホストが「人数に合わせて初期化」を押したときに使う。 */
export function resetRoleConfigToDefault(playerCount: number): RoleConfig {
  return defaultRoleConfig(playerCount);
}

/**
 * ホストがゲームを開始する。部屋ルート（state + members + centerCards）を
 * トランザクションで一括更新し、役職シャッフル・配布・夜順の決定を原子的に行う。
 */
export async function startGame(roomId: string): Promise<void> {
  await runTransaction(ref(db, `rooms/${roomId}`), (room) => {
    if (!room || !room.state || room.state.phase !== "lobby") return room;
    const members: Record<string, Member> = room.members ?? {};
    const memberIds = Object.keys(members);
    if (memberIds.length < 3) return room; // 最低3人必要

    const deck = buildRoleDeck(memberIds.length, room.state.roleConfig);
    const shuffled = shuffle(deck);
    const dealt = shuffled.slice(0, memberIds.length);
    const center = shuffled.slice(memberIds.length);

    memberIds.forEach((id, i) => {
      members[id].originalRole = dealt[i];
      members[id].currentRole = dealt[i];
      members[id].vote = undefined;
    });

    const nightOrder = buildNightOrder(dealt);

    room.members = members;
    room.centerCards = center;
    room.state = {
      ...room.state,
      phase: nightOrder.length > 0 ? "night" : "discuss",
      nightOrder,
      nightStepIndex: 0,
      nightStepEndsAt: Date.now() + NIGHT_STEP_DURATION_MS,
      discussEndsAt: Date.now() + room.state.discussDurationMs,
    };
    return room;
  });
}

/** きつねが他プレイヤーと自分のカードを交換する。 */
export async function robberSwap(
  roomId: string,
  selfId: string,
  targetId: string
): Promise<RoleId> {
  const selfRef = ref(db, `rooms/${roomId}/members/${selfId}/currentRole`);
  const targetRef = ref(db, `rooms/${roomId}/members/${targetId}/currentRole`);
  const [selfSnap, targetSnap] = await Promise.all([get(selfRef), get(targetRef)]);
  const selfRole: RoleId = selfSnap.val();
  const targetRole: RoleId = targetSnap.val();
  await update(ref(db, `rooms/${roomId}/members`), {
    [`${selfId}/currentRole`]: targetRole,
    [`${targetId}/currentRole`]: selfRole,
  });
  return targetRole;
}

/** 投票フェーズでの投票を書き込む。 */
export async function submitVote(roomId: string, memberId: string, targetId: string): Promise<void> {
  await update(ref(db, `rooms/${roomId}/members/${memberId}`), { vote: targetId });
}

/**
 * 各クライアントが定期的に呼び出し、期限切れのフェーズをトランザクションで進める。
 * 複数クライアントが同時に呼んでも、トランザクションにより二重遷移は起きない。
 */
export async function maybeAdvancePhase(roomId: string): Promise<void> {
  await runTransaction(ref(db, `rooms/${roomId}/state`), (state: RoomState | null) => {
    if (!state) return state;
    const now = Date.now();

    if (state.phase === "night" && now >= state.nightStepEndsAt) {
      const nextIndex = state.nightStepIndex + 1;
      if (nextIndex >= state.nightOrder.length) {
        return {
          ...state,
          phase: "discuss",
          discussEndsAt: now + state.discussDurationMs,
        };
      }
      return {
        ...state,
        nightStepIndex: nextIndex,
        nightStepEndsAt: now + NIGHT_STEP_DURATION_MS,
      };
    }

    if (state.phase === "discuss" && now >= state.discussEndsAt) {
      return {
        ...state,
        phase: "vote",
        voteEndsAt: now + VOTE_DURATION_MS,
      };
    }

    if (state.phase === "vote" && now >= state.voteEndsAt) {
      return { ...state, phase: "result" };
    }

    return state;
  });
}

/** 全員投票済みなら投票フェーズを早めに締め切る。 */
export async function maybeCloseVoteEarly(roomId: string): Promise<void> {
  const membersSnap = await get(ref(db, `rooms/${roomId}/members`));
  const members: Record<string, Member> = membersSnap.val() ?? {};
  const online = Object.values(members).filter((m) => m.online);
  if (online.length === 0 || !online.every((m) => m.vote)) return;

  await runTransaction(ref(db, `rooms/${roomId}/state`), (state: RoomState | null) => {
    if (!state || state.phase !== "vote") return state;
    return { ...state, phase: "result" };
  });
}

/** ホストが結果画面から「もう一度あそぶ」を押したときに使う。 */
export async function resetToLobby(roomId: string): Promise<void> {
  await runTransaction(ref(db, `rooms/${roomId}`), (room) => {
    if (!room || !room.state) return room;
    const members: Record<string, Member> = room.members ?? {};
    for (const id of Object.keys(members)) {
      members[id].originalRole = undefined;
      members[id].currentRole = undefined;
      members[id].vote = undefined;
    }
    room.members = members;
    room.centerCards = null;
    room.state = {
      ...room.state,
      phase: "lobby",
      nightOrder: [],
      nightStepIndex: 0,
      nightStepEndsAt: 0,
      voteEndsAt: 0,
    };
    return room;
  });
}
