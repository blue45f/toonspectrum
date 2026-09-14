import { describe, expect, it } from "vitest";

import {
  decideInfrastructurePlacement,
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
): InfrastructureProviderPolicy {
  return {
    providerId,
    roles,
    billingBoundary: boundary,
    applicationHardCapRatio: hardCap,
  };
}

function snapshot(
  providerId: string,
  usageRatio: number,
  health: InfrastructureProviderSnapshot["health"] = "healthy",
): InfrastructureProviderSnapshot {
  return {
    providerId,
    usageRatio,
    health,
    observedAtEpochMs: now - 1_000,
    staleAfterMs: 60_000,
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
});
