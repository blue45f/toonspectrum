-- Deployment-only migration ledger.
--
-- Product runtimes never write this schema. The approved migration runner uses it to distinguish
-- an explicitly adopted historical migration from a genuinely pending migration, retain the
-- reviewed file checksum, and fail closed after an interrupted or ambiguous apply.

BEGIN;

CREATE SCHEMA IF NOT EXISTS "toonspectrum_ops";
REVOKE CREATE ON SCHEMA "toonspectrum_ops" FROM PUBLIC;

CREATE TABLE IF NOT EXISTS "toonspectrum_ops"."deployment_migration" (
  "id" text PRIMARY KEY,
  "checksum" text NOT NULL,
  "state" text NOT NULL,
  "provenance" text NOT NULL,
  "releaseSha" text NOT NULL,
  "startedAt" timestamptz NOT NULL,
  "appliedAt" timestamptz,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "deployment_migration_id_check"
    CHECK (
      "id" ~ '^[0-9]{4}_[a-z0-9_]+$'
      OR "id" ~ '^__managed_history_through_[0-9]{4}__$'
    ),
  CONSTRAINT "deployment_migration_checksum_check"
    CHECK ("checksum" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "deployment_migration_state_check"
    CHECK ("state" IN ('applying', 'applied', 'failed')),
  CONSTRAINT "deployment_migration_provenance_check"
    CHECK ("provenance" IN ('adopted', 'executed', 'bootstrap')),
  CONSTRAINT "deployment_migration_release_sha_check"
    CHECK ("releaseSha" ~ '^[0-9a-f]{40}$'),
  CONSTRAINT "deployment_migration_state_time_check"
    CHECK (
      ("state" = 'applied' AND "appliedAt" IS NOT NULL)
      OR ("state" IN ('applying', 'failed') AND "appliedAt" IS NULL)
    ),
  CONSTRAINT "deployment_migration_provenance_state_check"
    CHECK (
      "provenance" = 'executed'
      OR ("provenance" IN ('adopted', 'bootstrap') AND "state" = 'applied')
    )
);

CREATE TABLE IF NOT EXISTS "toonspectrum_ops"."deployment_migration_lock" (
  "singleton" boolean PRIMARY KEY DEFAULT true,
  "ownerToken" text NOT NULL,
  "releaseSha" text NOT NULL,
  "acquiredAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "deployment_migration_lock_singleton_check"
    CHECK ("singleton"),
  CONSTRAINT "deployment_migration_lock_owner_token_check"
    CHECK ("ownerToken" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "deployment_migration_lock_release_sha_check"
    CHECK ("releaseSha" ~ '^[0-9a-f]{40}$')
);

REVOKE ALL ON TABLE
  "toonspectrum_ops"."deployment_migration",
  "toonspectrum_ops"."deployment_migration_lock"
FROM PUBLIC;

COMMIT;
