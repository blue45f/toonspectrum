import { describe, expect, it } from "vitest";
import { DEFAULT_STUDIO_WORLD_MANIFEST, validateStudioWorldManifest } from "@/domains/creator/virtual-space/studio-virtual-space-world-manifest";
import { CAMPUS_DISTRICTS, campusDistrict } from "@/shared/lib/spatial-campus/campus-model";
import {
  campusObjectInteractionId,
  campusObjectInteractionIndex,
  campusWorld,
} from "./campus-world";

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
    expect(manifest.backgroundUrl).toBe(district.artworkUrl);
    expect(manifest.assetIntegrity).toBeUndefined();
    expect(JSON.stringify(DEFAULT_STUDIO_WORLD_MANIFEST)).toBe(before);
  });

  it("binds a bounded set of canonical objects to authored interaction anchors without exposing domain ids or hrefs", () => {
    const district = campusDistrict("market");
    const objects = [
      { id: "asset-A", title: "브러시 A", href: "/market/resource/asset-A", kind: "market-resource" as const },
      { id: "asset-B", title: "브러시 B", href: "/market/resource/asset-B", kind: "market-resource" as const },
      { id: "asset-C", title: "브러시 C", href: "/market/resource/asset-C", kind: "market-resource" as const },
      { id: "asset-D", title: "브러시 D", href: "/market/resource/asset-D", kind: "market-resource" as const },
    ];
    const manifest = campusWorld(district, objects);

    expect(validateStudioWorldManifest(manifest)).toEqual([]);
    const destinationCount = manifest.interactions.length - 3;
    expect(manifest.interactions.slice(0, destinationCount).map((item) => item.id))
      .toEqual(district.destinations.slice(0, destinationCount).map((item) => item.id));
    expect(manifest.interactions.slice(destinationCount).map((item) => item.id))
      .toEqual([
        campusObjectInteractionId(0),
        campusObjectInteractionId(1),
        campusObjectInteractionId(2),
      ]);
    expect(destinationCount).toBeGreaterThanOrEqual(1);
    expect(destinationCount + 3).toBeLessThanOrEqual(DEFAULT_STUDIO_WORLD_MANIFEST.interactions.length);
    expect(JSON.stringify(manifest.interactions)).not.toContain("asset-A");
    expect(JSON.stringify(manifest.interactions)).not.toContain("/market/resource/");
    expect(manifest.interactions.at(-1)?.labelKo).toBe("브러시 C");
  });

  it("parses only local bounded object interaction slots", () => {
    expect(campusObjectInteractionIndex("campus-object-0")).toBe(0);
    expect(campusObjectInteractionIndex("campus-object-2")).toBe(2);
    for (const value of [
      "campus-object-3",
      "campus-object--1",
      "campus-object-01x",
      "market-resource-A",
      "campus-object-999",
    ]) {
      expect(campusObjectInteractionIndex(value)).toBeNull();
    }
  });
});
