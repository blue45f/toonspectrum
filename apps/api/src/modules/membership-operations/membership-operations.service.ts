import { randomUUID } from "node:crypto";

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { and, desc, eq, sql } from "drizzle-orm";

import {
  highestMembershipPlan,
  isMembershipPlanId,
} from "../../../../../packages/core/src/membership-wallet";
import {
  db,
  membershipGrants,
} from "../../platform/database";
import { isAdminUser } from "../../server/app-config";

import {
  readActivityRewardUsage,
  readDailyUploadBytes,
  readMembershipStorageUsage,
  reconcileMembershipResourceState,
  resolveEffectiveResourcePolicy,
} from "./membership-resource-quota";

function requireUserId(value: string | undefined): string {
  const userId = String(value ?? "").trim();
  if (!userId) throw new ForbiddenException("로그인이 필요해요.");
  return userId;
}

function ratio(used: number, limit: number): number {
  if (limit <= 0) return used > 0 ? 1 : 0;
  return used / limit;
}

function expiryDays(endsAt: Date | null, now = new Date()): number | null {
  if (!endsAt) return null;
  return Math.max(0, Math.ceil((endsAt.getTime() - now.getTime()) / 86_400_000));
}

@Injectable()
export class MembershipOperationsService {
  async overview(userIdValue: string | undefined) {
    const userId = requireUserId(userIdValue);
    return db.transaction(async (transaction) => {
      await transaction.execute(sql`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${`membership-operations:${userId}`}, 0)
        )
      `);

      const policy = await resolveEffectiveResourcePolicy(transaction, userId);
      const storage = await readMembershipStorageUsage(transaction, userId);
      const dailyUploadBytes = await readDailyUploadBytes(transaction, userId);
      const resourceState = await reconcileMembershipResourceState(transaction, {
        userId,
        planId: policy.planId,
        usageBytes: storage.totalBytes,
        limitBytes: policy.storageBytes,
        warningRatio: policy.warningRatio,
      });
      const activityRewards = await readActivityRewardUsage(transaction, userId);

      const activeGrants = await transaction
        .select({
          id: membershipGrants.id,
          planId: membershipGrants.planId,
          source: membershipGrants.source,
          startsAt: membershipGrants.startsAt,
          endsAt: membershipGrants.endsAt,
        })
        .from(membershipGrants)
        .where(
          and(
            eq(membershipGrants.userId, userId),
            eq(membershipGrants.status, "active"),
            sql`${membershipGrants.startsAt} <= now()`,
            sql`(${membershipGrants.endsAt} IS NULL OR ${membershipGrants.endsAt} > now())`,
          ),
        )
        .orderBy(desc(membershipGrants.startsAt));

      const highest = highestMembershipPlan(
        activeGrants.map((grant) => grant.planId).filter(isMembershipPlanId),
      );
      const currentPlanGrants = activeGrants.filter(
        (grant) => grant.planId === highest,
      );
      const indefinite = currentPlanGrants.some((grant) => grant.endsAt === null);
      const membershipEndsAt = indefinite
        ? null
        : currentPlanGrants.reduce<Date | null>((latest, grant) => {
            if (!grant.endsAt) return latest;
            if (!latest || grant.endsAt > latest) return grant.endsAt;
            return latest;
          }, null);
      const daysUntilExpiry = expiryDays(membershipEndsAt);

      const storageRatio = ratio(storage.totalBytes, policy.storageBytes);

      if (daysUntilExpiry !== null && daysUntilExpiry <= 7) {
        const grant = currentPlanGrants.find((item) => item.endsAt !== null);
        if (grant) {
          await this.ensureNotice(transaction, {
            userId,
            type: "membership_expiring",
            dedupeKey: `membership-expiring:${grant.id}`,
            payload: {
              grantId: grant.id,
              planId: grant.planId,
              endsAt: grant.endsAt?.toISOString() ?? null,
              daysUntilExpiry,
            },
          });
        }
      }

      const notices = await transaction.execute(sql`
        SELECT id, type, payload, "seenAt", "createdAt"
        FROM membership_notice
        WHERE "userId" = ${userId}
        ORDER BY ("seenAt" IS NULL) DESC, "createdAt" DESC
        LIMIT 20
      `);

      return {
        membership: {
          planId: policy.planId,
          endsAt: membershipEndsAt?.toISOString() ?? null,
          daysUntilExpiry,
        },
        storage: {
          ...storage,
          limitBytes: policy.storageBytes,
          warningRatio: policy.warningRatio,
          usageRatio: storageRatio,
          status: resourceState.status,
          canUpload: resourceState.canUpload,
          overQuotaSince: resourceState.overQuotaSince?.toISOString() ?? null,
          graceEndsAt: resourceState.graceEndsAt?.toISOString() ?? null,
        },
        upload: {
          todayBytes: dailyUploadBytes,
          dailyLimitBytes: policy.dailyUploadMaxBytes,
          remainingTodayBytes: Math.max(
            0,
            policy.dailyUploadMaxBytes - dailyUploadBytes,
          ),
          fileMaxBytes: policy.fileMaxBytes,
        },
        activityRewards,
        notices: notices.rows,
      };
    });
  }

  async collaborationMemberLimit(ownerUserId: string): Promise<number> {
    const userId = requireUserId(ownerUserId);
    return db.transaction(async (transaction) => {
      const policy = await resolveEffectiveResourcePolicy(transaction, userId);
      return Math.max(1, policy.collaborationMembers);
    });
  }

  async markNoticeSeen(
    userIdValue: string | undefined,
    noticeIdValue: unknown,
  ) {
    const userId = requireUserId(userIdValue);
    const noticeId = String(noticeIdValue ?? "").trim();
    if (!noticeId || noticeId.length > 180) {
      throw new BadRequestException("알림 식별자가 올바르지 않습니다.");
    }
    const result = await db.execute(sql`
      UPDATE membership_notice
      SET "seenAt" = COALESCE("seenAt", now())
      WHERE id = ${noticeId}
        AND "userId" = ${userId}
      RETURNING id, "seenAt"
    `);
    return {
      updated: Boolean(result.rows?.[0]),
      notice: result.rows?.[0] ?? null,
    };
  }

  async policyHistory(
    adminIdValue: string | undefined,
    limitValue: unknown,
  ) {
    const adminId = requireUserId(adminIdValue);
    if (!(await isAdminUser(adminId))) {
      throw new ForbiddenException("관리자 권한이 필요합니다.");
    }
    const parsed = Number(limitValue ?? 100);
    const limit = Number.isSafeInteger(parsed)
      ? Math.max(1, Math.min(200, parsed))
      : 100;
    const result = await db.execute(sql`
      SELECT revision, key, "beforeValue", "afterValue",
             "beforeActive", "afterActive", "changedBy", "changedAt"
      FROM membership_policy_change
      ORDER BY revision DESC
      LIMIT ${limit}
    `);
    return { items: result.rows };
  }

  async pendingRewardRecoveries(
    adminIdValue: string | undefined,
    limitValue: unknown,
  ) {
    const adminId = requireUserId(adminIdValue);
    if (!(await isAdminUser(adminId))) {
      throw new ForbiddenException("관리자 권한이 필요합니다.");
    }
    const parsed = Number(limitValue ?? 100);
    const limit = Number.isSafeInteger(parsed)
      ? Math.max(1, Math.min(200, parsed))
      : 100;
    const result = await db.execute(sql`
      SELECT id, "userId", activity, "sourceRef", reason,
             "requestedAmount", "reversedAmount", "pendingAmount",
             "actorUserId", "createdAt"
      FROM membership_reward_reversal
      WHERE "pendingAmount" > 0
      ORDER BY "createdAt" DESC
      LIMIT ${limit}
    `);
    return { items: result.rows };
  }

  private async ensureNotice(
    transaction: Parameters<Parameters<typeof db.transaction>[0]>[0],
    input: {
      userId: string;
      type:
        | "storage_warning"
        | "storage_over_quota"
        | "storage_read_only"
        | "membership_expiring";
      dedupeKey: string;
      payload: Record<string, unknown>;
    },
  ): Promise<void> {
    await transaction.execute(sql`
      INSERT INTO membership_notice (
        id, "userId", type, "dedupeKey", payload
      ) VALUES (
        ${randomUUID()},
        ${input.userId},
        ${input.type},
        ${input.dedupeKey},
        ${JSON.stringify(input.payload)}::jsonb
      )
      ON CONFLICT ("userId", "dedupeKey") DO NOTHING
    `);
  }
}
