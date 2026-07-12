import { describe, expect, it } from "vitest";

import {
  STUDIO_BG3D_LT_CAPTURE_MAX_EDGE,
  STUDIO_BG3D_LT_CAPTURE_MAX_HEIGHT,
  STUDIO_BG3D_LT_CAPTURE_MAX_PIXELS,
  STUDIO_BG3D_LT_CAPTURE_MIN_HEIGHT,
  resolveStudioBg3dLtCaptureSize,
} from "./studio-bg3d-lt-capture-size";

describe("resolveStudioBg3dLtCaptureSize", () => {
  it("keeps an admitted 16:9 requested size exactly", () => {
    expect(
      resolveStudioBg3dLtCaptureSize({
        sourceWidth: 1_920,
        sourceHeight: 1_080,
        requestedHeight: 1_080,
        maxPixels: 8_294_400,
      })
    ).toEqual({
      width: 1_920,
      height: 1_080,
      pixelCount: 2_073_600,
      requestedHeight: 1_080,
      wasReduced: false,
    });
  });

  it("reduces a 4K-height request to the mobile pixel budget while preserving aspect", () => {
    const result = resolveStudioBg3dLtCaptureSize({
      sourceWidth: 1_920,
      sourceHeight: 1_080,
      requestedHeight: 4_096,
      maxPixels: 2_073_600,
    });
    expect(result).not.toBeNull();
    expect(result!.wasReduced).toBe(true);
    expect(result!.pixelCount).toBeLessThanOrEqual(2_073_600);
    expect(result!.height).toBeLessThan(4_096);
    expect(result!.width / result!.height).toBeCloseTo(16 / 9, 2);
  });

  it("obeys a tighter explicit edge cap", () => {
    const result = resolveStudioBg3dLtCaptureSize({
      sourceWidth: 4_000,
      sourceHeight: 1_000,
      requestedHeight: 1_000,
      maxPixels: 4_000_000,
      maxEdge: 2_048,
    });
    expect(result).toMatchObject({ width: 2_048, height: 512, wasReduced: true });
  });

  it("handles portrait and square sources deterministically", () => {
    expect(
      resolveStudioBg3dLtCaptureSize({
        sourceWidth: 900,
        sourceHeight: 1_600,
        requestedHeight: 1_600,
        maxPixels: 2_000_000,
      })
    ).toMatchObject({ width: 900, height: 1_600, wasReduced: false });
    expect(
      resolveStudioBg3dLtCaptureSize({
        sourceWidth: 1,
        sourceHeight: 1,
        requestedHeight: 1_024,
        maxPixels: 1_048_576,
      })
    ).toMatchObject({ width: 1_024, height: 1_024, wasReduced: false });
  });

  it("is frozen and never mutates its input", () => {
    const input = {
      sourceWidth: 1_600,
      sourceHeight: 900,
      requestedHeight: 720,
      maxPixels: 2_073_600,
    };
    const snapshot = { ...input };
    const result = resolveStudioBg3dLtCaptureSize(input);
    expect(input).toEqual(snapshot);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it.each([
    { sourceWidth: 0, sourceHeight: 100, requestedHeight: 640, maxPixels: 1_000_000 },
    { sourceWidth: 100.5, sourceHeight: 100, requestedHeight: 640, maxPixels: 1_000_000 },
    { sourceWidth: 100, sourceHeight: Number.NaN, requestedHeight: 640, maxPixels: 1_000_000 },
    { sourceWidth: 100, sourceHeight: 100, requestedHeight: STUDIO_BG3D_LT_CAPTURE_MIN_HEIGHT - 1, maxPixels: 1_000_000 },
    { sourceWidth: 100, sourceHeight: 100, requestedHeight: STUDIO_BG3D_LT_CAPTURE_MAX_HEIGHT + 1, maxPixels: 1_000_000 },
    { sourceWidth: 100, sourceHeight: 100, requestedHeight: 640, maxPixels: 0 },
    { sourceWidth: 100, sourceHeight: 100, requestedHeight: 640, maxPixels: STUDIO_BG3D_LT_CAPTURE_MAX_PIXELS + 1 },
    { sourceWidth: 100, sourceHeight: 100, requestedHeight: 640, maxPixels: 1_000_000, maxEdge: STUDIO_BG3D_LT_CAPTURE_MAX_EDGE + 1 },
  ])("rejects malformed or out-of-contract input %#", (input) => {
    expect(resolveStudioBg3dLtCaptureSize(input)).toBeNull();
  });

  it("never allocates beyond either limit at difficult rounding boundaries", () => {
    for (const [sourceWidth, sourceHeight] of [
      [1_919, 1_080],
      [10_000, 3_333],
      [333, 1_000],
    ] as const) {
      const result = resolveStudioBg3dLtCaptureSize({
        sourceWidth,
        sourceHeight,
        requestedHeight: 4_096,
        maxPixels: 1_234_567,
        maxEdge: 2_049,
      });
      expect(result).not.toBeNull();
      expect(result!.pixelCount).toBeLessThanOrEqual(1_234_567);
      expect(result!.width).toBeLessThanOrEqual(2_049);
      expect(result!.height).toBeLessThanOrEqual(2_049);
    }
  });
});
