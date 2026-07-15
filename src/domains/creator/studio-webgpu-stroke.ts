export type StudioGpuComposite = "normal" | "erase";

export interface StudioGpuStroke {
  readonly id: string;
  readonly points: readonly number[];
  readonly pressures?: readonly number[];
  readonly color: string;
  readonly size: number;
  readonly opacity?: number;
  readonly composite?: StudioGpuComposite;
  readonly orderKey?: string;
}

export const STUDIO_GPU_MAX_BRUSH_SIZE = 8_192;

export function sameStudioGpuNumberArray(
  left: readonly number[] | undefined,
  right: readonly number[] | undefined
): boolean {
  if (left === right) return true;
  if (!left || !right || left.length !== right.length) return false;
  return left.every((value, index) => Object.is(value, right[index]));
}

/**
 * Exact semantic equality used at the authoritative Konva/WebGPU handoff boundary.
 * A hash is intentionally insufficient here: a collision must never hide the source pixels.
 */
export function sameStudioGpuStroke(left: StudioGpuStroke, right: StudioGpuStroke): boolean {
  return left.id === right.id
    && left.color === right.color
    && Object.is(left.size, right.size)
    && Object.is(left.opacity, right.opacity)
    && left.composite === right.composite
    && left.orderKey === right.orderKey
    && sameStudioGpuNumberArray(left.points, right.points)
    && sameStudioGpuNumberArray(left.pressures, right.pressures);
}

export function sameStudioGpuStrokes(
  left: readonly StudioGpuStroke[],
  right: readonly StudioGpuStroke[]
): boolean {
  return left === right || (
    left.length === right.length
    && left.every((stroke, index) => sameStudioGpuStroke(stroke, right[index]!))
  );
}

export function snapshotStudioGpuStroke(stroke: StudioGpuStroke): StudioGpuStroke {
  return {
    ...stroke,
    points: [...stroke.points],
    pressures: stroke.pressures ? [...stroke.pressures] : undefined,
  };
}

export function snapshotStudioGpuStrokes(
  strokes: readonly StudioGpuStroke[]
): readonly StudioGpuStroke[] {
  return strokes.map(snapshotStudioGpuStroke);
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function studioGpuPressureRadius(size: number, pressure: number): number {
  // Exact default-pen width contract used by StudioDrawNode after pressure resampling.
  const safeSize = clamp(finiteOr(size, 1), 0.01, STUDIO_GPU_MAX_BRUSH_SIZE);
  const safePressure = clamp(finiteOr(pressure, 1), 0, 1);
  return Math.max(0.25, (safeSize * (0.3 + safePressure * 1.4)) / 2);
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function orderStudioGpuStrokes(
  strokes: readonly StudioGpuStroke[]
): readonly StudioGpuStroke[] {
  if (!strokes.some((stroke) => stroke.orderKey !== undefined)) return strokes;
  return strokes
    .map((stroke, index) => ({ stroke, index }))
    .sort((left, right) => {
      const leftKey = left.stroke.orderKey;
      const rightKey = right.stroke.orderKey;
      if (leftKey !== undefined && rightKey !== undefined) {
        // CRDT order must be identical across browsers/locales, so use UTF-16 code-unit order.
        const order = compareCodeUnits(leftKey, rightKey);
        if (order !== 0) return order;
      } else if (leftKey !== undefined) {
        return -1;
      } else if (rightKey !== undefined) {
        return 1;
      }
      return left.index - right.index;
    })
    .map(({ stroke }) => stroke);
}
