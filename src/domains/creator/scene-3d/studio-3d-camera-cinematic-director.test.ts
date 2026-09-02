import { describe, expect, it } from "vitest";

import {
  calculateCameraShake,
  createShotBookmark,
  WEBTOON_SHOT_ANGLE_PRESETS,
} from "./studio-3d-camera-cinematic-director";

describe("Studio 3D Webtoon Camera Cinematography Director", () => {
  it("provides 8 webtoon cinematography shot angle presets", () => {
    expect(WEBTOON_SHOT_ANGLE_PRESETS.length).toBe(8);
    const lowAngle = WEBTOON_SHOT_ANGLE_PRESETS.find((p) => p.kind === "low-angle-heroic");
    expect(lowAngle).toBeDefined();
    expect(lowAngle?.defaultFov).toBe(28);

    const dutch = WEBTOON_SHOT_ANGLE_PRESETS.find((p) => p.kind === "dutch-tilt-tension");
    expect(dutch?.defaultDutchRoll).toBe(20);
  });

  it("calculates realistic camera shake offsets for explosive shockwave and earthquake rumble", () => {
    // None shake
    const zeroShake = calculateCameraShake(
      { preset: "none", intensity: 1.0, frequency: 10, decayRate: 1.0 },
      0.5,
    );
    expect(zeroShake.offsetX).toBe(0);
    expect(zeroShake.offsetY).toBe(0);

    // Earthquake rumble
    const earthShake = calculateCameraShake(
      { preset: "earthquake-rumble", intensity: 1.0, frequency: 15, decayRate: 0.5 },
      0.2,
    );
    expect(Math.abs(earthShake.offsetX)).toBeGreaterThan(0);
    expect(Math.abs(earthShake.offsetY)).toBeGreaterThan(0);

    // Explosive shockwave decaying over time
    const shockwaveEarly = calculateCameraShake(
      { preset: "explosive-shockwave", intensity: 1.5, frequency: 20, decayRate: 2.0 },
      0.05,
    );
    const shockwaveLate = calculateCameraShake(
      { preset: "explosive-shockwave", intensity: 1.5, frequency: 20, decayRate: 2.0 },
      2.0,
    );
    expect(Math.abs(shockwaveEarly.offsetY)).toBeGreaterThan(Math.abs(shockwaveLate.offsetY));
  });

  it("creates a webtoon shot bookmark with relative camera position", () => {
    const bookmark = createShotBookmark("cut-01", "1화 오프닝 영웅 등장", 1, "low-angle-heroic", [0, 0, 0]);
    expect(bookmark.id).toBe("cut-01");
    expect(bookmark.angleKind).toBe("low-angle-heroic");
    expect(bookmark.position[1]).toBeCloseTo(0.3);
    expect(bookmark.fov).toBe(28);
    expect(bookmark.easing).toBe("ease-in-out");
  });
});
