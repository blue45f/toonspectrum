/**
 * 로컬 아바타 이동 이징 스테퍼.
 *
 * `stepFeelVelocityWithSkid`(속도 비율 기반 커브 가속/감속) 위에 시간 기반 램프를 얹는다.
 * - 출발 램프: 정지 상태에서 입력이 시작되면 120ms 동안 가속도를 ease-in으로
 *   15%→100%까지 올려 첫 발짝의 튐을 없앤다.
 * - 방향 반전: 입력이 속도 반대 방향이면 먼저 감속만 이어 가고, 속도가 정밀 구간
 *   아래로 떨어진 뒤에야 램프를 다시 시작해 "감속 후 가속"으로 느끼게 한다.
 * - 모션 줄이기: 램프를 건너뛰어 감각 자극 없이 즉시 반응한다.
 *
 * 순수 상태 기계다. 호출 측은 매 틱 현재 속도와 목표 속도를 넣고 새 속도를 받는다.
 * 하드 리셋(텔레포트 등)에서는 `reset()`을 호출한다. 속도가 거의 0이면 램프는
 * 다음 입력에서 자동으로 처음부터 시작되므로, 리셋을 놓쳐도 제자리로 돌아온다.
 */

import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import {
  easeInCubic,
  stepFeelVelocityWithSkid,
} from "./studio-virtual-space-locomotion-feel";
import {
  DEFAULT_STUDIO_SPACE_PHYSICS_CONFIG,
  type StudioSpacePhysicsConfig,
} from "./studio-virtual-space-physics";

/** 출발 램프 지속 시간(ms). 이 시간 동안 가속도가 ease-in으로 차오른다. */
export const STUDIO_MOTION_START_RAMP_MS = 120;

/** 램프 시작 가속도 배율. 0이 아니라 얕게 잡아 입력 즉시 아주 조금은 움직이게 한다. */
export const STUDIO_MOTION_RAMP_MIN_FACTOR = 0.15;

/** 이 속도(px/s) 이하이면 정지로 본다 — 출발 램프 판정 기준. */
const STILL_SPEED_PX = 6;

/** 반전 종료로 보는 속도(px/s). 이 아래로 느려지면 새 방향 램프를 시작한다. */
const REVERSAL_RELEASE_SPEED_PX = 24;

export class StudioMotionEaser {
  /** 램프가 끝난 상태로 시작한다. 첫 입력은 속도≈0 조건으로 램프가 다시 걸린다. */
  private rampElapsedMs = STUDIO_MOTION_START_RAMP_MS;
  private ramping = false;
  private reversing = false;

  /** 텔레포트·강제 정지 같은 하드 리셋에서 램프 상태를 함께 비운다. */
  reset(): void {
    this.rampElapsedMs = STUDIO_MOTION_START_RAMP_MS;
    this.ramping = false;
    this.reversing = false;
  }

  /**
   * 한 틱 이동 이징. `stepFeelVelocityWithSkid`와 같은 서명이며, 반환 속도를
   * 그대로 물리 몸체에 넣으면 된다.
   */
  step(
    current: StudioVirtualSpacePoint,
    target: StudioVirtualSpacePoint,
    deltaSeconds: number,
    config: StudioSpacePhysicsConfig = DEFAULT_STUDIO_SPACE_PHYSICS_CONFIG,
    reducedMotion = false,
  ): StudioVirtualSpacePoint {
    const dt = Number.isFinite(deltaSeconds) ? Math.max(0, Math.min(deltaSeconds, 0.05)) : 0;
    if (dt === 0) return current;
    const cx = Number.isFinite(current.x) ? current.x : 0;
    const cy = Number.isFinite(current.y) ? current.y : 0;
    const tx = Number.isFinite(target.x) ? target.x : 0;
    const ty = Number.isFinite(target.y) ? target.y : 0;
    const speed = Math.hypot(cx, cy);
    const targetSpeed = Math.hypot(tx, ty);
    const inputActive = targetSpeed > 1;
    const dot = cx * tx + cy * ty;
    const dtMs = dt * 1_000;

    if (reducedMotion) {
      this.reset();
      return stepFeelVelocityWithSkid({ x: cx, y: cy }, { x: tx, y: ty }, dt, config);
    }

    // 방향 반전: 반대 입력이 들어온 동안은 감속만 하고, 충분히 느려진 뒤 램프로 넘어간다.
    if (inputActive && speed > REVERSAL_RELEASE_SPEED_PX && dot < 0) {
      this.reversing = true;
      this.ramping = false;
    } else if (this.reversing && (!inputActive || speed <= REVERSAL_RELEASE_SPEED_PX || dot >= 0)) {
      this.reversing = false;
      this.ramping = inputActive;
      this.rampElapsedMs = 0;
    }

    // 정지에서 새 입력이 시작되면 출발 램프를 건다.
    if (!this.reversing && !this.ramping && inputActive && speed <= STILL_SPEED_PX) {
      this.ramping = true;
      this.rampElapsedMs = 0;
    }
    // 입력이 끊기면 램프도 끝낸다 (다음 출발에서 처음부터).
    if (!inputActive) this.ramping = false;

    let factor = 1;
    if (this.ramping) {
      this.rampElapsedMs += dtMs;
      const progress = Math.min(1, this.rampElapsedMs / STUDIO_MOTION_START_RAMP_MS);
      factor = STUDIO_MOTION_RAMP_MIN_FACTOR
        + (1 - STUDIO_MOTION_RAMP_MIN_FACTOR) * easeInCubic(progress);
      if (progress >= 1) this.ramping = false;
    }

    const configForStep = factor >= 1
      ? config
      : { ...config, acceleration: Math.max(0, config.acceleration) * factor };
    return stepFeelVelocityWithSkid({ x: cx, y: cy }, { x: tx, y: ty }, dt, configForStep);
  }
}
