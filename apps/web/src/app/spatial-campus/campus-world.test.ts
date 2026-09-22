import { describe, expect, it } from "vitest";
import { DEFAULT_STUDIO_WORLD_MANIFEST, validateStudioWorldManifest } from "@/domains/creator/virtual-space/studio-virtual-space-world-manifest";
import { CAMPUS_DISTRICTS } from "@/shared/lib/spatial-campus/campus-model";
import { campusWorld } from "./campus-world";

describe("local campus world adapter", () => {
  it.each(CAMPUS_DISTRICTS)("validates $id using the existing world schema and collision geometry", (district) => {
    const before = JSON.stringify(DEFAULT_STUDIO_WORLD_MANIFEST);
    const manifest = campusWorld(district);
    expect(validateStudioWorldManifest(manifest)).toEqual([]);
    expect(manifest.npcs).toEqual([]);
    expect(manifest.portals).toEqual([]);
    expect(manifest.acousticZones).toEqual([]);
    expect(manifest.interactionSlots).toEqual([]);
    expect(manifest.interactions.map((item) => item.id)).toEqual(district.destinations.map((item) => item.id));
    expect(manifest.props.every((prop) => !prop.action && !prop.portal)).toBe(true);
    expect(manifest.backgroundUrl).toBe(DEFAULT_STUDIO_WORLD_MANIFEST.backgroundUrl);
    expect(JSON.stringify(DEFAULT_STUDIO_WORLD_MANIFEST)).toBe(before);
  });
});
