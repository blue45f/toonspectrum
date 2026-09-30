import { describe, expect, it, afterEach } from "vitest";

import { verifyPlanningSnapshot, verifyScopePackageIntegrity } from "@toonstudio/core/production";

import { createProductionDemoProject, PRODUCTION_DEMO_ANCHOR_AT } from "./production-demo";
import {
  openProductionDemoSession,
  productionDemoAdapter,
  productionDemoDayOffset,
  rebaseProductionDemoTimeline,
  resetProductionDemoSession,
} from "./production-demo-adapter";

const DAY_MS = 86_400_000;

afterEach(() => resetProductionDemoSession());

describe("production demo timeline", () => {
  it("counts whole calendar days from the sample anchor to today", () => {
    expect(productionDemoDayOffset(new Date(PRODUCTION_DEMO_ANCHOR_AT))).toBe(0);
    expect(productionDemoDayOffset(new Date("2026-09-30T02:00:00.000Z"))).toBe(15);
    expect(productionDemoDayOffset(new Date("2026-09-10T23:59:00.000Z"))).toBe(-5);
  });

  it("moves every timestamp by the same days so the designed story stays intact", () => {
    const original = createProductionDemoProject();
    const rebased = rebaseProductionDemoTimeline(original, new Date("2026-09-30T02:00:00.000Z"));
    const shift = 15 * DAY_MS;
    const task = original.tasks.find((entry) => entry.id === "task-episode-12-thumbnail");
    const moved = rebased.tasks.find((entry) => entry.id === "task-episode-12-thumbnail");
    expect(task?.dueAt).toBeTruthy();
    expect(Date.parse(moved?.dueAt ?? "") - Date.parse(task?.dueAt ?? "")).toBe(shift);
    expect(Date.parse(rebased.updatedAt) - Date.parse(original.updatedAt)).toBe(shift);
    // id·제목 같은 문자열은 그대로다.
    expect(rebased.tasks.map((entry) => entry.id)).toEqual(original.tasks.map((entry) => entry.id));
    expect(rebased.title).toBe(original.title);
  });

  it("re-issues dated immutable records so their checksums stay valid", () => {
    const rebased = rebaseProductionDemoTimeline(createProductionDemoProject(), new Date("2026-10-20T00:00:00.000Z"));
    expect(rebased.scopePackages.length).toBeGreaterThan(0);
    expect(rebased.scopePackages.every(verifyScopePackageIntegrity)).toBe(true);
    expect(rebased.planningSnapshots.every(verifyPlanningSnapshot)).toBe(true);
  });

  it("returns the same aggregate when today is the anchor day", () => {
    const original = createProductionDemoProject();
    expect(rebaseProductionDemoTimeline(original, new Date(PRODUCTION_DEMO_ANCHOR_AT))).toBe(original);
  });
});

describe("production demo session", () => {
  it("keeps sample changes across pages until it is reset", () => {
    const first = productionDemoAdapter.create();
    expect(productionDemoAdapter.create()).toBe(first);
    const thread = first.clarifications.find((entry) => entry.blocking && entry.status === "open");
    expect(thread).toBeTruthy();
    if (!thread) return;
    const next = productionDemoAdapter.reduce(first, {
      type: "upsert-clarification",
      clarification: { ...thread, status: "decision-recorded", answer: "예시 답변", updatedAt: first.updatedAt },
    });
    expect(openProductionDemoSession()).toBe(next);
    resetProductionDemoSession();
    const fresh = openProductionDemoSession();
    expect(fresh).not.toBe(next);
    expect(fresh.clarifications.find((entry) => entry.id === thread.id)?.status).toBe("open");
  });
});
