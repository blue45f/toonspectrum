import { describe, expect, it } from "vitest";
import {
  createDoorSwingState,
  createSitAnimation,
  doorSlamIntensity,
  doorSwingAngleDegrees,
  objectTouchScalePulse,
  objectWobbleActive,
  objectWobbleOffset,
  sitDownOffsetPx,
  sitPhaseProgress,
  startObjectWobble,
  stepDoorSwing,
  stepSitAnimation,
  STUDIO_SIT_APPROACH_SLACK,
  STUDIO_SIT_DOWN_MS,
  STUDIO_SIT_FACING_SLACK,
} from "./studio-virtual-space-object-feel";

describe("문짝 스윙 물리", () => {
  it("목표 비율을 향해 스프링으로 따라간다", () => {
    let swing = createDoorSwingState(0);
    for (let i = 0; i < 120; i += 1) {
      swing = stepDoorSwing(swing, 1, 1 / 60, false);
    }
    expect(swing.ratio).toBeCloseTo(1, 2);
  });

  it("관성 때문에 오버슈트(튕김)가 생긴다", () => {
    let swing = createDoorSwingState(0);
    let maxRatio = 0;
    for (let i = 0; i < 120; i += 1) {
      swing = stepDoorSwing(swing, 1, 1 / 60, false);
      maxRatio = Math.max(maxRatio, swing.ratio);
    }
    expect(maxRatio).toBeGreaterThan(1);
  });

  it("각도로 변환하면 0~95도 범위를 쓴다", () => {
    expect(doorSwingAngleDegrees(createDoorSwingState(0))).toBe(0);
    expect(doorSwingAngleDegrees(createDoorSwingState(1))).toBe(95);
  });

  it("reduced-motion이면 즉시 목표값으로 스냅한다", () => {
    const snapped = stepDoorSwing(createDoorSwingState(0), 1, 1 / 60, true);
    expect(snapped.ratio).toBe(1);
    expect(snapped.velocity).toBe(0);
  });

  it("쾅 닫히면 슬램 강도가 난다", () => {
    // 빠른 속도로 0에 도달한 상태 시뮬레이션
    const slam = doorSlamIntensity({ ratio: 0.02, velocity: -2.5 });
    expect(slam).toBeGreaterThan(0.5);
    expect(doorSlamIntensity({ ratio: 0.5, velocity: -2.5 })).toBe(0);
  });
});

describe("앉기 애니메이션 페이즈", () => {
  const step = (state: ReturnType<typeof createSitAnimation>, overrides: Partial<{
    distanceToApproach: number; facingDeltaRadians: number; deltaMs: number; reducedMotion: boolean;
  }> = {}) => stepSitAnimation(state, {
    distanceToApproach: 100,
    facingDeltaRadians: 1,
    deltaMs: 16,
    reducedMotion: false,
    ...overrides,
  });

  it("approach → turn → sit → seated 순서로 전이한다", () => {
    let state = createSitAnimation();
    expect(state.phase).toBe("approach");
    // 접근 완료
    state = step(state, { distanceToApproach: STUDIO_SIT_APPROACH_SLACK });
    expect(state.phase).toBe("turn");
    // 회전 완료
    state = step(state, { distanceToApproach: 0, facingDeltaRadians: STUDIO_SIT_FACING_SLACK });
    expect(state.phase).toBe("sit");
    // sit 소요 시간 경과
    for (let i = 0; i < 60; i += 1) {
      state = step(state, { distanceToApproach: 0, facingDeltaRadians: 0, deltaMs: STUDIO_SIT_DOWN_MS / 30 });
    }
    expect(state.phase).toBe("seated");
  });

  it("접근 전에는 approach에 머문다", () => {
    const state = step(createSitAnimation(), { distanceToApproach: 50 });
    expect(state.phase).toBe("approach");
  });

  it("reduced-motion이면 즉시 seated다", () => {
    const state = step(createSitAnimation(), { reducedMotion: true });
    expect(state.phase).toBe("seated");
  });

  it("sit 페이즈 진행률은 0~1이다", () => {
    let state = createSitAnimation();
    state = step(state, { distanceToApproach: 0 });
    state = step(state, { facingDeltaRadians: 0 });
    expect(state.phase).toBe("sit");
    expect(sitPhaseProgress(state)).toBeGreaterThanOrEqual(0);
    state = step(state, { deltaMs: STUDIO_SIT_DOWN_MS });
    expect(state.phase).toBe("seated");
    expect(sitPhaseProgress(state)).toBe(1);
  });

  it("착석 오프셋은 내려앉았다가 살짝 튀어오른다", () => {
    let state = createSitAnimation();
    state = step(state, { distanceToApproach: 0 });
    state = step(state, { facingDeltaRadians: 0, deltaMs: 200 });
    expect(state.phase).toBe("sit");
    state = step(state, { deltaMs: 200, distanceToApproach: 0, facingDeltaRadians: 0 });
    const mid = sitDownOffsetPx(state, false);
    expect(mid).toBeGreaterThan(0);
    const end = sitDownOffsetPx(step(state, { deltaMs: STUDIO_SIT_DOWN_MS }), false);
    expect(end).toBeCloseTo(14, 0);
    expect(sitDownOffsetPx(state, true)).toBe(0);
  });
});

describe("오브젝트 터치 흔들림", () => {
  it("시작 후 감쇠 진동을 그리며 수명으로 끝난다", () => {
    const wobble = startObjectWobble(0.8, 1000);
    expect(objectWobbleActive(wobble, 1200)).toBe(true);
    expect(objectWobbleActive(wobble, 5000)).toBe(false);
    const early = Math.abs(objectWobbleOffset(wobble, 1010, false));
    const late = Math.abs(objectWobbleOffset(wobble, 1500, false));
    expect(early).toBeGreaterThan(0);
    expect(late).toBeLessThan(early);
  });

  it("강도가 클수록 진폭이 크다", () => {
    const weak = startObjectWobble(0.1, 0);
    const strong = startObjectWobble(1, 0);
    expect(strong.amplitudePx).toBeGreaterThan(weak.amplitudePx);
  });

  it("수명 전후는 오프셋 0이다", () => {
    const wobble = startObjectWobble(0.8, 1000);
    expect(objectWobbleOffset(wobble, 900, false)).toBe(0);
    expect(objectWobbleOffset(wobble, 5000, false)).toBe(0);
  });

  it("reduced-motion이면 항상 0이다", () => {
    const wobble = startObjectWobble(1, 1000);
    expect(objectWobbleOffset(wobble, 1010, true)).toBe(0);
  });
});

describe("터치 스케일 펄스", () => {
  it("누르는 순간 눌렸다가 튀어오른다", () => {
    const pressed = objectTouchScalePulse(45, false);
    expect(pressed).toBeLessThan(1);
    const released = objectTouchScalePulse(200, false);
    expect(released).toBeGreaterThan(0.94);
    expect(objectTouchScalePulse(500, false)).toBe(1);
  });

  it("reduced-motion이면 항상 1이다", () => {
    expect(objectTouchScalePulse(45, true)).toBe(1);
  });
});
