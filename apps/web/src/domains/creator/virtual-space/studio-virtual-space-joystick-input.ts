import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";

/** 스틱 응답 곡선. linear=그대로, quadratic/cubic=저속 구간을 더 세밀하게. */
export type StudioInputResponseCurve = "linear" | "quadratic" | "cubic";

/**
 * 응답 곡선 적용. 부호를 유지하고 크기는 0~1에 머문다.
 * quadratic은 절반 입력에서 1/4 출력, cubic은 1/8 출력이 된다.
 */
export function applyStudioInputResponseCurve(
  value: number,
  curve: StudioInputResponseCurve = "linear",
): number {
  const bounded = Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
  if (curve === "quadratic") return Math.sign(bounded) * bounded * bounded;
  if (curve === "cubic") return bounded * bounded * bounded;
  return bounded;
}

/** Radial dead zone keeps near-centre touches still without snapping slow walking to full speed. */
export function studioJoystickVector(x: number, y: number, deadZone = 0.08): StudioVirtualSpacePoint {
  if (![x, y, deadZone].every(Number.isFinite)) return { x: 0, y: 0 };
  const threshold = Math.max(0, Math.min(0.95, deadZone));
  const length = Math.hypot(x, y);
  if (length <= threshold || length === 0) return { x: 0, y: 0 };
  const magnitude = Math.min(1, (length - threshold) / (1 - threshold));
  return { x: x / length * magnitude, y: y / length * magnitude };
}

/** 조이스틱 입력 옵션. */
export interface StudioJoystickInputOptions {
  /** 데드존 (기본 0.08). */
  readonly deadZone?: number;
  /** 응답 곡선 (기본 "linear"). */
  readonly responseCurve?: StudioInputResponseCurve;
  /** 8방향 스냅 (기본 false). */
  readonly snap8Way?: boolean;
}

/**
 * 방향을 가장 가까운 8방향(45도 단위)으로 스냅한다. 크기는 유지.
 * 캐릭터 스프라이트가 8방향이라 대각선 이동이 어색할 때 쓴다.
 */
export function snapStudioVectorTo8Way(vector: StudioVirtualSpacePoint): StudioVirtualSpacePoint {
  const magnitude = Math.hypot(vector.x, vector.y);
  if (magnitude < 0.0001) return { x: 0, y: 0 };
  const step = Math.PI / 4;
  const snapped = Math.round(Math.atan2(vector.y, vector.x) / step) * step;
  return { x: Math.cos(snapped) * magnitude, y: Math.sin(snapped) * magnitude };
}

/** 옵션을 적용한 조이스틱 벡터 (데드존 → 응답 곡선 → 8방향 스냅). */
export function studioJoystickVectorWithOptions(
  x: number,
  y: number,
  options: StudioJoystickInputOptions = {},
): StudioVirtualSpacePoint {
  const base = studioJoystickVector(x, y, options.deadZone ?? 0.08);
  const magnitude = Math.hypot(base.x, base.y);
  if (magnitude < 0.0001) return base;
  const curved = applyStudioInputResponseCurve(magnitude, options.responseCurve ?? "linear");
  const scaled = { x: base.x / magnitude * curved, y: base.y / magnitude * curved };
  return options.snap8Way ? snapStudioVectorTo8Way(scaled) : scaled;
}
