import { describe, expect, it } from "vitest";

import { studioVirtualDayPhase, studioVirtualTerrainAt } from "./studio-virtual-space-living-world";
import { DEFAULT_STUDIO_WORLD_MANIFEST } from "./studio-virtual-space-world-manifest";

describe("Virtual Studio living world", () => {
  it("applies physical terrain profiles instead of treating the world as one flat surface", () => {
    expect(studioVirtualTerrainAt(DEFAULT_STUDIO_WORLD_MANIFEST, { x: 585, y: 550 }).kind).toBe("shallow-water");
    expect(studioVirtualTerrainAt(DEFAULT_STUDIO_WORLD_MANIFEST, { x: 175, y: 412 }).kind).toBe("stone");
    expect(studioVirtualTerrainAt(DEFAULT_STUDIO_WORLD_MANIFEST, { x: 20, y: 260 }).speedMultiplier).toBeLessThan(1);
    expect(studioVirtualTerrainAt(DEFAULT_STUDIO_WORLD_MANIFEST, { x: 585, y: 550 }).speedMultiplier).toBeLessThan(0.7);
  });

  it("cycles through day phases deterministically", () => {
    const cycle = 1200;
    expect(studioVirtualDayPhase(0, cycle)).toBe("dawn");
    expect(studioVirtualDayPhase(300, cycle)).toBe("day");
    expect(studioVirtualDayPhase(760, cycle)).toBe("dusk");
    expect(studioVirtualDayPhase(1000, cycle)).toBe("night");
  });
});
