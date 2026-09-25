import { describe, expect, it } from "vitest";

import { DEFAULT_STUDIO_WORLD_MANIFEST } from "./studio-virtual-space-world-manifest";
import {
  STUDIO_TOWN_LANDMARKS,
  STUDIO_TOWN_PLAZAS,
  STUDIO_TOWN_WATERFALLS,
  studioTownEnvironmentInteractions,
  studioTownLineCanTraverse,
  studioTownNearestWalkablePoint,
  studioTownPathSegments,
  studioTownTraversalProfile,
} from "./studio-virtual-space-town-layout";

describe("Virtual Studio living town layout", () => {
  it("authors a connected, readable path network with varied destinations", () => {
    const segments = studioTownPathSegments(DEFAULT_STUDIO_WORLD_MANIFEST);
    expect(segments.length).toBeGreaterThanOrEqual(18);
    expect(new Set(segments.map((segment) => segment.kind))).toEqual(new Set(["stone", "garden", "bridge", "boardwalk"]));
    expect(STUDIO_TOWN_PLAZAS.length).toBeGreaterThanOrEqual(4);
    expect(STUDIO_TOWN_WATERFALLS.length).toBeGreaterThanOrEqual(4);
    expect(STUDIO_TOWN_LANDMARKS.length).toBeGreaterThanOrEqual(7);
  });

  it("keeps room centers and authored routes walkable while rejecting decorative sky gaps", () => {
    for (const room of DEFAULT_STUDIO_WORLD_MANIFEST.rooms) {
      const point = { x: room.x + room.width / 2, y: room.y + room.height / 2 };
      expect(studioTownTraversalProfile(DEFAULT_STUDIO_WORLD_MANIFEST, point).allowed).toBe(true);
    }
    const segment = studioTownPathSegments(DEFAULT_STUDIO_WORLD_MANIFEST)[0]!;
    expect(studioTownLineCanTraverse(DEFAULT_STUDIO_WORLD_MANIFEST, segment.from, segment.to)).toBe(true);
    expect(studioTownTraversalProfile(DEFAULT_STUDIO_WORLD_MANIFEST, { x: 10, y: 450 }).allowed).toBe(false);
    expect(studioTownTraversalProfile(DEFAULT_STUDIO_WORLD_MANIFEST, { x: 1265, y: 920 }).allowed).toBe(false);
  });

  it("projects off-path destinations back onto a valid corridor", () => {
    const target = studioTownNearestWalkablePoint(DEFAULT_STUDIO_WORLD_MANIFEST, { x: 18, y: 450 });
    expect(studioTownTraversalProfile(DEFAULT_STUDIO_WORLD_MANIFEST, target).allowed).toBe(true);
  });

  it("exposes explicit proximity interactions for waterfalls and landmarks", () => {
    const interactions = studioTownEnvironmentInteractions();
    expect(interactions.length).toBe(STUDIO_TOWN_WATERFALLS.length + STUDIO_TOWN_LANDMARKS.length);
    expect(new Set(interactions.map((item) => item.id)).size).toBe(interactions.length);
    expect(interactions.every((item) => item.radius >= 50 && item.action === "live")).toBe(true);
  });
});
