import { describe, it, expect } from "vitest";

import {
  initPhysicsState,
  stepBalloonPhysics,
  relaxBalloonLayout,
  stepDragSpring,
  stepReturnSpring,
  elasticTailPath,
  wobbleFromVelocity,
  type PhysicsBalloon,
} from "./studio-bubble-physics";

const balloon = (over: Partial<PhysicsBalloon> = {}): PhysicsBalloon => ({
  id: "b1",
  x: 100,
  y: 100,
  w: 120,
  h: 60,
  ...over,
});

describe("initPhysicsState", () => {
  it("속도 0으로 초기화한다", () => {
    const states = initPhysicsState([balloon()]);
    expect(states).toHaveLength(1);
    expect(states[0].vx).toBe(0);
    expect(states[0].vy).toBe(0);
    expect(states[0].x).toBe(100);
  });
});

describe("stepBalloonPhysics — 반발", () => {
  it("겹친 말풍선은 서로 밀어낸다", () => {
    const states = initPhysicsState([
      balloon({ id: "a", x: 100, y: 100 }),
      balloon({ id: "b", x: 150, y: 100 }),
    ]);
    const next = stepBalloonPhysics(states);
    // a는 왼쪽으로, b는 오른쪽으로 밀려난다.
    expect(next[0].x).toBeLessThan(100);
    expect(next[1].x).toBeGreaterThan(150);
  });

  it("멀리 떨어진 말풍선은 반발하지 않는다", () => {
    const states = initPhysicsState([
      balloon({ id: "a", x: 0, y: 0, anchorX: 60, anchorY: 30 }),
      balloon({ id: "b", x: 1000, y: 1000, anchorX: 1060, anchorY: 1030 }),
    ]);
    const next = stepBalloonPhysics(states, { anchorStiffness: 0 });
    expect(next[0].x).toBe(0);
    expect(next[1].x).toBe(1000);
  });
});

describe("stepBalloonPhysics — 앵커 스프링", () => {
  it("앵커가 있으면 앵커 쪽으로 끌려간다", () => {
    const states = initPhysicsState([
      balloon({ anchorX: 500, anchorY: 500 }),
    ]);
    const next = stepBalloonPhysics(states);
    expect(next[0].x).toBeGreaterThan(100);
    expect(next[0].y).toBeGreaterThan(100);
  });

  it("pinned 말풍선은 움직이지 않는다", () => {
    const states = initPhysicsState([
      balloon({ pinned: true, anchorX: 500, anchorY: 500 }),
      balloon({ id: "b2", x: 105, y: 100, w: 120, h: 60 }),
    ]);
    const next = stepBalloonPhysics(states);
    expect(next[0].x).toBe(100);
    expect(next[0].y).toBe(100);
    expect(next[0].vx).toBe(0);
  });
});

describe("relaxBalloonLayout", () => {
  it("겹침을 해소하고 수렴한다", () => {
    const result = relaxBalloonLayout([
      balloon({ id: "a", x: 100, y: 100 }),
      balloon({ id: "b", x: 140, y: 100 }),
      balloon({ id: "c", x: 180, y: 100 }),
    ]);
    // 수렴 후에는 서로 충분히 떨어져 있다.
    const centers = result.map((s) => s.x + s.w / 2);
    const minGap = Math.min(
      Math.abs(centers[1] - centers[0]),
      Math.abs(centers[2] - centers[1])
    );
    expect(minGap).toBeGreaterThan(60);
  });

  it("단일 말풍선은 앵커 쪽으로 수렴한다", () => {
    const result = relaxBalloonLayout([
      balloon({ anchorX: 400, anchorY: 300 }),
    ]);
    const cx = result[0].x + result[0].w / 2;
    const cy = result[0].y + result[0].h / 2;
    // 시작 중심 (160, 130)에서 앵커 (400, 300) 쪽으로 크게 이동했다.
    // (스프링은 점근 수렴이라 완전히 닿지는 않는다.)
    expect(Math.abs(cx - 400)).toBeLessThan(160);
    expect(Math.abs(cy - 300)).toBeLessThan(130);
    expect(cx).toBeGreaterThan(160);
    expect(cy).toBeGreaterThan(130);
  });
});

describe("stepDragSpring", () => {
  it("목표점을 향해 다가간다", () => {
    let s = { x: 0, y: 0, vx: 0, vy: 0, targetX: 100, targetY: 0 };
    for (let i = 0; i < 60; i++) s = stepDragSpring(s);
    expect(s.x).toBeGreaterThan(90);
    expect(Math.abs(s.x - 100)).toBeLessThan(5);
  });
});

describe("stepReturnSpring", () => {
  it("드래그 해제 후 원래 위치로 돌아간다", () => {
    let s = { x: 200, y: 150, vx: 0, vy: 0, targetX: 200, targetY: 150 };
    for (let i = 0; i < 120; i++) s = stepReturnSpring(s, 100, 100);
    expect(Math.abs(s.x - 100)).toBeLessThan(5);
    expect(Math.abs(s.y - 100)).toBeLessThan(5);
  });
});

describe("elasticTailPath", () => {
  it("유효한 SVG path를 만든다", () => {
    const d = elasticTailPath({
      baseX: 0,
      baseY: 0,
      tipX: 100,
      tipY: 50,
      bend: 0,
      wobble: 0,
    });
    expect(d.startsWith("M 0 0 C")).toBe(true);
    expect(d.endsWith("100 50")).toBe(true);
  });

  it("wobble이 크면 곡선이 달라진다", () => {
    const calm = elasticTailPath({
      baseX: 0, baseY: 0, tipX: 100, tipY: 0, bend: 0, wobble: 0,
    });
    const wobbly = elasticTailPath({
      baseX: 0, baseY: 0, tipX: 100, tipY: 0, bend: 0, wobble: 1,
    });
    expect(calm).not.toBe(wobbly);
  });

  it("같은 입력이면 같은 path (결정적)", () => {
    const spec = {
      baseX: 10, baseY: 20, tipX: 90, tipY: 80, bend: 0.5, wobble: 0.3,
    };
    expect(elasticTailPath(spec)).toBe(elasticTailPath(spec));
  });
});

describe("wobbleFromVelocity", () => {
  it("정지 상태면 0이다", () => {
    expect(wobbleFromVelocity(0, 0)).toBe(0);
  });

  it("빠를수록 커지고 1을 넘지 않는다", () => {
    const slow = wobbleFromVelocity(3, 4); // speed 5
    const fast = wobbleFromVelocity(300, 400);
    expect(slow).toBeGreaterThan(0);
    expect(slow).toBeLessThan(fast);
    expect(fast).toBe(1);
  });
});
