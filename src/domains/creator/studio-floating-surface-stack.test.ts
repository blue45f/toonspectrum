import { afterEach, describe, expect, it } from "vitest";

import {
  bringStudioFloatingSurfaceToFront,
  registerStudioFloatingSurface,
  resetStudioFloatingSurfaceStackForTest,
  studioFloatingSurfaceZIndex,
  studioFloatingSurfaceStackSnapshot,
  subscribeStudioFloatingSurfaceStack,
} from "./studio-floating-surface-stack";

afterEach(resetStudioFloatingSurfaceStackForTest);

describe("studio floating surface stack", () => {
  it("orders newly mounted and explicitly focused surfaces below transient popover z-index 70", () => {
    const releaseA = registerStudioFloatingSurface("surface-a");
    const releaseB = registerStudioFloatingSurface("surface-b");

    expect(studioFloatingSurfaceZIndex("surface-b"))
      .toBeGreaterThan(studioFloatingSurfaceZIndex("surface-a"));
    expect(studioFloatingSurfaceZIndex("surface-b")).toBeLessThan(70);

    bringStudioFloatingSurfaceToFront("surface-a");
    expect(studioFloatingSurfaceZIndex("surface-a"))
      .toBeGreaterThan(studioFloatingSurfaceZIndex("surface-b"));

    releaseA();
    releaseB();
  });

  it("reference-counts duplicate stable ids and publishes only visible-order changes", () => {
    let notifications = 0;
    const unsubscribe = subscribeStudioFloatingSurfaceStack(() => {
      notifications += 1;
    });
    const before = studioFloatingSurfaceStackSnapshot();
    const releaseFirst = registerStudioFloatingSurface("shared");
    const afterFirst = studioFloatingSurfaceStackSnapshot();
    const releaseSecond = registerStudioFloatingSurface("shared");

    expect(afterFirst).toBeGreaterThan(before);
    expect(studioFloatingSurfaceStackSnapshot()).toBe(afterFirst);
    releaseFirst();
    expect(studioFloatingSurfaceStackSnapshot()).toBe(afterFirst);
    releaseSecond();
    expect(studioFloatingSurfaceStackSnapshot()).toBeGreaterThan(afterFirst);
    expect(notifications).toBe(2);
    unsubscribe();
  });

  it("keeps the newest twenty surfaces strictly ordered and bounds older windows to the floor", () => {
    const releases = Array.from({ length: 36 }, (_, index) =>
      registerStudioFloatingSurface(`surface-${index}`),
    );

    expect(studioFloatingSurfaceZIndex("surface-35")).toBe(69);
    expect(studioFloatingSurfaceZIndex("surface-34")).toBe(68);
    expect(studioFloatingSurfaceZIndex("surface-0")).toBe(50);
    expect(studioFloatingSurfaceZIndex("surface-5")).toBe(50);

    for (const release of releases) release();
  });
});
