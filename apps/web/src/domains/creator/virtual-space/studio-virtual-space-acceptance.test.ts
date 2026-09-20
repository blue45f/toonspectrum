import { describe, expect, it } from "vitest";

import { studioWorldManifestFromTiled, type StudioTiledMapLike } from "./studio-virtual-space-tiled-adapter";
import { DEFAULT_STUDIO_WORLD_MANIFEST, validateStudioWorldManifest, studioWorldPortals, studioWorldPresenceState } from "./studio-virtual-space-world-manifest";

import {
  StudioWorldPortalTracker,
  studioWorldArrivalInput,
  studioWorldHasModalBlocker,
  studioWorldInputBlocked,
} from "./studio-virtual-space-runtime-policy";
import { stepStudioVirtualSpaceMotion } from "./studio-virtual-space-motion";
import { StudioVirtualSpaceEngineBridge } from "./studio-virtual-space-engine-bridge";
import { findStudioWorldPath } from "./studio-virtual-space-world-pathfinding";
import { studioVirtualSpaceState } from "./studio-virtual-space-model";
import { StudioVirtualSpacePresenceController } from "./studio-virtual-space-presence";
import { studioCharacterSkinForAvatarIndex } from "./studio-virtual-space-character-skins";
import { loadStudioVirtualSpaceWorldManifest } from "./studio-virtual-space-world-loader";

const map = (layers: StudioTiledMapLike["layers"]): StudioTiledMapLike => ({
  width: 850, height: 798, tilewidth: 1, tileheight: 1, layers,
});

describe("Virtual Studio world replacement acceptance", () => {
  it("removes content from explicitly emptied layers instead of resurrecting the default world", () => {
    const next = studioWorldManifestFromTiled(map([
      { type: "objectgroup", name: "props", objects: [] },
      { type: "objectgroup", name: "colliders", objects: [] },
      { type: "objectgroup", name: "interactions", objects: [] },
    ]), DEFAULT_STUDIO_WORLD_MANIFEST);
    expect(next.props).toEqual([]);
    expect(next.colliders).toEqual([]);
    expect(next.interactions).toEqual([]);
    expect(next.rooms).toEqual(DEFAULT_STUDIO_WORLD_MANIFEST.rooms);
  });

  it("rejects non-finite world geometry", () => {
    const next = { ...DEFAULT_STUDIO_WORLD_MANIFEST,
      colliders: [{ x: Number.NaN, y: 40, width: 20, height: 20 }],
      props: [],
    };
    expect(validateStudioWorldManifest(next).length).toBeGreaterThan(0);
  });

  it("rejects unsafe portal URLs and duplicate object ids", () => {
    const next = { ...DEFAULT_STUDIO_WORLD_MANIFEST,
      portals: [{ id: "bad-link", point: { x: 300, y: 300 }, radius: 20, href: "javascript:alert(1)" }],
      props: [
        { id: "chair", kind: "decor" as const, x: 40, y: 50 },
        { id: "chair", kind: "decor" as const, x: 80, y: 50 },
      ],
    };
    expect(validateStudioWorldManifest(next).length).toBeGreaterThanOrEqual(2);
  });

  it("keeps explicitly hidden collision layers authoritative", () => {
    const next = studioWorldManifestFromTiled(map([
      { type: "objectgroup", name: "colliders", visible: false,
        objects: [{ id: 1, name: "wall", x: 40, y: 40, width: 25, height: 150 }] },
    ]), DEFAULT_STUDIO_WORLD_MANIFEST);
    expect(next.colliders).toEqual([{ x: 40, y: 40, width: 25, height: 150 }]);
  });
});


describe("Virtual Studio editable world boundaries", () => {
  it("composes nested group offsets without reviving removed props", () => {
    const next = studioWorldManifestFromTiled(map([
      { type: "group", name: "floor-one", offsetx: 20, offsety: 30, layers: [
        { type: "objectgroup", name: "props", offsetx: 4, objects: [
          { name: "plant", type: "", x: 10, y: 20, width: 30, height: 40 },
        ] },
        { type: "objectgroup", name: "colliders", visible: false, objects: [
          { name: "wall", x: 100, y: 150, width: 10, height: 60 },
        ] },
      ] },
    ]), DEFAULT_STUDIO_WORLD_MANIFEST);
    expect(next.props[0]).toMatchObject({ x: 34, y: 50, originX: 0, originY: 0, collider: undefined });
    expect(next.colliders[0]).toEqual({ x: 120, y: 180, width: 10, height: 60 });
  });

  it("distinguishes editor-hidden collision from explicitly disabled gameplay", () => {
    const next = studioWorldManifestFromTiled(map([
      { type: "objectgroup", name: "colliders", properties: [{ name: "enabled", value: false }],
        objects: [{ name: "wall", x: 40, y: 40, width: 30, height: 150 }] },
    ]), DEFAULT_STUDIO_WORLD_MANIFEST);
    expect(next.colliders).toEqual([]);
  });

  it("supports portal props and independent collider footprints", () => {
    const next = studioWorldManifestFromTiled(map([
      { type: "objectgroup", name: "props", objects: [
        { name: "gate", x: 100, y: 100, width: 100, height: 150, properties: [
          { name: "kind", value: "portal" }, { name: "collider", value: false },
          { name: "targetX", value: 425 }, { name: "targetY", value: 700 },
        ] },
        { name: "desk", x: 400, y: 500, width: 100, height: 120, properties: [
          { name: "kind", value: "solid" }, { name: "colliderX", value: 10 }, { name: "colliderY", value: 90 },
          { name: "colliderWidth", value: 80 }, { name: "colliderHeight", value: 20 },
        ] },
      ] },
    ]), DEFAULT_STUDIO_WORLD_MANIFEST);
    expect(studioWorldPortals(next)[0]).toMatchObject({ id: "gate", targetPoint: { x: 425, y: 700 } });
    expect(next.props[1]?.collider).toEqual({ x: 410, y: 590, width: 80, height: 20 });
  });

  it("rejects unsupported polygon physics instead of pretending an AABB matches the art", () => {
    expect(() => studioWorldManifestFromTiled(map([
      { type: "objectgroup", name: "colliders", objects: [
        { name: "slope", x: 40, y: 40, width: 30, height: 150, polygon: [{ x: 0, y: 0 }, { x: 20, y: 60 }] },
      ] },
    ]), DEFAULT_STUDIO_WORLD_MANIFEST)).toThrow(/rectangle/u);
  });

  it("rejects invalid scale data, conflicting textures, and oversized worlds", () => {
    const bad = studioWorldManifestFromTiled(map([
      { type: "objectgroup", name: "props", objects: [
        { name: "chair", x: 100, y: 100, properties: [{ name: "scale", value: "not-a-number" }] },
      ] },
    ]), DEFAULT_STUDIO_WORLD_MANIFEST);
    expect(validateStudioWorldManifest(bad).length).toBeGreaterThan(0);
    expect(validateStudioWorldManifest({ ...DEFAULT_STUDIO_WORLD_MANIFEST, width: 20000 }).length).toBeGreaterThan(0);
    expect(validateStudioWorldManifest({ ...DEFAULT_STUDIO_WORLD_MANIFEST, props: [
      { id: "one", kind: "decor", x: 40, y: 40, assetKey: "same", assetUrl: "/one.png" },
      { id: "two", kind: "decor", x: 50, y: 40, assetKey: "same", assetUrl: "/two.png" },
    ] }).some((error) => error.includes("conflicting"))).toBe(true);
  });

  it("loads a valid custom world with intentionally empty gameplay layers", async () => {
    const next = await loadStudioVirtualSpaceWorldManifest("/world.json", async () => ({
      ok: true, json: async () => map([
        { type: "objectgroup", name: "colliders", objects: [] },
        { type: "objectgroup", name: "props", objects: [] },
        { type: "objectgroup", name: "interactions", objects: [] },
      ]),
    }));
    expect(next.colliders).toEqual([]);
    expect(next.props).toEqual([]);
    expect(next.npcActivityAnchors).toEqual([]);
    expect(next.npcs.every((npc) => npc.activityAnchorIds === undefined)).toBe(true);
  });
});

describe("Virtual Studio motion and lifecycle policies", () => {
  it("uses the same acceleration magnitude for cardinal and diagonal input", () => {
    const initial = { velocity: { x: 0, y: 0 } };
    const straight = stepStudioVirtualSpaceMotion(initial, { x: 1, y: 0 }, 1 / 60);
    const diagonal = stepStudioVirtualSpaceMotion(initial, { x: 1, y: 1 }, 1 / 60);
    expect(Math.hypot(diagonal.velocity.x, diagonal.velocity.y)).toBeCloseTo(straight.velocity.x, 8);
  });

  it.each([30, 60, 120])("settles click-to-move at %i fps without oscillating", (fps) => {
    let point = { x: 0, y: 0 };
    let motion = { velocity: { x: 0, y: 0 } };
    for (let frame = 0; frame < fps * 4; frame++) {
      const input = studioWorldArrivalInput(point, { x: 180, y: 0 }, 205, 980);
      motion = stepStudioVirtualSpaceMotion(motion, input, 1 / fps);
      point = { x: point.x + motion.velocity.x / fps, y: 0 };
    }
    expect(Math.abs(point.x - 180)).toBeLessThan(3);
    expect(Math.abs(motion.velocity.x)).toBeLessThan(1);
  });

  it("triggers a portal once on entry and suppresses the arrival portal", () => {
    const portals = [
      { id: "a", point: { x: 10, y: 10 }, radius: 5, targetPoint: { x: 90, y: 90 } },
      { id: "b", point: { x: 90, y: 90 }, radius: 5, targetPoint: { x: 10, y: 10 } },
    ];
    const tracker = new StudioWorldPortalTracker();
    tracker.seed(portals, { x: 50, y: 50 });
    expect(tracker.enter(portals, { x: 10, y: 10 })?.id).toBe("a");
    expect(tracker.enter(portals, { x: 10, y: 10 })).toBeNull();
    tracker.seed(portals, { x: 90, y: 90 });
    expect(tracker.enter(portals, { x: 90, y: 90 })).toBeNull();
    tracker.enter(portals, { x: 50, y: 50 });
    expect(tracker.enter(portals, { x: 90, y: 90 })?.id).toBe("b");
  });

  it("sanitizes joystick/path inputs and communicates an explicit stop", () => {
    const bridge = new StudioVirtualSpaceEngineBridge();
    bridge.setJoystick({ x: Infinity, y: Number.NaN });
    expect(bridge.getJoystick()).toEqual({ x: 0, y: 0 });
    bridge.requestMove({ x: Number.NaN, y: 20 });
    expect(bridge.consumeMoveTarget()).toBeNull();
    const revision = bridge.getStopRevision();
    bridge.clearMovement();
    expect(bridge.getStopRevision()).toBe(revision + 1);
  });

  it("stops background or text-editing input", () => {
    const state = { hidden: false, hasFocus: () => true, activeElement: null };
    expect(studioWorldInputBlocked(state)).toBe(false);
    expect(studioWorldInputBlocked({ ...state, hidden: true })).toBe(true);
    expect(studioWorldInputBlocked({ ...state, hasFocus: () => false })).toBe(true);
    expect(studioWorldInputBlocked(state, true)).toBe(true);
    expect(studioWorldHasModalBlocker({
      querySelectorAll: () => [{ closest: () => null }] as unknown as NodeListOf<Element>,
    })).toBe(true);
  });

  it("does not invent a path across a sealed wall", () => {
    const world = { ...DEFAULT_STUDIO_WORLD_MANIFEST, width: 400, height: 400, props: [],
      colliders: [{ x: 199, y: 0, width: 10, height: 400 }],
    };
    expect(findStudioWorldPath(world, { x: 80, y: 200 }, { x: 320, y: 200 })).toEqual([]);
    expect(findStudioWorldPath(world, { x: Number.NaN, y: 10 }, { x: 50, y: 50 })).toEqual([]);
  });

  it("preserves a larger world's position during activity/skin changes and reconnect", () => {
    const world = { ...DEFAULT_STUDIO_WORLD_MANIFEST, width: 1600, height: 1200,
      rooms: [{ id: "meeting-room", x: 0, y: 0, width: 1600, height: 1200, labelKo: "회의실", labelEn: "Meeting" }],
    };
    const self = studioWorldPresenceState(world, {
      ...studioVirtualSpaceState({ x: 50, y: 50 }),
      x: 1240, y: 950, zoneId: "meeting-room", facing: "left", activity: "reviewing", avatarIndex: 2,
    });
    const controller = new StudioVirtualSpacePresenceController(
      { sessionId: "qa", displayName: "QA", role: "editor" },
      { getPeers: () => [], send: () => false, subscribe: () => () => undefined }, self,
    );
    expect(controller.snapshot().self).toEqual(self);
    controller.close();
  });

  it("keeps automatic skin choice deterministic without recoloring the art", () => {
    expect(studioCharacterSkinForAvatarIndex(-1, "creator-one").key).toBe(studioCharacterSkinForAvatarIndex(-1, "creator-one").key);
    expect(studioCharacterSkinForAvatarIndex(1, "creator-one").key).toBe("silver");
  });
});
