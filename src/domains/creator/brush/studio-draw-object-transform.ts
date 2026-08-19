/**
 * Free affine transform for a single draw(선화) element — rotation and non-uniform scale.
 *
 * `studio-group-uniform-resize.ts` deliberately handles only positive, axis-aligned, *uniform*
 * corner resize across a whole selection, because tearing a mixed group under a general affine is
 * not a safe default. A single stroke has no such constraint: it is one point array, so the full
 * transform can be applied exactly.
 *
 * **The transform is baked into `points`, not stored as a matrix.** That is the existing convention
 * (`transformDocumentPointArray` in the group planner) and it is also the quality-correct choice:
 * a stroke scaled by re-rendering its transformed coordinates stays a vector path and is rasterized
 * at the final size, so it keeps full edge sharpness. Scaling a rasterized stroke instead — or
 * leaving a `scaleX/scaleY` on the Konva node — resamples already-rendered ink and visibly softens
 * it. DrawEl therefore gains no scale/rotation fields; the geometry *is* the state.
 *
 * Geometry matches how Konva reports a transformed node, so the editor can hand its Transformer
 * output straight through: the box is scaled first, then rotated about the target box's origin.
 *
 *   sx = target.width / source.width,  sy = target.height / source.height
 *   u  = (px - source.x) * sx,         v  = (py - source.y) * sy
 *   p' = (target.x + u·cosθ - v·sinθ,  target.y + u·sinθ + v·cosθ)
 *
 * With θ = 0 and sx = sy this reduces exactly to the group planner's uniform formula, so the two
 * paths agree wherever their domains overlap.
 *
 * A rejected transform returns `null` rather than a partially transformed stroke: callers treat
 * that as "leave the document untouched", the same all-or-nothing discipline the group planner uses.
 */
import type { DrawEl } from "../studio-element-model";

export interface StudioDrawObjectTransformBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Brush width response to the transform.
 *
 * `preserve` keeps the authored width — matching the group planner's default, where resizing a
 * layout must not silently re-weight line art. `scale` grows the width with the object, which is
 * what "make this drawing bigger" means for a single stroke.
 */
export type StudioDrawObjectStrokeWidthPolicy = "preserve" | "scale";

export interface StudioDrawObjectTransformInput {
  readonly el: DrawEl;
  readonly sourceBounds: StudioDrawObjectTransformBounds;
  /** Target box *before* rotation — width/height are the scaled extents, as Konva reports them. */
  readonly targetBounds: StudioDrawObjectTransformBounds;
  /** Clockwise rotation in degrees about the target box origin. Konva's `rotation()` convention. */
  readonly rotationDeg?: number;
  readonly strokeWidthPolicy?: StudioDrawObjectStrokeWidthPolicy;
}

/** Axis scale factors, exposed so callers can warn about (or reject) a non-uniform gesture. */
export interface StudioDrawObjectTransformScale {
  readonly scaleX: number;
  readonly scaleY: number;
  /** Geometric mean — the single factor applied to radial quantities like brush width. */
  readonly uniformEquivalent: number;
  readonly uniform: boolean;
}

const UNIFORM_SCALE_RELATIVE_EPSILON = 1e-6;

function finite(value: number): boolean {
  return Number.isFinite(value);
}

function finiteNonNegative(value: number): boolean {
  return finite(value) && value >= 0;
}

function finitePositive(value: number): boolean {
  return finite(value) && value > 0;
}

function finiteOptionalNonNegative(value: number | undefined): boolean {
  return value === undefined || finiteNonNegative(value);
}

function validBounds(bounds: StudioDrawObjectTransformBounds): boolean {
  return (
    finite(bounds.x) &&
    finite(bounds.y) &&
    finitePositive(bounds.width) &&
    finitePositive(bounds.height)
  );
}

function finiteEvenPoints(points: readonly number[] | undefined): boolean {
  return (
    points !== undefined &&
    points.length >= 2 &&
    points.length % 2 === 0 &&
    points.every(finite)
  );
}

function validShapeParams(shapeParams: DrawEl["shapeParams"]): boolean {
  return (
    shapeParams === undefined ||
    (finitePositive(shapeParams.starPoints) &&
      finiteNonNegative(shapeParams.starInnerRatio) &&
      finitePositive(shapeParams.polygonSides) &&
      finiteNonNegative(shapeParams.cornerRadius))
  );
}

function validSymmetry(symmetry: DrawEl["symmetry"]): boolean {
  return (
    symmetry === undefined ||
    (finite(symmetry.centerX) &&
      finite(symmetry.centerY) &&
      finiteOptionalNonNegative(symmetry.radialCount))
  );
}

/**
 * Resolves the axis scale factors for a source→target box pair.
 *
 * Exported so the editor can decide what to do about a non-uniform gesture (warn, or constrain the
 * handles) without duplicating the arithmetic or the uniformity epsilon.
 */
export function studioDrawObjectTransformScale(
  sourceBounds: StudioDrawObjectTransformBounds,
  targetBounds: StudioDrawObjectTransformBounds
): StudioDrawObjectTransformScale | null {
  if (!validBounds(sourceBounds) || !validBounds(targetBounds)) return null;
  const scaleX = targetBounds.width / sourceBounds.width;
  const scaleY = targetBounds.height / sourceBounds.height;
  if (!finitePositive(scaleX) || !finitePositive(scaleY)) return null;
  const uniformEquivalent = Math.sqrt(scaleX * scaleY);
  if (!finitePositive(uniformEquivalent)) return null;
  return {
    scaleX,
    scaleY,
    uniformEquivalent,
    uniform:
      Math.abs(scaleX - scaleY) <=
      UNIFORM_SCALE_RELATIVE_EPSILON * Math.max(1, scaleX, scaleY),
  };
}

/**
 * Applies a free affine transform to one draw element, returning a new element.
 *
 * Brush width scales by the geometric mean of the axis factors. That is exact for a uniform
 * transform; under a non-uniform one it is an explicit approximation, because a round brush nib
 * has no elliptical representation in the stroke model — the path deforms exactly, the nib keeps
 * its area. Callers that need to surface that trade-off can read `uniform` from
 * `studioDrawObjectTransformScale`.
 *
 * @returns the transformed element, or `null` if any input or result is not finite.
 */
export function planStudioDrawObjectTransform(
  input: StudioDrawObjectTransformInput
): DrawEl | null {
  const { el, sourceBounds, targetBounds } = input;
  const rotationDeg = input.rotationDeg ?? 0;
  const strokeWidthPolicy = input.strokeWidthPolicy ?? "scale";

  if (el.type !== "draw") return null;
  if (!finite(rotationDeg)) return null;
  if (
    !finiteEvenPoints(el.points) ||
    !finiteNonNegative(el.strokeWidth) ||
    !finiteOptionalNonNegative(el.sampleSpacing) ||
    !validShapeParams(el.shapeParams) ||
    !validSymmetry(el.symmetry)
  ) {
    return null;
  }

  const scale = studioDrawObjectTransformScale(sourceBounds, targetBounds);
  if (!scale) return null;

  const radians = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  const mapPoint = (px: number, py: number): { x: number; y: number } | null => {
    const u = (px - sourceBounds.x) * scale.scaleX;
    const v = (py - sourceBounds.y) * scale.scaleY;
    const x = targetBounds.x + u * cos - v * sin;
    const y = targetBounds.y + u * sin + v * cos;
    return finite(x) && finite(y) ? { x, y } : null;
  };

  const points = new Array<number>(el.points.length);
  for (let index = 0; index + 1 < el.points.length; index += 2) {
    const mapped = mapPoint(el.points[index]!, el.points[index + 1]!);
    if (!mapped) return null;
    points[index] = mapped.x;
    points[index + 1] = mapped.y;
  }

  const widthFactor = strokeWidthPolicy === "scale" ? scale.uniformEquivalent : 1;
  const strokeWidth = el.strokeWidth * widthFactor;
  if (!finite(strokeWidth)) return null;

  let sampleSpacing: number | undefined;
  if (el.sampleSpacing !== undefined) {
    sampleSpacing = el.sampleSpacing * widthFactor;
    if (!finite(sampleSpacing)) return null;
  }

  let shapeParams: DrawEl["shapeParams"];
  if (el.shapeParams !== undefined) {
    // Only the radial corner radius carries a length; counts and ratios are scale-free.
    const cornerRadius = el.shapeParams.cornerRadius * scale.uniformEquivalent;
    if (!finite(cornerRadius)) return null;
    shapeParams = { ...el.shapeParams, cornerRadius };
  }

  let symmetry: DrawEl["symmetry"];
  if (el.symmetry !== undefined) {
    const center = mapPoint(el.symmetry.centerX, el.symmetry.centerY);
    if (!center) return null;
    symmetry = { ...el.symmetry, centerX: center.x, centerY: center.y };
  }

  return {
    ...el,
    points,
    strokeWidth,
    ...(sampleSpacing !== undefined ? { sampleSpacing } : {}),
    ...(shapeParams !== undefined ? { shapeParams } : {}),
    ...(symmetry !== undefined ? { symmetry } : {}),
  };
}
