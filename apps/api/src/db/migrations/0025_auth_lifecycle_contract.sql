-- Provision the complete authentication lifecycle contract before DML-only API roles serve traffic.
-- Runtime authentication probes this schema with zero-row SELECTs; all repair DDL stays here under
-- the dedicated migration role.

BEGIN;

ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS "role" text,
  ADD COLUMN IF NOT EXISTS "status" text,
  ADD COLUMN IF NOT EXISTS "sessionVersion" integer,
  ADD COLUMN IF NOT EXISTS "suspendedAt" timestamp,
  ADD COLUMN IF NOT EXISTS "suspensionReason" text,
  ADD COLUMN IF NOT EXISTS "deletedAt" timestamp,
  ADD COLUMN IF NOT EXISTS "passwordHash" text,
  ADD COLUMN IF NOT EXISTS "avatar" text,
  ADD COLUMN IF NOT EXISTS "bio" text,
  ADD COLUMN IF NOT EXISTS "createdAt" timestamp;

UPDATE "user"
SET "role" = 'user'
WHERE "role" IS NULL OR btrim("role") = '';

UPDATE "user"
SET "status" = 'active'
WHERE "status" IS NULL OR "status" NOT IN ('active', 'suspended', 'deleted');

UPDATE "user"
SET "sessionVersion" = 1
WHERE "sessionVersion" IS NULL OR "sessionVersion" < 1;

ALTER TABLE "user"
  ALTER COLUMN "role" SET DEFAULT 'user',
  ALTER COLUMN "role" SET NOT NULL,
  ALTER COLUMN "status" SET DEFAULT 'active',
  ALTER COLUMN "status" SET NOT NULL,
  ALTER COLUMN "sessionVersion" SET DEFAULT 1,
  ALTER COLUMN "sessionVersion" SET NOT NULL;

ALTER TABLE "user"
  DROP CONSTRAINT IF EXISTS "user_status_check",
  DROP CONSTRAINT IF EXISTS "user_session_version_check";

ALTER TABLE "user"
  ADD CONSTRAINT "user_status_check"
    CHECK ("status" IN ('active', 'suspended', 'deleted')),
  ADD CONSTRAINT "user_session_version_check"
    CHECK ("sessionVersion" >= 1);

CREATE TABLE IF NOT EXISTS "account" (
  "userId" text NOT NULL,
  "type" text NOT NULL,
  "provider" text NOT NULL,
  "providerAccountId" text NOT NULL,
  "refresh_token" text,
  "access_token" text,
  "expires_at" integer,
  "token_type" text,
  "scope" text,
  "id_token" text,
  "session_state" text
);

ALTER TABLE "account"
  ADD COLUMN IF NOT EXISTS "userId" text,
  ADD COLUMN IF NOT EXISTS "type" text,
  ADD COLUMN IF NOT EXISTS "provider" text,
  ADD COLUMN IF NOT EXISTS "providerAccountId" text,
  ADD COLUMN IF NOT EXISTS "refresh_token" text,
  ADD COLUMN IF NOT EXISTS "access_token" text,
  ADD COLUMN IF NOT EXISTS "expires_at" integer,
  ADD COLUMN IF NOT EXISTS "token_type" text,
  ADD COLUMN IF NOT EXISTS "scope" text,
  ADD COLUMN IF NOT EXISTS "id_token" text,
  ADD COLUMN IF NOT EXISTS "session_state" text;

ALTER TABLE "account"
  ALTER COLUMN "userId" SET NOT NULL,
  ALTER COLUMN "type" SET NOT NULL,
  ALTER COLUMN "provider" SET NOT NULL,
  ALTER COLUMN "providerAccountId" SET NOT NULL;

DO $auth_constraints$
DECLARE
  user_id_attribute smallint;
  user_email_attribute smallint;
  account_user_id_attribute smallint;
  account_provider_attribute smallint;
  account_provider_id_attribute smallint;
BEGIN
  SELECT attnum INTO STRICT user_id_attribute
  FROM pg_catalog.pg_attribute
  WHERE attrelid = 'public."user"'::regclass
    AND attname = 'id'
    AND attnum > 0
    AND NOT attisdropped;

  SELECT attnum INTO STRICT user_email_attribute
  FROM pg_catalog.pg_attribute
  WHERE attrelid = 'public."user"'::regclass
    AND attname = 'email'
    AND attnum > 0
    AND NOT attisdropped;

  SELECT attnum INTO STRICT account_user_id_attribute
  FROM pg_catalog.pg_attribute
  WHERE attrelid = 'public.account'::regclass
    AND attname = 'userId'
    AND attnum > 0
    AND NOT attisdropped;

  SELECT attnum INTO STRICT account_provider_attribute
  FROM pg_catalog.pg_attribute
  WHERE attrelid = 'public.account'::regclass
    AND attname = 'provider'
    AND attnum > 0
    AND NOT attisdropped;

  SELECT attnum INTO STRICT account_provider_id_attribute
  FROM pg_catalog.pg_attribute
  WHERE attrelid = 'public.account'::regclass
    AND attname = 'providerAccountId'
    AND attnum > 0
    AND NOT attisdropped;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public."user"'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE "user" ADD CONSTRAINT "user_pkey" PRIMARY KEY ("id");
  ELSIF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public."user"'::regclass
      AND contype = 'p'
      AND conkey = ARRAY[user_id_attribute]::smallint[]
  ) THEN
    RAISE EXCEPTION 'user primary key must cover only id';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public."user"'::regclass
      AND contype = 'u'
      AND conkey = ARRAY[user_email_attribute]::smallint[]
  ) THEN
    ALTER TABLE "user" ADD CONSTRAINT "user_email_unique" UNIQUE ("email");
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.account'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE "account"
      ADD CONSTRAINT "account_provider_providerAccountId_pk"
      PRIMARY KEY ("provider", "providerAccountId");
  ELSIF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.account'::regclass
      AND contype = 'p'
      AND conkey = ARRAY[
        account_provider_attribute,
        account_provider_id_attribute
      ]::smallint[]
  ) THEN
    RAISE EXCEPTION 'account primary key must cover provider and providerAccountId in order';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.account'::regclass
      AND contype = 'f'
      AND conkey = ARRAY[account_user_id_attribute]::smallint[]
      AND confrelid = 'public."user"'::regclass
      AND confkey = ARRAY[user_id_attribute]::smallint[]
      AND confdeltype = 'c'
  ) THEN
    ALTER TABLE "account"
      ADD CONSTRAINT "account_userId_user_id_fk"
      FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE;
  END IF;
END
$auth_constraints$;

DROP INDEX IF EXISTS "idx_user_status_created";
CREATE INDEX "idx_user_status_created"
  ON "user" ("status", "createdAt");

DROP INDEX IF EXISTS "idx_account_user";
CREATE INDEX "idx_account_user"
  ON "account" ("userId");

DO $auth_contract$
BEGIN
  IF (
    SELECT count(*)
    FROM pg_catalog.pg_attribute
    WHERE attrelid = 'public."user"'::regclass
      AND attname = ANY(ARRAY[
        'id',
        'name',
        'email',
        'emailVerified',
        'image',
        'role',
        'status',
        'sessionVersion',
        'suspendedAt',
        'suspensionReason',
        'deletedAt',
        'passwordHash',
        'avatar',
        'bio',
        'createdAt'
      ]::text[])
      AND attnum > 0
      AND NOT attisdropped
  ) <> 15 THEN
    RAISE EXCEPTION 'user authentication lifecycle columns are incomplete';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_catalog.pg_attribute
    WHERE attrelid = 'public.account'::regclass
      AND attname = ANY(ARRAY[
        'userId',
        'type',
        'provider',
        'providerAccountId',
        'refresh_token',
        'access_token',
        'expires_at',
        'token_type',
        'scope',
        'id_token',
        'session_state'
      ]::text[])
      AND attnum > 0
      AND NOT attisdropped
  ) <> 11 THEN
    RAISE EXCEPTION 'OAuth account columns are incomplete';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public."user"'::regclass
      AND conname = ANY(ARRAY[
        'user_status_check',
        'user_session_version_check'
      ]::text[])
  ) <> 2 THEN
    RAISE EXCEPTION 'user authentication lifecycle constraints are incomplete';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS index_record
    JOIN pg_catalog.pg_namespace AS index_namespace
      ON index_namespace.oid = index_record.relnamespace
    JOIN pg_catalog.pg_index AS index_state
      ON index_state.indexrelid = index_record.oid
    WHERE index_namespace.nspname = 'public'
      AND index_record.relname = 'idx_user_status_created'
      AND index_state.indrelid = 'public."user"'::regclass
      AND index_state.indisvalid
      AND index_state.indisready
      AND index_state.indislive
  ) THEN
    RAISE EXCEPTION 'user status lookup index is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS index_record
    JOIN pg_catalog.pg_namespace AS index_namespace
      ON index_namespace.oid = index_record.relnamespace
    JOIN pg_catalog.pg_index AS index_state
      ON index_state.indexrelid = index_record.oid
    WHERE index_namespace.nspname = 'public'
      AND index_record.relname = 'idx_account_user'
      AND index_state.indrelid = 'public.account'::regclass
      AND index_state.indisvalid
      AND index_state.indisready
      AND index_state.indislive
  ) THEN
    RAISE EXCEPTION 'OAuth account user lookup index is missing';
  END IF;
END
$auth_contract$;

INSERT INTO "toonspectrum_schema_migration" ("id", "appliedAt")
VALUES ('0025_auth_lifecycle_contract', statement_timestamp())
ON CONFLICT ("id") DO NOTHING;

COMMIT;
