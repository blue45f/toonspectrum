import { describe, expect, it } from "vitest";
import {
  createStudioAfterimageState,
  createStudioLandingPuffState,
  createStudioSkidDustState,
  stepStudioLandingPuff,
  stepStudioRunAfterimage,
  stepStudioSkidDust,
} from "./studio-virtual-space-movement-particles";

describe("달리기 잔상", () => {
  it("최고속 근처에서 잔상을 낸다", () => {
    const state = createStudioAfterimageState();
    const { state: next, requests } = stepStudioRunAfterimage(state, {
      position: { x: 100, y: 100 },
      facing: "right",
      speed: 300,
      maxSpeed: 340,
      now: 1000,
      reducedMotion: false,
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].x).toBe(100);
    expect(requests[0].facing).toBe("right");
    expect(requests[0].alpha).toBeGreaterThan(0);
    // 간격 안에는 다시 안 낸다
    const second = stepStudioRunAfterimage(next, {
      position: { x: 110, y: 100 },
      facing: "right",
      speed: 300,
      maxSpeed: 340,
      now: 1050,
      reducedMotion: false,
    });
    expect(second.requests).toHaveLength(0);
    // 간격 뒤에는 다시 낸다
    const third = stepStudioRunAfterimage(next, {
      position: { x: 120, y: 100 },
      facing: "right",
      speed: 300,
      maxSpeed: 340,
      now: 1100,
      reducedMotion: false,
    });
    expect(third.requests).toHaveLength(1);
  });

  it("느리게 걸으면 잔상이 없다", () => {
    const { requests } = stepStudioRunAfterimage(createStudioAfterimageState(), {
      position: { x: 100, y: 100 },
      facing: "right",
      speed: 100,
      maxSpeed: 340,
      now: 1000,
      reducedMotion: false,
    });
    expect(requests).toHaveLength(0);
  });

  it("reduced-motion이면 잔상이 없다", () => {
    const { requests } = stepStudioRunAfterimage(createStudioAfterimageState(), {
      position: { x: 100, y: 100 },
      facing: "right",
      speed: 340,
      maxSpeed: 340,
      now: 1000,
      reducedMotion: true,
    });
    expect(requests).toHaveLength(0);
  });
});

describe("급정지 퍼프", () => {
  it("고속에서 급정지하면 퍼프가 난다", () => {
    const state = createStudioLandingPuffState();
    const fast = stepStudioLandingPuff(state, {
      position: { x: 100, y: 100 }, speed: 300, reducedMotion: false,
    });
    expect(fast.request).toBeNull();
    const stopped = stepStudioLandingPuff(fast.state, {
      position: { x: 120, y: 100 }, speed: 20, reducedMotion: false,
    });
    expect(stopped.request).not.toBeNull();
    expect(stopped.request?.count).toBeGreaterThan(0);
    expect(stopped.request?.x).toBe(120);
  });

  it("천천히 멈추면 퍼프가 없다", () => {
    const state = createStudioLandingPuffState();
    const walking = stepStudioLandingPuff(state, {
      position: { x: 100, y: 100 }, speed: 150, reducedMotion: false,
    });
    const stopped = stepStudioLandingPuff(walking.state, {
      position: { x: 110, y: 100 }, speed: 10, reducedMotion: false,
    });
    expect(stopped.request).toBeNull();
  });

  it("reduced-motion이면 퍼프가 없다", () => {
    const state = createStudioLandingPuffState();
    const fast = stepStudioLandingPuff(state, {
      position: { x: 100, y: 100 }, speed: 300, reducedMotion: false,
    });
    const stopped = stepStudioLandingPuff(fast.state, {
      position: { x: 120, y: 100 }, speed: 20, reducedMotion: true,
    });
    expect(stopped.request).toBeNull();
  });
});

describe("스키드 먼지", () => {
  it("미끄러짐이 강하면 누적 끝에 먼지가 난다", () => {
    let state = createStudioSkidDustState();
    let total = 0;
    for (let i = 0; i < 10; i += 1) {
      const result = stepStudioSkidDust(state, {
        skidIntensity: 0.8, speed: 250, deltaSeconds: 1 / 60, reducedMotion: false,
      });
      state = result.state;
      total += result.request.count;
    }
    // 초당 약 30개 → 10프레임이면 4~5개
    expect(total).toBeGreaterThan(0);
  });

  it("미끄러짐이 약하거나 정지하면 먼지가 없다", () => {
    const state = createStudioSkidDustState();
    expect(stepStudioSkidDust(state, {
      skidIntensity: 0.1, speed: 250, deltaSeconds: 1 / 60, reducedMotion: false,
    }).request.count).toBe(0);
    expect(stepStudioSkidDust(state, {
      skidIntensity: 0.8, speed: 10, deltaSeconds: 1 / 60, reducedMotion: false,
    }).request.count).toBe(0);
  });

  it("reduced-motion이면 먼지가 없다", () => {
    const { request } = stepStudioSkidDust(createStudioSkidDustState(), {
      skidIntensity: 1, speed: 300, deltaSeconds: 1 / 60, reducedMotion: true,
    });
    expect(request.count).toBe(0);
  });
});
