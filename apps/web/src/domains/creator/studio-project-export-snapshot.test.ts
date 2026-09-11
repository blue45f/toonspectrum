import { describe, expect, it } from "vitest";

import { createInitialStudioProjectDiagnosticSource } from "./studio-project-diagnostic-source-defaults";
import {
  createStudioProjectExportSnapshot,
  recommendedStudioExportDraft,
} from "./studio-project-export-snapshot";

function projectState() {
  const initial = createInitialStudioProjectDiagnosticSource(
    "project-12",
    "2026-09-11T03:00:00.000Z",
  );
  return {
    ...initial,
    assets: [
      { id: "asset-ok", status: "allowed" as const },
      { id: "asset-review", status: "warning" as const },
      { id: "asset-blocked", status: "blocked" as const },
    ],
    localization: [
      { locale: "en-US", status: "blocked" as const, blockingIssueCount: 2, warningIssueCount: 1 },
    ],
    reviewSession: {
      ...initial.reviewSession,
      threads: [{
        id: "thread-1",
        kind: "comment" as const,
        targetId: "cut-34",
        status: "open" as const,
        messages: [{
          id: "message-1",
          authorId: "reviewer",
          body: "확인 필요",
          createdAt: "2026-09-11T03:01:00.000Z",
        }],
        resolvedBy: null,
        resolvedAt: null,
      }],
    },
  };
}

describe("project export snapshot", () => {
  it("uses destination defaults and splits long webtoon output at policy boundaries", () => {
    const draft = recommendedStudioExportDraft("project-12", "webtoon-platform");
    const snapshot = createStudioProjectExportSnapshot(projectState(), draft);

    expect(draft.width).toBe(800);
    expect(snapshot.segmentHeights).toEqual([12_800, 12_800, 12_800]);
  });

  it("derives rights, localization and unresolved review truth from one project state", () => {
    const snapshot = createStudioProjectExportSnapshot(
      projectState(),
      recommendedStudioExportDraft("project-12", "social"),
    );

    expect(snapshot.rightsBlockedAssetIds).toEqual(["asset-blocked"]);
    expect(snapshot.rightsWarningAssetIds).toEqual(["asset-review"]);
    expect(snapshot.localizationBlockingIssues).toBe(2);
    expect(snapshot.unresolvedComments).toBe(1);
  });
});
