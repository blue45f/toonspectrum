/**
 * Map a document-space pointer hit onto auto-color planner seed coordinates.
 *
 * Pure + deterministic. Supports axis-aligned (and optionally 180°) image layers only —
 * rotated/flipped non-trivial cases fail closed so the canvas never invents a seed.
 */

export interface StudioAutoColorCanvasImageFrame {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation?: number;
  readonly flipped?: boolean;
  readonly flippedY?: boolean;
}

export interface StudioAutoColorCanvasSeedSample {
  /** Planner pixel x (0..pixelWidth-1 domain, float allowed; planner truncates). */
  readonly x: number;
  readonly y: number;
}

function finite(value: unknown, fallback = Number.NaN): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeRotationDegrees(rotation: number): number {
  const wrapped = ((rotation % 360) + 360) % 360;
  // Snap near 0 / 180 for float noise from UI.
  if (wrapped < 0.5 || wrapped > 359.5) return 0;
  if (Math.abs(wrapped - 180) < 0.5) return 180;
  return wrapped;
}

/**
 * Convert a document-canvas pointer into image-local planner pixels.
 * Returns null when the hit is outside the image or the frame is not seedable.
 */
export function mapStudioDocumentPointToAutoColorSeed(input: {
  readonly documentX: number;
  readonly documentY: number;
  readonly image: StudioAutoColorCanvasImageFrame;
  /** Natural / decoded pixel size used by the auto-color planner. */
  readonly pixelWidth: number;
  readonly pixelHeight: number;
}): StudioAutoColorCanvasSeedSample | null {
  const docX = finite(input.documentX);
  const docY = finite(input.documentY);
  const frame = input.image;
  const pxW = Math.floor(finite(input.pixelWidth));
  const pxH = Math.floor(finite(input.pixelHeight));
  const x = finite(frame.x);
  const y = finite(frame.y);
  const w = finite(frame.width);
  const h = finite(frame.height);
  if (
    ![docX, docY, x, y, w, h].every(Number.isFinite)
    || w <= 0
    || h <= 0
    || !Number.isSafeInteger(pxW)
    || !Number.isSafeInteger(pxH)
    || pxW < 1
    || pxH < 1
  ) {
    return null;
  }

  const rotation = normalizeRotationDegrees(finite(frame.rotation, 0));
  if (rotation !== 0 && rotation !== 180) {
    // Non-trivial rotation needs a full inverse matrix; fail closed for MVP seed placement.
    return null;
  }
  if (frame.flipped || frame.flippedY) {
    // Flips change sample axes; fail closed until a dedicated flip mapper ships.
    return null;
  }

  let localX = docX - x;
  let localY = docY - y;
  if (rotation === 180) {
    localX = w - localX;
    localY = h - localY;
  }

  if (localX < 0 || localY < 0 || localX > w || localY > h) {
    return null;
  }

  // Map into planner pixel space; clamp to last addressable pixel for the edge hit.
  const sampleX = Math.min(pxW - 1e-6, Math.max(0, (localX / w) * pxW));
  const sampleY = Math.min(pxH - 1e-6, Math.max(0, (localY / h) * pxH));
  return { x: sampleX, y: sampleY };
}

/** Build a stable scribble seed id from canvas placement order. */
export function studioAutoColorCanvasSeedId(sequence: number): string {
  const n = Number.isSafeInteger(sequence) && sequence >= 0 ? sequence : 0;
  return `canvas-scribble-${n}`;
}

export const STUDIO_AUTO_COLOR_STROKE_SEED_MAX = 48;
export const STUDIO_AUTO_COLOR_STROKE_MIN_DISTANCE_DOC_DEFAULT = 8;

/**
 * Thin a freehand document polyline and map each kept point into planner seeds.
 * Spacing is in document pixels so zoom does not explode seed density; fails closed
 * for non-seedable frames (same rules as single-point mapping).
 */
export function sampleStudioAutoColorStrokeSeeds(input: {
  readonly documentPoints: readonly number[];
  readonly image: StudioAutoColorCanvasImageFrame;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
  /** Minimum document-space distance between successive kept samples. */
  readonly minDistanceDoc?: number;
  /** Hard cap on seeds emitted for one stroke (default STUDIO_AUTO_COLOR_STROKE_SEED_MAX). */
  readonly maxSeeds?: number;
}): StudioAutoColorCanvasSeedSample[] {
  const points = input.documentPoints;
  if (!Array.isArray(points) || points.length < 2) return [];
  const minDistance = Math.max(
    0,
    finite(input.minDistanceDoc, STUDIO_AUTO_COLOR_STROKE_MIN_DISTANCE_DOC_DEFAULT),
  );
  const maxSeeds = Math.max(
    1,
    Math.floor(finite(input.maxSeeds, STUDIO_AUTO_COLOR_STROKE_SEED_MAX)),
  );

  const out: StudioAutoColorCanvasSeedSample[] = [];
  let lastKeptX = Number.NaN;
  let lastKeptY = Number.NaN;

  for (let i = 0; i + 1 < points.length; i += 2) {
    const docX = finite(points[i]);
    const docY = finite(points[i + 1]);
    if (!Number.isFinite(docX) || !Number.isFinite(docY)) continue;

    if (out.length > 0) {
      const distance = Math.hypot(docX - lastKeptX, docY - lastKeptY);
      if (distance < minDistance) continue;
    }

    const sample = mapStudioDocumentPointToAutoColorSeed({
      documentX: docX,
      documentY: docY,
      image: input.image,
      pixelWidth: input.pixelWidth,
      pixelHeight: input.pixelHeight,
    });
    if (!sample) continue;

    // Deduplicate near-identical planner samples (stationary pen / min-distance edge).
    const previous = out[out.length - 1];
    if (
      previous
      && Math.hypot(sample.x - previous.x, sample.y - previous.y) < 0.25
    ) {
      continue;
    }

    out.push(sample);
    lastKeptX = docX;
    lastKeptY = docY;
    if (out.length >= maxSeeds) break;
  }

  return out;
}

/**
 * Incremental freehand sampler: decide whether to keep the next document point given the
 * last accepted sample. Pure helper for live pointer-move paths.
 */
export function shouldKeepStudioAutoColorStrokeSample(input: {
  readonly lastDocX: number;
  readonly lastDocY: number;
  readonly nextDocX: number;
  readonly nextDocY: number;
  readonly minDistanceDoc?: number;
  readonly hasLast?: boolean;
}): boolean {
  if (input.hasLast === false) return true;
  const lastX = finite(input.lastDocX);
  const lastY = finite(input.lastDocY);
  const nextX = finite(input.nextDocX);
  const nextY = finite(input.nextDocY);
  if (![lastX, lastY, nextX, nextY].every(Number.isFinite)) return false;
  const minDistance = Math.max(
    0,
    finite(input.minDistanceDoc, STUDIO_AUTO_COLOR_STROKE_MIN_DISTANCE_DOC_DEFAULT),
  );
  return Math.hypot(nextX - lastX, nextY - lastY) >= minDistance;
}
