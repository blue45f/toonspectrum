import {
  STUDIO_INK_MAX_BRUSH_SIZE,
  resolveStudioInkPressure,
  studioInkPressureRadius,
  type StudioInkPressureModel,
} from "./studio-ink-pressure-model";

export type StudioGpuComposite = "normal" | "erase";

/**
 * Opaque lineage carried only by the imperative live-stroke feed. A revision proves that the
 * current samples were produced by appending the recorded suffix to its parent revision; normal
 * document strokes never receive this metadata and continue through exact full-array comparison.
 */
export interface StudioGpuStrokeFeedRevision {
  readonly lineage: string;
  readonly revision: number;
  readonly token: string;
  readonly pointCount: number;
  readonly parent: StudioGpuStrokeFeedRevision | null;
  readonly parentPointCount: number;
  /** Newly appended coordinate pairs only; the parent endpoint is kept separately. */
  readonly suffixPoints: readonly number[];
  readonly suffixPressures: readonly number[];
  readonly lastX: number;
  readonly lastY: number;
  readonly lastPressure: number;
  /** Round-dab bounds before the caller-specific tile bleed is added. */
  readonly minimumX: number;
  readonly minimumY: number;
  readonly maximumX: number;
  readonly maximumY: number;
  readonly styleSignature: string;
  readonly trustedImmutable: true;
}

export const STUDIO_GPU_STROKE_FEED_REVISION: unique symbol = Symbol(
  "StudioGpuStrokeFeedRevision"
);

export interface StudioGpuStroke {
  readonly id: string;
  readonly points: readonly number[];
  readonly pressures?: readonly number[];
  readonly color: string;
  readonly size: number;
  readonly pressureModel?: StudioInkPressureModel;
  readonly opacity?: number;
  readonly composite?: StudioGpuComposite;
  readonly orderKey?: string;
  /** Internal append-only proof. It does not alter paint semantics or serialized document data. */
  readonly [STUDIO_GPU_STROKE_FEED_REVISION]?: StudioGpuStrokeFeedRevision;
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
  readonly pressureModel?: StudioInkPressureModel;
  readonly opacity?: number;
  readonly composite?: StudioGpuComposite;
}

export const STUDIO_GPU_MAX_BRUSH_SIZE = STUDIO_INK_MAX_BRUSH_SIZE;

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
  const leftRevision = left[STUDIO_GPU_STROKE_FEED_REVISION];
  const rightRevision = right[STUDIO_GPU_STROKE_FEED_REVISION];
  if (
    leftRevision
    && rightRevision
    && leftRevision.token === rightRevision.token
    && left.points === right.points
    && left.pressures === right.pressures
  ) {
    return true;
  }
  return left.id === right.id
    && left.color === right.color
    && Object.is(left.size, right.size)
    && left.pressureModel === right.pressureModel
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
  if (stroke[STUDIO_GPU_STROKE_FEED_REVISION]?.trustedImmutable) return stroke;
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
    (_, index) => resolveStudioInkPressure(input.pressures?.[index], input.pressureModel)
  );

  return {
    id: input.id,
    points,
    pressures,
    color: input.color,
    size: input.size,
    ...(input.pressureModel === undefined ? {} : { pressureModel: input.pressureModel }),
    opacity: input.opacity,
    composite: input.composite,
  };
}

export function studioGpuPressureRadius(
  size: number,
  pressure: number,
  pressureModel?: StudioInkPressureModel
): number {
  return studioInkPressureRadius(size, pressure, pressureModel);
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
