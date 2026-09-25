import { describe, expect, it } from "vitest";

import { DEFAULT_STUDIO_WORLD_MANIFEST } from "./studio-virtual-space-world-manifest";
import { studioSemanticSurfaceAt } from "./studio-virtual-space-semantic-world";
import {
  STUDIO_TOWN_LANDMARKS,
  STUDIO_TOWN_PLAZAS,
  STUDIO_TOWN_WATERFALLS,
  studioTownEnvironmentInteractions,
  studioTownLineCanTraverse,
  studioTownNearestWalkablePoint,
  studioTownPathSegments,
  studioTownTraversalProfile,
  studioTownUsesLivingLayout,
} from "./studio-virtual-space-town-layout";

describe("Virtual Studio living town layout", () => {
  it("기존 월드 ID를 재사용한 authored tilemap에 숨은 하늘 통행 제한과 고정 물 지형을 적용하지 않는다", () => {
    const authored = {
      ...DEFAULT_STUDIO_WORLD_MANIFEST,
      tilemap: {
        orientation: "orthogonal" as const, renderOrder: "right-down" as const,
        width: 40, height: 30, tileWidth: 32, tileHeight: 32,
        tilesets: [{ firstGid: 1, name: "ground", imageUrl: "/ground.png", imageWidth: 32, imageHeight: 32, tileWidth: 32, tileHeight: 32, columns: 1, tileCount: 1, margin: 0, spacing: 0 }],
        layers: [{ id: "ground", name: "새 바닥", width: 40, height: 30, x: 0, y: 0, visible: true, opacity: 1, depth: -1000, data: Array.from({ length: 1200 }, () => 1) }],
      },
    };
    const oldSky = { x: 10, y: 450 };
    expect(studioTownUsesLivingLayout(DEFAULT_STUDIO_WORLD_MANIFEST)).toBe(true);
    expect(studioTownUsesLivingLayout(authored)).toBe(false);
    expect(studioTownTraversalProfile(DEFAULT_STUDIO_WORLD_MANIFEST, oldSky).allowed).toBe(false);
    expect(studioTownTraversalProfile(authored, oldSky)).toEqual({ allowed: true, onPath: false, distanceToPath: 0, kind: "room", cost: 1 });
    expect(studioTownNearestWalkablePoint(authored, oldSky)).toEqual(oldSky);
    expect(studioTownLineCanTraverse(authored, oldSky, { x: 10, y: 600 })).toBe(true);
    expect(studioSemanticSurfaceAt(authored, { x: 585, y: 550 })).toMatchObject({ kind: "room", elevation: 0, speedMultiplier: 1 });
  });

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
