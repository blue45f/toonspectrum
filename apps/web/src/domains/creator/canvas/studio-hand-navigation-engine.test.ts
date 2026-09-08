import { describe, expect, it } from "vitest";

import {
  hasStudioHandPanCrossedDragThreshold,
  planStudioHandPanInertiaFrame,
  resolveStudioHandPanSource,
  sampleStudioHandPanVelocity,
  studioHandPanDragThresholdPx,
  type StudioHandPanIntentInput,
} from "./studio-hand-navigation-engine";

const pointerIntentBase = {
  pointerType: "mouse",
  button: 0,
  isPrimary: true,
  handToolActive: false,
  temporaryHandActive: false,
  interactiveTarget: false,
  middleButtonAction: "pan",
  rightButtonAction: "context",
  touchOneFingerMode: "draw",
} as const satisfies StudioHandPanIntentInput;

describe("studio hand navigation gesture ownership", () => {
  it("uses the configured middle button without changing the active tool", () => {
    expect(
      resolveStudioHandPanSource({
        ...pointerIntentBase,
        button: 1,
      })
    ).toBe("middle-button");
    expect(
      resolveStudioHandPanSource({
        ...pointerIntentBase,
        button: 1,
        middleButtonAction: "zoom",
      })
    ).toBeNull();
  });

  it("supports optional right-button panning without stealing the context menu mapping", () => {
    expect(
      resolveStudioHandPanSource({
        ...pointerIntentBase,
        button: 2,
        rightButtonAction: "pan",
      })
    ).toBe("right-button");
    expect(
      resolveStudioHandPanSource({
        ...pointerIntentBase,
        button: 2,
        rightButtonAction: "context",
      })
    ).toBeNull();
  });

  it("keeps Space as a temporary hand mode and the explicit hand tool persistent", () => {
    expect(
      resolveStudioHandPanSource({
        ...pointerIntentBase,
        temporaryHandActive: true,
      })
    ).toBe("temporary-space");
    expect(
      resolveStudioHandPanSource({
        ...pointerIntentBase,
        pointerType: "pen",
        handToolActive: true,
      })
    ).toBe("hand-tool");
  });

  it("adds explicit Hand touch panning only where the legacy touch controller is idle", () => {
    const touchBase = {
      ...pointerIntentBase,
      pointerType: "touch",
      handToolActive: true,
    } as const;

    expect(resolveStudioHandPanSource(touchBase)).toBe("hand-tool");
    expect(
      resolveStudioHandPanSource({
        ...touchBase,
        touchOneFingerMode: "pan",
      })
    ).toBeNull();
    expect(
      resolveStudioHandPanSource({
        ...touchBase,
        touchOneFingerMode: "none",
      })
    ).toBeNull();
    expect(
      resolveStudioHandPanSource({
        ...touchBase,
        handToolActive: false,
      })
    ).toBeNull();
  });

  it("never steals an interactive viewport control or an unmapped button", () => {
    expect(
      resolveStudioHandPanSource({
        ...pointerIntentBase,
        handToolActive: true,
        interactiveTarget: true,
      })
    ).toBeNull();
    expect(
      resolveStudioHandPanSource({
        ...pointerIntentBase,
        button: 4,
        handToolActive: true,
      })
    ).toBeNull();
  });
});

describe("studio hand navigation motion", () => {
  it("uses pointer-specific drag thresholds to avoid accidental movement", () => {
    expect(studioHandPanDragThresholdPx("mouse")).toBe(3);
    expect(studioHandPanDragThresholdPx("pen")).toBe(4);
    expect(studioHandPanDragThresholdPx("touch")).toBe(8);
    expect(
      hasStudioHandPanCrossedDragThreshold({
        deltaX: 2,
        deltaY: 2,
        pointerType: "mouse",
      })
    ).toBe(false);
    expect(
      hasStudioHandPanCrossedDragThreshold({
        deltaX: 3,
        deltaY: 0,
        pointerType: "mouse",
      })
    ).toBe(true);
  });

  it("filters pointer velocity and caps pathological event bursts", () => {
    expect(
      sampleStudioHandPanVelocity({
        currentVelocity: 0,
        deltaPx: 10,
        elapsedMs: 10,
        smoothing: 0,
      })
    ).toBe(1_000);
    expect(
      sampleStudioHandPanVelocity({
        currentVelocity: 0,
        deltaPx: 10_000,
        elapsedMs: 1,
      })
    ).toBe(4_000);
  });

  it("decays inertial movement and disables it for reduced motion", () => {
    const frame = planStudioHandPanInertiaFrame({
      velocityX: 1_000,
      velocityY: -500,
      elapsedMs: 16,
      reducedMotion: false,
    });
    expect(frame.deltaX).toBeCloseTo(16);
    expect(frame.deltaY).toBeCloseTo(-8);
    expect(Math.abs(frame.velocityX)).toBeLessThan(1_000);
    expect(Math.abs(frame.velocityY)).toBeLessThan(500);
    expect(frame.shouldContinue).toBe(true);

    expect(
      planStudioHandPanInertiaFrame({
        velocityX: 1_000,
        velocityY: 500,
        elapsedMs: 16,
        reducedMotion: true,
      })
    ).toEqual({
      deltaX: 0,
      deltaY: 0,
      velocityX: 0,
      velocityY: 0,
      shouldContinue: false,
    });
  });
});
