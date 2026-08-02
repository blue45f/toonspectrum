import { describe, expect, it, vi } from "vitest";

import { HealthService } from "./health.service";

import type { BackendCapabilityGatewayExecutor } from "../../infrastructure/backend-capabilities/backend-capability-gateway-executor";
import type { SupabaseObjectStoragePort } from "../../infrastructure/supabase-object-storage/supabase-object-storage.port";
import type { UpstashCoordinationPort } from "../../infrastructure/upstash-coordination/upstash-coordination.port";

const DIRECT_POSTGRES_URL =
  "postgresql://artist:secret@ep-direct.example.net/toonspectrum?sslmode=require";
const VALID_COORDINATION_ENVIRONMENT = {
  UPSTASH_COORDINATION_ENABLED: "true",
  UPSTASH_COORDINATION_REST_URL: "https://upstash.example",
  UPSTASH_COORDINATION_REST_TOKEN:
    "upstash-rest-token-at-least-sixteen-characters",
  UPSTASH_COORDINATION_KEY_HASH_SECRET:
    "coordination-key-hash-secret-at-least-thirty-two-characters",
} as const;
const VALID_DISTRIBUTED_COORDINATION_ENVIRONMENT = {
  ...VALID_COORDINATION_ENVIRONMENT,
  BACKEND_DISTRIBUTION_ENABLED: "true",
} as const;

function dependencies(
  overrides: {
    database?: boolean;
    schema?: boolean;
    realtime?: boolean;
    objectStorage?: boolean;
    coordination?: boolean;
    durableQueueExecutor?: boolean;
    durableQueueRequired?: boolean;
    environment?: Record<string, string | undefined>;
  } = {},
) {
  const repository = {
    isDatabaseReachable: vi.fn(async () => overrides.database ?? true),
    isSchemaReady: vi.fn(async () => overrides.schema ?? true),
  };
  const runtime = {
    isStudioLivePostgresNamespaceReady: vi.fn(
      () => overrides.realtime ?? true,
    ),
  };
  const objectStorage = {
    verifyPrivatePurposeBuckets: vi.fn(async () => {
      if (overrides.objectStorage === false) {
        throw new Error("storage unavailable");
      }
      return { ready: true as const, privatePurposeBuckets: 3 as const };
    }),
  } as unknown as SupabaseObjectStoragePort;
  const coordination = {
    ping: vi.fn(async () => {
      if (overrides.coordination === false) {
        throw new Error("coordination unavailable");
      }
      return true;
    }),
  } as unknown as UpstashCoordinationPort;
  const backendCapabilityExecutor = {
    isDurableQueueExecutorRequired: vi.fn(
      () => overrides.durableQueueRequired
        ?? overrides.durableQueueExecutor !== undefined,
    ),
    hasDurableQueueExecutor: vi.fn(
      () => overrides.durableQueueExecutor !== undefined,
    ),
    isDurableQueueReady: vi.fn(
      async () => overrides.durableQueueExecutor ?? true,
    ),
  } as unknown as BackendCapabilityGatewayExecutor;
  const service = new HealthService(
    repository,
    runtime,
    overrides.environment ?? {},
    objectStorage,
    coordination,
    backendCapabilityExecutor,
  );
  return {
    backendCapabilityExecutor,
    coordination,
    objectStorage,
    repository,
    runtime,
    service,
  };
}

describe("HealthService", () => {
  it("keeps local-memory realtime healthy without requiring a remote adapter", async () => {
    const { runtime, service } = dependencies();

    await expect(service.checkReadiness()).resolves.toEqual({
      ready: true,
      database: true,
      schema: true,
      realtime: true,
      objectStorage: true,
      coordination: true,
      durableQueueExecutor: true,
    });
    expect(runtime.isStudioLivePostgresNamespaceReady).not.toHaveBeenCalled();
  });

  it("requires the PostgreSQL namespace when cluster mode is explicitly selected", async () => {
    const { runtime, service } = dependencies({
      realtime: false,
      environment: {
        NODE_ENV: "production",
        AUTH_RATE_LIMIT_MODE: "single-instance-local",
        STUDIO_LIVE_CLUSTER_ADAPTER: "postgres",
        STUDIO_LIVE_POSTGRES_URL: DIRECT_POSTGRES_URL,
      },
    });

    await expect(service.checkReadiness()).resolves.toEqual({
      ready: false,
      database: true,
      schema: true,
      realtime: false,
      objectStorage: true,
      coordination: true,
      durableQueueExecutor: true,
    });
    expect(runtime.isStudioLivePostgresNamespaceReady).toHaveBeenCalledOnce();
  });

  it("requires all three private purpose buckets when Supabase storage is enabled", async () => {
    const unavailable = dependencies({
      objectStorage: false,
      environment: {
        SUPABASE_OBJECT_STORAGE_ENABLED: "true",
      },
    });

    await expect(unavailable.service.checkReadiness()).resolves.toEqual({
      ready: false,
      database: true,
      schema: true,
      realtime: true,
      objectStorage: false,
      coordination: true,
      durableQueueExecutor: true,
    });
    expect(
      unavailable.objectStorage.verifyPrivatePurposeBuckets,
    ).toHaveBeenCalledOnce();

    const available = dependencies({
      environment: {
        SUPABASE_OBJECT_STORAGE_ENABLED: "true",
      },
    });
    await expect(available.service.checkReadiness()).resolves.toEqual({
      ready: true,
      database: true,
      schema: true,
      realtime: true,
      objectStorage: true,
      coordination: true,
      durableQueueExecutor: true,
    });
  });

  it("does not probe optional object storage when its purpose boundary is disabled", async () => {
    const { objectStorage, service } = dependencies();

    await service.checkReadiness();

    expect(
      objectStorage.verifyPrivatePurposeBuckets,
    ).not.toHaveBeenCalled();
  });

  it("requires both durable queue workloads once a provider facade registers an executor", async () => {
    const unavailable = dependencies({ durableQueueExecutor: false });

    await expect(unavailable.service.checkReadiness()).resolves.toMatchObject({
      ready: false,
      durableQueueExecutor: false,
    });
    expect(
      unavailable.backendCapabilityExecutor.isDurableQueueReady,
    ).toHaveBeenCalledOnce();

    const available = dependencies({ durableQueueExecutor: true });
    await expect(available.service.checkReadiness()).resolves.toMatchObject({
      ready: true,
      durableQueueExecutor: true,
    });
  });

  it("does not make the authoritative API depend on an unregistered queue facade", async () => {
    const { backendCapabilityExecutor, service } = dependencies();

    await expect(service.checkReadiness()).resolves.toMatchObject({
      ready: true,
      durableQueueExecutor: true,
    });
    expect(
      backendCapabilityExecutor.isDurableQueueReady,
    ).not.toHaveBeenCalled();
  });

  it("fails readiness when queue policy is enabled without a registered adapter", async () => {
    const { backendCapabilityExecutor, service } = dependencies({
      durableQueueRequired: true,
    });

    await expect(service.checkReadiness()).resolves.toMatchObject({
      ready: false,
      durableQueueExecutor: false,
    });
    expect(
      backendCapabilityExecutor.hasDurableQueueExecutor,
    ).toHaveBeenCalledOnce();
    expect(
      backendCapabilityExecutor.isDurableQueueReady,
    ).not.toHaveBeenCalled();
  });

  it("does not downgrade an invalid PostgreSQL requirement to memory mode", async () => {
    const { runtime, service } = dependencies({
      environment: {
        NODE_ENV: "production",
        AUTH_RATE_LIMIT_MODE: "single-instance-local",
        STUDIO_LIVE_CLUSTER_ADAPTER: "postgres",
      },
    });

    await expect(service.checkReadiness()).resolves.toMatchObject({
      ready: false,
      realtime: false,
    });
    expect(runtime.isStudioLivePostgresNamespaceReady).not.toHaveBeenCalled();
  });

  it("skips schema I/O after a failed database probe and hides driver failures", async () => {
    const { repository, service } = dependencies({ database: false });

    await expect(service.checkReadiness()).resolves.toEqual({
      ready: false,
      database: false,
      schema: false,
      realtime: true,
      objectStorage: true,
      coordination: true,
      durableQueueExecutor: true,
    });
    expect(repository.isSchemaReady).not.toHaveBeenCalled();

    repository.isDatabaseReachable.mockRejectedValueOnce(
      new Error(
        "password authentication failed for postgresql://user:secret@example.invalid/db",
      ),
    );
    await expect(service.checkReadiness()).resolves.toMatchObject({
      ready: false,
      database: false,
      schema: false,
    });
  });

  it.each([
    ["missing", {}],
    ["disabled", { UPSTASH_COORDINATION_ENABLED: "false" }],
    [
      "misconfigured",
      {
        UPSTASH_COORDINATION_ENABLED: "true",
        UPSTASH_COORDINATION_REST_URL: "http://upstash.example",
        UPSTASH_COORDINATION_REST_TOKEN: "short",
      },
    ],
  ])(
    "fails readiness when distributed backends require %s Upstash coordination",
    async (_caseName, coordinationEnvironment) => {
      const { service } = dependencies({
        environment: {
          BACKEND_DISTRIBUTION_ENABLED: "true",
          ...coordinationEnvironment,
        },
      });

      await expect(service.checkReadiness()).resolves.toMatchObject({
        ready: false,
        coordination: false,
      });
    },
  );

  it("accepts canonical Upstash coordination when backend distribution is enabled", async () => {
    const { coordination, service } = dependencies({
      environment: VALID_DISTRIBUTED_COORDINATION_ENVIRONMENT,
    });

    await expect(service.checkReadiness()).resolves.toMatchObject({
      ready: true,
      coordination: true,
    });
    expect(coordination.ping).toHaveBeenCalledOnce();
  });

  it("fails readiness when configured Upstash coordination is unreachable", async () => {
    const { coordination, service } = dependencies({
      coordination: false,
      environment: VALID_DISTRIBUTED_COORDINATION_ENVIRONMENT,
    });

    await expect(service.checkReadiness()).resolves.toMatchObject({
      ready: false,
      coordination: false,
    });
    expect(coordination.ping).toHaveBeenCalledOnce();
  });

  it("requires reachable coordination when auth automatically enables distributed limiting", async () => {
    const { coordination, service } = dependencies({
      coordination: false,
      environment: VALID_COORDINATION_ENVIRONMENT,
    });

    await expect(service.checkReadiness()).resolves.toMatchObject({
      ready: false,
      coordination: false,
    });
    expect(coordination.ping).toHaveBeenCalledOnce();
  });

  it("does not probe coordination when auth explicitly selects local fallback", async () => {
    const { coordination, service } = dependencies({
      environment: {
        ...VALID_COORDINATION_ENVIRONMENT,
        AUTH_DISTRIBUTED_RATE_LIMIT_ENABLED: "false",
      },
    });

    await expect(service.checkReadiness()).resolves.toMatchObject({
      ready: true,
      coordination: true,
    });
    expect(coordination.ping).not.toHaveBeenCalled();
  });

  it("fails production readiness when auth rate-limit topology is not explicit", async () => {
    const { coordination, service } = dependencies({
      environment: { NODE_ENV: "production" },
    });

    await expect(service.checkReadiness()).resolves.toMatchObject({
      ready: false,
      coordination: false,
    });
    expect(coordination.ping).not.toHaveBeenCalled();
  });

  it("accepts explicit production single-instance local risk without probing Upstash", async () => {
    const { coordination, service } = dependencies({
      environment: {
        NODE_ENV: "production",
        AUTH_RATE_LIMIT_MODE: "single-instance-local",
      },
    });

    await expect(service.checkReadiness()).resolves.toMatchObject({
      ready: true,
      coordination: true,
    });
    expect(coordination.ping).not.toHaveBeenCalled();
  });
});
