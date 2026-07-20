export type StudioAssetDragPayload =
  | { source: "local"; src: string; width: number; height: number }
  | { source: "community"; assetId: string };

export function serializeStudioLocalAssetDragPayload(input: {
  src: string;
  width: number;
  height: number;
}): string {
  return JSON.stringify({ source: "local", ...input } satisfies StudioAssetDragPayload);
}

export function serializeStudioCommunityAssetDragPayload(assetId: string): string {
  return JSON.stringify({ source: "community", assetId } satisfies StudioAssetDragPayload);
}

export function parseStudioAssetDragPayload(value: string): StudioAssetDragPayload | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const candidate = parsed as Record<string, unknown>;
  if (candidate.source === "community") {
    return typeof candidate.assetId === "string" &&
      candidate.assetId.length >= 1 &&
      candidate.assetId.length <= 200
      ? { source: "community", assetId: candidate.assetId }
      : null;
  }
  // `source` was absent in the pre-lazy-load local drag payload. Accept it only when all
  // raster fields pass the same finite-positive shape checks as the new explicit local payload.
  if (candidate.source !== "local" && candidate.source !== undefined) return null;
  if (
    typeof candidate.src !== "string" ||
    candidate.src.length < 1 ||
    typeof candidate.width !== "number" ||
    !Number.isFinite(candidate.width) ||
    candidate.width <= 0 ||
    typeof candidate.height !== "number" ||
    !Number.isFinite(candidate.height) ||
    candidate.height <= 0
  ) return null;
  return {
    source: "local",
    src: candidate.src,
    width: candidate.width,
    height: candidate.height,
  };
}
