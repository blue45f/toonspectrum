import { describe, expect, it } from "vitest";

import { StudioVirtualSpaceEngineBridge } from "./studio-virtual-space-engine-bridge";
import {
  STUDIO_VIRTUAL_SPACE_NEARBY_NPC_LIMIT,
  STUDIO_VIRTUAL_SPACE_NEARBY_NPC_RADIUS,
  StudioStuckDetector,
  studioNearbyNpcCandidates,
  studioNearbyNpcIdsKey,
} from "./studio-virtual-space-engine-events";
import {
  DEFAULT_STUDIO_MOTION_CONFIG,
  stepStudioVirtualSpaceMotion,
} from "./studio-virtual-space-motion";
import {
  DEFAULT_STUDIO_WORLD_MANIFEST,
  studioWorldInteractions,
  validateStudioWorldManifest,
} from "./studio-virtual-space-world-manifest";
import {
  findStudioWorldPath,
  studioWorldCanOccupy,
} from "./studio-virtual-space-world-pathfinding";
import { loadStudioVirtualSpaceWorldManifest } from "./studio-virtual-space-world-loader";
import {
  studioWorldManifestFromTiled,
  type StudioTiledMapLike,
} from "./studio-virtual-space-tiled-adapter";

describe("Virtual Studio game-engine foundation", () => {
  it("keeps the default world manifest structurally valid", () => {
    expect(validateStudioWorldManifest(DEFAULT_STUDIO_WORLD_MANIFEST)).toEqual([]);
    expect(DEFAULT_STUDIO_WORLD_MANIFEST.rooms.length).toBeGreaterThanOrEqual(7);
    expect(DEFAULT_STUDIO_WORLD_MANIFEST.props.some((prop) => prop.kind === "interactive")).toBe(true);
    expect(DEFAULT_STUDIO_WORLD_MANIFEST.colliders.length).toBeGreaterThan(0);
  });

  it("converts Tiled object layers without changing the runtime contract", () => {
    const tiled: StudioTiledMapLike = {
      width: 40,
      height: 30,
      tilewidth: 32,
      tileheight: 32,
      layers: [
        {
          type: "objectgroup",
          name: "rooms",
          objects: [{
            id: 1,
            name: "drawing",
            x: 100,
            y: 120,
            width: 300,
            height: 220,
            properties: [
              { name: "roomId", value: "drawing" },
              { name: "labelKo", value: "드로잉 스튜디오" },
              { name: "labelEn", value: "Drawing Studio" },
            ],
          }],
        },
        {
          type: "objectgroup",
          name: "colliders",
          objects: [{ id: 2, name: "desk", x: 140, y: 220, width: 100, height: 40 }],
        },
        {
          type: "objectgroup",
          name: "props",
          objects: [{
            id: 3,
            name: "tablet",
            x: 180,
            y: 210,
            width: 48,
            height: 32,
            properties: [
              { name: "kind", value: "interactive" },
              { name: "action", value: "canvas" },
              { name: "assetKey", value: "drawing-tablet" },
            ],
          }],
        },
        {
          type: "objectgroup",
          name: "spawns",
          objects: [{ id: 4, name: "main", x: 200, y: 300 }],
        },
      ],
    };
    const manifest = studioWorldManifestFromTiled(tiled, DEFAULT_STUDIO_WORLD_MANIFEST);
    expect(manifest.width).toBe(1280);
    expect(manifest.height).toBe(960);
    expect(manifest.rooms[0]?.id).toBe("drawing");
    expect(manifest.colliders[0]).toMatchObject({ x: 140, y: 220, width: 100, height: 40 });
    expect(manifest.props[0]).toMatchObject({ id: "tablet", kind: "interactive", assetKey: "drawing-tablet", action: "canvas" });
    expect(manifest.spawns[0]?.point).toEqual({ x: 200, y: 300 });
  });

  it("accelerates and decelerates instead of snapping velocity", () => {
    let state = { velocity: { x: 0, y: 0 } };
    state = stepStudioVirtualSpaceMotion(state, { x: 1, y: 0 }, 1 / 60);
    expect(state.velocity.x).toBeGreaterThan(0);
    expect(state.velocity.x).toBeLessThan(DEFAULT_STUDIO_MOTION_CONFIG.maxSpeed);

    for (let index = 0; index < 60; index += 1) {
      state = stepStudioVirtualSpaceMotion(state, { x: 1, y: 0 }, 1 / 60);
    }
    expect(state.velocity.x).toBeCloseTo(DEFAULT_STUDIO_MOTION_CONFIG.maxSpeed, 4);

    const moving = state.velocity.x;
    state = stepStudioVirtualSpaceMotion(state, { x: 0, y: 0 }, 1 / 60);
    expect(state.velocity.x).toBeGreaterThan(0);
    expect(state.velocity.x).toBeLessThan(moving);
  });

  it("normalizes diagonal engine input to the configured max speed", () => {
    let state = { velocity: { x: 0, y: 0 } };
    for (let index = 0; index < 120; index += 1) {
      state = stepStudioVirtualSpaceMotion(state, { x: 1, y: 1 }, 1 / 60);
    }
    expect(Math.hypot(state.velocity.x, state.velocity.y)).toBeCloseTo(
      DEFAULT_STUDIO_MOTION_CONFIG.maxSpeed,
      3,
    );
  });

  it("uses an imperative bridge for joystick, path and follow requests", () => {
    const bridge = new StudioVirtualSpaceEngineBridge();
    bridge.setJoystick({ x: 0.4, y: -0.8 });
    expect(bridge.getJoystick()).toEqual({ x: 0.4, y: -0.8 });

    bridge.requestMove({ x: 100, y: 200 });
    expect(bridge.consumeMoveTarget()).toEqual({ x: 100, y: 200 });
    expect(bridge.consumeMoveTarget()).toBeNull();

    bridge.setFollowingPeer("peer-a");
    expect(bridge.getFollowingPeer()).toBe("peer-a");
    bridge.clearMovement();
    expect(bridge.getFollowingPeer()).toBeNull();
    expect(bridge.getJoystick()).toEqual({ x: 0, y: 0 });
  });
});
  it("requestEmote는 같은 id도 다시 소비된다", () => {
    const bridge = new StudioVirtualSpaceEngineBridge();
    expect(bridge.consumeEmote()).toBeNull();
    bridge.requestEmote("wave");
    expect(bridge.consumeEmote()).toBe("wave");
    expect(bridge.consumeEmote()).toBeNull();
    bridge.requestEmote("wave");
    expect(bridge.consumeEmote()).toBe("wave");
    expect(bridge.getEmoteSequence()).toBe(2);
    bridge.requestEmote("dance");
    bridge.requestEmote("party");
    expect(bridge.consumeEmote()).toBe("party");
    // 카탈로그 밖 값은 런타임에서도 무시한다.
    bridge.requestEmote("cheer" as never);
    expect(bridge.consumeEmote()).toBeNull();
  });

  it("requestTeleport는 비유한 좌표를 무시하고 clearMovement가 지운다", () => {
    const bridge = new StudioVirtualSpaceEngineBridge();
    bridge.requestTeleport({ x: Number.NaN, y: 10 });
    bridge.requestTeleport({ x: 10, y: Number.POSITIVE_INFINITY });
    expect(bridge.consumeTeleport()).toBeNull();
    bridge.requestMove({ x: 5, y: 5 });
    bridge.requestTeleport({ x: 1200, y: 640 });
    expect(bridge.consumeMoveTarget()).toBeNull();
    expect(bridge.consumeTeleport()).toEqual({ x: 1200, y: 640 });
    expect(bridge.consumeTeleport()).toBeNull();
    bridge.requestTeleport({ x: 300, y: 200 });
    bridge.clearMovement();
    expect(bridge.consumeTeleport()).toBeNull();
  });

  it("setLocatePoint는 유한한 지점만 보관하고 null로 지운다", () => {
    const bridge = new StudioVirtualSpaceEngineBridge();
    expect(bridge.getLocatePoint()).toBeNull();
    bridge.setLocatePoint({ x: 132, y: 790 });
    expect(bridge.getLocatePoint()).toEqual({ x: 132, y: 790 });
    bridge.setLocatePoint({ x: Number.NaN, y: 10 });
    expect(bridge.getLocatePoint()).toBeNull();
    bridge.setLocatePoint({ x: 480, y: 604 });
    bridge.clearMovement();
    // 이동 취소가 진행 중인 안내까지 지우지는 않는다(참가자 locate와 같은 계약).
    expect(bridge.getLocatePoint()).toEqual({ x: 480, y: 604 });
    bridge.setLocatePoint(null);
    expect(bridge.getLocatePoint()).toBeNull();
  });

  it("focusWorld는 등록된 핸들러만 호출한다", () => {
    const bridge = new StudioVirtualSpaceEngineBridge();
    expect(() => bridge.focusWorld()).not.toThrow();
    let calls = 0;
    const handler = () => { calls += 1; };
    bridge.setFocusHandler(handler);
    bridge.focusWorld();
    expect(calls).toBe(1);
    bridge.setFocusHandler(null);
    bridge.focusWorld();
    expect(calls).toBe(1);
  });

  it("preserves the v3 production-campus aspect ratio", () => {
    expect(
      DEFAULT_STUDIO_WORLD_MANIFEST.width / DEFAULT_STUDIO_WORLD_MANIFEST.height,
    ).toBeCloseTo(4 / 3, 6);
  });

  it("keeps every default production interaction reachable", () => {
    const spawn = DEFAULT_STUDIO_WORLD_MANIFEST.spawns.find((candidate) => candidate.id === "main")
      ?? DEFAULT_STUDIO_WORLD_MANIFEST.spawns[0]!;
    for (const interaction of studioWorldInteractions(DEFAULT_STUDIO_WORLD_MANIFEST)) {
      const path = findStudioWorldPath(
        DEFAULT_STUDIO_WORLD_MANIFEST,
        spawn.point,
        interaction.point,
      );
      expect(path.length, interaction.id).toBeGreaterThan(0);
      expect(
        path.every((point) => studioWorldCanOccupy(DEFAULT_STUDIO_WORLD_MANIFEST, point)),
        interaction.id,
      ).toBe(true);
    }
  });

  it("converts new rooms, portals and NPCs from Tiled data", () => {
    const tiled: StudioTiledMapLike = {
      width: 100,
      height: 80,
      tilewidth: 10,
      tileheight: 10,
      layers: [
        {
          type: "objectgroup",
          name: "rooms",
          objects: [{
            id: 1,
            name: "sound-booth",
            x: 100,
            y: 100,
            width: 240,
            height: 180,
            properties: [
              { name: "roomId", value: "sound-booth" },
              { name: "labelKo", value: "사운드 부스" },
              { name: "labelEn", value: "Sound Booth" },
              { name: "action", value: "live" },
            ],
          }],
        },
        {
          type: "objectgroup",
          name: "portals",
          objects: [{
            id: 2,
            name: "booth-exit",
            x: 220,
            y: 270,
            properties: [
              { name: "radius", value: 40 },
              { name: "targetRoomId", value: "sound-booth" },
              { name: "targetX", value: 180 },
              { name: "targetY", value: 220 },
            ],
          }],
        },
        {
          type: "objectgroup",
          name: "npcs",
          objects: [{
            id: 3,
            name: "assistant-npc",
            x: 180,
            y: 210,
            properties: [
              { name: "skinKey", value: "npc-editor" },
              { name: "roomId", value: "sound-booth" },
              { name: "behavior", value: "patrol" },
              { name: "patrol", value: "180,210;260,210;260,240" },
            ],
          }],
        },
      ],
    };
    const manifest = studioWorldManifestFromTiled(tiled, DEFAULT_STUDIO_WORLD_MANIFEST);
    expect(manifest.rooms[0]).toMatchObject({
      id: "sound-booth",
      labelEn: "Sound Booth",
      action: "live",
    });
    expect(manifest.portals[0]).toMatchObject({
      id: "booth-exit",
      targetRoomId: "sound-booth",
      targetPoint: { x: 180, y: 220 },
    });
    expect(manifest.npcs[0]).toMatchObject({
      id: "assistant-npc",
      skinKey: "npc-editor",
      behavior: "patrol",
    });
    expect(manifest.npcs[0]?.patrol).toHaveLength(3);
  });

  it("loads a valid Tiled world and falls back when the file is unavailable", async () => {
    const tiled: StudioTiledMapLike = {
      width: 640,
      height: 480,
      tilewidth: 2,
      tileheight: 2,
    };
    const loaded = await loadStudioVirtualSpaceWorldManifest(
      "/world.json",
      async () => ({
        ok: true,
        json: async () => tiled,
      }),
    );
    expect(loaded.width).toBe(1280);
    expect(loaded.height).toBe(960);

    const fallback = await loadStudioVirtualSpaceWorldManifest(
      "/missing.json",
      async () => ({
        ok: false,
        json: async () => ({}),
      }),
    );
    expect(fallback).toBe(DEFAULT_STUDIO_WORLD_MANIFEST);
  });

describe("Virtual Studio engine events", () => {
  it("방향 입력을 1.5초 유지해도 4px 미만이면 끼임, 다시 움직이면 풀린다", () => {
    const detector = new StudioStuckDetector();
    const point = { x: 100, y: 100 };
    expect(detector.sample({ time: 0, directional: true, point })).toBe(false);
    expect(detector.sample({ time: 1_400, directional: true, point: { x: 102, y: 100 } })).toBe(false);
    expect(detector.value).toBe(false);
    expect(detector.sample({ time: 1_500, directional: true, point: { x: 103, y: 100 } })).toBe(true);
    expect(detector.value).toBe(true);
    // 입력을 떼도 끼임 표시는 유지되고, 몸이 4px 이상 움직이면 풀린다.
    expect(detector.sample({ time: 1_600, directional: false, point: { x: 103, y: 100 } })).toBe(false);
    expect(detector.sample({ time: 1_700, directional: true, point: { x: 108, y: 100 } })).toBe(true);
    expect(detector.value).toBe(false);
    // 계속 잘 움직이면 다시 끼임으로 보지 않는다.
    for (let step = 1; step <= 20; step += 1) detector.sample({ time: 1_700 + step * 100, directional: true, point: { x: 108 + step * 5, y: 100 } });
    expect(detector.value).toBe(false);
  });

  it("점유 불가 위치 보정은 즉시 끼임으로 알리고 끼임 해제·순간이동 뒤 초기화한다", () => {
    const detector = new StudioStuckDetector();
    expect(detector.markCorrected({ x: 10, y: 10 })).toBe(true);
    expect(detector.markCorrected({ x: 10, y: 10 })).toBe(false);
    expect(detector.value).toBe(true);
    expect(detector.reset()).toBe(true);
    expect(detector.value).toBe(false);
    expect(detector.reset()).toBe(false);
  });

  it("근처 NPC는 180px 안에서 가까운 순으로 최대 3명이고, id 집합이 같으면 같은 키다", () => {
    const origin = { x: 0, y: 0 };
    const views = [
      { id: "far", point: { x: STUDIO_VIRTUAL_SPACE_NEARBY_NPC_RADIUS + 1, y: 0 } },
      { id: "d", point: { x: 150, y: 0 } },
      { id: "a", point: { x: 20, y: 0 } },
      { id: "c", point: { x: 0, y: 90 } },
      { id: "b", point: { x: 40, y: 30 } },
    ];
    const nearby = studioNearbyNpcCandidates(views, origin);
    expect(nearby.map((item) => item.view.id)).toEqual(["a", "b", "c"]);
    expect(nearby).toHaveLength(STUDIO_VIRTUAL_SPACE_NEARBY_NPC_LIMIT);
    expect(nearby[1]?.distance).toBe(50);
    expect(studioNearbyNpcIdsKey([{ id: "b" }, { id: "a" }])).toBe(studioNearbyNpcIdsKey([{ id: "a" }, { id: "b" }]));
    expect(studioNearbyNpcIdsKey([])).toBe("");
  });
});
