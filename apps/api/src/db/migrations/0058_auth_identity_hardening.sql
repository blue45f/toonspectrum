-- Harden authentication identity invariants without locking out credential users
-- created before email verification existed.

BEGIN;

DO $normalized_email_collision$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public."user"
    WHERE email IS NOT NULL
    GROUP BY lower(btrim(email))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'normalized user email collision must be resolved before auth hardening';
  END IF;
END
$normalized_email_collision$;

UPDATE public."user"
SET email = lower(btrim(email))
WHERE email IS NOT NULL
  AND email IS DISTINCT FROM lower(btrim(email));

-- Preserve access for credential accounts created before verification existed.
UPDATE public."user"
SET "emailVerified" = COALESCE("createdAt", now())
WHERE "passwordHash" IS NOT NULL
  AND email IS NOT NULL
  AND "emailVerified" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "idx_user_email_normalized_unique"
  ON public."user" (lower(btrim(email)))
  WHERE email IS NOT NULL;

DO $provider_link_collision$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.account
    GROUP BY "userId", provider
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'duplicate provider links per user must be resolved before auth hardening';
  END IF;
END
$provider_link_collision$;

CREATE UNIQUE INDEX IF NOT EXISTS "idx_account_user_provider_unique"
  ON public.account ("userId", provider);

CREATE INDEX IF NOT EXISTS "idx_verification_token_token"
  ON public."verificationToken" (token);

CREATE INDEX IF NOT EXISTS "idx_verification_token_expires"
  ON public."verificationToken" (expires);

ALTER TABLE public.account
  DROP CONSTRAINT IF EXISTS "account_provider_length_check",
  DROP CONSTRAINT IF EXISTS "account_provider_account_id_length_check";

ALTER TABLE public.account
  ADD CONSTRAINT "account_provider_length_check"
    CHECK (length(btrim(provider)) BETWEEN 1 AND 40) NOT VALID,
  ADD CONSTRAINT "account_provider_account_id_length_check"
    CHECK (length(btrim("providerAccountId")) BETWEEN 1 AND 512) NOT VALID;

ALTER TABLE public.account
  VALIDATE CONSTRAINT "account_provider_length_check";

ALTER TABLE public.account
  VALIDATE CONSTRAINT "account_provider_account_id_length_check";

COMMIT;
