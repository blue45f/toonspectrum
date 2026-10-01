import { describe, expect, it } from "vitest";

import {
  buildStudioMotionRequest,
  neutralStudioMotionRequest,
  type StudioMotionRequest,
} from "./studio-virtual-space-motion-api";

describe("neutralStudioMotionRequest", () => {
  it("중립 요청은 서 있기 상태", () => {
    const request = neutralStudioMotionRequest();
    expect(request.pose).toBe("stand");
    expect(request.locomotionMode).toBe("idle");
    expect(request.speed).toBe(0);
    expect(request.ghost).toBe(false);
  });
});

describe("buildStudioMotionRequest", () => {
  it("트랙3 이동 상태를 그대로 옮긴다", () => {
    const request = buildStudioMotionRequest({
      pose: "sit", locomotionMode: "walk", speed: 120, facing: "left",
      walkPhase: 0.3, poseBlend: 0.8, squashX: 1.05, squashY: 0.95,
      leanDegrees: 4, breathOffset: 1.2, ghost: false,
    });
    expect(request.pose).toBe("sit");
    expect(request.speed).toBe(120);
    expect(request.squash).toEqual({ x: 1.05, y: 0.95 });
  });

  it("비정상 값은 클램프/정규화된다", () => {
    const request = buildStudioMotionRequest({
      pose: "lie", locomotionMode: "run", speed: Number.NaN, facing: "up",
      walkPhase: 1.7, poseBlend: 5, squashX: Number.NaN, squashY: -1,
      leanDegrees: Number.NaN, breathOffset: Number.NaN, ghost: true,
    });
    expect(request.speed).toBe(0);
    expect(request.walkPhase).toBeCloseTo(0.7, 8);
    expect(request.poseBlend).toBe(1);
    expect(request.squash.x).toBe(1);
    expect(request.squash.y).toBe(0.5);
    expect(request.ghost).toBe(true);
  });

  it("StudioMotionRenderer 계약을 만족하는 스텁이 동작한다", () => {
    const received: StudioMotionRequest[] = [];
    const renderer = {
      applyMotion: (request: StudioMotionRequest) => { received.push(request); },
      getPosition: () => ({ x: 10, y: 20 }),
      isDestroyed: () => false,
    };
    renderer.applyMotion(neutralStudioMotionRequest());
    expect(received).toHaveLength(1);
    expect(renderer.getPosition()).toEqual({ x: 10, y: 20 });
  });
});
