-- Expand the Studio AI persistence contract for the reviewed six-provider
-- shared free pool. The API may attempt Gemini, Groq, SambaNova, Cloudflare,
-- Mistral, then OpenRouter only after a definitive pre-inference free-quota
-- rejection, so receipts and usage rows must permit six attempts. The unified
-- assistant task and free providers are also first-class ledger values.

BEGIN;

SET LOCAL search_path = public, pg_catalog;

ALTER TABLE "studio_ai_request_receipt"
  DROP CONSTRAINT IF EXISTS "studio_ai_request_receipt_attempt_count_check";

ALTER TABLE "studio_ai_request_receipt"
  ADD CONSTRAINT "studio_ai_request_receipt_attempt_count_check"
  CHECK ("attemptCount" BETWEEN 0 AND 6) NOT VALID;

ALTER TABLE "studio_ai_request_receipt"
  VALIDATE CONSTRAINT "studio_ai_request_receipt_attempt_count_check";

ALTER TABLE "studio_ai_usage_ledger"
  DROP CONSTRAINT IF EXISTS "studio_ai_usage_task_check",
  DROP CONSTRAINT IF EXISTS "studio_ai_usage_provider_check",
  DROP CONSTRAINT IF EXISTS "studio_ai_usage_attempt_count_check";

ALTER TABLE "studio_ai_usage_ledger"
  ADD CONSTRAINT "studio_ai_usage_task_check"
    CHECK (task IN (
      'assistant', 'composition', 'scenario', 'translation', 'dialogue', 'palette'
    )) NOT VALID,
  ADD CONSTRAINT "studio_ai_usage_provider_check"
    CHECK (provider IN (
      'gemini', 'groq', 'sambanova', 'cloudflare', 'mistral',
      'openrouter', 'zai', 'deepseek'
    )) NOT VALID,
  ADD CONSTRAINT "studio_ai_usage_attempt_count_check"
    CHECK ("attemptCount" BETWEEN 1 AND 6) NOT VALID;

ALTER TABLE "studio_ai_usage_ledger"
  VALIDATE CONSTRAINT "studio_ai_usage_task_check",
  VALIDATE CONSTRAINT "studio_ai_usage_provider_check",
  VALIDATE CONSTRAINT "studio_ai_usage_attempt_count_check";

COMMIT;
