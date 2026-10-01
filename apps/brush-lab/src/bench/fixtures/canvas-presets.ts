/**
 * 벤치 캔버스 프리셋. 모든 fixture·리포트는 이 크기 중 하나(또는 명시 크기)로 실행한다.
 * dpr은 1로 고정한다(픽셀 해시 비교의 기준을 단일화).
 */
export interface CanvasSize {
  width: number;
  height: number;
  dpr: 1;
}

export const CANVAS_PRESETS = {
  small: { width: 256, height: 256, dpr: 1 },
  medium: { width: 512, height: 512, dpr: 1 },
  large: { width: 1024, height: 1024, dpr: 1 },
} as const satisfies Record<string, CanvasSize>;

export type CanvasPresetId = keyof typeof CANVAS_PRESETS;

export const CANVAS_PRESET_IDS: readonly CanvasPresetId[] = ["small", "medium", "large"];

/** 기본 캔버스(512²). */
export const DEFAULT_CANVAS: CanvasSize = CANVAS_PRESETS.medium;

/** 캔버스 크기가 양의 정수인지 검사한다(fixture 빌더·러너 공용). */
export function assertCanvasSize(canvas: { width: number; height: number }): void {
  if (!Number.isInteger(canvas.width) || canvas.width <= 0) {
    throw new RangeError(`canvas width must be a positive integer, got ${canvas.width}`);
  }
  if (!Number.isInteger(canvas.height) || canvas.height <= 0) {
    throw new RangeError(`canvas height must be a positive integer, got ${canvas.height}`);
  }
}
