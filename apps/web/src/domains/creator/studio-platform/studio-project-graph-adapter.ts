import {
  createStudioArtifact,
  createStudioArtifactRevision,
  createStudioScopeRef,
  validateStudioProjectGraph,
  type StudioArtifactRevisionV1,
  type StudioProjectGraphV1,
  type StudioTransactionEnvelope,
} from "@toonspectrum/studio-project-model";

import type { StudioVersionCoordinates } from "../studio-foundation/studio-version-coordinates";
import type {
  StudioDomainCommand,
  StudioMutationEnvelopeV2,
} from "../studio-workflow/studio-mutation-coordinator";
import type { StudioProjectArchiveV3 } from "../studio-workflow/studio-project-archive-v3";

export interface StudioProjectGraphProjection {
  readonly graph: StudioProjectGraphV1;
  readonly primaryArtifactId: string;
  readonly primaryWorkingRevisionId: string;
}

function revisionId(artifactId: string, suffix: string): string {
  return `${artifactId}:${suffix}`;
}

function createRevision(input: {
  readonly id: string;
  readonly artifactId: string;
  readonly kind: StudioArtifactRevisionV1["kind"];
  readonly parentRevisionIds: readonly string[];
  readonly contentDigest: string;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly label: string | null;
}): StudioArtifactRevisionV1 {
  return createStudioArtifactRevision({
    ...input,
    manifestDigest: input.contentDigest,
    sourceFormat: "toonstudio-project-archive-v3",
    sourceBlobDigest: input.contentDigest,
  });
}

export function projectStudioArchiveToProjectGraph(input: {
  readonly archive: StudioProjectArchiveV3;
  readonly coordinates: StudioVersionCoordinates;
  readonly actorId: string;
  readonly projectedAt: string;
}): StudioProjectGraphProjection {
  const projectId = input.archive.manifest.workScope;
  const artifactId = `artifact:${projectId}:canvas`;
  const scope = createStudioScopeRef({ projectId });
  const revisions: StudioArtifactRevisionV1[] = [];

  let serverRevisionId: string | null = null;
  if (input.coordinates.server) {
    serverRevisionId = revisionId(
      artifactId,
      `server:${input.coordinates.server.revision}`,
    );
    revisions.push(createRevision({
      id: serverRevisionId,
      artifactId,
      kind: "named-checkpoint",
      parentRevisionIds: [],
      contentDigest: input.coordinates.server.contentDigest
        ?? input.archive.manifest.contentDigest,
      createdBy: input.actorId,
      createdAt: input.projectedAt,
      label: `Server revision ${input.coordinates.server.revision}`,
    }));
  }

  const workingRevisionId = revisionId(
    artifactId,
    `working:${input.coordinates.local.sequence}`,
  );
  revisions.push(createRevision({
    id: workingRevisionId,
    artifactId,
    kind: "working",
    parentRevisionIds: serverRevisionId ? [serverRevisionId] : [],
    contentDigest: input.coordinates.local.documentDigest
      ?? input.archive.manifest.contentDigest,
    createdBy: input.actorId,
    createdAt: input.projectedAt,
    label: null,
  }));

  let reviewRevisionId: string | null = null;
  if (input.coordinates.review) {
    reviewRevisionId = revisionId(
      artifactId,
      `review:${input.coordinates.review.snapshotId}`,
    );
    revisions.push(createRevision({
      id: reviewRevisionId,
      artifactId,
      kind: "review-snapshot",
      parentRevisionIds: [serverRevisionId ?? workingRevisionId],
      contentDigest: input.coordinates.review.sourceDigest
        ?? input.archive.manifest.contentDigest,
      createdBy: input.actorId,
      createdAt: input.projectedAt,
      label: `Review ${input.coordinates.review.cycleId}`,
    }));
  }

  let approvedRevisionId: string | null = null;
  if (input.coordinates.approval) {
    approvedRevisionId = revisionId(
      artifactId,
      `approved:${input.coordinates.approval.approvalId}`,
    );
    revisions.push(createRevision({
      id: approvedRevisionId,
      artifactId,
      kind: "approved",
      parentRevisionIds: reviewRevisionId ? [reviewRevisionId] : [],
      contentDigest: input.coordinates.approval.sourceDigest
        ?? input.archive.manifest.contentDigest,
      createdBy: input.actorId,
      createdAt: input.projectedAt,
      label: `Approval ${input.coordinates.approval.approvalId}`,
    }));
  }

  let releaseRevisionId: string | null = null;
  if (input.coordinates.publish) {
    releaseRevisionId = revisionId(
      artifactId,
      `release:${input.coordinates.publish.packageId}`,
    );
    revisions.push(createRevision({
      id: releaseRevisionId,
      artifactId,
      kind: "release",
      parentRevisionIds: approvedRevisionId ? [approvedRevisionId] : [],
      contentDigest: approvedRevisionId
        ? revisions.find((revision) => revision.id === approvedRevisionId)!.contentDigest
        : input.archive.manifest.contentDigest,
      createdBy: input.actorId,
      createdAt: input.projectedAt,
      label: `Release ${input.coordinates.publish.packageId}`,
    }));
  }

  const artifact = createStudioArtifact({
    id: artifactId,
    projectId,
    kind: "canvas-2d",
    scope,
    title: input.archive.metadata.title || "Untitled Studio project",
    revisionIds: revisions.map((revision) => revision.id),
    workingRevisionId,
    createdAt: input.archive.manifest.createdAt,
    updatedAt: input.projectedAt,
  });

  const graph: StudioProjectGraphV1 = Object.freeze({
    version: 1,
    projectId,
    title: input.archive.metadata.title || "Untitled Studio project",
    nodes: Object.freeze([]),
    artifacts: Object.freeze([artifact]),
    revisions: Object.freeze(revisions),
    assetUsages: Object.freeze([]),
    taskLinks: Object.freeze([]),
    reviewLinks: Object.freeze(reviewRevisionId && input.coordinates.review
      ? [{
          version: 1,
          reviewId: input.coordinates.review.cycleId,
          reviewSnapshotRevisionId: reviewRevisionId,
          approvedRevisionId,
        }]
      : []),
    releaseLinks: Object.freeze(
      releaseRevisionId && approvedRevisionId && input.coordinates.publish
        ? [{
            version: 1,
            releaseId: input.coordinates.publish.packageId,
            approvedRevisionId,
            releaseRevisionId,
            destinationProfileId: input.coordinates.publish.profileId,
          }]
        : [],
    ),
    createdAt: input.archive.manifest.createdAt,
    updatedAt: input.projectedAt,
  });
  const issues = validateStudioProjectGraph(graph);
  if (issues.length > 0) {
    throw new Error(`ProjectGraph projection failed: ${issues.map((issue) => issue.message).join(" ")}`);
  }
  return Object.freeze({ graph, primaryArtifactId: artifactId, primaryWorkingRevisionId: workingRevisionId });
}

export function projectStudioMutationEnvelope(
  envelope: StudioMutationEnvelopeV2,
): StudioTransactionEnvelope<StudioDomainCommand> {
  const baseDigest = envelope.base.local.documentDigest;
  if (!baseDigest) {
    throw new Error("Studio transaction projection requires a pinned local document digest.");
  }
  return Object.freeze({
    version: 1,
    id: envelope.transactionId,
    idempotencyKey: envelope.idempotencyKey,
    baseSequence: envelope.base.local.sequence,
    baseDigest,
    actorId: envelope.actor.userId ?? envelope.actor.clientId,
    createdAt: envelope.createdAt,
    commands: Object.freeze(envelope.commands.map((command) => Object.freeze({
      id: command.commandId,
      type: `${command.domain}:${command.type}`,
      payload: command,
    }))),
  });
}
