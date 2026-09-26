import { describe, expect, it } from "vitest";

import { STUDIO_VIRTUAL_PLACES } from "./studio-virtual-space-place-catalog";
import {
  DEFAULT_STUDIO_VIRTUAL_PLACE_ID,
  readStudioVirtualPlaceId,
  studioVirtualPlaceIdFromPortalHref,
  studioVirtualPlaceSearch,
  studioVirtualPlaceTileAssetUrl,
  studioVirtualPlaceWorldManifest,
  studioVirtualPlaceWorldScope,
} from "./studio-virtual-space-place-world";
import { validateStudioWorldManifest } from "./studio-virtual-space-world-manifest";
import { studioNpcInteraction } from "./studio-virtual-space-npc-director";

describe("Virtual Studio independent place worlds", () => {
  it("builds one valid, tiled and portal-connected world per place", () => {
    const ids = new Set<string>();
    const scopes = new Set<string>();
    for (const place of STUDIO_VIRTUAL_PLACES) {
      const manifest = studioVirtualPlaceWorldManifest(place.id);
      const scope = studioVirtualPlaceWorldScope(place.id);
      expect(scope).toMatch(/^[a-f0-9]{64}$/u);
      expect(scopes.has(scope)).toBe(false);
      scopes.add(scope);
      expect(validateStudioWorldManifest(manifest), place.id).toEqual([]);
      expect(manifest.tilemap?.layers).toHaveLength(3);
      expect(manifest.rooms.map((room) => room.id)).toEqual([place.id]);
      expect(manifest.portals).toHaveLength(3);
      expect(studioNpcInteraction(manifest, manifest.npcs[0]!)).not.toBeNull();
      expect(manifest.npcs).toHaveLength(1);
      expect(manifest.props.length).toBeGreaterThanOrEqual(5);
      expect(ids.has(manifest.id)).toBe(false);
      ids.add(manifest.id);
    }
  });

  it("keeps project-only places out of personal-space query selection", () => {
    expect(readStudioVirtualPlaceId("?place=production-control", true))
      .toBe(DEFAULT_STUDIO_VIRTUAL_PLACE_ID);
    expect(readStudioVirtualPlaceId("?place=production-control", false))
      .toBe("production-control");
  });

  it("builds a personal portal cycle that never exposes project-only places", () => {
    const personalPlaces = STUDIO_VIRTUAL_PLACES.filter((place) => !place.projectOnly);
    for (const place of personalPlaces) {
      const manifest = studioVirtualPlaceWorldManifest(place.id, true);
      const portalTargets = manifest.portals
        .map((portal) => studioVirtualPlaceIdFromPortalHref(portal.href))
        .filter((target): target is string => Boolean(target));
      expect(portalTargets).not.toContain("team-meeting");
      expect(portalTargets).not.toContain("production-control");
      expect(validateStudioWorldManifest(manifest), place.id).toEqual([]);
    }
    const cafe = studioVirtualPlaceWorldManifest("creator-cafe", true);
    expect(cafe.portals.map((portal) => studioVirtualPlaceIdFromPortalHref(portal.href)))
      .toContain("tree-library");
    const projectCafe = studioVirtualPlaceWorldManifest("creator-cafe", false);
    expect(projectCafe.portals.map((portal) => studioVirtualPlaceIdFromPortalHref(portal.href)))
      .toContain("team-meeting");
  });

  it("preserves unrelated query state while switching places", () => {
    const search = studioVirtualPlaceSearch(
      "?activity=sessions&place=skyport&worldEdit=1",
      "review-gallery",
    );
    const params = new URLSearchParams(search);
    expect(params.get("place")).toBe("review-gallery");
    expect(params.get("activity")).toBe("sessions");
    expect(params.has("worldEdit")).toBe(false);
  });

  it("recognizes safe place portal hrefs and resolves themed assets", () => {
    expect(studioVirtualPlaceIdFromPortalHref("/studio/space?place=creator-cafe"))
      .toBe("creator-cafe");
    expect(studioVirtualPlaceIdFromPortalHref(
      "https://outside.invalid/studio/space?place=creator-cafe",
    )).toBeNull();
    expect(studioVirtualPlaceTileAssetUrl(
      "/assets/virtual-studio/living-town-v6/{style}/terrain-tile-atlas.webp",
      "neon",
    )).toContain("/neon/terrain-tile-atlas.webp");
  });
});
