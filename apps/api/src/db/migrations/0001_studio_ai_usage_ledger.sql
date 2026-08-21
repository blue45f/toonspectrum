-- Forward-only Studio AI usage/quota migration.
-- This repository historically deploys schema changes with `drizzle-kit push`;
-- this SQL is the equivalent explicit production migration for controlled rollout.
-- Apply it before deploying the quota-enforcing API build. The API intentionally
-- fails closed when these tables are unavailable.

BEGIN;

CREATE TABLE IF NOT EXISTS studio_ai_daily_quota (
  "userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  "usageDay" date NOT NULL,
  "requestCount" integer NOT NULL DEFAULT 0,
  "tokenCount" bigint NOT NULL DEFAULT 0,
  "reservedTokens" bigint NOT NULL DEFAULT 0,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT studio_ai_daily_quota_pkey PRIMARY KEY ("userId", "usageDay"),
  CONSTRAINT studio_ai_daily_quota_request_count_check CHECK ("requestCount" >= 0),
  CONSTRAINT studio_ai_daily_quota_token_count_check CHECK ("tokenCount" >= 0),
  CONSTRAINT studio_ai_daily_quota_reserved_tokens_check CHECK ("reservedTokens" >= 0)
);

CREATE TABLE IF NOT EXISTS studio_ai_usage_ledger (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  task text NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  "attemptCount" integer NOT NULL DEFAULT 1,
  status text NOT NULL,
  "promptTokens" integer,
  "completionTokens" integer,
  "totalTokens" integer,
  "startedAt" timestamptz NOT NULL,
  "finishedAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT studio_ai_usage_task_check
    CHECK (task IN ('composition', 'scenario', 'translation', 'dialogue', 'palette')),
  CONSTRAINT studio_ai_usage_provider_check CHECK (provider IN ('zai', 'deepseek')),
  CONSTRAINT studio_ai_usage_model_check CHECK (char_length(model) BETWEEN 1 AND 200),
  CONSTRAINT studio_ai_usage_attempt_count_check CHECK ("attemptCount" BETWEEN 1 AND 2),
  CONSTRAINT studio_ai_usage_status_check
    CHECK (status IN (
      'success', 'client_aborted', 'timeout', 'provider_rate_limited',
      'provider_error', 'network_error', 'content_filtered'
    )),
  CONSTRAINT studio_ai_usage_prompt_tokens_check CHECK ("promptTokens" IS NULL OR "promptTokens" >= 0),
  CONSTRAINT studio_ai_usage_completion_tokens_check
    CHECK ("completionTokens" IS NULL OR "completionTokens" >= 0),
  CONSTRAINT studio_ai_usage_total_tokens_check CHECK ("totalTokens" IS NULL OR "totalTokens" >= 0),
  CONSTRAINT studio_ai_usage_timestamps_check CHECK ("finishedAt" >= "startedAt")
);

CREATE INDEX IF NOT EXISTS idx_studio_ai_usage_user_started
  ON studio_ai_usage_ledger ("userId", "startedAt");
CREATE INDEX IF NOT EXISTS idx_studio_ai_usage_status_started
  ON studio_ai_usage_ledger (status, "startedAt");

COMMIT;
