-- Cross-instance creator marketplace publish admission and indexed metadata search.
-- Publish gate rows contain only fixed-width digests; no raw user id, IP address, manifest, or
-- request body is retained. Reapplying this migration is safe and repairs its owned constraints
-- and indexes to their canonical definitions.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE "creator_marketplace_resource"
  ADD COLUMN IF NOT EXISTS "searchText" text
  GENERATED ALWAYS AS (
    lower(
      "name"
      || ' ' || "description"
      || ' ' || "packageId"
      || ' ' || "tags"::text
    )
  ) STORED;

-- ADD COLUMN IF NOT EXISTS must not silently accept a partial bootstrap's ordinary mutable text
-- column. The API query assumes this is a database-maintained projection of bounded metadata.
DO $migration$
DECLARE
  search_column_kind "char";
  search_column_type text;
BEGIN
  SELECT attribute.attgenerated, pg_catalog.format_type(attribute.atttypid, attribute.atttypmod)
  INTO search_column_kind, search_column_type
  FROM pg_catalog.pg_attribute AS attribute
  WHERE attribute.attrelid = 'creator_marketplace_resource'::regclass
    AND attribute.attname = 'searchText'
    AND attribute.attnum > 0
    AND NOT attribute.attisdropped;

  IF search_column_kind IS DISTINCT FROM 's' OR search_column_type IS DISTINCT FROM 'text' THEN
    RAISE EXCEPTION
      'creator_marketplace_resource.searchText must be a stored generated text column';
  END IF;
END;
$migration$;

DROP INDEX IF EXISTS "idx_creator_marketplace_resource_search";
CREATE INDEX "idx_creator_marketplace_resource_search"
  ON "creator_marketplace_resource"
  USING gin ("searchText" gin_trgm_ops)
  WHERE "hidden" = false;

DROP INDEX IF EXISTS "idx_creator_marketplace_resource_tags";
CREATE INDEX "idx_creator_marketplace_resource_tags"
  ON "creator_marketplace_resource"
  USING gin ("tags" jsonb_path_ops)
  WHERE "hidden" = false;

CREATE TABLE IF NOT EXISTS "creator_marketplace_publish_gate" (
  "keyHash" bytea PRIMARY KEY,
  "windowStartedAt" timestamptz NOT NULL,
  "requestCount" integer NOT NULL,
  "leaseTokenHash" bytea,
  "leaseFence" bigint NOT NULL,
  "leaseExpiresAt" timestamptz,
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "creator_marketplace_publish_gate_key_hash_check"
    CHECK (octet_length("keyHash") = 32),
  CONSTRAINT "creator_marketplace_publish_gate_window_check"
    CHECK (
      "windowStartedAt" = date_bin(
        interval '1 hour',
        "windowStartedAt",
        timestamptz '1970-01-01 00:00:00+00'
      )
    ),
  CONSTRAINT "creator_marketplace_publish_gate_request_count_check"
    CHECK ("requestCount" BETWEEN 1 AND 20),
  CONSTRAINT "creator_marketplace_publish_gate_lease_fence_check"
    CHECK ("leaseFence" >= 1),
  CONSTRAINT "creator_marketplace_publish_gate_lease_state_check"
    CHECK (
      (
        "leaseTokenHash" IS NULL
        AND "leaseExpiresAt" IS NULL
      )
      OR (
        "leaseTokenHash" IS NOT NULL
        AND octet_length("leaseTokenHash") = 32
        AND "leaseExpiresAt" IS NOT NULL
        AND "leaseExpiresAt" > "updatedAt"
      )
    ),
  CONSTRAINT "creator_marketplace_publish_gate_retention_check"
    CHECK ("expiresAt" = "windowStartedAt" + interval '2 hours'),
  CONSTRAINT "creator_marketplace_publish_gate_timestamps_check"
    CHECK ("updatedAt" >= "createdAt")
);

ALTER TABLE "creator_marketplace_publish_gate"
  ALTER COLUMN "windowStartedAt" SET NOT NULL,
  ALTER COLUMN "requestCount" SET NOT NULL,
  ALTER COLUMN "leaseTokenHash" DROP NOT NULL,
  ALTER COLUMN "leaseFence" DROP DEFAULT,
  ALTER COLUMN "leaseFence" SET NOT NULL,
  ALTER COLUMN "leaseExpiresAt" DROP NOT NULL,
  ALTER COLUMN "expiresAt" SET NOT NULL,
  ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN "createdAt" SET NOT NULL,
  ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN "updatedAt" SET NOT NULL;

ALTER TABLE "creator_marketplace_publish_gate"
  DROP CONSTRAINT IF EXISTS "creator_marketplace_publish_gate_key_hash_check",
  DROP CONSTRAINT IF EXISTS "creator_marketplace_publish_gate_window_check",
  DROP CONSTRAINT IF EXISTS "creator_marketplace_publish_gate_request_count_check",
  DROP CONSTRAINT IF EXISTS "creator_marketplace_publish_gate_lease_fence_check",
  DROP CONSTRAINT IF EXISTS "creator_marketplace_publish_gate_lease_state_check",
  DROP CONSTRAINT IF EXISTS "creator_marketplace_publish_gate_retention_check",
  DROP CONSTRAINT IF EXISTS "creator_marketplace_publish_gate_timestamps_check";

ALTER TABLE "creator_marketplace_publish_gate"
  ADD CONSTRAINT "creator_marketplace_publish_gate_key_hash_check"
    CHECK (octet_length("keyHash") = 32),
  ADD CONSTRAINT "creator_marketplace_publish_gate_window_check"
    CHECK (
      "windowStartedAt" = date_bin(
        interval '1 hour',
        "windowStartedAt",
        timestamptz '1970-01-01 00:00:00+00'
      )
    ),
  ADD CONSTRAINT "creator_marketplace_publish_gate_request_count_check"
    CHECK ("requestCount" BETWEEN 1 AND 20),
  ADD CONSTRAINT "creator_marketplace_publish_gate_lease_fence_check"
    CHECK ("leaseFence" >= 1),
  ADD CONSTRAINT "creator_marketplace_publish_gate_lease_state_check"
    CHECK (
      (
        "leaseTokenHash" IS NULL
        AND "leaseExpiresAt" IS NULL
      )
      OR (
        "leaseTokenHash" IS NOT NULL
        AND octet_length("leaseTokenHash") = 32
        AND "leaseExpiresAt" IS NOT NULL
        AND "leaseExpiresAt" > "updatedAt"
      )
    ),
  ADD CONSTRAINT "creator_marketplace_publish_gate_retention_check"
    CHECK ("expiresAt" = "windowStartedAt" + interval '2 hours'),
  ADD CONSTRAINT "creator_marketplace_publish_gate_timestamps_check"
    CHECK ("updatedAt" >= "createdAt");

DROP INDEX IF EXISTS "idx_creator_marketplace_publish_gate_expires";
CREATE INDEX "idx_creator_marketplace_publish_gate_expires"
  ON "creator_marketplace_publish_gate" ("expiresAt");

COMMIT;
