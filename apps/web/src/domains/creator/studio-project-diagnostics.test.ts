import { describe, expect, it } from "vitest";

import {
  diagnoseStudioProject,
  validateStudioProjectDiagnosticSource,
  type StudioProjectDiagnosticSource,
} from "./studio-project-diagnostics";

const CAPTURED_AT = "2026-09-11T00:00:00.000Z";

function source(): StudioProjectDiagnosticSource {
  return {
    schemaVersion: 1,
    projectId: "project-1",
    capturedAt: CAPTURED_AT,
    story: {
      bible: {
        projectId: "project-1",
        characters: [{
          id: "hero",
          name: "해나",
          aliases: [],
          defaultCostumeId: "uniform",
          defaultAppearanceId: "default",
        }],
        locations: [{ id: "school", name: "학교" }],
        facts: [],
      },
      states: [{
        sceneId: "scene-1",
        sequence: 1,
        characterId: "hero",
        costumeId: "uniform",
        appearanceId: "default",
        injuryIds: [],
        propIds: [],
        knownFactIds: [],
        locationId: "school",
      }],
      transitions: [],
    },
    productionTasks: [{
      id: "story",
      stage: "story",
      title: "대본",
      status: "done",
      dependencyIds: [],
      assigneeId: "writer",
      estimateHours: 4,
      blockedReason: null,
    }],
    assets: [{ id: "font", status: "allowed" }],
    reviewSession: {
      documentId: "document-1",
      versionId: "v1",
      basedOnVersionId: null,
      status: "approved",
      requiredReviewerIds: [],
      threads: [],
      decisions: [],
      submittedAt: CAPTURED_AT,
      approvedAt: CAPTURED_AT,
      updatedAt: CAPTURED_AT,
    },
    localization: [{
      locale: "ko",
      status: "complete",
      blockingIssueCount: 0,
      warningIssueCount: 0,
    }],
    exportPreflights: [{
      target: "webtoon-platform",
      policyVersion: "2026-09",
      status: "pass",
      blockingCount: 0,
      warningCount: 0,
      findings: [],
      summaryKo: "준비 완료",
      summaryEn: "Ready",
    }],
  };
}

describe("Studio project diagnostics", () => {
  it("composes story, production, assets, review, localization and export into readiness", () => {
    const result = diagnoseStudioProject(source());
    expect(result).toMatchObject({
      projectId: "project-1",
      capturedAt: CAPTURED_AT,
      status: "ready",
      report: {
        status: "ready",
        blockingCount: 0,
        warningCount: 0,
      },
      findings: [],
    });
    expect(result.report.sections.map((section) => section.id)).toEqual([
      "story",
      "production",
      "assets",
      "review",
      "localization",
      "export",
    ]);
  });

  it("turns domain failures into actionable diagnostic findings", () => {
    const input = source();
    const result = diagnoseStudioProject({
      ...input,
      story: {
        ...input.story,
        states: [
          input.story.states[0]!,
          {
            ...input.story.states[0]!,
            sceneId: "scene-2",
            sequence: 2,
            injuryIds: [],
            knownFactIds: [],
            costumeId: "changed",
            locationId: null,
          },
        ],
      },
      productionTasks: [{
        ...input.productionTasks[0]!,
        status: "blocked",
        blockedReason: "",
      }],
      assets: [{ id: "font", status: "blocked" }],
      localization: [{
        locale: "en",
        status: "blocked",
        blockingIssueCount: 2,
        warningIssueCount: 0,
      }],
      exportPreflights: [{
        ...input.exportPreflights[0]!,
        status: "blocked",
        blockingCount: 1,
      }],
    });
    expect(result.status).toBe("blocked");
    expect(result.findings.map((finding) => finding.code)).toEqual(expect.arrayContaining([
      "continuity:costume-change",
      "production:blocked-reason",
      "asset:blocked",
      "localization:blocked",
      "export:blocked",
    ]));
  });

  it("rejects cross-project story data, duplicate locales and contradictory locale states", () => {
    const input = source();
    const findings = validateStudioProjectDiagnosticSource({
      ...input,
      story: {
        ...input.story,
        bible: { ...input.story.bible, projectId: "another-project" },
      },
      localization: [
        { locale: "en", status: "complete", blockingIssueCount: 1, warningIssueCount: 0 },
        { locale: "EN", status: "review", blockingIssueCount: 0, warningIssueCount: 1 },
      ],
    });
    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "story-project-mismatch", severity: "error" }),
      expect.objectContaining({ code: "localization-locale", severity: "error" }),
      expect.objectContaining({ code: "localization-status", severity: "error" }),
    ]));
    expect(() => diagnoseStudioProject({
      ...input,
      story: {
        ...input.story,
        bible: { ...input.story.bible, projectId: "another-project" },
      },
    })).toThrow("valid Studio project diagnostic source");
  });
});
