import { describe, expect, it } from "vitest";
import {
  advanceNpcBehavior,
  createNpcBehavior,
  npcBehaviorModeLabel,
  STUDIO_NPC_BEHAVIOR_IDLE_MAX_MS,
  STUDIO_NPC_BEHAVIOR_IDLE_MIN_MS,
  type StudioNpcBehaviorState,
} from "./studio-virtual-space-npc-behavior";

const WAYPOINTS = [
  { x: 200, y: 200 },
  { x: 600, y: 200 },
  { x: 600, y: 600 },
  { x: 200, y: 600 },
];

function step(state: StudioNpcBehaviorState, npcId: string, nowMs: number) {
  return advanceNpcBehavior(state, npcId, {
    obstacles: [],
    others: [],
    deltaSeconds: 1 / 60,
    nowMs,
  });
}

describe("createNpcBehavior", () => {
  it("웨이포인트가 2개 이상이면 patrol로 시작한다", () => {
    const state = createNpcBehavior({ home: { x: 100, y: 100 }, waypoints: WAYPOINTS }, 0);
    expect(state.mode).toBe("patrol");
  });

  it("웨이포인트가 1개면 wander로, 없으면 idle로 시작한다", () => {
    expect(createNpcBehavior({ home: { x: 0, y: 0 }, waypoints: [WAYPOINTS[0]!] }, 0).mode).toBe("wander");
    expect(createNpcBehavior({ home: { x: 0, y: 0 }, waypoints: [] }, 0).mode).toBe("idle");
  });

  it("initialMode를 지정하면 따른다", () => {
    const state = createNpcBehavior({ home: { x: 0, y: 0 }, waypoints: WAYPOINTS, initialMode: "idle" }, 0);
    expect(state.mode).toBe("idle");
  });
});

describe("advanceNpcBehavior", () => {
  it("patrol 중에는 웨이포인트를 향해 이동한다", () => {
    let state = createNpcBehavior({ home: { x: 100, y: 100 }, waypoints: WAYPOINTS }, 0);
    const start = state.wander.physics.position;
    let moved = false;
    for (let ms = 0; ms < 4000; ms += 16) {
      const result = step(state, "npc-behavior", ms);
      state = result.state;
      const dist = Math.hypot(state.wander.physics.position.x - start.x, state.wander.physics.position.y - start.y);
      if (dist > 5) { moved = true; break; }
    }
    expect(moved).toBe(true);
    expect(state.mode).toBe("patrol");
  });

  it("idle 대기 시간이 지나면 다음 행동으로 전이하고 이벤트를 낸다", () => {
    let state = createNpcBehavior({ home: { x: 100, y: 100 }, waypoints: WAYPOINTS, initialMode: "idle" }, 0);
    let transitioned = false;
    let eventSeen = false;
    for (let ms = 0; ms < STUDIO_NPC_BEHAVIOR_IDLE_MAX_MS + 2000; ms += 100) {
      const result = step(state, "npc-idle", ms);
      state = result.state;
      if (result.events.some((event) => event.kind === "npc-behavior-mode-changed")) eventSeen = true;
      if (state.mode !== "idle") { transitioned = true; break; }
    }
    expect(transitioned).toBe(true);
    expect(eventSeen).toBe(true);
    expect(["wander", "patrol"]).toContain(state.mode);
  });

  it("wander는 목표 웨이포인트에 도착하면 idle로 복귀한다", () => {
    const single = [{ x: 300, y: 100 }];
    let state = createNpcBehavior({ home: { x: 100, y: 100 }, waypoints: single, initialMode: "wander" }, 0);
    let returned = false;
    for (let ms = 0; ms < 60000; ms += 16) {
      const result = step(state, "npc-wander", ms);
      state = result.state;
      if (state.mode === "idle" && state.cycle > 0) { returned = true; break; }
    }
    expect(returned).toBe(true);
  });

  it("patrol은 목표 바퀴를 채우면 idle로 복귀한다", () => {
    let state = createNpcBehavior({ home: { x: 200, y: 200 }, waypoints: WAYPOINTS }, 0);
    let returned = false;
    for (let ms = 0; ms < 240000; ms += 16) {
      const result = step(state, "npc-patrol", ms);
      state = result.state;
      if (state.mode === "idle" && state.cycle > 0) { returned = true; break; }
    }
    expect(returned).toBe(true);
  });

  it("웨이포인트가 없으면 idle을 유지한다", () => {
    let state = createNpcBehavior({ home: { x: 50, y: 50 }, waypoints: [] }, 0);
    for (let ms = 0; ms < STUDIO_NPC_BEHAVIOR_IDLE_MAX_MS + 5000; ms += 200) {
      state = step(state, "npc-still", ms).state;
    }
    expect(state.mode).toBe("idle");
  });

  it("idle 대기 시간은 범위 안에 들고 결정적이다", () => {
    const first = createNpcBehavior({ home: { x: 1, y: 2 }, waypoints: [], initialMode: "idle" }, 1000);
    const second = createNpcBehavior({ home: { x: 1, y: 2 }, waypoints: [], initialMode: "idle" }, 1000);
    expect(first.idleUntilMs).toBe(second.idleUntilMs);
    const duration = first.idleUntilMs - 1000;
    expect(duration).toBeGreaterThanOrEqual(STUDIO_NPC_BEHAVIOR_IDLE_MIN_MS);
    expect(duration).toBeLessThanOrEqual(STUDIO_NPC_BEHAVIOR_IDLE_MAX_MS);
  });
});

describe("npcBehaviorModeLabel", () => {
  it("한·영 라벨을 반환한다", () => {
    expect(npcBehaviorModeLabel("idle")).toEqual({ ko: "대기", en: "Idle" });
    expect(npcBehaviorModeLabel("wander")).toEqual({ ko: "배회", en: "Wandering" });
    expect(npcBehaviorModeLabel("patrol")).toEqual({ ko: "순찰", en: "Patrolling" });
  });
});
