import { describe, expect, it } from "vitest";

import {
  decideInfrastructurePlacement,
  planInfrastructurePlacement,
  type InfrastructureProviderPolicy,
  type InfrastructureProviderSnapshot,
  type InfrastructureWorkloadPolicy,
} from "./infrastructure-fabric";

const now = 1_800_000_000_000;

function provider(
  providerId: string,
  roles: readonly string[],
  hardCap = 0.8,
  boundary: InfrastructureProviderPolicy["billingBoundary"] =
    "free-allowance-with-app-cap",
  overrides: Partial<InfrastructureProviderPolicy> = {},
): InfrastructureProviderPolicy {
  return {
    providerId,
    roles,
    billingBoundary: boundary,
    applicationHardCapRatio: hardCap,
    ...overrides,
  };
}

function snapshot(
  providerId: string,
  usageRatio: number,
  health: InfrastructureProviderSnapshot["health"] = "healthy",
  overrides: Partial<InfrastructureProviderSnapshot> = {},
): InfrastructureProviderSnapshot {
  return {
    providerId,
    usageRatio,
    health,
    observedAtEpochMs: now - 1_000,
    staleAfterMs: 60_000,
    ...overrides,
  };
}

function workload(
  overrides: Partial<InfrastructureWorkloadPolicy> = {},
): InfrastructureWorkloadPolicy {
  return {
    workloadId: "catalog-read",
    operation: "read",
    consistency: "derived",
    authority: "turso",
    candidates: ["turso", "d1"],
    requiredRoles: ["catalog-read"],
    allowReadFallback: true,
    ...overrides,
  };
}

describe("infrastructure fabric placement", () => {
  it("never fails an authoritative write over to a second provider", () => {
    const providers = new Map<string, InfrastructureProviderPolicy>([
      ["neon-core", provider("neon-core", ["ledger-write"])],
      ["d1", provider("d1", ["ledger-write"])],
    ]);
    const decision = decideInfrastructurePlacement({
      workload: workload({
        workloadId: "core-ledger-write",
        operation: "write",
        consistency: "authoritative",
        authority: "neon-core",
        candidates: ["neon-core"],
        requiredRoles: ["ledger-write"],
        allowReadFallback: false,
      }),
      providers,
      snapshots: new Map([
        ["neon-core", snapshot("neon-core", 0.81)],
      ]),
      nowEpochMs: now,
    });

    expect(decision).toEqual({
      outcome: "rejected",
      reason: "QUOTA_EXHAUSTED",
      rejectedProviders: ["neon-core"],
    });
  });

  it("rejects replica fallback for authoritative reads", () => {
    const providers = new Map<string, InfrastructureProviderPolicy>([
      ["neon-core", provider("neon-core", ["ledger-read"])],
      ["read-replica", provider("read-replica", ["ledger-read"])],
    ]);
    const decision = decideInfrastructurePlacement({
      workload: workload({
        workloadId: "core-ledger-read",
        consistency: "authoritative",
        authority: "neon-core",
        candidates: ["neon-core", "read-replica"],
        requiredRoles: ["ledger-read"],
        allowReadFallback: true,
      }),
      providers,
      snapshots: new Map([
        ["neon-core", snapshot("neon-core", 0.4)],
        ["read-replica", snapshot("read-replica", 0.1)],
      ]),
      nowEpochMs: now,
    });

    expect(decision).toEqual({
      outcome: "rejected",
      reason: "POLICY_INVALID",
      rejectedProviders: ["neon-core", "read-replica"],
    });
  });

  it("routes a derived read to the healthy replica with the most free headroom", () => {
    const providers = new Map<string, InfrastructureProviderPolicy>([
      ["turso", provider("turso", ["catalog-read"])],
      ["d1", provider("d1", ["catalog-read"])],
    ]);
    const decision = decideInfrastructurePlacement({
      workload: workload(),
      providers,
      snapshots: new Map([
        ["turso", snapshot("turso", 0.72)],
        ["d1", snapshot("d1", 0.2)],
      ]),
      nowEpochMs: now,
    });

    expect(decision).toMatchObject({
      outcome: "selected",
      providerId: "d1",
      fallback: true,
    });
  });

  it("allows hard-stop reads but requires telemetry before using a billable allowance", () => {
    const providers = new Map<string, InfrastructureProviderPolicy>([
      [
        "turso",
        provider(
          "turso",
          ["catalog-read", "catalog-write"],
          0.8,
          "hard-stop-free",
        ),
      ],
      ["r2", provider("r2", ["catalog-read"])],
    ]);
    const hardStopRead = decideInfrastructurePlacement({
      workload: workload({ candidates: ["turso"] }),
      providers,
      snapshots: new Map(),
      nowEpochMs: now,
    });
    const allowanceRead = decideInfrastructurePlacement({
      workload: workload({ authority: "r2", candidates: ["r2"] }),
      providers,
      snapshots: new Map(),
      nowEpochMs: now,
    });
    const write = decideInfrastructurePlacement({
      workload: workload({
        workloadId: "catalog-write",
        operation: "write",
        consistency: "derived",
        candidates: ["turso"],
        requiredRoles: ["catalog-write"],
        allowReadFallback: false,
      }),
      providers,
      snapshots: new Map(),
      nowEpochMs: now,
    });

    expect(hardStopRead).toMatchObject({
      outcome: "selected",
      providerId: "turso",
    });
    expect(allowanceRead).toMatchObject({
      outcome: "rejected",
      reason: "QUOTA_SNAPSHOT_REQUIRED",
    });
    expect(write).toMatchObject({
      outcome: "rejected",
      reason: "QUOTA_SNAPSHOT_REQUIRED",
    });
  });

  it("keeps local and user-owned writes available without cloud quota telemetry", () => {
    const providers = new Map<string, InfrastructureProviderPolicy>([
      [
        "opfs",
        provider(
          "opfs",
          ["private-project-write"],
          0.95,
          "device-owned",
        ),
      ],
      [
        "byos",
        provider(
          "byos",
          ["private-project-write"],
          0.95,
          "user-owned",
        ),
      ],
    ]);
    const decision = decideInfrastructurePlacement({
      workload: workload({
        workloadId: "private-project-write",
        operation: "write",
        consistency: "replicated",
        authority: "opfs",
        candidates: ["opfs", "byos"],
        requiredRoles: ["private-project-write"],
        allowReadFallback: false,
      }),
      providers,
      snapshots: new Map(),
      nowEpochMs: now,
    });

    expect(decision).toMatchObject({
      outcome: "selected",
      providerId: "opfs",
    });
  });

  it("accounts for estimated write size before selecting a free provider", () => {
    const providers = new Map<string, InfrastructureProviderPolicy>([
      ["r2", provider("r2", ["thumbnail-write"])],
      ["imagekit", provider("imagekit", ["thumbnail-write"])],
    ]);
    const decision = decideInfrastructurePlacement({
      workload: workload({
        workloadId: "thumbnail-write",
        operation: "write",
        consistency: "derived",
        authority: "r2",
        candidates: ["r2", "imagekit"],
        requiredRoles: ["thumbnail-write"],
        allowReadFallback: false,
      }),
      providers,
      snapshots: new Map([
        ["r2", snapshot("r2", 0.79)],
        ["imagekit", snapshot("imagekit", 0.4)],
      ]),
      nowEpochMs: now,
      estimatedQuotaImpact: 0.02,
    });

    expect(decision).toMatchObject({
      outcome: "selected",
      providerId: "imagekit",
      fallback: true,
    });
  });

  it("rejects mismatched or future quota telemetry as an invalid policy input", () => {
    const providers = new Map<string, InfrastructureProviderPolicy>([
      ["turso", provider("turso", ["catalog-read"])],
    ]);
    const decision = decideInfrastructurePlacement({
      workload: workload({ candidates: ["turso"] }),
      providers,
      snapshots: new Map([
        [
          "turso",
          {
            ...snapshot("different-provider", 0.2),
            observedAtEpochMs: now + 1,
          },
        ],
      ]),
      nowEpochMs: now,
    });

    expect(decision).toEqual({
      outcome: "rejected",
      reason: "POLICY_INVALID",
      rejectedProviders: ["turso"],
    });
  });

  it("does not send writes to a degraded provider", () => {
    const providers = new Map<string, InfrastructureProviderPolicy>([
      ["r2", provider("r2", ["thumbnail-write"])],
      ["imagekit", provider("imagekit", ["thumbnail-write"])],
    ]);
    const decision = decideInfrastructurePlacement({
      workload: workload({
        workloadId: "thumbnail-write",
        operation: "write",
        consistency: "derived",
        authority: "r2",
        candidates: ["r2", "imagekit"],
        requiredRoles: ["thumbnail-write"],
        allowReadFallback: false,
      }),
      providers,
      snapshots: new Map([
        ["r2", snapshot("r2", 0.2, "degraded")],
        ["imagekit", snapshot("imagekit", 0.3)],
      ]),
      nowEpochMs: now,
    });

    expect(decision).toMatchObject({
      outcome: "selected",
      providerId: "imagekit",
    });
  });

  it("distributes affinity keys deterministically according to provider traffic weights", () => {
    const providers = new Map<string, InfrastructureProviderPolicy>([
      [
        "turso",
        provider("turso", ["catalog-read"], 0.8, "hard-stop-free", {
          trafficWeight: 4,
        }),
      ],
      [
        "d1",
        provider("d1", ["catalog-read"], 0.8, "hard-stop-free", {
          trafficWeight: 1,
        }),
      ],
    ]);
    const snapshots = new Map([
      ["turso", snapshot("turso", 0.2)],
      ["d1", snapshot("d1", 0.2)],
    ]);
    const selected: Record<string, number> = { turso: 0, d1: 0 };

    for (let index = 0; index < 1_000; index += 1) {
      const routingKey = `catalog-request-${index}`;
      const first = decideInfrastructurePlacement({
        workload: workload({ trafficDistribution: "weighted-rendezvous" }),
        providers,
        snapshots,
        nowEpochMs: now,
        routingKey,
      });
      const second = decideInfrastructurePlacement({
        workload: workload({ trafficDistribution: "weighted-rendezvous" }),
        providers,
        snapshots,
        nowEpochMs: now,
        routingKey,
      });

      expect(second).toEqual(first);
      expect(first.outcome).toBe("selected");
      if (first.outcome === "selected") selected[first.providerId] += 1;
    }

    expect(selected.turso).toBeGreaterThan(700);
    expect(selected.d1).toBeGreaterThan(0);
  });

  it("routes by the most constrained quota dimension instead of an aggregate average", () => {
    const providers = new Map<string, InfrastructureProviderPolicy>([
      ["r2", provider("r2", ["asset-read"])],
      ["b2", provider("b2", ["asset-read"])],
    ]);
    const decision = decideInfrastructurePlacement({
      workload: workload({
        workloadId: "asset-read",
        authority: "r2",
        candidates: ["r2", "b2"],
        requiredRoles: ["asset-read"],
        quotaDimensions: ["requests", "egress"],
      }),
      providers,
      snapshots: new Map([
        [
          "r2",
          snapshot("r2", 0.2, "healthy", {
            quotaDimensions: {
              requests: { usageRatio: 0.2 },
              egress: { usageRatio: 0.79 },
            },
          }),
        ],
        [
          "b2",
          snapshot("b2", 0.3, "healthy", {
            quotaDimensions: {
              requests: { usageRatio: 0.3 },
              egress: { usageRatio: 0.3 },
            },
          }),
        ],
      ]),
      nowEpochMs: now,
      estimatedQuotaImpactByDimension: {
        requests: 0.01,
        egress: 0.02,
      },
    });

    expect(decision).toMatchObject({
      outcome: "selected",
      providerId: "b2",
      bottleneckQuotaDimension: "egress",
    });
  });

  it("returns an ordered retry plan without retrying an already attempted provider", () => {
    const providers = new Map<string, InfrastructureProviderPolicy>([
      ["static", provider("static", ["catalog-read"], 1, "hard-stop-free")],
      ["turso", provider("turso", ["catalog-read"], 1, "hard-stop-free")],
      ["d1", provider("d1", ["catalog-read"], 1, "hard-stop-free")],
    ]);
    const plan = planInfrastructurePlacement({
      workload: workload({
        authority: "turso",
        candidates: ["turso", "d1", "static"],
        trafficDistribution: "weighted-rendezvous",
      }),
      providers,
      snapshots: new Map([
        ["static", snapshot("static", 0.1)],
        ["turso", snapshot("turso", 0.1)],
        ["d1", snapshot("d1", 0.1)],
      ]),
      nowEpochMs: now,
      routingKey: "catalog:popular",
      excludedProviderIds: ["turso"],
    });

    expect(plan.outcome).toBe("selected");
    if (plan.outcome === "selected") {
      expect(plan.primary.providerId).not.toBe("turso");
      expect(plan.retries).toHaveLength(1);
      expect(plan.rejectedProviders).toEqual(["turso"]);
      expect(new Set([
        plan.primary.providerId,
        ...plan.retries.map(({ providerId }) => providerId),
      ])).toEqual(new Set(["d1", "static"]));
    }
  });

  it("accepts empty exclusion and quota-impact maps from generic callers", () => {
    const providers = new Map<string, InfrastructureProviderPolicy>([
      ["turso", provider("turso", ["catalog-read"], 0.8, "hard-stop-free")],
      ["d1", provider("d1", ["catalog-read"], 0.8, "hard-stop-free")],
    ]);
    const decision = decideInfrastructurePlacement({
      workload: workload(),
      providers,
      snapshots: new Map(),
      nowEpochMs: now,
      estimatedQuotaImpactByDimension: {},
      excludedProviderIds: [],
    });

    expect(decision).toMatchObject({ outcome: "selected" });
  });

  it("never emits automatic retry targets for write workloads", () => {
    const providers = new Map<string, InfrastructureProviderPolicy>([
      ["r2", provider("r2", ["thumbnail-write"])],
      ["imagekit", provider("imagekit", ["thumbnail-write"])],
    ]);
    const plan = planInfrastructurePlacement({
      workload: workload({
        workloadId: "thumbnail-write",
        operation: "write",
        consistency: "derived",
        authority: "r2",
        candidates: ["r2", "imagekit"],
        requiredRoles: ["thumbnail-write"],
        allowReadFallback: false,
      }),
      providers,
      snapshots: new Map([
        ["r2", snapshot("r2", 0.2)],
        ["imagekit", snapshot("imagekit", 0.3)],
      ]),
      nowEpochMs: now,
    });

    expect(plan.outcome).toBe("selected");
    if (plan.outcome === "selected") expect(plan.retries).toEqual([]);
  });

  it("fails closed when a declared quota dimension is missing from telemetry", () => {
    const providers = new Map<string, InfrastructureProviderPolicy>([
      ["r2", provider("r2", ["asset-read"])],
    ]);
    const decision = decideInfrastructurePlacement({
      workload: workload({
        workloadId: "asset-read",
        authority: "r2",
        candidates: ["r2"],
        requiredRoles: ["asset-read"],
        quotaDimensions: ["requests", "egress"],
      }),
      providers,
      snapshots: new Map([
        [
          "r2",
          snapshot("r2", 0.2, "healthy", {
            quotaDimensions: { requests: { usageRatio: 0.2 } },
          }),
        ],
      ]),
      nowEpochMs: now,
    });

    expect(decision).toEqual({
      outcome: "rejected",
      reason: "QUOTA_SNAPSHOT_REQUIRED",
      rejectedProviders: ["r2"],
    });
  });
});
