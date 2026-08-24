-- Studio AI usage ledger: allow the OpenRouter provider in the provider check.
-- The API added OpenRouter as a first-class server text-AI provider (see
-- apps/api/src/modules/studio-ai/studio-ai-provider.ts), but the ledger check
-- constraint from 0001 still limited providers to ('zai', 'deepseek'). Every
-- OpenRouter-served request then failed its usage-ledger insert after a paid
-- success, keeping the day's reservation charged and writing no ledger row.
-- Forward-only: recreate the constraint with the full allowlist.

BEGIN;

ALTER TABLE studio_ai_usage_ledger
  DROP CONSTRAINT IF EXISTS studio_ai_usage_provider_check;

ALTER TABLE studio_ai_usage_ledger
  ADD CONSTRAINT studio_ai_usage_provider_check
  CHECK (provider IN ('zai', 'deepseek', 'openrouter'));

COMMIT;
