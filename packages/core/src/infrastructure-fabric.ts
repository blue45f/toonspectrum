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
export const INFRASTRUCTURE_TRAFFIC_DISTRIBUTIONS = [
  "priority",
  "headroom",
  "weighted-rendezvous",
] as const;

export type InfrastructureOperation =
  (typeof INFRASTRUCTURE_OPERATIONS)[number];
export type InfrastructureConsistency =
  (typeof INFRASTRUCTURE_CONSISTENCY_CLASSES)[number];
export type InfrastructureProviderHealth =
  (typeof INFRASTRUCTURE_PROVIDER_HEALTH)[number];
export type InfrastructureBillingBoundary =
  (typeof INFRASTRUCTURE_BILLING_BOUNDARIES)[number];
export type InfrastructureTrafficDistribution =
  (typeof INFRASTRUCTURE_TRAFFIC_DISTRIBUTIONS)[number];

export interface InfrastructureProviderPolicy {
  readonly providerId: string;
  readonly roles: readonly string[];
  readonly billingBoundary: InfrastructureBillingBoundary;
  readonly applicationHardCapRatio: number;
  readonly enabled?: boolean;
  /** Relative traffic share for safe replicated reads. Defaults to 1. */
  readonly trafficWeight?: number;
  /** Multiplies the estimated quota impact for this provider. Defaults to 1. */
  readonly quotaCostMultiplier?: number;
}

export interface InfrastructureWorkloadPolicy {
  readonly workloadId: string;
  readonly operation: InfrastructureOperation;
  readonly consistency: InfrastructureConsistency;
  readonly authority: string;
  readonly candidates: readonly string[];
  readonly requiredRoles: readonly string[];
  readonly allowReadFallback: boolean;
  /** Defaults to headroom. Weighted rendezvous requires a replicated read. */
  readonly trafficDistribution?: InfrastructureTrafficDistribution;
  /** Provider quota dimensions that must be fresh before this workload is admitted. */
  readonly quotaDimensions?: readonly string[];
}

export interface InfrastructureQuotaDimensionSnapshot {
  readonly usageRatio: number;
  readonly forecastRatio?: number;
}

export interface InfrastructureProviderSnapshot {
  readonly providerId: string;
  readonly health: InfrastructureProviderHealth;
  /** Aggregate ratio against the provider's free allowance, never a paid-plan budget. */
  readonly usageRatio: number;
  readonly forecastRatio?: number;
  /** Optional independent limits such as requests, storage, egress, CPU, or writes. */
  readonly quotaDimensions?: Readonly<
    Record<string, InfrastructureQuotaDimensionSnapshot>
  >;
  readonly observedAtEpochMs: number;
  readonly staleAfterMs: number;
}

export interface InfrastructurePlacementRequest {
  readonly workload: InfrastructureWorkloadPolicy;
  readonly providers: ReadonlyMap<string, InfrastructureProviderPolicy>;
  readonly snapshots: ReadonlyMap<string, InfrastructureProviderSnapshot>;
  readonly nowEpochMs: number;
  /** Estimated additional aggregate ratio of the free allowance. */
  readonly estimatedQuotaImpact?: number;
  /** Estimated ratios for independent limits used by the workload. */
  readonly estimatedQuotaImpactByDimension?: Readonly<Record<string, number>>;
  /** Stable affinity key for deterministic weighted read distribution. */
  readonly routingKey?: string;
  /** Providers already attempted by the caller and excluded from this plan. */
  readonly excludedProviderIds?: readonly string[];
}

export type InfrastructurePlacementRejectionReason =
  | "POLICY_INVALID"
  | "AUTHORITY_UNAVAILABLE"
  | "NO_ELIGIBLE_PROVIDER"
  | "QUOTA_EXHAUSTED"
  | "QUOTA_SNAPSHOT_REQUIRED";

export interface InfrastructurePlacementCandidateDecision {
  readonly providerId: string;
  readonly authority: boolean;
  readonly fallback: boolean;
  readonly projectedUsageRatio: number;
  readonly remainingHeadroomRatio: number;
  readonly bottleneckQuotaDimension?: string;
}

export type InfrastructurePlacementPlan =
  | {
      readonly outcome: "selected";
      readonly primary: InfrastructurePlacementCandidateDecision;
      readonly retries: readonly InfrastructurePlacementCandidateDecision[];
      readonly rejectedProviders: readonly string[];
    }
  | {
      readonly outcome: "rejected";
      readonly reason: InfrastructurePlacementRejectionReason;
      readonly rejectedProviders: readonly string[];
    };

export type InfrastructurePlacementDecision =
  | ({ readonly outcome: "selected" } & InfrastructurePlacementCandidateDecision)
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
  | "degraded-write"
  | "excluded";

interface CandidateEvaluation {
  readonly providerId: string;
  readonly eligible: boolean;
  readonly rejection?: CandidateRejection;
  readonly projectedUsageRatio: number;
  readonly remainingHeadroomRatio: number;
  readonly bottleneckQuotaDimension?: string;
  readonly health: InfrastructureProviderHealth;
  readonly candidateIndex: number;
  readonly trafficWeight: number;
  readonly quotaCostMultiplier: number;
}

function validRatio(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function validPositiveWeight(value: number): boolean {
  return Number.isFinite(value) && value > 0 && value <= 1_000;
}

function validIdentifier(value: string): boolean {
  return /^[a-z0-9][a-z0-9-]*$/u.test(value);
}

function validRoutingKey(value: string): boolean {
  return value.length > 0
    && value.length <= 256
    && value.trim() === value
    && !/[\u0000-\u001f\u007f]/u.test(value);
}

function validQuotaDimensionSnapshot(
  snapshot: InfrastructureQuotaDimensionSnapshot,
): boolean {
  return validRatio(snapshot.usageRatio)
    && (snapshot.forecastRatio === undefined
      || validRatio(snapshot.forecastRatio));
}

function validQuotaDimensions(
  dimensions: InfrastructureProviderSnapshot["quotaDimensions"],
): boolean {
  if (dimensions === undefined) return true;
  const entries = Object.entries(dimensions);
  return entries.length > 0
    && entries.every(([dimension, snapshot]) =>
      validIdentifier(dimension) && validQuotaDimensionSnapshot(snapshot));
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
    && validQuotaDimensions(snapshot.quotaDimensions)
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

function optionalUniqueIdentifiers(values: readonly string[] | undefined): boolean {
  return values === undefined || uniqueIdentifiers(values);
}

function validEstimatedQuotaDimensions(
  dimensions: InfrastructurePlacementRequest["estimatedQuotaImpactByDimension"],
): boolean {
  if (dimensions === undefined) return true;
  const entries = Object.entries(dimensions);
  return entries.length > 0
    && entries.every(([dimension, impact]) =>
      validIdentifier(dimension) && validRatio(impact));
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
  if (policy.trafficWeight !== undefined
    && !validPositiveWeight(policy.trafficWeight)) {
    issues.push("trafficWeight must be in (0, 1000]");
  }
  if (policy.quotaCostMultiplier !== undefined
    && !validPositiveWeight(policy.quotaCostMultiplier)) {
    issues.push("quotaCostMultiplier must be in (0, 1000]");
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
  if (!optionalUniqueIdentifiers(workload.quotaDimensions)) {
    issues.push("quotaDimensions must be unique and non-empty when present");
  }
  if (workload.trafficDistribution !== undefined
    && !INFRASTRUCTURE_TRAFFIC_DISTRIBUTIONS.includes(
      workload.trafficDistribution,
    )) {
    issues.push("trafficDistribution is invalid");
  }
  if (workload.trafficDistribution === "weighted-rendezvous"
    && (workload.operation !== "read" || !workload.allowReadFallback)) {
    issues.push(
      "weighted-rendezvous requires a read workload with fallback enabled",
    );
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
  trafficWeight = 1,
  quotaCostMultiplier = 1,
): CandidateEvaluation {
  return {
    providerId,
    eligible: false,
    rejection,
    projectedUsageRatio: 1,
    remainingHeadroomRatio: 0,
    health,
    candidateIndex,
    trafficWeight,
    quotaCostMultiplier,
  };
}

function requestedQuotaDimensions(
  request: InfrastructurePlacementRequest,
  snapshot: InfrastructureProviderSnapshot | undefined,
): readonly string[] {
  if (request.workload.quotaDimensions !== undefined) {
    return request.workload.quotaDimensions;
  }
  const impactDimensions = Object.keys(
    request.estimatedQuotaImpactByDimension ?? {},
  );
  if (impactDimensions.length > 0) return impactDimensions;
  return Object.keys(snapshot?.quotaDimensions ?? {});
}

interface QuotaProjection {
  readonly projectedUsageRatio: number;
  readonly bottleneckQuotaDimension?: string;
  readonly telemetryComplete: boolean;
}

function projectQuotaUsage(
  request: InfrastructurePlacementRequest,
  provider: InfrastructureProviderPolicy,
  snapshot: InfrastructureProviderSnapshot | undefined,
  snapshotFresh: boolean,
  deviceOrUserOwned: boolean,
): QuotaProjection {
  if (deviceOrUserOwned || !snapshotFresh || snapshot === undefined) {
    return { projectedUsageRatio: 0, telemetryComplete: true };
  }

  const dimensions = requestedQuotaDimensions(request, snapshot);
  const quotaCostMultiplier = provider.quotaCostMultiplier ?? 1;
  if (dimensions.length === 0) {
    const usage = Math.max(
      snapshot.usageRatio,
      snapshot.forecastRatio ?? snapshot.usageRatio,
    );
    const impact = (request.estimatedQuotaImpact ?? 0) * quotaCostMultiplier;
    return {
      projectedUsageRatio: Math.min(1, usage + impact),
      telemetryComplete: true,
    };
  }

  let projectedUsageRatio = 0;
  let bottleneckQuotaDimension: string | undefined;
  for (const dimension of dimensions) {
    const dimensionSnapshot = snapshot.quotaDimensions?.[dimension];
    if (!dimensionSnapshot) {
      return { projectedUsageRatio: 1, telemetryComplete: false };
    }
    const usage = Math.max(
      dimensionSnapshot.usageRatio,
      dimensionSnapshot.forecastRatio ?? dimensionSnapshot.usageRatio,
    );
    const impact = (
      request.estimatedQuotaImpactByDimension?.[dimension]
      ?? request.estimatedQuotaImpact
      ?? 0
    ) * quotaCostMultiplier;
    const projected = Math.min(1, usage + impact);
    if (projected >= projectedUsageRatio) {
      projectedUsageRatio = projected;
      bottleneckQuotaDimension = dimension;
    }
  }

  return {
    projectedUsageRatio,
    bottleneckQuotaDimension,
    telemetryComplete: true,
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
  const trafficWeight = provider.trafficWeight ?? 1;
  const quotaCostMultiplier = provider.quotaCostMultiplier ?? 1;
  if (request.excludedProviderIds?.includes(providerId)) {
    return rejectedCandidate(
      providerId,
      candidateIndex,
      "excluded",
      "healthy",
      trafficWeight,
      quotaCostMultiplier,
    );
  }
  if (!request.workload.requiredRoles.every((role) =>
    provider.roles.includes(role))) {
    return rejectedCandidate(
      providerId,
      candidateIndex,
      "role-mismatch",
      "unavailable",
      trafficWeight,
      quotaCostMultiplier,
    );
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
      trafficWeight,
      quotaCostMultiplier,
    );
  }

  const health = snapshotFresh ? snapshot.health : "healthy";
  if (health === "unavailable") {
    return rejectedCandidate(
      providerId,
      candidateIndex,
      "unavailable",
      health,
      trafficWeight,
      quotaCostMultiplier,
    );
  }
  if (health === "degraded" && request.workload.operation !== "read") {
    return rejectedCandidate(
      providerId,
      candidateIndex,
      "degraded-write",
      health,
      trafficWeight,
      quotaCostMultiplier,
    );
  }

  const projection = projectQuotaUsage(
    request,
    provider,
    snapshot,
    snapshotFresh,
    deviceOrUserOwned,
  );
  if (!projection.telemetryComplete) {
    return rejectedCandidate(
      providerId,
      candidateIndex,
      "quota-snapshot-required",
      health,
      trafficWeight,
      quotaCostMultiplier,
    );
  }

  const remainingHeadroomRatio = Math.max(
    0,
    provider.applicationHardCapRatio - projection.projectedUsageRatio,
  );
  if (projection.projectedUsageRatio > provider.applicationHardCapRatio) {
    return {
      ...rejectedCandidate(
        providerId,
        candidateIndex,
        "quota-exhausted",
        health,
        trafficWeight,
        quotaCostMultiplier,
      ),
      projectedUsageRatio: projection.projectedUsageRatio,
      bottleneckQuotaDimension: projection.bottleneckQuotaDimension,
    };
  }
  return {
    providerId,
    eligible: true,
    projectedUsageRatio: projection.projectedUsageRatio,
    remainingHeadroomRatio,
    bottleneckQuotaDimension: projection.bottleneckQuotaDimension,
    health,
    candidateIndex,
    trafficWeight,
    quotaCostMultiplier,
  };
}

function headroomScore(candidate: CandidateEvaluation): number {
  const healthScore = candidate.health === "healthy" ? 1_000 : 200;
  const headroomScoreValue = Math.round(
    candidate.remainingHeadroomRatio * 10_000,
  );
  const priorityScore = Math.max(0, 500 - candidate.candidateIndex * 50);
  return healthScore + headroomScoreValue + priorityScore;
}

function cyrb53(value: string): number {
  let high = 0xdeadbeef;
  let low = 0x41c6ce57;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    high = Math.imul(high ^ code, 2_654_435_761);
    low = Math.imul(low ^ code, 1_597_334_677);
  }
  high = Math.imul(high ^ (high >>> 16), 2_246_822_507)
    ^ Math.imul(low ^ (low >>> 13), 3_266_489_909);
  low = Math.imul(low ^ (low >>> 16), 2_246_822_507)
    ^ Math.imul(high ^ (high >>> 13), 3_266_489_909);
  return 4_294_967_296 * (2_097_151 & low) + (high >>> 0);
}

function rendezvousRank(
  candidate: CandidateEvaluation,
  routingKey: string,
): number {
  const unit = (cyrb53(`${routingKey}\u0000${candidate.providerId}`) + 1)
    / (9_007_199_254_740_991 + 1);
  const healthWeight = candidate.health === "healthy" ? 1 : 0.25;
  const effectiveWeight = Math.max(
    0.000_001,
    candidate.trafficWeight
      * Math.max(0.000_001, candidate.remainingHeadroomRatio)
      * healthWeight
      / candidate.quotaCostMultiplier,
  );
  return -Math.log(unit) / effectiveWeight;
}

function effectiveTrafficDistribution(
  request: InfrastructurePlacementRequest,
): InfrastructureTrafficDistribution {
  if (request.workload.trafficDistribution) {
    return request.workload.trafficDistribution;
  }
  if (
    request.routingKey
    && request.workload.operation === "read"
    && request.workload.allowReadFallback
    && request.workload.consistency !== "authoritative"
  ) {
    return "weighted-rendezvous";
  }
  return "headroom";
}

function compareCandidates(
  left: CandidateEvaluation,
  right: CandidateEvaluation,
  request: InfrastructurePlacementRequest,
): number {
  const distribution = effectiveTrafficDistribution(request);
  if (distribution === "priority") {
    const priorityDifference = left.candidateIndex - right.candidateIndex;
    return priorityDifference !== 0
      ? priorityDifference
      : left.providerId.localeCompare(right.providerId);
  }
  if (distribution === "weighted-rendezvous" && request.routingKey) {
    const rankDifference = rendezvousRank(left, request.routingKey)
      - rendezvousRank(right, request.routingKey);
    return rankDifference !== 0
      ? rankDifference
      : left.providerId.localeCompare(right.providerId);
  }
  const scoreDifference = headroomScore(right) - headroomScore(left);
  return scoreDifference !== 0
    ? scoreDifference
    : left.providerId.localeCompare(right.providerId);
}

function requestIsValid(request: InfrastructurePlacementRequest): boolean {
  return validateInfrastructureWorkloadPolicy(
    request.workload,
    request.providers,
  ).length === 0
    && ![...request.providers.values()].some((provider) =>
      validateInfrastructureProviderPolicy(provider).length > 0)
    && Number.isSafeInteger(request.nowEpochMs)
    && request.nowEpochMs > 0
    && validRatio(request.estimatedQuotaImpact ?? 0)
    && validEstimatedQuotaDimensions(
      request.estimatedQuotaImpactByDimension,
    )
    && (request.routingKey === undefined
      || validRoutingKey(request.routingKey))
    && optionalUniqueIdentifiers(request.excludedProviderIds)
    && ![...request.snapshots.entries()].some(([providerId, snapshot]) =>
      !validProviderSnapshot(providerId, snapshot, request.nowEpochMs));
}

function rejectedPlan(
  reason: InfrastructurePlacementRejectionReason,
  rejectedProviders: readonly string[],
): InfrastructurePlacementPlan {
  return { outcome: "rejected", reason, rejectedProviders };
}

function candidateDecision(
  candidate: CandidateEvaluation,
  authority: string,
): InfrastructurePlacementCandidateDecision {
  return {
    providerId: candidate.providerId,
    authority: candidate.providerId === authority,
    fallback: candidate.providerId !== authority,
    projectedUsageRatio: candidate.projectedUsageRatio,
    remainingHeadroomRatio: candidate.remainingHeadroomRatio,
    ...(candidate.bottleneckQuotaDimension
      ? { bottleneckQuotaDimension: candidate.bottleneckQuotaDimension }
      : {}),
  };
}

export function planInfrastructurePlacement(
  request: InfrastructurePlacementRequest,
): InfrastructurePlacementPlan {
  if (!requestIsValid(request)) {
    return rejectedPlan("POLICY_INVALID", [...request.workload.candidates]);
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
    return rejectedPlan(reason, [request.workload.authority]);
  }

  let eligible = evaluations.filter((candidate) => candidate.eligible);
  if (request.workload.operation === "read"
    && !request.workload.allowReadFallback) {
    eligible = eligible.filter((candidate) =>
      candidate.providerId === request.workload.authority);
  }
  eligible.sort((left, right) => compareCandidates(left, right, request));

  const primary = eligible[0];
  if (!primary) {
    const rejections = new Set(evaluations.map((candidate) =>
      candidate.rejection));
    const reason = rejections.has("quota-snapshot-required")
      ? "QUOTA_SNAPSHOT_REQUIRED"
      : rejections.has("quota-exhausted")
        ? "QUOTA_EXHAUSTED"
        : authority && !authority.eligible
          ? "AUTHORITY_UNAVAILABLE"
          : "NO_ELIGIBLE_PROVIDER";
    return rejectedPlan(
      reason,
      evaluations
        .filter((candidate) => !candidate.eligible)
        .map((candidate) => candidate.providerId),
    );
  }

  return {
    outcome: "selected",
    primary: candidateDecision(primary, request.workload.authority),
    retries: eligible.slice(1).map((candidate) =>
      candidateDecision(candidate, request.workload.authority)),
    rejectedProviders: evaluations
      .filter((candidate) => !candidate.eligible)
      .map((candidate) => candidate.providerId),
  };
}

export function decideInfrastructurePlacement(
  request: InfrastructurePlacementRequest,
): InfrastructurePlacementDecision {
  const plan = planInfrastructurePlacement(request);
  if (plan.outcome === "rejected") return plan;
  return {
    outcome: "selected",
    ...plan.primary,
  };
}
