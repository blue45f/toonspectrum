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
