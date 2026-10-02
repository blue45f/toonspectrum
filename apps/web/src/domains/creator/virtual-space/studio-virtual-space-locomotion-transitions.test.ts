import { describe, expect, it } from "vitest";

import {
  advanceBreathPhase,
  advanceWalkPhase,
  applyCameraDeadzone,
  breathOffset,
  dampPeerOffset,
  legPhase,
  locomotionStartBlend,
  nextLocomotionMode,
  turnLeanAngle,
} from "./studio-virtual-space-locomotion-transitions";

describe("nextLocomotionMode", () => {
  it("idle → walk 전이는 12px/s 경계", () => {
    expect(nextLocomotionMode("idle", 5)).toBe("idle");
    expect(nextLocomotionMode("idle", 12)).toBe("walk");
  });

  it("run 진입/이탈에 히스테리시스가 있다 (떨림 방지)", () => {
    expect(nextLocomotionMode("walk", 150)).toBe("walk"); // 165 미만 진입 불가
    expect(nextLocomotionMode("walk", 165)).toBe("run");
    expect(nextLocomotionMode("run", 150)).toBe("run"); // 140 초과 유지
    expect(nextLocomotionMode("run", 140)).toBe("walk");
    expect(nextLocomotionMode("run", 5)).toBe("idle");
    expect(nextLocomotionMode("walk", 5)).toBe("idle");
  });
});

describe("advanceWalkPhase", () => {
  it("정지하면 위상이 고정된다", () => {
    expect(advanceWalkPhase(0.3, 0, 0.016, 210)).toBe(0.3);
  });

  it("이동하면 위상이 앞으로 진행하고 1을 감싼다", () => {
    const next = advanceWalkPhase(0.9, 120, 0.5, 210);
    expect(next).toBeGreaterThanOrEqual(0);
    expect(next).toBeLessThan(1);
    expect(next).not.toBe(0.9);
  });

  it("두 다리 위상은 0.5 차이", () => {
    expect(legPhase(0.2, "left")).toBeCloseTo(0.2, 8);
    expect(legPhase(0.2, "right")).toBeCloseTo(0.7, 8);
    expect(legPhase(0.8, "right")).toBeCloseTo(0.3, 8);
  });
});

describe("breathOffset", () => {
  it("idle에서만 호흡이 있고 이동 중에는 0", () => {
    expect(breathOffset(0.25, "idle")).not.toBe(0);
    expect(breathOffset(0.25, "walk")).toBe(0);
    expect(breathOffset(0.25, "run")).toBe(0);
  });

  it("호흡 위상은 순환한다", () => {
    expect(advanceBreathPhase(0.9, 0.5)).toBeLessThan(1);
  });
});

describe("applyCameraDeadzone", () => {
  it("데드존 안에서는 카메라 목표가 고정된다", () => {
    const result = applyCameraDeadzone({
      playerX: 100, playerY: 100, cameraTargetX: 90, cameraTargetY: 90, deadzoneRadius: 36,
    });
    expect(result.x).toBe(90);
    expect(result.y).toBe(90);
  });

  it("데드존 밖에서는 초과분만 따라간다", () => {
    const result = applyCameraDeadzone({
      playerX: 200, playerY: 100, cameraTargetX: 100, cameraTargetY: 100, deadzoneRadius: 36,
    });
    expect(result.x).toBe(100 + 64);
    expect(result.y).toBe(100);
  });
});

describe("turnLeanAngle", () => {
  it("각속도가 클수록 기울고, 부호는 회전 방향을 따른다", () => {
    expect(turnLeanAngle(0)).toBe(0);
    const left = turnLeanAngle(-400);
    const right = turnLeanAngle(400);
    expect(left).toBeLessThan(0);
    expect(right).toBeGreaterThan(0);
    expect(Math.abs(left)).toBeLessThanOrEqual(9);
  });
});

describe("dampPeerOffset", () => {
  it("작은 지터는 0, 큰 오프셋은 데드존만큼 줄인다", () => {
    expect(dampPeerOffset(1.5)).toBe(0);
    expect(dampPeerOffset(-1.5)).toBe(0);
    expect(dampPeerOffset(10)).toBe(7.5);
  });
});

describe("locomotionStartBlend", () => {
  it("정지 0, 전속 1", () => {
    expect(locomotionStartBlend(0)).toBe(0);
    expect(locomotionStartBlend(120)).toBe(1);
    expect(locomotionStartBlend(200)).toBe(1);
  });
});
