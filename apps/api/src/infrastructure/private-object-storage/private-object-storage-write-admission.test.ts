import { describe, expect, it, vi } from "vitest";

import type { UploadPrivateObject } from "./private-object-storage.contract";
import type { PrivateObjectStorageProviderId } from "./purpose-routed-private-object-storage.port";
import {
  FreeTierPrivateObjectStorageWriteAdmission,
  PRIVATE_OBJECT_STORAGE_QUOTA_POLICY_VERSION,
  resolvePrivateObjectStorageWriteAdmission,
  type PrivateObjectStorageFreeTierBudget,
  type PrivateObjectStorageQuotaSnapshot,
  type PrivateObjectStorageQuotaSnapshotSource,
} from "./private-object-storage-write-admission";

const NOW = 1_800_000_000_000;
const CAPACITY_BYTES = 1_000;

function upload(
  byteLength = 100,
  purpose: UploadPrivateObject["purpose"] = "derived",
): UploadPrivateObject {
  return {
    purpose,
    contentType: "image/png",
    bytes: new Uint8Array(byteLength),
    controlMetadata: {
      documentId: "work:quota-test",
      operationId: `upload:${purpose}`,
    },
  };
}

function budget(
  providerId: PrivateObjectStorageProviderId = "cloudflare-r2",
): PrivateObjectStorageFreeTierBudget {
  return {
    providerId,
    capacityBytes: CAPACITY_BYTES,
    applicationHardCapRatio: 0.8,
    billingBoundary: providerId === "supabase"
      ? "hard-stop-free"
      : "free-allowance-with-app-cap",
  };
}

function snapshot(
  overrides: Partial<PrivateObjectStorageQuotaSnapshot> = {},
): PrivateObjectStorageQuotaSnapshot {
  return {
    providerId: "cloudflare-r2",
    health: "healthy",
    usedBytes: 400,
    forecastBytes: 600,
    observedAtEpochMs: NOW - 1_000,
    staleAfterMs: 60_000,
    ...overrides,
  };
}

function admission(
  value: PrivateObjectStorageQuotaSnapshot | null,
  providerId: PrivateObjectStorageProviderId = "cloudflare-r2",
) {
  const source: PrivateObjectStorageQuotaSnapshotSource = {
    readSnapshot: vi.fn(async () => value),
  };
  return {
    guard: new FreeTierPrivateObjectStorageWriteAdmission({
      budgets: new Map([[providerId, budget(providerId)]]),
      snapshots: source,
      now: () => NOW,
    }),
    source,
  };
}

describe("free-tier private object storage write admission", () => {
  it("admits a write when forecast usage plus the upload stays below the app cap", async () => {
    const { guard, source } = admission(snapshot());

    await expect(
      guard.assertUploadAllowed("cloudflare-r2", upload(100)),
    ).resolves.toBeUndefined();
    expect(source.readSnapshot).toHaveBeenCalledWith("cloudflare-r2");
  });

  it("rejects a write before it crosses the application hard cap", async () => {
    const { guard } = admission(snapshot({
      usedBytes: 720,
      forecastBytes: 750,
    }));

    await expect(
      guard.assertUploadAllowed("cloudflare-r2", upload(100)),
    ).rejects.toMatchObject({ code: "QUOTA_EXHAUSTED" });
  });

  it("fails closed when quota telemetry is missing, stale, invalid, or unreadable", async () => {
    const missing = admission(null).guard;
    const stale = admission(snapshot({
      observedAtEpochMs: NOW - 120_000,
      staleAfterMs: 60_000,
    })).guard;
    const invalid = admission(snapshot({ usedBytes: -1 })).guard;
    const unreadable = new FreeTierPrivateObjectStorageWriteAdmission({
      budgets: new Map([["cloudflare-r2", budget()]]),
      snapshots: {
        readSnapshot: vi.fn(async () => {
          throw new Error("telemetry unavailable");
        }),
      },
      now: () => NOW,
    });

    for (const guard of [missing, stale, invalid, unreadable]) {
      await expect(
        guard.assertUploadAllowed("cloudflare-r2", upload()),
      ).rejects.toMatchObject({ code: "QUOTA_SNAPSHOT_REQUIRED" });
    }
  });

  it("rejects degraded and unavailable providers for writes", async () => {
    for (const health of ["degraded", "unavailable"] as const) {
      const { guard } = admission(snapshot({ health }));
      await expect(
        guard.assertUploadAllowed("cloudflare-r2", upload()),
      ).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
    }
  });

  it("maps Supabase to the policy provider without changing the routed provider id", async () => {
    const { guard, source } = admission(snapshot({
      providerId: "supabase",
      usedBytes: 100,
      forecastBytes: 200,
    }), "supabase");

    await expect(
      guard.assertUploadAllowed("supabase", upload(50, "source")),
    ).resolves.toBeUndefined();
    expect(source.readSnapshot).toHaveBeenCalledWith("supabase");
  });

  it("bootstraps the guard from an explicit reviewed environment snapshot", async () => {
    const guard = resolvePrivateObjectStorageWriteAdmission(
      {
        PRIVATE_OBJECT_STORAGE_QUOTA_GUARD_ENABLED: "true",
        PRIVATE_OBJECT_STORAGE_QUOTA_SNAPSHOTS_JSON: JSON.stringify({
          version: PRIVATE_OBJECT_STORAGE_QUOTA_POLICY_VERSION,
          providers: {
            "cloudflare-r2": {
              capacityBytes: CAPACITY_BYTES,
              applicationHardCapRatio: 0.8,
              billingBoundary: "free-allowance-with-app-cap",
              health: "healthy",
              usedBytes: 400,
              forecastBytes: 500,
              observedAtEpochMs: NOW - 1_000,
              staleAfterMs: 60_000,
            },
            supabase: {
              capacityBytes: CAPACITY_BYTES,
              applicationHardCapRatio: 0.8,
              billingBoundary: "hard-stop-free",
              health: "healthy",
              usedBytes: 100,
              forecastBytes: 200,
              observedAtEpochMs: NOW - 1_000,
              staleAfterMs: 60_000,
            },
          },
        }),
      },
      {
        source: "cloudflare-r2",
        derived: "supabase",
        export: "supabase",
      },
      () => NOW,
    );

    expect(guard).not.toBeNull();
    await expect(
      guard?.assertUploadAllowed("cloudflare-r2", upload(100, "source")),
    ).resolves.toBeUndefined();
    await expect(
      guard?.assertUploadAllowed("supabase", upload(100, "derived")),
    ).resolves.toBeUndefined();
  });

  it("keeps the environment guard opt-in and rejects incomplete policies", () => {
    const routing = {
      source: "cloudflare-r2",
      derived: "supabase",
      export: "supabase",
    } as const;
    expect(resolvePrivateObjectStorageWriteAdmission(
      {},
      routing,
      () => NOW,
    )).toBeNull();
    expect(
      () => resolvePrivateObjectStorageWriteAdmission(
        {
          PRIVATE_OBJECT_STORAGE_QUOTA_GUARD_ENABLED: "true",
          PRIVATE_OBJECT_STORAGE_QUOTA_SNAPSHOTS_JSON: JSON.stringify({
            version: PRIVATE_OBJECT_STORAGE_QUOTA_POLICY_VERSION,
            providers: {},
          }),
        },
        routing,
        () => NOW,
      ),
    ).toThrow(expect.objectContaining({ code: "QUOTA_POLICY_INVALID" }));
  });

  it("rejects missing or malformed provider budgets before any upload", async () => {
    const source: PrivateObjectStorageQuotaSnapshotSource = {
      readSnapshot: vi.fn(async () => snapshot()),
    };
    const missing = new FreeTierPrivateObjectStorageWriteAdmission({
      budgets: new Map(),
      snapshots: source,
      now: () => NOW,
    });

    await expect(
      missing.assertUploadAllowed("cloudflare-r2", upload()),
    ).rejects.toMatchObject({ code: "QUOTA_POLICY_INVALID" });
    expect(
      () => new FreeTierPrivateObjectStorageWriteAdmission({
        budgets: new Map([[
          "cloudflare-r2",
          { ...budget(), capacityBytes: 0 },
        ]]),
        snapshots: source,
        now: () => NOW,
      }),
    ).toThrow(expect.objectContaining({ code: "QUOTA_POLICY_INVALID" }));
  });
});
