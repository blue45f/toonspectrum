export type StudioLocalDurableState = "memory" | "opfs";

export interface StudioLocalVersionCoordinate {
  readonly sequence: number;
  readonly durableState: StudioLocalDurableState;
  readonly documentDigest: string | null;
  readonly baseServerRevision: number | null;
  readonly pendingServerMutations: number;
}

export interface StudioServerVersionCoordinate {
  readonly revision: number;
  readonly contentDigest: string | null;
}

export type StudioReviewStatus =
  | "draft"
  | "in-review"
  | "changes-requested"
  | "approved"
  | "superseded";

export interface StudioReviewVersionCoordinate {
  readonly cycleId: string;
  readonly snapshotId: string;
  readonly sourceRevision: number;
  readonly sourceDigest: string | null;
  readonly status: StudioReviewStatus;
}

export interface StudioApprovalVersionCoordinate {
  readonly approvalId: string;
  readonly reviewSnapshotId: string;
  readonly sourceRevision: number;
  readonly sourceDigest: string | null;
}

export interface StudioPublishVersionCoordinate {
  readonly packageId: string;
  readonly approvalId: string;
  readonly sourceRevision: number;
  readonly profileId: string;
  readonly profileVersion: number;
}

export interface StudioVersionCoordinates {
  readonly local: StudioLocalVersionCoordinate;
  readonly server: StudioServerVersionCoordinate | null;
  readonly review: StudioReviewVersionCoordinate | null;
  readonly approval: StudioApprovalVersionCoordinate | null;
  readonly publish: StudioPublishVersionCoordinate | null;
}

export type StudioServerSyncState =
  | "local-only"
  | "synced"
  | "queued"
  | "behind"
  | "conflict";

export type StudioApprovalState = "none" | "current" | "stale" | "invalid";
export type StudioPublishState = "none" | "current" | "stale" | "invalid";

export interface StudioVersionProjection {
  readonly serverSyncState: StudioServerSyncState;
  readonly approvalState: StudioApprovalState;
  readonly publishState: StudioPublishState;
  readonly publishableRevision: number | null;
}

export type StudioVersionIssueCode =
  | "local-sequence-invalid"
  | "pending-mutation-count-invalid"
  | "local-base-without-server"
  | "local-base-ahead-of-server"
  | "review-without-server"
  | "approval-without-review"
  | "approval-review-mismatch"
  | "approval-source-mismatch"
  | "publish-without-approval"
  | "publish-approval-mismatch"
  | "publish-source-mismatch"
  | "profile-version-invalid";

export interface StudioVersionIssue {
  readonly code: StudioVersionIssueCode;
  readonly message: string;
}

function sameDigest(left: string | null, right: string | null): boolean {
  return left === null || right === null || left === right;
}

function validRevision(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 1;
}

export function createEmptyStudioVersionCoordinates(): StudioVersionCoordinates {
  return {
    local: {
      sequence: 0,
      durableState: "memory",
      documentDigest: null,
      baseServerRevision: null,
      pendingServerMutations: 0,
    },
    server: null,
    review: null,
    approval: null,
    publish: null,
  };
}

export function validateStudioVersionCoordinates(
  coordinates: StudioVersionCoordinates,
): readonly StudioVersionIssue[] {
  const issues: StudioVersionIssue[] = [];
  if (!Number.isSafeInteger(coordinates.local.sequence) || coordinates.local.sequence < 0) {
    issues.push({
      code: "local-sequence-invalid",
      message: "Local sequence must be a non-negative safe integer.",
    });
  }
  if (
    !Number.isSafeInteger(coordinates.local.pendingServerMutations)
    || coordinates.local.pendingServerMutations < 0
  ) {
    issues.push({
      code: "pending-mutation-count-invalid",
      message: "Pending server mutations must be a non-negative safe integer.",
    });
  }

  const server = coordinates.server;
  const localBase = coordinates.local.baseServerRevision;
  if (server === null && localBase !== null) {
    issues.push({
      code: "local-base-without-server",
      message: "A local server base cannot exist without a server revision.",
    });
  }
  if (server !== null && localBase !== null && localBase > server.revision) {
    issues.push({
      code: "local-base-ahead-of-server",
      message: "The local base revision cannot be ahead of the server revision.",
    });
  }

  const review = coordinates.review;
  if (review !== null && server === null) {
    issues.push({
      code: "review-without-server",
      message: "A review snapshot must pin a server revision.",
    });
  }

  const approval = coordinates.approval;
  if (approval !== null && review === null) {
    issues.push({
      code: "approval-without-review",
      message: "An approval must reference a review snapshot.",
    });
  } else if (approval !== null && review !== null) {
    if (approval.reviewSnapshotId !== review.snapshotId) {
      issues.push({
        code: "approval-review-mismatch",
        message: "The approval and review snapshot identifiers differ.",
      });
    }
    if (
      approval.sourceRevision !== review.sourceRevision
      || !sameDigest(approval.sourceDigest, review.sourceDigest)
    ) {
      issues.push({
        code: "approval-source-mismatch",
        message: "The approval must pin the same source as the review snapshot.",
      });
    }
  }

  const publish = coordinates.publish;
  if (publish !== null && approval === null) {
    issues.push({
      code: "publish-without-approval",
      message: "A publish package must reference an approval.",
    });
  } else if (publish !== null && approval !== null) {
    if (publish.approvalId !== approval.approvalId) {
      issues.push({
        code: "publish-approval-mismatch",
        message: "The publish package references a different approval.",
      });
    }
    if (publish.sourceRevision !== approval.sourceRevision) {
      issues.push({
        code: "publish-source-mismatch",
        message: "The publish package must render the approved revision.",
      });
    }
  }
  if (publish !== null && !validRevision(publish.profileVersion)) {
    issues.push({
      code: "profile-version-invalid",
      message: "Publish profile version must be a positive safe integer.",
    });
  }

  return issues;
}

export function resolveStudioVersionProjection(
  coordinates: StudioVersionCoordinates,
): StudioVersionProjection {
  const issues = validateStudioVersionCoordinates(coordinates);
  const server = coordinates.server;
  const local = coordinates.local;

  let serverSyncState: StudioServerSyncState;
  if (server === null) {
    serverSyncState = "local-only";
  } else if (local.baseServerRevision !== null && local.baseServerRevision > server.revision) {
    serverSyncState = "conflict";
  } else if (local.pendingServerMutations > 0) {
    serverSyncState = "queued";
  } else if (local.baseServerRevision === server.revision) {
    serverSyncState = "synced";
  } else {
    serverSyncState = "behind";
  }

  let approvalState: StudioApprovalState = "none";
  const approval = coordinates.approval;
  if (approval !== null) {
    const structurallyInvalid = issues.some((issue) =>
      issue.code === "approval-without-review"
      || issue.code === "approval-review-mismatch"
      || issue.code === "approval-source-mismatch"
    );
    if (structurallyInvalid) {
      approvalState = "invalid";
    } else if (
      server !== null
      && approval.sourceRevision === server.revision
      && sameDigest(approval.sourceDigest, server.contentDigest)
    ) {
      approvalState = "current";
    } else {
      approvalState = "stale";
    }
  }

  let publishState: StudioPublishState = "none";
  const publish = coordinates.publish;
  if (publish !== null) {
    const structurallyInvalid = issues.some((issue) =>
      issue.code === "publish-without-approval"
      || issue.code === "publish-approval-mismatch"
      || issue.code === "publish-source-mismatch"
      || issue.code === "profile-version-invalid"
    );
    if (structurallyInvalid) {
      publishState = "invalid";
    } else if (
      approvalState === "current"
      && server !== null
      && publish.sourceRevision === server.revision
    ) {
      publishState = "current";
    } else {
      publishState = "stale";
    }
  }

  return {
    serverSyncState,
    approvalState,
    publishState,
    publishableRevision:
      approval !== null && approvalState !== "invalid"
        ? approval.sourceRevision
        : null,
  };
}

export function canCreateStudioPublishPackage(
  coordinates: StudioVersionCoordinates,
  sourceRevision: number,
): boolean {
  if (!validRevision(sourceRevision)) return false;
  const projection = resolveStudioVersionProjection(coordinates);
  return (
    projection.publishableRevision === sourceRevision
    && coordinates.approval !== null
    && coordinates.approval.sourceRevision === sourceRevision
  );
}
