import { Inject, Injectable, Optional } from "@nestjs/common";

import {
  SUPABASE_OBJECT_STORAGE_PORT,
  type SupabaseObjectStoragePort,
} from "../../infrastructure/supabase-object-storage/supabase-object-storage.port";
import { resolveUpstashCoordinationConfig } from "../../infrastructure/upstash-coordination/upstash-coordination.config";
import {
  UPSTASH_COORDINATION_PORT,
  type UpstashCoordinationPort,
} from "../../infrastructure/upstash-coordination/upstash-coordination.port";
import { resolveStudioLiveClusterAdapterConfig } from "../../realtime/studio-postgres-io.adapter";

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
    | "BACKEND_DISTRIBUTION_ENABLED"
    | "STUDIO_LIVE_CLUSTER_ADAPTER"
    | "STUDIO_LIVE_POSTGRES_INLINE_BINARY_ENABLED"
    | "STUDIO_LIVE_POSTGRES_POOL_MAX"
    | "STUDIO_LIVE_POSTGRES_URL"
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
    @Inject(SUPABASE_OBJECT_STORAGE_PORT)
    private readonly objectStorage?: SupabaseObjectStoragePort,
    @Optional()
    @Inject(UPSTASH_COORDINATION_PORT)
    private readonly coordination?: UpstashCoordinationPort,
  ) {}

  async checkReadiness(): Promise<HealthReadinessReport> {
    const database = await this.safeCheck(() =>
      this.repository.isDatabaseReachable(),
    );
    const schema =
      database &&
      (await this.safeCheck(() => this.repository.isSchemaReady()));
    const realtime = this.isRealtimeReady();
    const objectStorage = await this.isObjectStorageReady();
    const coordination = await this.isCoordinationReady();
    return {
      ready:
        database &&
        schema &&
        realtime &&
        objectStorage &&
        coordination,
      database,
      schema,
      realtime,
      objectStorage,
      coordination,
    };
  }

  private isRealtimeReady(): boolean {
    try {
      const config = resolveStudioLiveClusterAdapterConfig(this.environment);
      if (config.mode === "memory") return true;
      return this.runtime.isStudioLivePostgresNamespaceReady();
    } catch {
      // Invalid/missing direct PostgreSQL configuration must never be treated as a local fallback.
      return false;
    }
  }

  private async safeCheck(check: () => Promise<boolean>): Promise<boolean> {
    try {
      return (await check()) === true;
    } catch {
      // Database driver/schema errors stay inside the process and never enter the public response.
      return false;
    }
  }

  private async isObjectStorageReady(): Promise<boolean> {
    if (this.environment.SUPABASE_OBJECT_STORAGE_ENABLED !== "true") {
      return true;
    }
    const objectStorage = this.objectStorage;
    if (!objectStorage) return false;
    return this.safeCheck(async () => {
      const readiness =
        await objectStorage.verifyPrivatePurposeBuckets();
      return (
        readiness?.ready === true &&
        readiness.privatePurposeBuckets === 3
      );
    });
  }

  private async isCoordinationReady(): Promise<boolean> {
    if (this.environment.BACKEND_DISTRIBUTION_ENABLED !== "true") {
      return true;
    }
    try {
      // The module graph is built from this same canonical parser, but configuration validity is
      // not reachability. A distributed deployment advertises readiness only after a bounded,
      // authenticated Redis PING succeeds through the same port used for leases and receipts.
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
}
