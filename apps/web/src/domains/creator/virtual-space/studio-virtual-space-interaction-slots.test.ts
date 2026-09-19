import { describe, expect, it } from "vitest";
import type { StudioTiledMapLike } from "./studio-virtual-space-tiled-adapter";
import { parseStudioWorldAuthoringImport, studioWorldManifestToTiledMap } from "./studio-virtual-space-world-authoring";
import { DEFAULT_STUDIO_WORLD_MANIFEST, validateStudioWorldManifest, type StudioVirtualSpaceWorldManifest, type StudioWorldInteractionSlotDefinition } from "./studio-virtual-space-world-manifest";

const slot: StudioWorldInteractionSlotDefinition = {
  id: "desk-left", roomId: "room", labelKo: "작업 자리", labelEn: "Workspace",
  approachPoint: { x: 40, y: 50 }, anchorPoint: { x: 50, y: 50 }, exitPoint: { x: 60, y: 50 }, facing: "up", radius: 10,
};
const world: StudioVirtualSpaceWorldManifest = {
  ...DEFAULT_STUDIO_WORLD_MANIFEST, width: 200, height: 200,
  rooms: [{ id: "room", x: 0, y: 0, width: 200, height: 200, labelKo: "방", labelEn: "Room" }],
  props: [], colliders: [], interactions: [], portals: [], npcs: [], occlusionLayers: [], spawns: [{ id: "main", point: { x: 30, y: 30 } }], interactionSlots: [slot],
};

describe("authored shared interaction slots", () => {
  it("round-trips the complete slot identity and geometry, including default world seats", () => {
    for (const manifest of [world, DEFAULT_STUDIO_WORLD_MANIFEST]) {
      const result = parseStudioWorldAuthoringImport(JSON.stringify(studioWorldManifestToTiledMap(manifest)), manifest);
      expect(result.interactionSlots).toEqual(manifest.interactionSlots);
      expect(validateStudioWorldManifest(result)).toEqual([]);
    }
  });
  it("does not silently add default seats to an older authored map without a slot layer", () => {
    const tiled = studioWorldManifestToTiledMap(world) as unknown as StudioTiledMapLike;
    const result = parseStudioWorldAuthoringImport(JSON.stringify({ ...tiled, layers: tiled.layers!.filter((layer) => layer.name !== "interaction-slots") }), DEFAULT_STUDIO_WORLD_MANIFEST);
    expect(result.interactionSlots).toEqual([]);
  });
  it.each([
    { ...slot, id: "desk:ambiguous" },
    { ...slot, roomId: "missing" },
    { ...slot, labelKo: " " },
    { ...slot, radius: 100 },
    { ...slot, approachPoint: { x: Number.NaN, y: 50 } },
    { ...slot, exitPoint: { x: 300, y: 50 } },
  ])("rejects invalid slot identity or geometry %#", (invalid) => {
    expect(validateStudioWorldManifest({ ...world, interactionSlots: [invalid] }).length).toBeGreaterThan(0);
  });
  it("rejects duplicate slots and malformed slot entries without throwing", () => {
    expect(validateStudioWorldManifest({ ...world, interactionSlots: [slot, slot] })).toContain("duplicate slot id: desk-left");
    const malformed = { ...world, interactionSlots: [null] } as unknown as StudioVirtualSpaceWorldManifest;
    expect(validateStudioWorldManifest(malformed)).toContain("interaction slot is invalid");
  });
  it("rejects a blocked approach, an unreachable exit, and an anchor outside its declared room", () => {
    expect(validateStudioWorldManifest({ ...world, colliders: [{ x: 35, y: 45, width: 10, height: 10 }] })).toContain("slot position is blocked: desk-left");
    expect(validateStudioWorldManifest({ ...world, colliders: [{ x: 95, y: 0, width: 10, height: 200 }], interactionSlots: [{ ...slot, exitPoint: { x: 150, y: 50 } }] })).toContain("slot approach or exit is unreachable: desk-left");
    expect(validateStudioWorldManifest({ ...world, rooms: [{ ...world.rooms[0]!, width: 40 }] })).toContain("slot anchor is outside its room: desk-left");
  });
  it("rejects a Tiled seat whose required anchor coordinate is missing", () => {
    const tiled = studioWorldManifestToTiledMap(world) as unknown as StudioTiledMapLike;
    const broken = { ...tiled, layers: tiled.layers!.map((layer) => layer.name === "interaction-slots" ? {
      ...layer, objects: layer.objects?.map((object) => ({ ...object, properties: object.properties?.filter((property) => property.name !== "anchorX") })),
    } : layer) };
    expect(() => parseStudioWorldAuthoringImport(JSON.stringify(broken), world)).toThrow(/slot position/u);
  });
});
