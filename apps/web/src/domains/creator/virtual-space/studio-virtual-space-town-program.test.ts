import { describe, expect, it } from "vitest";

import {
  STUDIO_TOWN_BLUEPRINTS,
  STUDIO_TOWN_MINI_GAMES,
  studioRuntimeBudget,
  studioTownActiveEvent,
  studioTownCompanionSnapshot,
  studioTownDeskPodForActor,
  studioTownEvents,
  studioTownInterestSnapshot,
  studioTownQuests,
} from "./studio-virtual-space-town-program";
import { DEFAULT_STUDIO_WORLD_MANIFEST } from "./studio-virtual-space-world-manifest";
import type { StudioVirtualOperationsSnapshot } from "./use-studio-virtual-space-operations";

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
});
