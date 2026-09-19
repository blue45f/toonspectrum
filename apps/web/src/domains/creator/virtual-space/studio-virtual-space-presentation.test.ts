import { describe, expect, it } from "vitest";
import {
  StudioFixedStepClock,
  StudioFixedStepPose,
  StudioPeerTimeline,
  studioCameraLerp,
  studioCoverRect,
  studioGaitFrame,
  studioRenderViewport,
  studioStableFacing,
} from "./studio-virtual-space-presentation";
import { DEFAULT_STUDIO_MOTION_CONFIG, stepStudioVirtualSpaceMotion } from "./studio-virtual-space-motion";
import { DEFAULT_STUDIO_WORLD_MANIFEST, validateStudioWorldManifest } from "./studio-virtual-space-world-manifest";
import { resolveStudioWorldSpawn, studioWorldCanOccupy } from "./studio-virtual-space-world-pathfinding";
import { STUDIO_CHARACTER_SKINS } from "./studio-virtual-space-character-skins";

const openWorld = { ...DEFAULT_STUDIO_WORLD_MANIFEST, width: 500, height: 500, colliders: [], props: [],
  rooms: [{ id: "room", x: 0, y: 0, width: 500, height: 500, labelKo: "방", labelEn: "Room" }],
  interactions: [], portals: [], npcs: [], spawns: [{ id: "main", point: { x: 200, y: 200 } }],
};

describe("Virtual Studio art and presentation", () => {
  it("supplies eight source-preserving cutout frames in every skin/direction", () => {
    for (const skin of STUDIO_CHARACTER_SKINS) for (const direction of ["down", "left", "right", "up"] as const) {
      const clip = skin.clips?.[`walk-${direction}`];
      expect(clip?.end).toBe(7); expect(clip?.technique).toBe("cutout-rig");
      expect(clip?.distancePerCycle).toBeGreaterThan(0);
      expect(clip?.textureUrl).toContain("/production-v2/");
      expect(skin.directional[direction]).toContain("/production-v2/");
    }
  });
  it("uses native lossless art, not an upscaled low-quality JPEG", () => {
    expect(DEFAULT_STUDIO_WORLD_MANIFEST.backgroundUrl).toContain("master-central-lossless.webp");
  });
  it("interpolates positions between fixed physics ticks on 120-Hz displays", () => {
    const pose = new StudioFixedStepPose({ x: 0, y: 0 });
    pose.observe({ x: 10, y: 0 }, 100);
    expect(pose.sample(100).x).toBe(0);
    expect(pose.sample(100 + 1000 / 120).x).toBeCloseTo(5);
    expect(pose.sample(100 + 1000 / 60).x).toBeCloseTo(10);
    expect(pose.sample(900).x).toBe(10);
  });
  it("keeps irregular and catch-up renders on fixed simulation time", () => {
    const clock = new StudioFixedStepClock(100);
    const pose = new StudioFixedStepPose({ x: 0, y: 0 });
    pose.reset({ x: 0, y: 0 }, clock.time);
    pose.observe({ x: 10, y: 0 }, clock.advance(1 / 60));
    expect(pose.sample(125).x).toBeCloseTo(5);
    pose.observe({ x: 20, y: 0 }, clock.advance(1 / 60));
    pose.observe({ x: 30, y: 0 }, clock.advance(1 / 60));
    expect(pose.sample(clock.time).x).toBeCloseTo(20);
    expect(pose.sample(clock.time + 1000 / 120).x).toBeCloseTo(25);
  });
  it("resets interpolation for teleports rather than drawing a trail through walls", () => {
    const pose = new StudioFixedStepPose({ x: 0, y: 0 });
    pose.observe({ x: 300, y: 200 }, 10);
    expect(pose.sample(10)).toEqual({ x: 300, y: 200 });
    pose.observe({ x: Number.NaN, y: 0 }, 30);
    expect(pose.sample(30)).toEqual({ x: 300, y: 200 });
  });
  it("advances gait from distance, preserving phase around turns and stopping at walls", () => {
    expect(studioGaitFrame(0, 8)).toBe(0);
    expect(studioGaitFrame(21, 8)).toBe(2);
    expect(studioGaitFrame(42, 8)).toBe(4);
    expect(studioGaitFrame(84, 8)).toBe(0);
    expect(studioGaitFrame(42, 8)).toBe(studioGaitFrame(42, 8));
    expect(studioGaitFrame(Number.NaN, 8)).toBe(0);
  });
  it("does not rapidly swap facing around a 45-degree input angle", () => {
    expect(studioStableFacing({x: 99, y: 100}, "right")).toBe("right");
    expect(studioStableFacing({x: 100, y: 99}, "down")).toBe("down");
    expect(studioStableFacing({x: 30, y: 100}, "right")).toBe("down");
    expect(studioStableFacing({x: -100, y: 20}, "down")).toBe("left");
    expect(studioStableFacing({x: 0, y: 0}, "up")).toBe("up");
  });
  it("buffers arrival samples and does not treat local UI refreshes as new peer movement", () => {
    const peer = new StudioPeerTimeline(85);
    peer.push({x: 0, y: 0, at: 1000, moving: true, facing: "right"});
    peer.push({x: 80, y: 0, at: 1080, moving: true, facing: "right"});
    peer.push({x: 999, y: 0, at: 1080, moving: true, facing: "left"});
    expect(peer.sample(1125)?.x).toBeCloseTo(40);
    expect(peer.sample(1165)?.x).toBeCloseTo(80);
  });
  it("presents peer movement and facing on the same delayed timeline", () => {
    const peer = new StudioPeerTimeline(50);
    peer.push({x: 0, y: 0, at: 1000, moving: false, facing: "down"});
    peer.push({x: 20, y: 0, at: 1100, moving: true, facing: "right"});
    peer.push({x: 40, y: 0, at: 1200, moving: false, facing: "up"});
    expect(peer.sample(1100)).toMatchObject({x: 10, moving: true, facing: "right"});
    expect(peer.sample(1200)).toMatchObject({x: 30, moving: true, facing: "right"});
    expect(peer.sample(1250)).toMatchObject({x: 40, moving: false, facing: "up"});
  });
  it("uses arrival velocity rather than packet distance for low-speed facing changes", () => {
    const peer = new StudioPeerTimeline(0, 80);
    peer.push({x: 0, y: 0, at: 1000, moving: true, facing: "down"});
    peer.push({x: 4, y: 0, at: 1090, moving: true, facing: "right"});
    expect(peer.sample(1045)).toMatchObject({x: 2, y: 0, moving: true, facing: "right"});
    expect(peer.sample(1110)?.facing).toBe("right");
  });
  it("preserves a newer stop packet that arrives in the same millisecond", () => {
    const peer = new StudioPeerTimeline(0, 80);
    peer.push({x: 0, y: 0, at: 1000, sequence: 4, moving: true, facing: "right"});
    peer.push({x: 4, y: 0, at: 1000, sequence: 5, moving: false, facing: "right"});
    peer.push({x: 999, y: 0, at: 1001, sequence: 4, moving: true, facing: "left"});
    expect(peer.sample(1001)).toMatchObject({x: 4, y: 0, moving: false, facing: "right"});
  });
  it("caps prediction when packets stop arriving and respects idle and teleports", () => {
    const peer = new StudioPeerTimeline(0, 80);
    peer.push({x: 0, y: 0, at: 1000, moving: true, facing: "right"});
    peer.push({x: 10, y: 0, at: 1080, moving: true, facing: "right"});
    expect(peer.sample(10000)?.x).toBeCloseTo(20);
    expect(peer.sample(10000)?.moving).toBe(false);
    peer.push({x: 12, y: 0, at: 1160, moving: false, facing: "down"});
    expect(peer.sample(10000)?.x).toBe(12);
    peer.push({x: 800, y: 0, at: 1240, moving: false, facing: "down"});
    expect(peer.sample(1240)?.x).toBe(800);
  });
  it("bounds Retina rendering cost while retaining CSS/world coordinate sizes", () => {
    const vp = studioRenderViewport(842, 827, 3);
    expect(vp.ratio).toBe(2); expect(vp.width).toBe(1684); expect(vp.height).toBe(1654);
    const huge = studioRenderViewport(5000, 3000, 3);
    expect(huge.width * huge.height).toBeLessThanOrEqual(4_010_000);
    expect(studioRenderViewport(Number.NaN, 0, Number.NaN).width).toBe(1);
  });
  it("covers the world with native art without changing its aspect ratio", () => {
    const cover = studioCoverRect(850, 798, 869, 813);
    expect(cover.width / cover.height).toBeCloseTo(869 / 813, 10);
    expect(cover.width).toBeGreaterThanOrEqual(850);
    expect(cover.height).toBeCloseTo(798);
    expect(cover.x + cover.width / 2).toBeCloseTo(425);
    expect(cover.y + cover.height / 2).toBeCloseTo(399);
  });
  it("camera smoothing covers the same distance at 30, 60 and 120 fps", () => {
    const remaining = (hz: number) => Math.pow(1 - studioCameraLerp(1 / hz), hz);
    expect(remaining(30)).toBeCloseTo(remaining(60), 8);
    expect(remaining(120)).toBeCloseTo(remaining(60), 8);
  });
  it("analog input stays analog with quick, bounded stopping", () => {
    let state = {velocity: {x: 0, y: 0}};
    for (let n = 0; n < 60; n++) state = stepStudioVirtualSpaceMotion(state, {x: .25, y: 0}, 1 / 60);
    expect(state.velocity.x).toBeCloseTo(DEFAULT_STUDIO_MOTION_CONFIG.maxSpeed / 4);
    for (let n = 0; n < 8; n++) state = stepStudioVirtualSpaceMotion(state, {x: 0, y: 0}, 1 / 60);
    expect(state.velocity.x).toBe(0);
  });
  it("rescues a player when the configured spawn is inside furniture", () => {
    const world = { ...openWorld, colliders: [{x: 180, y: 180, width: 60, height: 60}] };
    const point = resolveStudioWorldSpawn(world, {x: 200, y: 200});
    expect(point).not.toBeNull(); expect(studioWorldCanOccupy(world, point!)).toBe(true);
  });
  it("fails closed on a world with no safe floor", () => {
    expect(resolveStudioWorldSpawn({...openWorld, colliders: [{x: 0, y: 0, width: 500, height: 500}]}, {x: 200, y: 200})).toBeNull();
  });
  it("retains a valid default world after replacing its visual assets", () => {
    expect(validateStudioWorldManifest(DEFAULT_STUDIO_WORLD_MANIFEST)).toEqual([]);
  });
});
