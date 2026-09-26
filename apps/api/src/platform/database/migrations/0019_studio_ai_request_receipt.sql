-- Durable, privacy-preserving idempotency receipts for paid Studio AI provider calls.
-- The table stores only SHA-256 identities and bounded operational state: never raw operation
-- keys, prompts, provider response bodies, API keys, or user-facing generated content.

BEGIN;

CREATE TABLE IF NOT EXISTS "studio_ai_request_receipt" (
  "userKeyHash" bytea PRIMARY KEY,
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "requestHash" bytea NOT NULL,
  "leaseFence" bigint NOT NULL,
  "status" text NOT NULL,
  "attemptCount" integer NOT NULL DEFAULT 0,
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "studio_ai_request_receipt_user_request_unique"
    UNIQUE ("userId", "requestHash"),
  CONSTRAINT "studio_ai_request_receipt_user_key_hash_check"
    CHECK (octet_length("userKeyHash") = 32),
  CONSTRAINT "studio_ai_request_receipt_request_hash_check"
    CHECK (octet_length("requestHash") = 32),
  CONSTRAINT "studio_ai_request_receipt_lease_fence_check"
    CHECK ("leaseFence" >= 0),
  CONSTRAINT "studio_ai_request_receipt_status_check"
    CHECK ("status" IN ('admitted', 'sent', 'succeeded', 'ambiguous')),
  CONSTRAINT "studio_ai_request_receipt_attempt_count_check"
    CHECK ("attemptCount" BETWEEN 0 AND 2),
  CONSTRAINT "studio_ai_request_receipt_expiry_check"
    CHECK ("expiresAt" > "createdAt")
);

-- Repair supported partial-bootstrap drift. Missing values or duplicate live identities make the
-- migration fail closed rather than silently weakening paid-call replay protection.
ALTER TABLE "studio_ai_request_receipt"
  ADD COLUMN IF NOT EXISTS "userKeyHash" bytea,
  ADD COLUMN IF NOT EXISTS "userId" text,
  ADD COLUMN IF NOT EXISTS "requestHash" bytea,
  ADD COLUMN IF NOT EXISTS "leaseFence" bigint,
  ADD COLUMN IF NOT EXISTS "status" text,
  ADD COLUMN IF NOT EXISTS "attemptCount" integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "expiresAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "createdAt" timestamptz DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "studio_ai_request_receipt"
  ALTER COLUMN "userKeyHash" SET NOT NULL,
  ALTER COLUMN "userId" SET NOT NULL,
  ALTER COLUMN "requestHash" SET NOT NULL,
  ALTER COLUMN "leaseFence" SET NOT NULL,
  ALTER COLUMN "status" SET NOT NULL,
  ALTER COLUMN "attemptCount" SET DEFAULT 0,
  ALTER COLUMN "attemptCount" SET NOT NULL,
  ALTER COLUMN "expiresAt" SET NOT NULL,
  ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN "createdAt" SET NOT NULL,
  ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN "updatedAt" SET NOT NULL;

ALTER TABLE "studio_ai_request_receipt"
  DROP CONSTRAINT IF EXISTS "studio_ai_request_receipt_pkey",
  DROP CONSTRAINT IF EXISTS "studio_ai_request_receipt_userId_user_id_fk",
  DROP CONSTRAINT IF EXISTS "studio_ai_request_receipt_user_request_unique",
  DROP CONSTRAINT IF EXISTS "studio_ai_request_receipt_user_key_hash_check",
  DROP CONSTRAINT IF EXISTS "studio_ai_request_receipt_request_hash_check",
  DROP CONSTRAINT IF EXISTS "studio_ai_request_receipt_lease_fence_check",
  DROP CONSTRAINT IF EXISTS "studio_ai_request_receipt_status_check",
  DROP CONSTRAINT IF EXISTS "studio_ai_request_receipt_attempt_count_check",
  DROP CONSTRAINT IF EXISTS "studio_ai_request_receipt_expiry_check";

-- drizzle-kit versions that previously represented this contract as a standalone unique index
-- leave the relation name behind after DROP CONSTRAINT. Remove only that canonical relation name
-- before rebuilding it as the catalog-verifiable UNIQUE constraint below.
DROP INDEX IF EXISTS "studio_ai_request_receipt_user_request_unique";

ALTER TABLE "studio_ai_request_receipt"
  ADD CONSTRAINT "studio_ai_request_receipt_pkey" PRIMARY KEY ("userKeyHash"),
  ADD CONSTRAINT "studio_ai_request_receipt_userId_user_id_fk"
    FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "studio_ai_request_receipt_user_request_unique"
    UNIQUE ("userId", "requestHash"),
  ADD CONSTRAINT "studio_ai_request_receipt_user_key_hash_check"
    CHECK (octet_length("userKeyHash") = 32),
  ADD CONSTRAINT "studio_ai_request_receipt_request_hash_check"
    CHECK (octet_length("requestHash") = 32),
  ADD CONSTRAINT "studio_ai_request_receipt_lease_fence_check"
    CHECK ("leaseFence" >= 0),
  ADD CONSTRAINT "studio_ai_request_receipt_status_check"
    CHECK ("status" IN ('admitted', 'sent', 'succeeded', 'ambiguous')),
  ADD CONSTRAINT "studio_ai_request_receipt_attempt_count_check"
    CHECK ("attemptCount" BETWEEN 0 AND 2),
  ADD CONSTRAINT "studio_ai_request_receipt_expiry_check"
    CHECK ("expiresAt" > "createdAt");

-- The UNIQUE constraint owns its canonical btree index. Rebuild the non-unique expiry index so a
-- same-name wrong-table/predicate/expression bootstrap cannot strand expired receipts.
ALTER TABLE "studio_ai_request_receipt"
  DROP CONSTRAINT IF EXISTS "idx_studio_ai_request_receipt_expires";
DROP INDEX IF EXISTS "idx_studio_ai_request_receipt_expires";
CREATE INDEX "idx_studio_ai_request_receipt_expires"
  ON "studio_ai_request_receipt" USING btree ("expiresAt" ASC NULLS LAST);

COMMIT;
