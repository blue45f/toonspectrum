/**
 * 카메라 프레이밍(순수): CameraFraming + 캐릭터 월드 bbox → ArcRotateCamera 파라미터.
 * 우수 좌표·Y-up·캐릭터 정면 +Z. alpha=π/2이 +Z(정면), yaw는 Y축 회전(도), pitch는 위(+)/아래(−).
 */
import { clamp, degToRad } from "../shared/math";

import type { CameraFraming, Vec3 } from "../contracts";

export interface WorldBounds {
  readonly min: Vec3;
  readonly max: Vec3;
}

export interface ResolvedFraming {
  readonly target: Vec3;
  readonly radius: number;
  readonly alpha: number;
  readonly beta: number;
  /** 수직 FOV(rad) */
  readonly fov: number;
}

export const DEFAULT_VERTICAL_FOV = 0.8;
/** 캐릭터가 전혀 없을 때 쓰는 기본 bbox(1.7m 인체) */
export const FALLBACK_BOUNDS: WorldBounds = Object.freeze<WorldBounds>({ min: [-0.4, 0, -0.3], max: [0.4, 1.7, 0.3] });

function framedHeight(mode: CameraFraming["mode"], height: number): { centerY: (minY: number) => number; span: number } {
  switch (mode) {
    case "bust":
      return { centerY: (minY) => minY + height * 0.8, span: height * 0.38 };
    case "face":
      return { centerY: (minY) => minY + height * 0.9, span: height * 0.2 };
    case "custom":
    case "full-body":
    default:
      return { centerY: (minY) => minY + height * 0.5, span: height * 1.1 };
  }
}

export function resolveFraming(framing: CameraFraming, bounds: WorldBounds = FALLBACK_BOUNDS, fov = DEFAULT_VERTICAL_FOV, aspect = 1): ResolvedFraming {
  const width = Math.max(1e-3, bounds.max[0] - bounds.min[0]);
  const height = Math.max(1e-3, bounds.max[1] - bounds.min[1]);
  const depth = Math.max(1e-3, bounds.max[2] - bounds.min[2]);
  const { centerY, span } = framedHeight(framing.mode, height);
  const target: Vec3 = [(bounds.min[0] + bounds.max[0]) / 2, centerY(bounds.min[1]), (bounds.min[2] + bounds.max[2]) / 2];
  // 수직·수평 중 더 큰 요구 거리를 쓴다.
  const verticalRadius = span / 2 / Math.tan(fov / 2);
  const horizontalSpan = framing.mode === "face" ? Math.max(width * 0.35, span) : Math.max(width, span * 0.6);
  const horizontalRadius = horizontalSpan / 2 / Math.tan(fov / 2) / Math.max(0.2, aspect);
  const base = Math.max(verticalRadius, horizontalRadius) + depth / 2;
  const radius = base * clamp(Number.isFinite(framing.distanceScale) ? framing.distanceScale : 1, 0.1, 10);
  const alpha = Math.PI / 2 + degToRad(clamp(framing.yawDeg, -720, 720));
  const beta = clamp(Math.PI / 2 - degToRad(clamp(framing.pitchDeg, -89, 89)), 0.05, Math.PI - 0.05);
  return { target, radius, alpha, beta, fov };
}

/** ArcRotate 파라미터에서 카메라 위치(검증용) */
export function cameraPosition(resolved: ResolvedFraming): Vec3 {
  const { target, radius, alpha, beta } = resolved;
  return [target[0] + radius * Math.cos(alpha) * Math.sin(beta), target[1] + radius * Math.cos(beta), target[2] + radius * Math.sin(alpha) * Math.sin(beta)];
}

/** 빈 bbox 여부 */
export function isDegenerateBounds(bounds: WorldBounds): boolean {
  return !Number.isFinite(bounds.min[0]) || !Number.isFinite(bounds.max[0]) || bounds.max[1] - bounds.min[1] <= 1e-6;
}
