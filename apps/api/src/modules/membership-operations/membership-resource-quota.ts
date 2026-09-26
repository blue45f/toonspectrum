import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";

import {
  ACTIVITY_POINT_POLICIES,
  highestMembershipPlan,
  isMembershipPlanId,
  MEMBERSHIP_PLAN_POLICIES,
  type ActivityPointKey,
  type MembershipPlanId,
} from "../../../../../packages/core/src/membership-wallet";
import {
  creatorAssetStorageObjects,
  creatorWorkAssetStorageReferences,
  creatorWorkAssets,
  creatorWorks,
  db,
  membershipGrants,
  membershipPolicyOverrides,
  walletLots,
} from "../../platform/database";
import { creatorWorkRasterAssets } from "../../platform/database/studio-raster-asset.schema";
import {
  deriveMembershipResourceState,
  evaluateMembershipUploadQuota,
  type MembershipResourceQuotaKind,
  type MembershipResourceState,
} from "./membership-resource-policy";

type MembershipTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
export class MembershipResourceQuotaError extends Error {
  constructor(
    readonly quota: MembershipResourceQuotaKind,
    readonly current: number,
    readonly requested: number,
    readonly limit: number,
  ) {
    super(`membership_resource_${quota}_quota`);
    this.name = "MembershipResourceQuotaError";
  }
}

export interface EffectiveResourcePolicy {
  planId: MembershipPlanId;
  storageBytes: number;
  warningRatio: number;
  fileMaxBytes: number;
  dailyUploadMaxBytes: number;
  collaborationMembers: number;
}
export interface MembershipStorageUsage {
  workAssetBytes: number;
  rasterAssetBytes: number;
  generatedObjectBytes: number;
  totalBytes: number;
}

export interface MembershipResourceStateView {
  status: MembershipResourceState;
  overQuotaSince: Date | null;
  graceEndsAt: Date | null;
  canUpload: boolean;
}

function asSafeInt(value: unknown): number {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.floor(parsed));
}

function kstDayBounds(date = new Date()): {
  start: Date;
  end: Date;
  dayKey: string;
} {
  const shifted = new Date(date.getTime() + KST_OFFSET_MS);
  const dayKey = shifted.toISOString().slice(0, 10);
  const [year, month, day] = dayKey.split("-").map(Number);
  const start = new Date(Date.UTC(year!, month! - 1, day!) - KST_OFFSET_MS);
  return { start, end: new Date(start.getTime() + 86_400_000), dayKey };
}
function overrideRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const entitlements = (value as Record<string, unknown>).entitlements;
  return entitlements && typeof entitlements === "object" && !Array.isArray(entitlements)
    ? entitlements as Record<string, unknown>
    : {};
}

function overriddenInteger(
  override: unknown,
  key: string,
  fallback: number,
): number {
  const value = Number(overrideRecord(override)[key]);
  return Number.isSafeInteger(value) && value >= 0
    ? value
    : fallback;
}

function overriddenRatio(
  override: unknown,
  key: string,
  fallback: number,
): number {
  const value = Number(overrideRecord(override)[key]);
  return Number.isFinite(value) && value > 0 && value <= 1
    ? value
    : fallback;
}
export async function resolveEffectiveResourcePolicy(
  transaction: MembershipTransaction,
  userId: string,
): Promise<EffectiveResourcePolicy> {
  const grants = await transaction
    .select({ planId: membershipGrants.planId })
    .from(membershipGrants)
    .where(and(
      eq(membershipGrants.userId, userId),
      eq(membershipGrants.status, "active"),
      sql`${membershipGrants.startsAt} <= now()`,
      sql`(${membershipGrants.endsAt} IS NULL OR ${membershipGrants.endsAt} > now())`,
    ));
  const planId = highestMembershipPlan(
    grants.map((row) => row.planId).filter(isMembershipPlanId),
  );
  const base = MEMBERSHIP_PLAN_POLICIES[planId].entitlements;
  const [override] = await transaction
    .select({ value: membershipPolicyOverrides.value })
    .from(membershipPolicyOverrides)
    .where(and(
      eq(membershipPolicyOverrides.key, `plan:${planId}`),
      eq(membershipPolicyOverrides.active, true),
    ))
    .limit(1);
  return {
    planId,
    storageBytes: overriddenInteger(
      override?.value,
      "storage.bytes",
      Number(base["storage.bytes"]),
    ),
    warningRatio: overriddenRatio(
      override?.value,
      "storage.warningRatio",
      Number(base["storage.warningRatio"]),
    ),
    fileMaxBytes: overriddenInteger(
      override?.value,
      "upload.file.maxBytes",
      Number(base["upload.file.maxBytes"]),
    ),
    dailyUploadMaxBytes: overriddenInteger(
      override?.value,
      "upload.daily.maxBytes",
      Number(base["upload.daily.maxBytes"]),
    ),
    collaborationMembers: overriddenInteger(
      override?.value,
      "collaboration.members",
      Number(base["collaboration.members"]),
    ),
  };
}

export async function readMembershipStorageUsage(
  transaction: MembershipTransaction,
  userId: string,
): Promise<MembershipStorageUsage> {
  const [[workAsset], [rasterAsset], generatedResult] = await Promise.all([
    transaction
      .select({
        bytes: sql<string>`coalesce(sum(${creatorWorkAssets.byteSize}), 0)::bigint`,
      })
      .from(creatorWorkAssets)
      .innerJoin(creatorWorks, eq(creatorWorks.id, creatorWorkAssets.workId))
      .where(eq(creatorWorks.userId, userId)),
    transaction
      .select({
        bytes: sql<string>`coalesce(sum(${creatorWorkRasterAssets.byteLength}), 0)::bigint`,
      })
      .from(creatorWorkRasterAssets)
      .innerJoin(creatorWorks, eq(creatorWorks.id, creatorWorkRasterAssets.workId))
      .where(eq(creatorWorks.userId, userId)),
    transaction.execute(sql`
      SELECT COALESCE(SUM(objects."byteLength"), 0)::bigint AS bytes
      FROM (
        SELECT DISTINCT storage.purpose, storage.digest, storage."byteLength"
        FROM ${creatorAssetStorageObjects} AS storage
        INNER JOIN ${creatorWorkAssetStorageReferences} AS reference
          ON reference.purpose = storage.purpose
         AND reference."objectDigest" = storage.digest
         AND reference.state = 'active'
        INNER JOIN ${creatorWorks} AS work ON work.id = reference."workId"
        WHERE work."userId" = ${userId}
          AND storage.state = 'active'
          AND storage.purpose IN ('derived', 'export')
      ) AS objects
    `),
  ]);

  const generatedRow = (generatedResult.rows?.[0] ?? {}) as Record<string, unknown>;
  const workAssetBytes = asSafeInt(workAsset?.bytes);
  const rasterAssetBytes = asSafeInt(rasterAsset?.bytes);
  const generatedObjectBytes = asSafeInt(generatedRow.bytes);
  return {
    workAssetBytes,
    rasterAssetBytes,
    generatedObjectBytes,
    totalBytes: workAssetBytes + rasterAssetBytes + generatedObjectBytes,
  };
}

export async function readDailyUploadBytes(
  transaction: MembershipTransaction,
  userId: string,
  now = new Date(),
): Promise<number> {
  const { start, end } = kstDayBounds(now);
  const result = await transaction.execute(sql`
    SELECT COALESCE(SUM(bytes), 0)::bigint AS bytes
    FROM membership_resource_usage_event
    WHERE "userId" = ${userId}
      AND kind = 'upload'
      AND "createdAt" >= ${start}
      AND "createdAt" < ${end}
  `);
  return asSafeInt((result.rows?.[0] as Record<string, unknown> | undefined)?.bytes);
}

async function insertNotice(
  transaction: MembershipTransaction,
  input: {
    userId: string;
    type: "storage_warning" | "storage_over_quota" | "storage_read_only" | "membership_expiring";
    dedupeKey: string;
    payload: Record<string, unknown>;
  },
): Promise<void> {
  await transaction.execute(sql`
    INSERT INTO membership_notice (id, "userId", type, "dedupeKey", payload)
    VALUES (
      ${randomUUID()}, ${input.userId}, ${input.type},
      ${input.dedupeKey}, ${JSON.stringify(input.payload)}::jsonb
    )
    ON CONFLICT ("userId", "dedupeKey") DO NOTHING
  `);
}
export async function reconcileMembershipResourceState(
  transaction: MembershipTransaction,
  input: {
    userId: string;
    planId: MembershipPlanId;
    usageBytes: number;
    limitBytes: number;
    warningRatio: number;
    now?: Date;
  },
): Promise<MembershipResourceStateView> {
  const now = input.now ?? new Date();
  const existing = await transaction.execute(sql`
    SELECT status, "overQuotaSince", "graceEndsAt"
    FROM membership_resource_state
    WHERE "userId" = ${input.userId}
    FOR UPDATE
  `);
  const row = (existing.rows?.[0] ?? null) as
    | { status?: string; overQuotaSince?: Date | string | null; graceEndsAt?: Date | string | null }
    | null;

  const derived = deriveMembershipResourceState({
    usageBytes: input.usageBytes,
    limitBytes: input.limitBytes,
    warningRatio: input.warningRatio,
    nowMs: now.getTime(),
    existingOverQuotaSinceMs: row?.overQuotaSince
      ? new Date(row.overQuotaSince).getTime()
      : null,
    existingGraceEndsAtMs: row?.graceEndsAt
      ? new Date(row.graceEndsAt).getTime()
      : null,
  });
  const status: MembershipResourceState = derived.status;
  const overQuotaSince = derived.overQuotaSinceMs === null
    ? null
    : new Date(derived.overQuotaSinceMs);
  const graceEndsAt = derived.graceEndsAtMs === null
    ? null
    : new Date(derived.graceEndsAtMs);

  await transaction.execute(sql`
    INSERT INTO membership_resource_state (
      "userId", "planId", status, "overQuotaSince", "graceEndsAt",
      "lastUsageBytes", "lastLimitBytes", "updatedAt"
    ) VALUES (
      ${input.userId}, ${input.planId}, ${status},
      ${overQuotaSince}, ${graceEndsAt},
      ${input.usageBytes}, ${input.limitBytes}, now()
    )
    ON CONFLICT ("userId") DO UPDATE SET
      "planId" = EXCLUDED."planId",
      status = EXCLUDED.status,
      "overQuotaSince" = EXCLUDED."overQuotaSince",
      "graceEndsAt" = EXCLUDED."graceEndsAt",
      "lastUsageBytes" = EXCLUDED."lastUsageBytes",
      "lastLimitBytes" = EXCLUDED."lastLimitBytes",
      "updatedAt" = now()
  `);

  const payload = {
    planId: input.planId,
    status,
    usageBytes: input.usageBytes,
    limitBytes: input.limitBytes,
    warningRatio: input.warningRatio,
    overQuotaSince: overQuotaSince?.toISOString() ?? null,
    graceEndsAt: graceEndsAt?.toISOString() ?? null,
  };
  if (status === "warning") {
    await insertNotice(transaction, {
      userId: input.userId,
      type: "storage_warning",
      dedupeKey: `storage-warning:${input.planId}`,
      payload,
    });
  } else if (status === "grace" && overQuotaSince) {
    await insertNotice(transaction, {
      userId: input.userId,
      type: "storage_over_quota",
      dedupeKey: `storage-over-quota:${overQuotaSince.toISOString()}`,
      payload,
    });
  } else if (status === "read_only" && graceEndsAt) {
    await insertNotice(transaction, {
      userId: input.userId,
      type: "storage_read_only",
      dedupeKey: `storage-read-only:${graceEndsAt.toISOString()}`,
      payload,
    });
  }

  return {
    status,
    overQuotaSince,
    graceEndsAt,
    canUpload: derived.canUpload,
  };
}

async function workOwner(
  transaction: MembershipTransaction,
  workId: string,
): Promise<string> {
  const [work] = await transaction
    .select({ ownerUserId: creatorWorks.userId })
    .from(creatorWorks)
    .where(eq(creatorWorks.id, workId))
    .limit(1);
  if (!work) throw new Error("membership_quota_work_not_found");
  return work.ownerUserId;
}

async function usageEventExists(
  transaction: MembershipTransaction,
  userId: string,
  sourceKey: string,
): Promise<boolean> {
  const result = await transaction.execute(sql`
    SELECT id
    FROM membership_resource_usage_event
    WHERE "userId" = ${userId}
      AND "sourceKey" = ${sourceKey}
    LIMIT 1
  `);
  return Boolean(result.rows?.[0]);
}

async function insertUsageEvent(
  transaction: MembershipTransaction,
  input: {
    userId: string;
    kind: "upload" | "generated";
    sourceKey: string;
    bytes: number;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await transaction.execute(sql`
    INSERT INTO membership_resource_usage_event (
      id, "userId", kind, "sourceKey", bytes, metadata
    ) VALUES (
      ${randomUUID()}, ${input.userId}, ${input.kind},
      ${input.sourceKey}, ${input.bytes},
      ${JSON.stringify(input.metadata ?? {})}::jsonb
    )
    ON CONFLICT ("userId", "sourceKey") DO NOTHING
  `);
}

export async function enforceMembershipUploadQuota(
  transaction: MembershipTransaction,
  input: {
    workId: string;
    incomingBytes: number;
    largestFileBytes?: number;
    sourceKey: string;
    metadata?: Record<string, unknown>;
  },
) {
  if (!Number.isSafeInteger(input.incomingBytes) || input.incomingBytes <= 0) {
    throw new MembershipResourceQuotaError("file", 0, input.incomingBytes, 0);
  }
  const ownerUserId = await workOwner(transaction, input.workId);
  await transaction.execute(sql`
    SELECT pg_advisory_xact_lock(
      hashtextextended(${`membership-storage:${ownerUserId}`}, 0)
    )
  `);
  const policy = await resolveEffectiveResourcePolicy(transaction, ownerUserId);
  if (await usageEventExists(transaction, ownerUserId, input.sourceKey)) {
    const usage = await readMembershipStorageUsage(transaction, ownerUserId);
    const daily = await readDailyUploadBytes(transaction, ownerUserId);
    return {
      ownerUserId,
      planId: policy.planId,
      storageBeforeBytes: usage.totalBytes,
      storageAfterBytes: usage.totalBytes,
      dailyBeforeBytes: daily,
      dailyAfterBytes: daily,
    };
  }
  const largestFileBytes = input.largestFileBytes ?? input.incomingBytes;
  const usage = await readMembershipStorageUsage(transaction, ownerUserId);
  const dailyBeforeBytes = await readDailyUploadBytes(transaction, ownerUserId);
  await reconcileMembershipResourceState(transaction, {
    userId: ownerUserId,
    planId: policy.planId,
    usageBytes: usage.totalBytes,
    limitBytes: policy.storageBytes,
    warningRatio: policy.warningRatio,
  });
  const violation = evaluateMembershipUploadQuota({
    currentStorageBytes: usage.totalBytes,
    dailyUploadBytes: dailyBeforeBytes,
    incomingBytes: input.incomingBytes,
    largestFileBytes,
    policy,
  });
  if (violation) {
    throw new MembershipResourceQuotaError(
      violation,
      violation === "storage"
        ? usage.totalBytes
        : violation === "daily-upload"
          ? dailyBeforeBytes
          : 0,
      violation === "file" ? largestFileBytes : input.incomingBytes,
      violation === "storage"
        ? policy.storageBytes
        : violation === "daily-upload"
          ? policy.dailyUploadMaxBytes
          : policy.fileMaxBytes,
    );
  }

  await insertUsageEvent(transaction, {
    userId: ownerUserId,
    kind: "upload",
    sourceKey: input.sourceKey,
    bytes: input.incomingBytes,
    metadata: input.metadata,
  });
  await reconcileMembershipResourceState(transaction, {
    userId: ownerUserId,
    planId: policy.planId,
    usageBytes: usage.totalBytes + input.incomingBytes,
    limitBytes: policy.storageBytes,
    warningRatio: policy.warningRatio,
  });
  return {
    ownerUserId,
    planId: policy.planId,
    storageBeforeBytes: usage.totalBytes,
    storageAfterBytes: usage.totalBytes + input.incomingBytes,
    dailyBeforeBytes,
    dailyAfterBytes: dailyBeforeBytes + input.incomingBytes,
  };
}

export async function enforceMembershipGeneratedStorageQuota(
  transaction: MembershipTransaction,
  input: {
    workId: string;
    purpose: "derived" | "export";
    digest: string;
    byteLength: number;
    sourceKey: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  if (!Number.isSafeInteger(input.byteLength) || input.byteLength <= 0) {
    throw new MembershipResourceQuotaError("file", 0, input.byteLength, 0);
  }
  const ownerUserId = await workOwner(transaction, input.workId);
  await transaction.execute(sql`
    SELECT pg_advisory_xact_lock(
      hashtextextended(${`membership-storage:${ownerUserId}`}, 0)
    )
  `);
  const policy = await resolveEffectiveResourcePolicy(transaction, ownerUserId);
  if (input.byteLength > policy.fileMaxBytes) {
    throw new MembershipResourceQuotaError(
      "file", 0, input.byteLength, policy.fileMaxBytes,
    );
  }
  if (await usageEventExists(transaction, ownerUserId, input.sourceKey)) return;

  const alreadyCounted = await transaction.execute(sql`
    SELECT 1
    FROM ${creatorWorkAssetStorageReferences} AS reference
    INNER JOIN ${creatorWorks} AS work ON work.id = reference."workId"
    WHERE work."userId" = ${ownerUserId}
      AND reference.purpose = ${input.purpose}
      AND reference."objectDigest" = ${input.digest}
      AND reference.state = 'active'
    LIMIT 1
  `);
  if (alreadyCounted.rows?.[0]) return;

  const usage = await readMembershipStorageUsage(transaction, ownerUserId);
  await reconcileMembershipResourceState(transaction, {
    userId: ownerUserId,
    planId: policy.planId,
    usageBytes: usage.totalBytes,
    limitBytes: policy.storageBytes,
    warningRatio: policy.warningRatio,
  });
  if (usage.totalBytes + input.byteLength > policy.storageBytes) {
    throw new MembershipResourceQuotaError(
      "storage", usage.totalBytes, input.byteLength, policy.storageBytes,
    );
  }

  await insertUsageEvent(transaction, {
    userId: ownerUserId,
    kind: "generated",
    sourceKey: input.sourceKey,
    bytes: input.byteLength,
    metadata: input.metadata,
  });
  await reconcileMembershipResourceState(transaction, {
    userId: ownerUserId,
    planId: policy.planId,
    usageBytes: usage.totalBytes + input.byteLength,
    limitBytes: policy.storageBytes,
    warningRatio: policy.warningRatio,
  });
}
export async function readActivityRewardUsage(
  transaction: MembershipTransaction,
  userId: string,
  now = new Date(),
): Promise<Record<ActivityPointKey, { used: number; limit: number; remaining: number }>> {
  const { start, end } = kstDayBounds(now);
  const result = {} as Record<
    ActivityPointKey,
    { used: number; limit: number; remaining: number }
  >;

  for (const policy of Object.values(ACTIVITY_POINT_POLICIES)) {
    const [override] = await transaction
      .select({ value: membershipPolicyOverrides.value })
      .from(membershipPolicyOverrides)
      .where(and(
        eq(membershipPolicyOverrides.key, `activity:${policy.key}`),
        eq(membershipPolicyOverrides.active, true),
      ))
      .limit(1);
    const overrideValue =
      override?.value
      && typeof override.value === "object"
      && !Array.isArray(override.value)
        ? override.value as Record<string, unknown>
        : {};
    const configuredLimit = Number(overrideValue.dailyGrantLimit);
    const limit = Number.isSafeInteger(configuredLimit) && configuredLimit >= 0
      ? configuredLimit
      : policy.dailyGrantLimit;

    const rows = await transaction
      .select({ count: sql<number>`count(*)::integer` })
      .from(walletLots)
      .where(and(
        eq(walletLots.userId, userId),
        eq(walletLots.asset, "reward_point"),
        eq(walletLots.source, `activity:${policy.key}`),
        sql`${walletLots.createdAt} >= ${start}`,
        sql`${walletLots.createdAt} < ${end}`,
      ));
    const used = asSafeInt(rows[0]?.count);
    result[policy.key] = {
      used,
      limit,
      remaining: Math.max(0, limit - used),
    };
  }
  return result;
}
