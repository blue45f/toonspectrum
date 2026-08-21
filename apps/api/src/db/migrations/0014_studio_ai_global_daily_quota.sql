-- Adds an atomic service-wide Studio AI budget ceiling in addition to per-user limits.
-- Apply before deploying the matching API build. The API intentionally fails closed if the table
-- is unavailable so an incomplete rollout cannot create unbounded provider spend.

BEGIN;

CREATE TABLE IF NOT EXISTS studio_ai_global_daily_quota (
  "usageDay" date PRIMARY KEY,
  "requestCount" integer NOT NULL DEFAULT 0,
  "tokenCount" bigint NOT NULL DEFAULT 0,
  "reservedTokens" bigint NOT NULL DEFAULT 0,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT studio_ai_global_daily_quota_request_count_check CHECK ("requestCount" >= 0),
  CONSTRAINT studio_ai_global_daily_quota_token_count_check CHECK ("tokenCount" >= 0),
  CONSTRAINT studio_ai_global_daily_quota_reserved_tokens_check CHECK ("reservedTokens" >= 0)
);

COMMIT;
