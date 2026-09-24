import { describe, expect, it } from "vitest";
import { orchestrateStudioSpatialInteraction } from "./studio-virtual-space-interaction-orchestrator";

const interaction = { id: "review-console", zoneId: "review", point: { x: 1, y: 2 }, radius: 48,
  labelKo: "검수 콘솔", labelEn: "Review console", action: "review" as const };
const context = { projectId: "작품 1", productionProjectId: "production/1", interaction };

describe("spatial interaction orchestrator", () => {
  it("keeps primary object intent inside the world-rule consent boundary", () => {
    expect(orchestrateStudioSpatialInteraction("primary", context)).toEqual({ kind: "world-rule", interaction });
  });
  it.each([
    ["work-inbox", "work"], ["sessions", "sessions"], ["board", "board"], ["huddle", "people"],
    ["team-hub", "team"], ["today-board", "today"],
  ] as const)("opens %s as the %s panel without issuing a domain command", (action, panel) => {
    expect(orchestrateStudioSpatialInteraction(action, context)).toEqual({ kind: "panel", panel });
  });
  it("routes production actions with encoded authoritative identities", () => {
    expect(orchestrateStudioSpatialInteraction("quality-control", context)).toEqual({ kind: "route", href: "/production/projects/production%2F1/review" });
    expect(orchestrateStudioSpatialInteraction("release-center", context)).toEqual({ kind: "route", href: "/studio/p/%EC%9E%91%ED%92%88%201/export" });
  });
  it("falls back to the work-owned route when no production aggregate exists", () => {
    expect(orchestrateStudioSpatialInteraction("schedule", { ...context, productionProjectId: null }))
      .toEqual({ kind: "route", href: "/studio/p/%EC%9E%91%ED%92%88%201/production" });
  });
});
