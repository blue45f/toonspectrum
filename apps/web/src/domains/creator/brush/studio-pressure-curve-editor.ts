/**
 * 인터랙티브 필압 곡선 에디터 모델.
 *
 * `studio-stylus-pressure-profile.ts`가 커스텀 포인트·단조 3차 보간·캘리브레이션을
 * 지원하지만, UI에서 곡선을 직접 편집하는 모델(포인트 추가/이동/삭제 + 제약)이
 * 없어 Procreate의 per-attribute pressure curve에 비해 뒤처진다.
 * 이 모듈은 순수 편집 연산만 제공하며, 실제 매핑은 기존 프로파일 시스템을 재사용한다.
 *
 * 제약:
 * - 엔드포인트 (0,0)과 (1,1)은 고정, 삭제·이동 불가
 * - 내부는 오름차순 정렬, 최소 간격 0.015, 단조(비내림차순) 강제
 * - 최대 내부 포인트 6개 (프로파일 POINT_LIMIT 8 - 엔드포인트 2)
 */

import {
  normalizeStudioStylusPressureProfile,
  type StudioStylusPressureProfile,
} from "./studio-stylus-pressure-profile";

export interface StudioPressureCurvePoint {
  readonly input: number;
  readonly output: number;
}

export const STUDIO_PRESSURE_CURVE_MIN_POINT_DISTANCE = 0.015 as const;
export const STUDIO_PRESSURE_CURVE_MAX_INTERIOR_POINTS = 6 as const;

export type StudioPressureCurvePresetId =
  | "linear"
  | "soft"
  | "firm"
  | "s-curve"
  | "inking";

const PRESET_CURVES: Readonly<Record<StudioPressureCurvePresetId, readonly StudioPressureCurvePoint[]>> =
  Object.freeze({
    linear: Object.freeze([
      Object.freeze({ input: 0, output: 0 }),
      Object.freeze({ input: 1, output: 1 }),
    ]),
    soft: Object.freeze([
      Object.freeze({ input: 0, output: 0 }),
      Object.freeze({ input: 0.12, output: 0.3 }),
      Object.freeze({ input: 0.42, output: 0.7 }),
      Object.freeze({ input: 0.78, output: 0.93 }),
      Object.freeze({ input: 1, output: 1 }),
    ]),
    firm: Object.freeze([
      Object.freeze({ input: 0, output: 0 }),
      Object.freeze({ input: 0.22, output: 0.07 }),
      Object.freeze({ input: 0.52, output: 0.34 }),
      Object.freeze({ input: 0.8, output: 0.74 }),
      Object.freeze({ input: 1, output: 1 }),
    ]),
    "s-curve": Object.freeze([
      Object.freeze({ input: 0, output: 0 }),
      Object.freeze({ input: 0.25, output: 0.12 }),
      Object.freeze({ input: 0.5, output: 0.5 }),
      Object.freeze({ input: 0.75, output: 0.88 }),
      Object.freeze({ input: 1, output: 1 }),
    ]),
    inking: Object.freeze([
      Object.freeze({ input: 0, output: 0 }),
      Object.freeze({ input: 0.08, output: 0.04 }),
      Object.freeze({ input: 0.24, output: 0.34 }),
      Object.freeze({ input: 0.55, output: 0.75 }),
      Object.freeze({ input: 0.86, output: 0.95 }),
      Object.freeze({ input: 1, output: 1 }),
    ]),
  });

export function studioPressureCurvePreset(
  presetId: StudioPressureCurvePresetId,
): readonly StudioPressureCurvePoint[] {
  return PRESET_CURVES[presetId] ?? PRESET_CURVES.linear;
}

export function studioPressureCurvePresetIds(): readonly StudioPressureCurvePresetId[] {
  return Object.freeze(["linear", "soft", "firm", "s-curve", "inking"] as const);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function isEndpointIndex(points: readonly StudioPressureCurvePoint[], index: number): boolean {
  return index === 0 || index === points.length - 1;
}

/** 포인트 배열을 정렬·단조·간격 제약으로 정규화한다. */
export function normalizeStudioPressureCurvePoints(
  points: readonly StudioPressureCurvePoint[],
): readonly StudioPressureCurvePoint[] {
  const interior = points
    .filter((point) => {
      const input = clamp01(point.input);
      const output = clamp01(point.output);
      return Number.isFinite(input) && Number.isFinite(output)
        && input > STUDIO_PRESSURE_CURVE_MIN_POINT_DISTANCE
        && input < 1 - STUDIO_PRESSURE_CURVE_MIN_POINT_DISTANCE;
    })
    .map((point) => ({ input: clamp01(point.input), output: clamp01(point.output) }))
    .sort((left, right) => left.input - right.input);

  const spaced: Array<{ input: number; output: number }> = [];
  for (const point of interior) {
    const previous = spaced.at(-1);
    if (previous && point.input - previous.input < STUDIO_PRESSURE_CURVE_MIN_POINT_DISTANCE) {
      previous.input = point.input;
      previous.output = Math.max(previous.output, point.output);
    } else {
      spaced.push({ ...point });
    }
  }
  const bounded = spaced.slice(0, STUDIO_PRESSURE_CURVE_MAX_INTERIOR_POINTS);
  let floor = 0;
  const monotone = bounded.map((point) => {
    floor = Math.max(floor, point.output);
    return Object.freeze({ input: point.input, output: floor });
  });
  return Object.freeze([
    Object.freeze({ input: 0, output: 0 }),
    ...monotone,
    Object.freeze({ input: 1, output: 1 }),
  ]);
}

export interface StudioPressureCurveEditResult {
  readonly points: readonly StudioPressureCurvePoint[];
  /** 편집이 실제로 반영됐는지 (제약으로 거부되면 false). */
  readonly applied: boolean;
}

/** 곡선에 새 컨트롤 포인트를 추가한다. 엔드포인트 근처·개수 초과면 거부. */
export function addStudioPressureCurvePoint(
  points: readonly StudioPressureCurvePoint[],
  input: number,
  output: number,
): StudioPressureCurveEditResult {
  const normalized = normalizeStudioPressureCurvePoints(points);
  const cleanInput = clamp01(input);
  if (
    cleanInput <= STUDIO_PRESSURE_CURVE_MIN_POINT_DISTANCE
    || cleanInput >= 1 - STUDIO_PRESSURE_CURVE_MIN_POINT_DISTANCE
  ) {
    return { points: normalized, applied: false };
  }
  if (normalized.length - 2 >= STUDIO_PRESSURE_CURVE_MAX_INTERIOR_POINTS) {
    return { points: normalized, applied: false };
  }
  return {
    points: normalizeStudioPressureCurvePoints([
      ...normalized,
      { input: cleanInput, output: clamp01(output) },
    ]),
    applied: true,
  };
}

/**
 * 컨트롤 포인트를 이동한다. 이웃 포인트를 넘을 수 없고 엔드포인트는 고정이다.
 * 단조가 깨지면 output을 이웃 범위로 클램프한다.
 */
export function moveStudioPressureCurvePoint(
  points: readonly StudioPressureCurvePoint[],
  index: number,
  input: number,
  output: number,
): StudioPressureCurveEditResult {
  const normalized = normalizeStudioPressureCurvePoints(points);
  if (index < 0 || index >= normalized.length || isEndpointIndex(normalized, index)) {
    return { points: normalized, applied: false };
  }
  const previous = normalized[index - 1]!;
  const next = normalized[index + 1]!;
  const clampedInput = Math.min(
    Math.max(clamp01(input), previous.input + STUDIO_PRESSURE_CURVE_MIN_POINT_DISTANCE),
    next.input - STUDIO_PRESSURE_CURVE_MIN_POINT_DISTANCE,
  );
  const clampedOutput = Math.min(
    Math.max(clamp01(output), previous.output),
    next.output,
  );
  const moved = normalized.map((point, pointIndex) =>
    pointIndex === index
      ? Object.freeze({ input: clampedInput, output: clampedOutput })
      : point,
  );
  return { points: normalizeStudioPressureCurvePoints(moved), applied: true };
}

/** 컨트롤 포인트를 삭제한다. 엔드포인트는 삭제 불가. */
export function removeStudioPressureCurvePoint(
  points: readonly StudioPressureCurvePoint[],
  index: number,
): StudioPressureCurveEditResult {
  const normalized = normalizeStudioPressureCurvePoints(points);
  if (index < 0 || index >= normalized.length || isEndpointIndex(normalized, index)) {
    return { points: normalized, applied: false };
  }
  return {
    points: Object.freeze(normalized.filter((_, pointIndex) => pointIndex !== index)),
    applied: true,
  };
}

/** 편집된 곡선을 기존 스타일러스 프로파일로 변환한다 (deadZone/saturation 기본값). */
export function studioPressureCurveToProfile(
  points: readonly StudioPressureCurvePoint[],
  options?: { readonly deadZone?: number; readonly saturation?: number },
): StudioStylusPressureProfile {
  const normalized = normalizeStudioPressureCurvePoints(points);
  return normalizeStudioStylusPressureProfile({
    enabled: true,
    deadZone: options?.deadZone ?? 0,
    saturation: options?.saturation ?? 1,
    points: normalized.map((point) => ({ input: point.input, output: point.output })),
  });
}

/** 곡선이 단조 비내림차순인지 검증한다 (테스트·디버그용). */
export function isStudioPressureCurveMonotone(
  points: readonly StudioPressureCurvePoint[],
): boolean {
  for (let index = 1; index < points.length; index += 1) {
    if (points[index]!.input < points[index - 1]!.input) return false;
    if (points[index]!.output < points[index - 1]!.output) return false;
  }
  return points[0]?.input === 0 && points[0]?.output === 0
    && points.at(-1)?.input === 1 && points.at(-1)?.output === 1;
}
