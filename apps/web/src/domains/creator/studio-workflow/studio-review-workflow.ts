export type StudioReviewCycleStatus =
  | "draft"
  | "in-review"
  | "changes-requested"
  | "revised"
  | "approved"
  | "superseded";

export type StudioReviewThreadSeverity = "minor" | "major" | "blocker";
export type StudioReviewThreadStatus =
  | "open"
  | "resolved"
  | "reopened"
  | "carried-over";

export type StudioReviewAnchorV2 =
  | {
      readonly type: "semantic-entity";
      readonly semanticId: string;
    }
  | {
      readonly type: "element";
      readonly semanticPanelId: string | null;
      readonly pageId: string;
      readonly elementId: string;
    }
  | {
      readonly type: "point";
      readonly pageId: string;
      readonly x: number;
      readonly y: number;
    }
  | {
      readonly type: "region";
      readonly pageId: string;
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
    }
  | {
      readonly type: "script-range";
      readonly blockId: string;
      readonly from: number;
      readonly to: number;
    }
  | {
      readonly type: "time-range";
      readonly motionDocumentId: string;
      readonly startMs: number;
      readonly endMs: number;
    }
  | {
      readonly type: "publish-issue";
      readonly validationIssueId: string;
    };

export interface StudioReviewSnapshotV1 {
  readonly version: 1;
  readonly id: string;
  readonly cycleId: string;
  readonly workId: string;
  readonly sourceServerRevision: number;
  readonly sourceContentDigest: string;
  readonly sourceArchiveSchemaVersion: number;
  readonly createdBy: string;
  readonly createdAt: string;
}

export interface StudioReviewThreadV1 {
  readonly version: 1;
  readonly id: string;
  readonly reviewSnapshotId: string;
  readonly sourceThreadId: string | null;
  readonly anchor: StudioReviewAnchorV2;
  readonly severity: StudioReviewThreadSeverity;
  readonly status: StudioReviewThreadStatus;
  readonly assigneeId: string | null;
  readonly dueAt: string | null;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly resolvedBy: string | null;
  readonly resolvedAt: string | null;
}

export interface StudioReviewCycleV1 {
  readonly version: 1;
  readonly id: string;
  readonly workId: string;
  readonly status: StudioReviewCycleStatus;
  readonly currentSnapshotId: string;
  readonly snapshotIds: readonly string[];
  readonly createdBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface StudioApprovalV1 {
  readonly version: 1;
  readonly id: string;
  readonly reviewCycleId: string;
  readonly reviewSnapshotId: string;
  readonly workId: string;
  readonly sourceServerRevision: number;
  readonly sourceContentDigest: string;
  readonly approvedBy: string;
  readonly approvedAt: string;
  readonly statementDigest: string;
  readonly supersededAt: string | null;
}

export type StudioReviewTargetResolution =
  | "resolved"
  | "moved"
  | "modified"
  | "orphaned";

export interface StudioReviewCarryOverCandidate {
  readonly thread: StudioReviewThreadV1;
  readonly targetResolution: StudioReviewTargetResolution;
  readonly nextAnchor: StudioReviewAnchorV2 | null;
}

export interface StudioReviewApprovalDecision {
  readonly allowed: boolean;
  readonly blockingThreadIds: readonly string[];
  readonly reasons: readonly string[];
}

export type StudioReviewIssueCode =
  | "invalid-id"
  | "invalid-timestamp"
  | "invalid-source-revision"
  | "missing-source-digest"
  | "invalid-anchor"
  | "thread-snapshot-mismatch"
  | "resolved-metadata-mismatch"
  | "cycle-snapshot-missing"
  | "cycle-current-snapshot-missing"
  | "approval-cycle-mismatch"
  | "approval-snapshot-mismatch"
  | "approval-source-mismatch"
  | "approval-blocked";

export interface StudioReviewIssue {
  readonly code: StudioReviewIssueCode;
  readonly entityId: string;
  readonly message: string;
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/u;

function validId(value: string): boolean {
  return SAFE_ID.test(value);
}

function validTimestamp(value: string): boolean {
  if (!Number.isFinite(Date.parse(value))) return false;
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

function validRevision(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 1;
}

function validNormalized(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

export function validateStudioReviewAnchorV2(anchor: StudioReviewAnchorV2): boolean {
  switch (anchor.type) {
    case "semantic-entity":
      return validId(anchor.semanticId);
    case "element":
      return (
        validId(anchor.pageId)
        && validId(anchor.elementId)
        && (anchor.semanticPanelId === null || validId(anchor.semanticPanelId))
      );
    case "point":
      return validId(anchor.pageId) && validNormalized(anchor.x) && validNormalized(anchor.y);
    case "region":
      return (
        validId(anchor.pageId)
        && validNormalized(anchor.x)
        && validNormalized(anchor.y)
        && Number.isFinite(anchor.width)
        && Number.isFinite(anchor.height)
        && anchor.width > 0
        && anchor.height > 0
        && anchor.x + anchor.width <= 1
        && anchor.y + anchor.height <= 1
      );
    case "script-range":
      return (
        validId(anchor.blockId)
        && Number.isSafeInteger(anchor.from)
        && Number.isSafeInteger(anchor.to)
        && anchor.from >= 0
        && anchor.to > anchor.from
      );
    case "time-range":
      return (
        validId(anchor.motionDocumentId)
        && Number.isSafeInteger(anchor.startMs)
        && Number.isSafeInteger(anchor.endMs)
        && anchor.startMs >= 0
        && anchor.endMs > anchor.startMs
      );
    case "publish-issue":
      return validId(anchor.validationIssueId);
  }
}

export function createStudioReviewCycle(input: {
  readonly cycleId: string;
  readonly snapshotId: string;
  readonly workId: string;
  readonly sourceServerRevision: number;
  readonly sourceContentDigest: string;
  readonly sourceArchiveSchemaVersion: number;
  readonly actorId: string;
  readonly createdAt: string;
}): {
  readonly cycle: StudioReviewCycleV1;
  readonly snapshot: StudioReviewSnapshotV1;
} {
  if (
    !validId(input.cycleId)
    || !validId(input.snapshotId)
    || !validId(input.workId)
    || !validId(input.actorId)
    || !validRevision(input.sourceServerRevision)
    || !validRevision(input.sourceArchiveSchemaVersion)
    || !input.sourceContentDigest.trim()
    || !validTimestamp(input.createdAt)
  ) {
    throw new Error("Review cycle creation requires valid, revision-pinned input.");
  }
  const snapshot: StudioReviewSnapshotV1 = Object.freeze({
    version: 1,
    id: input.snapshotId,
    cycleId: input.cycleId,
    workId: input.workId,
    sourceServerRevision: input.sourceServerRevision,
    sourceContentDigest: input.sourceContentDigest,
    sourceArchiveSchemaVersion: input.sourceArchiveSchemaVersion,
    createdBy: input.actorId,
    createdAt: input.createdAt,
  });
  const cycle: StudioReviewCycleV1 = Object.freeze({
    version: 1,
    id: input.cycleId,
    workId: input.workId,
    status: "in-review",
    currentSnapshotId: input.snapshotId,
    snapshotIds: [input.snapshotId],
    createdBy: input.actorId,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  });
  return { cycle, snapshot };
}

export function transitionStudioReviewCycle(
  cycle: StudioReviewCycleV1,
  next: StudioReviewCycleStatus,
  updatedAt: string,
): StudioReviewCycleV1 {
  const allowed: Readonly<Record<StudioReviewCycleStatus, readonly StudioReviewCycleStatus[]>> = {
    draft: ["in-review", "superseded"],
    "in-review": ["changes-requested", "approved", "superseded"],
    "changes-requested": ["revised", "superseded"],
    revised: ["in-review", "superseded"],
    approved: ["superseded"],
    superseded: [],
  };
  if (!allowed[cycle.status].includes(next)) {
    throw new Error(`Review transition ${cycle.status} -> ${next} is not allowed.`);
  }
  if (!validTimestamp(updatedAt)) {
    throw new Error("Review transition requires a canonical UTC timestamp.");
  }
  return Object.freeze({ ...cycle, status: next, updatedAt });
}

export function evaluateStudioReviewApproval(input: {
  readonly cycle: StudioReviewCycleV1;
  readonly snapshot: StudioReviewSnapshotV1;
  readonly threads: readonly StudioReviewThreadV1[];
}): StudioReviewApprovalDecision {
  const reasons: string[] = [];
  if (input.cycle.status !== "in-review") {
    reasons.push("검수 중인 회차만 승인할 수 있습니다.");
  }
  if (
    input.cycle.currentSnapshotId !== input.snapshot.id
    || input.snapshot.cycleId !== input.cycle.id
    || input.snapshot.workId !== input.cycle.workId
    || !input.cycle.snapshotIds.includes(input.snapshot.id)
  ) {
    reasons.push("현재 검수 회차와 검수본이 일치하지 않습니다.");
  }
  const blockingThreadIds = input.threads
    .filter((thread) =>
      thread.reviewSnapshotId === input.snapshot.id
      && thread.severity === "blocker"
      && thread.status !== "resolved"
    )
    .map((thread) => thread.id);
  if (blockingThreadIds.length > 0) {
    reasons.push("미해결 Blocker 댓글이 있습니다.");
  }
  return {
    allowed: reasons.length === 0,
    blockingThreadIds,
    reasons,
  };
}

export function createStudioApproval(input: {
  readonly approvalId: string;
  readonly cycle: StudioReviewCycleV1;
  readonly snapshot: StudioReviewSnapshotV1;
  readonly threads: readonly StudioReviewThreadV1[];
  readonly approvedBy: string;
  readonly approvedAt: string;
  readonly statementDigest: string;
}): StudioApprovalV1 {
  const decision = evaluateStudioReviewApproval(input);
  if (!decision.allowed) {
    throw new Error(`Review approval is blocked: ${decision.reasons.join(" ")}`);
  }
  if (
    !validId(input.approvalId)
    || !validId(input.approvedBy)
    || !validTimestamp(input.approvedAt)
    || !input.statementDigest.trim()
  ) {
    throw new Error("Approval identifiers, timestamp, and statement digest are required.");
  }
  return Object.freeze({
    version: 1,
    id: input.approvalId,
    reviewCycleId: input.cycle.id,
    reviewSnapshotId: input.snapshot.id,
    workId: input.snapshot.workId,
    sourceServerRevision: input.snapshot.sourceServerRevision,
    sourceContentDigest: input.snapshot.sourceContentDigest,
    approvedBy: input.approvedBy,
    approvedAt: input.approvedAt,
    statementDigest: input.statementDigest,
    supersededAt: null,
  });
}

export function supersedeStudioApproval(
  approval: StudioApprovalV1,
  supersededAt: string,
): StudioApprovalV1 {
  if (approval.supersededAt !== null) return approval;
  if (!validTimestamp(supersededAt)) {
    throw new Error("Approval supersession requires a canonical UTC timestamp.");
  }
  return Object.freeze({ ...approval, supersededAt });
}

export function carryOverStudioReviewThreads(input: {
  readonly sourceSnapshotId: string;
  readonly targetSnapshotId: string;
  readonly candidates: readonly StudioReviewCarryOverCandidate[];
  readonly actorId: string;
  readonly createdAt: string;
  readonly createThreadId: (sourceThreadId: string) => string;
}): readonly StudioReviewThreadV1[] {
  if (
    !validId(input.sourceSnapshotId)
    || !validId(input.targetSnapshotId)
    || input.sourceSnapshotId === input.targetSnapshotId
    || !validId(input.actorId)
    || !validTimestamp(input.createdAt)
  ) {
    throw new Error("Review thread carry-over requires valid source and target snapshots.");
  }
  return input.candidates.map(({ thread, targetResolution, nextAnchor }) => {
    if (thread.reviewSnapshotId !== input.sourceSnapshotId) {
      throw new Error(`Thread ${thread.id} does not belong to the source snapshot.`);
    }
    const anchor = targetResolution === "orphaned" ? thread.anchor : nextAnchor ?? thread.anchor;
    const id = input.createThreadId(thread.id);
    if (!validId(id) || !validateStudioReviewAnchorV2(anchor)) {
      throw new Error(`Thread ${thread.id} cannot be carried to the target snapshot.`);
    }
    return Object.freeze({
      ...thread,
      id,
      reviewSnapshotId: input.targetSnapshotId,
      sourceThreadId: thread.id,
      anchor,
      status: "carried-over" as const,
      createdBy: input.actorId,
      createdAt: input.createdAt,
      resolvedBy: null,
      resolvedAt: null,
    });
  });
}

export function validateStudioReviewWorkflow(input: {
  readonly cycle: StudioReviewCycleV1;
  readonly snapshots: readonly StudioReviewSnapshotV1[];
  readonly threads: readonly StudioReviewThreadV1[];
  readonly approval?: StudioApprovalV1 | null;
}): readonly StudioReviewIssue[] {
  const issues: StudioReviewIssue[] = [];
  const snapshots = new Map(input.snapshots.map((snapshot) => [snapshot.id, snapshot]));
  for (const snapshotId of input.cycle.snapshotIds) {
    if (!snapshots.has(snapshotId)) {
      issues.push({
        code: "cycle-snapshot-missing",
        entityId: input.cycle.id,
        message: `Review cycle references missing snapshot ${snapshotId}.`,
      });
    }
  }
  const current = snapshots.get(input.cycle.currentSnapshotId);
  if (!current) {
    issues.push({
      code: "cycle-current-snapshot-missing",
      entityId: input.cycle.id,
      message: "Review cycle current snapshot is missing.",
    });
  }
  for (const snapshot of input.snapshots) {
    if (
      !validId(snapshot.id)
      || !validId(snapshot.cycleId)
      || !validId(snapshot.workId)
      || !validId(snapshot.createdBy)
    ) {
      issues.push({
        code: "invalid-id",
        entityId: snapshot.id,
        message: "Review snapshot identifiers are invalid.",
      });
    }
    if (!validRevision(snapshot.sourceServerRevision)) {
      issues.push({
        code: "invalid-source-revision",
        entityId: snapshot.id,
        message: "Review snapshot server revision is invalid.",
      });
    }
    if (!snapshot.sourceContentDigest.trim()) {
      issues.push({
        code: "missing-source-digest",
        entityId: snapshot.id,
        message: "Review snapshot content digest is missing.",
      });
    }
    if (!validTimestamp(snapshot.createdAt)) {
      issues.push({
        code: "invalid-timestamp",
        entityId: snapshot.id,
        message: "Review snapshot timestamp is invalid.",
      });
    }
  }
  for (const thread of input.threads) {
    if (!snapshots.has(thread.reviewSnapshotId)) {
      issues.push({
        code: "thread-snapshot-mismatch",
        entityId: thread.id,
        message: "Review thread points to a snapshot outside this cycle.",
      });
    }
    if (!validateStudioReviewAnchorV2(thread.anchor)) {
      issues.push({
        code: "invalid-anchor",
        entityId: thread.id,
        message: "Review thread anchor is invalid.",
      });
    }
    const hasResolvedMetadata = thread.resolvedBy !== null && thread.resolvedAt !== null;
    if ((thread.status === "resolved") !== hasResolvedMetadata) {
      issues.push({
        code: "resolved-metadata-mismatch",
        entityId: thread.id,
        message: "Resolved status and resolution metadata must change together.",
      });
    }
  }
  const approval = input.approval ?? null;
  if (approval !== null) {
    if (approval.reviewCycleId !== input.cycle.id || approval.workId !== input.cycle.workId) {
      issues.push({
        code: "approval-cycle-mismatch",
        entityId: approval.id,
        message: "Approval belongs to another review cycle or work.",
      });
    }
    const snapshot = snapshots.get(approval.reviewSnapshotId);
    if (
      !snapshot
      || snapshot.cycleId !== input.cycle.id
      || snapshot.workId !== input.cycle.workId
      || !input.cycle.snapshotIds.includes(snapshot.id)
    ) {
      issues.push({
        code: "approval-snapshot-mismatch",
        entityId: approval.id,
        message: "Approval snapshot is missing from the review cycle.",
      });
    } else if (
      approval.sourceServerRevision !== snapshot.sourceServerRevision
      || approval.sourceContentDigest !== snapshot.sourceContentDigest
    ) {
      issues.push({
        code: "approval-source-mismatch",
        entityId: approval.id,
        message: "Approval must pin the exact review snapshot source.",
      });
    }
    const decision = current
      ? evaluateStudioReviewApproval({
          cycle: { ...input.cycle, status: "in-review" },
          snapshot: current,
          threads: input.threads,
        })
      : null;
    if (decision && decision.blockingThreadIds.length > 0) {
      issues.push({
        code: "approval-blocked",
        entityId: approval.id,
        message: "Approval exists while unresolved blocker threads remain.",
      });
    }
  }
  return issues;
}

export function canPublishStudioApproval(
  approval: StudioApprovalV1,
  sourceRevision: number,
  sourceDigest: string,
): boolean {
  return (
    approval.supersededAt === null
    && validRevision(sourceRevision)
    && approval.sourceServerRevision === sourceRevision
    && approval.sourceContentDigest === sourceDigest
  );
}
