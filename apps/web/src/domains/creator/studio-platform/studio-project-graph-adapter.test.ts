import { describe, expect, it } from "vitest";

import type { StudioProjectSnapshot } from "../studio-project-snapshot";
import type { StudioVersionCoordinates } from "../studio-foundation/studio-version-coordinates";
import { migrateStudioProjectSnapshotV2ToArchiveV3 } from "../studio-workflow/studio-project-archive-v3";
import {
  projectStudioArchiveToProjectGraph,
  projectStudioMutationEnvelope,
} from "./studio-project-graph-adapter";

const NOW = "2026-09-17T09:00:00.000Z";

function snapshot(): StudioProjectSnapshot {
  return {
    version: 2,
    savedAt: NOW,
    title: "통합 작품",
    description: "",
    tagsText: "",
    linkedTitleId: null,
    linkedSeriesId: null,
    linkedChallengeId: null,
    pagesList: [],
    master: undefined,
    characterBible: { version: 1, characters: [] },
    writerRoom: {} as StudioProjectSnapshot["writerRoom"],
    aiProvenance: {} as StudioProjectSnapshot["aiProvenance"],
    comments: {} as StudioProjectSnapshot["comments"],
    releaseSchedule: {} as StudioProjectSnapshot["releaseSchedule"],
    publicationAnalytics: {} as StudioProjectSnapshot["publicationAnalytics"],
    referenceBoard: {} as StudioProjectSnapshot["referenceBoard"],
    aiImageReferences: {} as StudioProjectSnapshot["aiImageReferences"],
    currentPageId: "page-1",
    webtoonTheme: "classic",
    panelGutter: 24,
    publishPack: {} as StudioProjectSnapshot["publishPack"],
  };
}

function archiveAndCoordinates() {
  const empty: StudioVersionCoordinates = {
    local: {
      sequence: 2,
      durableState: "opfs",
      documentDigest: null,
      baseServerRevision: null,
      pendingServerMutations: 0,
    },
    server: null,
    review: null,
    approval: null,
    publish: null,
  };
  const archive = migrateStudioProjectSnapshotV2ToArchiveV3({
    snapshot: snapshot(),
    archiveId: "archive-1",
    workScope: "work:episode-1",
    createdAt: NOW,
    sourceCoordinates: empty,
  }).archive;
  const digest = archive.manifest.contentDigest;
  const coordinates: StudioVersionCoordinates = {
    local: { ...empty.local, documentDigest: digest, baseServerRevision: 1 },
    server: { revision: 1, contentDigest: digest },
    review: {
      cycleId: "review-cycle-1",
      snapshotId: "review-snapshot-1",
      sourceRevision: 1,
      sourceDigest: digest,
      status: "approved",
    },
    approval: {
      approvalId: "approval-1",
      reviewSnapshotId: "review-snapshot-1",
      sourceRevision: 1,
      sourceDigest: digest,
    },
    publish: {
      packageId: "release-package-1",
      approvalId: "approval-1",
      sourceRevision: 1,
      profileId: "webtoon-canvas",
      profileVersion: 1,
    },
  };
  return { archive, coordinates };
}

describe("Studio ProjectGraph product adapters", () => {
  it("projects archive, review, approval and release coordinates into one graph", () => {
    const { archive, coordinates } = archiveAndCoordinates();
    const projection = projectStudioArchiveToProjectGraph({
      archive,
      coordinates,
      actorId: "user-1",
      projectedAt: NOW,
    });
    expect(projection.graph.projectId).toBe("work:episode-1");
    expect(projection.graph.revisions.map((revision) => revision.kind)).toEqual([
      "named-checkpoint",
      "working",
      "review-snapshot",
      "approved",
      "release",
    ]);
    expect(projection.graph.reviewLinks).toHaveLength(1);
    expect(projection.graph.releaseLinks).toHaveLength(1);
  });

  it("projects the existing mutation coordinator envelope without a second write path", () => {
    const { coordinates } = archiveAndCoordinates();
    const transaction = projectStudioMutationEnvelope({
      schemaVersion: 2,
      mutationId: "mutation-1",
      transactionId: "transaction-1",
      idempotencyKey: "idempotency-1",
      workScope: { kind: "work", workId: "work-1" },
      actor: { userId: "user-1", clientId: "client-1", sessionId: "session-1" },
      base: coordinates,
      commands: [{
        commandId: "command-1",
        domain: "project-ir",
        type: "element.update",
        payload: { id: "element-1" },
        affectedSemanticIds: ["element-1"],
      }],
      affectedSemanticIds: ["element-1"],
      createdAt: NOW,
    });
    expect(transaction).toMatchObject({
      id: "transaction-1",
      baseSequence: 2,
      actorId: "user-1",
    });
    expect(transaction.commands[0]?.type).toBe("project-ir:element.update");
  });
});
