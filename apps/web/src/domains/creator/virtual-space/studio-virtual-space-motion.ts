import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";

export interface StudioVirtualSpaceMotionState {
  readonly velocity: StudioVirtualSpacePoint;
}

export interface StudioVirtualSpaceMotionConfig {
  readonly acceleration: number;
  readonly deceleration: number;
  readonly maxSpeed: number;
}

export const DEFAULT_STUDIO_MOTION_CONFIG: StudioVirtualSpaceMotionConfig = Object.freeze({
  acceleration: 780,
  deceleration: 980,
  maxSpeed: 205,
});

function approach(current: number, target: number, amount: number): number {
  if (current < target) return Math.min(target, current + amount);
  if (current > target) return Math.max(target, current - amount);
  return target;
}

export function stepStudioVirtualSpaceMotion(
  state: StudioVirtualSpaceMotionState,
  input: StudioVirtualSpacePoint,
  deltaSeconds: number,
  config: StudioVirtualSpaceMotionConfig = DEFAULT_STUDIO_MOTION_CONFIG,
): StudioVirtualSpaceMotionState {
  const length = Math.hypot(input.x, input.y);
  const nx = length > 1 ? input.x / length : input.x;
  const ny = length > 1 ? input.y / length : input.y;
  const hasInput = Math.hypot(nx, ny) > 0.001;
  const targetX = hasInput ? nx * config.maxSpeed : 0;
  const targetY = hasInput ? ny * config.maxSpeed : 0;
  const rate = (hasInput ? config.acceleration : config.deceleration) * Math.max(0, Math.min(deltaSeconds, 0.05));
  return {
    velocity: {
      x: approach(state.velocity.x, targetX, rate),
      y: approach(state.velocity.y, targetY, rate),
    },
  };
}
