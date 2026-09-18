import { describe, expect, it } from "vitest";

import { StudioVirtualSpaceEngineBridge } from "./studio-virtual-space-engine-bridge";
import {
  DEFAULT_STUDIO_MOTION_CONFIG,
  stepStudioVirtualSpaceMotion,
} from "./studio-virtual-space-motion";
import {
  DEFAULT_STUDIO_WORLD_MANIFEST,
  validateStudioWorldManifest,
} from "./studio-virtual-space-world-manifest";
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
