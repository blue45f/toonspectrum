import {
  decideInfrastructurePlacement,
  INFRASTRUCTURE_PROVIDER_HEALTH,
  type InfrastructureBillingBoundary,
  type InfrastructureProviderPolicy,
  type InfrastructureProviderSnapshot,
  type InfrastructureWorkloadPolicy,
} from "../../../../../../packages/core/src/infrastructure-fabric";

import type {
  PrivateObjectPurpose,
  UploadPrivateObject,
} from "./private-object-storage.contract";
import { PrivateObjectStorageError } from "./private-object-storage.error";
import type {
  PrivateObjectStorageProviderId,
  PrivateObjectStoragePurposeRouting,
} from "./purpose-routed-private-object-storage.port";

const PRIVATE_OBJECT_STORAGE_ROLE = "private-object-storage" as const;

export const PRIVATE_OBJECT_STORAGE_QUOTA_POLICY_VERSION =
  "toonspectrum.private-object-storage-quota.v1" as const;

export interface PrivateObjectStorageFreeTierBudget {
  readonly providerId: PrivateObjectStorageProviderId;
  readonly capacityBytes: number;
  readonly applicationHardCapRatio: number;
  readonly billingBoundary: Extract<
    InfrastructureBillingBoundary,
    "hard-stop-free" | "free-allowance-with-app-cap"
  >;
}

export interface PrivateObjectStorageQuotaSnapshot {
  readonly providerId: PrivateObjectStorageProviderId;
  readonly health: (typeof INFRASTRUCTURE_PROVIDER_HEALTH)[number];
  readonly usedBytes: number;
  readonly forecastBytes?: number;
  readonly observedAtEpochMs: number;
  readonly staleAfterMs: number;
}

export interface PrivateObjectStorageQuotaSnapshotSource {
  readSnapshot(
    providerId: PrivateObjectStorageProviderId,
  ): Promise<PrivateObjectStorageQuotaSnapshot | null>;
}

export interface PrivateObjectStorageWriteAdmission {
  assertUploadAllowed(
    providerId: PrivateObjectStorageProviderId,
    input: UploadPrivateObject,
  ): Promise<void>;
}

export interface FreeTierPrivateObjectStorageWriteAdmissionOptions {
  readonly budgets: ReadonlyMap<
    PrivateObjectStorageProviderId,
    PrivateObjectStorageFreeTierBudget
  >;
  readonly snapshots: PrivateObjectStorageQuotaSnapshotSource;
  readonly now?: () => number;
}

function infrastructureProviderId(
  providerId: PrivateObjectStorageProviderId,
): string {
  return providerId === "supabase"
    ? "supabase-object-storage"
    : providerId;
}

function isRatio(value: number): boolean {
  return Number.isFinite(value) && value > 0 && value <= 1;
}

function validBudget(
  providerId: PrivateObjectStorageProviderId,
  budget: PrivateObjectStorageFreeTierBudget,
): boolean {
  return budget.providerId === providerId
    && Number.isSafeInteger(budget.capacityBytes)
    && budget.capacityBytes > 0
    && isRatio(budget.applicationHardCapRatio)
    && (budget.billingBoundary === "hard-stop-free"
      || budget.billingBoundary === "free-allowance-with-app-cap");
}

function validSnapshot(
  providerId: PrivateObjectStorageProviderId,
  snapshot: PrivateObjectStorageQuotaSnapshot,
  nowEpochMs: number,
): boolean {
  return snapshot.providerId === providerId
    && INFRASTRUCTURE_PROVIDER_HEALTH.includes(snapshot.health)
    && Number.isSafeInteger(snapshot.usedBytes)
    && snapshot.usedBytes >= 0
    && (snapshot.forecastBytes === undefined
      || (Number.isSafeInteger(snapshot.forecastBytes)
        && snapshot.forecastBytes >= 0))
    && Number.isSafeInteger(snapshot.observedAtEpochMs)
    && snapshot.observedAtEpochMs > 0
    && snapshot.observedAtEpochMs <= nowEpochMs
    && Number.isSafeInteger(snapshot.staleAfterMs)
    && snapshot.staleAfterMs > 0;
}

function workloadFor(
  purpose: PrivateObjectPurpose,
  providerId: string,
): InfrastructureWorkloadPolicy {
  return {
    workloadId: `private-object-${purpose}-write`,
    operation: "write",
    consistency: purpose === "source" ? "authoritative" : "derived",
    authority: providerId,
    candidates: [providerId],
    requiredRoles: [PRIVATE_OBJECT_STORAGE_ROLE],
    allowReadFallback: false,
  };
}

function providerPolicy(
  providerId: string,
  budget: PrivateObjectStorageFreeTierBudget,
): InfrastructureProviderPolicy {
  return {
    providerId,
    roles: [PRIVATE_OBJECT_STORAGE_ROLE],
    billingBoundary: budget.billingBoundary,
    applicationHardCapRatio: budget.applicationHardCapRatio,
  };
}

function snapshotFor(
  providerId: string,
  budget: PrivateObjectStorageFreeTierBudget,
  snapshot: PrivateObjectStorageQuotaSnapshot,
): InfrastructureProviderSnapshot {
  return {
    providerId,
    health: snapshot.health,
    usageRatio: Math.min(1, snapshot.usedBytes / budget.capacityBytes),
    forecastRatio: Math.min(
      1,
      (snapshot.forecastBytes ?? snapshot.usedBytes) / budget.capacityBytes,
    ),
    observedAtEpochMs: snapshot.observedAtEpochMs,
    staleAfterMs: snapshot.staleAfterMs,
  };
}

function rejectionCode(
  reason:
    | "POLICY_INVALID"
    | "AUTHORITY_UNAVAILABLE"
    | "NO_ELIGIBLE_PROVIDER"
    | "QUOTA_EXHAUSTED"
    | "QUOTA_SNAPSHOT_REQUIRED",
):
  | "QUOTA_POLICY_INVALID"
  | "PROVIDER_UNAVAILABLE"
  | "QUOTA_EXHAUSTED"
  | "QUOTA_SNAPSHOT_REQUIRED" {
  switch (reason) {
    case "QUOTA_EXHAUSTED":
      return "QUOTA_EXHAUSTED";
    case "QUOTA_SNAPSHOT_REQUIRED":
      return "QUOTA_SNAPSHOT_REQUIRED";
    case "POLICY_INVALID":
      return "QUOTA_POLICY_INVALID";
    case "AUTHORITY_UNAVAILABLE":
    case "NO_ELIGIBLE_PROVIDER":
      return "PROVIDER_UNAVAILABLE";
  }
}

/**
 * Fail-closed admission for operator-funded object storage.
 *
 * This class deliberately does not select another provider. The current v1
 * object reference contains no provider locator, so automatic fallback writes
 * would make later reads ambiguous. Purpose routing remains the location
 * authority; this guard only admits or rejects the selected provider before a
 * byte leaves the API process.
 */
export class FreeTierPrivateObjectStorageWriteAdmission
  implements PrivateObjectStorageWriteAdmission
{
  private readonly now: () => number;

  constructor(
    private readonly options: FreeTierPrivateObjectStorageWriteAdmissionOptions,
  ) {
    this.now = options.now ?? Date.now;
    for (const [providerId, budget] of options.budgets) {
      if (!validBudget(providerId, budget)) {
        throw new PrivateObjectStorageError("QUOTA_POLICY_INVALID");
      }
    }
  }

  async assertUploadAllowed(
    providerId: PrivateObjectStorageProviderId,
    input: UploadPrivateObject,
  ): Promise<void> {
    const budget = this.options.budgets.get(providerId);
    if (!budget) {
      throw new PrivateObjectStorageError("QUOTA_POLICY_INVALID");
    }

    const nowEpochMs = this.now();
    if (!Number.isSafeInteger(nowEpochMs) || nowEpochMs <= 0) {
      throw new PrivateObjectStorageError("QUOTA_POLICY_INVALID");
    }

    let quotaSnapshot: PrivateObjectStorageQuotaSnapshot | null;
    try {
      quotaSnapshot = await this.options.snapshots.readSnapshot(providerId);
    } catch {
      throw new PrivateObjectStorageError("QUOTA_SNAPSHOT_REQUIRED");
    }
    if (!quotaSnapshot || !validSnapshot(providerId, quotaSnapshot, nowEpochMs)) {
      throw new PrivateObjectStorageError("QUOTA_SNAPSHOT_REQUIRED");
    }

    const policyProviderId = infrastructureProviderId(providerId);
    const decision = decideInfrastructurePlacement({
      workload: workloadFor(input.purpose, policyProviderId),
      providers: new Map<string, InfrastructureProviderPolicy>([[
        policyProviderId,
        providerPolicy(policyProviderId, budget),
      ]]),
      snapshots: new Map<string, InfrastructureProviderSnapshot>([[
        policyProviderId,
        snapshotFor(policyProviderId, budget, quotaSnapshot),
      ]]),
      nowEpochMs,
      estimatedQuotaImpact: Math.min(
        1,
        input.bytes.byteLength / budget.capacityBytes,
      ),
    });

    if (decision.outcome === "rejected") {
      throw new PrivateObjectStorageError(rejectionCode(decision.reason));
    }
    if (decision.providerId !== policyProviderId || decision.fallback) {
      throw new PrivateObjectStorageError("QUOTA_POLICY_INVALID");
    }
  }
}

interface EnvironmentQuotaProviderRecord {
  readonly capacityBytes: number;
  readonly applicationHardCapRatio: number;
  readonly billingBoundary: PrivateObjectStorageFreeTierBudget["billingBoundary"];
  readonly health: PrivateObjectStorageQuotaSnapshot["health"];
  readonly usedBytes: number;
  readonly forecastBytes?: number;
  readonly observedAtEpochMs: number;
  readonly staleAfterMs: number;
}

function environmentRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseEnvironmentProviderRecord(
  providerId: PrivateObjectStorageProviderId,
  value: unknown,
  nowEpochMs: number,
): {
  readonly budget: PrivateObjectStorageFreeTierBudget;
  readonly snapshot: PrivateObjectStorageQuotaSnapshot;
} {
  if (!environmentRecord(value)) {
    throw new PrivateObjectStorageError("QUOTA_POLICY_INVALID");
  }
  const record = value as unknown as EnvironmentQuotaProviderRecord;
  const budget: PrivateObjectStorageFreeTierBudget = {
    providerId,
    capacityBytes: record.capacityBytes,
    applicationHardCapRatio: record.applicationHardCapRatio,
    billingBoundary: record.billingBoundary,
  };
  const snapshot: PrivateObjectStorageQuotaSnapshot = {
    providerId,
    health: record.health,
    usedBytes: record.usedBytes,
    forecastBytes: record.forecastBytes,
    observedAtEpochMs: record.observedAtEpochMs,
    staleAfterMs: record.staleAfterMs,
  };
  if (!validBudget(providerId, budget)
    || !validSnapshot(providerId, snapshot, nowEpochMs)) {
    throw new PrivateObjectStorageError("QUOTA_POLICY_INVALID");
  }
  return { budget, snapshot };
}

/**
 * Optional bootstrap for deployments that keep reviewed provider usage in a
 * deployment secret. The timestamp is intentionally preserved: once the
 * snapshot becomes stale, uploads stop instead of silently spending beyond
 * the free allowance. A live KV/D1-backed source can override this through
 * `PrivateObjectStorageRuntimes.writeAdmission` without changing the router.
 */
export function resolvePrivateObjectStorageWriteAdmission(
  environment:
    | NodeJS.ProcessEnv
    | Readonly<Record<string, string | undefined>>,
  routing: PrivateObjectStoragePurposeRouting,
  now: () => number = Date.now,
): PrivateObjectStorageWriteAdmission | null {
  const enabled = environment.PRIVATE_OBJECT_STORAGE_QUOTA_GUARD_ENABLED;
  if (enabled === undefined || enabled === "" || enabled === "false") {
    return null;
  }
  if (enabled !== "true") {
    throw new PrivateObjectStorageError("QUOTA_POLICY_INVALID");
  }

  const source = environment.PRIVATE_OBJECT_STORAGE_QUOTA_SNAPSHOTS_JSON;
  if (!source) {
    throw new PrivateObjectStorageError("QUOTA_POLICY_INVALID");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new PrivateObjectStorageError("QUOTA_POLICY_INVALID");
  }
  if (!environmentRecord(parsed)
    || parsed.version !== PRIVATE_OBJECT_STORAGE_QUOTA_POLICY_VERSION
    || !environmentRecord(parsed.providers)) {
    throw new PrivateObjectStorageError("QUOTA_POLICY_INVALID");
  }

  const nowEpochMs = now();
  if (!Number.isSafeInteger(nowEpochMs) || nowEpochMs <= 0) {
    throw new PrivateObjectStorageError("QUOTA_POLICY_INVALID");
  }
  const providerRecords = parsed.providers;
  const selectedProviders = new Set(Object.values(routing));
  const budgets = new Map<
    PrivateObjectStorageProviderId,
    PrivateObjectStorageFreeTierBudget
  >();
  const snapshots = new Map<
    PrivateObjectStorageProviderId,
    PrivateObjectStorageQuotaSnapshot
  >();
  for (const providerId of selectedProviders) {
    const resolved = parseEnvironmentProviderRecord(
      providerId,
      providerRecords[providerId],
      nowEpochMs,
    );
    budgets.set(providerId, resolved.budget);
    snapshots.set(providerId, resolved.snapshot);
  }

  return new FreeTierPrivateObjectStorageWriteAdmission({
    budgets,
    snapshots: {
      readSnapshot: async (providerId) => snapshots.get(providerId) ?? null,
    },
    now,
  });
}
