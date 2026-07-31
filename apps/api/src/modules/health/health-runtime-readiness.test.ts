import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { PostgresAdapter } from "@socket.io/postgres-adapter";
import { describe, expect, it, vi } from "vitest";

import {
  NestHealthRuntimeReadiness,
  isPostgresBackedStudioLiveNamespace,
} from "./health-runtime-readiness";

import type { StudioLivePostgresListenerLifecycleStatus } from "../../realtime/studio-postgres-pubsub";

function postgresAdapter(
  status: StudioLivePostgresListenerLifecycleStatus = "active",
): PostgresAdapter {
  return Object.assign(Object.create(PostgresAdapter.prototype), {
    getStudioLivePostgresListenerStatus: () => status,
  }) as PostgresAdapter;
}

@Module({
  providers: [NestHealthRuntimeReadiness],
})
class MetadataLightHealthRuntimeTestModule {}

describe("Studio live runtime readiness", () => {
  it("injects ModuleRef when decorator type metadata is unavailable", async () => {
    const application = await NestFactory.createApplicationContext(
      MetadataLightHealthRuntimeTestModule,
      { logger: false },
    );

    try {
      const readiness = application.get(NestHealthRuntimeReadiness);
      expect(
        (
          readiness as unknown as {
            moduleRef?: unknown;
          }
        ).moduleRef,
      ).toBeDefined();
    } finally {
      await application.close();
    }
  });

  it("accepts active listeners and bounded reconnect grace on only the canonical namespace", () => {
    expect(
      isPostgresBackedStudioLiveNamespace({
        name: "/studio-live",
        adapter: postgresAdapter(),
      }),
    ).toBe(true);
    expect(
      isPostgresBackedStudioLiveNamespace({
        name: "/studio-live",
        adapter: postgresAdapter("reconnecting"),
      }),
    ).toBe(true);
    expect(
      isPostgresBackedStudioLiveNamespace({
        name: "/studio-live",
        adapter: {},
      }),
    ).toBe(false);
    expect(
      isPostgresBackedStudioLiveNamespace({
        name: "/other",
        adapter: postgresAdapter(),
      }),
    ).toBe(false);
  });

  it.each(["stale", "closed"] as const)(
    "fails closed for a %s PostgreSQL listener",
    (status) => {
      expect(
        isPostgresBackedStudioLiveNamespace({
          name: "/studio-live",
          adapter: postgresAdapter(status),
        }),
      ).toBe(false);
    },
  );

  it("fails closed when an otherwise real PostgreSQL adapter lacks or throws its status contract", () => {
    const missingStatus = Object.create(
      PostgresAdapter.prototype,
    ) as PostgresAdapter;
    const throwingStatus = Object.assign(
      Object.create(PostgresAdapter.prototype),
      {
        getStudioLivePostgresListenerStatus: () => {
          throw new Error("status unavailable");
        },
      },
    ) as PostgresAdapter;

    expect(
      isPostgresBackedStudioLiveNamespace({
        name: "/studio-live",
        adapter: missingStatus,
      }),
    ).toBe(false);
    expect(
      isPostgresBackedStudioLiveNamespace({
        name: "/studio-live",
        adapter: throwingStatus,
      }),
    ).toBe(false);
  });

  it("finds the initialized gateway across feature-module boundaries", () => {
    const get = vi.fn(() => ({
      server: {
        name: "/studio-live",
        adapter: postgresAdapter(),
      },
    }));
    const readiness = new NestHealthRuntimeReadiness({ get } as never);

    expect(readiness.isStudioLivePostgresNamespaceReady()).toBe(true);
    expect(get).toHaveBeenCalledWith(expect.any(Function), { strict: false });
  });

  it("fails closed before gateway initialization or when lookup fails", () => {
    const uninitialized = new NestHealthRuntimeReadiness({
      get: () => ({ server: undefined }),
    } as never);
    const missing = new NestHealthRuntimeReadiness({
      get: () => {
        throw new Error("provider unavailable");
      },
    } as never);

    expect(uninitialized.isStudioLivePostgresNamespaceReady()).toBe(false);
    expect(missing.isStudioLivePostgresNamespaceReady()).toBe(false);
  });
});
