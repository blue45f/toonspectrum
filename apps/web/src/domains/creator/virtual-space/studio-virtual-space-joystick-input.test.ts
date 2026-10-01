import { describe, expect, it } from "vitest";

import {
  applyStudioInputResponseCurve,
  snapStudioVectorTo8Way,
  studioJoystickVector,
  studioJoystickVectorWithOptions,
} from "./studio-virtual-space-joystick-input";

describe("응답 곡선", () => {
  it("linear는 그대로다", () => {
    expect(applyStudioInputResponseCurve(0.5, "linear")).toBeCloseTo(0.5, 5);
    expect(applyStudioInputResponseCurve(-0.5, "linear")).toBeCloseTo(-0.5, 5);
  });

  it("quadratic는 저속을 더 세밀하게 한다", () => {
    expect(applyStudioInputResponseCurve(0.5, "quadratic")).toBeCloseTo(0.25, 5);
    expect(applyStudioInputResponseCurve(-0.5, "quadratic")).toBeCloseTo(-0.25, 5);
    expect(applyStudioInputResponseCurve(1, "quadratic")).toBeCloseTo(1, 5);
  });

  it("cubic는 더 세밀하게 한다", () => {
    expect(applyStudioInputResponseCurve(0.5, "cubic")).toBeCloseTo(0.125, 5);
    expect(applyStudioInputResponseCurve(1, "cubic")).toBeCloseTo(1, 5);
  });
});

describe("8방향 스냅", () => {
  it("가까운 8방향으로 스냅하고 크기는 유지한다", () => {
    // 20도 방향 → 0도(동쪽)로 스냅
    const angle = (20 * Math.PI) / 180;
    const snapped = snapStudioVectorTo8Way({ x: Math.cos(angle) * 0.7, y: Math.sin(angle) * 0.7 });
    expect(Math.hypot(snapped.x, snapped.y)).toBeCloseTo(0.7, 5);
    expect(Math.atan2(snapped.y, snapped.x)).toBeCloseTo(0, 5);
  });

  it("30도 방향은 45도로 스냅한다", () => {
    const angle = (30 * Math.PI) / 180;
    const snapped = snapStudioVectorTo8Way({ x: Math.cos(angle), y: Math.sin(angle) });
    expect(Math.atan2(snapped.y, snapped.x)).toBeCloseTo(Math.PI / 4, 5);
  });

  it("0 벡터는 그대로다", () => {
    expect(snapStudioVectorTo8Way({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });
});

describe("옵션 조이스틱 벡터", () => {
  it("기본 옵션은 기존 함수와 같다", () => {
    const legacy = studioJoystickVector(0.6, 0.2);
    const next = studioJoystickVectorWithOptions(0.6, 0.2, {});
    expect(next.x).toBeCloseTo(legacy.x, 5);
    expect(next.y).toBeCloseTo(legacy.y, 5);
  });

  it("데드존 밖 작은 입력은 곡선으로 더 작아진다", () => {
    const linear = studioJoystickVectorWithOptions(0.3, 0, { responseCurve: "linear" });
    const curved = studioJoystickVectorWithOptions(0.3, 0, { responseCurve: "quadratic" });
    expect(curved.x).toBeLessThan(linear.x);
    expect(curved.x).toBeGreaterThan(0);
  });

  it("snap8Way는 대각선을 45도로 고정한다", () => {
    const angle = (20 * Math.PI) / 180;
    const snapped = studioJoystickVectorWithOptions(Math.cos(angle), Math.sin(angle), { snap8Way: true });
    expect(Math.atan2(snapped.y, snapped.x)).toBeCloseTo(0, 4);
  });

  it("데드존 안은 0이다", () => {
    expect(studioJoystickVectorWithOptions(0.05, 0, {})).toEqual({ x: 0, y: 0 });
  });
});
