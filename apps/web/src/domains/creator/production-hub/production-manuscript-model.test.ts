import { describe, expect, it } from "vitest";

import type {
  StudioArtifactRecord,
  StudioProjectRecord,
  StudioReviewSummary,
  StudioRevisionRecord,
} from "../project-graph/studio-project-graph-contract";
import {
  buildProductionManuscriptActivity,
  buildProductionManuscriptProcesses,
  productionArtifactBelongsToEpisode,
  productionManuscriptMetrics,
  productionManuscriptProcessType,
} from "./production-manuscript-model";

const at = (minute: number) => `2026-09-23T00:${String(minute).padStart(2, "0")}:00.000Z`;

function artifact(overrides: Partial<StudioArtifactRecord> = {}): StudioArtifactRecord {
  return {
    id: "artifact-image",
    projectId: "graph-project",
    kind: "canvas-2d",
    title: "1화 작화",
    scope: {
      projectId: "graph-project",
      seasonId: "season-1",
      episodeId: "episode-1",
    },
    headRevisionId: "revision-2",
    approvedRevisionId: "revision-1",
    ownerWorkspaceId: "workspace-1",
    createdAt: at(1),
    updatedAt: at(8),
    ...overrides,
  };
}

function revision(
  id: string,
  kind: StudioRevisionRecord["kind"],
  minute: number,
): StudioRevisionRecord {
  return {
    id,
    artifactId: "artifact-image",
    kind,
    parentIds: [],
    rootGraphHash: "a".repeat(64),
    operationFirst: null,
    operationLast: null,
    createdBy: "user-1",
    deviceId: "device-1",
    createdAt: at(minute),
    message: `${kind} ${id}`,
    compatibilityReportId: null,
    provenanceManifestId: null,
    blobRefs: [],
  };
}

function review(overrides: Partial<StudioReviewSummary> = {}): StudioReviewSummary {
  return {
    id: "review-1",
    artifactId: "artifact-image",
    revisionId: "revision-2",
    requestedBy: "user-1",
    title: "편집 검수",
    status: "changes-requested",
    decidedAt: null,
    decidedBy: null,
    createdAt: at(5),
    updatedAt: at(9),
    reviewerIds: ["user-1"],
    openRequiredCommentCount: 2,
    ...overrides,
  };
}

function project(artifacts: readonly StudioArtifactRecord[]): StudioProjectRecord {
  return {
    id: "graph-project",
    workId: "work-1",
    schemaVersion: 3,
    authorityVersion: "project-graph-v3",
    ownerUserId: "user-1",
    createdAt: at(0),
    updatedAt: at(9),
    access: {
      view: true,
      comment: true,
      edit: true,
      manageMembers: true,
      respondInvite: false,
      owner: true,
      role: "owner",
    },
    artifacts: [...artifacts],
  };
}

describe("production manuscript projection", () => {
  it("classifies text, image, media and package processes", () => {
    expect(productionManuscriptProcessType("story")).toBe("text");
    expect(productionManuscriptProcessType("localization")).toBe("text");
    expect(productionManuscriptProcessType("canvas-2d")).toBe("image");
    expect(productionManuscriptProcessType("audio")).toBe("media");
    expect(productionManuscriptProcessType("release")).toBe("package");
  });

  it("filters by the exact episode and keeps project view unfiltered", () => {
    const first = artifact();
    const second = artifact({
      id: "artifact-episode-2",
      scope: { ...first.scope, episodeId: "episode-2" },
    });
    expect(productionArtifactBelongsToEpisode(first, "episode-1")).toBe(true);
    expect(productionArtifactBelongsToEpisode(second, "episode-1")).toBe(false);
    expect(productionArtifactBelongsToEpisode(second, null)).toBe(true);
  });

  it("projects immutable versions, final selection and blocking feedback", () => {
    const image = artifact();
    const text = artifact({
      id: "artifact-story",
      kind: "story",
      title: "1화 대본",
      headRevisionId: "story-1",
      approvedRevisionId: null,
    });
    const processes = buildProductionManuscriptProcesses({
      project: project([image, text]),
      revisionsByArtifact: {
        "artifact-image": [revision("revision-1", "approved", 4), revision("revision-2", "checkpoint", 7)],
        "artifact-story": [{ ...revision("story-1", "checkpoint", 3), artifactId: "artifact-story" }],
      },
      reviewsByArtifact: { "artifact-image": [review()], "artifact-story": [] },
      episodeId: "episode-1",
    });

    const imageProcess = processes.find((entry) => entry.artifact.id === "artifact-image");
    expect(imageProcess?.headRevision?.id).toBe("revision-2");
    expect(imageProcess?.approvedRevision?.id).toBe("revision-1");
    expect(imageProcess?.openReviewCount).toBe(1);
    expect(imageProcess?.openRequiredFeedbackCount).toBe(2);
    expect(imageProcess?.hasUnapprovedChanges).toBe(true);
    expect(imageProcess?.lifecyclePhase).toBe("changes-requested");

    expect(productionManuscriptMetrics(processes)).toEqual({
      processCount: 2,
      textProcessCount: 1,
      versionCount: 3,
      approvedProcessCount: 1,
      readyToDeliverProcessCount: 0,
      releasedProcessCount: 0,
      unapprovedChangeCount: 1,
      openReviewCount: 1,
      openRequiredFeedbackCount: 2,
    });
  });


  it("keeps HEAD, FINAL and RELEASE identities separate in the lifecycle projection", () => {
    const ready = artifact({
      id: "artifact-ready",
      headRevisionId: "ready-final",
      approvedRevisionId: "ready-final",
    });
    const released = artifact({
      id: "artifact-released",
      headRevisionId: "release-1",
      approvedRevisionId: "release-final",
    });
    const processes = buildProductionManuscriptProcesses({
      project: project([ready, released]),
      revisionsByArtifact: {
        "artifact-ready": [{ ...revision("ready-final", "approved", 6), artifactId: "artifact-ready" }],
        "artifact-released": [
          { ...revision("release-1", "release", 8), artifactId: "artifact-released" },
          { ...revision("release-final", "approved", 6), artifactId: "artifact-released" },
        ],
      },
      reviewsByArtifact: {},
      episodeId: null,
    });

    expect(processes.find((entry) => entry.artifact.id === "artifact-ready")).toMatchObject({
      lifecyclePhase: "ready-to-deliver",
      readyToDeliver: true,
      hasUnapprovedChanges: false,
    });
    expect(processes.find((entry) => entry.artifact.id === "artifact-released")).toMatchObject({
      lifecyclePhase: "released",
      readyToDeliver: false,
      hasUnapprovedChanges: false,
    });
  });

  it("orders activity newest-first across version and review events", () => {
    const image = artifact();
    const processes = buildProductionManuscriptProcesses({
      project: project([image]),
      revisionsByArtifact: { "artifact-image": [revision("revision-1", "checkpoint", 4)] },
      reviewsByArtifact: { "artifact-image": [review({ updatedAt: at(9) })] },
      episodeId: null,
    });
    const activity = buildProductionManuscriptActivity(processes, 1);
    expect(activity).toHaveLength(1);
    expect(activity[0]).toMatchObject({ kind: "review", occurredAt: at(9) });
  });
});
