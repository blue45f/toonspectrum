import type { StudioVirtualQualityTier } from "./studio-virtual-space-quality";

export interface StudioVirtualRuntimeMetrics {
  readonly fps: number;
  readonly frameTimeMs: number;
  readonly qualityTier: StudioVirtualQualityTier;
  readonly peerCount: number;
  readonly visiblePeerCount: number;
  readonly npcCount: number;
  readonly visibleNpcCount: number;
  readonly routeWaypoints: number;
  readonly failedTextures: number;
  readonly updatedAt: number;
}

export const EMPTY_STUDIO_VIRTUAL_RUNTIME_METRICS: StudioVirtualRuntimeMetrics = Object.freeze({
  fps: 0,
  frameTimeMs: 0,
  qualityTier: "balanced",
  peerCount: 0,
  visiblePeerCount: 0,
  npcCount: 0,
  visibleNpcCount: 0,
  routeWaypoints: 0,
  failedTextures: 0,
  updatedAt: 0,
});

export function sanitizeStudioVirtualRuntimeMetrics(value: StudioVirtualRuntimeMetrics): StudioVirtualRuntimeMetrics {
  const finite = (input: number, min: number, max: number) => Math.max(min, Math.min(max, Number.isFinite(input) ? input : min));
  return Object.freeze({
    fps: Math.round(finite(value.fps, 0, 240) * 10) / 10,
    frameTimeMs: Math.round(finite(value.frameTimeMs, 0, 1_000) * 10) / 10,
    qualityTier: value.qualityTier,
    peerCount: Math.round(finite(value.peerCount, 0, 10_000)),
    visiblePeerCount: Math.round(finite(value.visiblePeerCount, 0, 10_000)),
    npcCount: Math.round(finite(value.npcCount, 0, 10_000)),
    visibleNpcCount: Math.round(finite(value.visibleNpcCount, 0, 10_000)),
    routeWaypoints: Math.round(finite(value.routeWaypoints, 0, 10_000)),
    failedTextures: Math.round(finite(value.failedTextures, 0, 10_000)),
    updatedAt: Math.round(finite(value.updatedAt, 0, Number.MAX_SAFE_INTEGER)),
  });
}

/** Runtime metrics are deliberately local and contain no nickname, chat, route, or document content. */
export function studioVirtualRuntimeHealth(metrics: StudioVirtualRuntimeMetrics): "good" | "limited" | "poor" {
  if (!metrics.updatedAt) return "limited";
  if (metrics.failedTextures > 0 || metrics.fps > 0 && metrics.fps < 24) return "poor";
  if (metrics.fps > 0 && metrics.fps < 40) return "limited";
  return "good";
}
