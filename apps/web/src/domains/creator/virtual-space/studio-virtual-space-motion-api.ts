/**
 * 트랙1(모션 렌더러) ↔ 트랙3(이동·자세 로직) 계약
 *
 * - 트랙1이 `studio-virtual-space-motion-api.ts`에 모션 렌더 API를 둘 예정.
 * - 트랙1 API가 오기 전, 트랙3이 먼저 필요로 하는 요청/렌더러 인터페이스를
 *   여기서 정의한다. 트랙1 구현이 이 파일의 계약을 만족하면 교체 없이 연결된다.
 * - 현 시점(2026-10-01) 트랙1 브랜치(`vs/track1-sprite-sheet`)에는 커밋이 없으므로
 *   트랙3이 먼저 정의하고, 코디네이터가 머지 순서를 조율한다.
 */

import type { StudioVirtualSpaceFacing, StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import type { StudioSpacePose } from "./studio-virtual-space-pose-controller";
import type { StudioLocomotionMode } from "./studio-virtual-space-locomotion-transitions";

/** 트랙3이 트랙1 모션 렌더러에 보내는 프레임 요청. */
export interface StudioMotionRequest {
  /** 자세 (sit/lie 포함). */
  readonly pose: StudioSpacePose;
  /** 이동 모드 (히스테리시스 적용 후). */
  readonly locomotionMode: StudioLocomotionMode;
  /** 이동 속도 (px/s). */
  readonly speed: number;
  /** 바라보는 방향. */
  readonly facing: StudioVirtualSpaceFacing;
  /** 걸음 위상 0~1. */
  readonly walkPhase: number;
  /** 자세 전이 블렌드 0~1 (1=전이 완료). */
  readonly poseBlend: number;
  /** squash & stretch 스케일. */
  readonly squash: { readonly x: number; readonly y: number };
  /** 급회전 기울기 (deg). */
  readonly leanDegrees: number;
  /** 호흡 오프셋 (px, idle 전용). */
  readonly breathOffset: number;
  /** 고스트 모드 (반투명 통과 이동). */
  readonly ghost: boolean;
}

/** 트랙1 모션 렌더러가 구현할 최소 인터페이스. */
export interface StudioMotionRenderer {
  /** 프레임 요청을 적용한다. */
  applyMotion(request: StudioMotionRequest): void;
  /** 현재 위치를 반환한다. */
  getPosition(): StudioVirtualSpacePoint;
  /** 렌더러가 파괴됐는지. */
  isDestroyed(): boolean;
}

/** 디폴트(중립) 모션 요청: 서 있기. */
export function neutralStudioMotionRequest(): StudioMotionRequest {
  return {
    pose: "stand",
    locomotionMode: "idle",
    speed: 0,
    facing: "down",
    walkPhase: 0,
    poseBlend: 1,
    squash: { x: 1, y: 1 },
    leanDegrees: 0,
    breathOffset: 0,
    ghost: false,
  };
}

/**
 * 트랙3 이동 상태 → 트랙1 렌더러 요청으로 조립한다.
 * 입력 값은 모두 검증·클램프되며, 렌더러가 null이면 요청만 반환한다.
 */
export function buildStudioMotionRequest(input: {
  readonly pose: StudioSpacePose;
  readonly locomotionMode: StudioLocomotionMode;
  readonly speed: number;
  readonly facing: StudioVirtualSpaceFacing;
  readonly walkPhase: number;
  readonly poseBlend: number;
  readonly squashX: number;
  readonly squashY: number;
  readonly leanDegrees: number;
  readonly breathOffset: number;
  readonly ghost: boolean;
}): StudioMotionRequest {
  const finite = (value: number, fallback: number): number =>
    Number.isFinite(value) ? value : fallback;
  const clamp01 = (value: number): number => Math.min(1, Math.max(0, finite(value, 0)));
  return {
    pose: input.pose,
    locomotionMode: input.locomotionMode,
    speed: Math.max(0, finite(input.speed, 0)),
    facing: input.facing,
    walkPhase: ((finite(input.walkPhase, 0) % 1) + 1) % 1,
    poseBlend: clamp01(input.poseBlend),
    squash: {
      x: Math.max(0.5, finite(input.squashX, 1)),
      y: Math.max(0.5, finite(input.squashY, 1)),
    },
    leanDegrees: finite(input.leanDegrees, 0),
    breathOffset: finite(input.breathOffset, 0),
    ghost: input.ghost === true,
  };
}
