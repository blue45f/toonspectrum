import { describe, expect, it } from "vitest";

import { studioVirtualDayPhase, studioVirtualTerrainAt } from "./studio-virtual-space-living-world";
import { DEFAULT_STUDIO_WORLD_MANIFEST } from "./studio-virtual-space-world-manifest";
import { studioVirtualPlaceWorldManifest } from "./studio-virtual-space-place-world";

describe("Virtual Studio living world", () => {
  it("applies physical terrain profiles instead of treating the world as one flat surface", () => {
    expect(studioVirtualTerrainAt(DEFAULT_STUDIO_WORLD_MANIFEST, { x: 585, y: 550 }).kind).toBe("shallow-water");
    expect(studioVirtualTerrainAt(DEFAULT_STUDIO_WORLD_MANIFEST, { x: 175, y: 412 }).kind).toBe("stone");
    expect(studioVirtualTerrainAt(DEFAULT_STUDIO_WORLD_MANIFEST, { x: 20, y: 260 }).speedMultiplier).toBeLessThan(1);
    expect(studioVirtualTerrainAt(DEFAULT_STUDIO_WORLD_MANIFEST, { x: 585, y: 550 }).speedMultiplier).toBeLessThan(0.7);
  });

  it("does not leak legacy water and grass slowdown into tiled place worlds", () => {
    const place = studioVirtualPlaceWorldManifest("review-gallery");
    expect(studioVirtualTerrainAt(place, { x: 585, y: 550 }).kind).toBe("path");
    expect(studioVirtualTerrainAt(place, { x: 20, y: 260 }).walkable).toBe(true);
  });

  it("cycles through day phases deterministically", () => {
    const cycle = 1200;
    expect(studioVirtualDayPhase(0, cycle)).toBe("dawn");
    expect(studioVirtualDayPhase(300, cycle)).toBe("day");
    expect(studioVirtualDayPhase(760, cycle)).toBe("dusk");
    expect(studioVirtualDayPhase(1000, cycle)).toBe("night");
  });
});

describe("앰비언트 무드 (Track C)", () => {
  it("시간대별 무드 값이 일관된다", async () => {
    const { studioLivingWorldAmbientMood } = await import("./studio-virtual-space-living-world");
    const dawn = studioLivingWorldAmbientMood("dawn");
    const night = studioLivingWorldAmbientMood("night");
    expect(dawn.activity).toBe("quiet");
    expect(night.brightness).toBeLessThan(dawn.brightness);
    expect(dawn.noteKo.length).toBeGreaterThan(0);
    expect(night.noteEn.length).toBeGreaterThan(0);
    const day = studioLivingWorldAmbientMood("day");
    expect(day.activity).toBe("lively");
  });
});
