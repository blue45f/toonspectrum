-- Forward-only creator work revision/snapshot migration.
-- Existing works start at revision 1 and receive a private owner-only baseline snapshot.
-- Runtime writes retain the newest 20 snapshots per work in the same transaction as the update.

BEGIN;

ALTER TABLE "creator_work"
  ADD COLUMN IF NOT EXISTS "revision" integer;

-- The runtime community schema introduced these optional links before explicit SQL migrations existed.
-- Mirror them here so the baseline snapshot backfill is safe on every supported pre-migration database.
ALTER TABLE "creator_work" ADD COLUMN IF NOT EXISTS "seriesId" text;
ALTER TABLE "creator_work" ADD COLUMN IF NOT EXISTS "episodeNo" integer;
ALTER TABLE "creator_work" ADD COLUMN IF NOT EXISTS "challengeId" text;
ALTER TABLE "creator_work" ADD COLUMN IF NOT EXISTS "remixFromId" text;

UPDATE "creator_work"
SET "revision" = 1
WHERE "revision" IS NULL;

ALTER TABLE "creator_work"
  ALTER COLUMN "revision" SET DEFAULT 1,
  ALTER COLUMN "revision" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'creator_work_revision_value_positive_check'
      AND conrelid = 'creator_work'::regclass
  ) THEN
    ALTER TABLE "creator_work"
      ADD CONSTRAINT "creator_work_revision_value_positive_check" CHECK ("revision" >= 1);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "creator_work_revision" (
  "workId" text NOT NULL REFERENCES "creator_work"("id") ON DELETE CASCADE,
  "revision" integer NOT NULL,
  "snapshot" jsonb NOT NULL,
  "restoredFromRevision" integer,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "creator_work_revision_pkey" PRIMARY KEY ("workId", "revision"),
  CONSTRAINT "creator_work_revision_positive_check" CHECK ("revision" >= 1),
  CONSTRAINT "creator_work_revision_restored_from_positive_check"
    CHECK ("restoredFromRevision" IS NULL OR "restoredFromRevision" >= 1),
  CONSTRAINT "creator_work_revision_snapshot_object_check"
    CHECK (jsonb_typeof("snapshot") = 'object')
);

-- Backfill one baseline snapshot for every pre-migration work. Engagement counters, owner identity,
-- and administrator-only hidden state are intentionally excluded from restorable content.
INSERT INTO "creator_work_revision" ("workId", "revision", "snapshot", "createdAt")
SELECT
  work."id",
  work."revision",
  jsonb_build_object(
    'titleId', work."titleId",
    'title', work."title",
    'description', COALESCE(work."description", ''),
    'cover', COALESCE(work."cover", ''),
    'tags', COALESCE(work."tags", '[]'::jsonb),
    'format', COALESCE(work."format", 'cuttoon'),
    'pages', COALESCE(work."pages", '[]'::jsonb),
    'doc', COALESCE(work."doc", '{}'::jsonb),
    'status', COALESCE(work."status", 'draft'),
    'seriesId', work."seriesId",
    'episodeNo', work."episodeNo",
    'challengeId', work."challengeId",
    'remixFromId', work."remixFromId"
  ),
  COALESCE(work."updatedAt", work."createdAt", CURRENT_TIMESTAMP)
FROM "creator_work" AS work
ON CONFLICT ("workId", "revision") DO NOTHING;

COMMIT;
