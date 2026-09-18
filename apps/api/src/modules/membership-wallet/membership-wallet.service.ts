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
  CREDIT_COST_POLICIES,
  type CreditFeatureKey,
  highestMembershipPlan,
  isCreditFeatureKey,
  isMembershipPlanId,
  MEMBER_CREATOR_LEVELS,
  MEMBER_SELLER_LEVELS,
  MEMBER_TRUST_LEVELS,
  MEMBERSHIP_ENTITLEMENT_KEYS,
  MEMBERSHIP_PLAN_POLICIES,
  type MemberCreatorLevel,
  type MemberSellerLevel,
  type MemberTrustLevel,
  type MembershipEntitlementKey,
  type MembershipPlanId,
  REWARD_MILESTONES,
  type RewardMilestoneKey,
  type WalletAsset,
  WALLET_ASSETS,
} from "../../../../../packages/core/src/membership-wallet";
import { dbPool } from "../../db";
import { isAdminUser } from "../../server/app-config";
import { logAuditAction } from "../admin/admin-types";

const RESERVATION_TTL_MS = 10 * 60 * 1000;
const REWARD_POINT_TTL_MS = 365 * 24 * 60 * 60 * 1000;
const CREDIT_REDEMPTION_POINT_COST = 1_000;
const CREDIT_REDEMPTION_CREDIT_AMOUNT = 50;

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

function boundedText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function utcMonthKey(date = new Date()): string {
  return date.toISOString().slice(0, 7);
}

function nextUtcMonth(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
}

function addUtcMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function sourcePriority(source: string): number {
  if (source === "promotion" || source === "event" || source === "compensation") return 10;
  if (source === "membership") return 20;
  if (source === "admin") return 40;
  if (source === "purchase") return 900;
  return 100;
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
      plans: await Promise.all(
        Object.keys(MEMBERSHIP_PLAN_POLICIES).map((planId) =>
          this.effectivePlanPolicy(planId as MembershipPlanId, overrides)),
      ),
      creditCosts: await Promise.all(
        Object.keys(CREDIT_COST_POLICIES).map((feature) =>
          this.effectiveCreditCost(feature as CreditFeatureKey, overrides)),
      ),
      rewardMilestones: REWARD_MILESTONES,
      pointRedemptionOffers: [
        {
          id: "studio-credit-50",
          pointCost: CREDIT_REDEMPTION_POINT_COST,
          creditAmount: CREDIT_REDEMPTION_CREDIT_AMOUNT,
        },
      ],
    };
  }

  async getOverview(userIdValue: string | undefined) {
    const userId = requireUserId(userIdValue);
    await this.ensureBetaFounderPromotion(userId);
    const planId = await this.resolveMembershipPlan(userId);
    await this.ensureMonthlyMembershipCredits(userId, planId);
    await this.releaseExpiredReservations(userId);
    await this.expireAvailableLots(userId);

    const overrides = await this.loadPolicyOverrides();
    const plan = await this.effectivePlanPolicy(planId, overrides);
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
                "trustScore", "updatedAt"
         FROM member_level WHERE "userId" = $1`,
        [userId],
      ),
      dbPool.query(
        `SELECT id, "entryType", amount, "deltaAvailable",
                "deltaReserved", reason, "referenceKey", "createdAt"
         FROM wallet_ledger_entry
         WHERE "userId" = $1
         ORDER BY "createdAt" DESC
         LIMIT 50`,
        [userId],
      ),
    ]);

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

      wallet: {
        studioCredit: balance("studio_credit"),
        rewardPoint: balance("reward_point"),
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
      pointRedemptionOffers: [{
        id: "studio-credit-50",
        pointCost: CREDIT_REDEMPTION_POINT_COST,
        creditAmount: CREDIT_REDEMPTION_CREDIT_AMOUNT,
      }],
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
    const planId = await this.resolveMembershipPlan(input.userId);
    await this.ensureMonthlyMembershipCredits(input.userId, planId);
    await this.releaseExpiredReservations(input.userId);
    await this.expireAvailableLots(input.userId);
    const estimate = await this.estimateCredits(input.feature, input.units ?? 1);
    return this.reserveAsset({
      userId: input.userId,
      asset: "studio_credit",
      amount: estimate.credits,
      featureKey: input.feature,
      idempotencyKey: input.idempotencyKey,

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

  private async reserveAsset(input: {
    userId: string;
    asset: WalletAsset;
    amount: number;
    featureKey?: CreditFeatureKey | null;
    idempotencyKey: string;
    metadata?: Record<string, unknown>;
  }) {
    const amountToReserve = positiveInteger(input.amount, "예약량");
    const idempotencyKey = boundedText(input.idempotencyKey, 200);
    if (!idempotencyKey) {
      throw new BadRequestException("예약 요청 식별자가 필요합니다.");
    }

    return this.transaction(async (client) => {
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

  private async ensureMonthlyMembershipCredits(
    userId: string,
    planId: MembershipPlanId,
  ) {
    const overrides = await this.loadPolicyOverrides();

    const policy = await this.effectivePlanPolicy(planId, overrides);
    const target = policy.monthlyCredits;
    if (target <= 0) return;

    const month = utcMonthKey();
    const granted = await dbPool.query<{ granted: string | number }>(
      `SELECT COALESCE(SUM("grantedAmount"), 0)::bigint AS granted
       FROM wallet_lot
       WHERE "userId" = $1
         AND asset = 'studio_credit'
         AND source = 'membership'
         AND "sourceRef" = $2`,
      [userId, month],
    );
    const alreadyGranted = asInt(granted.rows[0]?.granted ?? 0);
    const delta = Math.max(0, target - alreadyGranted);
    if (delta <= 0) return;

    await this.grantAsset({
      userId,
      asset: "studio_credit",

      amount: delta,
      source: "membership",
      sourceKey: `membership:${month}:${target}`,
      sourceRef: month,
      expiresAt: nextUtcMonth(),
      reason: `${policy.label} 월 제공 크레딧`,
      metadata: { planId, target, alreadyGranted },
    });
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

  /* Incomplete duplicate left by an interrupted write.
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
  */
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
            "만료된 크레딧/포인트 정리",
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
        && Number.isSafeInteger(Number(value))
        && Number(value) >= 0
      ) {
        entitlements[key] = Number(value) as never;
      }
    }
    const monthly = Number(record.monthlyCredits);
    return {
      ...base,
      monthlyCredits:
        Number.isSafeInteger(monthly)
        && monthly >= 0
        && monthly <= 1_000_000_000
          ? monthly
          : base.monthlyCredits,
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
      expiresAt: new Date(Date.now() + REWARD_POINT_TTL_MS),
      reason: policy.label,
      metadata: { milestone },
    });
  }

  async redeemRewardPoints(input: {
    userId: string | undefined;
    offerId: unknown;
    idempotencyKey: unknown;
  }) {
    const userId = requireUserId(input.userId);
    if (input.offerId !== "studio-credit-50") {
      throw new BadRequestException("지원하지 않는 포인트 교환 상품입니다.");
    }
    const idempotencyKey = boundedText(input.idempotencyKey, 160);
    if (!idempotencyKey) {
      throw new BadRequestException("포인트 교환 요청 식별자가 필요합니다.");
    }
    await this.expireAvailableLots(userId);
    const reservation = await this.reserveAsset({
      userId,
      asset: "reward_point",
      amount: CREDIT_REDEMPTION_POINT_COST,
      idempotencyKey: `point-redeem:${idempotencyKey}`,
      metadata: { offerId: "studio-credit-50" },
    });
    if (reservation.status === "released" || reservation.status === "expired") {
      throw new ConflictException({
        code: "reward_point_redemption_expired",
        message: "만료된 교환 요청입니다. 새 요청으로 다시 시도해 주세요.",
      });
    }
    if (reservation.status === "reserved") {
      await this.settleReservation(
        reservation.id,
        CREDIT_REDEMPTION_POINT_COST,
        "captured",
      );
    }
    const grant = await this.grantAsset({
      userId,
      asset: "studio_credit",
      amount: CREDIT_REDEMPTION_CREDIT_AMOUNT,
      source: "event",
      sourceKey: `point-redemption:${idempotencyKey}`,
      sourceRef: idempotencyKey,
      reason: "리워드 포인트 교환 Studio Credit",
      metadata: {
        offerId: "studio-credit-50",
        pointCost: CREDIT_REDEMPTION_POINT_COST,
      },
    });
    return {
      redeemed: grant.granted,
      idempotent: !grant.granted,
      pointCost: CREDIT_REDEMPTION_POINT_COST,
      creditAmount: CREDIT_REDEMPTION_CREDIT_AMOUNT,
    };
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
    units: unknown;
    requestKey: unknown;
    reason?: unknown;
  }) {
    const adminId = await this.requireAdmin(input.adminId);
    const targetUserId = boundedText(input.targetUserId, 160);
    if (!targetUserId) {
      throw new BadRequestException("대상 사용자 ID가 필요합니다.");
    }
    if (
      typeof input.asset !== "string"
      || !(WALLET_ASSETS as readonly string[]).includes(input.asset)
    ) {
      throw new BadRequestException("지원하지 않는 지갑 자산입니다.");
    }
    const asset = input.asset as WalletAsset;
    const units = positiveInteger(input.units, "지급량");
    const requestKey = boundedText(input.requestKey, 160);
    if (!requestKey) {
      throw new BadRequestException("지급 요청 식별자가 필요합니다.");
    }
    const reason =
      boundedText(input.reason, 240) || "관리자 수동 지급";
    const result = await this.grantAsset({
      userId: targetUserId,
      asset,
      amount: units,
      source: "admin",
      sourceKey: `admin:${adminId}:${requestKey}`,
      sourceRef: requestKey,
      expiresAt:
        asset === "reward_point"
          ? new Date(Date.now() + REWARD_POINT_TTL_MS)
          : null,
      reason,
      metadata: { adminId },
    });
    await logAuditAction(
      adminId,
      "membership_wallet.benefit_apply",
      "user",
      targetUserId,
      { asset, units, requestKey },
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
      : positiveInteger(input.trustScore, "신뢰 점수", 1000);
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
