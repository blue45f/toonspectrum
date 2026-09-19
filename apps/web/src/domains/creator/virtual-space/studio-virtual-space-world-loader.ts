import {
  studioWorldManifestFromTiled,
  type StudioTiledMapLike,
} from "./studio-virtual-space-tiled-adapter";
import {
  DEFAULT_STUDIO_WORLD_MANIFEST,
  validateStudioWorldManifest,
  type StudioVirtualSpaceWorldManifest,
} from "./studio-virtual-space-world-manifest";

export const DEFAULT_STUDIO_TILED_MAP_URL = "/assets/virtual-studio/world/default-world.json";

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Pick<Response, "ok" | "json">>;

function isStudioTiledMapLike(value: unknown): value is StudioTiledMapLike {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return Number.isFinite(candidate.width)
    && Number.isFinite(candidate.height)
    && Number.isFinite(candidate.tilewidth)
    && Number.isFinite(candidate.tileheight)
    && Number(candidate.width) > 0
    && Number(candidate.height) > 0
    && Number(candidate.tilewidth) > 0
    && Number(candidate.tileheight) > 0;
}

export async function loadStudioVirtualSpaceWorldManifest(
  url = DEFAULT_STUDIO_TILED_MAP_URL,
  fetcher: FetchLike = globalThis.fetch.bind(globalThis),
  signal?: AbortSignal,
): Promise<StudioVirtualSpaceWorldManifest> {
  try {
    const response = await fetcher(url, signal ? { signal } : undefined);
    if (!response.ok) return DEFAULT_STUDIO_WORLD_MANIFEST;
    const raw: unknown = await response.json();
    if (!isStudioTiledMapLike(raw)) return DEFAULT_STUDIO_WORLD_MANIFEST;
    const manifest = studioWorldManifestFromTiled(raw, DEFAULT_STUDIO_WORLD_MANIFEST);
    return validateStudioWorldManifest(manifest).length === 0
      ? manifest
      : DEFAULT_STUDIO_WORLD_MANIFEST;
  } catch {
    return DEFAULT_STUDIO_WORLD_MANIFEST;
  }
}
