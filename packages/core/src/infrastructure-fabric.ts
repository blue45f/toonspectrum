export const INFRASTRUCTURE_OPERATIONS = ["read", "write", "compute"] as const;
export const INFRASTRUCTURE_CONSISTENCY_CLASSES = [
  "authoritative",
  "replicated",
  "derived",
  "ephemeral",
] as const;
export const INFRASTRUCTURE_PROVIDER_HEALTH = [
  "healthy",
  "degraded",
  "unavailable",
] as const;
export const INFRASTRUCTURE_BILLING_BOUNDARIES = [
  "hard-stop-free",
  "free-allowance-with-app-cap",
  "device-owned",
  "user-owned",
] as const;

export type InfrastructureOperation =
  (typeof INFRASTRUCTURE_OPERATIONS)[number];
export type InfrastructureConsistency =
  (typeof INFRASTRUCTURE_CONSISTENCY_CLASSES)[number];
export type InfrastructureProviderHealth =
  (typeof INFRASTRUCTURE_PROVIDER_HEALTH)[number];
export type InfrastructureBillingBoundary =
  (typeof INFRASTRUCTURE_BILLING_BOUNDARIES)[number];

export interface InfrastructureProviderPolicy {
  readonly providerId: string;
  readonly roles: readonly string[];
  readonly billingBoundary: InfrastructureBillingBoundary;
  readonly applicationHardCapRatio: number;
  readonly enabled?: boolean;
}

export interface InfrastructureWorkloadPolicy {
  readonly workloadId: string;
  readonly operation: InfrastructureOperation;
  readonly consistency: InfrastructureConsistency;
  readonly authority: string;
  readonly candidates: readonly string[];
  readonly requiredRoles: readonly string[];
  readonly allowReadFallback: boolean;
}

export interface InfrastructureProviderSnapshot {
  readonly providerId: string;
  readonly health: InfrastructureProviderHealth;
  /** Ratio against the provider's free allowance, never a paid-plan budget. */
  readonly usageRatio: number;
  readonly forecastRatio?: number;
  readonly observedAtEpochMs: number;
  readonly staleAfterMs: number;
}

export interface InfrastructurePlacementRequest {
  readonly workload: InfrastructureWorkloadPolicy;
  readonly providers: ReadonlyMap<string, InfrastructureProviderPolicy>;
  readonly snapshots: ReadonlyMap<string, InfrastructureProviderSnapshot>;
  readonly nowEpochMs: number;
  /** Estimated additional ratio of the free allowance consumed by this request. */
  readonly estimatedQuotaImpact?: number;
}

export type InfrastructurePlacementRejectionReason =
  | "POLICY_INVALID"
  | "AUTHORITY_UNAVAILABLE"
  | "NO_ELIGIBLE_PROVIDER"
  | "QUOTA_EXHAUSTED"
  | "QUOTA_SNAPSHOT_REQUIRED";

export type InfrastructurePlacementDecision =
  | {
      readonly outcome: "selected";
      readonly providerId: string;
      readonly authority: boolean;
      readonly fallback: boolean;
      readonly projectedUsageRatio: number;
      readonly remainingHeadroomRatio: number;
    }
  | {
      readonly outcome: "rejected";
      readonly reason: InfrastructurePlacementRejectionReason;
      readonly rejectedProviders: readonly string[];
    };

type CandidateRejection =
  | "unavailable"
  | "role-mismatch"
  | "quota-exhausted"
  | "quota-snapshot-required"
  | "degraded-write";

interface CandidateEvaluation {
  readonly providerId: string;
  readonly eligible: boolean;
  readonly rejection?: CandidateRejection;
  readonly projectedUsageRatio: number;
  readonly remainingHeadroomRatio: number;
  readonly health: InfrastructureProviderHealth;
  readonly candidateIndex: number;
}

function validRatio(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function validIdentifier(value: string): boolean {
  return /^[a-z0-9][a-z0-9-]*$/u.test(value);
}

function validProviderSnapshot(
  providerId: string,
  snapshot: InfrastructureProviderSnapshot,
  nowEpochMs: number,
): boolean {
  return snapshot.providerId === providerId
    && INFRASTRUCTURE_PROVIDER_HEALTH.includes(snapshot.health)
    && validRatio(snapshot.usageRatio)
    && (snapshot.forecastRatio === undefined
      || validRatio(snapshot.forecastRatio))
    && Number.isSafeInteger(snapshot.observedAtEpochMs)
    && snapshot.observedAtEpochMs > 0
    && snapshot.observedAtEpochMs <= nowEpochMs
    && Number.isSafeInteger(snapshot.staleAfterMs)
    && snapshot.staleAfterMs > 0;
}

function uniqueIdentifiers(values: readonly string[]): boolean {
  return values.length > 0
    && values.every(validIdentifier)
    && new Set(values).size === values.length;
}

export function validateInfrastructureProviderPolicy(
  policy: InfrastructureProviderPolicy,
): readonly string[] {
  const issues: string[] = [];
  if (!validIdentifier(policy.providerId)) issues.push("providerId is invalid");
  if (!uniqueIdentifiers(policy.roles)) {
    issues.push("roles must be unique and non-empty");
  }
  if (!INFRASTRUCTURE_BILLING_BOUNDARIES.includes(policy.billingBoundary)) {
    issues.push("billingBoundary is invalid");
  }
  if (!validRatio(policy.applicationHardCapRatio)
    || policy.applicationHardCapRatio === 0) {
    issues.push("applicationHardCapRatio must be in (0, 1]");
  }
  return issues;
}

export function validateInfrastructureWorkloadPolicy(
  workload: InfrastructureWorkloadPolicy,
  providers: ReadonlyMap<string, InfrastructureProviderPolicy>,
): readonly string[] {
  const issues: string[] = [];
  if (!validIdentifier(workload.workloadId)) issues.push("workloadId is invalid");
  if (!INFRASTRUCTURE_OPERATIONS.includes(workload.operation)) {
    issues.push("operation is invalid");
  }
  if (!INFRASTRUCTURE_CONSISTENCY_CLASSES.includes(workload.consistency)) {
    issues.push("consistency is invalid");
  }
  if (!uniqueIdentifiers(workload.candidates)) {
    issues.push("candidates must be unique and non-empty");
  }
  if (!uniqueIdentifiers(workload.requiredRoles)) {
    issues.push("requiredRoles must be unique and non-empty");
  }
  if (!workload.candidates.includes(workload.authority)) {
    issues.push("authority must be included in candidates");
  }
  if (workload.operation !== "read" && workload.allowReadFallback) {
    issues.push("allowReadFallback is valid only for reads");
  }
  if (
    workload.operation === "write"
    && workload.consistency === "authoritative"
    && (workload.candidates.length !== 1
      || workload.candidates[0] !== workload.authority)
  ) {
    issues.push("authoritative writes must have exactly one authority candidate");
  }
  for (const providerId of workload.candidates) {
    const provider = providers.get(providerId);
    if (!provider) {
      issues.push(`candidate is not configured: ${providerId}`);
      continue;
    }
    if (!workload.requiredRoles.every((role) => provider.roles.includes(role))) {
      issues.push(`candidate lacks required roles: ${providerId}`);
    }
  }
  return issues;
}

function cloudQuotaSnapshotRequired(
  provider: InfrastructureProviderPolicy,
  operation: InfrastructureOperation,
): boolean {
  if (
    provider.billingBoundary === "device-owned"
    || provider.billingBoundary === "user-owned"
  ) {
    return false;
  }
  return provider.billingBoundary === "free-allowance-with-app-cap"
    || operation !== "read";
}

function rejectedCandidate(
  providerId: string,
  candidateIndex: number,
  rejection: CandidateRejection,
  health: InfrastructureProviderHealth = "unavailable",
): CandidateEvaluation {
  return {
    providerId,
    eligible: false,
    rejection,
    projectedUsageRatio: 1,
    remainingHeadroomRatio: 0,
    health,
    candidateIndex,
  };
}

function evaluateCandidate(
  providerId: string,
  candidateIndex: number,
  request: InfrastructurePlacementRequest,
): CandidateEvaluation {
  const provider = request.providers.get(providerId);
  if (!provider || provider.enabled === false) {
    return rejectedCandidate(providerId, candidateIndex, "unavailable");
  }
  if (!request.workload.requiredRoles.every((role) =>
    provider.roles.includes(role))) {
    return rejectedCandidate(providerId, candidateIndex, "role-mismatch");
  }

  const snapshot = request.snapshots.get(providerId);
  const deviceOrUserOwned = provider.billingBoundary === "device-owned"
    || provider.billingBoundary === "user-owned";
  const snapshotFresh = snapshot !== undefined
    && validProviderSnapshot(providerId, snapshot, request.nowEpochMs)
    && request.nowEpochMs - snapshot.observedAtEpochMs <= snapshot.staleAfterMs;

  if (!snapshotFresh
    && cloudQuotaSnapshotRequired(provider, request.workload.operation)) {
    return rejectedCandidate(
      providerId,
      candidateIndex,
      "quota-snapshot-required",
      snapshot?.health,
    );
  }

  const health = snapshotFresh ? snapshot.health : "healthy";
  if (health === "unavailable") {
    return rejectedCandidate(providerId, candidateIndex, "unavailable", health);
  }
  if (health === "degraded" && request.workload.operation !== "read") {
    return rejectedCandidate(
      providerId,
      candidateIndex,
      "degraded-write",
      health,
    );
  }

  const usage = deviceOrUserOwned || !snapshotFresh
    ? 0
    : Math.max(
      validRatio(snapshot.usageRatio) ? snapshot.usageRatio : 1,
      validRatio(snapshot.forecastRatio ?? snapshot.usageRatio)
        ? snapshot.forecastRatio ?? snapshot.usageRatio
        : 1,
    );
  const projectedUsageRatio = Math.min(
    1,
    usage + (request.estimatedQuotaImpact ?? 0),
  );
  const remainingHeadroomRatio = Math.max(
    0,
    provider.applicationHardCapRatio - projectedUsageRatio,
  );
  if (projectedUsageRatio > provider.applicationHardCapRatio) {
    return {
      ...rejectedCandidate(
        providerId,
        candidateIndex,
        "quota-exhausted",
        health,
      ),
      projectedUsageRatio,
    };
  }
  return {
    providerId,
    eligible: true,
    projectedUsageRatio,
    remainingHeadroomRatio,
    health,
    candidateIndex,
  };
}

function candidateScore(candidate: CandidateEvaluation): number {
  const healthScore = candidate.health === "healthy" ? 1_000 : 200;
  const headroomScore = Math.round(candidate.remainingHeadroomRatio * 10_000);
  const priorityScore = Math.max(0, 500 - candidate.candidateIndex * 50);
  return healthScore + headroomScore + priorityScore;
}

export function decideInfrastructurePlacement(
  request: InfrastructurePlacementRequest,
): InfrastructurePlacementDecision {
  const invalid = validateInfrastructureWorkloadPolicy(
    request.workload,
    request.providers,
  ).length > 0
    || [...request.providers.values()].some((provider) =>
      validateInfrastructureProviderPolicy(provider).length > 0)
    || !Number.isSafeInteger(request.nowEpochMs)
    || request.nowEpochMs <= 0
    || !validRatio(request.estimatedQuotaImpact ?? 0)
    || [...request.snapshots.entries()].some(([providerId, snapshot]) =>
      !validProviderSnapshot(providerId, snapshot, request.nowEpochMs));
  if (invalid) {
    return {
      outcome: "rejected",
      reason: "POLICY_INVALID",
      rejectedProviders: [...request.workload.candidates],
    };
  }

  const authorityOnly = request.workload.operation === "write"
    && request.workload.consistency === "authoritative";
  const candidateIds = authorityOnly
    ? [request.workload.authority]
    : [...request.workload.candidates];
  const evaluations = candidateIds.map((providerId, index) =>
    evaluateCandidate(providerId, index, request));
  const authority = evaluations.find((candidate) =>
    candidate.providerId === request.workload.authority);

  if (authorityOnly && !authority?.eligible) {
    const reason = authority?.rejection === "quota-exhausted"
      ? "QUOTA_EXHAUSTED"
      : authority?.rejection === "quota-snapshot-required"
        ? "QUOTA_SNAPSHOT_REQUIRED"
        : "AUTHORITY_UNAVAILABLE";
    return {
      outcome: "rejected",
      reason,
      rejectedProviders: [request.workload.authority],
    };
  }

  let eligible = evaluations.filter((candidate) => candidate.eligible);
  if (request.workload.operation === "read"
    && !request.workload.allowReadFallback) {
    eligible = eligible.filter((candidate) =>
      candidate.providerId === request.workload.authority);
  }
  eligible.sort((left, right) => {
    const scoreDifference = candidateScore(right) - candidateScore(left);
    return scoreDifference !== 0
      ? scoreDifference
      : left.providerId.localeCompare(right.providerId);
  });

  const selected = eligible[0];
  if (!selected) {
    const rejections = new Set(evaluations.map((candidate) =>
      candidate.rejection));
    const reason = rejections.has("quota-snapshot-required")
      ? "QUOTA_SNAPSHOT_REQUIRED"
      : rejections.has("quota-exhausted")
        ? "QUOTA_EXHAUSTED"
        : authority && !authority.eligible
          ? "AUTHORITY_UNAVAILABLE"
          : "NO_ELIGIBLE_PROVIDER";
    return {
      outcome: "rejected",
      reason,
      rejectedProviders: evaluations
        .filter((candidate) => !candidate.eligible)
        .map((candidate) => candidate.providerId),
    };
  }

  return {
    outcome: "selected",
    providerId: selected.providerId,
    authority: selected.providerId === request.workload.authority,
    fallback: selected.providerId !== request.workload.authority,
    projectedUsageRatio: selected.projectedUsageRatio,
    remainingHeadroomRatio: selected.remainingHeadroomRatio,
  };
}
