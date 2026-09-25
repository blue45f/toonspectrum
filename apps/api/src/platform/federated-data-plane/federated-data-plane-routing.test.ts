import { describe, expect, it, vi } from "vitest";

import type { FederatedDataPlaneQuotaSnapshot } from "./federated-data-plane.contract";
import { FEDERATED_DATA_PLANE_POLICY } from "./federated-data-plane-policy.generated";
import {
  FEDERATED_DATA_PLANE_QUOTA_SNAPSHOT_VERSION,
  FederatedDataPlaneConfigurationError,
  FederatedDataPlaneRouter,
  resolveFederatedDataPlaneRouter,
  type FederatedDataPlaneQuotaSnapshotSource,
} from "./federated-data-plane-routing";

const NOW = 1_800_000_000_000;

function snapshot(
  shardId: string,
  overrides: Partial<FederatedDataPlaneQuotaSnapshot> = {},
): FederatedDataPlaneQuotaSnapshot {
  const shard = FEDERATED_DATA_PLANE_POLICY.shards[shardId];
  if (!shard) throw new Error(`Unknown test shard: ${shardId}`);
  return {
    shardId,
    providerId: shard.provider,
    health: "healthy",
    usageRatio: 0.2,
    forecastRatio: 0.25,
    observedAtEpochMs: NOW - 1_000,
    staleAfterMs: 60_000,
    ...overrides,
  };
}

function router(
  snapshots: readonly FederatedDataPlaneQuotaSnapshot[],
): FederatedDataPlaneRouter {
  const values = new Map(snapshots.map((value) => [value.shardId, value]));
  const source: FederatedDataPlaneQuotaSnapshotSource = {
    readSnapshot: vi.fn(async (shardId) => values.get(shardId) ?? null),
  };
  return new FederatedDataPlaneRouter({
    enabledShardIds: [...values.keys()],
    snapshots: source,
    now: () => NOW,
  });
}

describe("federated data-plane routing", () => {
  it("routes critical writes only to the CockroachDB ledger authority", async () => {
    const plan = await router([snapshot("crdb-ledger")]).plan({
      routeId: "critical-ledger-write",
      estimatedQuotaImpact: 0.01,
    });

    expect(plan).toMatchObject({
      outcome: "selected",
      primary: {
        shardId: "crdb-ledger",
        providerId: "cockroachdb-basic",
        authority: true,
        fallback: false,
      },
    });
  });

  it("fails closed instead of moving an exhausted ledger write to another DB", async () => {
    const plan = await router([
      snapshot("crdb-ledger", {
        usageRatio: 0.79,
        forecastRatio: 0.79,
      }),
      snapshot("tidb-commerce"),
    ]).plan({
      routeId: "critical-ledger-write",
      estimatedQuotaImpact: 0.02,
    });

    expect(plan).toEqual({
      outcome: "rejected",
      routeId: "critical-ledger-write",
      reason: "QUOTA_EXHAUSTED",
      rejectedShardIds: ["crdb-ledger"],
    });
  });

  it("spreads derived catalog reads across D1 and Turso deterministically", async () => {
    const dataPlane = router([
      snapshot("d1-edge-index", { usageRatio: 0.2, forecastRatio: 0.2 }),
      snapshot("turso-public-catalog", { usageRatio: 0.2, forecastRatio: 0.2 }),
    ]);
    const selected = new Map<string, number>();
    for (let index = 0; index < 400; index += 1) {
      const request = {
        routeId: "public-catalog-read",
        routingKey: `catalog:${index}`,
      } as const;
      const first = await dataPlane.plan(request);
      const second = await dataPlane.plan(request);
      expect(second).toEqual(first);
      expect(first.outcome).toBe("selected");
      if (first.outcome === "selected") {
        const shardId = first.primary.shardId;
        selected.set(shardId, (selected.get(shardId) ?? 0) + 1);
      }
    }

    expect(selected.get("d1-edge-index")).toBeGreaterThan(0);
    expect(selected.get("turso-public-catalog")).toBeGreaterThan(
      selected.get("d1-edge-index") ?? 0,
    );
  });

  it("rejects stale quota telemetry before an authoritative write", async () => {
    const plan = await router([
      snapshot("firestore-notifications", {
        observedAtEpochMs: NOW - 120_000,
        staleAfterMs: 60_000,
      }),
    ]).plan({ routeId: "notification-write" });

    expect(plan).toMatchObject({
      outcome: "rejected",
      reason: "QUOTA_SNAPSHOT_REQUIRED",
      rejectedShardIds: ["firestore-notifications"],
    });
  });

  it("keeps weighted routes fail-closed without a stable routing key", async () => {
    const plan = await router([
      snapshot("d1-edge-index"),
      snapshot("turso-public-catalog"),
    ]).plan({ routeId: "public-catalog-read" });

    expect(plan).toMatchObject({
      outcome: "rejected",
      reason: "POLICY_INVALID",
    });
  });

  it("bootstraps only explicitly reviewed environment snapshots", async () => {
    const value = snapshot("firestore-notifications");
    const dataPlane = resolveFederatedDataPlaneRouter(
      {
        FEDERATED_DATA_PLANE_ENABLED: "true",
        FEDERATED_DATA_PLANE_QUOTA_SNAPSHOTS_JSON: JSON.stringify({
          version: FEDERATED_DATA_PLANE_QUOTA_SNAPSHOT_VERSION,
          shards: {
            "firestore-notifications": {
              health: value.health,
              usageRatio: value.usageRatio,
              forecastRatio: value.forecastRatio,
              observedAtEpochMs: value.observedAtEpochMs,
              staleAfterMs: value.staleAfterMs,
            },
          },
        }),
      },
      () => NOW,
    );

    expect(dataPlane).not.toBeNull();
    await expect(dataPlane?.plan({ routeId: "notification-write" }))
      .resolves.toMatchObject({
        outcome: "selected",
        primary: {
          shardId: "firestore-notifications",
          providerId: "firestore-free",
        },
      });
  });

  it("is opt-in and rejects malformed environment policy without leaking it", () => {
    expect(resolveFederatedDataPlaneRouter({}, () => NOW)).toBeNull();
    expect(() => resolveFederatedDataPlaneRouter(
      {
        FEDERATED_DATA_PLANE_ENABLED: "true",
        FEDERATED_DATA_PLANE_QUOTA_SNAPSHOTS_JSON: "not-json-secret",
      },
      () => NOW,
    )).toThrow(FederatedDataPlaneConfigurationError);
  });

  it("rejects unknown routes before consulting any provider", async () => {
    const source = { readSnapshot: vi.fn(async () => null) };
    const dataPlane = new FederatedDataPlaneRouter({
      enabledShardIds: ["firestore-notifications"],
      snapshots: source,
      now: () => NOW,
    });

    await expect(dataPlane.plan({ routeId: "missing-route" })).resolves.toEqual({
      outcome: "rejected",
      routeId: "missing-route",
      reason: "POLICY_INVALID",
      rejectedShardIds: [],
    });
    expect(source.readSnapshot).not.toHaveBeenCalled();
  });
});
