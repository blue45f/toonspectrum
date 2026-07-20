import { dbPool } from "../../../../../lib/db";

import { studioAiQuotaTokenCharge } from "./studio-ai-usage";

import type {
  StudioAiQuotaReservationInput,
  StudioAiQuotaReservationResult,
  StudioAiUsageFinalizationInput,
  StudioAiUsageStore,
} from "./studio-ai-usage";

interface SqlResult<Row extends Record<string, unknown> = Record<string, unknown>> {
  rowCount: number | null;
  rows: Row[];
}

interface StudioAiSqlClient {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: unknown[]
  ): Promise<SqlResult<Row>>;
  release(): void;
}

export interface StudioAiSqlPool {
  connect(): Promise<StudioAiSqlClient>;
}

const QUOTA_USAGE_DAY_SQL = `
SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date::text AS "usageDay"
`;

const RESERVE_GLOBAL_QUOTA_SQL = `
INSERT INTO studio_ai_global_daily_quota (
  "usageDay", "requestCount", "tokenCount", "reservedTokens", "createdAt", "updatedAt"
)
SELECT $1::date, 1, 0, $2::bigint, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE $3::integer >= 1 AND $2::bigint <= $4::bigint
ON CONFLICT ("usageDay") DO UPDATE SET
  "requestCount" = studio_ai_global_daily_quota."requestCount" + 1,
  "reservedTokens" = studio_ai_global_daily_quota."reservedTokens" + $2::bigint,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE studio_ai_global_daily_quota."requestCount" < $3::integer
  AND studio_ai_global_daily_quota."tokenCount"
    + studio_ai_global_daily_quota."reservedTokens"
    + $2::bigint <= $4::bigint
RETURNING "usageDay"::text AS "usageDay"
`;

const RESERVE_USER_QUOTA_SQL = `
INSERT INTO studio_ai_daily_quota (
  "userId", "usageDay", "requestCount", "tokenCount", "reservedTokens", "createdAt", "updatedAt"
)
SELECT $1, $2::date, 1, 0, $3::bigint, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE $4::integer >= 1 AND $3::bigint <= $5::bigint
ON CONFLICT ("userId", "usageDay") DO UPDATE SET
  "requestCount" = studio_ai_daily_quota."requestCount" + 1,
  "reservedTokens" = studio_ai_daily_quota."reservedTokens" + $3::bigint,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE studio_ai_daily_quota."requestCount" < $4::integer
  AND studio_ai_daily_quota."tokenCount"
    + studio_ai_daily_quota."reservedTokens"
    + $3::bigint <= $5::bigint
RETURNING "usageDay"::text AS "usageDay"
`;

const SETTLE_GLOBAL_QUOTA_SQL = `
UPDATE studio_ai_global_daily_quota
SET
  "reservedTokens" = "reservedTokens" - $2::bigint,
  "tokenCount" = "tokenCount" + $3::bigint,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "usageDay" = $1::date
  AND "reservedTokens" >= $2::bigint
RETURNING "usageDay"::text AS "usageDay"
`;

const SETTLE_USER_QUOTA_SQL = `
UPDATE studio_ai_daily_quota
SET
  "reservedTokens" = "reservedTokens" - $3::bigint,
  "tokenCount" = "tokenCount" + $4::bigint,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "userId" = $1
  AND "usageDay" = $2::date
  AND "reservedTokens" >= $3::bigint
RETURNING "userId"
`;

const INSERT_LEDGER_SQL = `
INSERT INTO studio_ai_usage_ledger (
  "userId", task, provider, model, "attemptCount", status,
  "promptTokens", "completionTokens", "totalTokens",
  "startedAt", "finishedAt", "createdAt"
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)
`;

function requireNonNegativeSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer.`);
  }
}

export class PostgresStudioAiUsageStore implements StudioAiUsageStore {
  constructor(private readonly pool: StudioAiSqlPool = dbPool as unknown as StudioAiSqlPool) {}

  async reserve(input: StudioAiQuotaReservationInput): Promise<StudioAiQuotaReservationResult> {
    requireNonNegativeSafeInteger(input.reservedTokens, "reservedTokens");
    requireNonNegativeSafeInteger(input.limits.dailyRequests, "dailyRequests");
    requireNonNegativeSafeInteger(input.limits.dailyTokens, "dailyTokens");
    requireNonNegativeSafeInteger(input.limits.globalDailyRequests, "globalDailyRequests");
    requireNonNegativeSafeInteger(input.limits.globalDailyTokens, "globalDailyTokens");

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const clock = await client.query<{ usageDay: string }>(QUOTA_USAGE_DAY_SQL);
      const usageDay = clock.rows[0]?.usageDay;
      if (typeof usageDay !== "string") {
        throw new Error("Studio AI quota clock did not return a UTC day.");
      }
      // Lock the single global day row first in both admission and settlement. The short-lived
      // transaction makes the service-wide cap authoritative across API instances without holding
      // any database lock during the external AI request.
      const globalReservation = await client.query<{ usageDay: string }>(
        RESERVE_GLOBAL_QUOTA_SQL,
        [
          usageDay,
          input.reservedTokens,
          input.limits.globalDailyRequests,
          input.limits.globalDailyTokens,
        ]
      );
      if (globalReservation.rowCount !== 1) {
        await client.query("ROLLBACK");
        return { allowed: false };
      }
      const userReservation = await client.query<{ usageDay: string }>(
        RESERVE_USER_QUOTA_SQL,
        [
          input.userId,
          usageDay,
          input.reservedTokens,
          input.limits.dailyRequests,
          input.limits.dailyTokens,
        ]
      );
      if (userReservation.rowCount !== 1) {
        await client.query("ROLLBACK");
        return { allowed: false };
      }
      await client.query("COMMIT");
      return { allowed: true, usageDay };
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Preserve the admission failure; the service fails closed before provider invocation.
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async finalize(input: StudioAiUsageFinalizationInput): Promise<void> {
    requireNonNegativeSafeInteger(input.reservedTokens, "reservedTokens");
    requireNonNegativeSafeInteger(input.attemptCount, "attemptCount");
    if (input.attemptCount < 1) throw new RangeError("attemptCount must be at least one.");
    const chargedTokens = studioAiQuotaTokenCharge(input.usage, input.reservedTokens);
    requireNonNegativeSafeInteger(chargedTokens, "chargedTokens");

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const globalSettled = await client.query(SETTLE_GLOBAL_QUOTA_SQL, [
        input.usageDay,
        input.reservedTokens,
        chargedTokens,
      ]);
      if (globalSettled.rowCount !== 1) {
        throw new Error("Studio AI global quota reservation was not available for finalization.");
      }
      const userSettled = await client.query(SETTLE_USER_QUOTA_SQL, [
        input.userId,
        input.usageDay,
        input.reservedTokens,
        chargedTokens,
      ]);
      if (userSettled.rowCount !== 1) {
        throw new Error("Studio AI quota reservation was not available for finalization.");
      }
      await client.query(INSERT_LEDGER_SQL, [
        input.userId,
        input.task,
        input.provider,
        input.model,
        input.attemptCount,
        input.status,
        input.usage.promptTokens ?? null,
        input.usage.completionTokens ?? null,
        input.usage.totalTokens ?? null,
        input.startedAt,
        input.finishedAt,
      ]);
      await client.query("COMMIT");
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Preserve the original failure. The service maps it to a sanitized,
        // fail-closed response and the day's reservation remains conservative.
      }
      throw error;
    } finally {
      client.release();
    }
  }
}
