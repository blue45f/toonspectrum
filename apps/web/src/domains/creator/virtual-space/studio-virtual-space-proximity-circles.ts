import type { StudioVirtualSpacePeer, StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import { studioVirtualSpaceDistance } from "./studio-virtual-space-model";
import type { StudioBilingualCopy } from "./studio-virtual-space-proximity";

/**
 * G-1. 근접 서클 대화 (Proximity Conversation Circles)
 *
 * Gather Town식 "완전 공간형" 음성의 toonstudio 적용:
 * - 아바타 거리 기반 음성/영상 페이드인/아웃 (게인 커브)
 * - 2명 이상 근접 시 자동으로 "대화 서클" 형성, UI에 서클 표시
 * - 멀어지면 명시적 나가기 없이 자연스럽게 대화 종료
 *
 * 순수 로직 모듈. 실제 WebRTC 게인 적용은 호출 측(오디오 믹서)에서
 * proximityAudioGain() 값을 사용한다.
 */

/** 서클 형성 반경. 이 거리 안에 2명 이상 모이면 대화 서클이 된다. */
export const STUDIO_PROXIMITY_CIRCLE_RADIUS = 170;
/** 서클 최소 인원 (본인 포함). */
export const STUDIO_PROXIMITY_CIRCLE_MIN_MEMBERS = 2;
/** 서클 최대 인원. 초과분은 가장 가까운 순으로만 포함된다. */
export const STUDIO_PROXIMITY_CIRCLE_MAX_MEMBERS = 4;
/** 게인이 0이 되는 최대 거리. */
export const STUDIO_PROXIMITY_AUDIO_MAX_DISTANCE = 340;
/** 최대 거리 안쪽에서 풀로 들리는 거리. */
export const STUDIO_PROXIMITY_AUDIO_FULL_DISTANCE = 90;

export interface StudioProximityCircle {
  readonly id: string;
  /** 본인 sessionId를 포함한 멤버 목록. 거리 오름차순. */
  readonly memberSessionIds: readonly string[];
  readonly center: StudioVirtualSpacePoint;
  /** 서클 내 최대 멤버 간 거리. UI 링 크기 힌트로 사용. */
  readonly span: number;
}

export interface StudioProximityAudioMix {
  readonly sessionId: string;
  /** 0(무음) ~ 1(풀 볼륨). */
  readonly gain: number;
  /** 대화 서클에 속했는지. */
  readonly inCircle: boolean;
}

/**
 * 거리에 따른 오디오 게인. FULL_DISTANCE 안은 1, MAX_DISTANCE 밖은 0,
 * 사이는 코사인 폴오프(자연스러운 페이드아웃).
 */
export function proximityAudioGain(distance: number): number {
  if (Number.isNaN(distance) || distance <= 0) return 1;
  if (distance === Infinity) return 0;
  if (!Number.isFinite(distance)) return 1;
  if (distance <= STUDIO_PROXIMITY_AUDIO_FULL_DISTANCE) return 1;
  if (distance >= STUDIO_PROXIMITY_AUDIO_MAX_DISTANCE) return 0;
  const t = (distance - STUDIO_PROXIMITY_AUDIO_FULL_DISTANCE)
    / (STUDIO_PROXIMITY_AUDIO_MAX_DISTANCE - STUDIO_PROXIMITY_AUDIO_FULL_DISTANCE);
  // cosine falloff: 1 → 0
  return (1 + Math.cos(t * Math.PI)) / 2;
}

function circleId(memberSessionIds: readonly string[]): string {
  // 멤버 순서(self 먼저, 거리순)를 유지한다. 동일 클라이언트 내에서는
  // selfSessionId가 고정되므로 프레임 간 ID가 안정적이다.
  return `circle-${memberSessionIds.join("+")}`;
}

function circleCenter(points: readonly StudioVirtualSpacePoint[]): StudioVirtualSpacePoint {
  const sum = points.reduce(
    (acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }),
    { x: 0, y: 0 },
  );
  return Object.freeze({ x: sum.x / points.length, y: sum.y / points.length });
}

/**
 * 본인 주변 피어들을 거리 기반 탐욕 클러스터링으로 대화 서클에 묶는다.
 * 본인을 포함한 각 서클은 MIN~MAX 인원을 만족해야 하며, 서클끼리 겹치지 않는다.
 */
export function formProximityCircles(
  selfSessionId: string,
  selfPoint: StudioVirtualSpacePoint,
  peers: readonly StudioVirtualSpacePeer[],
): readonly StudioProximityCircle[] {
  const nearby = peers
    .map((peer) => ({ peer, distance: studioVirtualSpaceDistance(selfPoint, peer.state) }))
    .filter(({ distance }) => distance <= STUDIO_PROXIMITY_CIRCLE_RADIUS)
    .sort((left, right) => left.distance - right.distance
      || left.peer.participant.sessionId.localeCompare(right.peer.participant.sessionId));

  const totalMembers = 1 + nearby.length;
  if (totalMembers < STUDIO_PROXIMITY_CIRCLE_MIN_MEMBERS) return Object.freeze([]);

  const members = nearby.slice(0, STUDIO_PROXIMITY_CIRCLE_MAX_MEMBERS - 1);
  const memberSessionIds = Object.freeze([
    selfSessionId,
    ...members.map(({ peer }) => peer.participant.sessionId),
  ]);
  const points = [
    selfPoint,
    ...members.map(({ peer }) => ({ x: peer.state.x, y: peer.state.y })),
  ];
  const span = members.length === 0
    ? 0
    : Math.max(...members.map(({ distance }) => distance));
  return Object.freeze([Object.freeze({
    id: circleId(memberSessionIds),
    memberSessionIds,
    center: circleCenter(points),
    span,
  })]);
}

/**
 * 본인 기준 각 피어의 오디오 믹스 값을 계산한다.
 * 서클 멤버는 최소 0.35 게인을 보장(서클 안에서는 또렷하게 들림).
 */
export function proximityAudioMixes(
  selfPoint: StudioVirtualSpacePoint,
  peers: readonly StudioVirtualSpacePeer[],
  circles: readonly StudioProximityCircle[],
): readonly StudioProximityAudioMix[] {
  const circleMembers = new Set<string>();
  for (const circle of circles) {
    for (const sessionId of circle.memberSessionIds) circleMembers.add(sessionId);
  }
  return Object.freeze(peers.map((peer) => {
    const distance = studioVirtualSpaceDistance(selfPoint, peer.state);
    const inCircle = circleMembers.has(peer.participant.sessionId);
    const base = proximityAudioGain(distance);
    const gain = inCircle ? Math.max(base, 0.35) : base;
    return Object.freeze({
      sessionId: peer.participant.sessionId,
      gain,
      inCircle,
    });
  }));
}

/**
 * 이전/현재 서클 목록을 비교해 형성·해산 이벤트를 뽑는다.
 * UI 토스트("대화 서클이 형성됐어요") 트리거용.
 */
export interface StudioProximityCircleDiff {
  readonly formed: readonly StudioProximityCircle[];
  readonly dissolved: readonly StudioProximityCircle[];
}

export function diffProximityCircles(
  previous: readonly StudioProximityCircle[],
  current: readonly StudioProximityCircle[],
): StudioProximityCircleDiff {
  const prevIds = new Set(previous.map((circle) => circle.id));
  const currentIds = new Set(current.map((circle) => circle.id));
  return {
    formed: Object.freeze(current.filter((circle) => !prevIds.has(circle.id))),
    dissolved: Object.freeze(previous.filter((circle) => !currentIds.has(circle.id))),
  };
}

/** 서클 설명 문구. UI의 서클 배지·툴팁에 쓴다. */
export function proximityCircleDescriptionCopy(
  bt: StudioBilingualCopy,
  circle: StudioProximityCircle,
): string {
  const count = circle.memberSessionIds.length;
  return bt(
    `${count}명이 대화 중이에요. 가까이 가면 음성이 또렷해져요.`,
    `${count} people are chatting. Move closer for clearer audio.`,
  );
}
