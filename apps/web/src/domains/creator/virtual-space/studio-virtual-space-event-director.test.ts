import { describe, expect, it } from "vitest";
import {
  createStudioVirtualSpaceEventDirector,
  type StudioVirtualSpaceEventDirectorInput,
} from "./studio-virtual-space-event-director";

function baseInput(overrides: Partial<StudioVirtualSpaceEventDirectorInput> = {}): StudioVirtualSpaceEventDirectorInput {
  return {
    now: 1_000_000,
    self: { id: "self", position: { x: 780, y: 900 }, speed: 0 },
    peers: [],
    npcs: [],
    interactables: [],
    dayPhase: "day",
    ...overrides,
  };
}

describe("이벤트 디렉터 계약 API", () => {
  it("환영 배너를 한 번만 낸다", () => {
    const director = createStudioVirtualSpaceEventDirector();
    director.update(baseInput());
    const first = director.consumeUiEvents();
    expect(first.some((event) => event.role === "banner" && event.id === "welcome")).toBe(true);

    director.update(baseInput({ now: 2_000_000 }));
    const second = director.consumeUiEvents();
    expect(second.some((event) => event.id === "welcome")).toBe(false);
  });

  it("consumeUiEvents는 큐를 비운다", () => {
    const director = createStudioVirtualSpaceEventDirector();
    director.update(baseInput());
    expect(director.consumeUiEvents().length).toBeGreaterThan(0);
    expect(director.consumeUiEvents()).toEqual([]);
  });

  it("미니게임 존 진입 시 초대 토스트를 낸다", () => {
    const director = createStudioVirtualSpaceEventDirector();
    director.update(baseInput({
      self: { id: "self", position: { x: 0, y: 0 }, speed: 0 }, // 환영 존 밖
      dayPhase: "day",
    }));
    director.consumeUiEvents();
    director.update(baseInput({
      now: 2_000_000,
      self: { id: "self", position: { x: 200, y: 500 }, speed: 0 }, // panel-order 존
    }));
    const events = director.consumeUiEvents();
    const invite = events.find((event) => event.targetId === "panel-order");
    expect(invite?.role).toBe("toast");
    expect(invite?.textKo).toContain("컷 순서 재구성");
    expect(invite?.textEn).toContain("Panel order");
  });

  it("인터랙터블 진입 시 하이라이트를 낸다", () => {
    const director = createStudioVirtualSpaceEventDirector();
    director.update(baseInput({
      self: { id: "self", position: { x: 0, y: 0 }, speed: 0 },
    }));
    director.consumeUiEvents();
    director.update(baseInput({
      now: 2_000_000,
      self: { id: "self", position: { x: 645, y: 715 }, speed: 0 },
      interactables: [
        { id: "lounge-coffee", kind: "coffee-machine", position: { x: 645, y: 715 }, radius: 55 },
      ],
    }));
    const events = director.consumeUiEvents();
    const highlight = events.find((event) => event.role === "highlight");
    expect(highlight?.targetId).toBe("lounge-coffee");
    expect(highlight?.textKo).toContain("커피 머신");
  });

  it("NPC 근접 시 다이얼로그를 낸다 (90초 쿨다운)", () => {
    const director = createStudioVirtualSpaceEventDirector();
    director.update(baseInput({
      self: { id: "self", position: { x: 0, y: 0 }, speed: 0 },
    }));
    director.consumeUiEvents();
    const near = baseInput({
      now: 2_000_000,
      self: { id: "self", position: { x: 100, y: 100 }, speed: 0 },
      npcs: [{ id: "npc-1", name: "미로", position: { x: 120, y: 120 } }],
    });
    director.update(near);
    const events = director.consumeUiEvents();
    const dialogue = events.find((event) => event.role === "dialogue");
    expect(dialogue?.targetId).toBe("npc-1");
    expect(dialogue?.textKo).toContain("미로");

    // 같은 자리에서 다시 update → 쿨다운으로 미발화
    director.update({ ...near, now: 2_010_000 });
    expect(director.consumeUiEvents().filter((event) => event.role === "dialogue")).toEqual([]);
  });

  it("동료 근접 시 토스트를 낸다", () => {
    const director = createStudioVirtualSpaceEventDirector();
    director.update(baseInput({
      self: { id: "self", position: { x: 0, y: 0 }, speed: 0 },
    }));
    director.consumeUiEvents();
    director.update(baseInput({
      now: 2_000_000,
      self: { id: "self", position: { x: 100, y: 100 }, speed: 0 },
      peers: [{ id: "peer-1", name: "지민", position: { x: 150, y: 100 } }],
    }));
    const events = director.consumeUiEvents();
    const toast = events.find((event) => event.targetId === "peer-1");
    expect(toast?.role).toBe("toast");
    expect(toast?.textKo).toContain("지민");
  });

  it("시간대 변경 시 토스트를 낸다", () => {
    const director = createStudioVirtualSpaceEventDirector();
    director.update(baseInput({ self: { id: "self", position: { x: 0, y: 0 }, speed: 0 }, dayPhase: "day" }));
    director.consumeUiEvents();
    director.update(baseInput({ now: 2_000_000, self: { id: "self", position: { x: 0, y: 0 }, speed: 0 }, dayPhase: "night" }));
    const events = director.consumeUiEvents();
    const phase = events.find((event) => event.id.startsWith("phase:"));
    expect(phase?.role).toBe("toast");
    expect(phase?.textKo.length).toBeGreaterThan(0);
    expect(phase?.textEn.length).toBeGreaterThan(0);
  });

  it("모든 UI 이벤트 문구는 ko/en 쌍을 가진다", () => {
    const director = createStudioVirtualSpaceEventDirector();
    director.update(baseInput());
    for (const event of director.consumeUiEvents()) {
      expect(event.textKo.length).toBeGreaterThan(0);
      expect(event.textEn.length).toBeGreaterThan(0);
    }
  });
});
