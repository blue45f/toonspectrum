import { describe, expect, it } from "vitest";

import { StudioVirtualSpaceEngineBridge } from "./studio-virtual-space-engine-bridge";
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
  it("preserves the approved master-art aspect ratio", () => {
    expect(
      DEFAULT_STUDIO_WORLD_MANIFEST.width / DEFAULT_STUDIO_WORLD_MANIFEST.height,
    ).toBeCloseTo(700 / 656, 2);
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
              { name: "skinKey", value: "silver" },
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
      skinKey: "silver",
      behavior: "patrol",
    });
    expect(manifest.npcs[0]?.patrol).toHaveLength(3);
  });

  it("loads a valid Tiled world and falls back when the file is unavailable", async () => {
    const tiled: StudioTiledMapLike = {
      width: 425,
      height: 399,
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
    expect(loaded.width).toBe(850);
    expect(loaded.height).toBe(798);

    const fallback = await loadStudioVirtualSpaceWorldManifest(
      "/missing.json",
      async () => ({
        ok: false,
        json: async () => ({}),
      }),
    );
    expect(fallback).toBe(DEFAULT_STUDIO_WORLD_MANIFEST);
  });
