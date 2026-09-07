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
  | "server-revision-invalid"
  | "local-base-revision-invalid"
  | "local-base-without-server"
  | "local-base-ahead-of-server"
  | "review-without-server"
  | "review-source-revision-invalid"
  | "review-source-ahead-of-server"
  | "review-source-digest-missing"
  | "review-server-digest-mismatch"
  | "server-content-digest-missing"
  | "approval-without-review"
  | "approval-source-revision-invalid"
  | "approval-source-digest-missing"
  | "approval-review-mismatch"
  | "approval-source-mismatch"
  | "publish-without-approval"
  | "publish-source-revision-invalid"
  | "publish-approval-mismatch"
  | "publish-source-mismatch"
  | "profile-version-invalid";

export interface StudioVersionIssue {
  readonly code: StudioVersionIssueCode;
  readonly message: string;
}

function hasDigest(value: string | null): value is string {
  return value !== null && value.trim().length > 0;
}

function exactDigestMatch(left: string | null, right: string | null): boolean {
  return hasDigest(left) && hasDigest(right) && left === right;
}

function observedDigestMismatch(left: string | null, right: string | null): boolean {
  return hasDigest(left) && hasDigest(right) && left !== right;
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
  if (server !== null && !validRevision(server.revision)) {
    issues.push({
      code: "server-revision-invalid",
      message: "Server revision must be a positive safe integer.",
    });
  }

  const localBase = coordinates.local.baseServerRevision;
  if (localBase !== null && !validRevision(localBase)) {
    issues.push({
      code: "local-base-revision-invalid",
      message: "Local base server revision must be a positive safe integer.",
    });
  }
  if (server === null && localBase !== null) {
    issues.push({
      code: "local-base-without-server",
      message: "A local server base cannot exist without a server revision.",
    });
  }
  if (
    server !== null
    && validRevision(server.revision)
    && localBase !== null
    && validRevision(localBase)
    && localBase > server.revision
  ) {
    issues.push({
      code: "local-base-ahead-of-server",
      message: "The local base revision cannot be ahead of the server revision.",
    });
  }

  const review = coordinates.review;
  if (review !== null) {
    if (!validRevision(review.sourceRevision)) {
      issues.push({
        code: "review-source-revision-invalid",
        message: "Review source revision must be a positive safe integer.",
      });
    }
    if (!hasDigest(review.sourceDigest)) {
      issues.push({
        code: "review-source-digest-missing",
        message: "A review snapshot must pin a non-empty source digest.",
      });
    }
    if (server === null) {
      issues.push({
        code: "review-without-server",
        message: "A review snapshot must pin a server revision.",
      });
    } else if (validRevision(server.revision) && validRevision(review.sourceRevision)) {
      if (review.sourceRevision > server.revision) {
        issues.push({
          code: "review-source-ahead-of-server",
          message: "A review cannot target a revision ahead of the server head.",
        });
      } else if (review.sourceRevision === server.revision) {
        if (!hasDigest(server.contentDigest)) {
          issues.push({
            code: "server-content-digest-missing",
            message: "The current server revision must expose a content digest before review or approval.",
          });
        } else if (
          hasDigest(review.sourceDigest)
          && review.sourceDigest !== server.contentDigest
        ) {
          issues.push({
            code: "review-server-digest-mismatch",
            message: "The review digest does not match the pinned server revision.",
          });
        }
      }
    }
  }

  const approval = coordinates.approval;
  if (approval !== null) {
    if (!validRevision(approval.sourceRevision)) {
      issues.push({
        code: "approval-source-revision-invalid",
        message: "Approval source revision must be a positive safe integer.",
      });
    }
    if (!hasDigest(approval.sourceDigest)) {
      issues.push({
        code: "approval-source-digest-missing",
        message: "An approval must pin a non-empty source digest.",
      });
    }
    if (review === null) {
      issues.push({
        code: "approval-without-review",
        message: "An approval must reference a review snapshot.",
      });
    } else {
      if (approval.reviewSnapshotId !== review.snapshotId) {
        issues.push({
          code: "approval-review-mismatch",
          message: "The approval and review snapshot identifiers differ.",
        });
      }
      if (
        approval.sourceRevision !== review.sourceRevision
        || (
          hasDigest(approval.sourceDigest)
          && hasDigest(review.sourceDigest)
          && approval.sourceDigest !== review.sourceDigest
        )
      ) {
        issues.push({
          code: "approval-source-mismatch",
          message: "The approval must pin the same source as the review snapshot.",
        });
      }
    }
  }

  const publish = coordinates.publish;
  if (publish !== null) {
    if (!validRevision(publish.sourceRevision)) {
      issues.push({
        code: "publish-source-revision-invalid",
        message: "Publish source revision must be a positive safe integer.",
      });
    }
    if (approval === null) {
      issues.push({
        code: "publish-without-approval",
        message: "A publish package must reference an approval.",
      });
    } else {
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
    if (!validRevision(publish.profileVersion)) {
      issues.push({
        code: "profile-version-invalid",
        message: "Publish profile version must be a positive safe integer.",
      });
    }
  }

  return issues;
}

export function resolveStudioVersionProjection(
  coordinates: StudioVersionCoordinates,
): StudioVersionProjection {
  const issues = validateStudioVersionCoordinates(coordinates);
  const server = coordinates.server;
  const local = coordinates.local;

  const localRevisionInvalid = issues.some((issue) =>
    issue.code === "server-revision-invalid"
    || issue.code === "local-base-revision-invalid"
    || issue.code === "local-base-without-server"
    || issue.code === "local-base-ahead-of-server"
  );

  let serverSyncState: StudioServerSyncState;
  if (server === null) {
    serverSyncState = local.baseServerRevision === null ? "local-only" : "conflict";
  } else if (localRevisionInvalid) {
    serverSyncState = "conflict";
  } else if (local.pendingServerMutations > 0) {
    serverSyncState = "queued";
  } else if (
    local.baseServerRevision === server.revision
    && observedDigestMismatch(local.documentDigest, server.contentDigest)
  ) {
    serverSyncState = "conflict";
  } else if (local.baseServerRevision === server.revision) {
    serverSyncState = "synced";
  } else {
    serverSyncState = "behind";
  }

  let approvalState: StudioApprovalState = "none";
  const approval = coordinates.approval;
  if (approval !== null) {
    const structurallyInvalid = issues.some((issue) =>
      issue.code === "server-revision-invalid"
      || issue.code === "review-without-server"
      || issue.code === "review-source-revision-invalid"
      || issue.code === "review-source-ahead-of-server"
      || issue.code === "review-source-digest-missing"
      || issue.code === "review-server-digest-mismatch"
      || issue.code === "server-content-digest-missing"
      || issue.code === "approval-without-review"
      || issue.code === "approval-source-revision-invalid"
      || issue.code === "approval-source-digest-missing"
      || issue.code === "approval-review-mismatch"
      || issue.code === "approval-source-mismatch"
    );
    if (structurallyInvalid) {
      approvalState = "invalid";
    } else if (
      server !== null
      && approval.sourceRevision === server.revision
      && exactDigestMatch(approval.sourceDigest, server.contentDigest)
    ) {
      approvalState = "current";
    } else {
      approvalState = "stale";
    }
  }

  let publishState: StudioPublishState = "none";
  const publish = coordinates.publish;
  if (publish !== null) {
    const structurallyInvalid = approvalState === "invalid" || issues.some((issue) =>
      issue.code === "publish-without-approval"
      || issue.code === "publish-source-revision-invalid"
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
      server !== null
      && approval !== null
      && (approvalState === "current" || approvalState === "stale")
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
  const { approval, review, server } = coordinates;
  if (
    server === null
    || review === null
    || approval === null
    || (projection.approvalState !== "current" && projection.approvalState !== "stale")
    || projection.publishableRevision !== sourceRevision
    || approval.sourceRevision !== sourceRevision
    || review.sourceRevision !== sourceRevision
    || sourceRevision > server.revision
    || !exactDigestMatch(approval.sourceDigest, review.sourceDigest)
  ) {
    return false;
  }
  return sourceRevision !== server.revision
    || exactDigestMatch(approval.sourceDigest, server.contentDigest);
}
