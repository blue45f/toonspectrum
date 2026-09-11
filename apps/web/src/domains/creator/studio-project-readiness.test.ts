import { describe, expect, it } from "vitest";

import { evaluateStudioProjectReadiness } from "./studio-project-readiness";

import type { StudioExportPreflightResult } from "./studio-export-preflight";
import type { StudioProductionPipelineReport } from "./studio-production-pipeline";
import type { StudioReviewReadiness } from "./studio-review-workflow";
import type { StudioContinuityReport } from "./studio-story-bible";

const CONTINUITY: StudioContinuityReport = Object.freeze({
  status: "pass",
  blockingCount: 0,
  warningCount: 0,
  issues: [],
});

const PRODUCTION: StudioProductionPipelineReport = Object.freeze({
  valid: true,
  progress: 0.75,
  readyTaskIds: ["lettering"],
  dependencyBlockedTaskIds: [],
  criticalPathTaskIds: ["story", "lineart"],
  issues: [],
  stages: [
    { stage: "story", taskCount: 1, doneCount: 1, blockedCount: 0, progress: 1 },
    { stage: "storyboard", taskCount: 1, doneCount: 1, blockedCount: 0, progress: 1 },
    { stage: "lineart", taskCount: 1, doneCount: 1, blockedCount: 0, progress: 1 },
    { stage: "color", taskCount: 1, doneCount: 0, blockedCount: 0, progress: 0 },
    { stage: "lettering", taskCount: 0, doneCount: 0, blockedCount: 0, progress: 0 },
    { stage: "review", taskCount: 0, doneCount: 0, blockedCount: 0, progress: 0 },
    { stage: "localization", taskCount: 0, doneCount: 0, blockedCount: 0, progress: 0 },
    { stage: "export", taskCount: 0, doneCount: 0, blockedCount: 0, progress: 0 },
  ],
  workloads: [],
});

const REVIEW: StudioReviewReadiness = Object.freeze({
  canApprove: true,
  openChangeRequestCount: 0,
  missingApprovalReviewerIds: [],
  reasons: [],
});

const EXPORT: StudioExportPreflightResult = Object.freeze({
  target: "webtoon-platform",
  policyVersion: "2026-09",
  status: "pass",
  blockingCount: 0,
  warningCount: 0,
  findings: [],
  summaryKo: "준비 완료",
  summaryEn: "Ready",
});

describe("Studio project readiness", () => {
  it("summarizes a healthy project across all six sections", () => {
    const report = evaluateStudioProjectReadiness({
      continuity: CONTINUITY,
      production: PRODUCTION,
      assets: { allowedCount: 12, warningCount: 0, blockedCount: 0 },
      review: REVIEW,
      localization: {
        totalLocales: 2,
        completedLocales: 2,
        blockingIssues: 0,
        warningIssues: 0,
      },
      exports: [EXPORT],
    });
    expect(report.status).toBe("ready");
    expect(report.blockingCount).toBe(0);
    expect(report.sections.map((item) => item.id)).toEqual([
      "story",
      "production",
      "assets",
      "review",
      "localization",
      "export",
    ]);
    expect(report.completion).toBeGreaterThan(0.9);
    expect(report.actions).toEqual([]);
  });

  it("prioritizes blocking story, asset, review, localization and export work", () => {
    const report = evaluateStudioProjectReadiness({
      continuity: { ...CONTINUITY, status: "blocked", blockingCount: 2 },
      production: {
        ...PRODUCTION,
        valid: false,
        progress: 0.2,
        issues: [{
          code: "dependency-cycle",
          severity: "error",
          taskIds: ["a", "b"],
          message: "cycle",
        }],
      },
      assets: { allowedCount: 3, warningCount: 1, blockedCount: 2 },
      review: {
        canApprove: false,
        openChangeRequestCount: 2,
        missingApprovalReviewerIds: ["reviewer"],
        reasons: ["Resolve requests"],
      },
      localization: {
        totalLocales: 3,
        completedLocales: 1,
        blockingIssues: 4,
        warningIssues: 2,
      },
      exports: [{ ...EXPORT, status: "blocked", blockingCount: 3 }],
    });
    expect(report.status).toBe("blocked");
    expect(report.blockingCount).toBeGreaterThanOrEqual(10);
    expect(report.actions.slice(0, 6).every((item) => item.priority === "high")).toBe(true);
    expect(report.actions.map((item) => item.id)).toEqual(expect.arrayContaining([
      "resolve-continuity",
      "repair-production-graph",
      "replace-blocked-assets",
      "resolve-review-requests",
      "fix-localization",
      "resolve-export-preflight",
    ]));
  });

  it("treats missing export target as guidance rather than a destructive error", () => {
    const report = evaluateStudioProjectReadiness({
      continuity: CONTINUITY,
      production: PRODUCTION,
      assets: { allowedCount: 0, warningCount: 0, blockedCount: 0 },
      review: REVIEW,
      localization: {
        totalLocales: 0,
        completedLocales: 0,
        blockingIssues: 0,
        warningIssues: 0,
      },
      exports: [],
    });
    expect(report.status).toBe("warning");
    expect(report.actions).toContainEqual(
      expect.objectContaining({ id: "choose-export-target", priority: "low" }),
    );
  });

  it("rejects impossible localization counts", () => {
    expect(() => evaluateStudioProjectReadiness({
      continuity: CONTINUITY,
      production: PRODUCTION,
      assets: { allowedCount: 0, warningCount: 0, blockedCount: 0 },
      review: REVIEW,
      localization: {
        totalLocales: 1,
        completedLocales: 2,
        blockingIssues: 0,
        warningIssues: 0,
      },
      exports: [],
    })).toThrow("cannot exceed");
  });
});
