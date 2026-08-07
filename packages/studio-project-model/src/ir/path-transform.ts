import type { PaintIR } from "./color";
import type { PathIR, PathVerbIR } from "./path";
import type { SceneNodeIR } from "./scene";

/**
 * 2D affine transforms over the stable IR (V12 §13 production lane).
 *
 * Mat2d follows the CSS/Canvas `matrix(a, b, c, d, e, f)` convention:
 *
 *   x' = a·x + c·y + e
 *   y' = b·x + d·y + f
 *
 * Paths transform exactly (M/L/Q/C control points are all mapped; Z survives
 * untouched) because Bézier curves are closed under affine maps. Scalar
 * attributes that the v1 IR cannot re-express exactly — strokeWidth, radial
 * gradient radius, text glyph orientation — are approximated and reported in
 * `warnings`, never silently dropped (absolute rule: no quiet loss).
 */

export interface Mat2d {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export function identityMat2d(): Mat2d {
  return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
}

export function translateMat2d(tx: number, ty: number): Mat2d {
  return { a: 1, b: 0, c: 0, d: 1, e: tx, f: ty };
}

export function scaleMat2d(sx: number, sy: number): Mat2d {
  return { a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 };
}

/**
 * Rotation about the origin. Degrees (not radians) so the value plugs the
 * camera track's `rotationDeg` in directly. Positive angles appear clockwise
 * in the IR's y-down scene space (same as CSS `rotate()`).
 */
export function rotateMat2d(angleDeg: number): Mat2d {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };
}

/**
 * Matrix product `outer · inner`: the returned transform applies `inner`
 * first, then `outer` (standard column-vector composition).
 */
export function composeMat2d(outer: Mat2d, inner: Mat2d): Mat2d {
  return {
    a: outer.a * inner.a + outer.c * inner.b,
    b: outer.b * inner.a + outer.d * inner.b,
    c: outer.a * inner.c + outer.c * inner.d,
    d: outer.b * inner.c + outer.d * inner.d,
    e: outer.a * inner.e + outer.c * inner.f + outer.e,
    f: outer.b * inner.e + outer.d * inner.f + outer.f,
  };
}

export function applyMat2d(m: Mat2d, x: number, y: number): [number, number] {
  return [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
}

/** Exact affine image of a path — every M/L/Q/C control point mapped, Z kept. */
export function transformPathIR(path: PathIR, m: Mat2d): PathIR {
  const verbs: PathVerbIR[] = path.verbs.map((verb) => {
    switch (verb.v) {
      case "M":
      case "L": {
        const [x, y] = applyMat2d(m, verb.x, verb.y);
        return { v: verb.v, x, y };
      }
      case "Q": {
        const [cx, cy] = applyMat2d(m, verb.cx, verb.cy);
        const [x, y] = applyMat2d(m, verb.x, verb.y);
        return { v: "Q", cx, cy, x, y };
      }
      case "C": {
        const [c1x, c1y] = applyMat2d(m, verb.c1x, verb.c1y);
        const [c2x, c2y] = applyMat2d(m, verb.c2x, verb.c2y);
        const [x, y] = applyMat2d(m, verb.x, verb.y);
        return { v: "C", c1x, c1y, c2x, c2y, x, y };
      }
      case "Z":
        return { v: "Z" };
    }
  });
  return { verbs };
}

/**
 * Scalar behavior of the linear part, computed once per transform call:
 * uniform (similarity) transforms scale every length by the same factor
 * `|det|^0.5`; non-uniform ones only approximate scalar attributes.
 */
interface Mat2dProfile {
  det: number;
  /** Length scale for scalar attributes (strokeWidth, radius, font size). */
  lengthScale: number;
  /** True when both columns are orthogonal and equally long (similarity). */
  uniform: boolean;
  singular: boolean;
  /** Column norms — the sx/sy estimates quoted in warnings. */
  sx: number;
  sy: number;
  /** True when the map rotates or shears (text glyphs cannot follow). */
  rotatesOrShears: boolean;
}

const RELATIVE_EPSILON = 1e-9;

function profileMat2d(m: Mat2d): Mat2dProfile {
  const det = m.a * m.d - m.b * m.c;
  const col1 = m.a * m.a + m.b * m.b;
  const col2 = m.c * m.c + m.d * m.d;
  const dot = m.a * m.c + m.b * m.d;
  const magnitude = Math.max(col1, col2, RELATIVE_EPSILON);
  const uniform =
    Math.abs(col1 - col2) <= RELATIVE_EPSILON * magnitude &&
    Math.abs(dot) <= RELATIVE_EPSILON * magnitude;
  const lengthScale = Math.sqrt(Math.abs(det));
  return {
    det,
    lengthScale,
    uniform,
    singular: lengthScale <= 0,
    sx: Math.sqrt(col1),
    sy: Math.sqrt(col2),
    rotatesOrShears: m.b !== 0 || m.c !== 0,
  };
}

/** Warning-friendly number: enough digits to identify, no float noise. */
function fmt(value: number): string {
  return String(Number(value.toPrecision(6)));
}

export interface TransformSceneNodesResult {
  nodes: SceneNodeIR[];
  warnings: string[];
}

function scaleScalar(
  value: number,
  profile: Mat2dProfile,
  warnings: string[],
  describe: string,
): number {
  if (profile.singular) {
    warnings.push(
      `${describe}: 특이 행렬(det=0) — 길이 스칼라를 보존함(경로 좌표는 붕괴됨)`,
    );
    return value;
  }
  if (!profile.uniform) {
    warnings.push(
      `${describe}: 비균등 스케일(sx≈${fmt(profile.sx)}, sy≈${fmt(profile.sy)}) — |det|^0.5=${fmt(profile.lengthScale)} 근사 배율 적용됨`,
    );
  }
  return value * profile.lengthScale;
}

function transformPaint(
  paint: PaintIR,
  m: Mat2d,
  profile: Mat2dProfile,
  warnings: string[],
  nodeId: string,
): PaintIR {
  switch (paint.kind) {
    case "solid":
      return paint;
    case "linear-gradient": {
      const [fx, fy] = applyMat2d(m, paint.from[0], paint.from[1]);
      const [tx, ty] = applyMat2d(m, paint.to[0], paint.to[1]);
      return { ...paint, from: [fx, fy], to: [tx, ty] };
    }
    case "radial-gradient": {
      const [cx, cy] = applyMat2d(m, paint.center[0], paint.center[1]);
      const radius = scaleScalar(
        paint.radius,
        profile,
        warnings,
        `node ${nodeId}: radial-gradient radius`,
      );
      return { ...paint, center: [cx, cy], radius };
    }
  }
}

function transformNode(
  node: SceneNodeIR,
  m: Mat2d,
  profile: Mat2dProfile,
  warnings: string[],
): SceneNodeIR {
  switch (node.kind) {
    case "fill-path":
      return {
        ...node,
        path: transformPathIR(node.path, m),
        paint: transformPaint(node.paint, m, profile, warnings, node.id),
      };
    case "stroke-path":
      return {
        ...node,
        path: transformPathIR(node.path, m),
        paint: transformPaint(node.paint, m, profile, warnings, node.id),
        strokeWidth: scaleScalar(
          node.strokeWidth,
          profile,
          warnings,
          `stroke ${node.id}: strokeWidth`,
        ),
      };
    case "text": {
      if (profile.rotatesOrShears) {
        warnings.push(
          `text ${node.id}: 회전/전단 성분은 텍스트 노드로 표현 불가 — 앵커 좌표만 변환됨`,
        );
      }
      const [x, y] = applyMat2d(m, node.x, node.y);
      return {
        ...node,
        x,
        y,
        fontSizePx: scaleScalar(
          node.fontSizePx,
          profile,
          warnings,
          `text ${node.id}: fontSizePx`,
        ),
      };
    }
    case "group":
      return {
        ...node,
        clip: node.clip === null ? null : transformPathIR(node.clip, m),
        children: node.children.map((child) =>
          transformNode(child, m, profile, warnings),
        ),
      };
  }
}

/**
 * Affine image of a scene-node tree. Paths (stroke/fill geometry and group
 * clips) transform exactly and recursively. strokeWidth, radial gradient
 * radius and text font size scale by `|det|^0.5` — exact under uniform
 * (similarity) transforms, an approximation under non-uniform scale, which is
 * reported per attribute in `warnings`. Inputs are never mutated.
 */
export function transformSceneNodes(
  nodes: SceneNodeIR[],
  m: Mat2d,
): TransformSceneNodesResult {
  const warnings: string[] = [];
  const profile = profileMat2d(m);
  return {
    nodes: nodes.map((node) => transformNode(node, m, profile, warnings)),
    warnings,
  };
}
