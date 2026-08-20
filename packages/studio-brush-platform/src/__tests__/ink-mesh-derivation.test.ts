import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  STUDIO_LIVE_INK_MESH_PRESSURE_TO_SIZE,
  inkMeshBrushParamsFromStudioBrushTip,
  inkMeshOrientationRadFromStudioLivePose,
  inkMeshTiltRadFromStudioLivePose,
  normalizedInkMeshOrientationRad,
  type StudioLiveInkPoseChannels,
} from "../ink-mesh-derivation";

const HALF_PI = Math.PI / 2;
const TWO_PI = Math.PI * 2;

function pose(overrides: Partial<StudioLiveInkPoseChannels>): StudioLiveInkPoseChannels {
  return {
    altitudeRad: Number.NaN,
    azimuthRad: Number.NaN,
    tiltXDeg: 0,
    tiltYDeg: 0,
    twistDeg: 0,
    ...overrides,
  };
}

describe("studio live-lane ink derivation (canonical module)", () => {
  it("prefers true altitude and keeps the exact tiltX/Y fallback arithmetic", () => {
    expect(inkMeshTiltRadFromStudioLivePose(pose({ altitudeRad: 0.4, tiltXDeg: 30, tiltYDeg: 40 })))
      .toBe(Math.min(HALF_PI, Math.max(0, HALF_PI - 0.4)));
    // Non-finite altitude falls back to the tilt magnitude with the historical
    // `value * Math.PI / 180` evaluation order (bit-exact with the live lane).
    expect(inkMeshTiltRadFromStudioLivePose(pose({ tiltXDeg: 30, tiltYDeg: 40 })))
      .toBe(Math.min(HALF_PI, Math.hypot(30, 40) * Math.PI / 180));
    // Both branches clamp into ink's [0, π/2] domain.
    expect(inkMeshTiltRadFromStudioLivePose(pose({ altitudeRad: -3 }))).toBe(HALF_PI);
    expect(inkMeshTiltRadFromStudioLivePose(pose({ altitudeRad: 3 }))).toBe(0);
    expect(inkMeshTiltRadFromStudioLivePose(pose({ tiltXDeg: 89, tiltYDeg: 89 }))).toBe(HALF_PI);
  });

  it("wraps azimuth into [0, 2π) and falls back to tilt direction plus twist", () => {
    expect(inkMeshOrientationRadFromStudioLivePose(pose({ azimuthRad: -1.25 })))
      .toBe(-1.25 + TWO_PI);
    expect(inkMeshOrientationRadFromStudioLivePose(pose({ azimuthRad: 7 })))
      .toBe(7 % TWO_PI);
    expect(
      inkMeshOrientationRadFromStudioLivePose(pose({ tiltXDeg: -10, tiltYDeg: 5, twistDeg: 300 })),
    ).toBe(normalizedInkMeshOrientationRad(Math.atan2(5, -10) + 300 * Math.PI / 180));
  });

  it("derives live brush params with the pinned pressure response and tip clamps", () => {
    const params = inkMeshBrushParamsFromStudioBrushTip({
      sizePx: 11,
      roundness: 0.62,
      angleDeg: 24,
      tiltEnabled: true,
    });
    expect(params).toEqual({
      size: 11,
      pressureToSize: { minMultiplier: 0.3, maxMultiplier: 1.7 },
      rotationRad: 24 * Math.PI / 180,
      scale: { x: 0.62, y: 1 },
      tiltToRotation: { minOffsetRad: 0, maxOffsetRad: HALF_PI },
    });
    expect(params.pressureToSize).toBe(STUDIO_LIVE_INK_MESH_PRESSURE_TO_SIZE);
    expect(Object.isFrozen(STUDIO_LIVE_INK_MESH_PRESSURE_TO_SIZE)).toBe(true);

    const defaulted = inkMeshBrushParamsFromStudioBrushTip({
      sizePx: 3,
      roundness: Number.NaN,
      angleDeg: Number.NaN,
      tiltEnabled: false,
    });
    expect(defaulted.rotationRad).toBe(0);
    expect(defaulted.scale).toEqual({ x: 1, y: 1 });
    expect(defaulted.tiltToRotation).toBeNull();

    const clamp = (roundness: number) =>
      inkMeshBrushParamsFromStudioBrushTip({
        sizePx: 3,
        roundness,
        angleDeg: 0,
        tiltEnabled: false,
      }).scale?.x;
    expect(clamp(0.01)).toBe(0.08);
    expect(clamp(1.6)).toBe(1);
  });

  it("stays a pure module: type-only imports, no WASM or GPU state", () => {
    const source = readFileSync(new URL("../ink-mesh-derivation.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/^import (?!type )/mu);
  });
});
