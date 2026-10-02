import { easeInOutCubic } from "./studio-virtual-space-locomotion-feel";
import type { StudioVirtualSpaceFacing, StudioVirtualSpacePoint } from "./studio-virtual-space-model";

/**
 * 아바타 자세 상태 머신 (서기/앉기/눕기)
 *
 * - 의자/소파 근처에서 "휴식"을 요청하면 앉기, 빈 공간이면 눕기를 자동 선택한다.
 * - "언제 어떤 자세로 전이할지"만 판정하는 순수 로직 모듈이다.
 *   실제 스프라이트 시트·블렌딩 렌더링은 트랙1 모션 세트가 담당한다
 *   (계약: `studio-virtual-space-motion-api.ts`의 StudioMotionRequest).
 * - 호출 측(Phaser 캔버스)은 이 결과를 받아 pose 상태를 갱신하고 렌더러에 전달한다.
 */

/** 아바타 자세. */
export type StudioSpacePose = "stand" | "sit" | "lie";

/**
 * 자세 요청.
 * - "rest": 문맥에 따라 앉기/눕기를 자동 선택 (의자·소파 근처 → 앉기, 빈 공간 → 눕기)
 * - "stand": 일어서기
 */
export type StudioSpacePoseRequest = "rest" | "stand";

/** 앉을 수 있는 자리 앵커 (의자/소파·인터랙션 슬롯에서 변환). */
export interface StudioSeatAnchor {
  readonly point: StudioVirtualSpacePoint;
  readonly facing: StudioVirtualSpaceFacing;
  /** 앉기 판정 반경(px). */
  readonly radius: number;
}

/** 자세 전이 애니메이션 시간 (ms). */
export const STUDIO_SPACE_POSE_TRANSITION_MS = 380;

/** 눕기 판정에 쓰는 최소 빈 공간 반경(px) 가이드. */
export const STUDIO_SPACE_LIE_CLEARANCE_RADIUS = 44;

function finitePoint(point: StudioVirtualSpacePoint): StudioVirtualSpacePoint {
  return {
    x: Number.isFinite(point.x) ? point.x : 0,
    y: Number.isFinite(point.y) ? point.y : 0,
  };
}

function nearestSeatAnchor(
  position: StudioVirtualSpacePoint,
  anchors: readonly StudioSeatAnchor[],
): StudioSeatAnchor | null {
  let best: StudioSeatAnchor | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const anchor of anchors) {
    const radius = Number.isFinite(anchor.radius) && anchor.radius > 0 ? anchor.radius : 0;
    const distance = Math.hypot(position.x - anchor.point.x, position.y - anchor.point.y);
    if (distance <= radius && distance < bestDistance) {
      best = anchor;
      bestDistance = distance;
    }
  }
  return best;
}

export type StudioSpacePoseRejectReason = "moving" | "already-standing" | "already-resting" | "no-suitable-spot";

export interface StudioSpacePoseResult {
  readonly pose: StudioSpacePose;
  /** 요청이 받아들여졌는지. */
  readonly accepted: boolean;
  /** 거부 사유 (accepted=false일 때만). */
  readonly reason: StudioSpacePoseRejectReason | null;
  /** 앉기 앵커 (pose === "sit"일 때). */
  readonly anchor: StudioSeatAnchor | null;
  /** 전이 시작 시각 (accepted=true일 때 now와 동일). */
  readonly transitionStartedAt: number | null;
}

/**
 * 자세 요청을 판정한다.
 *
 * - 이동 중에는 자세를 바꿀 수 없다 (이동 시작은 캔버스가 자동으로 stand로 되돌린다).
 * - "rest": 가장 가까운 자리 앵커 반경 안에 있으면 앉기, 그 외 빈 공간이면 눕기.
 * - "stand": 항상 허용 (이미 서 있으면 거부).
 */
export function requestStudioSpacePose(input: {
  readonly current: StudioSpacePose;
  readonly request: StudioSpacePoseRequest;
  readonly position: StudioVirtualSpacePoint;
  readonly moving: boolean;
  readonly seatAnchors: readonly StudioSeatAnchor[];
  /** 눕기 가능 여부: 호출자가 장애물·다른 아바타와의 간격으로 판정한 빈 공간 여부. */
  readonly openArea: boolean;
  readonly now: number;
}): StudioSpacePoseResult {
  const now = Number.isFinite(input.now) ? input.now : 0;
  const position = finitePoint(input.position);
  if (input.moving) {
    return { pose: input.current, accepted: false, reason: "moving", anchor: null, transitionStartedAt: null };
  }
  if (input.request === "stand") {
    if (input.current === "stand") {
      return { pose: "stand", accepted: false, reason: "already-standing", anchor: null, transitionStartedAt: null };
    }
    return { pose: "stand", accepted: true, reason: null, anchor: null, transitionStartedAt: now };
  }
  if (input.current !== "stand") {
    return { pose: input.current, accepted: false, reason: "already-resting", anchor: null, transitionStartedAt: now };
  }
  const anchor = nearestSeatAnchor(position, input.seatAnchors);
  if (anchor) {
    return { pose: "sit", accepted: true, reason: null, anchor, transitionStartedAt: now };
  }
  if (input.openArea) {
    return { pose: "lie", accepted: true, reason: null, anchor: null, transitionStartedAt: now };
  }
  return { pose: "stand", accepted: false, reason: "no-suitable-spot", anchor: null, transitionStartedAt: null };
}

/**
 * 자세 전이 진행도 0~1 (ease-in-out).
 * startedAt이 null이면 전이 중이 아니므로 1(완료)을 반환한다.
 */
export function studioSpacePoseBlend(
  startedAt: number | null,
  now: number,
  durationMs: number = STUDIO_SPACE_POSE_TRANSITION_MS,
): number {
  if (startedAt === null) return 1;
  const duration = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : STUDIO_SPACE_POSE_TRANSITION_MS;
  const elapsed = Math.max(0, (Number.isFinite(now) ? now : 0) - startedAt);
  if (elapsed >= duration) return 1;
  return easeInOutCubic(elapsed / duration);
}

/** 자세 라벨 (UI용). */
export function studioSpacePoseLabel(pose: StudioSpacePose): { readonly ko: string; readonly en: string } {
  switch (pose) {
    case "sit": return { ko: "앉기", en: "Sitting" };
    case "lie": return { ko: "눕기", en: "Lying down" };
    case "stand": return { ko: "서기", en: "Standing" };
  }
}
