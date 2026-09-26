import { Inject, Injectable, Optional } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";

import {
  capabilityIncidentId,
  clearCapabilityIncident,
  DEFAULT_SERVICE_RETRY_AFTER_SECONDS,
} from "../../platform/http/service-availability";
import { BackendCapabilityGatewayExecutor } from "../../platform/adapters/backend-capabilities/backend-capability-gateway-executor";
import {
  PRIVATE_OBJECT_STORAGE_PORT,
  type PrivateObjectStoragePort,
} from "../../platform/adapters/private-object-storage/private-object-storage.port";
import { resolveUpstashCoordinationConfig } from "../../platform/adapters/upstash-coordination/upstash-coordination.config";
import {
  UPSTASH_COORDINATION_PORT,
  type UpstashCoordinationPort,
} from "../../platform/adapters/upstash-coordination/upstash-coordination.port";
import { resolveStudioLiveClusterAdapterConfig } from "../../realtime/studio-postgres-io.adapter";
import { resolveAuthRateLimitConfig } from "../auth/auth-rate-limit.config";
import {
  TRAFFIC_ANALYTICS_REPOSITORY,
  type TrafficAnalyticsRepository,
} from "../traffic-analytics/traffic-analytics.repository";

import {
  HEALTH_READINESS_REPOSITORY,
  type HealthReadinessRepository,
} from "./health-readiness.repository";
import {
  HEALTH_RUNTIME_READINESS,
  type HealthRuntimeReadiness,
} from "./health-runtime-readiness";

export const HEALTH_ENVIRONMENT = Symbol("HEALTH_ENVIRONMENT");

export type HealthEnvironment = Partial<
  Record<
    | "NODE_ENV"
    | "TRAFFIC_ANALYTICS_STORE"
    | "AUTH_RATE_LIMIT_MODE"
    | "AUTH_DISTRIBUTED_RATE_LIMIT_ENABLED"
    | "BACKEND_DISTRIBUTION_ENABLED"
    | "STUDIO_LIVE_CLUSTER_ADAPTER"
    | "STUDIO_LIVE_POSTGRES_INLINE_BINARY_ENABLED"
    | "STUDIO_LIVE_POSTGRES_POOL_MAX"
    | "STUDIO_LIVE_POSTGRES_URL"
    | "PRIVATE_OBJECT_STORAGE_ENABLED"
    | "SUPABASE_OBJECT_STORAGE_ENABLED"
    | "UPSTASH_COORDINATION_ENABLED"
    | "UPSTASH_COORDINATION_REST_URL"
    | "UPSTASH_COORDINATION_REST_TOKEN"
    | "UPSTASH_COORDINATION_KEY_HASH_SECRET"
    | "UPSTASH_COORDINATION_NAMESPACE"
    | "UPSTASH_COORDINATION_TIMEOUT_MS"
    | "UPSTASH_COORDINATION_MAX_REQUEST_BYTES"
    | "UPSTASH_COORDINATION_MAX_RESPONSE_BYTES",
    string | undefined
  >
>;

export interface HealthReadinessReport {
  readonly ready: boolean;
  readonly database: boolean;
  readonly schema: boolean;
  readonly realtime: boolean;
  readonly objectStorage: boolean;
  readonly coordination: boolean;
  readonly durableQueueExecutor: boolean;
}

export type HealthCapabilityState =
  | "available"
  | "degraded"
  | "unavailable";

export interface HealthCapabilitiesReport {
  readonly status: "available" | "degraded";
  readonly incidentId: string | null;
  readonly retryAfterSeconds: number | null;
  readonly checkedAt: string;
  readonly capabilities: {
    readonly publicCatalog: HealthCapabilityState;
    readonly authSession: HealthCapabilityState;
    readonly communityRead: HealthCapabilityState;
    readonly communityWrite: HealthCapabilityState;
    readonly marketplaceRead: HealthCapabilityState;
    readonly studioLocalEditing: HealthCapabilityState;
    readonly studioProjectRead: HealthCapabilityState;
    readonly studioCloudSave: HealthCapabilityState;
    readonly realtimeCollaboration: HealthCapabilityState;
    readonly publishing: HealthCapabilityState;
    readonly serverAi: HealthCapabilityState;
  };
}

@Injectable()
export class HealthService {
  constructor(
    @Inject(HEALTH_READINESS_REPOSITORY)
    private readonly repository: HealthReadinessRepository,
    @Inject(HEALTH_RUNTIME_READINESS)
    private readonly runtime: HealthRuntimeReadiness,
    @Inject(HEALTH_ENVIRONMENT)
    private readonly environment: HealthEnvironment,
    @Optional()
    @Inject(PRIVATE_OBJECT_STORAGE_PORT)
    private readonly objectStorage?: PrivateObjectStoragePort,
    @Optional()
    @Inject(UPSTASH_COORDINATION_PORT)
    private readonly coordination?: UpstashCoordinationPort,
    @Optional()
    @Inject(BackendCapabilityGatewayExecutor)
    private readonly backendCapabilityExecutor?: BackendCapabilityGatewayExecutor,
    @Optional()
    @Inject(ModuleRef)
    private readonly moduleRef?: ModuleRef,
  ) {}

  async checkReadiness(): Promise<HealthReadinessReport> {
    const database = await this.safeCheck(() =>
      this.repository.isDatabaseReachable(),
    );
    const schema =
      database
      && (await this.safeCheck(() => this.repository.isSchemaReady()))
      && (await this.isAnalyticsSchemaReady());
    const realtime = this.isRealtimeReady();
    const objectStorage = await this.isObjectStorageReady();
    const coordination = await this.isCoordinationReady();
    const durableQueueExecutor = await this.isDurableQueueExecutorReady();
    return {
      ready:
        database
        && schema
        && realtime
        && objectStorage
        && coordination
        && durableQueueExecutor,
      database,
      schema,
      realtime,
      objectStorage,
      coordination,
      durableQueueExecutor,
    };
  }

  async checkCapabilities(): Promise<HealthCapabilitiesReport> {
    const report = await this.checkReadiness();
    const databaseReady = report.database && report.schema;
    const capabilities: HealthCapabilitiesReport["capabilities"] = {
      publicCatalog: "available",
      authSession: databaseReady ? "available" : "degraded",
      communityRead: databaseReady ? "available" : "unavailable",
      communityWrite: databaseReady ? "available" : "unavailable",
      marketplaceRead:
        databaseReady && report.objectStorage ? "available" : "unavailable",
      studioLocalEditing: "available",
      studioProjectRead: databaseReady ? "available" : "unavailable",
      studioCloudSave:
        databaseReady && report.objectStorage ? "available" : "unavailable",
      realtimeCollaboration:
        databaseReady && report.realtime && report.coordination
          ? "available"
          : "unavailable",
      publishing:
        databaseReady && report.objectStorage ? "available" : "unavailable",
      serverAi:
        databaseReady && report.durableQueueExecutor
          ? "available"
          : "degraded",
    };
    const degraded = Object.values(capabilities).some(
      (capability) => capability !== "available",
    );
    if (!degraded) clearCapabilityIncident("service.readiness");
    return {
      status: degraded ? "degraded" : "available",
      incidentId: degraded
        ? capabilityIncidentId("service.readiness")
        : null,
      retryAfterSeconds: degraded
        ? DEFAULT_SERVICE_RETRY_AFTER_SECONDS
        : null,
      checkedAt: new Date().toISOString(),
      capabilities,
    };
  }

  private isRealtimeReady(): boolean {
    try {
      const config = resolveStudioLiveClusterAdapterConfig(this.environment);
      if (config.mode === "memory") return true;
      return this.runtime.isStudioLivePostgresNamespaceReady();
    } catch {
      return false;
    }
  }

  private async isAnalyticsSchemaReady(): Promise<boolean> {
    if (this.environment.TRAFFIC_ANALYTICS_STORE !== "d1") return true;
    return this.safeCheck(async () => {
      const repository = this.moduleRef?.get<TrafficAnalyticsRepository>(
        TRAFFIC_ANALYTICS_REPOSITORY,
        { strict: false },
      );
      return repository ? repository.checkHealth() : false;
    });
  }

  private async safeCheck(check: () => Promise<boolean>): Promise<boolean> {
    try {
      return (await check()) === true;
    } catch {
      return false;
    }
  }

  private async isObjectStorageReady(): Promise<boolean> {
    const storageRequired =
      this.environment.PRIVATE_OBJECT_STORAGE_ENABLED === "true"
      || this.environment.SUPABASE_OBJECT_STORAGE_ENABLED === "true";
    if (!storageRequired) return true;
    const objectStorage = this.objectStorage;
    if (!objectStorage) return false;
    return this.safeCheck(async () => {
      const readiness = await objectStorage.verifyPrivatePurposeBuckets();
      return readiness?.ready === true
        && readiness.privatePurposeBuckets === 3;
    });
  }

  private async isCoordinationReady(): Promise<boolean> {
    try {
      const backendDistributionRequired =
        this.environment.BACKEND_DISTRIBUTION_ENABLED === "true";
      const authDistributionRequired = resolveAuthRateLimitConfig(
        this.environment,
      ).distributed;
      if (!backendDistributionRequired && !authDistributionRequired) {
        return true;
      }
      if (resolveUpstashCoordinationConfig(this.environment) === null) {
        return false;
      }
      const coordination = this.coordination;
      if (!coordination) return false;
      return this.safeCheck(() => coordination.ping());
    } catch {
      return false;
    }
  }

  private async isDurableQueueExecutorReady(): Promise<boolean> {
    const executor = this.backendCapabilityExecutor;
    if (!executor) return true;
    if (!executor.isDurableQueueExecutorRequired()) return true;
    if (!executor.hasDurableQueueExecutor()) return false;
    return this.safeCheck(() => executor.isDurableQueueReady());
  }
}
