import { describe, expect, it } from "vitest";

import { StudioMotionEaser, STUDIO_MOTION_START_RAMP_MS } from "./studio-virtual-space-motion-easing";
import { stepFeelVelocityWithSkid } from "./studio-virtual-space-locomotion-feel";
import { DEFAULT_STUDIO_SPACE_PHYSICS_CONFIG } from "./studio-virtual-space-physics";

const CONFIG = DEFAULT_STUDIO_SPACE_PHYSICS_CONFIG;
const MAX = CONFIG.maxSpeed;
const DT = 1 / 60;

function run(easer: StudioMotionEaser, ticks: number, target: { x: number; y: number }, start = { x: 0, y: 0 }) {
  let velocity = { ...start };
  for (let i = 0; i < ticks; i++) velocity = easer.step(velocity, target, DT, CONFIG);
  return velocity;
}

describe("StudioMotionEaser 출발 램프", () => {
  it("정지 후 첫 틱들은 램프 없는 가속보다 느리게 붙는다", () => {
    const eased = new StudioMotionEaser().step({ x: 0, y: 0 }, { x: MAX, y: 0 }, DT, CONFIG);
    const raw = stepFeelVelocityWithSkid({ x: 0, y: 0 }, { x: MAX, y: 0 }, DT, CONFIG);
    expect(eased.x).toBeGreaterThan(0);
    expect(eased.x).toBeLessThan(raw.x);
  });

  it("램프가 끝나면 기존 필 스텝과 같은 최고 속도에 도달한다", () => {
    const velocity = run(new StudioMotionEaser(), 90, { x: MAX, y: 0 });
    expect(velocity.x).toBeCloseTo(MAX, 0);
    expect(velocity.y).toBe(0);
  });

  it("램프 도중 속도는 단조 증가하고 튀지 않는다", () => {
    const easer = new StudioMotionEaser();
    let velocity = { x: 0, y: 0 };
    let previous = 0;
    for (let i = 0; i < 30; i++) {
      velocity = easer.step(velocity, { x: MAX, y: 0 }, DT, CONFIG);
      expect(velocity.x).toBeGreaterThanOrEqual(previous);
      expect(velocity.x).toBeLessThanOrEqual(MAX);
      previous = velocity.x;
    }
  });

  it("램프 시간 상수는 120ms다", () => {
    expect(STUDIO_MOTION_START_RAMP_MS).toBe(120);
  });

  it("정지하면 다음 출발에서 램프가 다시 걸린다", () => {
    const easer = new StudioMotionEaser();
    run(easer, 60, { x: MAX, y: 0 });
    const stopped = run(easer, 90, { x: 0, y: 0 }, { x: MAX, y: 0 });
    expect(Math.hypot(stopped.x, stopped.y)).toBeLessThan(1);
    const again = easer.step(stopped, { x: MAX, y: 0 }, DT, CONFIG);
    const raw = stepFeelVelocityWithSkid(stopped, { x: MAX, y: 0 }, DT, CONFIG);
    expect(again.x).toBeLessThan(raw.x);
  });
});

describe("StudioMotionEaser 방향 반전", () => {
  it("즉시 반전하지 않고 먼저 같은 방향으로 감속한다", () => {
    const easer = new StudioMotionEaser();
    let velocity = { x: 200, y: 0 };
    for (let i = 0; i < 3; i++) {
      velocity = easer.step(velocity, { x: -MAX, y: 0 }, DT, CONFIG);
      expect(velocity.x).toBeGreaterThan(0);
    }
  });

  it("0을 지난 뒤에는 새 방향으로 다시 램프를 타며 가속한다", () => {
    const easer = new StudioMotionEaser();
    let velocity = { x: 200, y: 0 };
    let crossedAt = -1;
    const speeds: number[] = [];
    for (let i = 0; i < 60; i++) {
      velocity = easer.step(velocity, { x: -MAX, y: 0 }, DT, CONFIG);
      speeds.push(velocity.x);
      if (crossedAt < 0 && velocity.x < 0) crossedAt = i;
    }
    expect(crossedAt).toBeGreaterThan(0);
    // 막 넘어간 직후 2틱은 램프 때문에 완만해야 한다 (즉시 풀가속 아님).
    const justCrossed = Math.abs(speeds[crossedAt]!);
    const rawAfterCross = Math.abs(stepFeelVelocityWithSkid(
      { x: speeds[crossedAt - 1]!, y: 0 },
      { x: -MAX, y: 0 },
      DT,
      CONFIG,
    ).x);
    expect(justCrossed).toBeLessThanOrEqual(rawAfterCross + 1);
    // 결국 반대 방향 최고 속도에 도달한다.
    expect(velocity.x).toBeCloseTo(-MAX, 0);
  });
});

describe("StudioMotionEaser 안전장치", () => {
  it("모션 줄이기에서는 램프 없이 기존 스텝과 동일하다", () => {
    const current = { x: 0, y: 0 };
    const target = { x: MAX, y: 0 };
    const eased = new StudioMotionEaser().step(current, target, DT, CONFIG, true);
    expect(eased).toEqual(stepFeelVelocityWithSkid(current, target, DT, CONFIG));
  });

  it("dt 0과 비정상 입력에서도 튀지 않는다", () => {
    const easer = new StudioMotionEaser();
    expect(easer.step({ x: 10, y: 0 }, { x: MAX, y: 0 }, 0, CONFIG)).toEqual({ x: 10, y: 0 });
    const safe = easer.step({ x: Number.NaN, y: 0 }, { x: Number.NaN, y: 0 }, DT, CONFIG);
    expect(Number.isFinite(safe.x)).toBe(true);
    expect(Number.isFinite(safe.y)).toBe(true);
  });

  it("reset 뒤에는 정지 출발과 같은 램프가 걸린다", () => {
    const easer = new StudioMotionEaser();
    run(easer, 60, { x: MAX, y: 0 });
    easer.reset();
    const after = easer.step({ x: 0, y: 0 }, { x: MAX, y: 0 }, DT, CONFIG);
    const fresh = new StudioMotionEaser().step({ x: 0, y: 0 }, { x: MAX, y: 0 }, DT, CONFIG);
    expect(after).toEqual(fresh);
  });
});
