import { describe, expect, it } from "vitest";
import {
  bounceVelocity,
  collisionShake,
  easeInOutCubic,
  easeOutCubic,
  facingAngleFromVelocity,
  LOCOMOTION_PRECISION_SPEED,
  LOCOMOTION_SHARP_TURN_RADIANS,
  locomotionSquashStretch,
  shortestAngleDelta,
  stepFacingAngle,
  stepFeelVelocity,
  turnSlowdownFactor,
} from "./studio-virtual-space-locomotion-feel";

describe("이징 커브", () => {
  it("ease-out은 초반에 빠르게 오른다", () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(0.25)).toBeGreaterThan(0.25);
  });

  it("ease-in-out은 양 끝이 완만하다", () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 10);
    expect(easeInOutCubic(0.1)).toBeLessThan(0.1);
    expect(easeInOutCubic(0.9)).toBeGreaterThan(0.9);
  });
});

describe("가속/감속 커브 스텝", () => {
  it("정지 상태에서 목표 속도를 향해 가속한다", () => {
    let velocity = { x: 0, y: 0 };
    const target = { x: 210, y: 0 };
    for (let i = 0; i < 120; i += 1) {
      velocity = stepFeelVelocity(velocity, target, 1 / 60);
    }
    expect(velocity.x).toBeCloseTo(210, 0);
  });

  it("감속은 목표 0에서 부드럽게 멈춘다", () => {
    let velocity = { x: 210, y: 0 };
    for (let i = 0; i < 120; i += 1) {
      velocity = stepFeelVelocity(velocity, { x: 0, y: 0 }, 1 / 60);
    }
    expect(Math.hypot(velocity.x, velocity.y)).toBeLessThan(0.5);
  });

  it("역방향 입력이면 감속 경로를 탄다", () => {
    const reversed = stepFeelVelocity({ x: 210, y: 0 }, { x: -210, y: 0 }, 1 / 60);
    expect(reversed.x).toBeLessThan(210);
    expect(reversed.x).toBeGreaterThan(-210);
  });

  it("저속 정밀 구간에서는 목표를 거의 즉시 따라간다", () => {
    const stepped = stepFeelVelocity(
      { x: 0, y: 0 },
      { x: LOCOMOTION_PRECISION_SPEED / 2, y: 0 },
      1 / 60,
    );
    // 1프레임에 목표의 절반 이상을 따라간다 (관성 물리보다 훨씬 빠름)
    expect(stepped.x).toBeGreaterThan(LOCOMOTION_PRECISION_SPEED / 4);
  });

  it("dt 0이면 그대로 반환한다", () => {
    const current = { x: 50, y: 30 };
    expect(stepFeelVelocity(current, { x: 210, y: 0 }, 0)).toBe(current);
  });
});

describe("각도 보간", () => {
  it("최단 호로 회전한다 (역방향은 -π 기준)", () => {
    expect(shortestAngleDelta(0, Math.PI)).toBeCloseTo(Math.PI, 10);
    expect(shortestAngleDelta(0, -Math.PI)).toBeCloseTo(Math.PI, 10);
    expect(shortestAngleDelta(Math.PI * 0.9, -Math.PI * 0.9)).toBeCloseTo(Math.PI * 0.2, 10);
  });

  it("속도 벡터에서 바라보는 각도를 구한다", () => {
    expect(facingAngleFromVelocity({ x: 100, y: 0 }, 0)).toBeCloseTo(0, 10);
    expect(facingAngleFromVelocity({ x: 0, y: 100 }, 0)).toBeCloseTo(Math.PI / 2, 10);
    expect(facingAngleFromVelocity({ x: 0, y: 0 }, 1.2)).toBe(1.2);
  });

  it("급회전은 느리게, 완만하면 빠르게 돈다", () => {
    const sharp = stepFacingAngle(0, Math.PI, 1 / 60, 210);
    const gentle = stepFacingAngle(0, 0.2, 1 / 60, 210);
    expect(sharp).toBeGreaterThan(0);
    expect(sharp).toBeLessThan(Math.PI);
    expect(gentle).toBeCloseTo(0.2, 5);
  });

  it("급회전 임계값 상수를 노출한다", () => {
    expect(LOCOMOTION_SHARP_TURN_RADIANS).toBeCloseTo(Math.PI * 0.75, 10);
  });

  it("급회전 시 감속 계수가 1보다 작다", () => {
    expect(turnSlowdownFactor(0)).toBe(1);
    expect(turnSlowdownFactor(Math.PI / 2)).toBeLessThan(1);
    expect(turnSlowdownFactor(Math.PI)).toBeCloseTo(0.45, 2);
  });
});

describe("스쿼시 & 스트레치", () => {
  it("정지 상태에서는 변형이 없다", () => {
    expect(locomotionSquashStretch(0, 210, false)).toEqual({ scaleX: 1, scaleY: 1 });
  });

  it("최대 속도에서는 가로로 늘어나고 세로로 찌그러진다", () => {
    const { scaleX, scaleY } = locomotionSquashStretch(210, 210, false);
    expect(scaleX).toBeCloseTo(1.09, 2);
    expect(scaleY).toBeCloseTo(0.93, 2);
  });

  it("reduced-motion에서는 항상 1이다", () => {
    expect(locomotionSquashStretch(210, 210, true)).toEqual({ scaleX: 1, scaleY: 1 });
  });
});

describe("충돌 반발", () => {
  it("벽 법선 기준으로 속도를 반사한다", () => {
    const bounced = bounceVelocity({ x: 100, y: 0 }, { x: -1, y: 0 }, 0.5);
    expect(bounced.x).toBeCloseTo(-50, 5);
    expect(bounced.y).toBeCloseTo(0, 5);
  });

  it("접선 성분은 마찰로 줄어든다", () => {
    const bounced = bounceVelocity({ x: 100, y: 100 }, { x: -1, y: 0 }, 0.35);
    expect(bounced.y).toBeCloseTo(85, 5);
  });

  it("이미 벽에서 멀어지는 중이면 그대로 둔다", () => {
    const velocity = { x: -50, y: 0 };
    expect(bounceVelocity(velocity, { x: -1, y: 0 })).toBe(velocity);
  });

  it("법선이 0이면 그대로 둔다", () => {
    const velocity = { x: 50, y: 0 };
    expect(bounceVelocity(velocity, { x: 0, y: 0 })).toBe(velocity);
  });
});

describe("충돌 화면 흔들림", () => {
  it("가벼운 접촉에는 흔들리지 않는다", () => {
    expect(collisionShake(30, 210, false)).toEqual({ intensity: 0, durationMs: 0 });
  });

  it("세게 부딪힐수록 흔들림이 강해진다", () => {
    const weak = collisionShake(100, 210, false);
    const strong = collisionShake(210, 210, false);
    expect(weak.intensity).toBeGreaterThan(0);
    expect(strong.intensity).toBeGreaterThan(weak.intensity);
    expect(strong.intensity).toBeLessThanOrEqual(1);
    expect(strong.durationMs).toBeGreaterThan(weak.durationMs);
  });

  it("reduced-motion에서는 흔들리지 않는다", () => {
    expect(collisionShake(210, 210, true)).toEqual({ intensity: 0, durationMs: 0 });
  });
});
