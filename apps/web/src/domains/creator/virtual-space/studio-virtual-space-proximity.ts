/**
 * 근접 반응 (Gather Town proximity social 대응)
 *
 * - 다른 아바타가 인사 반경 안에 들어오면 wave/acknowledge 반응
 * - 대화 반경 안에 머무르면 대화 힌트 표시
 * - 경계 진동 방지를 위한 진입/이탈 히스테리시스
 * - reduced-motion에서는 정적 반응 (애니메이션 이모트 대신 말풍선 텍스트만)
 *
 * 순수 로직 모듈. 실제 렌더링·이모트 실행은 호출 측에서 담당한다.
 */

import type { StudioEmoteKind } from "./studio-virtual-space-emotes";

/** 인사 반경 진입 거리. */
export const STUDIO_PROXIMITY_GREET_RADIUS = 160;
/** 인사 반경 이탈 거리 (히스테리시스). */
export const STUDIO_PROXIMITY_FAREWELL_RADIUS = 220;
/** 대화 힌트 반경 (인사 유지 구간 안). */
export const STUDIO_PROXIMITY_CHAT_RADIUS = 200;

export type StudioProximityRelation = "stranger" | "teammate" | "npc";

export interface StudioProximityPeer {
  readonly id: string;
  readonly relation: StudioProximityRelation;
  readonly displayNameKo: string;
  readonly displayNameEn: string;
}

export type StudioProximityReactionKind = "greet" | "acknowledge" | "chat-hint" | "farewell";

export interface StudioProximityReaction {
  readonly peerId: string;
  readonly kind: StudioProximityReactionKind;
  /** reduced-motion이 아닐 때 함께 실행할 이모트. */
  readonly emote: StudioEmoteKind | null;
  readonly messageKo: string;
  readonly messageEn: string;
}

export interface StudioProximityTrackerState {
  readonly peers: Readonly<Record<string, { readonly greeted: boolean; readonly chatHinted: boolean; readonly acknowledged: boolean }>>;
}

/** 빈 추적 상태. */
export const EMPTY_PROXIMITY_TRACKER: StudioProximityTrackerState = Object.freeze({ peers: {} });

function peerMessage(peer: StudioProximityPeer, kind: StudioProximityReactionKind): { ko: string; en: string } {
  switch (kind) {
    case "greet":
      return peer.relation === "npc"
        ? { ko: `${peer.displayNameKo}이(가) 반갑게 인사합니다.`, en: `${peer.displayNameEn} greets you warmly.` }
        : { ko: `${peer.displayNameKo}님이 가까이 왔습니다.`, en: `${peer.displayNameKo} is nearby.` };
    case "acknowledge":
      return { ko: `${peer.displayNameKo}님이 당신을 알아봤습니다.`, en: `${peer.displayNameEn} noticed you.` };
    case "chat-hint":
      return { ko: `${peer.displayNameKo}님과 대화할 수 있습니다.`, en: `You can chat with ${peer.displayNameEn}.` };
    case "farewell":
      return { ko: `${peer.displayNameKo}님이 멀어졌습니다.`, en: `${peer.displayNameEn} moved away.` };
  }
}

/**
 * 거리 변화에 따른 근접 반응을 계산한다.
 *
 * @param state 이전 추적 상태
 * @param peer 대상
 * @param distance 현재 거리 (px)
 * @param reducedMotion reduced-motion이면 이모트 대신 null
 * @returns [다음 상태, 반응 목록]
 */
export function updateStudioProximity(
  state: StudioProximityTrackerState,
  peer: StudioProximityPeer,
  distance: number,
  reducedMotion: boolean,
): readonly [StudioProximityTrackerState, readonly StudioProximityReaction[]] {
  const safeDistance = Number.isFinite(distance) ? Math.max(0, distance) : Number.POSITIVE_INFINITY;
  const record = state.peers[peer.id] ?? { greeted: false, chatHinted: false, acknowledged: false };
  const reactions: StudioProximityReaction[] = [];
  let greeted = record.greeted;
  let chatHinted = record.chatHinted;
  let acknowledged = record.acknowledged;

  const emoteFor = (kind: StudioEmoteKind | null): StudioEmoteKind | null =>
    reducedMotion ? null : kind;

  const push = (kind: StudioProximityReactionKind, emote: StudioEmoteKind | null) => {
    const message = peerMessage(peer, kind);
    reactions.push({ peerId: peer.id, kind, emote: emoteFor(emote), messageKo: message.ko, messageEn: message.en });
  };

  if (!greeted && safeDistance <= STUDIO_PROXIMITY_GREET_RADIUS) {
    // 첫 진입: 인사
    greeted = true;
    chatHinted = false;
    acknowledged = false;
    push("greet", "wave");
  } else if (greeted && safeDistance >= STUDIO_PROXIMITY_FAREWELL_RADIUS) {
    // 이탈: 작별 (히스테리시스로 경계 진동 방지)
    greeted = false;
    chatHinted = false;
    acknowledged = false;
    push("farewell", null);
  } else if (greeted) {
    // 아주 가까워지면 가볍게 알아봄 (1회성)
    if (!acknowledged && safeDistance <= STUDIO_PROXIMITY_GREET_RADIUS * 0.6) {
      acknowledged = true;
      push("acknowledge", "bow");
    }
    // 대화 반경 안에 머무르면 대화 힌트 (1회성, 멀어졌다 돌아오면 재표시)
    if (!chatHinted && safeDistance <= STUDIO_PROXIMITY_CHAT_RADIUS) {
      chatHinted = true;
      push("chat-hint", null);
    } else if (chatHinted && safeDistance > STUDIO_PROXIMITY_CHAT_RADIUS) {
      chatHinted = false;
    }
  }

  const next: StudioProximityTrackerState = Object.freeze({
    peers: Object.freeze({ ...state.peers, [peer.id]: { greeted, chatHinted, acknowledged } }),
  });
  return [next, reactions] as const;
}

/** 특정 피어의 추적 기록을 제거한다 (퇴장 시). */
export function removeStudioProximityPeer(
  state: StudioProximityTrackerState,
  peerId: string,
): StudioProximityTrackerState {
  if (!(peerId in state.peers)) return state;
  const peers = { ...state.peers };
  delete peers[peerId];
  return Object.freeze({ peers: Object.freeze(peers) });
}

/** 추적 중인 피어 수. */
export function studioProximityPeerCount(state: StudioProximityTrackerState): number {
  return Object.keys(state.peers).length;
}

/** 한/영 문구 선택 함수 (컴포넌트의 useBilingual과 같은 시그니처). */
export type StudioBilingualCopy = (ko: string, en: string) => string;

/** 요약에 필요한 최소 피어 입력 (거리 포함). */
export interface StudioProximityPeerDistance {
  readonly id: string;
  readonly distance: number;
}

export interface StudioProximitySummary {
  readonly total: number;
  /** 음성 연결 반경 안에 있는 피어 수. */
  readonly connected: number;
  /** 반경 밖에 있지만 다가가면 연결 가능한 피어 수. */
  readonly connectable: number;
  /** 가장 가까운 피어. */
  readonly nearest: { readonly id: string; readonly distance: number } | null;
}

/** "다가가면 연결 가능" 판정 배율. */
export const STUDIO_PROXIMITY_CONNECTABLE_MULTIPLIER = 1.5;

/**
 * 근처 피어 요약: 연결 수·다가가면 연결 가능한 수·가장 가까운 피어.
 * 음성 UI의 "다가가면 대화 가능" 힌트와 빈 상태 문구 근거로 쓴다.
 */
export function summarizeStudioProximity(
  peers: readonly StudioProximityPeerDistance[],
  voiceRadius: number,
): StudioProximitySummary {
  const radius = Number.isFinite(voiceRadius) && voiceRadius > 0
    ? voiceRadius
    : STUDIO_PROXIMITY_CHAT_RADIUS;
  let connected = 0;
  let connectable = 0;
  let nearest: StudioProximitySummary["nearest"] = null;
  for (const peer of peers) {
    const distance = Number.isFinite(peer.distance) ? Math.max(0, peer.distance) : Number.POSITIVE_INFINITY;
    if (distance <= radius) {
      connected += 1;
    } else if (distance <= radius * STUDIO_PROXIMITY_CONNECTABLE_MULTIPLIER) {
      connectable += 1;
    }
    if (!nearest || distance < nearest.distance) {
      nearest = { id: peer.id, distance };
    }
  }
  return Object.freeze({ total: peers.length, connected, connectable, nearest });
}

/** "다가가면 대화 가능" 힌트 문구. 표시할 게 없으면 null. */
export function proximityVoiceHintCopy(
  bt: StudioBilingualCopy,
  summary: StudioProximitySummary,
): string | null {
  if (summary.total === 0) return null;
  if (summary.connectable > 0 && summary.connected === 0) {
    return bt(
      `조금만 다가가면 ${summary.connectable}명과 음성으로 대화할 수 있어요.`,
      `Move a little closer to talk with ${summary.connectable} ${summary.connectable === 1 ? "person" : "people"}.`,
    );
  }
  if (summary.connectable > 0) {
    return bt(
      `가까이에 ${summary.connectable}명이 더 있어요. 다가가면 음성이 연결돼요.`,
      `${summary.connectable} more nearby — move closer to connect.`,
    );
  }
  return null;
}

export interface StudioProximityZonePeer extends StudioProximityPeerDistance {
  readonly x: number;
  readonly y: number;
}

export interface StudioPrivateZoneSuggestion {
  /** 본인을 제외한 멤버 id 목록. */
  readonly memberIds: readonly string[];
  readonly center: { readonly x: number; readonly y: number };
  readonly radius: number;
}

/**
 * 프라이빗 대화 영역 제안.
 * - 대화 반경 안에 1명 이상(본인 포함 2명 이상)이 있고
 * - 반경 밖의 가장 가까운 사람이 충분히 멀 때만 제안한다.
 * 제안 조건을 만족하지 않으면 null.
 */
export function suggestPrivateConversationZone(
  selfPoint: { readonly x: number; readonly y: number },
  peers: readonly StudioProximityZonePeer[],
  chatRadius: number = STUDIO_PROXIMITY_CHAT_RADIUS,
): StudioPrivateZoneSuggestion | null {
  const radius = Number.isFinite(chatRadius) && chatRadius > 0
    ? chatRadius
    : STUDIO_PROXIMITY_CHAT_RADIUS;
  const insiders = peers.filter(
    (peer) => Number.isFinite(peer.distance) && peer.distance <= radius,
  );
  if (insiders.length === 0) return null;
  const outsiderDistances = peers
    .map((peer) => peer.distance)
    .filter((distance) => Number.isFinite(distance) && distance > radius);
  const nearestOutsider = outsiderDistances.length === 0
    ? Number.POSITIVE_INFINITY
    : Math.min(...outsiderDistances);
  if (nearestOutsider <= radius * STUDIO_PROXIMITY_CONNECTABLE_MULTIPLIER) return null;
  const points = [selfPoint, ...insiders.map((peer) => ({ x: peer.x, y: peer.y }))];
  const center = {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
  const memberRadius = Math.max(
    ...points.map((point) => Math.hypot(point.x - center.x, point.y - center.y)),
  );
  return Object.freeze({
    memberIds: Object.freeze(insiders.map((peer) => peer.id)),
    center: Object.freeze(center),
    radius: memberRadius + 40,
  });
}
