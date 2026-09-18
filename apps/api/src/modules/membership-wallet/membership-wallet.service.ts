import { randomUUID } from "node:crypto";

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { PoolClient } from "pg";

import {
  ACTIVITY_POINT_POLICIES,
  automaticCreatorLevel,
  type ActivityPointKey,
  CREDIT_COST_POLICIES,
  type CreditFeatureKey,
  highestMembershipPlan,
  isActivityPointKey,
  isCreditFeatureKey,
  isMembershipPlanId,
  MEMBER_CREATOR_LEVELS,
  MEMBER_SELLER_LEVELS,
  MEMBER_TRUST_LEVELS,
  MEMBERSHIP_ECONOMY_POLICY,
  MEMBERSHIP_ENTITLEMENT_KEYS,
  MEMBERSHIP_PLAN_POLICIES,
  type MemberCreatorLevel,
  type MemberSellerLevel,
  type MemberTrustLevel,
  type MembershipEntitlementKey,
  type MembershipPlanId,
  PUBLIC_WALLET_ASSET,
  REWARD_MILESTONES,
  type RewardMilestoneKey,
  type WalletAsset,
} from "../../../../../packages/core/src/membership-wallet";
import { dbPool } from "../../db";
import { isAdminUser } from "../../server/app-config";
import { logAuditAction } from "../admin/admin-types";

const RESERVATION_TTL_MS = 10 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

type WalletAccountRow = {
  id: string;
  userId: string;
  asset: WalletAsset;
  availableAmount: string | number;
  reservedAmount: string | number;
  lifetimeGranted: string | number;
  lifetimeSpent: string | number;
};

type ReservationRow = {
  id: string;
  accountId: string;
  userId: string;
  featureKey: string | null;
  requestedAmount: string | number;
  capturedAmount: string | number;
  idempotencyKey: string;
  status: "reserved" | "captured" | "released" | "expired";
  expiresAt: Date;
};

type LotRow = {
  id: string;
  accountId: string;
  remainingAmount: string | number;
  reservedAmount: string | number;
  spendPriority: number;
  expiresAt: Date | null;
};

type AllocationRow = {
  id: string;
  lotId: string;
  allocatedAmount: string | number;
  capturedAmount: string | number;
};

function asInt(value: string | number): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error("wallet_amount_out_of_safe_integer_range");
  }
  return parsed;
}

function requireUserId(userId: string | undefined): string {
  const normalized = userId?.trim();
  if (!normalized) throw new ForbiddenException("로그인이 필요해요.");
  return normalized;
}

function positiveInteger(value: unknown, label: string, max = 1_000_000_000): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > max) {
    throw new BadRequestException(`${label} 값이 올바르지 않습니다.`);
  }
  return parsed;
}

function nonNegativeInteger(value: unknown, label: string, max = 1_000_000_000): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > max) {
    throw new BadRequestException(label + " 값이 올바르지 않습니다.");
  }
  return parsed;
}

function signedNonZeroInteger(
  value: unknown,
  label: string,
  max = 1_000_000_000,
): number {
  const parsed = Number(value);
  if (
    !Number.isSafeInteger(parsed)
    || parsed === 0
    || Math.abs(parsed) > max
  ) {
    throw new BadRequestException(label + " 값이 올바르지 않습니다.");
  }
  return parsed;
}

function boundedText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function addUtcMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function sourcePriority(source: string): number {
  if (source === "promotion" || source === "event" || source === "compensation") return 10;
  if (source.startsWith("activity:")) return 20;
  if (source === "membership") return 30;
  if (source === "admin") return 40;
  if (source === "purchase") return 900;
  return 100;
}



function kstDayBounds(date = new Date()): {
  dayKey: string;
  start: Date;
  end: Date;
} {
  const shifted = new Date(date.getTime() + KST_OFFSET_MS);
  const dayKey = shifted.toISOString().slice(0, 10);
  const [year, month, day] = dayKey.split("-").map(Number);
  const start = new Date(Date.UTC(year!, month! - 1, day!) - KST_OFFSET_MS);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { dayKey, start, end };
}

function kstMonthBounds(date = new Date()) {
  const shifted = new Date(date.getTime() + KST_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth();
  const cycleKey = year + "-" + String(month + 1).padStart(2, "0");
  const start = new Date(Date.UTC(year, month, 1) - KST_OFFSET_MS);
  const end = new Date(Date.UTC(year, month + 1, 1) - KST_OFFSET_MS);
  return { cycleKey, start, end };
}

function rewardPointExpiry(from = new Date()): Date | null {
  const days = MEMBERSHIP_ECONOMY_POLICY.pointExpiryDays;
  return days === null ? null : new Date(from.getTime() + days * 86_400_000);
}

function isCreatorLevel(value: unknown): value is MemberCreatorLevel {
  return typeof value === "string"
    && (MEMBER_CREATOR_LEVELS as readonly string[]).includes(value);
}

function isTrustLevel(value: unknown): value is MemberTrustLevel {
  return typeof value === "string"
    && (MEMBER_TRUST_LEVELS as readonly string[]).includes(value);
}

function isSellerLevel(value: unknown): value is MemberSellerLevel {
  return typeof value === "string"
    && (MEMBER_SELLER_LEVELS as readonly string[]).includes(value);
}

function isEntitlementKey(value: string): value is MembershipEntitlementKey {
  return (MEMBERSHIP_ENTITLEMENT_KEYS as readonly string[]).includes(value);
}

@Injectable()
export class MembershipWalletService {

  async getPolicyCatalog() {
    const overrides = await this.loadPolicyOverrides();
    return {
      economy: MEMBERSHIP_ECONOMY_POLICY,
      plans: await Promise.all(
        Object.keys(MEMBERSHIP_PLAN_POLICIES).map((planId) =>
          this.effectivePlanPolicy(planId as MembershipPlanId, overrides)),
      ),
      activityRewards: await Promise.all(
        Object.keys(ACTIVITY_POINT_POLICIES).map((activityKey) =>
          this.effectiveActivityPointPolicy(
            activityKey as ActivityPointKey,
            overrides,
          )),
      ),
      rewardMilestones: REWARD_MILESTONES,
      policyNotes: {
        paymentsEnabled: false,
        pointsAreCashEquivalent: false,
        fairUseLimitsApplyDuringBeta: true,
      },
    };
  }

  async getOverview(userIdValue: string | undefined) {
    const userId = requireUserId(userIdValue);
    await this.ensureBetaFounderPromotion(userId);
    const planId = await this.resolveMembershipPlan(userId);
    await this.releaseExpiredReservations(userId);
    await this.expireAvailableLots(userId);

    const overrides = await this.loadPolicyOverrides();
    const plan = await this.effectivePlanPolicy(planId, overrides);
    await this.ensureMonthlyMembershipCredits(
      userId,
      planId,
      Number(plan.entitlements["credit.monthlyIncluded"]),
    );
    await dbPool.query(
      `INSERT INTO member_level ("userId") VALUES ($1)
       ON CONFLICT ("userId") DO NOTHING`,
      [userId],
    );

    const [accounts, lots, grants, levels, ledger] = await Promise.all([
      dbPool.query(
        `SELECT asset, "availableAmount", "reservedAmount",
                "lifetimeGranted", "lifetimeSpent"
         FROM wallet_account WHERE "userId" = $1`,
        [userId],
      ),
      dbPool.query(
        `SELECT asset, source,
                SUM("remainingAmount")::bigint AS remaining
         FROM wallet_lot
         WHERE "userId" = $1
           AND ("expiresAt" IS NULL OR "expiresAt" > now())
         GROUP BY asset, source`,
        [userId],
      ),
      dbPool.query(
        `SELECT id, "planId", source, "grantKey", "sourceRef",
                "startsAt", "endsAt", "autoRenew"
         FROM membership_grant
         WHERE "userId" = $1 AND status = 'active'
           AND "startsAt" <= now()
           AND ("endsAt" IS NULL OR "endsAt" > now())
         ORDER BY "startsAt" DESC`,
        [userId],
      ),
      dbPool.query(
        `SELECT "creatorLevel", "trustLevel", "sellerLevel",
                "trustScore", "updatedBy", "updatedAt"
         FROM member_level WHERE "userId" = $1`,
        [userId],
      ),
      dbPool.query(
        `SELECT entry.id, entry."entryType", entry.amount, entry."deltaAvailable",
                entry."deltaReserved", entry.reason, entry."referenceKey", entry."createdAt"
         FROM wallet_ledger_entry AS entry
         INNER JOIN wallet_account AS account ON account.id = entry."accountId"
         WHERE entry."userId" = $1 AND account.asset = 'reward_point'
         ORDER BY entry."createdAt" DESC
         LIMIT 50`,
        [userId],
      ),
    ]);

    const { start: creditDayStart, end: creditDayEnd } = kstDayBounds();
    const dailyCreditUsage = await dbPool.query<{ used: string | number }>(
      `SELECT COALESCE(SUM(
           CASE
             WHEN reservation.status = 'reserved' THEN reservation."requestedAmount"
             WHEN reservation.status = 'captured' THEN reservation."capturedAmount"
             ELSE 0
           END
         ), 0)::bigint AS used
       FROM wallet_reservation AS reservation
       INNER JOIN wallet_account AS account ON account.id = reservation."accountId"
       WHERE reservation."userId" = $1
         AND account.asset = 'studio_credit'
         AND reservation."createdAt" >= $2
         AND reservation."createdAt" < $3`,
      [userId, creditDayStart, creditDayEnd],
    );
    const spentToday = asInt(dailyCreditUsage.rows[0]?.used ?? 0);
    const dailyLimit = Number(plan.entitlements["credit.dailyLimit"]);

    const balance = (asset: WalletAsset) => {
      const row = accounts.rows.find((entry) => entry.asset === asset);
      return {
        available: row ? asInt(row.availableAmount) : 0,
        reserved: row ? asInt(row.reservedAmount) : 0,
        lifetimeGranted: row ? asInt(row.lifetimeGranted) : 0,
        lifetimeSpent: row ? asInt(row.lifetimeSpent) : 0,
        bySource: Object.fromEntries(
          lots.rows
            .filter((entry) => entry.asset === asset)
            .map((entry) => [String(entry.source), asInt(entry.remaining)]),
        ),
      };
    };

    return {
      membership: {
        planId,
        plan,
        grants: grants.rows,
      },

      economy: MEMBERSHIP_ECONOMY_POLICY,
      wallet: {
        points: balance(PUBLIC_WALLET_ASSET),
        studioCredits: balance("studio_credit"),
      },
      creditCycle: {
        monthlyIncluded: Number(plan.entitlements["credit.monthlyIncluded"]),
        dailyLimit,
        spentToday,
        remainingToday: Math.max(0, dailyLimit - spentToday),
        monthlyResetsAt: kstMonthBounds().end.toISOString(),
        dailyResetsAt: creditDayEnd.toISOString(),
      },
      levels: levels.rows[0] ?? {
        creatorLevel: "new",
        trustLevel: "new",
        sellerLevel: "none",
        trustScore: 0,
      },
      recentLedger: ledger.rows.map((entry) => ({
        ...entry,
        amount: asInt(entry.amount),
        deltaAvailable: asInt(entry.deltaAvailable),
        deltaReserved: asInt(entry.deltaReserved),
      })),
    };
  }

  async estimateCredits(featureValue: unknown, unitsValue: unknown = 1) {
    if (!isCreditFeatureKey(featureValue)) {
      throw new BadRequestException("지원하지 않는 크레딧 기능입니다.");
    }
    const units = Number(unitsValue);
    if (!Number.isFinite(units) || units < 0 || units > 1_000) {
      throw new BadRequestException("사용량 단위가 올바르지 않습니다.");
    }
    const overrides = await this.loadPolicyOverrides();
    const policy = await this.effectiveCreditCost(featureValue, overrides);
    const base = Math.ceil(policy.baseCredits * units);
    return {
      feature: featureValue,
      credits: Math.min(
        policy.maximumCredits,
        Math.max(policy.minimumCredits, base),
      ),
      policy,
    };
  }

  async reserveStudioCredits(input: {
    userId: string;
    feature: CreditFeatureKey;
    units?: number;
    idempotencyKey: string;
    metadata?: Record<string, unknown>;
  }) {
    await this.ensureBetaFounderPromotion(input.userId);
    await this.releaseExpiredReservations(input.userId);
    await this.expireAvailableLots(input.userId);
    const planId = await this.resolveMembershipPlan(input.userId);
    const plan = await this.effectivePlanPolicy(
      planId,
      await this.loadPolicyOverrides(),
    );
    await this.ensureMonthlyMembershipCredits(
      input.userId,
      planId,
      Number(plan.entitlements["credit.monthlyIncluded"]),
    );
    const estimate = await this.estimateCredits(input.feature, input.units ?? 1);
    return this.reserveAsset({
      userId: input.userId,
      asset: "studio_credit",
      amount: estimate.credits,
      featureKey: input.feature,
      idempotencyKey: input.idempotencyKey,
      dailyLimit: Number(plan.entitlements["credit.dailyLimit"]),
      metadata: input.metadata ?? {},
    });
  }

  async captureCreditReservation(
    reservationId: string,
    actualAmount?: number,
  ) {
    return this.settleReservation(
      reservationId,
      actualAmount,
      "captured",
    );
  }

  async releaseCreditReservation(reservationId: string) {
    return this.settleReservation(reservationId, 0, "released");
  }

  private async ensureMonthlyMembershipCredits(
    userId: string,
    planId: MembershipPlanId,
    targetAmount: number,
  ): Promise<void> {
    if (!Number.isSafeInteger(targetAmount) || targetAmount <= 0) return;
    const { cycleKey, end } = kstMonthBounds();
    const existing = await dbPool.query<{ granted: string | number }>(
      `SELECT COALESCE(SUM("grantedAmount"), 0)::bigint AS granted
       FROM wallet_lot
       WHERE "userId" = $1
         AND asset = 'studio_credit'
         AND source = 'membership'
         AND "sourceRef" = $2`,
      [userId, cycleKey],
    );
    const granted = asInt(existing.rows[0]?.granted ?? 0);
    const missing = Math.max(0, targetAmount - granted);
    if (missing <= 0) return;
    await this.grantAsset({
      userId,
      asset: "studio_credit",
      amount: missing,
      source: "membership",
      sourceKey: "membership-credit:" + cycleKey + ":target:" + targetAmount,
      sourceRef: cycleKey,
      expiresAt: end,
      reason: planId + " monthly Studio Credit",
      metadata: { planId, cycleKey, targetAmount },
    });
  }

  private async transaction<T>(
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await dbPool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async ensureAccount(
    client: PoolClient,
    userId: string,
    asset: WalletAsset,
  ): Promise<WalletAccountRow> {

    await client.query(
      `INSERT INTO wallet_account (
         id, "userId", asset, "availableAmount", "reservedAmount",
         "lifetimeGranted", "lifetimeSpent"
       ) VALUES ($1, $2, $3, 0, 0, 0, 0)
       ON CONFLICT ("userId", asset) DO NOTHING`,
      [randomUUID(), userId, asset],
    );
    const result = await client.query<WalletAccountRow>(
      `SELECT id, "userId", asset, "availableAmount", "reservedAmount",
              "lifetimeGranted", "lifetimeSpent"
       FROM wallet_account
       WHERE "userId" = $1 AND asset = $2
       FOR UPDATE`,
      [userId, asset],
    );
    const account = result.rows[0];
    if (!account) throw new Error("wallet_account_unavailable");
    return account;
  }

  private async grantLotWithClient(
    client: PoolClient,
    input: {
      userId: string;
      asset: WalletAsset;
      amount: number;
      source: string;
      sourceKey: string;
      sourceRef?: string | null;
      expiresAt?: Date | null;
      reason: string;
      metadata?: Record<string, unknown>;
      entryType?: "grant" | "purchase" | "refund" | "adjustment";
    },
  ) {
    const account = await this.ensureAccount(client, input.userId, input.asset);
    const lotId = randomUUID();

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO wallet_lot (
         id, "accountId", "userId", asset, source, "sourceKey",
         "sourceRef", "grantedAmount", "remainingAmount", "reservedAmount",
         "spendPriority", "expiresAt", metadata
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8,0,$9,$10,$11::jsonb)
       ON CONFLICT ("accountId","sourceKey") DO NOTHING
       RETURNING id`,
      [
        lotId,
        account.id,
        input.userId,
        input.asset,
        input.source,
        boundedText(input.sourceKey, 240),
        input.sourceRef ?? null,
        input.amount,
        sourcePriority(input.source),
        input.expiresAt ?? null,
        JSON.stringify(input.metadata ?? {}),
      ],
    );

    if (!inserted.rows[0]) {
      const existing = await client.query<{ id: string }>(
        `SELECT id FROM wallet_lot
         WHERE "accountId" = $1 AND "sourceKey" = $2`,
        [account.id, boundedText(input.sourceKey, 240)],
      );
      return {
        granted: false,
        lotId: existing.rows[0]?.id ?? null,
      };
    }

    await client.query(
      `UPDATE wallet_account
       SET "availableAmount" = "availableAmount" + $2,
           "lifetimeGranted" = "lifetimeGranted" + $2,
           "updatedAt" = now()
       WHERE id = $1`,
      [account.id, input.amount],
    );

    const entryType = input.entryType
      ?? (input.source === "purchase" ? "purchase" : "grant");
    await client.query(
      `INSERT INTO wallet_ledger_entry (
         id, "accountId", "userId", "lotId", "entryType", amount,
         "deltaAvailable", "deltaReserved", reason, "referenceKey",
         "idempotencyKey", metadata
       ) VALUES ($1,$2,$3,$4,$5,$6,$6,0,$7,$8,$9,$10::jsonb)`,
      [
        randomUUID(),
        account.id,
        input.userId,
        lotId,
        entryType,
        input.amount,
        boundedText(input.reason, 240),
        input.sourceRef ?? input.sourceKey,
        `grant:${boundedText(input.sourceKey, 200)}`,
        JSON.stringify(input.metadata ?? {}),
      ],
    );

    return {
      granted: true,
      lotId,
      accountId: account.id,
      amount: input.amount,
    };
  }

  private async grantAsset(input: {
    userId: string;
    asset: WalletAsset;
    amount: number;
    source: string;
    sourceKey: string;
    sourceRef?: string | null;
    expiresAt?: Date | null;
    reason: string;
    metadata?: Record<string, unknown>;
  }) {

    return this.transaction((client) =>
      this.grantLotWithClient(client, {
        ...input,
        amount: positiveInteger(input.amount, "지급량"),
      }),
    );
  }

  private async debitAsset(input: {
    userId: string;
    asset: WalletAsset;
    amount: number;
    idempotencyKey: string;
    reason: string;
    referenceKey?: string | null;
    metadata?: Record<string, unknown>;
  }) {
    const amount = positiveInteger(input.amount, "회수량");
    const idempotencyKey = boundedText(input.idempotencyKey, 200);
    if (!idempotencyKey) {
      throw new BadRequestException("회수 요청 식별자가 필요합니다.");
    }

    return this.transaction(async (client) => {
      const account = await this.ensureAccount(client, input.userId, input.asset);
      const existing = await client.query<{ id: string }>(
        `SELECT id FROM wallet_ledger_entry
         WHERE "accountId" = $1 AND "idempotencyKey" = $2
         LIMIT 1`,
        [account.id, idempotencyKey],
      );
      if (existing.rows[0]) {
        return {
          adjusted: false,
          idempotent: true,
          accountId: account.id,
          amount: -amount,
        };
      }
      if (asInt(account.availableAmount) < amount) {
        throw new ConflictException("회수 가능한 포인트 잔액이 부족합니다.");
      }

      const lots = await client.query<{
        id: string;
        remainingAmount: string | number;
      }>(
        `SELECT id, "remainingAmount"
         FROM wallet_lot
         WHERE "accountId" = $1
           AND "remainingAmount" > 0
           AND ("expiresAt" IS NULL OR "expiresAt" > now())
         ORDER BY "spendPriority" ASC,
                  "expiresAt" ASC NULLS LAST,
                  "createdAt" ASC
         FOR UPDATE`,
        [account.id],
      );

      let remaining = amount;
      for (const lot of lots.rows) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, asInt(lot.remainingAmount));
        if (take <= 0) continue;
        await client.query(
          `UPDATE wallet_lot
           SET "remainingAmount" = "remainingAmount" - $2
           WHERE id = $1 AND "remainingAmount" >= $2`,
          [lot.id, take],
        );
        remaining -= take;
      }
      if (remaining !== 0) {
        throw new Error("wallet_adjustment_lot_invariant_failed");
      }

      const updated = await client.query(
        `UPDATE wallet_account
         SET "availableAmount" = "availableAmount" - $2,
             "updatedAt" = now()
         WHERE id = $1 AND "availableAmount" >= $2
         RETURNING id`,
        [account.id, amount],
      );
      if (!updated.rows[0]) {
        throw new Error("wallet_adjustment_balance_invariant_failed");
      }

      await client.query(
        `INSERT INTO wallet_ledger_entry (
           id, "accountId", "userId", "entryType", amount,
           "deltaAvailable", "deltaReserved", reason, "referenceKey",
           "idempotencyKey", metadata
         ) VALUES ($1,$2,$3,'adjustment',$4,$5,0,$6,$7,$8,$9::jsonb)`,
        [
          randomUUID(),
          account.id,
          input.userId,
          amount,
          -amount,
          boundedText(input.reason, 240),
          input.referenceKey ?? null,
          idempotencyKey,
          JSON.stringify(input.metadata ?? {}),
        ],
      );

      return {
        adjusted: true,
        accountId: account.id,
        amount: -amount,
      };
    });
  }

  private async reserveAsset(input: {
    userId: string;
    asset: WalletAsset;
    amount: number;
    featureKey?: CreditFeatureKey | null;
    idempotencyKey: string;
    dailyLimit?: number;
    metadata?: Record<string, unknown>;
  }) {
    const amountToReserve = positiveInteger(input.amount, "예약량");
    const idempotencyKey = boundedText(input.idempotencyKey, 200);
    if (!idempotencyKey) {
      throw new BadRequestException("예약 요청 식별자가 필요합니다.");
    }

    return this.transaction(async (client) => {
      await client.query(
        `SELECT pg_advisory_xact_lock(hashtext($1))`,
        ["wallet-reservation:" + input.userId + ":" + input.asset],
      );
      const account = await this.ensureAccount(
        client,
        input.userId,
        input.asset,
      );
      const existing = await client.query<ReservationRow>(
        `SELECT id, "accountId", "userId", "featureKey",
                "requestedAmount", "capturedAmount",
                "idempotencyKey", status, "expiresAt"
         FROM wallet_reservation
         WHERE "userId" = $1 AND "idempotencyKey" = $2
         FOR UPDATE`,
        [input.userId, idempotencyKey],
      );
      if (existing.rows[0]) {
        return this.projectReservation(existing.rows[0]);
      }

      if (
        input.asset === "studio_credit"
        && Number.isSafeInteger(input.dailyLimit)
        && Number(input.dailyLimit) > 0
      ) {
        const { start, end } = kstDayBounds();
        const daily = await client.query<{ used: string | number }>(
          `SELECT COALESCE(SUM(
               CASE
                 WHEN status = 'reserved' THEN "requestedAmount"
                 WHEN status = 'captured' THEN "capturedAmount"
                 ELSE 0
               END
             ), 0)::bigint AS used
           FROM wallet_reservation
           WHERE "accountId" = $1
             AND "createdAt" >= $2
             AND "createdAt" < $3`,
          [account.id, start, end],
        );
        const used = asInt(daily.rows[0]?.used ?? 0);
        const dailyLimit = Number(input.dailyLimit);
        if (used + amountToReserve > dailyLimit) {
          throw new ConflictException({
            code: "studio_credit_daily_limit_exceeded",
            dailyLimit,
            used,
            requested: amountToReserve,
            remaining: Math.max(0, dailyLimit - used),
            nextResetAt: end.toISOString(),
            message: "오늘 사용할 수 있는 Studio Credit 한도를 초과했습니다.",
          });
        }
      }

      const reservationId = randomUUID();
      const expiresAt = new Date(Date.now() + RESERVATION_TTL_MS);

      const debit = await client.query(
        `UPDATE wallet_account
         SET "availableAmount" = "availableAmount" - $2,
             "reservedAmount" = "reservedAmount" + $2,
             "updatedAt" = now()
         WHERE id = $1 AND "availableAmount" >= $2
         RETURNING id`,
        [account.id, amountToReserve],
      );
      if (!debit.rows[0]) {
        throw new ConflictException({
          code: "wallet_balance_insufficient",
          asset: input.asset,
          required: amountToReserve,
          available: asInt(account.availableAmount),
          message: "사용 가능한 잔액이 부족합니다.",
        });
      }

      await client.query(
        `INSERT INTO wallet_reservation (
           id, "accountId", "userId", "featureKey",
           "requestedAmount", "capturedAmount", "idempotencyKey",
           status, "expiresAt", metadata
         ) VALUES ($1,$2,$3,$4,$5,0,$6,'reserved',$7,$8::jsonb)`,

        [
          reservationId,
          account.id,
          input.userId,
          input.featureKey ?? null,
          amountToReserve,
          idempotencyKey,
          expiresAt,
          JSON.stringify(input.metadata ?? {}),
        ],
      );

      const lots = await client.query<LotRow>(
        `SELECT id, "accountId", "remainingAmount", "reservedAmount",
                "spendPriority", "expiresAt"
         FROM wallet_lot
         WHERE "accountId" = $1
           AND "remainingAmount" > 0
           AND ("expiresAt" IS NULL OR "expiresAt" > $2)
         ORDER BY "spendPriority" ASC,
                  "expiresAt" ASC NULLS LAST,
                  "createdAt" ASC
         FOR UPDATE`,
        [account.id, expiresAt],
      );

      let remaining = amountToReserve;
      for (const lot of lots.rows) {
        if (remaining <= 0) break;
        const available = asInt(lot.remainingAmount);
        if (available <= 0) continue;
        const allocated = Math.min(available, remaining);
        await client.query(
          `UPDATE wallet_lot
           SET "remainingAmount" = "remainingAmount" - $2,
               "reservedAmount" = "reservedAmount" + $2
           WHERE id = $1`,
          [lot.id, allocated],
        );
        await client.query(
          `INSERT INTO wallet_reservation_allocation (
             id, "reservationId", "lotId",
             "allocatedAmount", "capturedAmount"
           ) VALUES ($1,$2,$3,$4,0)`,
          [randomUUID(), reservationId, lot.id, allocated],
        );
        remaining -= allocated;
      }

      if (remaining !== 0) {
        throw new Error("wallet_lot_balance_invariant_failed");
      }

      await client.query(
        `INSERT INTO wallet_ledger_entry (
           id, "accountId", "userId", "reservationId",
           "entryType", amount, "deltaAvailable", "deltaReserved",
           reason, "referenceKey", "idempotencyKey", metadata
         ) VALUES ($1,$2,$3,$4,'reserve',$5,$6,$5,$7,$8,$9,$10::jsonb)`,
        [
          randomUUID(),
          account.id,
          input.userId,
          reservationId,
          amountToReserve,
          -amountToReserve,
          input.featureKey ?? "wallet-reservation",
          input.featureKey ?? input.asset,
          `reserve:${idempotencyKey}`,
          JSON.stringify(input.metadata ?? {}),
        ],
      );

      return {
        id: reservationId,
        userId: input.userId,
        accountId: account.id,
        featureKey: input.featureKey ?? null,
        requestedAmount: amountToReserve,
        capturedAmount: 0,
        status: "reserved" as const,
        expiresAt: expiresAt.toISOString(),
      };
    });
  }

  private projectReservation(row: ReservationRow) {
    return {
      id: row.id,
      accountId: row.accountId,
      userId: row.userId,
      featureKey: row.featureKey,
      requestedAmount: asInt(row.requestedAmount),
      capturedAmount: asInt(row.capturedAmount),
      status: row.status,
      expiresAt: new Date(row.expiresAt).toISOString(),
    };
  }

  private async settleReservation(
    reservationIdValue: string,
    actualAmountValue: number | undefined,
    intent: "captured" | "released",
  ) {
    const reservationId = boundedText(reservationIdValue, 120);
    if (!reservationId) {
      throw new BadRequestException("예약 식별자가 필요합니다.");
    }

    return this.transaction(async (client) => {
      const result = await client.query<ReservationRow>(
        `SELECT id, "accountId", "userId", "featureKey",
                "requestedAmount", "capturedAmount",
                "idempotencyKey", status, "expiresAt"
         FROM wallet_reservation
         WHERE id = $1
         FOR UPDATE`,
        [reservationId],
      );
      const reservation = result.rows[0];

      if (!reservation) {
        throw new NotFoundException("크레딧 예약을 찾을 수 없습니다.");
      }
      if (reservation.status !== "reserved") {
        return this.projectReservation(reservation);
      }

      const requested = asInt(reservation.requestedAmount);
      const actual = intent === "released"
        ? 0
        : actualAmountValue === undefined
          ? requested
          : Number(actualAmountValue);
      if (
        !Number.isSafeInteger(actual)
        || actual < 0
        || actual > requested
      ) {
        throw new BadRequestException("실제 사용 크레딧이 올바르지 않습니다.");
      }

      const allocations = await client.query<AllocationRow>(

        `SELECT id, "lotId", "allocatedAmount", "capturedAmount"
         FROM wallet_reservation_allocation
         WHERE "reservationId" = $1
         ORDER BY "createdAt" ASC
         FOR UPDATE`,
        [reservation.id],
      );

      let remainingCapture = actual;
      for (const allocation of allocations.rows) {
        const allocated = asInt(allocation.allocatedAmount);
        const captured = Math.min(allocated, remainingCapture);
        const released = allocated - captured;
        await client.query(
          `UPDATE wallet_lot
           SET "reservedAmount" = "reservedAmount" - $2,
               "remainingAmount" = "remainingAmount" + $3
           WHERE id = $1`,
          [allocation.lotId, allocated, released],
        );

        await client.query(
          `UPDATE wallet_reservation_allocation
           SET "capturedAmount" = $2
           WHERE id = $1`,
          [allocation.id, captured],
        );
        remainingCapture -= captured;
      }
      if (remainingCapture !== 0) {
        throw new Error("wallet_reservation_allocation_invariant_failed");
      }

      const releasedAmount = requested - actual;
      await client.query(
        `UPDATE wallet_account
         SET "reservedAmount" = "reservedAmount" - $2,
             "availableAmount" = "availableAmount" + $3,
             "lifetimeSpent" = "lifetimeSpent" + $4,
             "updatedAt" = now()
         WHERE id = $1`,
        [reservation.accountId, requested, releasedAmount, actual],
      );

      const finalStatus = actual > 0 ? "captured" : "released";
      const updated = await client.query<ReservationRow>(
        `UPDATE wallet_reservation
         SET "capturedAmount" = $2,
             status = $3,
             "updatedAt" = now()
         WHERE id = $1
         RETURNING id, "accountId", "userId", "featureKey",
                   "requestedAmount", "capturedAmount",
                   "idempotencyKey", status, "expiresAt"`,
        [reservation.id, actual, finalStatus],
      );

      if (actual > 0) {
        await this.insertSettlementLedger(client, {
          reservation,
          entryType: "capture",
          amount: actual,
          deltaAvailable: 0,
          deltaReserved: -actual,
        });
      }

      if (releasedAmount > 0) {
        await this.insertSettlementLedger(client, {
          reservation,
          entryType: "release",
          amount: releasedAmount,
          deltaAvailable: releasedAmount,
          deltaReserved: -releasedAmount,
        });
      }

      const row = updated.rows[0];
      if (!row) throw new Error("wallet_reservation_settlement_failed");
      return this.projectReservation(row);
    });
  }

  private async insertSettlementLedger(
    client: PoolClient,
    input: {
      reservation: ReservationRow;
      entryType: "capture" | "release";
      amount: number;

      deltaAvailable: number;
      deltaReserved: number;
    },
  ) {
    const { reservation } = input;
    await client.query(
      `INSERT INTO wallet_ledger_entry (
         id, "accountId", "userId", "reservationId",
         "entryType", amount, "deltaAvailable", "deltaReserved",
         reason, "referenceKey", "idempotencyKey", metadata
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'{}'::jsonb)
       ON CONFLICT ("accountId","idempotencyKey") DO NOTHING`,
      [
        randomUUID(),
        reservation.accountId,
        reservation.userId,
        reservation.id,
        input.entryType,
        input.amount,
        input.deltaAvailable,
        input.deltaReserved,
        reservation.featureKey ?? "wallet-reservation",
        reservation.featureKey ?? reservation.id,
        `${input.entryType}:${reservation.id}`,
      ],
    );
  }

  private async creatorLevelSignals(userId: string) {
    const signals = await dbPool.query<{
      verifiedCreator: boolean;
      publishedWorks: string | number;
      activityPoints: string | number;
    }>(
      `SELECT
         EXISTS(SELECT 1 FROM creator_profile
           WHERE "userId" = $1 AND "isVerifiedCreator" = true) AS "verifiedCreator",
         (SELECT COUNT(*)::bigint FROM creator_work
           WHERE "userId" = $1 AND status = 'published' AND hidden = false) AS "publishedWorks",
         (SELECT COALESCE(SUM("grantedAmount"), 0)::bigint FROM wallet_lot
           WHERE "userId" = $1 AND asset = 'reward_point'
             AND source LIKE 'activity:%') AS "activityPoints"`,
      [userId],
    );
    const metrics = {
      verifiedCreator: signals.rows[0]?.verifiedCreator === true,
      publishedWorks: asInt(signals.rows[0]?.publishedWorks ?? 0),
      activityPoints: asInt(signals.rows[0]?.activityPoints ?? 0),
    };
    return { metrics, automaticLevel: automaticCreatorLevel(metrics) };
  }

  private async resolveMembershipPlan(userId: string): Promise<MembershipPlanId> {
    const result = await dbPool.query<{ planId: string }>(
      `SELECT "planId"
       FROM membership_grant
       WHERE "userId" = $1
         AND status = 'active'
         AND "startsAt" <= now()
         AND ("endsAt" IS NULL OR "endsAt" > now())`,
      [userId],
    );
    const plans = result.rows
      .map((row) => row.planId)
      .filter(isMembershipPlanId);
    return highestMembershipPlan(plans);
  }

  private async ensureBetaFounderPromotion(userId: string): Promise<void> {
    if (process.env.BETA_FOUNDER_AUTO_ENROLL !== "true") return;

    const userResult = await dbPool.query<{ createdAt: Date | null }>(
      `SELECT "createdAt" FROM public."user" WHERE id = $1`,
      [userId],
    );
    const createdAt = userResult.rows[0]?.createdAt;
    if (!createdAt) return;

    const start = process.env.BETA_FOUNDER_START_AT
      ? new Date(process.env.BETA_FOUNDER_START_AT)
      : null;

    const end = process.env.BETA_FOUNDER_END_AT
      ? new Date(process.env.BETA_FOUNDER_END_AT)
      : null;
    if (start && Number.isFinite(start.getTime()) && createdAt < start) return;
    if (end && Number.isFinite(end.getTime()) && createdAt >= end) return;

    await dbPool.query(
      `INSERT INTO membership_grant (
         id, "userId", "planId", source, "grantKey", "sourceRef",
         status, "startsAt", "endsAt", "autoRenew"
       ) VALUES ($1,$2,'pro','beta-founder','beta-founder-6m',
                 'beta-2026','active',$3,$4,false)
       ON CONFLICT ("userId","grantKey") DO NOTHING`,
      [
        randomUUID(),
        userId,
        createdAt,
        addUtcMonths(createdAt, 6),
      ],
    );
  }

  private async releaseExpiredReservations(userId: string): Promise<void> {
    const result = await dbPool.query<{ id: string }>(
      `SELECT id
       FROM wallet_reservation
       WHERE "userId" = $1
         AND status = 'reserved'
         AND "expiresAt" <= now()
       ORDER BY "expiresAt" ASC
       LIMIT 100`,
      [userId],
    );
    for (const row of result.rows) {
      await this.releaseCreditReservation(row.id);
    }
  }

  private async expireAvailableLots(userId: string): Promise<void> {
    await this.transaction(async (client) => {
      const lots = await client.query<{
        id: string;
        accountId: string;
        remainingAmount: string | number;
        sourceKey: string;
      }>(
        `SELECT id, "accountId", "remainingAmount", "sourceKey"
         FROM wallet_lot
         WHERE "userId" = $1
           AND "expiresAt" IS NOT NULL
           AND "expiresAt" <= now()
           AND "remainingAmount" > 0
         ORDER BY "expiresAt" ASC
         FOR UPDATE`,
        [userId],
      );

      for (const lot of lots.rows) {
        const expiredAmount = asInt(lot.remainingAmount);
        if (expiredAmount <= 0) continue;
        const updated = await client.query(
          `UPDATE wallet_account
           SET "availableAmount" = "availableAmount" - $2,
               "updatedAt" = now()
           WHERE id = $1 AND "availableAmount" >= $2
           RETURNING id`,
          [lot.accountId, expiredAmount],
        );
        if (!updated.rows[0]) {
          throw new Error("wallet_expiration_balance_invariant_failed");
        }
        await client.query(
          `UPDATE wallet_lot
           SET "remainingAmount" = 0
           WHERE id = $1`,
          [lot.id],
        );
        await client.query(
          `INSERT INTO wallet_ledger_entry (
             id, "accountId", "userId", "lotId", "entryType", amount,
             "deltaAvailable", "deltaReserved", reason, "referenceKey",
             "idempotencyKey", metadata
           ) VALUES ($1,$2,$3,$4,'expire',$5,$6,0,$7,$8,$9,'{}'::jsonb)
           ON CONFLICT ("accountId","idempotencyKey") DO NOTHING`,
          [
            randomUUID(),
            lot.accountId,
            userId,
            lot.id,
            expiredAmount,
            -expiredAmount,
            "만료된 내부 지갑 항목 정리",
            lot.sourceKey,
            `expire:${lot.id}`,
          ],
        );
      }
    });
  }

  private async loadPolicyOverrides(): Promise<Map<string, unknown>> {
    const result = await dbPool.query<{ key: string; value: unknown }>(
      `SELECT key, value
       FROM membership_policy_override
       WHERE active = true`,
    );
    return new Map(result.rows.map((row) => [row.key, row.value]));
  }

  private async effectivePlanPolicy(
    planId: MembershipPlanId,
    overrides: Map<string, unknown>,
  ) {
    const base = MEMBERSHIP_PLAN_POLICIES[planId];
    const raw = overrides.get(`plan:${planId}`);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
    const record = raw as Record<string, unknown>;
    const rawEntitlements =
      record.entitlements
      && typeof record.entitlements === "object"
      && !Array.isArray(record.entitlements)
        ? record.entitlements as Record<string, unknown>
        : {};
    const entitlements = { ...base.entitlements };

    for (const [key, value] of Object.entries(rawEntitlements)) {
      if (!isEntitlementKey(key)) continue;
      const expected = base.entitlements[key];
      if (typeof expected === "boolean" && typeof value === "boolean") {
        entitlements[key] = value as never;
      } else if (
        typeof expected === "number"
        && Number.isFinite(Number(value))
        && Number(value) >= 0
      ) {
        entitlements[key] = Number(value) as never;
      }
    }
    return {
      ...base,
      entitlements,
    };
  }

  private async effectiveCreditCost(
    feature: CreditFeatureKey,
    overrides: Map<string, unknown>,
  ) {
    const base = CREDIT_COST_POLICIES[feature];
    const raw = overrides.get(`credit:${feature}`);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
    const policyOverride = { ...raw } as Record<string, unknown>;
    const safe = (value: unknown, fallback: number) => {
      const parsed = Number(value);
      return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 1_000_000
        ? parsed
        : fallback;
    };
    const numericKeys = ["base", "minimum", "maximum"].map(
      (prefix) => prefix + "Credits",
    );
    const next = { ...base } as Record<string, unknown>;
    for (const key of numericKeys) {
      next[key] = safe(policyOverride[key], Number(next[key]));
    }
    const lower = Number(next[numericKeys[1] ?? ""]);
    const upper = Math.max(lower, Number(next[numericKeys[2] ?? ""]));
    next[numericKeys[1] ?? ""] = lower;
    next[numericKeys[2] ?? ""] = upper;
    next[numericKeys[0] ?? ""] = Math.min(
      upper,
      Math.max(lower, Number(next[numericKeys[0] ?? ""])),
    );
    return next as unknown as typeof base;
  }

  private effectiveActivityPointPolicy(
    activityKey: ActivityPointKey,
    overrides: Map<string, unknown>,
  ) {
    const base = ACTIVITY_POINT_POLICIES[activityKey];
    const raw = overrides.get(`activity:${activityKey}`);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
    const record = raw as Record<string, unknown>;
    const safe = (value: unknown, fallback: number, maximum: number) => {
      const parsed = Number(value);
      return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= maximum
        ? parsed
        : fallback;
    };
    return {
      ...base,
      points: safe(record.points, base.points, 100_000),
      dailyGrantLimit: safe(
        record.dailyGrantLimit,
        base.dailyGrantLimit,
        1_000,
      ),
      cooldownSeconds: safe(
        record.cooldownSeconds,
        base.cooldownSeconds,
        86_400,
      ),
    };
  }

  async grantActivityPoints(input: {
    userId: string | undefined;
    activity: unknown;
    sourceRef: unknown;
    metadata?: Record<string, unknown>;
    clientClaim?: boolean;
  }) {
    const userId = requireUserId(input.userId);
    if (!isActivityPointKey(input.activity)) {
      throw new BadRequestException("지원하지 않는 포인트 활동입니다.");
    }
    const activityKey = input.activity;
    const sourceRef = boundedText(input.sourceRef, 180);
    if (!sourceRef) {
      throw new BadRequestException("포인트 적립 근거 식별자가 필요합니다.");
    }
    const policy = this.effectiveActivityPointPolicy(
      activityKey,
      await this.loadPolicyOverrides(),
    );
    if (input.clientClaim === true && policy.claimMode !== "client") {
      throw new ForbiddenException("이 활동은 서버가 확인한 경우에만 포인트를 적립합니다.");
    }
    if (policy.points <= 0 || policy.dailyGrantLimit <= 0) {
      return {
        granted: false,
        disabled: true,
        activity: activityKey,
        points: 0,
      };
    }

    const source = `activity:${activityKey}`;
    const sourceKey = `${source}:${sourceRef}`;
    const { dayKey, start, end } = kstDayBounds();

    return this.transaction(async (client) => {
      await client.query(
        `SELECT pg_advisory_xact_lock(hashtext($1))`,
        [`membership-activity:${userId}:${activityKey}`],
      );

      const account = await this.ensureAccount(
        client,
        userId,
        PUBLIC_WALLET_ASSET,
      );
      const duplicate = await client.query<{ id: string }>(
        `SELECT id
         FROM wallet_lot
         WHERE "accountId" = $1 AND "sourceKey" = $2
         LIMIT 1`,
        [account.id, boundedText(sourceKey, 240)],
      );
      if (duplicate.rows[0]) {
        return {
          granted: false,
          idempotent: true,
          activity: activityKey,
          points: 0,
          dailyGrantLimit: policy.dailyGrantLimit,
        };
      }

      const daily = await client.query<{
        count: string | number;
        latest: Date | null;
      }>(
        `SELECT COUNT(*)::integer AS count, MAX("createdAt") AS latest
         FROM wallet_lot
         WHERE "userId" = $1
           AND asset = 'reward_point'
           AND source = $2
           AND "createdAt" >= $3
           AND "createdAt" < $4`,
        [userId, source, start, end],
      );
      const count = asInt(daily.rows[0]?.count ?? 0);
      if (count >= policy.dailyGrantLimit) {
        return {
          granted: false,
          capped: true,
          activity: activityKey,
          points: 0,
          dailyGrantLimit: policy.dailyGrantLimit,
          nextResetAt: end.toISOString(),
        };
      }

      const latest = daily.rows[0]?.latest;
      if (
        latest
        && policy.cooldownSeconds > 0
        && Date.now() - new Date(latest).getTime()
          < policy.cooldownSeconds * 1000
      ) {
        return {
          granted: false,
          cooldown: true,
          activity: activityKey,
          points: 0,
          cooldownSeconds: policy.cooldownSeconds,
        };
      }

      const grant = await this.grantLotWithClient(client, {
        userId,
        asset: PUBLIC_WALLET_ASSET,
        amount: policy.points,
        source,
        sourceKey,
        sourceRef,
        expiresAt: rewardPointExpiry(),
        reason: policy.label,
        metadata: {
          ...(input.metadata ?? {}),
          activity: activityKey,
          dayKey,
        },
      });
      return {
        ...grant,
        activity: activityKey,
        points: grant.granted ? policy.points : 0,
        dailyGrantLimit: policy.dailyGrantLimit,
        remainingDailyGrants: Math.max(
          0,
          policy.dailyGrantLimit - count - (grant.granted ? 1 : 0),
        ),
      };
    });
  }

  async claimClientActivityPoints(input: {
    userId: string | undefined;
    activity: unknown;
    sourceRef: unknown;
    metadata?: Record<string, unknown>;
  }) {
    return this.grantActivityPoints({
      ...input,
      clientClaim: true,
    });
  }

  async getEffectiveEntitlements(userIdValue: string | undefined) {
    const userId = requireUserId(userIdValue);
    await this.ensureBetaFounderPromotion(userId);
    const planId = await this.resolveMembershipPlan(userId);
    const plan = await this.effectivePlanPolicy(
      planId,
      await this.loadPolicyOverrides(),
    );
    return { planId, entitlements: plan.entitlements };
  }

  async grantRewardMilestone(
    userIdValue: string | undefined,
    milestoneValue: unknown,
    sourceRefValue: unknown,
  ) {
    const userId = requireUserId(userIdValue);
    const milestone = boundedText(
      milestoneValue,
      80,
    ) as RewardMilestoneKey;
    if (
      !Object.prototype.hasOwnProperty.call(
        REWARD_MILESTONES,
        milestone,
      )
    ) {
      throw new BadRequestException(
        "지원하지 않는 리워드 마일스톤입니다.",
      );
    }
    const sourceRef = boundedText(sourceRefValue, 180);
    if (!sourceRef) {
      throw new BadRequestException("리워드 근거 식별자가 필요합니다.");
    }
    const policy = REWARD_MILESTONES[milestone];
    return this.grantAsset({
      userId,
      asset: "reward_point",
      amount: policy.points,
      source: "event",
      sourceKey: `reward:${milestone}:${sourceRef}`,
      sourceRef,
      expiresAt: rewardPointExpiry(),
      reason: policy.label,
      metadata: { milestone },
    });
  }

  private async requireAdmin(
    userIdValue: string | undefined,
  ): Promise<string> {
    const userId = requireUserId(userIdValue);
    if (!(await isAdminUser(userId))) {
      throw new ForbiddenException("관리자 권한이 필요합니다.");
    }
    return userId;
  }

  async adminGetPolicyState(adminIdValue: string | undefined) {
    await this.requireAdmin(adminIdValue);
    const overrides = await dbPool.query(
      `SELECT key, value, active, "updatedBy", "updatedAt"
       FROM membership_policy_override
       ORDER BY key ASC`,
    );
    return {
      ...(await this.getPolicyCatalog()),
      overrides: overrides.rows,
    };
  }

  async adminSetPolicyOverride(input: {
    adminId: string | undefined;
    key: unknown;
    value: unknown;
    active?: unknown;
  }) {
    const adminId = await this.requireAdmin(input.adminId);
    const key = boundedText(input.key, 180);
    const validPlanKey = key.startsWith("plan:")
      && isMembershipPlanId(key.slice("plan:".length));
    const validActivityKey = key.startsWith("activity:")
      && isActivityPointKey(key.slice("activity:".length));
    const validCreditKey = key.startsWith("credit:")
      && isCreditFeatureKey(key.slice("credit:".length));
    if (!validPlanKey && !validActivityKey && !validCreditKey) {
      throw new BadRequestException("지원하지 않는 정책 키입니다.");
    }
    if (!input.value || typeof input.value !== "object" || Array.isArray(input.value)) {
      throw new BadRequestException("정책 값은 객체여야 합니다.");
    }
    const active = input.active === undefined ? true : input.active === true;
    await dbPool.query(
      `INSERT INTO membership_policy_override (key, value, active, "updatedBy", "updatedAt")
       VALUES ($1,$2::jsonb,$3,$4,now())
       ON CONFLICT (key) DO UPDATE SET
         value=EXCLUDED.value,
         active=EXCLUDED.active,
         "updatedBy"=EXCLUDED."updatedBy",
         "updatedAt"=now()`,
      [key, JSON.stringify(input.value), active, adminId],
    );
    await logAuditAction(
      adminId,
      "membership_wallet.policy_override",
      "membership_policy",
      key,
      { active, value: input.value as Record<string, unknown> },
    );
    return { key, value: input.value, active };
  }

  async adminRevokeMembership(input: {
    adminId: string | undefined;
    targetUserId: unknown;
    membershipId: unknown;
    reason?: unknown;
  }) {
    const adminId = await this.requireAdmin(input.adminId);
    const targetUserId = boundedText(input.targetUserId, 160);
    const membershipId = boundedText(input.membershipId, 160);
    if (!targetUserId || !membershipId) {
      throw new BadRequestException("대상 사용자와 멤버십 ID가 필요합니다.");
    }
    const result = await dbPool.query<{ id: string }>(
      `UPDATE membership_grant
       SET status='cancelled', "updatedAt"=now()
       WHERE id=$1 AND "userId"=$2 AND status='active'
       RETURNING id`,
      [membershipId, targetUserId],
    );
    if (!result.rows[0]) {
      throw new NotFoundException("활성 멤버십을 찾을 수 없습니다.");
    }
    await logAuditAction(
      adminId,
      "membership_wallet.membership_revoke",
      "user",
      targetUserId,
      { membershipId, reason: boundedText(input.reason, 240) },
    );
    return { id: membershipId, revoked: true };
  }

  async adminGetUser(
    adminIdValue: string | undefined,
    targetUserIdValue: unknown,
  ) {
    await this.requireAdmin(adminIdValue);
    const targetUserId = boundedText(targetUserIdValue, 160);
    if (!targetUserId) {
      throw new BadRequestException("대상 사용자 ID가 필요합니다.");
    }
    return await this.getOverview(targetUserId);
  }

  async adminApplyBenefit(input: {
    adminId: string | undefined;
    targetUserId: unknown;
    asset: unknown;
    delta: unknown;
    requestKey: unknown;
    reason?: unknown;
  }) {
    const adminId = await this.requireAdmin(input.adminId);
    const targetUserId = boundedText(input.targetUserId, 160);
    if (!targetUserId) {
      throw new BadRequestException("대상 사용자 ID가 필요합니다.");
    }
    if (input.asset !== PUBLIC_WALLET_ASSET && input.asset !== "studio_credit") {
      throw new BadRequestException("지원하지 않는 지갑 자산입니다.");
    }
    const asset: WalletAsset = input.asset;
    const delta = signedNonZeroInteger(input.delta, "지갑 조정량");
    const requestKey = boundedText(input.requestKey, 160);
    if (!requestKey) {
      throw new BadRequestException("지급 요청 식별자가 필요합니다.");
    }
    const reason = boundedText(input.reason, 240)
      || (delta > 0 ? "관리자 수동 지급" : "관리자 수동 회수");
    const result = delta > 0
      ? await this.grantAsset({
          userId: targetUserId,
          asset,
          amount: delta,
          source: "admin",
          sourceKey: ["admin", adminId, requestKey].join(":"),
          sourceRef: requestKey,
          expiresAt: asset === PUBLIC_WALLET_ASSET ? rewardPointExpiry() : null,
          reason,
          metadata: { adminId, delta },
        })
      : await this.debitAsset({
          userId: targetUserId,
          asset,
          amount: Math.abs(delta),
          idempotencyKey: ["adjust", adminId, requestKey].join(":"),
          reason,
          referenceKey: requestKey,
          metadata: { adminId, delta },
        });
    await logAuditAction(
      adminId,
      "membership_wallet.benefit_apply",
      "user",
      targetUserId,
      { asset, delta, requestKey },
    );
    return result;
  }

  async adminApplyMembership(input: {
    adminId: string | undefined;
    targetUserId: unknown;
    planId: unknown;
    durationDays: unknown;
    requestKey: unknown;
    reason?: unknown;
  }) {
    const adminId = await this.requireAdmin(input.adminId);
    const targetUserId = boundedText(input.targetUserId, 160);
    if (!targetUserId) {
      throw new BadRequestException("대상 사용자 ID가 필요합니다.");
    }
    if (!isMembershipPlanId(input.planId)) {
      throw new BadRequestException("지원하지 않는 멤버십 플랜입니다.");
    }
    const durationDays = positiveInteger(
      input.durationDays,
      "멤버십 기간",
      3650,
    );
    const requestKey = boundedText(input.requestKey, 160);
    if (!requestKey) {
      throw new BadRequestException("멤버십 요청 식별자가 필요합니다.");
    }
    const now = new Date();
    const endsAt = new Date(
      now.getTime() + durationDays * 24 * 60 * 60 * 1000,
    );
    const membershipId = randomUUID();
    const inserted = await dbPool.query<{ id: string }>(
      `INSERT INTO membership_grant (
         id, "userId", "planId", source, "grantKey", "sourceRef",
         status, "startsAt", "endsAt", "autoRenew", "createdBy"
       ) VALUES ($1,$2,$3,'admin',$4,$5,'active',$6,$7,false,$8)
       ON CONFLICT ("userId","grantKey") DO NOTHING
       RETURNING id`,
      [
        membershipId,
        targetUserId,
        input.planId,
        `admin:${requestKey}`,
        requestKey,
        now,
        endsAt,
        adminId,
      ],
    );
    const appliedId = inserted.rows[0]?.id ?? null;
    await logAuditAction(
      adminId,
      "membership_wallet.membership_apply",
      "user",
      targetUserId,
      {
        planId: input.planId,
        durationDays,
        requestKey,
        reason: boundedText(input.reason, 240),
      },
    );
    return {
      id: appliedId ?? membershipId,
      applied: Boolean(appliedId),
      planId: input.planId,
      endsAt: endsAt.toISOString(),
    };
  }

  async adminUpdateLevels(input: {
    adminId: string | undefined;
    targetUserId: unknown;
    creatorLevel: unknown;
    trustLevel: unknown;
    sellerLevel: unknown;
    trustScore?: unknown;
  }) {
    const adminId = await this.requireAdmin(input.adminId);
    const targetUserId = boundedText(input.targetUserId, 160);
    if (!targetUserId) throw new BadRequestException("대상 사용자 ID가 필요합니다.");
    if (!isCreatorLevel(input.creatorLevel)) {
      throw new BadRequestException("지원하지 않는 Creator Level입니다.");
    }
    if (!isTrustLevel(input.trustLevel)) {
      throw new BadRequestException("지원하지 않는 Trust Level입니다.");
    }
    if (!isSellerLevel(input.sellerLevel)) {
      throw new BadRequestException("지원하지 않는 Seller Level입니다.");
    }
    const trustScore = input.trustScore === undefined
      ? 0
      : nonNegativeInteger(input.trustScore, "신뢰 점수", 1000);
    await dbPool.query(
      `INSERT INTO member_level (
         "userId","creatorLevel","trustLevel","sellerLevel","trustScore","updatedBy","updatedAt"
       ) VALUES ($1,$2,$3,$4,$5,$6,now())
       ON CONFLICT ("userId") DO UPDATE SET
         "creatorLevel"=EXCLUDED."creatorLevel",
         "trustLevel"=EXCLUDED."trustLevel",
         "sellerLevel"=EXCLUDED."sellerLevel",
         "trustScore"=EXCLUDED."trustScore",
         "updatedBy"=EXCLUDED."updatedBy",
         "updatedAt"=now()`,
      [targetUserId, input.creatorLevel, input.trustLevel, input.sellerLevel, trustScore, adminId],
    );
    await logAuditAction(
      adminId,
      "membership_wallet.level_update",
      "user",
      targetUserId,
      {
        creatorLevel: input.creatorLevel,
        trustLevel: input.trustLevel,
        sellerLevel: input.sellerLevel,
        trustScore,
      },
    );
    return {
      userId: targetUserId,
      creatorLevel: input.creatorLevel,
      trustLevel: input.trustLevel,
      sellerLevel: input.sellerLevel,
      trustScore,
    };
  }
}
