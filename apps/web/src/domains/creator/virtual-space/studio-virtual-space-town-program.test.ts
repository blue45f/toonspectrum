import { describe, expect, it } from "vitest";

import {
  STUDIO_TOWN_BLUEPRINTS,
  STUDIO_TOWN_MINI_GAMES,
  applyStudioTownBlueprint,
  createStudioSpotlightSession,
  studioRuntimeBudget,
  studioSpotlightAudienceViews,
  studioSpotlightIsMuted,
  studioSpotlightLowerHand,
  studioSpotlightNominateSpeaker,
  studioSpotlightRaiseHand,
  studioSpotlightReleaseSpeaker,
  studioSpotlightSendPriority,
  studioSpotlightSetFullscreenShare,
  studioSpotlightSetPresenter,
  studioTownActiveEvent,
  studioTownCompanionSnapshot,
  studioTownDeskPodForActor,
  studioTownEvents,
  studioTownInterestSnapshot,
  studioTownQuests,
} from "./studio-virtual-space-town-program";
import { DEFAULT_STUDIO_WORLD_MANIFEST } from "./studio-virtual-space-world-manifest";
import type { StudioVirtualOperationsSnapshot } from "./use-studio-virtual-space-operations";
import { studioVirtualDecorationPreset } from "./studio-virtual-space-customization";
import { STUDIO_VIRTUAL_PLACES } from "./studio-virtual-space-place-catalog";
import { studioVirtualPlaceWorldManifest } from "./studio-virtual-space-place-world";
import { studioVirtualDecorationNavigationWorld } from "./studio-virtual-space-decoration-layout";
import { studioWorldCanOccupy } from "./studio-virtual-space-world-pathfinding";

const operations: StudioVirtualOperationsSnapshot = {
  phase: "ready",
  project: null,
  inbox: [
    { bucket: "dueToday", projectId: "work", projectTitle: "Work", taskId: "task-a", taskTitle: "마감 원고", processKey: "draw", status: "in-progress", dueAt: null, estimateHours: 2, episodeId: null },
    { bucket: "review", projectId: "work", projectTitle: "Work", taskId: "task-b", taskTitle: "검수 요청", processKey: "review", status: "review", dueAt: null, estimateHours: 1, episodeId: null },
  ],
  calendar: [],
  error: null,
};

describe("Virtual Studio town program", () => {
  it("turns production context into spatial quests and companion guidance", () => {
    const quests = studioTownQuests(operations, DEFAULT_STUDIO_WORLD_MANIFEST, 2);
    expect(quests.some((quest) => quest.roomId === "review" && quest.progress === 0)).toBe(true);
    expect(studioTownCompanionSnapshot(operations).suggestedRoomId).toBe("review");
  });

  it("owns recurring events, social games and safe blueprints", () => {
    const noon = new Date("2026-09-25T16:10:00+09:00").getTime();
    const events = studioTownEvents(noon);
    expect(events).toHaveLength(5);
    expect(studioTownActiveEvent(new Date("2026-09-25T16:10:00+09:00").getTime())?.kind).toBe("live-drawing");
    expect(STUDIO_TOWN_MINI_GAMES.every((game) => game.players[0] >= 1 && game.players[1] <= 12)).toBe(true);
    expect(STUDIO_TOWN_BLUEPRINTS.every((blueprint) => blueprint.decor.length > 0)).toBe(true);
  });

  it("assigns a stable role-aware personal desk without exposing document content", () => {
    const first = studioTownDeskPodForActor("actor-1", "artist");
    const second = studioTownDeskPodForActor("actor-1", "artist");
    expect(first).toBe(second);
    expect(first.roles).toContain("artist");
    expect(studioTownDeskPodForActor("actor-2", "unknown").id).toMatch(/crew$/u);
  });

  it("limits active simulation by semantic chunks and device budgets", () => {
    const focus = { x: 780, y: 887 };
    const interest = studioTownInterestSnapshot(DEFAULT_STUDIO_WORLD_MANIFEST, focus, [
      { id: "near", point: { x: 800, y: 880 }, kind: "npc" },
      { id: "far", point: { x: 100, y: 100 }, kind: "npc" },
      { id: "critical", point: { x: 100, y: 100 }, kind: "effect", important: true },
    ], 120);
    expect([...interest.activeIds]).toEqual(expect.arrayContaining(["near", "critical"]));
    expect(interest.dormantIds.has("far")).toBe(true);
    expect(studioRuntimeBudget(390, false, 2).maxActiveNpcs).toBe(4);
    expect(studioRuntimeBudget(1400, true, 2).maxParticles).toBe(0);
  });

  it.each(STUDIO_VIRTUAL_PLACES.map((place) => place.id))("%s 독립 장소에서도 모든 업무 블루프린트를 안전하게 배치한다", (id) => {
    const world = studioVirtualPlaceWorldManifest(id, false);
    for (const blueprint of STUDIO_TOWN_BLUEPRINTS) {
      const result = applyStudioTownBlueprint(studioVirtualDecorationPreset("minimal"), world, blueprint);
      expect(result.ok, blueprint.id).toBe(true);
      if (!result.ok) continue;
      expect(result.state.placements).toHaveLength(blueprint.decor.length);
      expect(result.state).toMatchObject({ layoutWidth: world.width, layoutHeight: world.height });
      const navigation = studioVirtualDecorationNavigationWorld(world, result.state);
      for (const spawn of world.spawns) expect(studioWorldCanOccupy(navigation, spawn.point)).toBe(true);
    }
  });

  it("블루프린트 수량이 남은 한도를 넘으면 일부만 추가하지 않는다", () => {
    const world = studioVirtualPlaceWorldManifest("skyport", true);
    const current = { ...studioVirtualDecorationPreset("minimal"), placements: Array.from({ length: 34 }, (_, index) => ({
      id: `rug-${index}`, type: "rug" as const, x: 100, y: 100, rotation: 0 as const, scale: 1,
    })) };
    const blueprint = STUDIO_TOWN_BLUEPRINTS[0];
    expect(blueprint).toBeDefined();
    if (!blueprint) return;
    expect(applyStudioTownBlueprint(current, world, blueprint)).toEqual({ ok: false, reason: "limit" });
    expect(current.placements).toHaveLength(34);
  });
});

describe("StudioTown spotlight broadcast session", () => {
  const roster = [
    { id: "me", displayNameKo: "나", displayNameEn: "Me" },
    { id: "jun", displayNameKo: "준", displayNameEn: "Jun" },
    { id: "sora", displayNameKo: "소라", displayNameEn: "Sora" },
  ] as const;

  it("시작 시 청중을 자동 음소거하고 발표자에게 최우선 송출 순위를 준다", () => {
    const session = createStudioSpotlightSession("event-1", "jun", roster, 1000);
    expect(session.eventId).toBe("event-1");
    expect(session.startedAt).toBe(1000);
    expect(session.mutedBySpotlight).toEqual(["me", "jun", "sora"]);
    expect(studioSpotlightIsMuted(session, "me")).toBe(true);
    expect(studioSpotlightIsMuted(session, "sora")).toBe(true);
    expect(studioSpotlightIsMuted(session, "jun")).toBe(false);
    expect(studioSpotlightSendPriority(session, "jun")).toBe(0);
    expect(studioSpotlightSendPriority(session, "me")).toBe(2);
    expect(session.handQueue).toHaveLength(0);
    expect(session.activeSpeakerId).toBeNull();
    expect(session.fullscreenShare).toBe(false);
  });

  it("발표자를 재지정하면 음소거 규칙과 손들기 큐가 함께 갱신된다", () => {
    let session = createStudioSpotlightSession("event-1", "jun", roster);
    session = studioSpotlightRaiseHand(session, "sora");
    session = studioSpotlightRaiseHand(session, "me");
    session = studioSpotlightSetPresenter(session, "sora");
    expect(session.presenterId).toBe("sora");
    expect(session.handQueue.map((raise) => raise.memberId)).toEqual(["me"]);
    expect(studioSpotlightIsMuted(session, "sora")).toBe(false);
    expect(studioSpotlightIsMuted(session, "jun")).toBe(true);
    expect(studioSpotlightSendPriority(session, "sora")).toBe(0);
    expect(studioSpotlightSetPresenter(session, "sora")).toBe(session);
  });

  it("손들기는 FIFO 큐로 쌓이고 중복·발표자·알 수 없는 참가자는 무시한다", () => {
    const initial = createStudioSpotlightSession("event-1", "jun", roster);
    let session = studioSpotlightRaiseHand(initial, "me", 1100);
    session = studioSpotlightRaiseHand(session, "sora", 1200);
    expect(session.handQueue.map((raise) => raise.memberId)).toEqual(["me", "sora"]);
    expect(session.handQueue[0]?.raisedAt).toBe(1100);
    expect(studioSpotlightRaiseHand(session, "me")).toBe(session);
    expect(studioSpotlightRaiseHand(session, "jun")).toBe(session);
    expect(studioSpotlightRaiseHand(session, "ghost")).toBe(session);
    expect(initial.handQueue).toHaveLength(0);
    const views = studioSpotlightAudienceViews(session);
    expect(views.find((view) => view.member.id === "me")?.handPosition).toBe(1);
    expect(views.find((view) => view.member.id === "sora")?.handPosition).toBe(2);
    expect(views.find((view) => view.member.id === "jun")).toMatchObject({ isPresenter: true, muted: false, handPosition: null, sendPriority: 0 });
  });

  it("지목하면 큐에서 빠지고 음소거가 해제되며, 다음 지목이 이전 발언자를 다시 음소거한다", () => {
    let session = createStudioSpotlightSession("event-1", "jun", roster);
    session = studioSpotlightRaiseHand(session, "me");
    session = studioSpotlightRaiseHand(session, "sora");
    expect(studioSpotlightNominateSpeaker(session, "ghost")).toBe(session);
    session = studioSpotlightNominateSpeaker(session, "me");
    expect(session.activeSpeakerId).toBe("me");
    expect(session.handQueue.map((raise) => raise.memberId)).toEqual(["sora"]);
    expect(studioSpotlightIsMuted(session, "me")).toBe(false);
    expect(studioSpotlightSendPriority(session, "me")).toBe(1);
    session = studioSpotlightNominateSpeaker(session, "sora");
    expect(session.activeSpeakerId).toBe("sora");
    expect(studioSpotlightIsMuted(session, "me")).toBe(true);
    expect(studioSpotlightIsMuted(session, "sora")).toBe(false);
    session = studioSpotlightReleaseSpeaker(session);
    expect(session.activeSpeakerId).toBeNull();
    expect(studioSpotlightIsMuted(session, "sora")).toBe(true);
    expect(studioSpotlightReleaseSpeaker(session)).toBe(session);
  });

  it("손 내리기는 큐에서만 제거하고 전체화면 토글은 의도 상태만 바꾼다", () => {
    let session = createStudioSpotlightSession("event-1", "jun", roster);
    session = studioSpotlightRaiseHand(session, "me");
    session = studioSpotlightLowerHand(session, "me");
    expect(session.handQueue).toHaveLength(0);
    expect(studioSpotlightLowerHand(session, "me")).toBe(session);
    expect(studioSpotlightSetFullscreenShare(session, true).fullscreenShare).toBe(true);
    session = studioSpotlightSetFullscreenShare(session, true);
    expect(studioSpotlightSetFullscreenShare(session, true)).toBe(session);
    expect(studioSpotlightSetFullscreenShare(session, false).fullscreenShare).toBe(false);
  });
});
