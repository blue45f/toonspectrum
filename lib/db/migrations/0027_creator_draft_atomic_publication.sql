-- Persist the exact staged-work publication fingerprint used by draft-room promotion. Legacy
-- promoted rooms intentionally keep both new fields NULL: without the original request receipt,
-- their old mutation IDs must fail closed instead of being treated as exact idempotent replays.

BEGIN;

ALTER TABLE "creator_draft_collaboration_room"
  ADD COLUMN IF NOT EXISTS "promotionExpectedWorkRevision" integer,
  ADD COLUMN IF NOT EXISTS "promotionFinalStatus" text;

ALTER TABLE "creator_draft_collaboration_room"
  DROP CONSTRAINT IF EXISTS "creator_draft_room_promotion_work_revision_check",
  DROP CONSTRAINT IF EXISTS "creator_draft_room_promotion_final_status_check",
  DROP CONSTRAINT IF EXISTS "creator_draft_collaboration_room_state_check";

ALTER TABLE "creator_draft_collaboration_room"
  ADD CONSTRAINT "creator_draft_room_promotion_work_revision_check"
    CHECK (
      "promotionExpectedWorkRevision" IS NULL
      OR "promotionExpectedWorkRevision" BETWEEN 1 AND 2147483647
    ) NOT VALID,
  ADD CONSTRAINT "creator_draft_room_promotion_final_status_check"
    CHECK (
      "promotionFinalStatus" IS NULL
      OR "promotionFinalStatus" IN ('draft', 'published')
    ) NOT VALID,
  ADD CONSTRAINT "creator_draft_collaboration_room_state_check"
    CHECK (
      (
        "status" = 'active'
        AND "promotedAt" IS NULL
        AND "promotionMutationId" IS NULL
        AND "promotionExpectedWorkRevision" IS NULL
        AND "promotionFinalStatus" IS NULL
      )
      OR (
        "status" = 'promoted'
        AND "promotedAt" IS NOT NULL
        AND "promotionMutationId" IS NOT NULL
        AND "graphRevision" >= 1
        AND (
          (
            "promotionExpectedWorkRevision" IS NULL
            AND "promotionFinalStatus" IS NULL
          )
          OR (
            "promotionExpectedWorkRevision" IS NOT NULL
            AND "promotionFinalStatus" IS NOT NULL
          )
        )
      )
    ) NOT VALID;

ALTER TABLE "creator_draft_collaboration_room"
  VALIDATE CONSTRAINT "creator_draft_room_promotion_work_revision_check";
ALTER TABLE "creator_draft_collaboration_room"
  VALIDATE CONSTRAINT "creator_draft_room_promotion_final_status_check";
ALTER TABLE "creator_draft_collaboration_room"
  VALIDATE CONSTRAINT "creator_draft_collaboration_room_state_check";

DO $creator_draft_atomic_publication_contract$
BEGIN
  IF (
    SELECT count(*)
    FROM pg_catalog.pg_attribute
    WHERE attrelid = 'public.creator_draft_collaboration_room'::regclass
      AND attname = ANY(ARRAY[
        'promotionExpectedWorkRevision',
        'promotionFinalStatus'
      ]::text[])
      AND attnum > 0
      AND NOT attisdropped
      AND NOT attnotnull
      AND (
        (attname = 'promotionExpectedWorkRevision' AND atttypid = 'integer'::regtype)
        OR (attname = 'promotionFinalStatus' AND atttypid = 'text'::regtype)
      )
  ) <> 2 THEN
    RAISE EXCEPTION 'creator draft atomic publication columns are incomplete';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.creator_draft_collaboration_room'::regclass
      AND conname = ANY(ARRAY[
        'creator_draft_room_promotion_work_revision_check',
        'creator_draft_room_promotion_final_status_check',
        'creator_draft_collaboration_room_state_check'
      ]::text[])
      AND contype = 'c'
      AND convalidated
  ) <> 3 THEN
    RAISE EXCEPTION 'creator draft atomic publication constraints are incomplete';
  END IF;
END
$creator_draft_atomic_publication_contract$;

INSERT INTO "toonspectrum_schema_migration" ("id", "appliedAt")
VALUES ('0027_creator_draft_atomic_publication', statement_timestamp())
ON CONFLICT ("id") DO NOTHING;

COMMIT;
