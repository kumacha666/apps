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
  DEFAULT_NIGHT_STEP_DURATION_MS,
  DEFAULT_DISCUSS_DURATION_MS,
  advanceNightState,
  advanceDiscussState,
  advanceVoteState,
  isNightStepComplete,
  isDiscussComplete,
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
export async function joinRoom(roomId: string, memberId: string, name: string): Promise<void> {
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
      nightStepDurationMs: DEFAULT_NIGHT_STEP_DURATION_MS,
      nightStepEndsAt: 0,
      discussDurationMs: DEFAULT_DISCUSS_DURATION_MS,
      discussEndsAt: 0,
      voteEndsAt: 0,
      roundNumber: 0,
    };
    await set(stateRef, initialState);
  }

  // 再入室（リロード）時にoriginalRole/currentRole/voteを消さないよう、
  // 既存メンバーはプロフィール・プレゼンスのみをupdateする
  const memberSnap = await get(memberRef);
  if (memberSnap.exists()) {
    await update(memberRef, { name, online: true });
  } else {
    const member: Member = {
      id: memberId,
      name,
      online: true,
      joinedAt: Date.now(),
    };
    await set(memberRef, member);
  }
  onDisconnect(ref(db, `rooms/${roomId}/members/${memberId}/online`)).set(false);
}

/**
 * スマホのスリープ・タブのバックグラウンド復帰時に再接続を明示する。
 * WebSocket切断でonDisconnectが発火しoffline化した後、復帰時に自動ではonline:trueに
 * 戻らないため、visibilitychange等から呼び出してプレゼンスとonDisconnectを再登録する。
 */
export async function markOnline(roomId: string, memberId: string): Promise<void> {
  await update(ref(db, `rooms/${roomId}/members/${memberId}`), { online: true });
  onDisconnect(ref(db, `rooms/${roomId}/members/${memberId}/online`)).set(false);
}

/** ロビーから「トップに戻る」を押したときに使う。オンライン状態だけをfalseにして退室扱いにする。 */
export async function leaveRoom(roomId: string, memberId: string): Promise<void> {
  await update(ref(db, `rooms/${roomId}/members/${memberId}`), { online: false });
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
    // 配札はオンラインのメンバーのみが対象（切断した幽霊メンバーには配らない）
    const onlineIds = Object.keys(members).filter((id) => members[id].online);
    if (onlineIds.length < 3) return room; // 最低3人必要

    const deck = buildRoleDeck(onlineIds.length, room.state.roleConfig);
    const shuffled = shuffle(deck);
    const dealt = shuffled.slice(0, onlineIds.length);
    const center = shuffled.slice(onlineIds.length);

    // RTDBはトランザクション結果にundefinedを含む値を拒否するため、
    // フィールドのクリアは代入ではなくdeleteで行う
    for (const id of Object.keys(members)) {
      delete members[id].originalRole;
      delete members[id].currentRole;
      delete members[id].vote;
      delete members[id].nightReadyStep;
      delete members[id].discussReadyRound;
    }
    onlineIds.forEach((id, i) => {
      members[id].originalRole = dealt[i];
      members[id].currentRole = dealt[i];
    });

    const nightOrder = buildNightOrder(dealt);
    // nightStepDurationMsはこの設定の追加前に作られた部屋には存在しない可能性があるため
    // デフォルトにフォールバックする（欠けたままだとDate.now()+undefinedがNaNになり、
    // RTDBがトランザクション結果を拒否してゲーム開始自体が失敗する）
    const nightStepDurationMs = room.state.nightStepDurationMs ?? DEFAULT_NIGHT_STEP_DURATION_MS;

    room.members = members;
    room.centerCards = center;
    room.state = {
      ...room.state,
      phase: nightOrder.length > 0 ? "night" : "discuss",
      nightOrder,
      nightStepIndex: 0,
      nightStepDurationMs,
      nightStepEndsAt: Date.now() + nightStepDurationMs,
      discussEndsAt: Date.now() + room.state.discussDurationMs,
      roundNumber: (room.state.roundNumber ?? 0) + 1,
    };
    return room;
  });
}

/** ホストがロビーで夜アクションの制限時間を変更する。 */
export async function updateNightStepDuration(roomId: string, nightStepDurationMs: number): Promise<void> {
  await update(ref(db, `rooms/${roomId}/state`), { nightStepDurationMs });
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

/**
 * 投票フェーズでの投票を書き込む。
 * フェーズがvoteでなくなった後の遅延書き込みが確定済みの結果を覆さないよう、
 * 部屋ルートのトランザクションでフェーズを検証してから書き込む。
 */
export async function submitVote(roomId: string, memberId: string, targetId: string): Promise<void> {
  await runTransaction(ref(db, `rooms/${roomId}`), (room) => {
    if (!room || !room.state || room.state.phase !== "vote") return room;
    if (!room.members?.[memberId]) return room;
    room.members[memberId].vote = targetId;
    return room;
  });
}

/**
 * 各クライアントが定期的に呼び出し、期限切れのフェーズをトランザクションで進める。
 * 複数クライアントが同時に呼んでも、トランザクションにより二重遷移は起きない。
 *
 * startGame/resetToLobby/submitVote等と同じ部屋ルート（rooms/{roomId}）を
 * トランザクション対象にすること。RTDBは異なるパスに対するトランザクション同士の
 * 排他性を保証しないため、`state`だけを対象にすると親を書き換える他の操作と
 * 競合し、フェーズが巻き戻る・メンバー情報が消えるといった不整合が起きうる。
 */
export async function maybeAdvancePhase(roomId: string): Promise<void> {
  await runTransaction(ref(db, `rooms/${roomId}`), (room) => {
    if (!room || !room.state) return room;
    const state: RoomState = room.state;
    const now = Date.now();

    if (state.phase === "night" && now >= state.nightStepEndsAt) {
      room.state = advanceNightState(state, now);
    } else if (state.phase === "discuss" && now >= state.discussEndsAt) {
      room.state = advanceDiscussState(state, now);
    } else if (state.phase === "vote" && now >= state.voteEndsAt) {
      room.state = advanceVoteState(state);
    }

    return room;
  });
}

/**
 * 夜アクション画面で「つぎへ」をタップしたことを記録する。該当役職の人だけがタップすると
 * 誰が誰か推測できてしまうため、全員（待機中の人も含む）がタップする想定。
 */
export async function markNightReady(roomId: string, memberId: string, stepIndex: number): Promise<void> {
  await runTransaction(ref(db, `rooms/${roomId}`), (room) => {
    if (!room?.state || room.state.phase !== "night" || room.state.nightStepIndex !== stepIndex) {
      return room;
    }
    if (!room.members?.[memberId]) return room;
    room.members[memberId].nightReadyStep = stepIndex;
    return room;
  });
  await maybeCloseNightStepEarly(roomId);
}

/** 配札済みかつオンラインの全員が現在の夜ステップでタップ済みなら、早めに次のステップへ進める。 */
export async function maybeCloseNightStepEarly(roomId: string): Promise<void> {
  const snap = await get(ref(db, `rooms/${roomId}`));
  const room = snap.val();
  if (!room?.state || room.state.phase !== "night") return;
  const members: Record<string, Member> = room.members ?? {};
  const participantsList = Object.values(members).filter((m) => m.originalRole);
  if (!isNightStepComplete(participantsList, room.state.nightStepIndex)) return;

  await runTransaction(ref(db, `rooms/${roomId}`), (r) => {
    if (!r?.state || r.state.phase !== "night" || r.state.nightStepIndex !== room.state.nightStepIndex) {
      return r;
    }
    r.state = advanceNightState(r.state, Date.now());
    return r;
  });
}

/**
 * 議論画面で「つぎへ」をタップしたことを記録する。夜ステップと違い議論は1ラウンドにつき
 * 1回しかないため、stepIndexの代わりにroundNumberをキーにする。
 */
export async function markDiscussReady(roomId: string, memberId: string, roundNumber: number): Promise<void> {
  await runTransaction(ref(db, `rooms/${roomId}`), (room) => {
    if (!room?.state || room.state.phase !== "discuss" || room.state.roundNumber !== roundNumber) {
      return room;
    }
    if (!room.members?.[memberId]) return room;
    room.members[memberId].discussReadyRound = roundNumber;
    return room;
  });
  await maybeCloseDiscussEarly(roomId);
}

/** 配札済みかつオンラインの全員が議論フェーズでタップ済みなら、早めに投票フェーズへ進める。 */
export async function maybeCloseDiscussEarly(roomId: string): Promise<void> {
  const snap = await get(ref(db, `rooms/${roomId}`));
  const room = snap.val();
  if (!room?.state || room.state.phase !== "discuss") return;
  const members: Record<string, Member> = room.members ?? {};
  const participantsList = Object.values(members).filter((m) => m.originalRole);
  if (!isDiscussComplete(participantsList, room.state.roundNumber)) return;

  await runTransaction(ref(db, `rooms/${roomId}`), (r) => {
    if (!r?.state || r.state.phase !== "discuss" || r.state.roundNumber !== room.state.roundNumber) {
      return r;
    }
    r.state = advanceDiscussState(r.state, Date.now());
    return r;
  });
}

/** 配札済みかつオンラインのプレイヤー全員が投票済みなら、投票フェーズを早めに締め切る。 */
export async function maybeCloseVoteEarly(roomId: string): Promise<void> {
  const membersSnap = await get(ref(db, `rooms/${roomId}/members`));
  const members: Record<string, Member> = membersSnap.val() ?? {};
  const onlineParticipants = Object.values(members).filter((m) => m.online && m.originalRole);
  if (onlineParticipants.length === 0 || !onlineParticipants.every((m) => m.vote)) return;

  await runTransaction(ref(db, `rooms/${roomId}`), (room) => {
    if (!room?.state || room.state.phase !== "vote") return room;
    room.state = advanceVoteState(room.state);
    return room;
  });
}

/** ホストが結果画面から「もう一度あそぶ」を押したときに使う。 */
export async function resetToLobby(roomId: string): Promise<void> {
  await runTransaction(ref(db, `rooms/${roomId}`), (room) => {
    if (!room || !room.state) return room;
    const members: Record<string, Member> = room.members ?? {};
    // undefined代入はRTDBに拒否されるためdeleteでクリアする
    for (const id of Object.keys(members)) {
      delete members[id].originalRole;
      delete members[id].currentRole;
      delete members[id].vote;
      delete members[id].nightReadyStep;
      delete members[id].discussReadyRound;
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
