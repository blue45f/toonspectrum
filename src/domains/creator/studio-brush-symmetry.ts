import type { StudioDynamicBrushDab } from "./studio-brush-dynamics";

export interface StudioBrushSymmetrySpec {
  type: "none" | "vertical" | "horizontal" | "radial" | "kaleidoscope";
  centerX: number;
  centerY: number;
  radialCount?: number;
}

/** Affine transform using x'=a·x+c·y+e, y'=b·x+d·y+f. */
export interface StudioBrushSymmetryTransform {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

const IDENTITY: StudioBrushSymmetryTransform = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

function finite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function radialCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 1
    ? Math.round(value)
    : 4;
}

function aroundCenter(
  a: number,
  b: number,
  c: number,
  d: number,
  centerX: number,
  centerY: number
): StudioBrushSymmetryTransform {
  return {
    a,
    b,
    c,
    d,
    e: centerX - a * centerX - c * centerY,
    f: centerY - b * centerX - d * centerY,
  };
}

/**
 * Returns transforms in exactly the same order as getSymmetricPoints/getKaleidoscopePoints:
 * identity, rotations, then (for kaleidoscope) mirror families.
 */
export function studioBrushSymmetryTransforms(
  symmetry?: StudioBrushSymmetrySpec
): StudioBrushSymmetryTransform[] {
  if (!symmetry || symmetry.type === "none") return [{ ...IDENTITY }];
  const centerX = finite(symmetry.centerX, 0);
  const centerY = finite(symmetry.centerY, 0);
  if (symmetry.type === "vertical") {
    return [{ ...IDENTITY }, aroundCenter(-1, 0, 0, 1, centerX, centerY)];
  }
  if (symmetry.type === "horizontal") {
    return [{ ...IDENTITY }, aroundCenter(1, 0, 0, -1, centerX, centerY)];
  }

  const count = radialCount(symmetry.radialCount);
  const transforms: StudioBrushSymmetryTransform[] = [{ ...IDENTITY }];
  for (let index = 1; index < count; index++) {
    const angle = index * 2 * Math.PI / count;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    transforms.push(aroundCenter(cos, sin, -sin, cos, centerX, centerY));
  }
  if (symmetry.type === "kaleidoscope") {
    for (let index = 0; index < count; index++) {
      const axisAngle = index * Math.PI / count;
      const cos = Math.cos(2 * axisAngle);
      const sin = Math.sin(2 * axisAngle);
      transforms.push(aroundCenter(cos, sin, sin, -cos, centerX, centerY));
    }
  }
  return transforms;
}

function transformPoint(
  x: number,
  y: number,
  transform: StudioBrushSymmetryTransform
): [number, number] {
  return [
    transform.a * x + transform.c * y + transform.e,
    transform.b * x + transform.d * y + transform.f,
  ];
}

/** Transforms the whole dab—including deterministic scatter and the elliptical tip axis. */
export function transformStudioDynamicBrushDab(
  dab: StudioDynamicBrushDab,
  transform: StudioBrushSymmetryTransform
): StudioDynamicBrushDab {
  if (
    transform.a === 1 && transform.b === 0 && transform.c === 0
    && transform.d === 1 && transform.e === 0 && transform.f === 0
  ) {
    return { ...dab };
  }
  const [sourceX, sourceY] = transformPoint(dab.sourceX, dab.sourceY, transform);
  const [x, y] = transformPoint(dab.x, dab.y, transform);
  const angleRadians = dab.angle * Math.PI / 180;
  const axisX = Math.cos(angleRadians);
  const axisY = Math.sin(angleRadians);
  const transformedAxisX = transform.a * axisX + transform.c * axisY;
  const transformedAxisY = transform.b * axisX + transform.d * axisY;
  const angle = Math.atan2(transformedAxisY, transformedAxisX) * 180 / Math.PI;
  return { ...dab, sourceX, sourceY, x, y, angle };
}

/** Builds every exact affine copy from one deterministic base plan. */
export function studioDynamicBrushDabVariations(
  dabs: readonly StudioDynamicBrushDab[],
  symmetry?: StudioBrushSymmetrySpec
): StudioDynamicBrushDab[][] {
  return studioBrushSymmetryTransforms(symmetry).map((transform) =>
    dabs.map((dab) => transformStudioDynamicBrushDab(dab, transform))
  );
}
