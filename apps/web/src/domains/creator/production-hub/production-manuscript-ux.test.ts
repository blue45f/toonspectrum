import { describe, expect, it } from "vitest";

import type {
  StudioArtifactRecord,
  StudioProjectRecord,
  StudioReviewSummary,
  StudioRevisionRecord,
} from "../project-graph/studio-project-graph-contract";
import { buildProductionManuscriptProcesses } from "./production-manuscript-model";
import {
  productionManuscriptAttention,
  nextProductionManuscriptProcess,
  productionManuscriptFilterCounts,
  queryProductionManuscriptProcesses,
} from "./production-manuscript-ux";

const at = (minute: number) => `2026-09-23T02:${String(minute).padStart(2, "0")}:00.000Z`;

function artifact(
  id: string,
  title: string,
  episodeId: string,
  headRevisionId: string,
  approvedRevisionId: string | null,
): StudioArtifactRecord {
  return {
    id,
    projectId: "graph-project",
    kind: id.includes("story") ? "story" : "canvas-2d",
    title,
    scope: { projectId: "graph-project", seasonId: "season-1", episodeId },
    headRevisionId,
    approvedRevisionId,
    ownerWorkspaceId: "workspace-1",
    createdAt: at(1),
    updatedAt: at(2),
  };
}

function revision(
  artifactId: string,
  id: string,
  kind: StudioRevisionRecord["kind"],
  minute: number,
): StudioRevisionRecord {
  return {
    id,
    artifactId,
    kind,
    parentIds: [],
    rootGraphHash: "a".repeat(64),
    operationFirst: null,
    operationLast: null,
    createdBy: "owner",
    deviceId: "device",
    createdAt: at(minute),
    message: `${artifactId} ${kind}`,
    compatibilityReportId: null,
    provenanceManifestId: null,
    blobRefs: [],
  };
}

function review(
  id: string,
  artifactId: string,
  required: number,
): StudioReviewSummary {
  return {
    id,
    artifactId,
    revisionId: `${artifactId}-head`,
    requestedBy: "owner",
    title: `${artifactId} 검수`,
    status: "changes-requested",
    decidedAt: null,
    decidedBy: null,
    createdAt: at(5),
    updatedAt: at(8),
    reviewerIds: ["owner"],
    openRequiredCommentCount: required,
  };
}

function fixture() {
  const artifacts = [
    artifact("required", "12화 작화", "episode-12", "required-head", "required-final"),
    artifact("reviewing", "12화 배경", "episode-12", "reviewing-head", "reviewing-final"),
    artifact("story-missing", "13화 대본", "episode-13", "story-missing-head", null),
    artifact("approved", "13화 최종 원고", "episode-13", "approved-head", "approved-final"),
  ];
  const project: StudioProjectRecord = {
    id: "graph-project",
    workId: "work-1",
    schemaVersion: 3,
    authorityVersion: "project-graph-v3",
    ownerUserId: "owner",
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
    artifacts,
  };
  const revisionsByArtifact = Object.fromEntries(artifacts.map((entry, index) => [
    entry.id,
    [
      revision(entry.id, entry.headRevisionId, "checkpoint", 4 + index),
      ...(entry.approvedRevisionId
        ? [revision(entry.id, entry.approvedRevisionId, "approved", 2 + index)]
        : []),
    ],
  ]));
  return buildProductionManuscriptProcesses({
    project,
    revisionsByArtifact,
    reviewsByArtifact: {
      required: [review("review-required", "required", 2)],
      reviewing: [review("review-open", "reviewing", 0)],
    },
    episodeId: null,
  });
}

describe("production manuscript UX projection", () => {
  it("prioritizes blocking feedback, active review, missing final and approved states", () => {
    const processes = fixture();
    expect(processes.map((process) => productionManuscriptAttention(process).kind))
      .toEqual(expect.arrayContaining([
        "required-feedback",
        "in-review",
        "missing-final",
        "approved",
      ]));
    const required = processes.find((process) => process.artifact.id === "required")!;
    expect(productionManuscriptAttention(required)).toMatchObject({
      label: "필수 수정 2개",
      recommendedView: "feedback",
      priority: 0,
    });
  });

  it("counts overlapping filters without hiding review work that is also blocking", () => {
    expect(productionManuscriptFilterCounts(fixture())).toEqual({
      all: 4,
      requiredFeedback: 1,
      inReview: 2,
      missingFinal: 1,
      approved: 3,
    });
  });

  it("searches Korean process context and sorts urgent work first", () => {
    const processes = fixture();
    const urgent = queryProductionManuscriptProcesses(processes, {
      query: "",
      filter: "all",
      sort: "attention",
    });
    expect(urgent.map((process) => process.artifact.id)).toEqual([
      "required",
      "reviewing",
      "story-missing",
      "approved",
    ]);
    const story = queryProductionManuscriptProcesses(processes, {
      query: "대본",
      filter: "all",
      sort: "process",
    });
    expect(story.map((process) => process.artifact.id)).toEqual(["story-missing"]);
  });

  it("searches revision messages and review titles, not only artifact names", () => {
    const processes = fixture();
    expect(queryProductionManuscriptProcesses(processes, {
      query: "required 검수",
      filter: "all",
      sort: "attention",
    }).map((process) => process.artifact.id)).toEqual(["required"]);
    expect(queryProductionManuscriptProcesses(processes, {
      query: "story-missing checkpoint",
      filter: "all",
      sort: "attention",
    }).map((process) => process.artifact.id)).toEqual(["story-missing"]);
  });

  it("moves to the first or last visible process when the previous selection is filtered out", () => {
    const processes = fixture().filter((process) => process.artifact.id !== "required");
    expect(nextProductionManuscriptProcess(processes, "required", 1)?.artifact.id)
      .toBe("reviewing");
    expect(nextProductionManuscriptProcess(processes, "required", -1)?.artifact.id)
      .toBe("approved");
    expect(nextProductionManuscriptProcess(processes, "approved", 1)?.artifact.id)
      .toBe("reviewing");
  });

  it("filters final-state and review-state views independently", () => {
    const processes = fixture();
    expect(queryProductionManuscriptProcesses(processes, {
      query: "",
      filter: "in-review",
      sort: "attention",
    }).map((process) => process.artifact.id)).toEqual(["required", "reviewing"]);
    expect(queryProductionManuscriptProcesses(processes, {
      query: "",
      filter: "missing-final",
      sort: "attention",
    }).map((process) => process.artifact.id)).toEqual(["story-missing"]);
  });
});
