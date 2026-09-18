import { describe, expect, it } from "vitest";

import {
  auditProductionStudioRevisionBindings,
  createStudioRevisionCandidates,
  pinProductionTaskToStudioRevision,
} from "./production-studio-revision-bridge";

import type {
  ProductionTask,
  RevisionRef,
  Submission,
} from "@toonspectrum/core/production";
import type {
  StudioProjectGraphSnapshot,
  StudioProjectRevisionRecord,
} from "../project-graph/studio-project-graph-client";

const NOW = "2026-09-17T00:00:00.000Z";
const LATER = "2026-09-17T01:00:00.000Z";
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

const episodeScope = {
  kind: "episode" as const,
  id: "episode-1",
  ancestors: [{ kind: "project" as const, id: "production-project-1" }],
};
function revision(
  id: string,
  artifactId: string,
  rootGraphHash: string,
  createdAt = NOW,
): StudioProjectRevisionRecord {
  return {
    id,
    artifactId,
    kind: "checkpoint",
    parentIds: [],
    rootGraphHash,
    operationFirst: null,
    operationLast: null,
    createdBy: "user-1",
    deviceId: "device-1",
    createdAt,
    message: null,
    compatibilityReportId: null,
    provenanceManifestId: null,
    blobRefs: [],
  };
}

function project(): StudioProjectGraphSnapshot {
  return {
    id: "studio-project-1",
    workId: "work-1",
    schemaVersion: 3,
    authorityVersion: "project-graph-v3",
    ownerUserId: "user-1",
    createdAt: NOW,
    updatedAt: LATER,
    access: {
      view: true,
      comment: true,
      edit: true,
      manageMembers: true,
      respondInvite: true,
      owner: true,
      role: "owner",
    },
    artifacts: [
      {
        id: "storyboard-artifact",
        projectId: "studio-project-1",
        kind: "storyboard",
        title: "1화 콘티",
        scope: { projectId: "studio-project-1", episodeId: "episode-1" },
        headRevisionId: "storyboard-r2",
        approvedRevisionId: "storyboard-r1",
        ownerWorkspaceId: "workspace-1",
        createdAt: NOW,
        updatedAt: LATER,
      },
      {
        id: "canvas-artifact",
        projectId: "studio-project-1",
        kind: "canvas-2d",
        title: "1화 작화",
        scope: { projectId: "studio-project-1", episodeId: "episode-1" },
        headRevisionId: "canvas-r2",
        approvedRevisionId: "canvas-r1",
        ownerWorkspaceId: "workspace-1",
        createdAt: NOW,
        updatedAt: LATER,
      },
      {
        id: "release-artifact",
        projectId: "studio-project-1",
        kind: "release",
        title: "1화 게시본",
        scope: { projectId: "studio-project-1", episodeId: "episode-1" },
        headRevisionId: "release-r1",
        approvedRevisionId: "release-r1",
        ownerWorkspaceId: "workspace-1",
        createdAt: NOW,
        updatedAt: LATER,
      },
    ],
  };
}

function revisions(): Readonly<Record<string, readonly StudioProjectRevisionRecord[]>> {
  return {
    "storyboard-artifact": [
      revision("storyboard-r1", "storyboard-artifact", HASH_A),
      revision("storyboard-r2", "storyboard-artifact", HASH_B, LATER),
    ],
    "canvas-artifact": [
      revision("canvas-r1", "canvas-artifact", HASH_A),
      revision("canvas-r2", "canvas-artifact", HASH_B, LATER),
    ],
    "release-artifact": [revision("release-r1", "release-artifact", HASH_A)],
  };
}
function task(
  id: string,
  processKey: string,
  inputRevisionRefs: readonly RevisionRef[] = [],
): ProductionTask {
  return {
    id,
    projectId: "production-project-1",
    scope: episodeScope,
    processKey,
    title: id,
    status: "ready",
    assignmentIds: [],
    reviewerAssignmentIds: [],
    inputRevisionRefs,
    outputDeliverableIds: [`deliverable-${id}`],
    dependencyTaskIds: [],
    dueAt: null,
    estimateHours: null,
    completionCriteria: ["완료"],
    sourceAgreementMilestoneId: null,
  };
}

function submission(ref: RevisionRef): Submission {
  return {
    id: "submission-1",
    projectId: "production-project-1",
    deliverableId: "deliverable-1",
    revisionRef: ref,
    submittedByAssignmentId: "assignment-1",
    submittedAt: NOW,
    status: "submitted",
    inputRevisionRefs: [],
    evidenceRefs: ["evidence-1"],
  };
}
describe("Production ↔ Studio revision bridge", () => {
  it("projects immutable Studio revisions into production refs", () => {
    const candidates = createStudioRevisionCandidates(project(), revisions());
    const approvedCanvas = candidates.find((candidate) =>
      candidate.revisionRef.id === "canvas-r1");

    expect(approvedCanvas).toMatchObject({
      artifactKind: "canvas-2d",
      approved: true,
      head: false,
      revisionRef: {
        lineage: "visual",
        revision: 1,
        digest: `sha256:${HASH_A}`,
      },
    });
  });

  it("recommends approved revisions that match task department and scope", () => {
    const source = {
      workId: "work-1",
      assignments: [],
      tasks: [task("task-storyboard", "storyboard")],
      submissions: [],
    };
    const audit = auditProductionStudioRevisionBindings(source, project(), revisions());

    expect(audit.workMatches).toBe(true);
    expect(audit.tasks[0]).toMatchObject({
      status: "unbound",
      department: "storyboard",
      recommended: {
        artifactId: "storyboard-artifact",
        revisionRef: { id: "storyboard-r1" },
      },
    });
  });
  it("matches project-level tasks to the already-linked Studio graph", () => {
    const source = {
      workId: "work-1",
      assignments: [],
      tasks: [{
        ...task("task-publish", "production"),
        scope: {
          kind: "project" as const,
          id: "production-project-1",
          ancestors: [],
        },
      }],
      submissions: [],
    };
    const audit = auditProductionStudioRevisionBindings(source, project(), revisions());

    expect(audit.tasks[0]).toMatchObject({
      status: "unbound",
      department: "production",
      recommended: {
        artifactId: "release-artifact",
        revisionRef: { id: "release-r1" },
      },
    });
  });

  it("detects stale digests and validates submissions against ProjectGraph", () => {
    const staleRef: RevisionRef = {
      id: "canvas-r1",
      lineage: "visual",
      revision: 1,
      digest: `sha256:${HASH_B}`,
      createdAt: NOW,
    };
    const source = {
      workId: "work-1",
      assignments: [],
      tasks: [task("task-line-art", "line-art", [staleRef])],
      submissions: [submission(staleRef)],
    };
    const audit = auditProductionStudioRevisionBindings(source, project(), revisions());

    expect(audit.tasks[0]?.status).toBe("stale");
    expect(audit.submissions[0]?.status).toBe("stale");
    expect(audit.staleTaskCount).toBe(1);
  });

  it("pins a recommended revision without dropping other lineage inputs", () => {
    const narrative: RevisionRef = {
      id: "story-r1",
      lineage: "narrative",
      revision: 1,
      digest: `sha256:${HASH_A}`,
      createdAt: NOW,
    };
    const candidates = createStudioRevisionCandidates(project(), revisions());
    const candidate = candidates.find((entry) => entry.revisionRef.id === "canvas-r1");
    expect(candidate).toBeDefined();

    const pinned = pinProductionTaskToStudioRevision(
      task("task-color", "color", [narrative]),
      candidate!,
    );
    expect(pinned.inputRevisionRefs.map((entry) => entry.id)).toEqual([
      "story-r1",
      "canvas-r1",
    ]);
  });
});
