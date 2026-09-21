import { describe, expect, it } from "vitest";
import { productionLocalDay, productionSmartMatches, type ProductionSmartFilter } from "./studio-production-smart-views";
import { productionChecklistState } from "./studio-production-checklist";
import type { ProductionTask } from "./studio-production-workspace-runtime";

const task: ProductionTask = { id: "t", title: "선화 수정", owner: "미배정", due: "2026-09-21", progress: 0, status: "todo" };
const filter: ProductionSmartFilter = { view: "all", query: "", stage: "all", actorId: "actor", today: "2026-09-21" };
const matches = (change: Partial<ProductionTask>, view: ProductionSmartFilter["view"], options: Partial<ProductionSmartFilter> = {}) =>
  productionSmartMatches({ ...task, ...change }, { ...filter, view, ...options }, new Map([["finished", { ...task, status: "done" }]]));
describe("derived task views", () => {
  it("uses exact assignee IDs, not a matching display name", () => {
    expect(matches({ owner: "actor" }, "mine")).toBe(false);
    expect(matches({ assigneeIds: ["actor"] }, "mine")).toBe(true);
    expect(matches({ assigneeIds: ["actor"], status: "done" }, "mine")).toBe(false);
    expect(matches({ assigneeIds: ["actor"] }, "mine", { actorId: null })).toBe(false);
  });
  it("distinguishes missing deadlines and finished tasks from due work", () => {
    expect(matches({}, "due")).toBe(true);
    for (const due of ["", "2026-02-30", "not-a-date", "2026-09-22"]) expect(matches({ due }, "due")).toBe(false);
    expect(matches({ status: "done" }, "due")).toBe(false);
    expect(productionLocalDay(new Date(2026, 8, 21, 1))).toBe("2026-09-21");
  });
  it("surfaces missing or unfinished prerequisites without mutating status", () => {
    expect(matches({ dependencyIds: ["missing"] }, "blocked")).toBe(true);
    expect(matches({ dependencyIds: ["finished"] }, "blocked")).toBe(false);
    expect(matches({ status: "blocked" }, "blocked")).toBe(true);
    expect(task.status).toBe("todo");
  });
  it("searches saved values and filters the canonical stage", () => {
    expect(matches({}, "all", { query: "선화" })).toBe(true);
    expect(matches({ stage: "lineart" }, "all", { stage: "script" })).toBe(false);
    expect(matches({ owner: "작가" }, "unassigned")).toBe(false);
    expect(matches({}, "unassigned")).toBe(true);
  });
});
describe("truthful operational checklist", () => {
  it("does not show an unloaded or empty workspace as approved or ready", () => {
    expect(productionChecklistState({ tasks: [], reviews: [] }, false)).toEqual({ state: "unavailable", unfinishedTasks: null, requiredReviews: null });
    expect(productionChecklistState({ tasks: [], reviews: [] }, true).state).toBe("empty");
  });
  it("requires finished tasks and resolved required review items", () => {
    expect(productionChecklistState({ tasks: [task], reviews: [] }, true).state).toBe("pending");
    const tasks = [{ ...task, status: "done" as const }];
    const reviews = [{ id: "r", title: "확인", assignee: "PD", severity: "minor" as const, status: "open" as const, approvalRequired: true }];
    expect(productionChecklistState({ tasks, reviews }, true).state).toBe("pending");
    expect(productionChecklistState({ tasks, reviews: [{ ...reviews[0]!, status: "resolved" }] }, true).state).toBe("clear");
  });
});

describe("role-assignment identity", () => {
  it("resolves current role IDs and legacy user IDs without comparing display names", () => {
    const roles = [{ id: "role-artist", memberId: "actor" }, { id: "actor", memberId: "another-user" }];
    expect(productionSmartMatches({ ...task, assigneeIds: ["role-artist"] }, { ...filter, view: "mine" }, new Map(), roles)).toBe(true);
    expect(productionSmartMatches({ ...task, assigneeIds: ["actor"] }, { ...filter, view: "mine" }, new Map(), roles)).toBe(false);
    expect(productionSmartMatches({ ...task, assigneeIds: ["role-artist"] }, { ...filter, view: "mine" }, new Map(), [roles[0]!, roles[0]!])).toBe(false);
  });
});
