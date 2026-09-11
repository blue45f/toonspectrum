export const STUDIO_REVIEW_STATUSES = [
  "draft",
  "in-review",
  "changes-requested",
  "approved",
  "superseded",
] as const;

export type StudioReviewStatus = (typeof STUDIO_REVIEW_STATUSES)[number];
export type StudioReviewThreadKind = "comment" | "change-request" | "paint-over";
export type StudioReviewThreadStatus = "open" | "resolved";
export type StudioReviewDecision = "approved" | "changes-requested";

export interface StudioReviewMessage {
  readonly id: string;
  readonly authorId: string;
  readonly body: string;
  readonly createdAt: string;
}

export interface StudioReviewThread {
  readonly id: string;
  readonly kind: StudioReviewThreadKind;
  readonly targetId: string;
  readonly status: StudioReviewThreadStatus;
  readonly messages: readonly StudioReviewMessage[];
  readonly resolvedBy: string | null;
  readonly resolvedAt: string | null;
}

export interface StudioReviewerDecision {
  readonly reviewerId: string;
  readonly decision: StudioReviewDecision;
  readonly note: string;
  readonly decidedAt: string;
}

export interface StudioReviewSession {
  readonly documentId: string;
  readonly versionId: string;
  readonly basedOnVersionId: string | null;
  readonly status: StudioReviewStatus;
  readonly requiredReviewerIds: readonly string[];
  readonly threads: readonly StudioReviewThread[];
  readonly decisions: readonly StudioReviewerDecision[];
  readonly submittedAt: string | null;
  readonly approvedAt: string | null;
  readonly updatedAt: string;
}

export interface StudioReviewReadiness {
  readonly canApprove: boolean;
  readonly openChangeRequestCount: number;
  readonly missingApprovalReviewerIds: readonly string[];
  readonly reasons: readonly string[];
}

export interface StudioReviewRevisionTransition {
  readonly previous: StudioReviewSession;
  readonly next: StudioReviewSession;
}

function requireText(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
}

function requireTimestamp(value: string): string {
  if (!Number.isFinite(Date.parse(value))) throw new Error("A valid ISO timestamp is required.");
  return value;
}

function unique(values: readonly string[]): string[] {
  const normalized = values.map((value) => requireText(value, "Reviewer id"));
  if (new Set(normalized).size !== normalized.length) {
    throw new Error("Reviewer ids must be unique.");
  }
  return normalized;
}

function immutableSession(session: StudioReviewSession): StudioReviewSession {
  return Object.freeze({
    ...session,
    requiredReviewerIds: Object.freeze([...session.requiredReviewerIds]),
    threads: Object.freeze([...session.threads]),
    decisions: Object.freeze([...session.decisions]),
  });
}

function assertMutable(session: StudioReviewSession): void {
  if (session.status === "approved" || session.status === "superseded") {
    throw new Error("Approved or superseded review versions are immutable.");
  }
}

export function createStudioReviewSession(input: {
  readonly documentId: string;
  readonly versionId: string;
  readonly requiredReviewerIds: readonly string[];
  readonly createdAt: string;
  readonly basedOnVersionId?: string | null;
}): StudioReviewSession {
  return immutableSession({
    documentId: requireText(input.documentId, "Document id"),
    versionId: requireText(input.versionId, "Version id"),
    basedOnVersionId: input.basedOnVersionId ?? null,
    status: "draft",
    requiredReviewerIds: unique(input.requiredReviewerIds),
    threads: [],
    decisions: [],
    submittedAt: null,
    approvedAt: null,
    updatedAt: requireTimestamp(input.createdAt),
  });
}

export function submitStudioReview(
  session: StudioReviewSession,
  submittedAt: string,
): StudioReviewSession {
  assertMutable(session);
  return immutableSession({
    ...session,
    status: "in-review",
    submittedAt: requireTimestamp(submittedAt),
    updatedAt: submittedAt,
  });
}

export function addStudioReviewThread(
  session: StudioReviewSession,
  thread: StudioReviewThread,
  updatedAt: string,
): StudioReviewSession {
  assertMutable(session);
  requireText(thread.id, "Thread id");
  requireText(thread.targetId, "Review target id");
  if (session.threads.some((candidate) => candidate.id === thread.id)) {
    throw new Error("Review thread ids must be unique.");
  }
  if (thread.messages.length === 0) throw new Error("A review thread requires a message.");
  for (const message of thread.messages) {
    requireText(message.id, "Message id");
    requireText(message.authorId, "Message author id");
    requireText(message.body, "Message body");
    requireTimestamp(message.createdAt);
  }
  const timestamp = requireTimestamp(updatedAt);
  return immutableSession({
    ...session,
    status: thread.kind === "change-request" ? "changes-requested" : session.status,
    threads: [...session.threads, Object.freeze({
      ...thread,
      messages: Object.freeze([...thread.messages]),
    })],
    updatedAt: timestamp,
  });
}

export function resolveStudioReviewThread(
  session: StudioReviewSession,
  threadId: string,
  actorId: string,
  resolvedAt: string,
): StudioReviewSession {
  assertMutable(session);
  const id = requireText(threadId, "Thread id");
  const actor = requireText(actorId, "Actor id");
  const timestamp = requireTimestamp(resolvedAt);
  let matched = false;
  const threads = session.threads.map((thread) => {
    if (thread.id !== id) return thread;
    matched = true;
    return Object.freeze({
      ...thread,
      status: "resolved" as const,
      resolvedBy: actor,
      resolvedAt: timestamp,
    });
  });
  if (!matched) throw new Error("Review thread was not found.");
  return immutableSession({ ...session, threads, updatedAt: timestamp });
}

export function studioReviewReadiness(
  session: StudioReviewSession,
): StudioReviewReadiness {
  const openChangeRequestCount = session.threads.filter(
    (thread) => thread.kind === "change-request" && thread.status === "open",
  ).length;
  const approvedReviewers = new Set(
    session.decisions
      .filter((decision) => decision.decision === "approved")
      .map((decision) => decision.reviewerId),
  );
  const missingApprovalReviewerIds = session.requiredReviewerIds.filter(
    (reviewerId) => !approvedReviewers.has(reviewerId),
  );
  const reasons: string[] = [];
  if (session.status === "draft") reasons.push("Submit the version for review first.");
  if (openChangeRequestCount > 0) reasons.push("Resolve every open change request.");
  if (missingApprovalReviewerIds.length > 0) reasons.push("Collect all required approvals.");
  return Object.freeze({
    canApprove: session.status !== "draft"
      && session.status !== "superseded"
      && openChangeRequestCount === 0
      && missingApprovalReviewerIds.length === 0,
    openChangeRequestCount,
    missingApprovalReviewerIds: Object.freeze(missingApprovalReviewerIds),
    reasons: Object.freeze(reasons),
  });
}

export function recordStudioReviewDecision(
  session: StudioReviewSession,
  decision: StudioReviewerDecision,
): StudioReviewSession {
  assertMutable(session);
  if (session.status === "draft") throw new Error("Submit the version before recording a decision.");
  const reviewerId = requireText(decision.reviewerId, "Reviewer id");
  const decidedAt = requireTimestamp(decision.decidedAt);
  const decisions = [
    ...session.decisions.filter((current) => current.reviewerId !== reviewerId),
    Object.freeze({
      ...decision,
      reviewerId,
      note: decision.note.trim(),
      decidedAt,
    }),
  ];
  const intermediate = immutableSession({
    ...session,
    status: decision.decision === "changes-requested"
      ? "changes-requested"
      : "in-review",
    decisions,
    updatedAt: decidedAt,
  });
  const readiness = studioReviewReadiness(intermediate);
  if (!readiness.canApprove) return intermediate;
  return immutableSession({
    ...intermediate,
    status: "approved",
    approvedAt: decidedAt,
  });
}

export function startStudioRevision(
  approved: StudioReviewSession,
  input: {
    readonly nextVersionId: string;
    readonly actorId: string;
    readonly createdAt: string;
  },
): StudioReviewRevisionTransition {
  if (approved.status !== "approved") {
    throw new Error("Only an approved version can start a protected revision.");
  }
  requireText(input.actorId, "Actor id");
  const createdAt = requireTimestamp(input.createdAt);
  const previous = immutableSession({
    ...approved,
    status: "superseded",
    updatedAt: createdAt,
  });
  const next = createStudioReviewSession({
    documentId: approved.documentId,
    versionId: requireText(input.nextVersionId, "Next version id"),
    basedOnVersionId: approved.versionId,
    requiredReviewerIds: approved.requiredReviewerIds,
    createdAt,
  });
  return Object.freeze({ previous, next });
}
