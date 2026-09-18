import { describe, expect, it } from "vitest";

import { planStudioBrushCursorSensorVisual } from "./studio-brush-cursor-sensor";

describe("studio brush cursor sensor visual", () => {
  it("stays absent for mouse and touch so normal navigation cursors are untouched", () => {
    expect(planStudioBrushCursorSensorVisual({ pointerType: "mouse", pressure: 0.5 }).visible).toBe(false);
    expect(planStudioBrushCursorSensorVisual({ pointerType: "touch", pressure: 0.4 }).visible).toBe(false);
  });

  it("keeps hover at nominal major size while exposing tilt direction", () => {
    const hover = planStudioBrushCursorSensorVisual({
      pointerType: "pen",
      pressure: 0,
      buttons: 0,
      tiltX: 45,
      tiltY: 0,
      twist: 15,
    });

    expect(hover.visible).toBe(true);
    expect(hover.hovering).toBe(true);
    expect(hover.scaleX).toBe(1);
    expect(hover.scaleY).toBeLessThan(1);
    expect(hover.rotationDeg).toBeCloseTo(15, 6);
    expect(hover.opacity).toBeLessThan(0.7);
  });

  it("shows light pressure inside the exact nominal ring and grows monotonically", () => {
    const light = planStudioBrushCursorSensorVisual({
      pointerType: "pen",
      pressure: 0.1,
      buttons: 1,
    });
    const heavy = planStudioBrushCursorSensorVisual({
      pointerType: "pen",
      pressure: 0.9,
      buttons: 1,
    });

    expect(light.hovering).toBe(false);
    expect(light.scaleX).toBeGreaterThanOrEqual(0.3);
    expect(heavy.scaleX).toBeGreaterThan(light.scaleX);
    expect(heavy.scaleX).toBeLessThanOrEqual(1);
  });

  it("prefers Pointer Events azimuth/altitude and combines barrel rotation", () => {
    const visual = planStudioBrushCursorSensorVisual({
      pointerType: "PEN",
      pressure: 0.5,
      buttons: 1,
      tiltX: -80,
      tiltY: 80,
      azimuthAngle: Math.PI / 2,
      altitudeAngle: Math.PI / 6,
      twist: 30,
    });

    expect(visual.rotationDeg).toBeCloseTo(120, 6);
    expect(visual.scaleY).toBeLessThan(visual.scaleX);
    expect(visual.scaleY).toBeGreaterThanOrEqual(0.16);
  });

  it("sanitizes malformed telemetry into finite bounded transforms", () => {
    const visual = planStudioBrushCursorSensorVisual({
      pointerType: "pen",
      pressure: Number.POSITIVE_INFINITY,
      tiltX: Number.NaN,
      tiltY: -999,
      twist: -721,
      altitudeAngle: Number.NaN,
      azimuthAngle: Number.NaN,
    });

    for (const value of [visual.rotationDeg, visual.scaleX, visual.scaleY, visual.opacity]) {
      expect(Number.isFinite(value)).toBe(true);
    }
    expect(visual.rotationDeg).toBeGreaterThanOrEqual(0);
    expect(visual.rotationDeg).toBeLessThan(360);
    expect(visual.scaleX).toBeGreaterThanOrEqual(0.3);
    expect(visual.scaleX).toBeLessThanOrEqual(1);
  });
});
