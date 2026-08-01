/**
 * CAD / sketch / B-Rep-lite kernel (CAD-001–011, 014 subset).
 * Pure geometry — not OCCT; provides constraint diagnostics + extrude/revolve solids for webtoon props.
 */

export const STUDIO_CAD_KERNEL_REVISION = 1 as const;

export type StudioCadVec2 = readonly [number, number];
export type StudioCadVec3 = readonly [number, number, number];

export type StudioCadCurve =
  | { readonly kind: "line"; readonly a: StudioCadVec2; readonly b: StudioCadVec2 }
  | { readonly kind: "circle"; readonly center: StudioCadVec2; readonly radius: number }
  | { readonly kind: "arc"; readonly center: StudioCadVec2; readonly radius: number; readonly startRad: number; readonly endRad: number }
  | { readonly kind: "spline"; readonly points: readonly StudioCadVec2[] };

export type StudioCadConstraint =
  | { readonly kind: "horizontal"; readonly curveIndex: number }
  | { readonly kind: "vertical"; readonly curveIndex: number }
  | { readonly kind: "parallel"; readonly a: number; readonly b: number }
  | { readonly kind: "perpendicular"; readonly a: number; readonly b: number }
  | { readonly kind: "coincident"; readonly a: number; readonly b: number; readonly endA: "a" | "b"; readonly endB: "a" | "b" }
  | { readonly kind: "distance"; readonly a: number; readonly b: number; readonly value: number }
  | { readonly kind: "radius"; readonly curveIndex: number; readonly value: number }
  | { readonly kind: "equal"; readonly a: number; readonly b: number };

export interface StudioCadSketch {
  readonly revision: typeof STUDIO_CAD_KERNEL_REVISION;
  readonly units: "mm" | "cm" | "m";
  readonly curves: readonly StudioCadCurve[];
  readonly constraints: readonly StudioCadConstraint[];
}

export type StudioCadConstraintState =
  | "under-constrained"
  | "fully-constrained"
  | "over-constrained";

export interface StudioCadConstraintReport {
  readonly state: StudioCadConstraintState;
  readonly degreesOfFreedom: number;
  readonly conflicts: readonly string[];
  readonly satisfied: readonly number[];
}

export function createStudioCadSketch(
  curves: readonly StudioCadCurve[] = [],
  constraints: readonly StudioCadConstraint[] = [],
  units: StudioCadSketch["units"] = "m",
): StudioCadSketch {
  return {
    revision: STUDIO_CAD_KERNEL_REVISION,
    units,
    curves: [...curves],
    constraints: [...constraints],
  };
}

function lineDir(c: StudioCadCurve): StudioCadVec2 | null {
  if (c.kind !== "line") return null;
  const dx = c.b[0] - c.a[0];
  const dz = c.b[1] - c.a[1];
  const l = Math.hypot(dx, dz) || 1;
  return [dx / l, dz / l];
}

export function diagnoseStudioCadConstraints(
  sketch: StudioCadSketch,
): StudioCadConstraintReport {
  const conflicts: string[] = [];
  const satisfied: number[] = [];
  let locked = 0;
  sketch.constraints.forEach((c, i) => {
    if (c.kind === "horizontal" || c.kind === "vertical") {
      const curve = sketch.curves[c.curveIndex];
      if (!curve || curve.kind !== "line") {
        conflicts.push(`constraint ${i}: missing line`);
        return;
      }
      const d = lineDir(curve)!;
      const ok =
        c.kind === "horizontal"
          ? Math.abs(d[1]) < 1e-3
          : Math.abs(d[0]) < 1e-3;
      if (ok) {
        satisfied.push(i);
        locked += 1;
      } else conflicts.push(`constraint ${i}: ${c.kind} violated`);
    } else if (c.kind === "radius") {
      const curve = sketch.curves[c.curveIndex];
      if (!curve || (curve.kind !== "circle" && curve.kind !== "arc")) {
        conflicts.push(`constraint ${i}: not a circle/arc`);
        return;
      }
      if (Math.abs(curve.radius - c.value) < 1e-6) {
        satisfied.push(i);
        locked += 1;
      } else conflicts.push(`constraint ${i}: radius ${curve.radius}≠${c.value}`);
    } else if (c.kind === "parallel" || c.kind === "perpendicular") {
      const a = sketch.curves[c.a];
      const b = sketch.curves[c.b];
      const da = a ? lineDir(a) : null;
      const db = b ? lineDir(b) : null;
      if (!da || !db) {
        conflicts.push(`constraint ${i}: need two lines`);
        return;
      }
      const dot = da[0] * db[0] + da[1] * db[1];
      const ok = c.kind === "parallel" ? Math.abs(Math.abs(dot) - 1) < 1e-3 : Math.abs(dot) < 1e-3;
      if (ok) {
        satisfied.push(i);
        locked += 1;
      } else conflicts.push(`constraint ${i}: ${c.kind} violated`);
    } else if (c.kind === "distance") {
      locked += 0.5;
      satisfied.push(i);
    } else if (c.kind === "equal" || c.kind === "coincident") {
      locked += 1;
      satisfied.push(i);
    }
  });
  // DOF approx: 2 per unconstrained line endpoint pair minus locks
  const baseDof = sketch.curves.length * 2;
  const dof = Math.max(0, Math.round(baseDof - locked));
  let state: StudioCadConstraintState = "under-constrained";
  if (conflicts.length > 0 && dof === 0) state = "over-constrained";
  else if (dof === 0 && conflicts.length === 0 && sketch.curves.length > 0) {
    state = "fully-constrained";
  } else if (conflicts.length > 0) state = "over-constrained";
  return { state, degreesOfFreedom: dof, conflicts, satisfied };
}

export interface StudioCadSolidMesh {
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
}

/** CAD-005: extrude closed polyline profile along +Y. */
export function extrudeStudioCadProfile(
  profile: readonly StudioCadVec2[],
  height: number,
): StudioCadSolidMesh | null {
  if (profile.length < 3 || !Number.isFinite(height) || height === 0) return null;
  const n = profile.length;
  const positions = new Float32Array(n * 2 * 3);
  for (let i = 0; i < n; i += 1) {
    positions[i * 3] = profile[i]![0];
    positions[i * 3 + 1] = 0;
    positions[i * 3 + 2] = profile[i]![1];
    positions[(n + i) * 3] = profile[i]![0];
    positions[(n + i) * 3 + 1] = height;
    positions[(n + i) * 3 + 2] = profile[i]![1];
  }
  const indices: number[] = [];
  // bottom + top fan
  for (let i = 1; i + 1 < n; i += 1) {
    indices.push(0, i + 1, i);
    indices.push(n, n + i, n + i + 1);
  }
  for (let i = 0; i < n; i += 1) {
    const a = i;
    const b = (i + 1) % n;
    const c = n + b;
    const d = n + i;
    indices.push(a, b, c, a, c, d);
  }
  return { positions, indices: new Uint32Array(indices) };
}

/** CAD-005: revolve profile around Y. */
export function revolveStudioCadProfile(
  profile: readonly StudioCadVec2[],
  segments = 16,
): StudioCadSolidMesh | null {
  if (profile.length < 2) return null;
  const segs = Math.max(3, Math.min(64, Math.trunc(segments)));
  const ring = profile.length;
  const positions: number[] = [];
  for (let s = 0; s < segs; s += 1) {
    const ang = (s / segs) * Math.PI * 2;
    const c = Math.cos(ang);
    const sn = Math.sin(ang);
    for (const p of profile) {
      const x = p[0] * c;
      const z = p[0] * sn;
      positions.push(x, p[1], z);
    }
  }
  const indices: number[] = [];
  for (let s = 0; s < segs; s += 1) {
    const s0 = s * ring;
    const s1 = ((s + 1) % segs) * ring;
    for (let i = 0; i + 1 < ring; i += 1) {
      indices.push(s0 + i, s0 + i + 1, s1 + i + 1, s0 + i, s1 + i + 1, s1 + i);
    }
  }
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}

/** CAD-014: area/volume approx for extruded solid. */
export function measureStudioCadExtrusion(
  profile: readonly StudioCadVec2[],
  height: number,
): { readonly area: number; readonly volume: number; readonly centroid: StudioCadVec3 } {
  let area2 = 0;
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < profile.length; i += 1) {
    const p = profile[i]!;
    const q = profile[(i + 1) % profile.length]!;
    const cross = p[0] * q[1] - q[0] * p[1];
    area2 += cross;
    cx += (p[0] + q[0]) * cross;
    cz += (p[1] + q[1]) * cross;
  }
  const area = Math.abs(area2) * 0.5;
  const a = area2 || 1;
  return {
    area,
    volume: area * Math.abs(height),
    centroid: [cx / (3 * a), height / 2, cz / (3 * a)],
  };
}

export interface StudioCadFeatureNode {
  readonly id: string;
  readonly kind: "sketch" | "extrude" | "revolve" | "fillet" | "pattern";
  readonly suppressed: boolean;
  readonly params: Readonly<Record<string, number | string | boolean>>;
  readonly dependsOn: readonly string[];
}

/** CAD-011 feature history tree — reorder/suppress/rebuild order. */
export function orderStudioCadFeatureTree(
  features: readonly StudioCadFeatureNode[],
): {
  readonly buildOrder: readonly string[];
  readonly cycles: readonly string[];
} {
  const byId = new Map(features.map((f) => [f.id, f] as const));
  const visited = new Set<string>();
  const stack = new Set<string>();
  const order: string[] = [];
  const cycles: string[] = [];
  const visit = (id: string) => {
    if (visited.has(id)) return;
    if (stack.has(id)) {
      cycles.push(id);
      return;
    }
    stack.add(id);
    const f = byId.get(id);
    if (f && !f.suppressed) {
      for (const d of f.dependsOn) visit(d);
      order.push(id);
    }
    stack.delete(id);
    visited.add(id);
  };
  for (const f of features) visit(f.id);
  return { buildOrder: order, cycles };
}
