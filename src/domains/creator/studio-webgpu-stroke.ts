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

/**
 * Already-sampled live drawing input. The caller owns distance filtering and stabilization; this
 * boundary only snapshots GPU-safe samples so extending a stroke can never rewrite its history.
 */
export interface StudioGpuLiveStrokeInput {
  readonly id: string;
  readonly points: readonly number[];
  readonly pressures?: readonly number[];
  readonly color: string;
  readonly size: number;
  readonly opacity?: number;
  readonly composite?: StudioGpuComposite;
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

/**
 * Snapshots an append-only live stroke for the WebGPU renderer.
 *
 * Points have already passed the pointer sampler/stabilizer and are deliberately not smoothed or
 * resampled here. Copying only the longest finite pair prefix, and resolving pressure by the same
 * point index, guarantees that appending a new sample leaves every historical GPU sample exact.
 */
export function buildStudioGpuLiveStroke(
  input: StudioGpuLiveStrokeInput
): StudioGpuStroke | null {
  const points: number[] = [];
  for (let index = 0; index + 1 < input.points.length; index += 2) {
    const x = input.points[index];
    const y = input.points[index + 1];
    if (!Number.isFinite(x) || !Number.isFinite(y)) break;
    points.push(x!, y!);
  }

  // The engine plans an initial dab for a single coordinate pair. Keeping that tap here is
  // important: while WebGPU owns the live surface, the Canvas/Konva draft is intentionally hidden.
  if (points.length < 2) return null;

  const pointCount = points.length / 2;
  const pressures = Array.from(
    { length: pointCount },
    (_, index) => clamp(finiteOr(input.pressures?.[index], 0.5), 0, 1)
  );

  return {
    id: input.id,
    points,
    pressures,
    color: input.color,
    size: input.size,
    opacity: input.opacity,
    composite: input.composite,
  };
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
