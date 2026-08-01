/**
 * Non-destructive mesh modifier stack (MOD-012…016).
 *
 * Evaluates Mirror / Array / Boolean / Solidify / Bevel on an editable-mesh source.
 * Source mesh is never mutated; stack params are pure data and undo reverts params.
 * Boolean commit uses a solid backend (Manifold-class) with failure diagnostics.
 */

import {
  bevelStudioEditableMeshEdges,
  createStudioEditableMeshFromPolygons,
  createStudioUnitCubeMesh,
  hashStudioEditableMesh,
  studioEditableMeshToTriangleSoup,
  type StudioEditableMesh,
  type StudioMeshVec3,
} from "./studio-editable-half-edge-mesh";
import { createStudioDefaultSolidBooleanBackend } from "./studio-solid-boolean-backend";

export const STUDIO_MESH_MODIFIER_STACK_REVISION = 1 as const;

export type StudioMeshModifierKind =
  | "mirror"
  | "array"
  | "boolean"
  | "solidify"
  | "bevel";

export type StudioMeshBooleanOp = "union" | "difference" | "intersection";

export interface StudioMeshMirrorModifier {
  readonly kind: "mirror";
  readonly id: string;
  readonly enabled: boolean;
  readonly axis: "x" | "y" | "z";
  readonly merge: boolean;
  readonly mergeThreshold: number;
  readonly bisect: boolean;
  readonly clip: boolean;
}

export interface StudioMeshArrayModifier {
  readonly kind: "array";
  readonly id: string;
  readonly enabled: boolean;
  readonly count: number;
  readonly offset: StudioMeshVec3;
  readonly mode: "linear" | "radial";
  readonly radialAngleRad?: number;
  readonly realizeInstances: boolean;
}

export interface StudioMeshBooleanModifier {
  readonly kind: "boolean";
  readonly id: string;
  readonly enabled: boolean;
  readonly operation: StudioMeshBooleanOp;
  /** Operand mesh serialized as triangle soup for solid commit. */
  readonly operand: {
    readonly positions: Float32Array;
    readonly indices: Uint32Array;
  };
}

export interface StudioMeshSolidifyModifier {
  readonly kind: "solidify";
  readonly id: string;
  readonly enabled: boolean;
  readonly thickness: number;
  readonly evenThickness: boolean;
  readonly rim: boolean;
}

export interface StudioMeshBevelModifier {
  readonly kind: "bevel";
  readonly id: string;
  readonly enabled: boolean;
  readonly amount: number;
  readonly segments: number;
  readonly angleLimitRad: number;
  readonly weightInfluence: number;
}

export type StudioMeshModifier =
  | StudioMeshMirrorModifier
  | StudioMeshArrayModifier
  | StudioMeshBooleanModifier
  | StudioMeshSolidifyModifier
  | StudioMeshBevelModifier;

export interface StudioMeshModifierStack {
  readonly revision: typeof STUDIO_MESH_MODIFIER_STACK_REVISION;
  readonly source: StudioEditableMesh;
  readonly modifiers: readonly StudioMeshModifier[];
}

export type StudioMeshModifierFailureCode =
  | "boolean-empty"
  | "boolean-failed"
  | "budget-exceeded"
  | "invalid-parameter"
  | "invalid-stack";

export type StudioMeshModifierResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly code: StudioMeshModifierFailureCode;
      readonly detail: string;
      readonly diagnostics?: readonly string[];
    };

/** Solid boolean commit backend (Manifold-class contract). */
export interface StudioSolidBooleanBackend {
  boolean(input: {
    readonly left: { readonly positions: Float32Array; readonly indices: Uint32Array };
    readonly right: { readonly positions: Float32Array; readonly indices: Uint32Array };
    readonly operation: StudioMeshBooleanOp;
  }): Promise<{
    readonly positions: Float32Array;
    readonly indices: Uint32Array;
    readonly diagnostic?: string;
  }>;
}

function ok<T>(value: T): StudioMeshModifierResult<T> {
  return { ok: true, value };
}

function fail<T>(
  code: StudioMeshModifierFailureCode,
  detail: string,
  diagnostics?: readonly string[],
): StudioMeshModifierResult<T> {
  return { ok: false, code, detail, diagnostics };
}

function v(x: number, y: number, z: number): StudioMeshVec3 {
  return { x, y, z };
}

export function createStudioMeshModifierStack(
  source: StudioEditableMesh = createStudioUnitCubeMesh(),
  modifiers: readonly StudioMeshModifier[] = [],
): StudioMeshModifierStack {
  return {
    revision: STUDIO_MESH_MODIFIER_STACK_REVISION,
    source,
    modifiers: [...modifiers],
  };
}

export function withStudioMeshModifier(
  stack: StudioMeshModifierStack,
  modifier: StudioMeshModifier,
): StudioMeshModifierStack {
  return { ...stack, modifiers: [...stack.modifiers, modifier] };
}

export function replaceStudioMeshModifier(
  stack: StudioMeshModifierStack,
  id: string,
  modifier: StudioMeshModifier,
): StudioMeshModifierResult<StudioMeshModifierStack> {
  const idx = stack.modifiers.findIndex((m) => m.id === id);
  if (idx < 0) return fail("invalid-stack", `modifier ${id} not found`);
  const modifiers = stack.modifiers.map((m, i) => (i === idx ? modifier : m));
  return ok({ ...stack, modifiers });
}

export function removeStudioMeshModifier(
  stack: StudioMeshModifierStack,
  id: string,
): StudioMeshModifierResult<StudioMeshModifierStack> {
  if (!stack.modifiers.some((m) => m.id === id)) {
    return fail("invalid-stack", `modifier ${id} not found`);
  }
  return ok({
    ...stack,
    modifiers: stack.modifiers.filter((m) => m.id !== id),
  });
}

function soupToMesh(
  positions: Float32Array,
  indices: Uint32Array,
): StudioEditableMesh {
  const verts: StudioMeshVec3[] = [];
  for (let i = 0; i < positions.length; i += 3) {
    verts.push(v(positions[i]!, positions[i + 1]!, positions[i + 2]!));
  }
  const faces: number[][] = [];
  for (let i = 0; i < indices.length; i += 3) {
    faces.push([indices[i]!, indices[i + 1]!, indices[i + 2]!]);
  }
  return createStudioEditableMeshFromPolygons(verts, faces);
}

function applyMirror(
  mesh: StudioEditableMesh,
  mod: StudioMeshMirrorModifier,
): StudioEditableMesh {
  const soup = studioEditableMeshToTriangleSoup(mesh);
  const positions: number[] = [...soup.positions];
  const indices: number[] = [...soup.indices];
  const axis = mod.axis === "x" ? 0 : mod.axis === "y" ? 1 : 2;
  const baseV = positions.length / 3;
  for (let i = 0; i < baseV; i += 1) {
    const x = positions[i * 3]!;
    const y = positions[i * 3 + 1]!;
    const z = positions[i * 3 + 2]!;
    const p = [x, y, z] as [number, number, number];
    if (mod.clip && p[axis]! < 0) {
      p[axis] = 0;
    }
    p[axis] = -p[axis]!;
    positions.push(p[0]!, p[1]!, p[2]!);
  }
  const triCount = indices.length / 3;
  for (let t = 0; t < triCount; t += 1) {
    const a = indices[t * 3]! + baseV;
    const b = indices[t * 3 + 1]! + baseV;
    const c = indices[t * 3 + 2]! + baseV;
    // flip winding
    indices.push(a, c, b);
  }
  return soupToMesh(new Float32Array(positions), new Uint32Array(indices));
}

function applyArray(
  mesh: StudioEditableMesh,
  mod: StudioMeshArrayModifier,
): StudioEditableMesh {
  const count = Math.max(1, Math.min(64, Math.trunc(mod.count)));
  const soup = studioEditableMeshToTriangleSoup(mesh);
  const positions: number[] = [];
  const indices: number[] = [];
  const vCount = soup.positions.length / 3;
  for (let i = 0; i < count; i += 1) {
    let ox = mod.offset.x * i;
    let oy = mod.offset.y * i;
    let oz = mod.offset.z * i;
    if (mod.mode === "radial") {
      const angle = (mod.radialAngleRad ?? Math.PI * 2) * (i / count);
      const r = Math.hypot(mod.offset.x, mod.offset.z) || 1;
      ox = Math.cos(angle) * r;
      oz = Math.sin(angle) * r;
      oy = mod.offset.y * i;
    }
    const base = positions.length / 3;
    for (let vi = 0; vi < vCount; vi += 1) {
      positions.push(
        soup.positions[vi * 3]! + ox,
        soup.positions[vi * 3 + 1]! + oy,
        soup.positions[vi * 3 + 2]! + oz,
      );
    }
    for (let t = 0; t < soup.indices.length; t += 1) {
      indices.push(soup.indices[t]! + base);
    }
  }
  return soupToMesh(new Float32Array(positions), new Uint32Array(indices));
}

function applySolidify(
  mesh: StudioEditableMesh,
  mod: StudioMeshSolidifyModifier,
): StudioEditableMesh {
  const soup = studioEditableMeshToTriangleSoup(mesh);
  const vCount = soup.positions.length / 3;
  // Average normals from adjacent tris
  const normals = new Float32Array(vCount * 3);
  for (let t = 0; t < soup.indices.length; t += 3) {
    const ia = soup.indices[t]!;
    const ib = soup.indices[t + 1]!;
    const ic = soup.indices[t + 2]!;
    const ax = soup.positions[ia * 3]!;
    const ay = soup.positions[ia * 3 + 1]!;
    const az = soup.positions[ia * 3 + 2]!;
    const bx = soup.positions[ib * 3]! - ax;
    const by = soup.positions[ib * 3 + 1]! - ay;
    const bz = soup.positions[ib * 3 + 2]! - az;
    const cx = soup.positions[ic * 3]! - ax;
    const cy = soup.positions[ic * 3 + 1]! - ay;
    const cz = soup.positions[ic * 3 + 2]! - az;
    const nx = by * cz - bz * cy;
    const ny = bz * cx - bx * cz;
    const nz = bx * cy - by * cx;
    for (const i of [ia, ib, ic]) {
      normals[i * 3]! += nx;
      normals[i * 3 + 1]! += ny;
      normals[i * 3 + 2]! += nz;
    }
  }
  for (let i = 0; i < vCount; i += 1) {
    const len = Math.hypot(
      normals[i * 3]!,
      normals[i * 3 + 1]!,
      normals[i * 3 + 2]!,
    );
    if (len > 1e-12) {
      normals[i * 3]! /= len;
      normals[i * 3 + 1]! /= len;
      normals[i * 3 + 2]! /= len;
    }
  }
  const thickness = mod.thickness;
  const positions = new Float32Array(vCount * 2 * 3);
  const indices: number[] = [];
  for (let i = 0; i < vCount; i += 1) {
    positions[i * 3] = soup.positions[i * 3]!;
    positions[i * 3 + 1] = soup.positions[i * 3 + 1]!;
    positions[i * 3 + 2] = soup.positions[i * 3 + 2]!;
    const j = vCount + i;
    const scale = mod.evenThickness ? thickness : thickness;
    positions[j * 3] = soup.positions[i * 3]! + normals[i * 3]! * scale;
    positions[j * 3 + 1] = soup.positions[i * 3 + 1]! + normals[i * 3 + 1]! * scale;
    positions[j * 3 + 2] = soup.positions[i * 3 + 2]! + normals[i * 3 + 2]! * scale;
  }
  for (let t = 0; t < soup.indices.length; t += 3) {
    const a = soup.indices[t]!;
    const b = soup.indices[t + 1]!;
    const c = soup.indices[t + 2]!;
    indices.push(a, b, c);
    indices.push(a + vCount, c + vCount, b + vCount);
    if (mod.rim) {
      indices.push(a, a + vCount, b + vCount, a, b + vCount, b);
      indices.push(b, b + vCount, c + vCount, b, c + vCount, c);
      indices.push(c, c + vCount, a + vCount, c, a + vCount, a);
    }
  }
  return soupToMesh(positions, new Uint32Array(indices));
}

function applyBevel(
  mesh: StudioEditableMesh,
  mod: StudioMeshBevelModifier,
): StudioEditableMesh {
  // Non-destructive stack bevel: topology-changing edge bevel (MOD-016 → MOD-006 kernel).
  const amount = Math.max(0, Math.min(0.45, mod.amount));
  if (amount === 0) return mesh;
  // Unique undirected half-edges (prefer lower id)
  const edgeIds: number[] = [];
  for (const he of mesh.halfEdges) {
    if (he.twin < 0 || he.id < he.twin) edgeIds.push(he.id);
  }
  // Apply sequential edge bevels; each call inserts verts + chamfer faces.
  let current = mesh;
  const limit = Math.max(1, Math.min(edgeIds.length, Math.trunc(mod.segments) * 12 || edgeIds.length));
  for (let i = 0; i < limit; i += 1) {
    const heId = edgeIds[i];
    if (heId === undefined) break;
    // Re-find a valid half-edge after previous rebuilds: use first boundary-or-manifold he
    const seed =
      current.halfEdges.find((h) => h.twin < 0 || h.id < h.twin)?.id
      ?? current.halfEdges[0]?.id;
    if (seed === undefined) break;
    const next = bevelStudioEditableMeshEdges(current, [seed], amount);
    if (!next.ok) break;
    current = next.value;
  }
  return current;
}

/**
 * Pure AABB solid boolean for watertight axis-aligned boxes (shipped fallback commit path).
 * Production may inject Manifold WASM via StudioSolidBooleanBackend.
 */
export function createStudioAabbSolidBooleanBackend(): StudioSolidBooleanBackend {
  return {
    async boolean(input) {
      const bounds = (positions: Float32Array) => {
        let minX = Infinity;
        let minY = Infinity;
        let minZ = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        let maxZ = -Infinity;
        for (let i = 0; i < positions.length; i += 3) {
          minX = Math.min(minX, positions[i]!);
          minY = Math.min(minY, positions[i + 1]!);
          minZ = Math.min(minZ, positions[i + 2]!);
          maxX = Math.max(maxX, positions[i]!);
          maxY = Math.max(maxY, positions[i + 1]!);
          maxZ = Math.max(maxZ, positions[i + 2]!);
        }
        return { minX, minY, minZ, maxX, maxY, maxZ };
      };
      const a = bounds(input.left.positions);
      const b = bounds(input.right.positions);
      let minX: number;
      let minY: number;
      let minZ: number;
      let maxX: number;
      let maxY: number;
      let maxZ: number;
      if (input.operation === "union") {
        minX = Math.min(a.minX, b.minX);
        minY = Math.min(a.minY, b.minY);
        minZ = Math.min(a.minZ, b.minZ);
        maxX = Math.max(a.maxX, b.maxX);
        maxY = Math.max(a.maxY, b.maxY);
        maxZ = Math.max(a.maxZ, b.maxZ);
      } else if (input.operation === "intersection") {
        minX = Math.max(a.minX, b.minX);
        minY = Math.max(a.minY, b.minY);
        minZ = Math.max(a.minZ, b.minZ);
        maxX = Math.min(a.maxX, b.maxX);
        maxY = Math.min(a.maxY, b.maxY);
        maxZ = Math.min(a.maxZ, b.maxZ);
        if (minX >= maxX || minY >= maxY || minZ >= maxZ) {
          throw new Error("boolean empty intersection");
        }
      } else {
        // difference: keep A when no overlap; when overlap, shrink A by clipping to non-overlap slab (simplified)
        minX = a.minX;
        minY = a.minY;
        minZ = a.minZ;
        maxX = a.maxX;
        maxY = a.maxY;
        maxZ = a.maxZ;
        const ox = Math.max(a.minX, b.minX) < Math.min(a.maxX, b.maxX);
        const oy = Math.max(a.minY, b.minY) < Math.min(a.maxY, b.maxY);
        const oz = Math.max(a.minZ, b.minZ) < Math.min(a.maxZ, b.maxZ);
        if (ox && oy && oz) {
          // cut maxX back if B covers the +X half of A
          if (b.minX <= a.minX && b.maxX < a.maxX) {
            minX = b.maxX;
          } else if (b.maxX >= a.maxX && b.minX > a.minX) {
            maxX = b.minX;
          }
        }
      }
      return boxSoup(minX, minY, minZ, maxX, maxY, maxZ);
    },
  };
}

function boxSoup(
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number,
): { positions: Float32Array; indices: Uint32Array } {
  const positions = new Float32Array([
    minX, minY, minZ,
    maxX, minY, minZ,
    maxX, maxY, minZ,
    minX, maxY, minZ,
    minX, minY, maxZ,
    maxX, minY, maxZ,
    maxX, maxY, maxZ,
    minX, maxY, maxZ,
  ]);
  const indices = new Uint32Array([
    0, 1, 2, 0, 2, 3,
    4, 6, 5, 4, 7, 6,
    0, 4, 5, 0, 5, 1,
    2, 6, 7, 2, 7, 3,
    0, 3, 7, 0, 7, 4,
    1, 5, 6, 1, 6, 2,
  ]);
  return { positions, indices };
}

export async function evaluateStudioMeshModifierStack(
  stack: StudioMeshModifierStack,
  options: { readonly booleanBackend?: StudioSolidBooleanBackend } = {},
): Promise<StudioMeshModifierResult<{
  readonly mesh: StudioEditableMesh;
  readonly sourceHash: string;
  readonly resultHash: string;
}>> {
  let current = stack.source;
  // MOD-014: commit path defaults to Manifold solid CSG (with pure convex fallback).
  const backend = options.booleanBackend ?? createStudioDefaultSolidBooleanBackend();
  for (const mod of stack.modifiers) {
    if (!mod.enabled) continue;
    try {
      if (mod.kind === "mirror") {
        current = applyMirror(current, mod);
      } else if (mod.kind === "array") {
        if (mod.count < 1 || mod.count > 64) {
          return fail("invalid-parameter", "array count must be 1..64");
        }
        current = applyArray(current, mod);
      } else if (mod.kind === "solidify") {
        if (!Number.isFinite(mod.thickness)) {
          return fail("invalid-parameter", "solidify thickness");
        }
        current = applySolidify(current, mod);
      } else if (mod.kind === "bevel") {
        current = applyBevel(current, mod);
      } else if (mod.kind === "boolean") {
        const left = studioEditableMeshToTriangleSoup(current);
        try {
          const out = await backend.boolean({
            left,
            right: mod.operand,
            operation: mod.operation,
          });
          if (out.indices.length === 0) {
            return fail("boolean-empty", "boolean produced empty mesh", [
              out.diagnostic ?? "empty",
            ]);
          }
          current = soupToMesh(out.positions, out.indices);
        } catch (error) {
          return fail(
            "boolean-failed",
            error instanceof Error ? error.message : "boolean failed",
            [error instanceof Error ? error.message : "unknown"],
          );
        }
      }
    } catch (error) {
      return fail(
        "invalid-stack",
        error instanceof Error ? error.message : "modifier evaluation failed",
      );
    }
  }
  return ok({
    mesh: current,
    sourceHash: hashStudioEditableMesh(stack.source),
    resultHash: hashStudioEditableMesh(current),
  });
}
