import { describe, expect, it } from "vitest";

import tiledWorld from "../../../../public/assets/virtual-studio/world/default-world.json";

import {
  DEFAULT_STUDIO_WORLD_MANIFEST,
  studioWorldInteractions,
  studioWorldPortalTarget,
  studioWorldRoomAt,
  type StudioVirtualSpaceWorldManifest,
  validateStudioWorldManifest,
} from "./studio-virtual-space-world-manifest";
import {
  findStudioWorldPath,
  studioWorldCanOccupy,
} from "./studio-virtual-space-world-pathfinding";
import {
  studioWorldManifestFromTiled,
  type StudioTiledMapLike,
} from "./studio-virtual-space-tiled-adapter";
import {
  loadStudioVirtualSpaceWorldManifest,
} from "./studio-virtual-space-world-loader";

function property(name: string, value: unknown) {
  return { name, value };
}

describe("Virtual Studio world manifest", () => {
  it("keeps the default approved-art world valid", () => {
    expect(validateStudioWorldManifest(DEFAULT_STUDIO_WORLD_MANIFEST)).toEqual([]);
    expect(DEFAULT_STUDIO_WORLD_MANIFEST.width).toBe(850);
    expect(DEFAULT_STUDIO_WORLD_MANIFEST.height).toBe(798);
    expect(DEFAULT_STUDIO_WORLD_MANIFEST.rooms).toHaveLength(8);
    expect(DEFAULT_STUDIO_WORLD_MANIFEST.colliders.length).toBeGreaterThan(30);
    expect(studioWorldInteractions(DEFAULT_STUDIO_WORLD_MANIFEST).length).toBeGreaterThanOrEqual(8);
  });

  it("derives interactive props without requiring runtime code changes", () => {
    const manifest = {
      ...DEFAULT_STUDIO_WORLD_MANIFEST,
      props: [
        ...DEFAULT_STUDIO_WORLD_MANIFEST.props,
        {
          id: "future-music-console",
          kind: "interactive" as const,
          x: 410,
          y: 410,
          action: "community" as const,
          interactionRadius: 56,
          labelKo: "사운드 콘솔",
          labelEn: "Sound Console",
        },
      ],
    };
    const derived = studioWorldInteractions(manifest).find((item) => item.id === "future-music-console");
    expect(derived).toMatchObject({
      point: { x: 410, y: 410 },
      radius: 56,
      action: "community",
      labelEn: "Sound Console",
    });
    expect(derived?.zoneId).toBe(studioWorldRoomAt(manifest, { x: 410, y: 410 }));
  });

  it("rejects an authored NPC whose skin is not in the production registry", () => {
    const manifest: StudioVirtualSpaceWorldManifest = {
      ...DEFAULT_STUDIO_WORLD_MANIFEST,
      npcs: [{
        id: "unknown-skin-npc",
        skinKey: "typo-purplee",
        point: { x: 425, y: 600 },
        roomId: DEFAULT_STUDIO_WORLD_MANIFEST.rooms[0]!.id,
      }],
    };

    expect(validateStudioWorldManifest(manifest)).toContain(
      "npc references missing skin: unknown-skin-npc",
    );
  });

  it("rejects blocked spawns, portal targets and NPC routes before runtime", () => {
    const collider = { x: 300, y: 300, width: 100, height: 100 };
    const manifest: StudioVirtualSpaceWorldManifest = {
      ...DEFAULT_STUDIO_WORLD_MANIFEST,
      props: [],
      colliders: [collider],
      portals: [{
        id: "blocked-portal",
        point: { x: 250, y: 250 },
        radius: 24,
        targetPoint: { x: 350, y: 350 },
      }],
      spawns: [{ id: "main", point: { x: 350, y: 350 } }],
      npcs: [{
        id: "blocked-npc",
        skinKey: "purple",
        roomId: DEFAULT_STUDIO_WORLD_MANIFEST.rooms[0]!.id,
        point: { x: 350, y: 350 },
        behavior: "patrol",
        patrol: [{ x: 350, y: 350 }, { x: 250, y: 250 }],
      }],
    };

    expect(validateStudioWorldManifest(manifest)).toEqual(expect.arrayContaining([
      "portal target is blocked: blocked-portal",
      "spawn is blocked: main",
      "npc start is blocked: blocked-npc",
      "npc patrol is blocked: blocked-npc",
    ]));
  });

  it("rejects an authored world with no safe start floor", () => {
    const manifest: StudioVirtualSpaceWorldManifest = {
      ...DEFAULT_STUDIO_WORLD_MANIFEST,
      props: [],
      colliders: [{
        x: 0,
        y: 0,
        width: DEFAULT_STUDIO_WORLD_MANIFEST.width,
        height: DEFAULT_STUDIO_WORLD_MANIFEST.height,
      }],
    };
    expect(validateStudioWorldManifest(manifest))
      .toEqual(expect.arrayContaining(["spawn is blocked: main"]));
  });

  it("resolves room portals to that room's spawn unless coordinates override it", () => {
    const drawingSpawn = DEFAULT_STUDIO_WORLD_MANIFEST.spawns.find((spawn) => spawn.id === "drawing")!;
    expect(studioWorldPortalTarget(DEFAULT_STUDIO_WORLD_MANIFEST, {
      id: "to-drawing",
      point: { x: 400, y: 400 },
      radius: 24,
      targetRoomId: "drawing",
    })).toEqual(drawingSpawn.point);
    expect(studioWorldPortalTarget(DEFAULT_STUDIO_WORLD_MANIFEST, {
      id: "to-explicit",
      point: { x: 400, y: 400 },
      radius: 24,
      targetRoomId: "drawing",
      targetPoint: { x: 420, y: 520 },
    })).toEqual({ x: 420, y: 520 });
  });
});

describe("Virtual Studio Tiled adapter", () => {
  it("uses the production crop as the Tiled authoring reference", () => {
    const background = tiledWorld.layers.find((layer) => layer.name === "background");
    expect(background).toMatchObject({
      type: "imagelayer",
      image: "../production-v2/master-central-lossless.webp",
      imagewidth: 869,
      imageheight: 813,
    });
    expect(tiledWorld.properties.find((item) => item.name === "backgroundUrl")?.value)
      .toBe("/assets/virtual-studio/production-v2/master-central-lossless.webp");
  });

  it("supports new rooms, props, portals, spawns and NPCs from data", () => {
    const map: StudioTiledMapLike = {
      width: 500,
      height: 400,
      tilewidth: 2,
      tileheight: 2,
      properties: [
        property("backgroundUrl", "/custom-studio.webp"),
        property("backgroundAssetKey", "custom-studio"),
      ],
      layers: [
        {
          type: "objectgroup",
          name: "rooms",
          objects: [
            {
              id: 1,
              name: "meeting-room",
              x: 100,
              y: 120,
              width: 240,
              height: 180,
              properties: [
                property("roomId", "meeting-room"),
                property("labelKo", "회의실"),
                property("labelEn", "Meeting Room"),
                property("action", "community"),
              ],
            },
          ],
        },
        {
          type: "objectgroup",
          name: "colliders",
          objects: [{ id: 2, name: "meeting-table", x: 160, y: 210, width: 120, height: 42 }],
        },
        {
          type: "objectgroup",
          name: "props",
          objects: [
            {
              id: 3,
              name: "whiteboard",
              x: 300,
              y: 180,
              width: 90,
              height: 50,
              properties: [
                property("kind", "interactive"),
                property("assetKey", "meeting-whiteboard"),
                property("assetUrl", "/assets/whiteboard.webp"),
                property("collider", false),
                property("action", "community"),
                property("interactionRadius", 72),
                property("depth", "fixed"),
                property("fixedDepth", 650),
              ],
            },
          ],
        },
        {
          type: "objectgroup",
          name: "interactions",
          objects: [
            {
              id: 4,
              name: "meeting-whiteboard-action",
              x: 310,
              y: 220,
              properties: [
                property("roomId", "meeting-room"),
                property("radius", 70),
                property("labelKo", "화이트보드"),
                property("labelEn", "Whiteboard"),
                property("action", "community"),
              ],
            },
          ],
        },
        {
          type: "objectgroup",
          name: "portals",
          objects: [
            {
              id: 5,
              name: "meeting-exit",
              x: 330,
              y: 290,
              properties: [
                property("radius", 34),
                property("targetRoomId", "meeting-room"),
                property("targetX", 130),
                property("targetY", 250),
              ],
            },
          ],
        },
        {
          type: "objectgroup",
          name: "spawns",
          objects: [
            {
              id: 6,
              name: "meeting-room",
              x: 140,
              y: 250,
              properties: [property("facing", "up")],
            },
          ],
        },
        {
          type: "objectgroup",
          name: "npcs",
          objects: [
            {
              id: 7,
              name: "producer-npc",
              x: 230,
              y: 280,
              properties: [
                property("skinKey", "dark"),
                property("roomId", "meeting-room"),
                property("behavior", "patrol"),
                property("speed", 64),
                property("patrol", "230,280;300,280;300,320"),
              ],
            },
          ],
        },
      ],
    };

    const manifest = studioWorldManifestFromTiled(map, DEFAULT_STUDIO_WORLD_MANIFEST);
    expect(manifest).toMatchObject({
      width: 1000,
      height: 800,
      backgroundUrl: "/custom-studio.webp",
      backgroundAssetKey: "custom-studio",
    });
    expect(manifest.rooms[0]?.id).toBe("meeting-room");
    expect(manifest.props[0]).toMatchObject({
      id: "whiteboard",
      assetUrl: "/assets/whiteboard.webp",
      action: "community",
      interactionRadius: 72,
      fixedDepth: 650,
      collider: undefined,
    });
    expect(manifest.portals[0]).toMatchObject({
      id: "meeting-exit",
      targetRoomId: "meeting-room",
      targetPoint: { x: 130, y: 250 },
    });
    expect(manifest.spawns[0]).toMatchObject({ id: "meeting-room", facing: "up" });
    expect(manifest.npcs[0]).toMatchObject({
      id: "producer-npc",
      skinKey: "dark",
      behavior: "patrol",
      speed: 64,
      patrol: [{ x: 230, y: 280 }, { x: 300, y: 280 }, { x: 300, y: 320 }],
    });
    expect(validateStudioWorldManifest(manifest)).toEqual([]);
  });
});

describe("Virtual Studio manifest pathfinding", () => {
  it("routes to a walkable position when a click lands on furniture", () => {
    const start = DEFAULT_STUDIO_WORLD_MANIFEST.spawns.find((spawn) => spawn.id === "main")!.point;
    const sofa = DEFAULT_STUDIO_WORLD_MANIFEST.props.find((prop) => prop.id === "lounge-sofa")!;
    const path = findStudioWorldPath(DEFAULT_STUDIO_WORLD_MANIFEST, start, {
      x: sofa.collider!.x + sofa.collider!.width / 2,
      y: sofa.collider!.y + sofa.collider!.height / 2,
    });
    expect(path.length).toBeGreaterThan(0);
    expect(path.every((point) => studioWorldCanOccupy(DEFAULT_STUDIO_WORLD_MANIFEST, point))).toBe(true);
  });

  it("routes across rooms through configured openings", () => {
    const start = DEFAULT_STUDIO_WORLD_MANIFEST.spawns.find((spawn) => spawn.id === "main")!.point;
    const writers = DEFAULT_STUDIO_WORLD_MANIFEST.rooms.find((room) => room.id === "writers")!;
    const path = findStudioWorldPath(DEFAULT_STUDIO_WORLD_MANIFEST, start, {
      x: writers.x + writers.width / 2,
      y: writers.y + writers.height * 0.7,
    });
    expect(path.length).toBeGreaterThan(0);
    expect(path.every((point) => studioWorldCanOccupy(DEFAULT_STUDIO_WORLD_MANIFEST, point))).toBe(true);
  });
});

describe("Virtual Studio world loader", () => {
  it("loads a valid Tiled manifest and falls back safely on malformed data", async () => {
    const valid: StudioTiledMapLike = {
      width: 425,
      height: 399,
      tilewidth: 2,
      tileheight: 2,
      layers: [],
    };
    const loaded = await loadStudioVirtualSpaceWorldManifest(
      "/virtual-world.json",
      async () => ({ ok: true, json: async () => valid }),
    );
    expect(loaded.width).toBe(850);
    expect(loaded.height).toBe(798);

    const fallback = await loadStudioVirtualSpaceWorldManifest(
      "/broken-world.json",
      async () => ({ ok: true, json: async () => ({ nope: true }) }),
    );
    expect(fallback).toBe(DEFAULT_STUDIO_WORLD_MANIFEST);
  });
});
