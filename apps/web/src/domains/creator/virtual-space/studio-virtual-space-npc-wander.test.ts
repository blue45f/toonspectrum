import { describe, expect, it } from "vitest";
import {
  advanceNpcWander,
  createNpcWanderState,
  STUDIO_NPC_WANDER_ARRIVE_RADIUS,
} from "./studio-virtual-space-npc-wander";

const WAYPOINTS = [
  { x: 100, y: 100 },
  { x: 300, y: 100 },
  { x: 300, y: 300 },
];

function step(state: ReturnType<typeof createNpcWanderState>, nowMs: number, waypoints = WAYPOINTS) {
  return advanceNpcWander(state, "npc-test", {
    waypoints,
    obstacles: [],
    others: [],
    deltaSeconds: 1 / 60,
    nowMs,
  });
}

describe("advanceNpcWander", () => {
  it("웨이포인트를 향해 이동한다", () => {
    let state = createNpcWanderState({ x: 200, y: 200 });
    const start = state.physics.position;
    let moved = false;
    for (let ms = 0; ms < 3000; ms += 16) {
      const next = step(state, ms);
      const dist = Math.hypot(next.physics.position.x - start.x, next.physics.position.y - start.y);
      if (dist > 5) moved = true;
      state = next;
      if (state.status === "waiting") break;
    }
    expect(moved).toBe(true);
  });

  it("도착하면 대기했다가 다음 웨이포인트로 이동한다", () => {
    let state = createNpcWanderState({ x: 100, y: 100 });
    let waited = false;
    let advanced = false;
    for (let ms = 0; ms < 30000; ms += 16) {
      state = step(state, ms);
      if (state.status === "waiting") waited = true;
      if (waited && state.status === "to-waypoint" && state.waypointIndex === 1) {
        advanced = true;
        break;
      }
    }
    expect(waited).toBe(true);
    expect(advanced).toBe(true);
  });

  it("웨이포인트가 없으면 그 자리에 선다", () => {
    let state = createNpcWanderState({ x: 50, y: 50 });
    for (let ms = 0; ms < 1000; ms += 16) {
      state = step(state, ms, []);
    }
    expect(state.status).toBe("idle");
    expect(state.moving).toBe(false);
    expect(state.physics.position.x).toBeCloseTo(50, 1);
  });

  it("장애물에 막히면 우회 목표를 잡는다", () => {
    const blocked = [{ kind: "rect" as const, x: 90, y: 60, width: 220, height: 80 }];
    let state = createNpcWanderState({ x: 100, y: 100 });
    let detoured = false;
    for (let ms = 0; ms < 20000; ms += 16) {
      state = advanceNpcWander(state, "npc-test", {
        waypoints: WAYPOINTS,
        obstacles: blocked,
        others: [],
        deltaSeconds: 1 / 60,
        nowMs: ms,
      });
      if (state.detour !== null) {
        detoured = true;
        break;
      }
    }
    expect(detoured).toBe(true);
  });

  it("이동 중에는 facing이 이동 방향을 따라간다", () => {
    // (100,300)에서 첫 웨이포인트 (100,100)로 → 정면 위쪽으로 이동
    let state = createNpcWanderState({ x: 100, y: 300 });
    for (let ms = 0; ms < 2000; ms += 16) {
      state = step(state, ms);
      if (state.moving) break;
    }
    expect(state.moving).toBe(true);
    expect(state.facing).toBe("up");
  });

  it("같은 시드에서는 같은 대기 시간을 가진다 (결정적)", () => {
    const run = () => {
      let state = createNpcWanderState({ x: 100, y: 100 });
      for (let ms = 0; ms < 60000; ms += 16) {
        state = step(state, ms);
        if (state.status === "waiting") return state.waitUntilMs;
      }
      return -1;
    };
    expect(run()).toBe(run());
    expect(run()).toBeGreaterThan(0);
  });

  it("도착 반경 안에 있으면 바로 대기로 전환한다", () => {
    const near = { x: 100 + STUDIO_NPC_WANDER_ARRIVE_RADIUS - 1, y: 100 };
    let state = createNpcWanderState(near);
    state = step(state, 0);
    expect(state.status).toBe("waiting");
  });
});
