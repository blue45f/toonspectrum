import { describe, expect, it } from "vitest";

import {
  requestStudioSpacePose,
  studioSpacePoseBlend,
  STUDIO_SPACE_POSE_TRANSITION_MS,
  type StudioSeatAnchor,
} from "./studio-virtual-space-pose-controller";

const ANCHORS: readonly StudioSeatAnchor[] = [
  { point: { x: 100, y: 100 }, facing: "down", radius: 48 },
];

describe("requestStudioSpacePose", () => {
  it("의자 근처에서 휴식을 요청하면 앉기를 선택한다", () => {
    const result = requestStudioSpacePose({
      current: "stand", request: "rest", position: { x: 120, y: 110 }, moving: false,
      seatAnchors: ANCHORS, openArea: true, now: 1000,
    });
    expect(result.accepted).toBe(true);
    expect(result.pose).toBe("sit");
    expect(result.anchor?.point).toEqual({ x: 100, y: 100 });
    expect(result.transitionStartedAt).toBe(1000);
  });

  it("빈 공간에서 휴식을 요청하면 눕기를 선택한다", () => {
    const result = requestStudioSpacePose({
      current: "stand", request: "rest", position: { x: 500, y: 500 }, moving: false,
      seatAnchors: ANCHORS, openArea: true, now: 2000,
    });
    expect(result.accepted).toBe(true);
    expect(result.pose).toBe("lie");
    expect(result.anchor).toBeNull();
  });

  it("앉을 자리도 없고 빈 공간도 아니면 거부한다", () => {
    const result = requestStudioSpacePose({
      current: "stand", request: "rest", position: { x: 500, y: 500 }, moving: false,
      seatAnchors: ANCHORS, openArea: false, now: 3000,
    });
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe("no-suitable-spot");
    expect(result.pose).toBe("stand");
  });

  it("이동 중에는 자세 변경을 거부한다", () => {
    const result = requestStudioSpacePose({
      current: "stand", request: "rest", position: { x: 120, y: 110 }, moving: true,
      seatAnchors: ANCHORS, openArea: true, now: 4000,
    });
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe("moving");
  });

  it("일어서기는 이동 중이 아니면 항상 허용한다", () => {
    const fromSit = requestStudioSpacePose({
      current: "sit", request: "stand", position: { x: 120, y: 110 }, moving: false,
      seatAnchors: ANCHORS, openArea: true, now: 5000,
    });
    expect(fromSit.accepted).toBe(true);
    expect(fromSit.pose).toBe("stand");

    const already = requestStudioSpacePose({
      current: "stand", request: "stand", position: { x: 0, y: 0 }, moving: false,
      seatAnchors: ANCHORS, openArea: true, now: 5000,
    });
    expect(already.accepted).toBe(false);
    expect(already.reason).toBe("already-standing");
  });

  it("이미 휴식 중인데 휴식을 요청하면 거부한다", () => {
    const result = requestStudioSpacePose({
      current: "lie", request: "rest", position: { x: 500, y: 500 }, moving: false,
      seatAnchors: ANCHORS, openArea: true, now: 6000,
    });
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe("already-resting");
  });
});

describe("studioSpacePoseBlend", () => {
  it("전이 시작 시 0, 종료 시 1을 반환한다", () => {
    expect(studioSpacePoseBlend(1000, 1000)).toBe(0);
    expect(studioSpacePoseBlend(1000, 1000 + STUDIO_SPACE_POSE_TRANSITION_MS)).toBe(1);
    expect(studioSpacePoseBlend(1000, 1000 + STUDIO_SPACE_POSE_TRANSITION_MS + 500)).toBe(1);
  });

  it("중간 진행도는 ease-in-out으로 0~1 사이", () => {
    const mid = studioSpacePoseBlend(0, STUDIO_SPACE_POSE_TRANSITION_MS / 2);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(mid).toBeCloseTo(0.5, 5);
  });

  it("전이 중이 아니면 1", () => {
    expect(studioSpacePoseBlend(null, 9999)).toBe(1);
  });
});
