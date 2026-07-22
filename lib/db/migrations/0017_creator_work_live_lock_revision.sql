-- Linearizable per-work revisions for live-lock snapshots and Socket.IO mutation fanout.
--
-- ROLLING-DEPLOYMENT CONTRACT
-- ---------------------------
-- Apply this migration only after old API instances have stopped accepting new Studio traffic,
-- then start only revision-aware API instances. PostgreSQL cannot prove that an arbitrary old
-- UPDATE/DELETE also advances the new clock without a writer-owned transaction marker, and the
-- old repository does not set one. The first cutover therefore removes the short-lived,
-- ephemeral leases while ACCESS EXCLUSIVE locks are held. Old INSERTs resume after COMMIT and
-- fail closed because `revision` is NOT NULL with no default; old updates/releases for the
-- removed lease identities affect no row. Clients may need to reacquire a lease once.
--
-- A durable migration-ledger row records that the destructive cutover already completed.
-- Reapplying this file (or applying it after `drizzle-kit push` pre-created the supported final
-- objects) repairs their constraints and high-water clocks without repeatedly evicting
-- revision-aware leases. The column comment at the end is informational, not the retry fence.

BEGIN;

CREATE TABLE IF NOT EXISTS "toonspectrum_schema_migration" (
  "id" text PRIMARY KEY,
  "appliedAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "toonspectrum_schema_migration_id_check"
    CHECK (length("id") BETWEEN 1 AND 160)
);

CREATE TABLE IF NOT EXISTS "creator_work_live_lock_clock" (
  "workId" text PRIMARY KEY,
  "revision" bigint DEFAULT 0 NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "creator_work_live_lock_clock_work_fkey"
    FOREIGN KEY ("workId") REFERENCES "creator_work"("id") ON DELETE CASCADE,
  CONSTRAINT "creator_work_live_lock_clock_revision_check"
    CHECK ("revision" >= 0)
);

ALTER TABLE "creator_work_live_lock"
  ADD COLUMN IF NOT EXISTS "revision" bigint;

-- Keep both the data table and its high-water clock frozen through backfill/cutover. ALTER TABLE
-- already takes a strong lock, but spelling this out makes the concurrency boundary auditable and
-- also covers a retry where every ALTER is otherwise a no-op.
LOCK TABLE
  "toonspectrum_schema_migration",
  "creator_work_live_lock",
  "creator_work_live_lock_clock"
  IN ACCESS EXCLUSIVE MODE;

-- Read the durable cutover marker only after acquiring the lock. Two concurrent migration
-- attempts then serialize: the second observes the first attempt's committed ledger row and cannot
-- repeat the lease eviction. The temporary marker is transaction-local and disappears at COMMIT.
CREATE TEMPORARY TABLE "_creator_work_live_lock_revision_cutover" ON COMMIT DROP AS
SELECT NOT EXISTS (
  SELECT 1
  FROM "toonspectrum_schema_migration"
  WHERE "id" = '0017_creator_work_live_lock_revision'
) AS "required";

-- `drizzle-kit push` may pre-create this table in its complete final form. The following statements
-- repair values and named constraints in that supported state; arbitrary partially-created tables
-- with missing columns are intentionally rejected and roll the transaction back.
UPDATE "creator_work_live_lock_clock"
SET
  "revision" = COALESCE(GREATEST("revision", 0), 0),
  "updatedAt" = COALESCE("updatedAt", statement_timestamp())
WHERE "revision" IS NULL
   OR "revision" < 0
   OR "updatedAt" IS NULL;

ALTER TABLE "creator_work_live_lock_clock"
  ALTER COLUMN "workId" SET NOT NULL,
  ALTER COLUMN "revision" SET DEFAULT 0,
  ALTER COLUMN "revision" SET NOT NULL,
  ALTER COLUMN "updatedAt" SET DEFAULT now(),
  ALTER COLUMN "updatedAt" SET NOT NULL;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = '"creator_work_live_lock_clock"'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE "creator_work_live_lock_clock"
      ADD CONSTRAINT "creator_work_live_lock_clock_pkey" PRIMARY KEY ("workId");
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = '"creator_work_live_lock_clock"'::regclass
      AND conname = 'creator_work_live_lock_clock_work_fkey'
  ) THEN
    ALTER TABLE "creator_work_live_lock_clock"
      ADD CONSTRAINT "creator_work_live_lock_clock_work_fkey"
      FOREIGN KEY ("workId") REFERENCES "creator_work"("id") ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = '"creator_work_live_lock_clock"'::regclass
      AND conname = 'creator_work_live_lock_clock_revision_check'
  ) THEN
    ALTER TABLE "creator_work_live_lock_clock"
      ADD CONSTRAINT "creator_work_live_lock_clock_revision_check"
      CHECK ("revision" >= 0);
  END IF;
END
$migration$;

-- Repair or seed every work clock from the greatest revision already present in its lock rows.
-- GREATEST(existing, observed) is the essential retry invariant: schema push, partial operational
-- rollout, or migration reapplication can advance a clock, but can never move it backwards.
INSERT INTO "creator_work_live_lock_clock" ("workId", "revision", "updatedAt")
SELECT
  "workId",
  GREATEST(COALESCE(MAX("revision"), 0), 1),
  statement_timestamp()
FROM "creator_work_live_lock"
GROUP BY "workId"
ON CONFLICT ("workId") DO UPDATE
SET
  "revision" = GREATEST(
    "creator_work_live_lock_clock"."revision",
    EXCLUDED."revision"
  ),
  "updatedAt" = CASE
    WHEN EXCLUDED."revision" > "creator_work_live_lock_clock"."revision"
      THEN statement_timestamp()
    ELSE "creator_work_live_lock_clock"."updatedAt"
  END;

-- Do this only once. The ACCESS EXCLUSIVE lock prevents a legacy writer from slipping a row
-- between this DELETE and the NOT NULL/no-default invariant below.
DELETE FROM "creator_work_live_lock"
WHERE (SELECT "required" FROM "_creator_work_live_lock_revision_cutover");

ALTER TABLE "creator_work_live_lock"
  ALTER COLUMN "revision" DROP DEFAULT,
  ALTER COLUMN "revision" SET NOT NULL;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = '"creator_work_live_lock"'::regclass
      AND conname = 'creator_work_live_lock_revision_check'
  ) THEN
    ALTER TABLE "creator_work_live_lock"
      ADD CONSTRAINT "creator_work_live_lock_revision_check"
      CHECK ("revision" > 0);
  END IF;
END
$migration$;

INSERT INTO "toonspectrum_schema_migration" ("id", "appliedAt")
VALUES ('0017_creator_work_live_lock_revision', statement_timestamp())
ON CONFLICT ("id") DO NOTHING;

COMMENT ON COLUMN "creator_work_live_lock"."revision" IS
  'ToonSpectrum live-lock revision v1 cutover complete';

COMMIT;
