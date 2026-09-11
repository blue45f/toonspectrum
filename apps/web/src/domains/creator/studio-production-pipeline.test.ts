import { describe, expect, it } from "vitest";

import {
  analyzeStudioProductionPipeline,
  suggestNextStudioProductionTasks,
  type StudioProductionTask,
} from "./studio-production-pipeline";

const TASKS: readonly StudioProductionTask[] = [
  {
    id: "script",
    stage: "story",
    title: "대본",
    status: "done",
    dependencyIds: [],
    assigneeId: "writer",
    estimateHours: 4,
    blockedReason: null,
  },
  {
    id: "storyboard",
    stage: "storyboard",
    title: "콘티",
    status: "backlog",
    dependencyIds: ["script"],
    assigneeId: "artist",
    estimateHours: 8,
    blockedReason: null,
  },
  {
    id: "lineart",
    stage: "lineart",
    title: "선화",
    status: "backlog",
    dependencyIds: ["storyboard"],
    assigneeId: "artist",
    estimateHours: 12,
    blockedReason: null,
  },
  {
    id: "lettering",
    stage: "lettering",
    title: "레터링",
    status: "backlog",
    dependencyIds: ["storyboard"],
    assigneeId: "editor",
    estimateHours: 3,
    blockedReason: null,
  },
];

describe("Studio production pipeline", () => {
  it("calculates readiness, dependency blocking, workload and weighted progress", () => {
    const report = analyzeStudioProductionPipeline(TASKS);
    expect(report.valid).toBe(true);
    expect(report.progress).toBeCloseTo(4 / 27);
    expect(report.readyTaskIds).toEqual(["storyboard"]);
    expect(report.dependencyBlockedTaskIds).toEqual(["lineart", "lettering"]);
    expect(report.workloads[0]).toMatchObject({
      assigneeId: "artist",
      openTaskCount: 2,
      remainingHours: 20,
    });
    expect(report.criticalPathTaskIds).toEqual(["script", "storyboard", "lineart"]);
  });

  it("suggests the earliest ready work without guessing around invalid dependencies", () => {
    expect(suggestNextStudioProductionTasks(TASKS).map((task) => task.id)).toEqual([
      "storyboard",
    ]);
    const invalid = [
      ...TASKS,
      {
        id: "bad",
        stage: "export" as const,
        title: "잘못된 작업",
        status: "backlog" as const,
        dependencyIds: ["missing"],
        assigneeId: null,
        estimateHours: 1,
        blockedReason: null,
      },
    ];
    expect(suggestNextStudioProductionTasks(invalid)).toEqual([]);
  });

  it("detects unknown dependencies and cycles", () => {
    const cyclic: readonly StudioProductionTask[] = [
      {
        id: "a",
        stage: "story",
        title: "A",
        status: "backlog",
        dependencyIds: ["b"],
        assigneeId: null,
        estimateHours: 1,
        blockedReason: null,
      },
      {
        id: "b",
        stage: "storyboard",
        title: "B",
        status: "backlog",
        dependencyIds: ["a", "missing"],
        assigneeId: null,
        estimateHours: 1,
        blockedReason: null,
      },
    ];
    const report = analyzeStudioProductionPipeline(cyclic);
    expect(report.valid).toBe(false);
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "unknown-dependency", severity: "error" }),
      expect.objectContaining({ code: "dependency-cycle", severity: "error" }),
    ]));
    expect(report.criticalPathTaskIds).toEqual([]);
  });

  it("requires an explanation for manually blocked work", () => {
    const report = analyzeStudioProductionPipeline([{
      ...TASKS[1]!,
      status: "blocked",
      blockedReason: "",
    }]);
    expect(report.issues).toContainEqual(
      expect.objectContaining({ code: "blocked-reason", severity: "warning" }),
    );
  });
});
