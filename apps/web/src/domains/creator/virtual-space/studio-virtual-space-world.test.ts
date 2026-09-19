import { describe, expect, it } from "vitest";

import {
  DEFAULT_STUDIO_WORLD_MANIFEST,
  studioWorldInteractions,
  studioWorldRoomAt,
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
});

describe("Virtual Studio Tiled adapter", () => {
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
              y: 250,
              properties: [
                property("skinKey", "dark"),
                property("roomId", "meeting-room"),
                property("behavior", "patrol"),
                property("speed", 64),
                property("patrol", "230,250;300,250;300,280"),
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
      patrol: [{ x: 230, y: 250 }, { x: 300, y: 250 }, { x: 300, y: 280 }],
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
