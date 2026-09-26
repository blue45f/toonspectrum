import { randomUUID } from "node:crypto";

import { Injectable } from "@nestjs/common";

import { dbPool } from "../../platform/database";

const SUPPORTED_REWARD_ACTIVITIES = new Set([
  "creator.work.created",
  "creator.work.published",
  "community.post.created",
  "community.comment.created",
]);

@Injectable()
export class MembershipRewardReversalService {
  async reverseActivityBySource(input: {
    activity: string;
    sourceRef: string | null | undefined;
    actorUserId?: string | null;
    reason: string;
  }): Promise<{
    reversed: boolean;
    amount: number;
    pendingAmount: number;
  }> {
    const sourceRef = String(input.sourceRef ?? "").trim();
    if (!sourceRef || !SUPPORTED_REWARD_ACTIVITIES.has(input.activity)) {
      return { reversed: false, amount: 0, pendingAmount: 0 };
    }
    const sourceKey = "activity:" + input.activity + ":" + sourceRef;
    const owner = await dbPool.query<{ userId: string }>(
      `SELECT "userId"
       FROM wallet_lot
       WHERE asset = 'reward_point' AND "sourceKey" = $1
       ORDER BY "createdAt" ASC
       LIMIT 1`,
      [sourceKey],
    );
    const userId = owner.rows[0]?.userId;
    if (!userId) return { reversed: false, amount: 0, pendingAmount: 0 };
    return this.reverseActivity({
      userId,
      activity: input.activity,
      sourceRef,
      actorUserId: input.actorUserId,
      reason: input.reason,
    });
  }

  async reverseActivitiesByMetadata(input: {
    activity: string;
    metadataKey: string;
    metadataValue: string;
    actorUserId?: string | null;
    reason: string;
  }): Promise<{ matched: number }> {
    if (
      !SUPPORTED_REWARD_ACTIVITIES.has(input.activity)
      || !/^[A-Za-z][A-Za-z0-9_]{0,63}$/u.test(input.metadataKey)
      || !input.metadataValue
    ) {
      return { matched: 0 };
    }
    const source = "activity:" + input.activity;
    const rows = await dbPool.query<{ sourceRef: string | null }>(
      `SELECT DISTINCT "sourceRef"
       FROM wallet_lot
       WHERE asset = 'reward_point'
         AND source = $1
         AND metadata ->> $2 = $3
         AND "sourceRef" IS NOT NULL`,
      [source, input.metadataKey, input.metadataValue],
    );
    await Promise.allSettled(
      rows.rows.map((row) =>
        this.reverseActivityBySource({
          activity: input.activity,
          sourceRef: row.sourceRef,
          actorUserId: input.actorUserId,
          reason: input.reason,
        })
      ),
    );
    return { matched: rows.rows.length };
  }

  async reverseActivity(input: {
    userId: string | null | undefined;
    activity: string;
    sourceRef: string | null | undefined;
    actorUserId?: string | null;
    reason: string;
  }): Promise<{
    reversed: boolean;
    amount: number;
    pendingAmount: number;
  }> {
    const userId = String(input.userId ?? "").trim();
    const sourceRef = String(input.sourceRef ?? "").trim();
    if (
      !userId
      || !sourceRef
      || !SUPPORTED_REWARD_ACTIVITIES.has(input.activity)
    ) {
      return { reversed: false, amount: 0, pendingAmount: 0 };
    }

    const client = await dbPool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext($1))",
        [`membership-reward-reversal:${userId}`],
      );

      const existing = await client.query<{
        reversedAmount: string | number;
        pendingAmount: string | number;
      }>(
        `SELECT "reversedAmount", "pendingAmount"
         FROM membership_reward_reversal
         WHERE "userId" = $1 AND activity = $2 AND "sourceRef" = $3
         LIMIT 1`,
        [userId, input.activity, sourceRef],
      );
      if (existing.rows[0]) {
        await client.query("COMMIT");
        return {
          reversed: false,
          amount: Number(existing.rows[0].reversedAmount ?? 0),
          pendingAmount: Number(existing.rows[0].pendingAmount ?? 0),
        };
      }

      const sourceKey = `activity:${input.activity}:${sourceRef}`;
      const original = await client.query<{
        accountId: string;
        grantedAmount: string | number;
      }>(
        `SELECT lot."accountId", lot."grantedAmount"
         FROM wallet_lot AS lot
         WHERE lot."userId" = $1
           AND lot.asset = 'reward_point'
           AND lot."sourceKey" = $2
         LIMIT 1
         FOR UPDATE`,
        [userId, sourceKey],
      );
      const originalLot = original.rows[0];
      if (!originalLot) {
        await client.query("COMMIT");
        return { reversed: false, amount: 0, pendingAmount: 0 };
      }

      const requestedAmount = Number(originalLot.grantedAmount);
      const accountResult = await client.query<{
        availableAmount: string | number;
      }>(
        `SELECT "availableAmount"
         FROM wallet_account
         WHERE id = $1
         FOR UPDATE`,
        [originalLot.accountId],
      );
      const availableAmount = Math.max(
        0,
        Number(accountResult.rows[0]?.availableAmount ?? 0),
      );
      const reversibleAmount = Math.min(requestedAmount, availableAmount);

      let remaining = reversibleAmount;
      if (remaining > 0) {
        const lots = await client.query<{
          id: string;
          remainingAmount: string | number;
        }>(
          `SELECT id, "remainingAmount"
           FROM wallet_lot
           WHERE "accountId" = $1
             AND "remainingAmount" > 0
             AND ("expiresAt" IS NULL OR "expiresAt" > now())
           ORDER BY "spendPriority" ASC, "expiresAt" ASC NULLS LAST, "createdAt" ASC
           FOR UPDATE`,
          [originalLot.accountId],
        );
        for (const lot of lots.rows) {
          if (remaining <= 0) break;
          const available = Number(lot.remainingAmount);
          const take = Math.min(remaining, available);
          if (take <= 0) continue;
          await client.query(
            `UPDATE wallet_lot
             SET "remainingAmount" = "remainingAmount" - $2
             WHERE id = $1`,
            [lot.id, take],
          );
          remaining -= take;
        }
      }

      const reversedAmount = reversibleAmount - remaining;
      const pendingAmount = requestedAmount - reversedAmount;
      if (reversedAmount > 0) {
        await client.query(
          `UPDATE wallet_account
           SET "availableAmount" = "availableAmount" - $2,
               "updatedAt" = now()
           WHERE id = $1 AND "availableAmount" >= $2`,
          [originalLot.accountId, reversedAmount],
        );
        await client.query(
          `INSERT INTO wallet_ledger_entry (
             id, "accountId", "userId", "entryType", amount,
             "deltaAvailable", "deltaReserved", reason,
             "referenceKey", "idempotencyKey", metadata
           ) VALUES (
             $1,$2,$3,'reversal',$4,$5,0,$6,$7,$8,$9::jsonb
           )`,
          [
            randomUUID(),
            originalLot.accountId,
            userId,
            reversedAmount,
            -reversedAmount,
            input.reason,
            sourceKey,
            `reversal:${sourceKey}`,
            JSON.stringify({
              activity: input.activity,
              sourceRef,
              actorUserId: input.actorUserId ?? null,
            }),
          ],
        );
      }

      await client.query(
        `INSERT INTO membership_reward_reversal (
           id, "userId", activity, "sourceRef", reason,
           "requestedAmount", "reversedAmount", "pendingAmount", "actorUserId"
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          randomUUID(),
          userId,
          input.activity,
          sourceRef,
          input.reason,
          requestedAmount,
          reversedAmount,
          pendingAmount,
          input.actorUserId ?? null,
        ],
      );

      await client.query("COMMIT");
      return {
        reversed: reversedAmount > 0,
        amount: reversedAmount,
        pendingAmount,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
