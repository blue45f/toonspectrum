import { describe, expect, it } from "vitest";

import { studioVirtualCampusManifest } from "./studio-virtual-space-campus-world";
import { DEFAULT_STUDIO_VIRTUAL_GAME_FEEL, type StudioVirtualGameFeelPreference } from "./studio-virtual-space-game-feel-preference";
import { DEFAULT_STUDIO_WORLD_MANIFEST, studioWorldInteractions } from "./studio-virtual-space-world-manifest";
import {
  STUDIO_WORLD_FEEL_ESCAPE_MS,
  STUDIO_WORLD_FEEL_EVENT_INTERVAL_MS,
  STUDIO_WORLD_FEEL_GREETING_MS,
  StudioWorldEventFeed,
  StudioWorldFeelController,
  studioWorldEventDirectorOptions,
} from "./studio-virtual-space-world-feel";
import type { StudioSpaceUiEvent } from "./studio-virtual-space-engine-events";

function preference(overrides: Partial<StudioVirtualGameFeelPreference> = {}): () => StudioVirtualGameFeelPreference {
  return () => ({ ...DEFAULT_STUDIO_VIRTUAL_GAME_FEEL, ...overrides });
}

describe("월드 게임필 조율기", () => {
  it("입력 감도는 방향을 유지한 채 크기만 바꾸고 1을 넘지 않는다", () => {
    const controller = new StudioWorldFeelController(preference({ inputSensitivity: 1.5 }));
    const small = controller.shapeInput(0.3, 0.4, 0);
    expect(Math.hypot(small.x, small.y)).toBeCloseTo(0.75, 5);
    expect(small.x / small.y).toBeCloseTo(0.75, 5);
    const full = controller.shapeInput(1, 0, 0);
    expect(full.x).toBeCloseTo(1, 5);
    expect(new StudioWorldFeelController(preference({ accelerationScale: 3 })).accelerationFactor).toBe(2);
  });

  it("벽에 비비면 직각 방향으로 잠깐 밀어 주고 입력을 떼면 샘플을 버린다", () => {
    const controller = new StudioWorldFeelController(preference());
    let stuck = false;
    for (let index = 0; index < 12 && !stuck; index += 1) {
      stuck = controller.sampleStuck(100, 200, 1, 0, true, false, index * 50, true);
    }
    expect(stuck).toBe(true);
    const nudged = controller.shapeInput(1, 0, 400);
    expect(nudged.y).toBeCloseTo(0.9, 5);
    expect(controller.shapeInput(1, 0, 400 + STUDIO_WORLD_FEEL_ESCAPE_MS + 60).y).toBe(0);
    expect(controller.sampleStuck(100, 200, 0, 0, false, false, 900, false)).toBe(false);
  });

  it("빠르게 부딪혀 멈추면 흔들고, 설정이나 모션 줄이기에서는 흔들지 않는다", () => {
    const controller = new StudioWorldFeelController(preference());
    controller.refresh(0, false);
    controller.noteImpact(false, 280, 1_000);
    expect(controller.noteImpact(true, 20, 1_016)).toBe(true);
    controller.noteImpact(false, 280, 1_100);
    expect(controller.noteImpact(true, 20, 1_116)).toBe(false);
    const calm = new StudioWorldFeelController(preference({ screenShake: false }));
    calm.refresh(0, false);
    calm.noteImpact(false, 280, 1_000);
    expect(calm.noteImpact(true, 20, 1_016)).toBe(false);
    const reduced = new StudioWorldFeelController(preference());
    reduced.refresh(0, true);
    reduced.noteImpact(false, 280, 1_000);
    expect(reduced.noteImpact(true, 20, 1_016)).toBe(false);
    expect(reduced.effective.particleDensity).toBe(0);
  });
});

describe("월드별 이벤트 디렉터 트리거", () => {
  it("기본 오피스 월드는 디렉터 기본값, 캠퍼스는 로비 스폰 환영과 오락기 미니게임을 쓴다", () => {
    expect(studioWorldEventDirectorOptions(DEFAULT_STUDIO_WORLD_MANIFEST, studioWorldInteractions(DEFAULT_STUDIO_WORLD_MANIFEST))).toEqual({});
    const campus = studioVirtualCampusManifest(false);
    const options = studioWorldEventDirectorOptions(campus, studioWorldInteractions(campus));
    const lobby = campus.spawns.find((spawn) => spawn.id === "main")?.point;
    expect(options.welcome?.center).toEqual(lobby);
    expect(options.miniGameZones?.length).toBe(4);
    expect(options.miniGameZones?.every((zone) => zone.center.y > 1500)).toBe(true);
  });

  it("간격마다 돌려 동료 접근·NPC 인사·오브젝트 라벨을 넘기고 인사 대사를 말풍선용으로 남긴다", () => {
    const campus = studioVirtualCampusManifest(false);
    const events: StudioSpaceUiEvent[] = [];
    const feed = new StudioWorldEventFeed(campus, studioWorldInteractions(campus), (event) => events.push(event));
    const counter = studioWorldInteractions(campus).find((interaction) => interaction.id.includes("cafe-counter"))!;
    expect(feed.due(1_000)).toBe(true);
    feed.begin(1_000, "me", counter.point.x, counter.point.y + 10, 0, "day");
    feed.addPeer("peer-1", "하늘", counter.point.x + 40, counter.point.y + 10);
    feed.addNpc("campus-cafe", "NPC · 바리스타", counter.point.x, counter.point.y + 30);
    feed.run();
    expect(feed.due(1_000 + STUDIO_WORLD_FEEL_EVENT_INTERVAL_MS - 1)).toBe(false);
    expect(events.some((event) => event.kind === "toast" && event.titleKo.includes("하늘") && event.targetId === "peer-1")).toBe(true);
    expect(events.some((event) => event.kind === "highlight" && event.titleKo.includes(counter.labelKo))).toBe(true);
    const dialogue = events.find((event) => event.kind === "dialogue");
    expect(dialogue?.targetId).toBe("campus-cafe");
    const line = feed.greeting("campus-cafe", 1_100);
    expect(line?.ko.length).toBeGreaterThan(0);
    expect(line?.ko.startsWith("NPC")).toBe(false);
    expect(feed.greeting("campus-cafe", 1_000 + STUDIO_WORLD_FEEL_GREETING_MS + 1)).toBeNull();
  });
});
