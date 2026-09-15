-- Expand the reviewed shared free pool from three to five providers.
-- SambaNova is admitted only for accounts with no payment method attached;
-- Mistral is admitted only for organizations kept in cardless Free mode.
-- The API still advances only after a definitive pre-inference free-quota rejection.

BEGIN;

SET LOCAL search_path = public, pg_catalog;

ALTER TABLE "studio_ai_request_receipt"
  DROP CONSTRAINT IF EXISTS "studio_ai_request_receipt_attempt_count_check";

ALTER TABLE "studio_ai_request_receipt"
  ADD CONSTRAINT "studio_ai_request_receipt_attempt_count_check"
  CHECK ("attemptCount" BETWEEN 0 AND 5) NOT VALID;

ALTER TABLE "studio_ai_request_receipt"
  VALIDATE CONSTRAINT "studio_ai_request_receipt_attempt_count_check";

ALTER TABLE "studio_ai_usage_ledger"
  DROP CONSTRAINT IF EXISTS "studio_ai_usage_provider_check",
  DROP CONSTRAINT IF EXISTS "studio_ai_usage_attempt_count_check";

ALTER TABLE "studio_ai_usage_ledger"
  ADD CONSTRAINT "studio_ai_usage_provider_check"
    CHECK (provider IN (
      'gemini', 'groq', 'sambanova', 'mistral', 'openrouter', 'zai', 'deepseek'
    )) NOT VALID,
  ADD CONSTRAINT "studio_ai_usage_attempt_count_check"
    CHECK ("attemptCount" BETWEEN 1 AND 5) NOT VALID;

ALTER TABLE "studio_ai_usage_ledger"
  VALIDATE CONSTRAINT "studio_ai_usage_provider_check",
  VALIDATE CONSTRAINT "studio_ai_usage_attempt_count_check";

COMMIT;
