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
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: unknown[]
  ): Promise<SqlResult<Row>>;
  connect(): Promise<StudioAiSqlClient>;
}

const RESERVE_QUOTA_SQL = `
WITH quota_clock AS (
  SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date AS usage_day
)
INSERT INTO studio_ai_daily_quota (
  "userId", "usageDay", "requestCount", "tokenCount", "reservedTokens", "createdAt", "updatedAt"
)
SELECT $1, quota_clock.usage_day, 1, 0, $2::bigint, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM quota_clock
WHERE $3::integer >= 1 AND $2::bigint <= $4::bigint
ON CONFLICT ("userId", "usageDay") DO UPDATE SET
  "requestCount" = studio_ai_daily_quota."requestCount" + 1,
  "reservedTokens" = studio_ai_daily_quota."reservedTokens" + $2::bigint,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE studio_ai_daily_quota."requestCount" < $3::integer
  AND studio_ai_daily_quota."tokenCount"
    + studio_ai_daily_quota."reservedTokens"
    + $2::bigint <= $4::bigint
RETURNING "usageDay"::text AS "usageDay"
`;

const SETTLE_QUOTA_SQL = `
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

    const result = await this.pool.query<{ usageDay: string }>(RESERVE_QUOTA_SQL, [
      input.userId,
      input.reservedTokens,
      input.limits.dailyRequests,
      input.limits.dailyTokens,
    ]);
    const usageDay = result.rows[0]?.usageDay;
    return result.rowCount === 1 && typeof usageDay === "string"
      ? { allowed: true, usageDay }
      : { allowed: false };
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
      const settled = await client.query(SETTLE_QUOTA_SQL, [
        input.userId,
        input.usageDay,
        input.reservedTokens,
        chargedTokens,
      ]);
      if (settled.rowCount !== 1) {
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
