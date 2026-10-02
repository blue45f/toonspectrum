import { describe, expect, it } from "vitest";

import { fistHandLandmarks, tPoseBody, toImageLandmarks } from "./landmark-fixtures";
import { HAND_CONNECTIONS, POSE_CONNECTIONS, fitImageInBox, handOverlayPlan, poseOverlayPlan } from "./landmark-overlay";

describe("vision/landmark-overlay", () => {
  it("정규화 좌표를 이미지 픽셀로 바꾸고 연결선을 만든다", () => {
    const landmarks = toImageLandmarks(tPoseBody(), 1, { visibilityOverrides: { left_heel: 0.1 } });
    const plan = poseOverlayPlan(landmarks, 640, 480);
    expect(plan.viewBox).toBe("0 0 640 480");
    expect(plan.points.length).toBe(33);
    expect(plan.segments.length).toBe(POSE_CONNECTIONS.length);
    const nose = plan.points[0];
    expect(nose?.x).toBeCloseTo((landmarks[0]?.x ?? 0) * 640, 9);
    expect(nose?.y).toBeCloseTo((landmarks[0]?.y ?? 0) * 480, 9);
    const heel = plan.points[29];
    expect(heel?.visible).toBe(false);
    const heelSegment = plan.segments.find((segment) => segment.from === 27 && segment.to === 29);
    expect(heelSegment?.visible).toBe(false);
    expect(plan.segments.find((segment) => segment.from === 11 && segment.to === 13)?.visible).toBe(true);
  });

  it("손 오버레이는 가시성 게이트 없이 21점·21선을 만든다", () => {
    const plan = handOverlayPlan(fistHandLandmarks(), 300, 300);
    expect(plan.points.length).toBe(21);
    expect(plan.segments.length).toBe(HAND_CONNECTIONS.length);
    expect(plan.points.every((point) => point.visible)).toBe(true);
    expect(() => handOverlayPlan([], 1, 1)).toThrow(/21개/u);
    expect(() => poseOverlayPlan([], 1, 1)).toThrow(/33개/u);
  });

  it("contain 맞춤은 비율을 유지하고 가운데 정렬한다", () => {
    const fit = fitImageInBox(400, 200, 100, 100);
    expect(fit.scale).toBeCloseTo(0.25, 12);
    expect(fit.width).toBe(100);
    expect(fit.height).toBe(50);
    expect(fit.offsetY).toBe(25);
    expect(fitImageInBox(0, 0, 10, 10).scale).toBe(1);
  });
});
