import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";

/** Radial dead zone keeps near-centre touches still without snapping slow walking to full speed. */
export function studioJoystickVector(x: number, y: number, deadZone = 0.08): StudioVirtualSpacePoint {
  if (![x, y, deadZone].every(Number.isFinite)) return { x: 0, y: 0 };
  const threshold = Math.max(0, Math.min(0.95, deadZone));
  const length = Math.hypot(x, y);
  if (length <= threshold || length === 0) return { x: 0, y: 0 };
  const magnitude = Math.min(1, (length - threshold) / (1 - threshold));
  return { x: x / length * magnitude, y: y / length * magnitude };
}
