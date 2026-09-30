/**
 * 버블·방송 화면 공유 라우팅 (E-1).
 *
 * A-6의 로컬 스크린 공유(`studio-virtual-space-screen-share.ts`) 위에 두 개의
 * 공유 경로를 얹는다.
 * - 버블 경로: 근접 그룹(버블 반경 내 아바타)에게만 보이는 말풍선 스타일 공유.
 *   웹툰 콘티 리뷰에서 옆자리 작가에게 어깨너머로 보여줄 때 쓴다.
 * - 방송 경로: A-4 스포트라이트 세션의 발표자 화면 공유. 전체 청중에게 송출된다.
 *
 * 이 모듈은 "로컬 상태 + UI 미리보기" 범위만 다룬다. 실제 미디어 송출(RTC)은
 * 연결되어 있지 않으며, 대역폭 옵션은 송출 측에 전달할 힌트 값이다.
 */

import { DEFAULT_STUDIO_SCREEN_VISIBILITY_RADIUS } from "./studio-virtual-space-object-runtime";

export type StudioShareRoute = "bubble" | "broadcast";

/** 대역폭 스로틀 옵션 (WorkAdventure v1.17 방식 아이디어). 송출 측 힌트로 전달한다. */
export type StudioShareBandwidth = "full" | "balanced" | "low";

export interface StudioShareBandwidthHint {
  readonly id: StudioShareBandwidth;
  /** 권장 최대 너비(px). */
  readonly maxWidth: number;
  /** 권장 최대 프레임레이트(fps). */
  readonly maxFps: number;
}

export const STUDIO_SHARE_BANDWIDTH_HINTS: readonly StudioShareBandwidthHint[] = [
  { id: "full", maxWidth: 1920, maxFps: 30 },
  { id: "balanced", maxWidth: 1280, maxFps: 15 },
  { id: "low", maxWidth: 854, maxFps: 8 },
] as const;

export function resolveStudioShareBandwidthHint(id: unknown): StudioShareBandwidthHint {
  return STUDIO_SHARE_BANDWIDTH_HINTS.find((hint) => hint.id === id) ?? STUDIO_SHARE_BANDWIDTH_HINTS[1]!;
}

/** 버블 공유 반경(px). A-6 대형 스크린의 기본 가시 반경과 동일하게 둔다. */
export const STUDIO_BUBBLE_SHARE_RADIUS = DEFAULT_STUDIO_SCREEN_VISIBILITY_RADIUS;

export interface StudioBubbleShareParticipant {
  readonly id: string;
  readonly label: string;
}

export interface StudioBubbleShareSession {
  readonly id: string;
  readonly sharerId: string;
  readonly sharerLabel: string;
  readonly participants: readonly StudioBubbleShareParticipant[];
  readonly bandwidth: StudioShareBandwidth;
  readonly startedAt: number;
}

const cleanId = (value: string): string | null => {
  const text = value.trim();
  return /^[a-z0-9][a-z0-9:_-]{0,127}$/iu.test(text) ? text : null;
};

const cleanLabel = (value: string): string => value.trim().slice(0, 40);

/**
 * 버블 공유 세션 생성. 공유자 id가 비어 있거나 참가자가 없으면 null.
 * 참가자 목록에 공유자가 없으면 자동으로 맨 앞에 추가한다.
 */
export function createBubbleShareSession(input: {
  readonly id: string;
  readonly sharerId: string;
  readonly sharerLabel: string;
  readonly participants: readonly StudioBubbleShareParticipant[];
  readonly bandwidth?: StudioShareBandwidth;
  readonly now?: number;
}): StudioBubbleShareSession | null {
  const id = cleanId(input.id);
  const sharerId = cleanId(input.sharerId);
  if (!id || !sharerId) return null;
  const seen = new Set<string>();
  const participants: StudioBubbleShareParticipant[] = [];
  for (const raw of input.participants) {
    const participantId = cleanId(raw.id);
    if (!participantId || seen.has(participantId)) continue;
    seen.add(participantId);
    participants.push({ id: participantId, label: cleanLabel(raw.label) || participantId });
  }
  if (!seen.has(sharerId)) {
    participants.unshift({ id: sharerId, label: cleanLabel(input.sharerLabel) || sharerId });
  }
  if (participants.length === 0) return null;
  return Object.freeze({
    id,
    sharerId,
    sharerLabel: cleanLabel(input.sharerLabel) || sharerId,
    participants: Object.freeze(participants),
    bandwidth: input.bandwidth ?? "balanced",
    startedAt: Number.isFinite(input.now) ? (input.now as number) : Date.now(),
  });
}

/** 버블 공유 가시성: 공유자와의 거리가 버블 반경 이내일 때만 보인다. */
export function bubbleShareVisibleTo(distancePx: number): boolean {
  if (!Number.isFinite(distancePx) || distancePx < 0) return false;
  return distancePx <= STUDIO_BUBBLE_SHARE_RADIUS;
}

/**
 * 공유 경로 판정.
 * - 스포트라이트 방송이 켜져 있고 공유자가 발표자면 "broadcast".
 * - 그 외에는 "bubble" (근접 그룹 공유).
 */
export function resolveShareRoute(input: {
  readonly spotlightActive: boolean;
  readonly presenterId: string | null;
  readonly sharerId: string;
}): StudioShareRoute {
  if (input.spotlightActive && input.presenterId !== null && input.presenterId === input.sharerId) {
    return "broadcast";
  }
  return "bubble";
}

/** 세션에 참가자가 아닌 아바타가 공유를 볼 수 있는지 (경로별 판정). */
export function canWatchShare(
  session: StudioBubbleShareSession,
  viewerId: string,
  distancePx: number,
  route: StudioShareRoute,
): boolean {
  if (route === "broadcast") return true;
  if (viewerId === session.sharerId) return true;
  if (!session.participants.some((participant) => participant.id === viewerId)) return false;
  return bubbleShareVisibleTo(distancePx);
}
