import type {
  InfrastructureBillingBoundary,
  InfrastructureConsistency,
  InfrastructureOperation,
  InfrastructureProviderHealth,
  InfrastructureQuotaDimensionSnapshot,
  InfrastructureTrafficDistribution,
} from "@toonspectrum/core/infrastructure-fabric";

export interface FederatedDataPlaneProviderDefinition {
  readonly billingBoundary: Extract<
    InfrastructureBillingBoundary,
    "hard-stop-free" | "free-allowance-with-app-cap"
  >;
  readonly applicationHardCapRatio: number;
  readonly trafficWeight: number;
}

export interface FederatedDataPlaneShardDefinition {
  readonly provider: string;
  readonly domains: readonly string[];
  readonly virtualShardCount: number;
  readonly writeMode: string;
}

export interface FederatedDataPlaneRouteDefinition {
  readonly operation: Extract<InfrastructureOperation, "read" | "write">;
  readonly consistency: InfrastructureConsistency;
  readonly authority: string;
  readonly candidates: readonly string[];
  readonly allowReadFallback: boolean;
  readonly trafficDistribution: Extract<
    InfrastructureTrafficDistribution,
    "headroom" | "weighted-rendezvous"
  >;
}

export interface FederatedDataPlanePolicyDefinition {
  readonly version: string;
  readonly quotaSnapshotMaxAgeSeconds: number;
  readonly providers: Readonly<
    Record<string, FederatedDataPlaneProviderDefinition>
  >;
  readonly shards: Readonly<Record<string, FederatedDataPlaneShardDefinition>>;
  readonly routes: Readonly<Record<string, FederatedDataPlaneRouteDefinition>>;
}

export interface FederatedDataPlaneQuotaSnapshot {
  readonly shardId: string;
  readonly providerId: string;
  readonly health: InfrastructureProviderHealth;
  readonly usageRatio: number;
  readonly forecastRatio?: number;
  readonly quotaDimensions?: Readonly<
    Record<string, InfrastructureQuotaDimensionSnapshot>
  >;
  readonly observedAtEpochMs: number;
  readonly staleAfterMs: number;
}

export interface FederatedDataPlaneRoutingRequest {
  readonly routeId: string;
  readonly routingKey?: string;
  readonly estimatedQuotaImpact?: number;
  readonly estimatedQuotaImpactByDimension?: Readonly<Record<string, number>>;
  readonly excludedShardIds?: readonly string[];
}

export interface FederatedDataPlaneSelectedTarget {
  readonly shardId: string;
  readonly providerId: string;
  readonly authority: boolean;
  readonly fallback: boolean;
  readonly projectedUsageRatio: number;
  readonly remainingHeadroomRatio: number;
  readonly bottleneckQuotaDimension?: string;
}

export type FederatedDataPlaneRoutingPlan =
  | {
      readonly outcome: "selected";
      readonly routeId: string;
      readonly primary: FederatedDataPlaneSelectedTarget;
      readonly retries: readonly FederatedDataPlaneSelectedTarget[];
      readonly rejectedShardIds: readonly string[];
    }
  | {
      readonly outcome: "rejected";
      readonly routeId: string;
      readonly reason:
        | "POLICY_INVALID"
        | "AUTHORITY_UNAVAILABLE"
        | "NO_ELIGIBLE_PROVIDER"
        | "QUOTA_EXHAUSTED"
        | "QUOTA_SNAPSHOT_REQUIRED";
      readonly rejectedShardIds: readonly string[];
    };
