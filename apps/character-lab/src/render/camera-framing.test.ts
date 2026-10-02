import { describe, expect, it } from "vitest";

import { BUST_FRAMING, DEFAULT_FRAMING, FACE_FRAMING } from "../contracts";

import { FALLBACK_BOUNDS, cameraPosition, isDegenerateBounds, resolveFraming } from "./camera-framing";

describe("camera-framing", () => {
  it("정면(yaw 0)은 +Z 쪽에서 캐릭터를 본다", () => {
    const resolved = resolveFraming(DEFAULT_FRAMING, FALLBACK_BOUNDS);
    const position = cameraPosition(resolved);
    expect(position[2]).toBeGreaterThan(0.5);
    expect(Math.abs(position[0])).toBeLessThan(1e-9);
    expect(resolved.target[1]).toBeCloseTo(0.85, 6);
  });

  it("bust·face는 target이 높고 radius가 짧다", () => {
    const full = resolveFraming(DEFAULT_FRAMING);
    const bust = resolveFraming(BUST_FRAMING);
    const face = resolveFraming(FACE_FRAMING);
    expect(bust.target[1]).toBeGreaterThan(full.target[1]);
    expect(face.target[1]).toBeGreaterThan(bust.target[1]);
    expect(bust.radius).toBeLessThan(full.radius);
    expect(face.radius).toBeLessThan(bust.radius);
  });

  it("yaw 90°는 +X 쪽, pitch 양수는 위에서 본다", () => {
    const side = cameraPosition(resolveFraming({ mode: "full-body", yawDeg: 90, pitchDeg: 0, distanceScale: 1 }));
    expect(side[0]).toBeLessThan(-0.5);
    expect(Math.abs(side[2])).toBeLessThan(1e-9);
    const above = cameraPosition(resolveFraming({ mode: "full-body", yawDeg: 0, pitchDeg: 30, distanceScale: 1 }));
    expect(above[1]).toBeGreaterThan(resolveFraming(DEFAULT_FRAMING).target[1]);
  });

  it("distanceScale은 radius에 곱하고 비정상 값은 클램프한다", () => {
    const base = resolveFraming(DEFAULT_FRAMING).radius;
    expect(resolveFraming({ ...DEFAULT_FRAMING, distanceScale: 2 }).radius).toBeCloseTo(base * 2, 6);
    expect(resolveFraming({ ...DEFAULT_FRAMING, distanceScale: Number.NaN }).radius).toBeCloseTo(base, 6);
    expect(resolveFraming({ ...DEFAULT_FRAMING, pitchDeg: 500 }).beta).toBeGreaterThan(0);
  });

  it("퇴화 bbox 판별", () => {
    expect(isDegenerateBounds({ min: [0, 0, 0], max: [0, 0, 0] })).toBe(true);
    expect(isDegenerateBounds(FALLBACK_BOUNDS)).toBe(false);
  });
});
