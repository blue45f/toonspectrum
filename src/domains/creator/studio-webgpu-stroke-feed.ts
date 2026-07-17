import {
  advanceStudioResidualInk,
  startStudioResidualInk,
  STUDIO_CAUSAL_INK_MAX_DABS,
  type StudioResidualInkState,
} from "./studio-causal-ink";
import {
  resolveStudioInkPressure,
  studioInkUsesResidualDabSpacing,
} from "./studio-ink-pressure-model";
import {
  STUDIO_GPU_STROKE_FEED_REVISION,
  sameStudioGpuStroke,
  studioGpuPressureRadius,
  type StudioGpuStroke,
  type StudioGpuStrokeFeedRevision,
} from "./studio-webgpu-stroke";

let studioGpuStrokeFeedTokenSequence = 0;

function nextFeedToken(lineage: string): string {
  studioGpuStrokeFeedTokenSequence += 1;
  return `${lineage}:token:${studioGpuStrokeFeedTokenSequence}`;
}

export interface StudioGpuStrokeSuffixPatch {
  /** Stroke operation receiving the suffix. Pinned drawing normally extends the final operation. */
  readonly strokeIndex: number;
  readonly previousPointCount: number;
  /** New coordinate pairs only; the retained bridge endpoint is owned by the previous revision. */
  readonly suffixPoints: readonly number[];
  readonly suffixPressures: readonly number[];
  /** Latest immutable source object, retained only for a future rebuild/device recovery. */
  readonly nextStroke: StudioGpuStroke;
  /** Authoritative fallback if the append proof is rejected. */
  readonly fallbackStrokes: readonly StudioGpuStroke[];
}

export interface StudioGpuStrokeOperationsAppendPatch {
  readonly previousStrokeCount: number;
  readonly suffixStrokes: readonly StudioGpuStroke[];
  readonly fallbackStrokes: readonly StudioGpuStroke[];
}

export type StudioGpuPinnedStrokeFeedUpdate =
  | { readonly mode: "reset" }
  | { readonly mode: "replace"; readonly strokes: readonly StudioGpuStroke[] }
  | { readonly mode: "retain"; readonly strokes: readonly StudioGpuStroke[] }
  | { readonly mode: "append-operations"; readonly patch: StudioGpuStrokeOperationsAppendPatch }
  | { readonly mode: "append"; readonly patch: StudioGpuStrokeSuffixPatch };

export interface StudioGpuStrokeFeedAdvance {
  readonly status: "appended" | "rejected";
  readonly strokes: readonly StudioGpuStroke[];
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function pressureAt(stroke: StudioGpuStroke, index: number): number {
  return resolveStudioInkPressure(stroke.pressures?.[index], stroke.pressureModel);
}

function stableNumber(value: number): string {
  if (Number.isNaN(value)) return "NaN";
  if (value === Number.POSITIVE_INFINITY) return "+Infinity";
  if (value === Number.NEGATIVE_INFINITY) return "-Infinity";
  if (Object.is(value, -0)) return "-0";
  return String(value);
}

function semanticToken(value: string | number | undefined): string {
  if (value === undefined) return "u0:";
  const payload = typeof value === "number" ? stableNumber(value) : value;
  return `${typeof value === "number" ? "n" : "s"}${payload.length}:${payload}`;
}

export function studioGpuStrokeFeedStyleSignature(stroke: StudioGpuStroke): string {
  const legacySignature = [
    stroke.id,
    stroke.color,
    stroke.size,
    stroke.opacity,
    stroke.composite,
    stroke.orderKey,
  ].map((value) => semanticToken(value)).join("");
  return stroke.pressureModel === undefined
    ? legacySignature
    : `${legacySignature}${semanticToken(`pressure-model:${stroke.pressureModel}`)}`;
}

export function sameStudioGpuStrokeFeedStyle(
  left: StudioGpuStroke,
  right: StudioGpuStroke
): boolean {
  return left.id === right.id
    && left.color === right.color
    && Object.is(left.size, right.size)
    && left.pressureModel === right.pressureModel
    && Object.is(left.opacity ?? 1, right.opacity ?? 1)
    && (left.composite ?? "normal") === (right.composite ?? "normal")
    && left.orderKey === right.orderKey;
}

function boundsForPoint(
  size: number,
  x: number,
  y: number,
  pressure: number,
  pressureModel: StudioGpuStroke["pressureModel"]
): readonly [number, number, number, number] {
  const radius = studioGpuPressureRadius(size, pressure, pressureModel);
  return [x - radius, y - radius, x + radius, y + radius];
}

function includeResidualDabBounds(
  dabs: readonly { x: number; y: number; radius: number }[],
  bounds: { minimumX: number; minimumY: number; maximumX: number; maximumY: number }
): void {
  for (const dab of dabs) {
    bounds.minimumX = Math.min(bounds.minimumX, dab.x - dab.radius);
    bounds.minimumY = Math.min(bounds.minimumY, dab.y - dab.radius);
    bounds.maximumX = Math.max(bounds.maximumX, dab.x + dab.radius);
    bounds.maximumY = Math.max(bounds.maximumY, dab.y + dab.radius);
  }
}

function baseFeedRevision(
  stroke: StudioGpuStroke,
  lineage: string
): StudioGpuStrokeFeedRevision | null {
  const pointCount = stroke.points.length / 2;
  if (!Number.isSafeInteger(pointCount) || pointCount < 1) return null;
  let minimumX = Number.POSITIVE_INFINITY;
  let minimumY = Number.POSITIVE_INFINITY;
  let maximumX = Number.NEGATIVE_INFINITY;
  let maximumY = Number.NEGATIVE_INFINITY;
  let residualInkState: StudioResidualInkState | undefined;
  let residualDabCount: number | undefined;
  for (let index = 0; index < pointCount; index += 1) {
    const x = stroke.points[index * 2];
    const y = stroke.points[index * 2 + 1];
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const [left, top, right, bottom] = boundsForPoint(
      stroke.size,
      x!,
      y!,
      pressureAt(stroke, index),
      stroke.pressureModel
    );
    minimumX = Math.min(minimumX, left);
    minimumY = Math.min(minimumY, top);
    maximumX = Math.max(maximumX, right);
    maximumY = Math.max(maximumY, bottom);
    if (studioInkUsesResidualDabSpacing(stroke.pressureModel) && stroke.pressureModel) {
      const sample = { x: x!, y: y!, pressure: pressureAt(stroke, index), sourceIndex: index };
      if (index === 0) {
        const started = startStudioResidualInk(
          sample,
          stroke.size,
          stroke.pressureModel,
          STUDIO_CAUSAL_INK_MAX_DABS
        );
        if (!started.complete) return null;
        residualInkState = started.state;
        residualDabCount = started.dabs.length;
        const bounds = { minimumX, minimumY, maximumX, maximumY };
        includeResidualDabBounds(started.dabs, bounds);
        ({ minimumX, minimumY, maximumX, maximumY } = bounds);
      } else {
        if (!residualInkState || residualDabCount === undefined) return null;
        const advanced = advanceStudioResidualInk(
          residualInkState,
          sample,
          stroke.size,
          stroke.pressureModel,
          STUDIO_CAUSAL_INK_MAX_DABS - residualDabCount
        );
        if (!advanced.complete) return null;
        residualInkState = advanced.state;
        residualDabCount += advanced.dabs.length;
        const bounds = { minimumX, minimumY, maximumX, maximumY };
        includeResidualDabBounds(advanced.dabs, bounds);
        ({ minimumX, minimumY, maximumX, maximumY } = bounds);
      }
    }
  }
  const lastIndex = pointCount - 1;
  return Object.freeze({
    lineage,
    revision: 0,
    token: nextFeedToken(lineage),
    pointCount,
    parent: null,
    parentPointCount: pointCount,
    suffixPoints: Object.freeze([]),
    suffixPressures: Object.freeze([]),
    lastX: stroke.points[lastIndex * 2]!,
    lastY: stroke.points[lastIndex * 2 + 1]!,
    lastPressure: pressureAt(stroke, lastIndex),
    ...(residualInkState === undefined
      ? {}
      : { residualInkState, residualDabCount: residualDabCount! }),
    minimumX,
    minimumY,
    maximumX,
    maximumY,
    styleSignature: studioGpuStrokeFeedStyleSignature(stroke),
    trustedImmutable: true,
  });
}

/**
 * Creates the one-time immutable baseline for a pinned feed. Full arrays are inspected here; every
 * accepted update after this point touches only its new suffix.
 */
export function createStudioGpuStrokeFeedBaseline(
  strokes: readonly StudioGpuStroke[],
  lineage: string
): readonly StudioGpuStroke[] | null {
  const snapshots: StudioGpuStroke[] = [];
  for (let index = 0; index < strokes.length; index += 1) {
    const source = strokes[index]!;
    const points = [...source.points];
    const pressures = source.pressures ? [...source.pressures] : undefined;
    const snapshot: StudioGpuStroke = { ...source, points, pressures };
    const revision = baseFeedRevision(snapshot, `${lineage}:${index}:${source.id}`);
    if (!revision) return null;
    snapshots.push(Object.freeze({
      ...snapshot,
      points: Object.freeze(points),
      pressures: pressures ? Object.freeze(pressures) : undefined,
      [STUDIO_GPU_STROKE_FEED_REVISION]: revision,
    }));
  }
  return Object.freeze(snapshots);
}

/** Appends newly-started operations while preserving every existing operation revision. */
export function appendStudioGpuStrokeFeedOperations(
  previousStrokes: readonly StudioGpuStroke[],
  patch: StudioGpuStrokeOperationsAppendPatch,
  lineage: string
): readonly StudioGpuStroke[] | null {
  if (
    patch.previousStrokeCount !== previousStrokes.length
    || patch.suffixStrokes.length < 1
    || patch.fallbackStrokes.length !== previousStrokes.length + patch.suffixStrokes.length
  ) {
    return null;
  }
  for (let index = 0; index < previousStrokes.length; index += 1) {
    const previous = previousStrokes[index];
    const fallback = patch.fallbackStrokes[index];
    // Starting a new operation is low-frequency (once per stroke), so pay one exact semantic
    // prefix check here. Pointer-frame suffix appends remain history-free, while a direct public
    // operation patch can never silently retain edited/deleted authoritative history.
    if (
      !previous?.[STUDIO_GPU_STROKE_FEED_REVISION]
      || !fallback
      || !sameStudioGpuStroke(previous, fallback)
    ) {
      return null;
    }
  }
  for (let index = 0; index < patch.suffixStrokes.length; index += 1) {
    if (patch.fallbackStrokes[previousStrokes.length + index] !== patch.suffixStrokes[index]) {
      return null;
    }
  }
  const suffix = createStudioGpuStrokeFeedBaseline(patch.suffixStrokes, lineage);
  return suffix ? Object.freeze([...previousStrokes, ...suffix]) : null;
}

function validSuffixPatch(
  previous: StudioGpuStroke,
  patch: StudioGpuStrokeSuffixPatch
): boolean {
  const revision = previous[STUDIO_GPU_STROKE_FEED_REVISION];
  if (
    !revision
    || !sameStudioGpuStrokeFeedStyle(previous, patch.nextStroke)
    || patch.previousPointCount !== revision.pointCount
    || patch.suffixPoints.length < 2
    || patch.suffixPoints.length % 2 !== 0
    || patch.suffixPressures.length !== patch.suffixPoints.length / 2
    || !patch.suffixPoints.every(Number.isFinite)
    || !patch.suffixPressures.every(Number.isFinite)
  ) {
    return false;
  }
  const suffixPointCount = patch.suffixPoints.length / 2;
  const nextPointCount = patch.nextStroke.points.length / 2;
  if (
    !Number.isSafeInteger(nextPointCount)
    || nextPointCount !== revision.pointCount + suffixPointCount
    || (patch.nextStroke.pressures !== undefined
      && patch.nextStroke.pressures.length < nextPointCount)
  ) {
    return false;
  }
  const coordinateOffset = revision.pointCount * 2;
  for (let index = 0; index < patch.suffixPoints.length; index += 1) {
    if (!Object.is(patch.suffixPoints[index], patch.nextStroke.points[coordinateOffset + index])) {
      return false;
    }
  }
  for (let index = 0; index < suffixPointCount; index += 1) {
    if (!Object.is(
      clamp(patch.suffixPressures[index]!, 0, 1),
      pressureAt(patch.nextStroke, revision.pointCount + index)
    )) {
      return false;
    }
  }
  return true;
}

/** Applies a proven suffix without copying or comparing retained point history. */
export function advanceStudioGpuStrokeFeed(
  previousStrokes: readonly StudioGpuStroke[],
  patch: StudioGpuStrokeSuffixPatch
): StudioGpuStrokeFeedAdvance {
  if (
    !Number.isSafeInteger(patch.strokeIndex)
    || patch.strokeIndex < 0
    || patch.strokeIndex >= previousStrokes.length
    || patch.strokeIndex !== previousStrokes.length - 1
    || patch.fallbackStrokes.length !== previousStrokes.length
    || patch.fallbackStrokes[patch.strokeIndex] !== patch.nextStroke
  ) {
    return { status: "rejected", strokes: previousStrokes };
  }
  const previous = previousStrokes[patch.strokeIndex]!;
  const parent = previous[STUDIO_GPU_STROKE_FEED_REVISION];
  if (!parent || !validSuffixPatch(previous, patch)) {
    return { status: "rejected", strokes: previousStrokes };
  }

  const suffixPoints = Object.freeze([...patch.suffixPoints]);
  const suffixPressures = Object.freeze(patch.suffixPressures.map((value) => clamp(value, 0, 1)));
  let minimumX = parent.minimumX;
  let minimumY = parent.minimumY;
  let maximumX = parent.maximumX;
  let maximumY = parent.maximumY;
  let residualInkState = parent.residualInkState;
  let residualDabCount = parent.residualDabCount;
  for (let index = 0; index < suffixPressures.length; index += 1) {
    const x = suffixPoints[index * 2]!;
    const y = suffixPoints[index * 2 + 1]!;
    const [left, top, right, bottom] = boundsForPoint(
      previous.size,
      x,
      y,
      suffixPressures[index]!,
      previous.pressureModel
    );
    minimumX = Math.min(minimumX, left);
    minimumY = Math.min(minimumY, top);
    maximumX = Math.max(maximumX, right);
    maximumY = Math.max(maximumY, bottom);
    if (studioInkUsesResidualDabSpacing(previous.pressureModel) && previous.pressureModel) {
      if (!residualInkState || residualDabCount === undefined) {
        return { status: "rejected", strokes: previousStrokes };
      }
      const advanced = advanceStudioResidualInk(
        residualInkState,
        {
          x,
          y,
          pressure: suffixPressures[index]!,
          sourceIndex: parent.pointCount + index,
        },
        previous.size,
        previous.pressureModel,
        STUDIO_CAUSAL_INK_MAX_DABS - residualDabCount
      );
      if (!advanced.complete) return { status: "rejected", strokes: previousStrokes };
      residualInkState = advanced.state;
      residualDabCount += advanced.dabs.length;
      const bounds = { minimumX, minimumY, maximumX, maximumY };
      includeResidualDabBounds(advanced.dabs, bounds);
      ({ minimumX, minimumY, maximumX, maximumY } = bounds);
    }
  }
  const pointCount = parent.pointCount + suffixPressures.length;
  const revisionNumber = parent.revision + 1;
  const revision: StudioGpuStrokeFeedRevision = Object.freeze({
    lineage: parent.lineage,
    revision: revisionNumber,
    token: nextFeedToken(parent.lineage),
    pointCount,
    parent,
    parentPointCount: parent.pointCount,
    suffixPoints,
    suffixPressures,
    lastX: suffixPoints.at(-2)!,
    lastY: suffixPoints.at(-1)!,
    lastPressure: suffixPressures.at(-1)!,
    ...(residualInkState === undefined
      ? {}
      : { residualInkState, residualDabCount: residualDabCount! }),
    minimumX,
    minimumY,
    maximumX,
    maximumY,
    styleSignature: parent.styleSignature,
    trustedImmutable: true,
  });
  const nextStroke = Object.freeze({
    ...patch.nextStroke,
    [STUDIO_GPU_STROKE_FEED_REVISION]: revision,
  });
  const strokes = previousStrokes.slice();
  strokes[patch.strokeIndex] = nextStroke;
  return { status: "appended", strokes: Object.freeze(strokes) };
}

/**
 * Reconstructs only the bridge plus suffix missing from a retained revision. It never reads the
 * historical prefix of `stroke.points`, even when several pointer frames were coalesced.
 */
export function studioGpuStrokeFeedSuffixFromPointCount(
  stroke: StudioGpuStroke,
  previousPointCount: number
): StudioGpuStroke | null {
  const latest = stroke[STUDIO_GPU_STROKE_FEED_REVISION];
  if (
    !latest
    || !Number.isSafeInteger(previousPointCount)
    || previousPointCount < 1
    || previousPointCount >= latest.pointCount
  ) {
    return null;
  }
  const revisions: StudioGpuStrokeFeedRevision[] = [];
  let cursor: StudioGpuStrokeFeedRevision | null = latest;
  while (cursor && cursor.pointCount > previousPointCount) {
    revisions.push(cursor);
    cursor = cursor.parent;
  }
  if (!cursor || cursor.pointCount !== previousPointCount || cursor.lineage !== latest.lineage) {
    return null;
  }
  const points: number[] = [cursor.lastX, cursor.lastY];
  const pressures: number[] = [cursor.lastPressure];
  for (const revision of revisions.reverse()) {
    points.push(...revision.suffixPoints);
    pressures.push(...revision.suffixPressures);
  }
  return {
    id: stroke.id,
    points,
    pressures,
    color: stroke.color,
    size: stroke.size,
    ...(stroke.pressureModel === undefined ? {} : { pressureModel: stroke.pressureModel }),
    opacity: stroke.opacity,
    composite: stroke.composite,
    orderKey: stroke.orderKey,
  };
}

/** Finds the immutable feed revision that owns exactly one retained source-point prefix. */
export function studioGpuStrokeFeedRevisionAtPointCount(
  stroke: StudioGpuStroke,
  pointCount: number
): StudioGpuStrokeFeedRevision | null {
  const latest = stroke[STUDIO_GPU_STROKE_FEED_REVISION];
  if (!latest || !Number.isSafeInteger(pointCount) || pointCount < 1) return null;
  let cursor: StudioGpuStrokeFeedRevision | null = latest;
  while (cursor && cursor.pointCount > pointCount) cursor = cursor.parent;
  return cursor?.pointCount === pointCount && cursor.lineage === latest.lineage ? cursor : null;
}

function exactPrefixReferences(
  previous: readonly StudioGpuStroke[],
  next: readonly StudioGpuStroke[],
  count: number
): boolean {
  for (let index = 0; index < count; index += 1) {
    if (previous[index] !== next[index]) return false;
  }
  return true;
}

/**
 * Constant-history planner for the existing pinned full-array adapter. The pinned API already
 * promises immutable prefixes; incompatible shapes/styles are routed to the full rebuild path.
 */
export function planStudioGpuPinnedStrokeFeedUpdate(
  previous: readonly StudioGpuStroke[] | null,
  next: readonly StudioGpuStroke[]
): StudioGpuPinnedStrokeFeedUpdate {
  if (next.length === 0) return { mode: "reset" };
  if (!previous || previous.length === 0) {
    return { mode: "replace", strokes: next };
  }
  if (next.length > previous.length && exactPrefixReferences(previous, next, previous.length)) {
    return {
      mode: "append-operations",
      patch: {
        previousStrokeCount: previous.length,
        suffixStrokes: next.slice(previous.length),
        fallbackStrokes: next,
      },
    };
  }
  if (previous.length !== next.length) return { mode: "replace", strokes: next };
  const terminalIndex = next.length - 1;
  if (!exactPrefixReferences(previous, next, terminalIndex)) {
    return { mode: "replace", strokes: next };
  }
  const before = previous[terminalIndex]!;
  const after = next[terminalIndex]!;
  if (!sameStudioGpuStrokeFeedStyle(before, after)) {
    return { mode: "replace", strokes: next };
  }
  const previousPointCount = before.points.length / 2;
  const nextPointCount = after.points.length / 2;
  if (
    !Number.isSafeInteger(previousPointCount)
    || !Number.isSafeInteger(nextPointCount)
    || previousPointCount < 1
    || nextPointCount < previousPointCount
  ) {
    return { mode: "replace", strokes: next };
  }
  if (nextPointCount === previousPointCount) {
    // Pinned feeds promise immutable prefixes. Equal length therefore means a receipt/authority
    // refresh with no pixel change; arbitrary edits must use replacePinnedStrokes/full render.
    return { mode: "retain", strokes: next };
  }
  const suffixPoints = after.points.slice(previousPointCount * 2);
  const suffixPressures = Array.from(
    { length: nextPointCount - previousPointCount },
    (_, index) => pressureAt(after, previousPointCount + index)
  );
  return {
    mode: "append",
    patch: {
      strokeIndex: terminalIndex,
      previousPointCount,
      suffixPoints,
      suffixPressures,
      nextStroke: after,
      fallbackStrokes: next,
    },
  };
}
