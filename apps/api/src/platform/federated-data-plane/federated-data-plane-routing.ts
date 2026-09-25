import {
  INFRASTRUCTURE_PROVIDER_HEALTH,
  planInfrastructurePlacement,
  type InfrastructurePlacementCandidateDecision,
  type InfrastructureProviderPolicy,
  type InfrastructureProviderSnapshot,
  type InfrastructureWorkloadPolicy,
} from "@toonspectrum/core/infrastructure-fabric";

import type {
  FederatedDataPlanePolicyDefinition,
  FederatedDataPlaneQuotaSnapshot,
  FederatedDataPlaneRoutingPlan,
  FederatedDataPlaneRoutingRequest,
  FederatedDataPlaneSelectedTarget,
} from "./federated-data-plane.contract";
import { FEDERATED_DATA_PLANE_POLICY } from "./federated-data-plane-policy.generated";

export const FEDERATED_DATA_PLANE_QUOTA_SNAPSHOT_VERSION =
  "toonspectrum.federated-data-plane-quota.v1" as const;

export class FederatedDataPlaneConfigurationError extends Error {
  constructor(message = "Federated data-plane configuration is invalid") {
    super(message);
    this.name = "FederatedDataPlaneConfigurationError";
  }
}

export interface FederatedDataPlaneQuotaSnapshotSource {
  readSnapshot(
    shardId: string,
  ): Promise<FederatedDataPlaneQuotaSnapshot | null>;
}

export interface FederatedDataPlaneRouterOptions {
  readonly enabledShardIds: readonly string[];
  readonly snapshots: FederatedDataPlaneQuotaSnapshotSource;
  readonly now?: () => number;
  readonly policy?: FederatedDataPlanePolicyDefinition;
}

type EnvLike = Readonly<Record<string, string | undefined>>;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function ratio(value: unknown): value is number {
  return typeof value === "number"
    && Number.isFinite(value)
    && value >= 0
    && value <= 1;
}

function validIdentifier(value: string): boolean {
  return /^[a-z0-9][a-z0-9-]*$/u.test(value);
}

function validSnapshot(
  snapshot: FederatedDataPlaneQuotaSnapshot,
  policy: FederatedDataPlanePolicyDefinition,
  nowEpochMs: number,
): boolean {
  const shard = policy.shards[snapshot.shardId];
  if (!shard || shard.provider !== snapshot.providerId) return false;
  if (!INFRASTRUCTURE_PROVIDER_HEALTH.includes(snapshot.health)) return false;
  if (!ratio(snapshot.usageRatio)) return false;
  if (snapshot.forecastRatio !== undefined && !ratio(snapshot.forecastRatio)) {
    return false;
  }
  if (!Number.isSafeInteger(snapshot.observedAtEpochMs)
    || snapshot.observedAtEpochMs <= 0
    || snapshot.observedAtEpochMs > nowEpochMs) {
    return false;
  }
  const maximumStaleAfterMs = policy.quotaSnapshotMaxAgeSeconds * 1_000;
  if (!Number.isSafeInteger(snapshot.staleAfterMs)
    || snapshot.staleAfterMs <= 0
    || snapshot.staleAfterMs > maximumStaleAfterMs) {
    return false;
  }
  if (snapshot.quotaDimensions !== undefined) {
    const dimensions = Object.entries(snapshot.quotaDimensions);
    if (dimensions.length === 0) return false;
    if (dimensions.some(([dimension, value]) =>
      !validIdentifier(dimension)
      || !ratio(value.usageRatio)
      || (value.forecastRatio !== undefined && !ratio(value.forecastRatio)))) {
      return false;
    }
  }
  return true;
}

function providerRoles(
  shardId: string,
  policy: FederatedDataPlanePolicyDefinition,
): readonly string[] {
  return Object.entries(policy.routes)
    .filter(([, route]) => route.candidates.includes(shardId))
    .map(([routeId]) => routeId);
}

function infrastructureProviders(
  policy: FederatedDataPlanePolicyDefinition,
  enabledShardIds: ReadonlySet<string>,
): ReadonlyMap<string, InfrastructureProviderPolicy> {
  return new Map(Object.entries(policy.shards).map(([shardId, shard]) => {
    const provider = policy.providers[shard.provider];
    if (!provider) {
      throw new FederatedDataPlaneConfigurationError(
        `Shard ${shardId} references an unknown provider`,
      );
    }
    return [shardId, {
      providerId: shardId,
      roles: providerRoles(shardId, policy),
      billingBoundary: provider.billingBoundary,
      applicationHardCapRatio: provider.applicationHardCapRatio,
      trafficWeight: provider.trafficWeight,
      enabled: enabledShardIds.has(shardId),
    } satisfies InfrastructureProviderPolicy] as const;
  }));
}

function infrastructureSnapshot(
  snapshot: FederatedDataPlaneQuotaSnapshot,
): InfrastructureProviderSnapshot {
  return {
    providerId: snapshot.shardId,
    health: snapshot.health,
    usageRatio: snapshot.usageRatio,
    forecastRatio: snapshot.forecastRatio,
    quotaDimensions: snapshot.quotaDimensions,
    observedAtEpochMs: snapshot.observedAtEpochMs,
    staleAfterMs: snapshot.staleAfterMs,
  };
}

function selectedTarget(
  candidate: InfrastructurePlacementCandidateDecision,
  policy: FederatedDataPlanePolicyDefinition,
): FederatedDataPlaneSelectedTarget {
  const shard = policy.shards[candidate.providerId];
  if (!shard) {
    throw new FederatedDataPlaneConfigurationError(
      `Placement selected unknown shard ${candidate.providerId}`,
    );
  }
  return {
    shardId: candidate.providerId,
    providerId: shard.provider,
    authority: candidate.authority,
    fallback: candidate.fallback,
    projectedUsageRatio: candidate.projectedUsageRatio,
    remainingHeadroomRatio: candidate.remainingHeadroomRatio,
    bottleneckQuotaDimension: candidate.bottleneckQuotaDimension,
  };
}

function rejected(
  routeId: string,
  reason: "POLICY_INVALID" | "QUOTA_SNAPSHOT_REQUIRED",
  rejectedShardIds: readonly string[],
): FederatedDataPlaneRoutingPlan {
  return {
    outcome: "rejected",
    routeId,
    reason,
    rejectedShardIds,
  };
}

export class FederatedDataPlaneRouter {
  private readonly policy: FederatedDataPlanePolicyDefinition;
  private readonly providers: ReadonlyMap<string, InfrastructureProviderPolicy>;
  private readonly enabledShardIds: ReadonlySet<string>;
  private readonly now: () => number;

  constructor(private readonly options: FederatedDataPlaneRouterOptions) {
    this.policy = options.policy ?? FEDERATED_DATA_PLANE_POLICY;
    this.now = options.now ?? Date.now;
    if (options.enabledShardIds.length === 0
      || new Set(options.enabledShardIds).size !== options.enabledShardIds.length) {
      throw new FederatedDataPlaneConfigurationError(
        "At least one unique enabled shard is required",
      );
    }
    for (const shardId of options.enabledShardIds) {
      if (!this.policy.shards[shardId]) {
        throw new FederatedDataPlaneConfigurationError(
          `Enabled shard is unknown: ${shardId}`,
        );
      }
    }
    this.enabledShardIds = new Set(options.enabledShardIds);
    this.providers = infrastructureProviders(
      this.policy,
      this.enabledShardIds,
    );
  }

  async plan(
    request: FederatedDataPlaneRoutingRequest,
  ): Promise<FederatedDataPlaneRoutingPlan> {
    const route = this.policy.routes[request.routeId];
    if (!route) return rejected(request.routeId, "POLICY_INVALID", []);
    if (route.trafficDistribution === "weighted-rendezvous"
      && !request.routingKey) {
      return rejected(request.routeId, "POLICY_INVALID", route.candidates);
    }

    const nowEpochMs = this.now();
    if (!Number.isSafeInteger(nowEpochMs) || nowEpochMs <= 0) {
      return rejected(request.routeId, "POLICY_INVALID", route.candidates);
    }

    const enabledCandidates = route.candidates.filter((shardId) =>
      this.enabledShardIds.has(shardId));
    let values: readonly (FederatedDataPlaneQuotaSnapshot | null)[];
    try {
      values = await Promise.all(enabledCandidates.map((shardId) =>
        this.options.snapshots.readSnapshot(shardId)));
    } catch {
      return rejected(
        request.routeId,
        "QUOTA_SNAPSHOT_REQUIRED",
        enabledCandidates,
      );
    }

    const snapshots = new Map<string, InfrastructureProviderSnapshot>();
    for (let index = 0; index < enabledCandidates.length; index += 1) {
      const shardId = enabledCandidates[index];
      const value = values[index];
      if (!value) continue;
      if (!validSnapshot(value, this.policy, nowEpochMs)
        || value.shardId !== shardId) {
        return rejected(request.routeId, "POLICY_INVALID", [shardId]);
      }
      snapshots.set(shardId, infrastructureSnapshot(value));
    }

    const workload: InfrastructureWorkloadPolicy = {
      workloadId: request.routeId,
      operation: route.operation,
      consistency: route.consistency,
      authority: route.authority,
      candidates: route.candidates,
      requiredRoles: [request.routeId],
      allowReadFallback: route.allowReadFallback,
      trafficDistribution: route.trafficDistribution,
    };
    const plan = planInfrastructurePlacement({
      workload,
      providers: this.providers,
      snapshots,
      nowEpochMs,
      estimatedQuotaImpact: request.estimatedQuotaImpact,
      estimatedQuotaImpactByDimension:
        request.estimatedQuotaImpactByDimension,
      routingKey: request.routingKey,
      excludedProviderIds: request.excludedShardIds,
    });

    if (plan.outcome === "rejected") {
      return {
        outcome: "rejected",
        routeId: request.routeId,
        reason: plan.reason,
        rejectedShardIds: plan.rejectedProviders,
      };
    }

    return {
      outcome: "selected",
      routeId: request.routeId,
      primary: selectedTarget(plan.primary, this.policy),
      retries: plan.retries.map((candidate) =>
        selectedTarget(candidate, this.policy)),
      rejectedShardIds: plan.rejectedProviders,
    };
  }
}

class StaticFederatedDataPlaneQuotaSnapshotSource
  implements FederatedDataPlaneQuotaSnapshotSource
{
  constructor(
    private readonly snapshots: ReadonlyMap<
      string,
      FederatedDataPlaneQuotaSnapshot
    >,
  ) {}

  async readSnapshot(
    shardId: string,
  ): Promise<FederatedDataPlaneQuotaSnapshot | null> {
    return this.snapshots.get(shardId) ?? null;
  }
}

function parseEnvironmentSnapshot(
  shardId: string,
  value: unknown,
  policy: FederatedDataPlanePolicyDefinition,
  nowEpochMs: number,
): FederatedDataPlaneQuotaSnapshot {
  const shard = policy.shards[shardId];
  if (!shard || !record(value)) {
    throw new FederatedDataPlaneConfigurationError();
  }
  const snapshot: FederatedDataPlaneQuotaSnapshot = {
    shardId,
    providerId: shard.provider,
    health: value.health as FederatedDataPlaneQuotaSnapshot["health"],
    usageRatio: value.usageRatio as number,
    forecastRatio: value.forecastRatio as number | undefined,
    quotaDimensions: value.quotaDimensions as
      FederatedDataPlaneQuotaSnapshot["quotaDimensions"],
    observedAtEpochMs: value.observedAtEpochMs as number,
    staleAfterMs: value.staleAfterMs as number,
  };
  if (!validSnapshot(snapshot, policy, nowEpochMs)) {
    throw new FederatedDataPlaneConfigurationError();
  }
  return snapshot;
}

export function resolveFederatedDataPlaneRouter(
  environment: EnvLike,
  now: () => number = Date.now,
): FederatedDataPlaneRouter | null {
  const enabled = environment.FEDERATED_DATA_PLANE_ENABLED;
  if (enabled === undefined || enabled === "" || enabled === "false") {
    return null;
  }
  if (enabled !== "true") {
    throw new FederatedDataPlaneConfigurationError();
  }
  const source = environment.FEDERATED_DATA_PLANE_QUOTA_SNAPSHOTS_JSON;
  if (!source) throw new FederatedDataPlaneConfigurationError();

  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new FederatedDataPlaneConfigurationError();
  }
  if (!record(parsed)
    || parsed.version !== FEDERATED_DATA_PLANE_QUOTA_SNAPSHOT_VERSION
    || !record(parsed.shards)) {
    throw new FederatedDataPlaneConfigurationError();
  }

  const nowEpochMs = now();
  if (!Number.isSafeInteger(nowEpochMs) || nowEpochMs <= 0) {
    throw new FederatedDataPlaneConfigurationError();
  }
  const snapshots = new Map<string, FederatedDataPlaneQuotaSnapshot>();
  for (const [shardId, value] of Object.entries(parsed.shards)) {
    snapshots.set(
      shardId,
      parseEnvironmentSnapshot(
        shardId,
        value,
        FEDERATED_DATA_PLANE_POLICY,
        nowEpochMs,
      ),
    );
  }
  if (snapshots.size === 0) {
    throw new FederatedDataPlaneConfigurationError();
  }
  return new FederatedDataPlaneRouter({
    enabledShardIds: [...snapshots.keys()],
    snapshots: new StaticFederatedDataPlaneQuotaSnapshotSource(snapshots),
    now,
  });
}
