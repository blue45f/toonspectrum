import { describe, expect, it } from "vitest";

import {
  bindStudioScreenShare,
  createStudioScreenObject,
  DEFAULT_STUDIO_SCREEN_VISIBILITY_RADIUS,
  releaseStudioScreenShare,
  stepStudioDoorState,
  studioScreenShareVisibleTo,
} from "./studio-virtual-space-object-runtime";

describe("Virtual Studio world-object state", () => {
  it("opens a physical door near the player and closes it only after a grace period", () => {
    const opened = stepStudioDoorState({ open: false, lastNearAt: -Infinity }, 30, 1000);
    expect(opened).toEqual({ open: true, lastNearAt: 1000 });
    expect(stepStudioDoorState(opened, 100, 1600).open).toBe(true);
    expect(stepStudioDoorState(opened, 100, 1900).open).toBe(false);
  });
});

describe("Virtual Studio large screen objects", () => {
  it("creates a screen with the default visibility radius and no share", () => {
    const screen = createStudioScreenObject("screen:hall", { x: 100, y: 200 });
    expect(screen).toEqual({
      id: "screen:hall",
      position: { x: 100, y: 200 },
      visibilityRadius: DEFAULT_STUDIO_SCREEN_VISIBILITY_RADIUS,
      share: null,
    });
  });

  it("sanitizes invalid identity, geometry and radius without throwing", () => {
    const screen = createStudioScreenObject("not valid!!", { x: Number.NaN, y: 50 }, -10);
    expect(screen.id).toBe("screen");
    expect(screen.position).toEqual({ x: 0, y: 50 });
    expect(screen.visibilityRadius).toBe(DEFAULT_STUDIO_SCREEN_VISIBILITY_RADIUS);
  });

  it("binds a valid share and releases it back to unshared", () => {
    const screen = createStudioScreenObject("screen:hall", { x: 100, y: 200 });
    const bound = bindStudioScreenShare(screen, {
      sharerId: "avatar:jun", sharerLabel: "준 작가", trackState: "live", startedAt: 1700,
    });
    expect(bound.share).toEqual({ sharerId: "avatar:jun", sharerLabel: "준 작가", trackState: "live", startedAt: 1700 });
    expect(screen.share).toBeNull();
    expect(releaseStudioScreenShare(bound).share).toBeNull();
    expect(releaseStudioScreenShare(screen)).toBe(screen);
  });

  it("rejects an invalid binding without changing the screen", () => {
    const screen = createStudioScreenObject("screen:hall", { x: 100, y: 200 });
    expect(bindStudioScreenShare(screen, {
      sharerId: "not valid!!", sharerLabel: "준 작가", trackState: "live", startedAt: 1700,
    })).toBe(screen);
    expect(bindStudioScreenShare(screen, {
      sharerId: "avatar:jun", sharerLabel: "   ", trackState: "live", startedAt: 1700,
    })).toBe(screen);
  });

  it("shows a live share only inside the visibility radius", () => {
    const screen = createStudioScreenObject("screen:hall", { x: 100, y: 200 }, 120);
    expect(studioScreenShareVisibleTo(screen, 50)).toBe(false);
    const bound = bindStudioScreenShare(screen, {
      sharerId: "avatar:jun", sharerLabel: "준 작가", trackState: "live", startedAt: 1700,
    });
    expect(studioScreenShareVisibleTo(bound, 120)).toBe(true);
    expect(studioScreenShareVisibleTo(bound, 121)).toBe(false);
    const ended = bindStudioScreenShare(screen, {
      sharerId: "avatar:jun", sharerLabel: "준 작가", trackState: "ended", startedAt: 1700,
    });
    expect(studioScreenShareVisibleTo(ended, 10)).toBe(false);
    expect(studioScreenShareVisibleTo(bound, Number.NaN)).toBe(false);
  });
});
