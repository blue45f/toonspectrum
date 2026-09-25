import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import type { StudioVirtualSpaceWorldManifest } from "./studio-virtual-space-world-manifest";
import { resolveStudioWorldSpawn, studioWorldCanOccupy } from "./studio-virtual-space-world-pathfinding";

const VIRTUAL_SPACE_POSITION_STORAGE_PREFIX = "toonspectrum:virtual-space-position:v3";
const LEGACY_VIRTUAL_SPACE_POSITION_STORAGE_PREFIX = "toonspectrum:virtual-space-position:v2";

interface StudioSessionPositionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface StudioVirtualSpacePositionScope {
  readonly projectId: string;
  readonly mode: "production" | "authoring-preview";
  readonly placeId?: string;
}

export function studioVirtualSpacePositionScope(
  projectId: string,
  authoringPreview: boolean,
  placeId?: string,
): StudioVirtualSpacePositionScope {
  return Object.freeze({
    projectId,
    mode: authoringPreview ? "authoring-preview" : "production",
    ...(placeId ? { placeId } : {}),
  });
}

export function studioVirtualSpacePositionStorageKey(
  scope: StudioVirtualSpacePositionScope,
): string {
  const place = scope.placeId ? `:${scope.placeId.length}:${scope.placeId}` : "";
  return `${VIRTUAL_SPACE_POSITION_STORAGE_PREFIX}:${scope.mode}:${scope.projectId.length}:${scope.projectId}${place}`;
}

function legacyProductionStorageKey(scope: StudioVirtualSpacePositionScope): string | null {
  // The old authoring namespace was `${projectId}:local-world-preview`, so a
  // production project with that suffix cannot safely distinguish legacy data.
  return scope.mode === "production" && !scope.placeId && !scope.projectId.endsWith(":local-world-preview")
    ? `${LEGACY_VIRTUAL_SPACE_POSITION_STORAGE_PREFIX}:${scope.projectId}`
    : null;
}

function browserSessionStorage(): StudioSessionPositionStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function readStudioVirtualSpaceSessionPoint(
  scope: StudioVirtualSpacePositionScope,
  fallback: StudioVirtualSpacePoint,
  manifest: StudioVirtualSpaceWorldManifest,
  storage: StudioSessionPositionStorage | null = browserSessionStorage(),
): StudioVirtualSpacePoint {
  if (!storage) return fallback;
  try {
    const legacyKey = legacyProductionStorageKey(scope);
    const raw = storage.getItem(studioVirtualSpacePositionStorageKey(scope))
      ?? (legacyKey ? storage.getItem(legacyKey) : null);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as { x?: unknown; y?: unknown };
    if (
      typeof parsed.x !== "number"
      || typeof parsed.y !== "number"
      || !Number.isFinite(parsed.x)
      || !Number.isFinite(parsed.y)
    ) {
      return fallback;
    }
    const candidate = { x: parsed.x, y: parsed.y };
    return studioWorldCanOccupy(manifest, candidate) ? candidate : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Resolve a session-scoped remembered point only after a collision-safe fallback
 * exists. Returning null prevents presence from publishing an invalid position.
 */
export function resolveStudioVirtualSpaceSessionPoint(
  scope: StudioVirtualSpacePositionScope,
  manifest: StudioVirtualSpaceWorldManifest,
  preferred: StudioVirtualSpacePoint,
  storage: StudioSessionPositionStorage | null = browserSessionStorage(),
): StudioVirtualSpacePoint | null {
  const fallback = resolveStudioWorldSpawn(manifest, preferred);
  if (!fallback) return null;
  return readStudioVirtualSpaceSessionPoint(scope, fallback, manifest, storage);
}

export function writeStudioVirtualSpaceSessionPoint(
  scope: StudioVirtualSpacePositionScope,
  point: StudioVirtualSpacePoint,
  storage: StudioSessionPositionStorage | null = browserSessionStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(
      studioVirtualSpacePositionStorageKey(scope),
      JSON.stringify({ x: Math.round(point.x), y: Math.round(point.y) }),
    );
  } catch {
    // Storage can be unavailable in privacy-constrained browsers; movement still works in memory.
  }
}
