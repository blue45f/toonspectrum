-- Expand the reviewed shared free pool from three to nine external free API providers.
-- SambaNova is admitted only for accounts with no payment method attached;
-- Mistral is admitted only for organizations kept in cardless Free mode;
-- Cloudflare is admitted only for Workers Free accounts and allowlisted free-plan models.
-- Qwen requires China (Beijing) Free Quota Only; Z.AI and SiliconFlow use exact free-model allowlists.
-- Local LLM, self-hosted and batch execution are intentionally outside this automatic pool.
-- The API still advances only after a definitive pre-inference free-quota rejection.

BEGIN;

SET LOCAL search_path = public, pg_catalog;

ALTER TABLE "studio_ai_request_receipt"
  DROP CONSTRAINT IF EXISTS "studio_ai_request_receipt_attempt_count_check";

ALTER TABLE "studio_ai_request_receipt"
  ADD CONSTRAINT "studio_ai_request_receipt_attempt_count_check"
  CHECK ("attemptCount" BETWEEN 0 AND 9) NOT VALID;

ALTER TABLE "studio_ai_request_receipt"
  VALIDATE CONSTRAINT "studio_ai_request_receipt_attempt_count_check";

ALTER TABLE "studio_ai_usage_ledger"
  DROP CONSTRAINT IF EXISTS "studio_ai_usage_provider_check",
  DROP CONSTRAINT IF EXISTS "studio_ai_usage_attempt_count_check";

ALTER TABLE "studio_ai_usage_ledger"
  ADD CONSTRAINT "studio_ai_usage_provider_check"
    CHECK (provider IN (
      'gemini', 'qwen', 'groq', 'sambanova', 'zai', 'mistral', 'cloudflare', 'openrouter', 'siliconflow', 'deepseek'
    )) NOT VALID,
  ADD CONSTRAINT "studio_ai_usage_attempt_count_check"
    CHECK ("attemptCount" BETWEEN 1 AND 9) NOT VALID;

ALTER TABLE "studio_ai_usage_ledger"
  VALIDATE CONSTRAINT "studio_ai_usage_provider_check",
  VALIDATE CONSTRAINT "studio_ai_usage_attempt_count_check";

COMMIT;
