import { describe, expect, it } from "vitest";
import { sanitizeStudioVirtualRuntimeMetrics, studioVirtualRuntimeHealth } from "./studio-virtual-space-observability";

describe("Virtual Studio observability", () => {
  it("bounds local-only technical metrics and assigns health without user content", () => {
    const metrics = sanitizeStudioVirtualRuntimeMetrics({
      fps: 31.54,
      frameTimeMs: 31.7,
      qualityTier: "balanced",
      peerCount: 3,
      visiblePeerCount: 2,
      npcCount: 8,
      visibleNpcCount: 5,
      routeWaypoints: 4,
      failedTextures: 0,
      updatedAt: 1234,
    });
    expect(metrics.fps).toBe(31.5);
    expect(studioVirtualRuntimeHealth(metrics)).toBe("limited");
    expect(metrics).not.toHaveProperty("nickname");
    expect(metrics).not.toHaveProperty("chat");
  });
});
