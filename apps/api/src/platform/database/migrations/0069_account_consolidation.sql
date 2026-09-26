-- Add explicit account-consolidation state and one-time merge grants.
-- Account merges keep the source user row for audit/history and never auto-merge by email.

BEGIN;

ALTER TABLE public."user"
  ADD COLUMN IF NOT EXISTS "mergedIntoUserId" text;

ALTER TABLE public."user"
  DROP CONSTRAINT IF EXISTS "user_status_check";

ALTER TABLE public."user"
  ADD CONSTRAINT "user_status_check"
    CHECK ("status" IN ('active', 'suspended', 'deleted', 'merged')) NOT VALID;

ALTER TABLE public."user"
  VALIDATE CONSTRAINT "user_status_check";

DO $account_merge_user_fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public."user"'::regclass
      AND conname = 'user_mergedIntoUserId_user_id_fk'
  ) THEN
    ALTER TABLE public."user"
      ADD CONSTRAINT "user_mergedIntoUserId_user_id_fk"
      FOREIGN KEY ("mergedIntoUserId")
      REFERENCES public."user"(id)
      ON DELETE SET NULL;
  END IF;
END
$account_merge_user_fk$;

CREATE INDEX IF NOT EXISTS "idx_user_merged_into"
  ON public."user" ("mergedIntoUserId")
  WHERE "mergedIntoUserId" IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.account_merge (
  id text PRIMARY KEY,
  "sourceUserId" text NOT NULL,
  "targetUserId" text,
  "tokenHash" text NOT NULL,
  status text NOT NULL DEFAULT 'issued',
  "expiresAt" timestamp NOT NULL,
  "completedAt" timestamp,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT account_merge_sourceUserId_user_id_fk
    FOREIGN KEY ("sourceUserId")
    REFERENCES public."user"(id)
    ON DELETE RESTRICT,
  CONSTRAINT account_merge_targetUserId_user_id_fk
    FOREIGN KEY ("targetUserId")
    REFERENCES public."user"(id)
    ON DELETE SET NULL,
  CONSTRAINT account_merge_status_check
    CHECK (status IN ('issued', 'completed', 'cancelled')),
  CONSTRAINT account_merge_distinct_accounts_check
    CHECK ("targetUserId" IS NULL OR "sourceUserId" <> "targetUserId"),
  CONSTRAINT account_merge_token_hash_check
    CHECK ("tokenHash" ~ '^sha256:[0-9a-f]{64}$'),
  CONSTRAINT account_merge_expiry_check
    CHECK ("expiresAt" > "createdAt")
);

CREATE UNIQUE INDEX IF NOT EXISTS account_merge_token_hash_unique
  ON public.account_merge ("tokenHash");
CREATE INDEX IF NOT EXISTS idx_account_merge_source_status
  ON public.account_merge ("sourceUserId", status, "createdAt");
CREATE INDEX IF NOT EXISTS idx_account_merge_target_completed
  ON public.account_merge ("targetUserId", "completedAt");
CREATE INDEX IF NOT EXISTS idx_account_merge_expiry
  ON public.account_merge (status, "expiresAt");

REVOKE ALL ON TABLE public.account_merge FROM PUBLIC;

COMMIT;
