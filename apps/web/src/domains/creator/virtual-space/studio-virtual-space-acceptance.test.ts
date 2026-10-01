import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import { studioWorldManifestFromTiled, type StudioTiledMapLike } from "./studio-virtual-space-tiled-adapter";
import { DEFAULT_STUDIO_WORLD_MANIFEST, validateStudioWorldManifest, studioWorldPortals, studioWorldPresenceState } from "./studio-virtual-space-world-manifest";

import {
  StudioWorldPortalTracker,
  StudioWorldZoneTracker,
  resolveStudioWorldPortalArrival,
  resolveStudioWorldUnstuck,
  resolveStudioWorldZonePresence,
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
  width: 1280, height: 960, tilewidth: 1, tileheight: 1, layers,
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
    expect(studioWorldPortals(next).find((portal) => portal.id === "gate")).toMatchObject({ id: "gate", targetPoint: { x: 425, y: 700 } });
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

  it("co-arrives the body and camera once, then ignores a second sample inside", () => {
    const world = { ...DEFAULT_STUDIO_WORLD_MANIFEST, width: 600, height: 400, props: [], colliders: [] };
    const portals = [
      { id: "door", point: { x: 80, y: 100 }, radius: 18, targetPoint: { x: 420, y: 100 } },
      { id: "return", point: { x: 420, y: 100 }, radius: 18, targetPoint: { x: 80, y: 100 } },
    ];
    const tracker = new StudioWorldPortalTracker();
    tracker.seed(portals, { x: 250, y: 100 });
    const departure = { x: 80, y: 100 };
    const first = resolveStudioWorldPortalArrival(tracker, world, portals, departure, { x: 40, y: 12 }, false);
    expect(first.portal?.id).toBe("door");
    expect(first.body).toEqual({ x: 420, y: 100 });
    expect(first.cameraAnchor).toEqual(first.body);
    expect(first.cameraAnchor).not.toEqual(departure);
    expect(first.velocity).toEqual({ x: 0, y: 0 });

    const stillInside = resolveStudioWorldPortalArrival(tracker, world, portals, first.body, first.velocity, false);
    expect(stillInside.portal).toBeNull();
    expect(stillInside.body).toEqual(first.body);
    expect(stillInside.cameraAnchor).toEqual(first.body);
    expect(stillInside.velocity).toEqual({ x: 0, y: 0 });

    const left = resolveStudioWorldPortalArrival(tracker, world, portals, { x: 250, y: 100 }, { x: 0, y: 0 }, true);
    expect(left.portal).toBeNull();
    expect(left.body).toEqual({ x: 250, y: 100 });

    const reentry = resolveStudioWorldPortalArrival(tracker, world, portals, first.body, { x: 30, y: 0 }, true);
    expect(reentry.portal?.id).toBe("return");
    expect(reentry.body).toEqual({ x: 80, y: 100 });
    expect(reentry.cameraAnchor).toEqual(reentry.body);
    expect(reentry.velocity).toEqual({ x: 0, y: 0 });
  });

  it("구역 진입은 한 번만 알리고, veil(separated)은 프라이빗 구역 안에서만 켠다", () => {
    const world = {
      ...DEFAULT_STUDIO_WORLD_MANIFEST,
      width: 640,
      height: 320,
      props: [],
      colliders: [{ x: 180, y: 40, width: 80, height: 80 }],
      rooms: [
        { id: "lounge", labelKo: "라운지", labelEn: "Lounge", x: 0, y: 0, width: 160, height: 160 },
        { id: "drawing", labelKo: "작업실", labelEn: "Studio", x: 400, y: 0, width: 160, height: 160 },
      ],
      acousticZones: [{ id: "drawing-audio", roomId: "drawing", x: 400, y: 0, width: 160, height: 160, policy: "private" as const, doorId: "drawing-door" }],
      spawns: [
        { id: "west", point: { x: 48, y: 48 } },
        { id: "east", point: { x: 520, y: 80 } },
      ],
    };
    const tracker = new StudioWorldZoneTracker();
    tracker.seed(null);
    const outside = { x: 280, y: 240 };
    const entered = resolveStudioWorldZonePresence(tracker, world, { x: 40, y: 40 }, false);
    expect(entered.zoneId).toBe("lounge");
    expect(entered.announce).toBe(true);
    // 공개 방에서는 바깥을 가리지 않는다.
    expect(entered.separated).toBe(false);
    const still = resolveStudioWorldZonePresence(tracker, world, { x: 60, y: 50 }, false);
    expect(still.announce).toBe(false);
    expect(still.separated).toBe(false);
    expect(still.zoneId).toBe("lounge");
    const left = resolveStudioWorldZonePresence(tracker, world, outside, true);
    expect(left.announce).toBe(false);
    expect(left.separated).toBe(false);
    expect(left.zoneId).toBeNull();
    const again = resolveStudioWorldZonePresence(tracker, world, { x: 440, y: 40 }, true);
    expect(again.announce).toBe(true);
    expect(again.zoneId).toBe("drawing-audio");
    // 프라이빗 구역 안에서만 veil이 켜진다.
    expect(again.separated).toBe(true);
    expect(again.rect).toEqual(world.acousticZones[0]);

    const stuck = { x: 500, y: 90 };
    const rescue = resolveStudioWorldUnstuck(world, stuck);
    expect(rescue.spawn).toEqual({ x: 520, y: 80 });
    expect(rescue.velocity).toEqual({ x: 0, y: 0 });
    expect(rescue.route).toEqual([]);
    expect(rescue.cameraAnchor).toEqual(rescue.spawn);
    expect(rescue.cameraAnchor).not.toEqual(stuck);
    expect(rescue.portal).toBeNull();
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

  it("aria-modal=false·data-presentation=nonmodal인 열린 dialog는 월드 입력을 막지 않는다", () => {
    const { document } = new JSDOM(`<!doctype html><body>
      <dialog open aria-modal="false"><p>참가자</p></dialog>
      <dialog open data-presentation="nonmodal"><p>장소</p></dialog>
      <section role="dialog" aria-modal="false"><p>작업 패널</p></section>
      <dialog><p>닫힌 모달</p></dialog>
    </body>`).window;
    expect(studioWorldHasModalBlocker(document)).toBe(false);
  });

  it("aria-modal=true·일반 열린 dialog와 data-studio-input-blocker는 막는다", () => {
    const html = (body: string) => new JSDOM(`<!doctype html><body>${body}</body>`).window.document;
    expect(studioWorldHasModalBlocker(html('<div role="dialog" aria-modal="true">설정</div>'))).toBe(true);
    expect(studioWorldHasModalBlocker(html("<dialog open>확인</dialog>"))).toBe(true);
    expect(studioWorldHasModalBlocker(html('<div data-studio-input-blocker="true">편집</div>'))).toBe(true);
    // 숨겨진 조상 아래의 모달은 입력을 막지 않는다.
    expect(studioWorldHasModalBlocker(html('<div hidden><dialog open>숨김</dialog></div>'))).toBe(false);
    expect(studioWorldHasModalBlocker(html('<div data-state="closed"><div role="dialog" aria-modal="true">닫힘</div></div>'))).toBe(false);
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

describe("Virtual Studio modal input blocker edge cases", () => {
  const blocked = (markup: string) => studioWorldHasModalBlocker(new JSDOM(`<!doctype html><body>${markup}</body>`).window.document);

  it("모달 속성이 없는 role=dialog·aria-hidden 조상 안 모달은 막지 않고, 비모달 옆에 모달이 하나라도 있으면 막는다", () => {
    expect(blocked('<section role="dialog"></section>')).toBe(false);
    expect(blocked('<div aria-hidden="true"><div role="dialog" aria-modal="true"></div></div>')).toBe(false);
    expect(blocked('<div data-state="closed"><div data-studio-input-blocker="true"></div></div>')).toBe(false);
    expect(blocked('<dialog open aria-modal="true"></dialog>')).toBe(true);
    expect(blocked('<dialog open aria-modal="false"></dialog><div role="dialog" aria-modal="true"></div>')).toBe(true);
  });
});
