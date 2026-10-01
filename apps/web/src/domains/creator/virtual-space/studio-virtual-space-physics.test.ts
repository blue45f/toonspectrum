import { describe, expect, it } from "vitest";
import {
  DEFAULT_STUDIO_SPACE_PHYSICS_CONFIG,
  followCamera,
  resolveCharacterCollision,
  resolveObstacleCollision,
  slideStudioSpaceMotion,
  snapCamera,
  stepSpacePhysics,
  stepVelocity,
  targetVelocity,
} from "./studio-virtual-space-physics";

describe("targetVelocity", () => {
  it("입력 없음 → 속도 0", () => {
    expect(targetVelocity({ x: 0, y: 0 }, 210)).toEqual({ x: 0, y: 0 });
  });

  it("대각선 입력도 최대 속도를 넘지 않는다 (정규화)", () => {
    const v = targetVelocity({ x: 1, y: 1 }, 210);
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(210, 5);
  });

  it("단일 축 입력은 최대 속도다", () => {
    const v = targetVelocity({ x: 1, y: 0 }, 210);
    expect(v.x).toBeCloseTo(210, 5);
    expect(v.y).toBeCloseTo(0, 5);
  });
});

describe("stepVelocity", () => {
  it("가속도로 목표 속도에 접근한다", () => {
    const v = stepVelocity(
      { x: 0, y: 0 },
      { x: 210, y: 0 },
      0.016,
      DEFAULT_STUDIO_SPACE_PHYSICS_CONFIG,
    );
    // 1600 * 0.016 = 25.6
    expect(v.x).toBeCloseTo(25.6, 1);
  });

  it("즉시 정지하지 않고 감속한다 (관성)", () => {
    const v = stepVelocity(
      { x: 210, y: 0 },
      { x: 0, y: 0 },
      0.016,
      DEFAULT_STUDIO_SPACE_PHYSICS_CONFIG,
    );
    // 2200 * 0.016 = 35.2 감속
    expect(v.x).toBeCloseTo(210 - 35.2, 1);
    expect(v.x).toBeGreaterThan(0);
  });
});

describe("resolveObstacleCollision", () => {
  it("원 장애물 밖으로 밀어낸다", () => {
    const result = resolveObstacleCollision(
      { x: 100, y: 100 },
      [{ kind: "circle", x: 100, y: 100, radius: 50 }],
      16,
    );
    // 중심에서 반경 66 (50+16) 만큼 밀려나야 한다
    expect(Math.hypot(result.x - 100, result.y - 100)).toBeCloseTo(66, 5);
  });

  it("장애물 밖에서는 그대로다", () => {
    const result = resolveObstacleCollision(
      { x: 200, y: 200 },
      [{ kind: "circle", x: 100, y: 100, radius: 50 }],
      16,
    );
    expect(result.x).toBe(200);
    expect(result.y).toBe(200);
  });

  it("사각형 장애물 밖으로 밀어낸다", () => {
    const result = resolveObstacleCollision(
      { x: 100, y: 100 },
      [{ kind: "rect", x: 80, y: 80, width: 40, height: 40 }],
      16,
    );
    // 캐릭터 반경 16을 고려한 확장 사각형(64,64,72,72) 밖으로 밀려나야 한다
    const outside = result.x <= 64 || result.x >= 136 || result.y <= 64 || result.y >= 136;
    expect(outside).toBe(true);
  });
});

describe("resolveCharacterCollision", () => {
  it("겹치는 캐릭터를 밀어낸다", () => {
    const result = resolveCharacterCollision(
      { x: 100, y: 100 },
      [{ x: 110, y: 100 }],
      16,
    );
    // 최소 거리 32, 현재 거리 10 → 11만큼 밀려나야 한다
    expect(Math.hypot(result.x - 110, result.y - 100)).toBeGreaterThan(10);
  });

  it("충분히 떨어져 있으면 그대로다", () => {
    const result = resolveCharacterCollision(
      { x: 100, y: 100 },
      [{ x: 200, y: 200 }],
      16,
    );
    expect(result.x).toBe(100);
    expect(result.y).toBe(100);
  });
});

describe("stepSpacePhysics", () => {
  it("월드 경계를 넘지 않는다", () => {
    const state = stepSpacePhysics(
      { position: { x: 1270, y: 950 }, velocity: { x: 210, y: 210 } },
      { x: 1, y: 1 },
      1,
      [],
      [],
    );
    expect(state.position.x).toBeLessThanOrEqual(1280 - 20);
    expect(state.position.y).toBeLessThanOrEqual(960 - 20);
  });

  it("장애물을 통과하지 않는다", () => {
    const state = stepSpacePhysics(
      { position: { x: 50, y: 100 }, velocity: { x: 0, y: 0 } },
      { x: 1, y: 0 },
      0.5,
      [{ kind: "circle", x: 120, y: 100, radius: 30 }],
      [],
    );
    // 장애물(반경 30+16=46) 중심에서 46 이상 떨어져 있어야 한다
    expect(Math.hypot(state.position.x - 120, state.position.y - 100)).toBeGreaterThanOrEqual(45);
  });
});

describe("followCamera", () => {
  it("타겟을 향해 부드럽게 이동한다", () => {
    const camera = followCamera({ x: 0, y: 0 }, { x: 100, y: 100 }, 0.016, 5);
    expect(camera.x).toBeGreaterThan(0);
    expect(camera.x).toBeLessThan(100);
  });

  it("시간이 지나면 타겟에 수렴한다", () => {
    let camera = { x: 0, y: 0 };
    for (let i = 0; i < 100; i++) {
      camera = followCamera(camera, { x: 500, y: 500 }, 0.016, 5);
    }
    expect(camera.x).toBeCloseTo(500, 0);
    expect(camera.y).toBeCloseTo(500, 0);
  });
});

describe("snapCamera", () => {
  it("즉시 이동한다", () => {
    const camera = snapCamera({ x: 300, y: 400 });
    expect(camera.x).toBe(300);
    expect(camera.y).toBe(400);
  });
});

describe("slideStudioSpaceMotion", () => {
  it("막힘 없이 대각선으로 이동한다", () => {
    const result = slideStudioSpaceMotion({ x: 100, y: 100 }, { x: 10, y: 10 }, [], 16);
    expect(result.position.x).toBeCloseTo(110, 5);
    expect(result.position.y).toBeCloseTo(110, 5);
    expect(result.blockedX).toBe(false);
    expect(result.blockedY).toBe(false);
  });

  it("수직 벽에 대각선으로 부딪히면 벽을 따라 미끄러진다", () => {
    const obstacles = [{ kind: "rect", x: 120, y: 0, width: 10, height: 400 }] as const;
    const result = slideStudioSpaceMotion({ x: 100, y: 100 }, { x: 30, y: 20 }, obstacles, 16);
    // X는 벽에 막히고 Y는 이동한다
    expect(result.position.x).toBeLessThan(120 - 16 + 0.01);
    expect(result.position.y).toBeCloseTo(120, 1);
    expect(result.blockedX).toBe(true);
    expect(result.blockedY).toBe(false);
  });

  it("모서리에 완전히 끼면 제자리다", () => {
    // 아래와 오른쪽에 벽이 있어 대각선 이동이 완전히 막힌 모서리
    const obstacles = [
      { kind: "rect", x: 0, y: 116, width: 400, height: 10 },
      { kind: "rect", x: 116, y: 0, width: 10, height: 400 },
    ] as const;
    const result = slideStudioSpaceMotion({ x: 99, y: 99 }, { x: 30, y: 30 }, obstacles, 16);
    expect(result.position.x).toBeCloseTo(99, 5);
    expect(result.position.y).toBeCloseTo(99, 5);
    expect(result.blockedX).toBe(true);
    expect(result.blockedY).toBe(true);
  });

  it("이동량이 0이면 그대로다", () => {
    const result = slideStudioSpaceMotion({ x: 100, y: 100 }, { x: 0, y: 0 }, [], 16);
    expect(result.position).toEqual({ x: 100, y: 100 });
  });
});
