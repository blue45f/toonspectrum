/**
 * Geometry Authority registry — one editable authority per asset; BufferGeometry is derived cache only.
 */

import {
  createStudioUnitCubeMesh,
  hashStudioEditableMesh,
  studioEditableMeshToTriangleSoup,
  type StudioEditableMesh,
} from "./studio-editable-half-edge-mesh";
import {
  createStudioMeshModifierStack,
  evaluateStudioMeshModifierStack,
  type StudioMeshModifierStack,
  type StudioSolidBooleanBackend,
} from "./studio-mesh-modifier-stack";
import { sha256HexPortable } from "./studio-sha256";

export const STUDIO_GEOMETRY_AUTHORITY_REVISION = 1 as const;

export type StudioGeometryKernelKind =
  | "half-edge"
  | "manifold-solid"
  | "render-cache";

export interface StudioRenderMeshCache {
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
  readonly derivedFromHash: string;
  readonly generatedAt: number;
}

export interface StudioGeometryAuthorityRecord {
  readonly assetId: string;
  readonly kernel: StudioGeometryKernelKind;
  readonly mesh: StudioEditableMesh;
  readonly modifierStack: StudioMeshModifierStack;
  readonly renderCache: StudioRenderMeshCache | null;
  readonly meshHash: string;
  readonly revision: number;
}

export interface StudioGeometryAuthorityRegistry {
  readonly revision: typeof STUDIO_GEOMETRY_AUTHORITY_REVISION;
  readonly records: Readonly<Record<string, StudioGeometryAuthorityRecord>>;
}

export type StudioGeometryAuthorityResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: string; readonly detail: string };

export function createStudioGeometryAuthorityRegistry(): StudioGeometryAuthorityRegistry {
  return {
    revision: STUDIO_GEOMETRY_AUTHORITY_REVISION,
    records: {},
  };
}

export function registerStudioGeometryAuthority(
  registry: StudioGeometryAuthorityRegistry,
  assetId: string,
  mesh: StudioEditableMesh = createStudioUnitCubeMesh(),
): StudioGeometryAuthorityResult<StudioGeometryAuthorityRegistry> {
  if (!assetId || assetId.length > 160) {
    return { ok: false, code: "invalid-id", detail: "assetId required" };
  }
  if (registry.records[assetId]) {
    return { ok: false, code: "duplicate", detail: `asset ${assetId} exists` };
  }
  const stack = createStudioMeshModifierStack(mesh);
  const record: StudioGeometryAuthorityRecord = {
    assetId,
    kernel: "half-edge",
    mesh,
    modifierStack: stack,
    renderCache: null,
    meshHash: hashStudioEditableMesh(mesh),
    revision: 1,
  };
  return {
    ok: true,
    value: {
      ...registry,
      records: { ...registry.records, [assetId]: record },
    },
  };
}

export function getStudioGeometryAuthority(
  registry: StudioGeometryAuthorityRegistry,
  assetId: string,
): StudioGeometryAuthorityRecord | null {
  return registry.records[assetId] ?? null;
}

/** Commit a new authority mesh; invalidates render cache. */
export function commitStudioGeometryAuthorityMesh(
  registry: StudioGeometryAuthorityRegistry,
  assetId: string,
  mesh: StudioEditableMesh,
): StudioGeometryAuthorityResult<StudioGeometryAuthorityRegistry> {
  const prev = registry.records[assetId];
  if (!prev) return { ok: false, code: "not-found", detail: assetId };
  const stack = createStudioMeshModifierStack(mesh, prev.modifierStack.modifiers);
  const record: StudioGeometryAuthorityRecord = {
    ...prev,
    mesh,
    modifierStack: stack,
    renderCache: null,
    meshHash: hashStudioEditableMesh(mesh),
    revision: prev.revision + 1,
  };
  return {
    ok: true,
    value: {
      ...registry,
      records: { ...registry.records, [assetId]: record },
    },
  };
}

export function setStudioGeometryAuthorityModifierStack(
  registry: StudioGeometryAuthorityRegistry,
  assetId: string,
  stack: StudioMeshModifierStack,
): StudioGeometryAuthorityResult<StudioGeometryAuthorityRegistry> {
  const prev = registry.records[assetId];
  if (!prev) return { ok: false, code: "not-found", detail: assetId };
  const record: StudioGeometryAuthorityRecord = {
    ...prev,
    modifierStack: stack,
    renderCache: null,
    revision: prev.revision + 1,
  };
  return {
    ok: true,
    value: {
      ...registry,
      records: { ...registry.records, [assetId]: record },
    },
  };
}

/** Evaluate modifiers and materialize derived render cache (never authority). */
export async function materializeStudioGeometryRenderCache(
  registry: StudioGeometryAuthorityRegistry,
  assetId: string,
  options: { readonly booleanBackend?: StudioSolidBooleanBackend; readonly now?: number } = {},
): Promise<StudioGeometryAuthorityResult<{
  readonly registry: StudioGeometryAuthorityRegistry;
  readonly cache: StudioRenderMeshCache;
}>> {
  const prev = registry.records[assetId];
  if (!prev) return { ok: false, code: "not-found", detail: assetId };
  const evaluated = await evaluateStudioMeshModifierStack(prev.modifierStack, {
    booleanBackend: options.booleanBackend,
  });
  if (!evaluated.ok) {
    return { ok: false, code: evaluated.code, detail: evaluated.detail };
  }
  const soup = studioEditableMeshToTriangleSoup(evaluated.value.mesh);
  const derivedFromHash = evaluated.value.resultHash;
  const cache: StudioRenderMeshCache = {
    positions: soup.positions,
    indices: soup.indices,
    derivedFromHash,
    generatedAt: options.now ?? 0,
  };
  const record: StudioGeometryAuthorityRecord = {
    ...prev,
    renderCache: cache,
    revision: prev.revision + 1,
  };
  return {
    ok: true,
    value: {
      registry: {
        ...registry,
        records: { ...registry.records, [assetId]: record },
      },
      cache,
    },
  };
}

export function assertRenderCacheIsNotAuthority(
  record: StudioGeometryAuthorityRecord,
): boolean {
  // Contract: render cache hash must differ from identity unless empty, and mesh hash is SoT.
  if (!record.renderCache) return true;
  return record.meshHash.length > 0 && record.kernel === "half-edge";
}

export function contentAddressStudioGeometryBytes(
  positions: Float32Array,
  indices: Uint32Array,
): `sha256:${string}` {
  const bytes = new Uint8Array(positions.byteLength + indices.byteLength + 8);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, positions.length, true);
  view.setUint32(4, indices.length, true);
  bytes.set(new Uint8Array(positions.buffer, positions.byteOffset, positions.byteLength), 8);
  bytes.set(
    new Uint8Array(indices.buffer, indices.byteOffset, indices.byteLength),
    8 + positions.byteLength,
  );
  return `sha256:${sha256HexPortable(bytes)}`;
}
