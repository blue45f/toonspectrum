import { describe, expect, it } from "vitest";
import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import {
  createStudioAmbientPatrol,
  stepStudioAmbientPatrol,
  studioAmbientPatrolMode,
  type StudioAmbientPatrolState,
} from "./studio-virtual-space-ambient-patrol";

const ROUTE: readonly StudioVirtualSpacePoint[] = [
  { x: 100, y: 100 },
  { x: 500, y: 100 },
  { x: 500, y: 400 },
];

const NOON = 12.5 / 24;
const NIGHT = 23 / 24;

function createState(): StudioAmbientPatrolState {
  return createStudioAmbientPatrol([
    { id: "guide", species: "npc", route: ROUTE },
    { id: "cat-1", species: "cat", route: ROUTE },
  ]);
}

function step(
  state: StudioAmbientPatrolState,
  nowMs: number,
  overrides: Partial<Parameters<typeof stepStudioAmbientPatrol>[1]> = {},
) {
  return stepStudioAmbientPatrol(state, {
    deltaSeconds: 0.5,
    nowMs,
    obstacles: [],
    players: [],
    weather: "clear",
    timeOfDay: NOON,
    reducedMotion: false,
    ...overrides,
  });
}

describe("createStudioAmbientPatrol", () => {
  it("모든 배우는 집(첫 웨이포인트)에서 출발한다", () => {
    const state = createState();
    expect(state.actors).toHaveLength(2);
    for (const actor of state.actors) {
      expect(actor.wander.physics.position).toEqual({ x: 100, y: 100 });
      expect(actor.mode).toBe("patrol");
    }
  });
});

describe("studioAmbientPatrolMode", () => {
  it("맑은 낮에는 순찰 모드다", () => {
    expect(studioAmbientPatrolMode({ weather: "clear", timeOfDay: NOON, scheduleElapsedMs: 0 })).toBe("patrol");
  });

  it("비가 오면 대피 모드가 되고 대사 키가 붙는다", () => {
    expect(studioAmbientPatrolMode({ weather: "rain", timeOfDay: NOON, scheduleElapsedMs: 0 })).toBe("shelter");
  });

  it("밤이면 휴식 모드다 (대피가 우선)", () => {
    expect(studioAmbientPatrolMode({ weather: null, timeOfDay: NIGHT, scheduleElapsedMs: 0 })).toBe("rest");
    expect(studioAmbientPatrolMode({ weather: "thunderstorm", timeOfDay: NIGHT, scheduleElapsedMs: 0 })).toBe("shelter");
  });
});

describe("stepStudioAmbientPatrol", () => {
  it("순찰 모드에서 다음 웨이포인트를 향해 이동한다", () => {
    let state = createState();
    let lastX = 100;
    for (let index = 0; index < 10; index += 1) {
      const result = step(state, 1000 + index * 500);
      state = result.state;
      lastX = result.poses[0]!.x;
    }
    expect(lastX).toBeGreaterThan(150); // 집을 떠나 두 번째 웨이포인트 방향으로 진행
  });

  it("플레이어 위치는 충돌로 막지 않는다 (비차단)", () => {
    let state = createState();
    // 플레이어가 배우 바로 앞 웨이포인트 근처에 서 있어도 순찰은 계속 간다
    for (let index = 0; index < 40; index += 1) {
      const result = step(state, 1000 + index * 500, {
        players: [{ x: 500, y: 100 }],
      });
      state = result.state;
    }
    const pose = step(state, 21000).poses[0]!;
    // 도착 반경(14) 근처까지 도달했거나 대기 중이다 = 막히지 않았다
    expect(Math.hypot(pose.x - 500, pose.y - 100)).toBeLessThan(120);
  });

  it("비가 오면 대피 모드로 집으로 돌아간다", () => {
    let state = createState();
    // 먼저 멀리 순찰을 보낸다
    for (let index = 0; index < 10; index += 1) state = step(state, 1000 + index * 500).state;
    const away = step(state, 6000).poses[0]!;
    expect(away.x).toBeGreaterThan(150);
    // 비가 오면 집을 향해 되돌아간다
    for (let index = 0; index < 40; index += 1) {
      const result = step(state, 6500 + index * 500, { weather: "rain" });
      state = result.state;
    }
    const sheltered = step(state, 27000, { weather: "rain" }).poses[0]!;
    expect(sheltered.mode).toBe("shelter");
    expect(sheltered.speechKey).toBe("shelter-rain");
    expect(Math.hypot(sheltered.x - 100, sheltered.y - 100)).toBeLessThan(120);
  });

  it("밤이면 휴식 모드라 이동이 집 근처에 머문다", () => {
    let state = createState();
    for (let index = 0; index < 30; index += 1) {
      const result = step(state, 1000 + index * 500, { timeOfDay: NIGHT });
      state = result.state;
    }
    const pose = step(state, 16000, { timeOfDay: NIGHT }).poses[0]!;
    expect(pose.mode).toBe("rest");
    expect(Math.hypot(pose.x - 100, pose.y - 100)).toBeLessThan(60);
  });

  it("reduced-motion이면 배우가 전혀 움직이지 않는다", () => {
    let state = createState();
    for (let index = 0; index < 10; index += 1) {
      state = step(state, 1000 + index * 500, { reducedMotion: true }).state;
    }
    const pose = step(state, 6000, { reducedMotion: true }).poses[0]!;
    expect(pose.x).toBe(100);
    expect(pose.y).toBe(100);
    expect(pose.moving).toBe(false);
  });

  it("새는 NPC보다 같은 시간에 더 멀리 간다", () => {
    let state = createStudioAmbientPatrol([
      { id: "walker", species: "npc", route: ROUTE },
      { id: "sparrow", species: "bird", route: ROUTE },
    ]);
    for (let index = 0; index < 6; index += 1) {
      state = step(state, 1000 + index * 500).state;
    }
    const poses = step(state, 4000).poses;
    const npcDistance = Math.hypot(poses[0]!.x - 100, poses[0]!.y - 100);
    const birdDistance = Math.hypot(poses[1]!.x - 100, poses[1]!.y - 100);
    expect(birdDistance).toBeGreaterThan(npcDistance);
  });

  it("종(species)이 포즈에 그대로 실린다", () => {
    const { poses } = step(createState(), 1000);
    expect(poses.map((pose) => pose.species)).toEqual(["npc", "cat"]);
  });
});
