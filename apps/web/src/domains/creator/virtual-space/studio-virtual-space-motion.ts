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
  acceleration: 1500,
  deceleration: 2100,
  maxSpeed: 205,
});

export function stepStudioVirtualSpaceMotion(
  state: StudioVirtualSpaceMotionState,
  input: StudioVirtualSpacePoint,
  deltaSeconds: number,
  config: StudioVirtualSpaceMotionConfig = DEFAULT_STUDIO_MOTION_CONFIG,
): StudioVirtualSpaceMotionState {
  const x = Number.isFinite(input.x) ? input.x : 0;
  const y = Number.isFinite(input.y) ? input.y : 0;
  const magnitude = Math.max(1, Math.hypot(x, y));
  const maxSpeed = Number.isFinite(config.maxSpeed) ? Math.max(0, config.maxSpeed) : 0;
  const target = { x: x / magnitude * maxSpeed, y: y / magnitude * maxSpeed };
  const current = {
    x: Number.isFinite(state.velocity.x) ? state.velocity.x : 0,
    y: Number.isFinite(state.velocity.y) ? state.velocity.y : 0,
  };
  const slowing = Math.hypot(target.x, target.y) < Math.hypot(current.x, current.y) || target.x * current.x + target.y * current.y < 0;
  const dt = Number.isFinite(deltaSeconds) ? Math.max(0, Math.min(deltaSeconds, 0.05)) : 0;
  const rate = slowing ? config.deceleration : config.acceleration;
  const limit = (Number.isFinite(rate) ? Math.max(0, rate) : 0) * dt;
  const dx = target.x - current.x;
  const dy = target.y - current.y;
  const difference = Math.hypot(dx, dy);
  const fraction = difference > 0 ? Math.min(1, limit / difference) : 1;
  return { velocity: { x: current.x + dx * fraction, y: current.y + dy * fraction } };
}
