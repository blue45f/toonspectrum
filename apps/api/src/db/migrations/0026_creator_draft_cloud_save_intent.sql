-- Widen the existing provisional creator_work admission graph for an explicit cloud-save flow.
-- The new intent allocates no second authority: callers still update the hidden creator_work and
-- promote that exact workId after immutable Studio artifacts have been uploaded.

BEGIN;

ALTER TABLE "creator_draft_collaboration_room"
  DROP CONSTRAINT IF EXISTS "creator_draft_collaboration_room_provision_intent_check";

ALTER TABLE "creator_draft_collaboration_room"
  ADD CONSTRAINT "creator_draft_collaboration_room_provision_intent_check"
  CHECK ("provisionIntent" IN ('share-link', 'invite-member', 'cloud-save'))
  NOT VALID;

ALTER TABLE "creator_draft_collaboration_room"
  VALIDATE CONSTRAINT "creator_draft_collaboration_room_provision_intent_check";

DO $creator_draft_cloud_save_intent_contract$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.creator_draft_collaboration_room'::regclass
      AND conname = 'creator_draft_collaboration_room_provision_intent_check'
      AND contype = 'c'
      AND convalidated
      AND pg_get_constraintdef(oid) LIKE '%cloud-save%'
  ) THEN
    RAISE EXCEPTION 'creator draft cloud-save provision intent is not validated';
  END IF;
END
$creator_draft_cloud_save_intent_contract$;

INSERT INTO "toonspectrum_schema_migration" ("id", "appliedAt")
VALUES ('0026_creator_draft_cloud_save_intent', statement_timestamp())
ON CONFLICT ("id") DO NOTHING;

COMMIT;
