-- Persist encrypted personal storage OAuth connections used by save-first Studio.
-- Refresh and access tokens are encrypted in the application before they reach
-- this table. Project bytes remain in the user's own provider account.

BEGIN;

CREATE TABLE IF NOT EXISTS public.personal_cloud_connection (
  "userId" text NOT NULL,
  "provider" text NOT NULL,
  "providerAccountId" text NOT NULL,
  "accountLabel" text NOT NULL,
  "encryptedAccessToken" text NOT NULL,
  "encryptedRefreshToken" text NOT NULL,
  "tokenType" text NOT NULL DEFAULT 'Bearer',
  "scope" text NOT NULL,
  "accessTokenExpiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" timestamptz,
  CONSTRAINT personal_cloud_connection_pkey
    PRIMARY KEY ("userId", "provider"),
  CONSTRAINT personal_cloud_connection_user_fkey
    FOREIGN KEY ("userId") REFERENCES public."user"("id") ON DELETE CASCADE,
  CONSTRAINT personal_cloud_connection_provider_check
    CHECK ("provider" IN ('google-drive', 'dropbox', 'onedrive')),
  CONSTRAINT personal_cloud_connection_provider_account_check
    CHECK (length("providerAccountId") BETWEEN 1 AND 512),
  CONSTRAINT personal_cloud_connection_account_label_check
    CHECK (length("accountLabel") BETWEEN 1 AND 512),
  CONSTRAINT personal_cloud_connection_token_ciphertext_check
    CHECK (
      length("encryptedAccessToken") BETWEEN 32 AND 32768
      AND length("encryptedRefreshToken") BETWEEN 32 AND 32768
    ),
  CONSTRAINT personal_cloud_connection_token_type_check
    CHECK (length("tokenType") BETWEEN 1 AND 64),
  CONSTRAINT personal_cloud_connection_scope_check
    CHECK (length("scope") BETWEEN 1 AND 4096),
  CONSTRAINT personal_cloud_connection_timestamp_check
    CHECK (
      "updatedAt" >= "createdAt"
      AND ("lastUsedAt" IS NULL OR "lastUsedAt" >= "createdAt")
    )
);

CREATE INDEX IF NOT EXISTS idx_personal_cloud_connection_updated
  ON public.personal_cloud_connection ("userId", "updatedAt" DESC);

CREATE INDEX IF NOT EXISTS idx_personal_cloud_connection_provider_account
  ON public.personal_cloud_connection ("provider", "providerAccountId");

REVOKE ALL ON TABLE public.personal_cloud_connection FROM PUBLIC;
DO $personal_cloud_connection_contract$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.personal_cloud_connection'::regclass
      AND conname = 'personal_cloud_connection_provider_check'
  ) THEN
    RAISE EXCEPTION 'personal cloud provider constraint is missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.personal_cloud_connection
    WHERE "provider" NOT IN ('google-drive', 'dropbox', 'onedrive')
      OR length("encryptedAccessToken") < 32
      OR length("encryptedRefreshToken") < 32
  ) THEN
    RAISE EXCEPTION 'personal cloud connection contract is invalid';
  END IF;
END
$personal_cloud_connection_contract$;

COMMIT;
